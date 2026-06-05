import React, { useState, useEffect, useRef } from 'react';
import { Send, Smile, MessageSquare, Flame } from 'lucide-react';
import { ChatMessage, Player, TokenColor } from '../types';

interface ChatBoxProps {
  ws: WebSocket | null;
  players: Player[];
  activePlayer: Player | null;
}

const QUICK_PHRASES = [
  'Halo semuanya! 👋',
  'Ayo jalan cepat! ⏳',
  'Aduh sial banget dadunya! 😩',
  'Hampir kena tangkap! 😰',
  'Hoki parah! 😂🔥',
  'GGWP! Bagus sekali! 🎉',
  'Jangan tangkap bidak saya ya 🙏',
  'Otw menang nih bos! 😎'
];

export default function ChatBox({ ws, players, activePlayer }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const rawJson = JSON.parse(event.data);
        if (rawJson.type === 'chat_msg') {
          const chatMsg: ChatMessage = rawJson.message;
          setMessages((prev) => [...prev, chatMsg]);
          
          // Auto scroll to bottom
          setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 80);
        }
      } catch (e) {
        // Not a chat payload
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws]);

  const sendChatMessage = (text: string) => {
    if (!text.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
      type: 'chat_msg',
      text
    }));
    
    setInputText('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      sendChatMessage(inputText);
    }
  };

  return (
    <div id="obrolan-chatbox" className="bg-slate-900/50 rounded-xl border border-slate-800 p-4 flex flex-col h-[360px] shrink-0">
      {/* Title */}
      <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-1.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Lobby Chat</h3>
        <span className="text-[9px] font-mono text-slate-500 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
          {messages.length} MSG
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 mb-3 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent text-[11px]">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <Flame className="h-6 w-6 text-slate-700 animate-pulse mb-1.5" />
            <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider">Empty Lounge</p>
            <p className="text-slate-600 text-[9px] mt-0.5">Use quick presets below to chat!</p>
          </div>
        ) : (
          messages.map((msg) => {
            return (
              <div
                key={msg.id}
                className="leading-relaxed hover:bg-slate-950/20 px-1 py-0.5 rounded transition"
              >
                <span className={`font-bold mr-1.5 ${
                  msg.senderColor === 'red' ? 'text-rose-400' :
                  msg.senderColor === 'green' ? 'text-emerald-400' :
                  msg.senderColor === 'yellow' ? 'text-amber-400' :
                  msg.senderColor === 'blue' ? 'text-sky-450' : 'text-indigo-400'
                }`}>
                  {msg.senderName}:
                </span>
                <span className="text-slate-200">{msg.text}</span>
              </div>
            );
          })
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Preset Expressions */}
      <div className="mb-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none whitespace-nowrap">
          {QUICK_PHRASES.map((phrase, idx) => (
            <button
              key={idx}
              onClick={() => sendChatMessage(phrase)}
              className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-850 rounded text-[9px] cursor-pointer transition active:scale-95 whitespace-nowrap inline-block font-medium"
            >
              {phrase}
            </button>
          ))}
        </div>
      </div>

      {/* Inputs Area */}
      <div className="flex gap-2">
        <input
          id="input-send-chat"
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Ketik pesan..."
          className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-100 outline-none focus:border-indigo-500"
        />
        <button
          id="btn-send-chat"
          onClick={() => sendChatMessage(inputText)}
          className="p-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-xs px-2.5 text-white font-bold cursor-pointer transition active:scale-95 flex items-center justify-center font-bold"
        >
          ↵
        </button>
      </div>
    </div>
  );
}
