export type TokenColor = 'red' | 'green' | 'yellow' | 'blue';

export interface Token {
  id: number; // 0, 1, 2, 3
  color: TokenColor;
  status: 'base' | 'track' | 'goal';
  stepsTraveled: number; // 0-51 on common path, 51-55 on home path, 56 is goal
}

export interface Player {
  id: string; // socket connection id or guest uuid
  name: string;
  color: TokenColor;
  isHost: boolean;
  isBot: boolean;
  botDifficulty: 'easy' | 'medium' | 'hard';
  isActive: boolean;
  isMicMuted: boolean;
  isSpeaking: boolean;
}

export type BoardStyle = 'classic' | 'neon' | 'wood' | 'pastel';

export interface BoardCustomization {
  style: BoardStyle;
  borderRadius: 'none' | 'sm' | 'md' | 'lg';
  showGridLines: boolean;
  customBaseColors: {
    red: string;
    green: string;
    yellow: string;
    blue: string;
  };
}

export interface GameLog {
  id: string;
  timestamp: string; // UTC or simple localized format
  text: string;
  type: 'info' | 'roll' | 'move' | 'capture' | 'completed' | 'system';
}

export interface GameState {
  tokens: Record<TokenColor, Token[]>;
  currentTurn: TokenColor; // whose turn it is
  diceValue: number | null;
  hasRolled: boolean;
  consecutiveSixes: number;
  winner: TokenColor | null;
  logs: GameLog[];
  turnTimeLeft: number; // For timers
}

export interface Room {
  id: string; // 4-letter alphanumeric code
  players: Player[];
  slotsConfig: {
    red: 'player' | 'bot' | 'closed';
    green: 'player' | 'bot' | 'closed';
    yellow: 'player' | 'bot' | 'closed';
    blue: 'player' | 'bot' | 'closed';
  };
  botSettings: {
    easyChance: number; // percentage of stupid moves
    waitMs: number; // simulated delays for realism
  };
  gameStarted: boolean;
  gameState: GameState | null;
  boardCustomization: BoardCustomization;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor?: TokenColor;
  text: string;
  timestamp: string;
}

// Websocket packet structures
export type SocketMessage =
  | { type: 'join'; roomId: string; name: string }
  | { type: 'create'; name: string }
  | { type: 'config_slot'; color: TokenColor; status: 'player' | 'bot' | 'closed' }
  | { type: 'config_bot_settings'; waitMs: number }
  | { type: 'start_game' }
  | { type: 'roll_dice' }
  | { type: 'move_token'; tokenId: number }
  | { type: 'chat_msg'; text: string }
  | { type: 'audio_chunk'; chunk: string } // base64 encoded media recorder chunk
  | { type: 'set_theme'; theme: BoardStyle }
  | { type: 'customize_board'; customization: Partial<BoardCustomization> }
  | { type: 'toggle_mic'; isMuted: boolean }
  | { type: 'speaking'; isSpeaking: boolean };
