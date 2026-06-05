import React, { useState, useEffect, useRef } from 'react';
import { Play, Plus, Users, Compass, HelpCircle, User, Code2, Globe2, Radio, Volume2, Sparkles, AlertCircle } from 'lucide-react';
import { Player, Room } from './types';
import LudoGame from './components/LudoGame';
import AudioVoiceChat from './components/AudioVoiceChat';
import ChatBox from './components/ChatBox';

export default function App() {
  const [name, setName] = useState(() => {
    return localStorage.getItem('ludo_player_name') || `Pemain_${Math.floor(Math.random() * 900) + 100}`;
  });
  const [roomIdInput, setRoomIdInput] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // Prefill Room invitation code from URL query parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rParam = params.get('room');
    if (rParam && rParam.length === 4) {
      setRoomIdInput(rParam.toUpperCase());
    }
  }, []);

  const [copiedLink, setCopiedLink] = useState(false);
  const handleCopyLink = (code: string) => {
    const inviteLink = `${window.location.origin}?room=${code}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }).catch(() => {
      navigator.clipboard.writeText(code);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const connectSocket = (onOpenCallback: (socket: WebSocket) => void) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      onOpenCallback(wsRef.current);
      return;
    }

    setConnecting(true);
    setErrorMsg(null);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
      setConnecting(false);
      onOpenCallback(socket);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'joined') {
          setRoom(message.room);
          setPlayer(message.player);
        } else if (message.type === 'room_state') {
          setRoom(message.room);
          setPlayer((currentActivePlayer) => {
            if (!currentActivePlayer) return null;
            const updatedMe = message.room.players.find((p: Player) => p.name === currentActivePlayer.name);
            return updatedMe || currentActivePlayer;
          });
        } else if (message.type === 'error') {
          setErrorMsg(message.message);
        }
      } catch (err) {
        // Silently capture parsing faults
      }
    };

    socket.onerror = () => {
      setErrorMsg('Gagal menyambungkan ke server Ludo!');
      setConnecting(false);
    };

    socket.onclose = () => {
      setConnected(false);
      setConnecting(false);
      setRoom(null);
      setPlayer(null);
    };
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Nama panggil Anda tidak boleh kosong!');
      return;
    }
    
    connectSocket((socket) => {
      socket.send(JSON.stringify({
        type: 'create',
        name: name.trim()
      }));
    });
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Nama panggil Anda tidak boleh kosong!');
      return;
    }
    if (!roomIdInput.trim()) {
      setErrorMsg('Harap masukkan kode ruangan 4 digit!');
      return;
    }

    connectSocket((socket) => {
      socket.send(JSON.stringify({
        type: 'join',
        roomId: roomIdInput.trim().toUpperCase(),
        name: name.trim()
      }));
    });
  };

  const handleLeaveRoom = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setRoom(null);
    setPlayer(null);
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-200 flex flex-col overflow-x-hidden selection:bg-indigo-500 selection:text-white">
      
      {/* Background radial gradient overlay for premium glowing console appearance */}
      <div className="fixed inset-0 bg-radial-[circle_80vw_at_50%_-20vw] from-indigo-500/5 via-transparent to-transparent pointer-events-none z-0" />

      {/* Header Section */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">L</div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white uppercase sm:text-lg">LUDO ELITE <span className="text-slate-500 font-medium text-sm ml-2 italic">v2.4</span></h1>
            <p className="text-xs text-slate-400">Multiplayer Lobby & Battleground</p>
          </div>
        </div>
        
        {room ? (
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Room Code</span>
              <span className="text-xl font-mono text-indigo-400 font-bold">{room.id}</span>
            </div>
            
            <button 
              onClick={() => handleCopyLink(room.id)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-xs font-bold transition-all cursor-pointer text-slate-200"
            >
              {copiedLink ? 'COPIED!' : 'COPY LINK'}
            </button>
            
            {player?.isHost && !room.gameStarted && (
              <button 
                onClick={() => {
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'start_game' }));
                  }
                }}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-black shadow-lg shadow-emerald-950/50 transition-all cursor-pointer"
              >
                START GAME
              </button>
            )}

            <button
              onClick={handleLeaveRoom}
              className="px-4 py-2 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800 text-rose-300 rounded-md text-xs font-bold transition-all cursor-pointer"
            >
              LEAVE
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {connected && (
              <span className="flex items-center gap-1.5 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-full font-mono font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" /> ONLINE
              </span>
            )}
          </div>
        )}
      </header>

      {/* MAIN CONTENT PORTAL CONTAINER */}
      <main className="flex-1 relative z-10 flex flex-col p-4 overflow-hidden w-full max-w-7xl mx-auto">
        
        {errorMsg && (
          <div className="mb-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 p-4 rounded-xl text-xs flex gap-3 items-start max-w-2xl mx-auto w-full">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
            <div className="min-w-0">
              <p className="font-semibold">Galat</p>
              <p className="mt-0.5 leading-normal">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* 1. SEED LANDING LOBBY: Join or host room */}
        {!room ? (
          <div className="max-w-md w-full mx-auto my-auto space-y-6">
            
            <div className="text-center space-y-2">
              <h2 className="font-bold text-3xl sm:text-2xl tracking-tight text-white uppercase">
                LUDO MULTIPLAYER ONLINE
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                Bikin ruangan pribadi, ajak teman mengobrol via suara, main bareng, atau isi slot kosong dengan Bot cerdas!
              </p>
            </div>

            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 space-y-6 shadow-2xl">
              
              {/* Form Input Name (Local storage persisted) */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-wider font-mono text-slate-400 uppercase block">
                  NAMA PANGGIL ANDA:
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    id="input-player-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={16}
                    placeholder="Contoh: Sang Juara..."
                    className="w-full bg-slate-950 text-slate-100 border border-slate-800 rounded px-10 py-2.5 text-xs font-semibold focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Grid choice: Host Room vs Join Room */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* HOST CARD */}
                <div className="p-4 rounded bg-slate-950 border border-slate-850 flex flex-col justify-between hover:border-slate-700 transition">
                  <div>
                    <h3 className="font-bold text-xs text-white uppercase">Buat Ruang</h3>
                    <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                      Menjadi Host utama, hasilkan kode arena baru dan atur bot slot.
                    </p>
                  </div>
                  <button
                    id="btn-create-room"
                    onClick={handleCreateRoom}
                    disabled={connecting}
                    className="mt-4 bg-indigo-600 hover:bg-slate-800 border border-indigo-500 text-white px-4 py-2 rounded text-xs font-bold cursor-pointer transition active:scale-95 text-center flex items-center justify-center gap-1.5"
                  >
                    <Plus className="h-4 w-4" /> BUAT RUANGAN
                  </button>
                </div>

                {/* JOIN CARD */}
                <div className="p-4 rounded bg-slate-950 border border-slate-850 flex flex-col justify-between hover:border-slate-700 transition">
                  <div>
                    <h3 className="font-bold text-xs text-white uppercase">Gabung Kode</h3>
                    <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                      Tempelkan kode ruangan 4 digit rekan Anda untuk langsung join.
                    </p>
                  </div>

                  <div className="mt-3 space-y-2">
                    <input
                      id="input-join-code"
                      type="text"
                      value={roomIdInput}
                      onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                      maxLength={4}
                      placeholder="ABCD"
                      className="w-full bg-slate-900 text-center uppercase tracking-widest border border-slate-800 rounded py-1.5 text-xs font-bold text-white focus:outline-hidden focus:border-indigo-500"
                    />
                    <button
                      id="btn-join-room"
                      onClick={handleJoinRoom}
                      disabled={connecting}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-100 px-4 py-2 rounded text-xs font-bold cursor-pointer transition active:scale-95 text-center"
                    >
                      {connecting ? 'MENYAMBUNGKAN...' : 'GABUNG ARENA'}
                    </button>
                  </div>
                </div>

              </div>

            </div>

            {/* Instruction quick help footer */}
            <div className="text-center">
              <p className="text-slate-500 text-[10px] flex items-center gap-1 justify-center uppercase font-mono tracking-wider">
                <HelpCircle className="h-3.5 w-3.5" /> Sinkronisasi Instan Node.js WebSockets.
              </p>
            </div>

          </div>
        ) : (
          
          // 2. ACTIVE SESSION PORTAL
          <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden min-h-0">
            
            {/* Left Sidebar: Social & Voice (w-64 style high density layout) */}
            <aside className="w-full lg:w-64 flex flex-col gap-4 shrink-0 overflow-y-auto lg:overflow-visible">
              
              {/* Voice Chat Component */}
              <AudioVoiceChat
                ws={wsRef.current}
                activePlayer={player}
                players={room.players}
                roomId={room.id}
              />
              
              {/* Lobby Chat Component */}
              <ChatBox
                ws={wsRef.current}
                players={room.players}
                activePlayer={player}
              />

            </aside>
            
            {/* Center + Right inside LudoGame */}
            <div className="flex-1 min-w-0 flex flex-col">
              <LudoGame
                ws={wsRef.current}
                room={room}
                player={player}
              />
            </div>

          </div>
        )}

      </main>

      {/* Status Bar */}
      <footer className="px-6 py-2 bg-slate-950 border-t border-slate-800 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Server Latency: 24ms</span>
          </div>
          <div className="h-3 w-[1px] bg-slate-800 hidden sm:block"></div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">Region: Southeast Asia</span>
        </div>
        <div className="text-[10px] text-slate-600 font-mono">
          PRO SESSION #LUDO-88219-BETA
        </div>
      </footer>

    </div>
  );
}
