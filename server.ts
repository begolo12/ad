import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { Room, GameState, Player, TokenColor, Token, GameLog, SocketMessage, BoardCustomization } from './src/types';

const app = express();
const port = 3000;
const server = http.createServer(app);

// In-memory Room storage
const rooms = new Map<string, Room>();

// Track socket to room and metadata mapping
interface ClientSocket extends WebSocket {
  id: string;
  name: string;
  roomId?: string;
  color?: TokenColor;
}

const wss = new WebSocketServer({ noServer: true });

// Ludo constant helpers
const COLORS: TokenColor[] = ['red', 'yellow', 'green', 'blue'];

const COLOR_NAMES: Record<TokenColor, string> = {
  red: 'Merah',
  yellow: 'Kuning',
  green: 'Hijau',
  blue: 'Biru'
};

const SAFE_CELL_INDEXES = [1, 8, 14, 21, 27, 34, 40, 47];

const START_INDEXES: Record<TokenColor, number> = {
  red: 1,
  yellow: 14,
  green: 27,
  blue: 40
};

// Generates a unique 4-letter room code
function generateRoomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

// Generate uuid
function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// Set up initial state of Ludo board tokens
function createInitialGameState(): GameState {
  const tokens: Record<TokenColor, Token[]> = {
    red: [],
    green: [],
    yellow: [],
    blue: []
  };

  COLORS.forEach((color) => {
    tokens[color] = Array.from({ length: 4 }).map((_, id) => ({
      id,
      color,
      status: 'base',
      stepsTraveled: -1
    }));
  });

  return {
    tokens,
    currentTurn: 'red', // red starts first
    diceValue: null,
    hasRolled: false,
    consecutiveSixes: 0,
    winner: null,
    logs: [
      {
        id: generateId(),
        timestamp: new Date().toISOString(),
        text: 'Permainan telah dimulai! Merah mendapat giliran pertama.',
        type: 'system'
      }
    ],
    turnTimeLeft: 30
  };
}

const defaultCustomization: BoardCustomization = {
  style: 'classic',
  borderRadius: 'md',
  showGridLines: true,
  customBaseColors: {
    red: '#ef4444',
    green: '#10b981',
    yellow: '#f59e0b',
    blue: '#3b82f6'
  }
};

// Broadcast room updates
function broadcastToRoom(roomId: string, message: any, excludeClientId?: string) {
  wss.clients.forEach((client: any) => {
    if (client.roomId === roomId && client.readyState === WebSocket.OPEN) {
      if (excludeClientId && client.id === excludeClientId) return;
      client.send(JSON.stringify(message));
    }
  });
}

// Get ordered active colors based on slotsConfig
function getActiveColors(room: Room): TokenColor[] {
  return COLORS.filter(c => room.slotsConfig[c] !== 'closed');
}

// Find next player color clockwise
function getNextTurnColor(current: TokenColor, room: Room): TokenColor {
  const activeColors = getActiveColors(room);
  if (activeColors.length === 0) return 'red';
  const currIndex = activeColors.indexOf(current);
  if (currIndex === -1) return activeColors[0];
  const nextIndex = (currIndex + 1) % activeColors.length;
  return activeColors[nextIndex];
}

// Check if a token can move given a dice roll
function canMoveToken(token: Token, roll: number): boolean {
  if (token.status === 'base' && roll !== 6) return false;
  if (token.status === 'goal') return false;
  
  const targetSteps = token.status === 'base' ? 0 : token.stepsTraveled + roll;
  return targetSteps <= 56;
}

// Get list of valid movable token IDs
function getValidMoves(tokens: Token[], roll: number): number[] {
  return tokens
    .filter((token) => canMoveToken(token, roll))
    .map((t) => t.id);
}

// Check if this cell (for this player) collides with opponents and capture them
function handleCollisions(roomId: string, room: Room, movingColor: TokenColor, newPositionIndex: number, stepsTraveled: number) {
  // Only check capture for tracks on COMMON_TRACK
  // Safe zone logic: bypass if new position lies in a safe zone
  if (stepsTraveled > 51) return; // Already on home stretch, can't capture others
  
  if (SAFE_CELL_INDEXES.includes(newPositionIndex)) return; // Safe cell coexistence

  const state = room.gameState;
  if (!state) return;

  let captured = false;

  COLORS.forEach((color) => {
    if (color === movingColor) return; // skip own pieces
    if (room.slotsConfig[color] === 'closed') return; // skip closed slots

    const opponentTokens = state.tokens[color];
    opponentTokens.forEach((tok) => {
      if (tok.status === 'track' && tok.stepsTraveled <= 51) {
        // Calculate common track index
        const tStart = START_INDEXES[color];
        const opponentIndex = (tStart + tok.stepsTraveled) % 52;
        if (opponentIndex === newPositionIndex) {
          // CAPTURED!
          tok.status = 'base';
          tok.stepsTraveled = -1;
          captured = true;

          state.logs.push({
            id: generateId(),
            timestamp: new Date().toISOString(),
            text: `${COLOR_NAMES[movingColor]} menangkap bidak ${COLOR_NAMES[color]}! ${COLOR_NAMES[movingColor]} berhak melempar dadu kembali.`,
            type: 'capture'
          });
        }
      }
    });
  });

  return captured;
}

// Check win state
function checkWinner(state: GameState, color: TokenColor): boolean {
  return state.tokens[color].every((tok) => tok.status === 'goal');
}

// Bot logic automation engine
function triggerBotPlay(room: Room) {
  if (!room.gameStarted || !room.gameState || room.gameState.winner) return;

  const state = room.gameState;
  const activeColor = state.currentTurn;
  const isBotActive = room.slotsConfig[activeColor] === 'bot' || 
    (room.players.find(p => p.color === activeColor && !p.isActive) !== undefined);

  if (!isBotActive) return;

  // Bot delays slightly for realistic animation pacing
  setTimeout(() => {
    if (!room.gameState || room.gameState.currentTurn !== activeColor) return;
    
    // 1. Roll Dice
    const roll = Math.floor(Math.random() * 6) + 1;
    state.diceValue = roll;
    state.hasRolled = true;

    state.logs.push({
      id: generateId(),
      timestamp: new Date().toISOString(),
      text: `Bot ${COLOR_NAMES[activeColor]} melempar dadu: ${roll}`,
      type: 'roll'
    });

    const validMoves = getValidMoves(state.tokens[activeColor], roll);

    if (validMoves.length === 0) {
      // No moves possible, pass turn
      setTimeout(() => {
        if (!room.gameState) return;
        state.logs.push({
          id: generateId(),
          timestamp: new Date().toISOString(),
          text: `Bot ${COLOR_NAMES[activeColor]} tidak memiliki langkah valid. Giliran dialihkan.`,
          type: 'info'
        });
        
        // Handle sixes consecutive rules
        state.diceValue = null;
        state.hasRolled = false;
        state.currentTurn = getNextTurnColor(activeColor, room);
        
        broadcastToRoom(room.id, { type: 'room_state', room });

        // Trigger bot again if next is also a bot
        triggerBotPlay(room);
      }, room.botSettings.waitMs);
    } else {
      // Choose which piece to move based on simulated AI heuristics
      setTimeout(() => {
        if (!room.gameState || !room.gameState.diceValue) return;

        // Bot intelligence logic:
        // Priority 1: Hitting / Capture opponents
        // Priority 2: Unlocking pieces from base if rolled a 6
        // Priority 3: Progressing final pieces into home stretch
        // Priority 4: Standard closest piece to goal, or random for fun
        let selectedTokenId = validMoves[0];
        
        // Check capture options
        let captureTokenId = -1;
        for (const tid of validMoves) {
          const tok = state.tokens[activeColor][tid];
          const mockSteps = tok.status === 'base' ? 0 : tok.stepsTraveled + roll;
          if (mockSteps <= 51) {
            const startIdx = START_INDEXES[activeColor];
            const targetCommonIndex = (startIdx + mockSteps) % 52;
            
            // Check if any opponent is sitting at targetCommonIndex and can be captured
            let wouldCapture = false;
            COLORS.forEach((color) => {
              if (color === activeColor) return;
              state.tokens[color].forEach((oppTok) => {
                if (oppTok.status === 'track' && oppTok.stepsTraveled <= 51) {
                  const oppStart = START_INDEXES[color];
                  const oppTrackIdx = (oppStart + oppTok.stepsTraveled) % 52;
                  if (oppTrackIdx === targetCommonIndex && !SAFE_CELL_INDEXES.includes(targetCommonIndex)) {
                    wouldCapture = true;
                  }
                }
              });
            });
            if (wouldCapture) {
              captureTokenId = tid;
              break;
            }
          }
        }

        if (captureTokenId !== -1) {
          selectedTokenId = captureTokenId;
        } else {
          // If 6 rolled, prioritize launching from base
          const baseToken = validMoves.find(tid => state.tokens[activeColor][tid].status === 'base');
          if (roll === 6 && baseToken !== undefined) {
            selectedTokenId = baseToken;
          } else {
            // Find piece most advanced on the board
            const advancedToken = validMoves.reduce((bestId, currId) => {
              const bestTok = state.tokens[activeColor][bestId];
              const currTok = state.tokens[activeColor][currId];
              return currTok.stepsTraveled > bestTok.stepsTraveled ? currId : bestId;
            }, validMoves[0]);
            selectedTokenId = advancedToken;
          }
        }

        // Apply selected move
        const token = state.tokens[activeColor][selectedTokenId];
        let previousStatus = token.status;

        if (token.status === 'base') {
          token.status = 'track';
          token.stepsTraveled = 0;
        } else {
          token.stepsTraveled += roll;
          if (token.stepsTraveled === 56) {
            token.status = 'goal';
          } else if (token.stepsTraveled > 51) {
            token.status = 'track'; // still on tract but home track
          }
        }

        let captureHappened = false;
        if (token.status === 'track' && token.stepsTraveled <= 51) {
          const commonIdx = (START_INDEXES[activeColor] + token.stepsTraveled) % 52;
          captureHappened = handleCollisions(room.id, room, activeColor, commonIdx, token.stepsTraveled) || false;
        }

        state.logs.push({
          id: generateId(),
          timestamp: new Date().toISOString(),
          text: `Bot ${COLOR_NAMES[activeColor]} menggeser bidak #${selectedTokenId + 1} sebanyak ${roll} langkah.`,
          type: 'move'
        });

        // Check if won
        if (checkWinner(state, activeColor)) {
          state.winner = activeColor;
          state.logs.push({
            id: generateId(),
            timestamp: new Date().toISOString(),
            text: `Bot ${COLOR_NAMES[activeColor]} MEMENANGKAN PERMAINAN! 🎉`,
            type: 'completed'
          });
          broadcastToRoom(room.id, { type: 'room_state', room });
          return;
        }

        // Turn logic transition
        state.diceValue = null;
        state.hasRolled = false;

        // If rolled 6 or captured, bot rolled again
        if (roll === 6 || captureHappened) {
          state.logs.push({
            id: generateId(),
            timestamp: new Date().toISOString(),
            text: `Bot ${COLOR_NAMES[activeColor]} berhak melempar dadu kembali!`,
            type: 'info'
          });
        } else {
          state.currentTurn = getNextTurnColor(activeColor, room);
        }

        broadcastToRoom(room.id, { type: 'room_state', room });
        
        // Loop Bot Play
        triggerBotPlay(room);
      }, room.botSettings.waitMs);
    }
  }, 1000);
}

// Handles client upgrade requests to direct WebSockets
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws: ClientSocket) => {
  ws.id = generateId();
  ws.name = `Pemain ${Math.floor(Math.random() * 900) + 100}`;
  
  ws.on('message', (rawData: string) => {
    try {
      const data: SocketMessage = JSON.parse(rawData);
      
      switch (data.type) {
        case 'create': {
          const roomId = generateRoomId();
          ws.roomId = roomId;
          ws.name = data.name || ws.name;
          
          const newPlayer: Player = {
            id: ws.id,
            name: ws.name,
            color: 'red', // Host starts as Red
            isHost: true,
            isBot: false,
            botDifficulty: 'medium',
            isActive: true,
            isMicMuted: true,
            isSpeaking: false
          };
          
          const newRoom: Room = {
            id: roomId,
            players: [newPlayer],
            slotsConfig: {
              red: 'player',
              green: 'bot', // fill remaining defaults with bots to kick start nicely!
              yellow: 'bot',
              blue: 'bot'
            },
            botSettings: {
              easyChance: 20,
              waitMs: 1500
            },
            gameStarted: false,
            gameState: null,
            boardCustomization: { ...defaultCustomization }
          };
          
          rooms.set(roomId, newRoom);
          ws.color = 'red';
          
          ws.send(JSON.stringify({ type: 'joined', roomId, player: newPlayer, room: newRoom }));
          break;
        }
        
        case 'join': {
          const roomId = data.roomId.toUpperCase();
          const room = rooms.get(roomId);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Ruangan tidak ditemukan!' }));
            return;
          }
          if (room.gameStarted) {
            // Check if reconnecting player exists
            const existingPlayer = room.players.find(p => p.name === data.name);
            if (existingPlayer) {
              existingPlayer.isActive = true;
              existingPlayer.id = ws.id; // update socket identity
              ws.roomId = roomId;
              ws.color = existingPlayer.color;
              ws.name = existingPlayer.name;
              ws.send(JSON.stringify({ type: 'joined', roomId, player: existingPlayer, room }));
              broadcastToRoom(roomId, { type: 'room_state', room });
              return;
            } else {
              ws.send(JSON.stringify({ type: 'error', message: 'Permainan sudah dimulai!' }));
              return;
            }
          }
          
          // Look for an available open slot in slotsConfig
          let assignedColor: TokenColor | null = null;
          const assignedColors = room.players.map(p => p.color);
          
          // Let's find first slot configured as 'bot' or optional open slots we can occupy
          for (const color of COLORS) {
            if (room.slotsConfig[color] === 'player' && !assignedColors.includes(color)) {
              assignedColor = color;
              break;
            }
          }
          
          // If no explicitly configured 'player' slots, take any 'bot' slot and convert it to player
          if (!assignedColor) {
            for (const color of COLORS) {
              if (room.slotsConfig[color] === 'bot' && !assignedColors.includes(color)) {
                assignedColor = color;
                room.slotsConfig[color] = 'player'; // upgrade slot to human
                break;
              }
            }
          }
          
          if (!assignedColor) {
            ws.send(JSON.stringify({ type: 'error', message: 'Ruangan sudah penuh!' }));
            return;
          }
          
          ws.roomId = roomId;
          ws.name = data.name || ws.name;
          ws.color = assignedColor;
          
          const newPlayer: Player = {
            id: ws.id,
            name: ws.name,
            color: assignedColor,
            isHost: false,
            isBot: false,
            botDifficulty: 'medium',
            isActive: true,
            isMicMuted: true,
            isSpeaking: false
          };
          
          room.players.push(newPlayer);
          ws.send(JSON.stringify({ type: 'joined', roomId, player: newPlayer, room }));
          broadcastToRoom(roomId, { type: 'room_state', room });
          break;
        }
        
        case 'config_slot': {
          const roomId = ws.roomId;
          if (!roomId) return;
          const room = rooms.get(roomId);
          if (!room) return;
          
          const sender = room.players.find(p => p.id === ws.id);
          if (!sender?.isHost) return; // Only host configure slots
          
          const { color, status } = data;
          
          // Keep red always host (unless host leaves, red slot remains)
          if (color === 'red' && status !== 'player') return;

          room.slotsConfig[color] = status;
          
          // If status changes to bot / closed, boot out any active player of that color
          if (status !== 'player') {
            const playerIdx = room.players.findIndex(p => p.color === color);
            if (playerIdx !== -1) {
              const booted = room.players[playerIdx];
              room.players.splice(playerIdx, 1);
              // boot the socket connection
              wss.clients.forEach((client: any) => {
                if (client.id === booted.id) {
                  client.roomId = undefined;
                  client.send(JSON.stringify({ type: 'error', message: 'Host merubah format slot anda.' }));
                }
              });
            }
          }
          
          broadcastToRoom(roomId, { type: 'room_state', room });
          break;
        }
        
        case 'config_bot_settings': {
          const roomId = ws.roomId;
          if (!roomId) return;
          const room = rooms.get(roomId);
          if (!room || !room.players.find(p => p.id === ws.id)?.isHost) return;

          room.botSettings.waitMs = data.waitMs;
          broadcastToRoom(roomId, { type: 'room_state', room });
          break;
        }

        case 'set_theme': {
          const roomId = ws.roomId;
          if (!roomId) return;
          const room = rooms.get(roomId);
          if (!room) return;
          
          room.boardCustomization.style = data.theme;
          broadcastToRoom(roomId, { type: 'room_state', room });
          break;
        }

        case 'customize_board': {
          const roomId = ws.roomId;
          if (!roomId) return;
          const room = rooms.get(roomId);
          if (!room) return;
          
          room.boardCustomization = {
            ...room.boardCustomization,
            ...data.customization
          };
          broadcastToRoom(roomId, { type: 'room_state', room });
          break;
        }
        
        case 'start_game': {
          const roomId = ws.roomId;
          if (!roomId) return;
          const room = rooms.get(roomId);
          if (!room) return;
          
          const sender = room.players.find(p => p.id === ws.id);
          if (!sender?.isHost) return;
          
          room.gameStarted = true;
          room.gameState = createInitialGameState();
          
          broadcastToRoom(roomId, { type: 'room_state', room });
          
          // Automate bot plays if Red is configured as bot
          triggerBotPlay(room);
          break;
        }
        
        case 'roll_dice': {
          const roomId = ws.roomId;
          if (!roomId || !ws.color) return;
          const room = rooms.get(roomId);
          if (!room || !room.gameState) return;
          
          const state = room.gameState;
          if (state.currentTurn !== ws.color || state.hasRolled || state.winner) return;
          
          const roll = Math.floor(Math.random() * 6) + 1;
          state.diceValue = roll;
          state.hasRolled = true;
          
          state.logs.push({
            id: generateId(),
            timestamp: new Date().toISOString(),
            text: `${COLOR_NAMES[ws.color]} melempar dadu: ${roll}`,
            type: 'roll'
          });
          
          const validMoves = getValidMoves(state.tokens[ws.color], roll);
          
          if (validMoves.length === 0) {
            // Wait 1.5 seconds so they can see the rolled dice before passing
            broadcastToRoom(roomId, { type: 'room_state', room });
            
            setTimeout(() => {
              if (!room.gameState) return;
              state.logs.push({
                id: generateId(),
                timestamp: new Date().toISOString(),
                text: `${COLOR_NAMES[ws.color]} tidak memiliki langkah valid. Giliran dialihkan.`,
                type: 'info'
              });
              
              state.diceValue = null;
              state.hasRolled = false;
              state.currentTurn = getNextTurnColor(ws.color!, room);
              
              broadcastToRoom(roomId, { type: 'room_state', room });
              triggerBotPlay(room);
            }, 1500);
          } else {
            broadcastToRoom(roomId, { type: 'room_state', room });
          }
          break;
        }
        
        case 'move_token': {
          const roomId = ws.roomId;
          if (!roomId || !ws.color) return;
          const room = rooms.get(roomId);
          if (!room || !room.gameState) return;
          
          const state = room.gameState;
          if (state.currentTurn !== ws.color || !state.hasRolled || state.winner) return;
          
          const tokenId = data.tokenId;
          const roll = state.diceValue!;
          const token = state.tokens[ws.color][tokenId];
          
          if (!canMoveToken(token, roll)) return;
          
          // Apply movement
          if (token.status === 'base') {
            token.status = 'track';
            token.stepsTraveled = 0;
          } else {
            token.stepsTraveled += roll;
            if (token.stepsTraveled === 56) {
              token.status = 'goal';
            } else if (token.stepsTraveled > 51) {
              token.status = 'track';
            }
          }
          
          let captureHappened = false;
          if (token.status === 'track' && token.stepsTraveled <= 51) {
            const commonIdx = (START_INDEXES[ws.color] + token.stepsTraveled) % 52;
            captureHappened = handleCollisions(roomId, room, ws.color, commonIdx, token.stepsTraveled) || false;
          }
          
          state.logs.push({
            id: generateId(),
            timestamp: new Date().toISOString(),
            text: `${COLOR_NAMES[ws.color]} menggeser bidak #${tokenId + 1} sebanyak ${roll} langkah.`,
            type: 'move'
          });
          
          // Check for winner
          if (checkWinner(state, ws.color)) {
            state.winner = ws.color;
            state.logs.push({
              id: generateId(),
              timestamp: new Date().toISOString(),
              text: `${COLOR_NAMES[ws.color]} MEMENANGKAN PERMAINAN! 🎉🏆`,
              type: 'completed'
            });
            broadcastToRoom(roomId, { type: 'room_state', room });
            return;
          }
          
          // Reset roll
          state.diceValue = null;
          state.hasRolled = false;
          
          if (roll === 6 || captureHappened) {
            state.logs.push({
              id: generateId(),
              timestamp: new Date().toISOString(),
              text: `${COLOR_NAMES[ws.color]} berhak melempar dadu kembali!`,
              type: 'info'
            });
          } else {
            state.currentTurn = getNextTurnColor(ws.color, room);
          }
          
          broadcastToRoom(roomId, { type: 'room_state', room });
          
          // Automate next turn if bot
          triggerBotPlay(room);
          break;
        }
        
        case 'chat_msg': {
          const roomId = ws.roomId;
          if (!roomId) return;
          const room = rooms.get(roomId);
          if (!room) return;
          
          const chatMsg = {
            id: generateId(),
            senderId: ws.id,
            senderName: ws.name,
            senderColor: ws.color,
            text: data.text,
            timestamp: new Date().toISOString()
          };
          
          broadcastToRoom(roomId, { type: 'chat_msg', message: chatMsg });
          break;
        }
        
        case 'audio_chunk': {
          const roomId = ws.roomId;
          if (!roomId) return;
          // Propagate voice broadcast chunk directly to other players in room
          broadcastToRoom(roomId, {
            type: 'audio_chunk',
            senderId: ws.id,
            chunk: data.chunk
          }, ws.id);
          break;
        }
        
        case 'toggle_mic': {
          const roomId = ws.roomId;
          if (!roomId) return;
          const room = rooms.get(roomId);
          if (!room) return;
          
          const player = room.players.find(p => p.id === ws.id);
          if (player) {
            player.isMicMuted = data.isMuted;
            broadcastToRoom(roomId, { type: 'room_state', room });
          }
          break;
        }
        
        case 'speaking': {
          const roomId = ws.roomId;
          if (!roomId) return;
          const room = rooms.get(roomId);
          if (!room) return;
          
          const player = room.players.find(p => p.id === ws.id);
          if (player) {
            player.isSpeaking = data.isSpeaking;
            broadcastToRoom(roomId, { type: 'room_state', room });
          }
          break;
        }
      }
    } catch (e) {
      console.error('Error handling ws message', e);
    }
  });

  ws.on('close', () => {
    const roomId = ws.roomId;
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        const playerIdx = room.players.findIndex(p => p.id === ws.id);
        if (playerIdx !== -1) {
          const player = room.players[playerIdx];
          
          if (room.gameStarted) {
            // Convert to inactive; bot takes over or is flagged
            player.isActive = false;
            player.isSpeaking = false;
            broadcastToRoom(roomId, { type: 'room_state', room });
            // If it was the disconnected player's turn, trigger bot playbook to keep things moving
            if (room.gameState && room.gameState.currentTurn === player.color) {
              triggerBotPlay(room);
            }
          } else {
            // Game not started, just remove completely
            room.players.splice(playerIdx, 1);
            
            // If room is empty, clear room
            if (room.players.length === 0) {
              rooms.delete(roomId);
            } else {
              // Re-assign host if host left
              if (player.isHost) {
                room.players[0].isHost = true;
                room.players[0].color = 'red';
                room.slotsConfig.red = 'player';
              }
              broadcastToRoom(roomId, { type: 'room_state', room });
            }
          }
        }
      }
    }
  });
});

// Integration of Vite Dev Server or Production Build serving
async function initServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`Ludo server listening on http://0.0.0.0:${port}`);
  });
}

initServer();
