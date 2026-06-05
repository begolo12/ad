import React, { useState, useEffect, useRef } from 'react';
import { Play, RotateCcw, AlertCircle, Settings, Sliders, Palette, ShieldAlert, Cpu } from 'lucide-react';
import LudoBoard from './LudoBoard';
import { Player, Room, TokenColor, Token, GameLog, BoardStyle } from '../types';

interface LudoGameProps {
  ws: WebSocket | null;
  room: Room;
  player: Player | null;
}

const COLOR_HEXMAP: Record<TokenColor, string> = {
  red: '#ef4444',
  green: '#10b981',
  yellow: '#eab308',
  blue: '#3b82f6'
};

const COLOR_NAMES: Record<TokenColor, string> = {
  red: 'Merah',
  yellow: 'Kuning',
  green: 'Hijau',
  blue: 'Biru'
};

const COLORS: TokenColor[] = ['red', 'yellow', 'green', 'blue'];

export default function LudoGame({ ws, room, player }: LudoGameProps) {
  const [isRolling, setIsRolling] = useState(false);
  const [diceVisualValue, setDiceVisualValue] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'game' | 'customize' | 'rooms'>('game');
  
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  const gameState = room.gameState;
  const isHost = player?.isHost || false;

  // Sync scrolling on game logs
  useEffect(() => {
    if (gameState?.logs) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [gameState?.logs]);

  // Handle fake dice rolling animation when values are updated
  useEffect(() => {
    if (gameState?.diceValue && !isRolling) {
      setIsRolling(true);
      let ticks = 0;
      const interval = setInterval(() => {
        setDiceVisualValue(Math.floor(Math.random() * 6) + 1);
        ticks++;
        if (ticks >= 6) {
          clearInterval(interval);
          setDiceVisualValue(gameState.diceValue!);
          setIsRolling(false);
        }
      }, 100);
      return () => clearInterval(interval);
    } else if (gameState?.diceValue === null) {
      // Setup initial dice default face
      setDiceVisualValue(1);
    }
  }, [gameState?.diceValue]);

  const rollDice = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (gameState?.currentTurn !== player?.color || gameState?.hasRolled || gameState.winner) return;

    ws.send(JSON.stringify({ type: 'roll_dice' }));
  };

  const moveToken = (tokenId: number) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'move_token', tokenId }));
  };

  const changeSlotType = (color: TokenColor, type: 'player' | 'bot' | 'closed') => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'config_slot', color, status: type }));
  };

  const handleSetTheme = (theme: BoardStyle) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'set_theme', theme }));
  };

  const handleStartGame = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'start_game' }));
  };

  const changeBotDelay = (ms: number) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'config_bot_settings', waitMs: ms }));
  };

  // Find valid movable token IDs for highlight
  const getValidMovableIds = (): number[] => {
    if (!gameState || !player || gameState.currentTurn !== player.color || !gameState.diceValue) return [];
    
    const roll = gameState.diceValue;
    const tokensList = gameState.tokens[player.color];

    const canMoveToken = (token: Token): boolean => {
      if (token.status === 'base' && roll !== 6) return false;
      if (token.status === 'goal') return false;
      const targetSteps = token.status === 'base' ? 0 : token.stepsTraveled + roll;
      return targetSteps <= 56;
    };

    return tokensList.filter(canMoveToken).map((t) => t.id);
  };

  const validMovableIds = getValidMovableIds();
  const myTurn = gameState && player && gameState.currentTurn === player.color && !gameState.winner;

  // Render customizable option cards
  const renderThemeButton = (id: BoardStyle, name: string, desc: string, previewBg: string) => {
    const isSelected = room.boardCustomization.style === id;
    return (
      <button
        key={id}
        onClick={() => handleSetTheme(id)}
        className={`w-full p-2.5 rounded border text-left flex items-start gap-2.5 transition cursor-pointer active:scale-98 ${
          isSelected
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-slate-850 bg-slate-950 hover:bg-slate-900 text-slate-100'
        }`}
      >
        <div className={`w-7 h-7 rounded-full ${previewBg} border border-white/20 shrink-0 flex items-center justify-center font-bold text-slate-900 text-[10px]`}>
          A
        </div>
        <div className="min-w-0">
          <p className="font-bold text-xs text-slate-200">{name}</p>
          <p className="text-[10px] text-slate-500 leading-normal mt-0.5">{desc}</p>
        </div>
      </button>
    );
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start w-full">
      
      {/* CENTER AREA: LIVE BOARD VIEW & CONTROLLER */}
      <div className="xl:col-span-8 flex flex-col gap-4">

        {/* Outer Grid board and interactive controller columns */}
        <div className="bg-slate-900 rounded-xl p-4 lg:p-6 border border-slate-800 shadow-xl flex flex-col items-center relative overflow-hidden">
          
          <div className="self-start mb-6">
             <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded text-[10px] font-bold tracking-widest uppercase">
               Live Game Arena
             </span>
          </div>
          
          <LudoBoard
            tokens={gameState?.tokens || room.gameState?.tokens || {
              red: [], green: [], yellow: [], blue: []
            }}
            currentTurn={gameState?.currentTurn || 'red'}
            diceValue={gameState?.diceValue || null}
            hasRolled={gameState?.hasRolled || false}
            onMoveToken={moveToken}
            validMovableIds={validMovableIds}
            customization={room.boardCustomization}
            activeColor={player?.color || null}
          />

          {/* Core game play controller footer (Dice Rolling) */}
          {room.gameStarted && gameState && (
            <div className="w-full max-w-[500px] mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-950 p-4 border border-slate-800 rounded">
              
              {/* Turn Indicator */}
              <div className="flex items-center gap-3">
                <div
                  className="w-3.5 h-3.5 rounded-full shrink-0 animate-pulse" 
                  style={{ backgroundColor: COLOR_HEXMAP[gameState.currentTurn] }}
                />
                <div>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Giliran Berjalan:</p>
                  <p className="text-xs font-bold text-slate-100 flex items-center gap-1.5 uppercase">
                    {COLOR_NAMES[gameState.currentTurn]} 
                    <span className="text-[9px] shrink-0 px-1.5 py-0.5 bg-slate-800 rounded font-normal text-slate-400">
                      {gameState.currentTurn === player?.color ? 'GILIARAN ANDA' : 'Pemain Lain'}
                    </span>
                  </p>
                </div>
              </div>

              {/* Rolling Dice component with beautiful responsive hover effects */}
              <div className="flex items-center gap-3">
                <button
                  id="btn-roll-dice"
                  disabled={!myTurn || gameState.hasRolled}
                  onClick={rollDice}
                  className={`relative cursor-pointer w-12 h-12 rounded flex items-center justify-center font-bold text-xl font-mono border transition duration-300 ${
                    myTurn && !gameState.hasRolled
                      ? 'bg-emerald-600 text-white border-emerald-500 hover:scale-105 active:scale-95 shadow-lg shadow-emerald-900/40'
                      : 'bg-slate-800 text-slate-400 border-slate-705'
                  }`}
                >
                  {isRolling ? (
                    <span className="animate-spin text-lg">🎲</span>
                  ) : (
                    diceVisualValue
                  )}
                </button>

                <div className="min-w-[120px]">
                  {myTurn ? (
                    !gameState.hasRolled ? (
                      <p className="text-[11px] text-emerald-450 font-bold animate-pulse">SIAPKAN REKOR!<br />Lempar dadu.</p>
                    ) : (
                      <p className="text-[11px] text-slate-300 font-medium leading-normal">Klik bidak untuk melangkah!</p>
                    )
                  ) : (
                    <p className="text-[11px] text-slate-500 leading-normal">Menunggu {COLOR_NAMES[gameState.currentTurn]} beraksi...</p>
                  )}
                </div>
              </div>

            </div>
          )}

        </div>
      </div>

      {/* RIGHT SIDEBAR: Settings, Slot configuration and Matches Feed */}
      <div className="xl:col-span-4 flex flex-col gap-4">
        
        {/* Navigation configuration tabs */}
        <div className="flex bg-slate-900 border border-slate-800 rounded p-1 shadow-md shrink-0">
          <button
            onClick={() => setActiveTab('game')}
            className={`flex-1 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition cursor-pointer ${
              activeTab === 'game' ? 'bg-slate-850 text-indigo-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Sesi & Log
          </button>
          
          <button
            onClick={() => setActiveTab('customize')}
            className={`flex-1 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition cursor-pointer ${
              activeTab === 'customize' ? 'bg-slate-850 text-indigo-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Kustom Papan
          </button>
        </div>

        {/* Tab 1 Content: Sesi, Slots config and Game logs */}
        {activeTab === 'game' && (
          <div className="space-y-4">
            
            {/* Slot configuration picker */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4 shadow-xl flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Slots & AI Bots</h3>
              </div>

              {!isHost && (
                <div className="text-[10px] text-slate-400 bg-slate-950 p-2 rounded border border-slate-850">
                  ⚠️ Host only slot controls.
                </div>
              )}

              <div className="space-y-2">
                {COLORS.map((color) => {
                  const currentSlot = room.slotsConfig[color];
                  const linkedPlayer = room.players.find(p => p.color === color);

                  return (
                    <div key={color} className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-850">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: COLOR_HEXMAP[color] }}
                        />
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-200 capitalize">{COLOR_NAMES[color]}</p>
                          <p className="text-[9px] text-slate-500 truncate leading-none">
                            {linkedPlayer ? linkedPlayer.name : currentSlot === 'bot' ? 'Bot Engine' : 'Closed'}
                          </p>
                        </div>
                      </div>

                      {isHost && !room.gameStarted ? (
                        <div className="flex bg-slate-900 rounded p-0.5 border border-slate-800 text-[9px]">
                          <button
                            onClick={() => changeSlotType(color, 'player')}
                            className={`px-1.5 py-0.5 rounded transition font-bold ${
                              currentSlot === 'player' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            Player
                          </button>
                          
                          <button
                            onClick={() => changeSlotType(color, 'bot')}
                            className={`px-1.5 py-0.5 rounded transition font-bold ${
                              currentSlot === 'bot' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            Bot
                          </button>
                          
                          {color !== 'red' && (
                            <button
                              onClick={() => changeSlotType(color, 'closed')}
                              className={`px-1.5 py-0.5 rounded transition font-bold ${
                                currentSlot === 'closed' ? 'bg-slate-750 text-slate-300' : 'text-slate-500 hover:text-slate-300'
                              }`}
                            >
                              Tutup
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 bg-slate-900 border border-slate-800 text-slate-400 rounded">
                          {currentSlot === 'bot' ? '🤖 BOT' : currentSlot === 'player' ? '👤 HUMAN' : '🚫 CLOSED'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Bot Delay parameter */}
              {isHost && (
                <div className="pt-2 border-t border-slate-800">
                  <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-2 font-bold">Bot Reaction delay:</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { l: 'Cepat', v: 600 },
                      { l: 'Normal', v: 1200 },
                      { l: 'Lambat', v: 2200 }
                    ].map((cfg) => (
                      <button
                        key={cfg.v}
                        onClick={() => changeBotDelay(cfg.v)}
                        className={`py-1 rounded text-[10px] font-bold border transition ${
                          room.botSettings.waitMs === cfg.v
                            ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400'
                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {cfg.l}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Game Logs history */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4 flex flex-col h-[200px] shadow-xl text-slate-300 shrink-0">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Activity stream</h3>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                {gameState?.logs.map((log) => {
                  let logColor = 'text-slate-400';
                  if (log.type === 'capture') logColor = 'text-rose-400 font-bold bg-rose-500/5 px-1 rounded';
                  if (log.type === 'completed') logColor = 'text-yellow-400 font-bold bg-yellow-500/5 px-1 rounded';
                  if (log.type === 'roll') logColor = 'text-slate-400';
                  
                  return (
                    <div key={log.id} className={`text-[10px] font-mono leading-relaxed truncate ${logColor}`}>
                      [{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] {log.text}
                    </div>
                  );
                })}
                <div ref={logsEndRef} />
              </div>
            </div>

          </div>
        )}

        {/* Tab 2 Content: Kustom Papan styles selectors */}
        {activeTab === 'customize' && (
          <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4 shadow-xl flex flex-col gap-4 font-sans">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Board Theme</h3>
            </div>

            <p className="text-[11px] text-slate-500 leading-normal">Pilih skema desain papan ludo instan dengan seluruh pemain di ruangan:</p>

            <div className="space-y-2">
              {renderThemeButton('classic', 'Klasik Retro', 'Tampilan papan ludo standar dengan balutan warna primer legendaris.', 'bg-gradient-to-tr from-rose-500 to-amber-400')}
              {renderThemeButton('neon', 'Cyber Neon Glow', 'Nuansa futuristik kegelapan berhiaskan lampu neon berpendar hologram.', 'bg-slate-900 border border-cyan-400')}
              {renderThemeButton('wood', 'Vintage Kayu mahogany', 'Tema tekstur kayu mahoni hangat dengan garis pembatas cokelat tua.', 'bg-[#ecc89d]')}
              {renderThemeButton('pastel', 'Ethereal Pastel Matte', 'Sentuhan warna-warna pastel super lembut yang ramah di mata lama.', 'bg-rose-200')}
            </div>
            
            <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 text-indigo-400 rounded text-[10px] leading-relaxed">
              💡 <strong>Sinkronisasi Instan</strong>: Perubahan tema langsung diterapkan ke semua layar pemain dalam ruangan secara real-time!
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
