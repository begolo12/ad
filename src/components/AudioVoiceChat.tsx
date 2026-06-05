import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Radio, Sparkles } from 'lucide-react';
import { Player } from '../types';

interface AudioVoiceChatProps {
  ws: WebSocket | null;
  activePlayer: Player | null;
  players: Player[];
  roomId: string;
}

export default function AudioVoiceChat({ ws, activePlayer, players, roomId }: AudioVoiceChatProps) {
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [isMuted, setIsMuted] = useState(true);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const animationRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Initialize Audio Context on user gesture or mount
  useEffect(() => {
    const initAudioContext = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };

    window.addEventListener('click', initAudioContext);
    window.addEventListener('touchstart', initAudioContext);

    return () => {
      window.removeEventListener('click', initAudioContext);
      window.removeEventListener('touchstart', initAudioContext);
    };
  }, []);

  // Request microphone permissions and start recorder
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      mediaStreamRef.current = stream;
      setMicPermission('granted');

      const audioCtx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start canvas visualization
      drawVisualizer();

      // Setup MediaRecorder
      const options = { mimeType: 'audio/webm' };
      let recorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (e) {
        // Fallback for browsers/operating systems that do not support webm
        recorder = new MediaRecorder(stream);
      }
      
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && ws && ws.readyState === WebSocket.OPEN && !isMuted) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            // Send audio chunk to server
            ws.send(JSON.stringify({
              type: 'audio_chunk',
              chunk: base64data
            }));
          };
          reader.readAsDataURL(event.data);
        }
      };

      // Request data chunks every 250ms
      recorder.start(250);
      
      // Let server know microphone is active
      ws?.send(JSON.stringify({ type: 'toggle_mic', isMuted: false }));
      
    } catch (err) {
      console.error('Microphone access denied:', err);
      setMicPermission('denied');
      setIsMuted(true);
    }
  };

  // Stop recording media
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    // Broadcast mute
    ws?.send(JSON.stringify({ type: 'toggle_mic', isMuted: true }));
    ws?.send(JSON.stringify({ type: 'speaking', isSpeaking: false }));
  };

  // Canvas visualizer logic for active microphone
  const drawVisualizer = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Calculate active decibel volume
      const sum = dataArray.reduce((acc, val) => acc + val, 0);
      const averageVolume = sum / bufferLength;
      
      // Notify speaking state if above threshold
      const isSpeakingNow = averageVolume > 20;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'speaking', isSpeaking: isSpeakingNow && !isMuted }));
      }

      ctx.fillStyle = isMuted ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 1.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;
        
        const r = isMuted ? 239 : 16 + (i * 2);
        const g = isMuted ? 68 : 185 - (i * 3);
        const b = isMuted ? 68 : 129 + (i * 4);
        
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
        
        x += barWidth;
      }
    };

    draw();
  };

  // Handle toggling microphone mute
  const toggleMic = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    
    if (!nextMuted) {
      startRecording();
    } else {
      stopRecording();
    }
  };

  // Handle speaker configuration (WebAudio output on/off)
  const toggleSpeaker = () => {
    setSpeakerEnabled(!speakerEnabled);
  };

  // Handle playing received audio chunks
  useEffect(() => {
    if (!ws) return;

    const handleMessage = async (event: MessageEvent) => {
      try {
        const rawJson = JSON.parse(event.data);
        if (rawJson.type === 'audio_chunk' && speakerEnabled) {
          const { senderId, chunk } = rawJson;
          
          // Make sure sender exists and is speaking
          const sender = players.find(p => p.id === senderId);
          if (!sender) return;

          // Convert back Base64 to ArrayBuffer
          const base64Response = await fetch(chunk);
          const blob = await base64Response.blob();
          const arrayBuffer = await blob.arrayBuffer();

          const audioCtx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
          audioContextRef.current = audioCtx;

          audioCtx.decodeAudioData(arrayBuffer, (audioBuffer) => {
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioCtx.destination);
            source.start();
          }, (err) => {
            // Ignore format errors silently
          });
        }
      } catch (e) {
        // Not a voice payload or other format
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws, speakerEnabled, players]);

  return (
    <div id="voice-chat-card" className="bg-slate-900/50 rounded-xl border border-slate-800 p-4 flex flex-col gap-3 shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex h-2.5 w-2.5">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isMuted ? 'bg-rose-400' : 'bg-emerald-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isMuted ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Voice Chat <span className="text-[10px] text-indigo-400 font-mono lowercase pl-1">#{roomId}</span>
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-[#10b981] flex items-center gap-0.5 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-bold">
            <Radio className="h-2.5 w-2.5 animate-pulse" /> P2P
          </span>
        </div>
      </div>

      <div className="flex gap-3 items-center">
        {/* Visualizer Canvas */}
        <div className="relative flex-1 bg-slate-950 rounded-lg h-10 border border-slate-800/80 overflow-hidden flex items-center justify-center">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-50" width={180} height={40} />
          {isMuted ? (
            <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-slate-950/70 backdrop-blur-xs">
              <MicOff className="h-3.5 w-3.5 text-rose-400" />
              <span className="text-[10px] font-medium text-rose-300">Muted</span>
            </div>
          ) : (
            <div className="absolute top-1 right-2 pointer-events-none text-[8px] font-mono tracking-widest text-emerald-400 uppercase animate-pulse">
              LIVE
            </div>
          )}
        </div>

        {/* Buttons Controls */}
        <div className="flex gap-1.5 shrink-0">
          {/* Mic Button */}
          <button
            id="btn-toggle-mic"
            onClick={toggleMic}
            className={`p-2 rounded-md transition-all duration-300 font-medium flex items-center justify-center border cursor-pointer active:scale-95 ${
              isMuted
                ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30 hover:border-rose-500/50'
                : 'bg-emerald-600 text-white hover:bg-emerald-500 border-emerald-500/20 shadow-lg shadow-emerald-950/40'
            }`}
            title={isMuted ? 'Nyalakan Mikrofon' : 'Matikan Mikrofon'}
          >
            {isMuted ? <MicOff className="h-4.5 w-4.5" /> : <Mic className="h-4.5 w-4.5" />}
          </button>

          {/* Speakers Button */}
          <button
            id="btn-toggle-speaker"
            onClick={toggleSpeaker}
            className={`p-2 rounded-md transition-all duration-300 border font-medium flex items-center justify-center cursor-pointer active:scale-95 ${
              speakerEnabled
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700/80'
                : 'bg-yellow-500/10 hover:bg-yellow-500/25 text-yellow-400 border-yellow-500/30'
            }`}
            title={speakerEnabled ? 'Senyapkan Suara Teman' : 'Aktifkan Suara Teman'}
          >
            {speakerEnabled ? <Volume2 className="h-4.5 w-4.5" /> : <VolumeX className="h-4.5 w-4.5" />}
          </button>
        </div>
      </div>

      {/* Permissions and advice indicators */}
      {micPermission === 'denied' && (
        <div className="text-[10px] bg-amber-500/10 text-amber-300 p-2 rounded border border-amber-500/20 flex gap-1.5 items-start">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span>Izin mikrofon ditolak! Izinkan mik di browser untuk voice chat.</span>
        </div>
      )}

      {/* List of active room members showing voice tags */}
      <div className="space-y-1.5 pt-1">
        <div className="grid grid-cols-2 gap-2">
          {players.map((p) => {
            const isSelf = p.id === activePlayer?.id;
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between gap-1.5 p-2 rounded-lg text-[11px] ${
                  isSelf 
                    ? 'bg-indigo-500/10 border border-indigo-500/20' 
                    : 'bg-slate-800/50 border border-transparent'
                } ${p.isSpeaking && !p.isMicMuted ? 'ring-1 ring-emerald-500/30' : ''}`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    p.color === 'red' ? 'bg-rose-500' :
                    p.color === 'green' ? 'bg-emerald-500' :
                    p.color === 'yellow' ? 'bg-amber-500' :
                    'bg-sky-500'
                  }`} />
                  <span className="truncate text-slate-200 font-medium">
                    {isSelf ? 'You' : p.name}
                  </span>
                </div>
                
                <div className="shrink-0 flex items-center gap-1">
                  {p.isBot ? (
                    <span className="text-[8px] px-1 bg-slate-800 rounded font-mono text-slate-500 font-bold">BOT</span>
                  ) : (
                    <>
                      {p.isMicMuted ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500" title="Muted" />
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Active" />
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
