import React from 'react';
import { Shield, Sparkles, Star, Award } from 'lucide-react';
import { Token, TokenColor, BoardStyle, BoardCustomization } from '../types';

interface LudoBoardProps {
  tokens: Record<TokenColor, Token[]>;
  currentTurn: TokenColor;
  diceValue: number | null;
  hasRolled: boolean;
  onMoveToken: (tokenId: number) => void;
  validMovableIds: number[];
  customization: BoardCustomization;
  activeColor: TokenColor | null;
}

// 52 common path track coordinates matching the server.ts
const COMMON_TRACK = [
  { r: 6, c: 0 }, { r: 6, c: 1 }, { r: 6, c: 2 }, { r: 6, c: 3 }, { r: 6, c: 4 }, { r: 6, c: 5 }, // 0-5
  { r: 5, c: 6 }, { r: 4, c: 6 }, { r: 3, c: 6 }, { r: 2, c: 6 }, { r: 1, c: 6 }, { r: 0, c: 6 }, // 6-11
  { r: 0, c: 7 }, // 12
  { r: 0, c: 8 }, { r: 1, c: 8 }, { r: 2, c: 8 }, { r: 3, c: 8 }, { r: 4, c: 8 }, { r: 5, c: 8 }, // 13-18
  { r: 6, c: 9 }, { r: 6, c: 10 }, { r: 6, c: 11 }, { r: 6, c: 12 }, { r: 6, c: 13 }, { r: 6, c: 14 }, // 19-24
  { r: 7, c: 14 }, // 25
  { r: 8, c: 14 }, { r: 8, c: 13 }, { r: 8, c: 12 }, { r: 8, c: 11 }, { r: 8, c: 10 }, { r: 8, c: 9 }, // 26-31
  { r: 9, c: 8 }, { r: 10, c: 8 }, { r: 11, c: 8 }, { r: 12, c: 8 }, { r: 13, c: 8 }, { r: 14, c: 8 }, // 32-37
  { r: 14, c: 7 }, // 38
  { r: 14, c: 6 }, { r: 13, c: 6 }, { r: 12, c: 6 }, { r: 11, c: 6 }, { r: 10, c: 6 }, { r: 9, c: 6 }, // 39-44
  { r: 8, c: 5 }, { r: 8, c: 4 }, { r: 8, c: 3 }, { r: 8, c: 2 }, { r: 8, c: 1 }, { r: 8, c: 0 }, // 45-50
  { r: 7, c: 0 } // 51
];

// Fixed layout bug: index 15 of COMMON_TRACK coordinates top-middle section:
// Let's ensure common track arrays is perfectly mapped:
const CORRECTED_TRACK = [
  ...COMMON_TRACK
];
// Verify (1, 8) is at index 14
CORRECTED_TRACK[14] = { r: 1, c: 8 };
CORRECTED_TRACK[15] = { r: 2, c: 8 };

const START_INDEXES: Record<TokenColor, number> = {
  red: 1,
  yellow: 14,
  green: 27,
  blue: 40
};

const SAFE_CELL_INDEXES = [1, 8, 14, 21, 27, 34, 40, 47];

// Standard Ludo base token offsets
const BASE_OFFSETS: Record<TokenColor, { r: number; c: number }[]> = {
  red: [{ r: 2, c: 2 }, { r: 2, c: 3 }, { r: 3, c: 2 }, { r: 3, c: 3 }],
  yellow: [{ r: 2, c: 11 }, { r: 2, c: 12 }, { r: 3, c: 11 }, { r: 3, c: 12 }],
  green: [{ r: 11, c: 11 }, { r: 11, c: 12 }, { r: 12, c: 11 }, { r: 12, c: 12 }],
  blue: [{ r: 11, c: 2 }, { r: 11, c: 3 }, { r: 12, c: 2 }, { r: 12, c: 3 }]
};

// Home pathways
const HOME_PATHS: Record<TokenColor, { r: number; c: number }[]> = {
  red: [{ r: 7, c: 1 }, { r: 7, c: 2 }, { r: 7, c: 3 }, { r: 7, c: 4 }, { r: 7, c: 5 }],
  yellow: [{ r: 1, c: 7 }, { r: 2, c: 7 }, { r: 3, c: 7 }, { r: 4, c: 7 }, { r: 5, c: 7 }],
  green: [{ r: 7, c: 13 }, { r: 7, c: 12 }, { r: 7, c: 11 }, { r: 7, c: 10 }, { r: 7, c: 9 }],
  blue: [{ r: 13, c: 7 }, { r: 12, c: 7 }, { r: 11, c: 7 }, { r: 10, c: 7 }, { r: 9, c: 7 }]
};

export default function LudoBoard({
  tokens,
  currentTurn,
  diceValue,
  hasRolled,
  onMoveToken,
  validMovableIds,
  customization,
  activeColor
}: LudoBoardProps) {
  
  const { style, showGridLines } = customization;

  // Custom style palettes
  const stylesConfigs: Record<BoardStyle, {
    bg: string;
    border: string;
    cellBorder: string;
    trackBg: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    neutral: string;
  }> = {
    classic: {
      bg: 'bg-white',
      border: 'border-slate-800',
      cellBorder: 'border-slate-300',
      trackBg: 'bg-slate-50',
      red: 'bg-red-500',
      green: 'bg-green-500',
      yellow: 'bg-amber-400',
      blue: 'bg-blue-500',
      neutral: 'bg-white'
    },
    neon: {
      bg: 'bg-slate-950',
      border: 'border-cyan-500/70 shadow-[0_0_15px_rgba(6,182,212,0.3)]',
      cellBorder: 'border-slate-800',
      trackBg: 'bg-slate-900/60',
      red: 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]',
      green: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]',
      yellow: 'bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.6)]',
      blue: 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.6)]',
      neutral: 'bg-slate-950'
    },
    wood: {
      bg: 'bg-[#ecc89d]', // warm timber colors
      border: 'border-[#5c3e21] shadow-xl',
      cellBorder: 'border-[#8c6d4f]',
      trackBg: 'bg-[#fceede]',
      red: 'bg-[#ab2626]',
      green: 'bg-[#216d33]',
      yellow: 'bg-[#bfa71f]',
      blue: 'bg-[#185387]',
      neutral: 'bg-[#faebd7]'
    },
    pastel: {
      bg: 'bg-slate-50',
      border: 'border-slate-400',
      cellBorder: 'border-slate-200',
      trackBg: 'bg-slate-100/70',
      red: 'bg-rose-300',
      green: 'bg-emerald-300',
      yellow: 'bg-amber-200',
      blue: 'bg-sky-300',
      neutral: 'bg-slate-50'
    }
  };

  const palette = stylesConfigs[style];

  // Helper function to get row and column coordinate of a Token
  const getTokenCoordinates = (token: Token): { r: number; c: number } | null => {
    const { color, id, status, stepsTraveled } = token;
    
    if (status === 'base') {
      return BASE_OFFSETS[color][id];
    }
    
    if (status === 'goal') {
      // Goal area - put in the center (7, 7) with custom miniature placements per color so they look separated!
      const goalOffsets: Record<TokenColor, { r: number; c: number }> = {
        red: { r: 7, c: 6 },
        yellow: { r: 6, c: 7 },
        green: { r: 7, c: 8 },
        blue: { r: 8, c: 7 }
      };
      return goalOffsets[color];
    }

    if (stepsTraveled <= 51) {
      // Common loop index calculation
      const startIdx = START_INDEXES[color];
      const actualCommonIdx = (startIdx + stepsTraveled) % 52;
      return CORRECTED_TRACK[actualCommonIdx];
    } else {
      // Home pathway
      const homeIdx = stepsTraveled - 51; // 0 to 4
      return HOME_PATHS[color][homeIdx];
    }
  };

  // Find all tokens currently at coordinate (r, c)
  const getTokensAtCell = (r: number, c: number): Token[] => {
    const list: Token[] = [];
    const colorKeys: TokenColor[] = ['red', 'yellow', 'green', 'blue'];
    colorKeys.forEach((color) => {
      tokens[color].forEach((tok) => {
        const coord = getTokenCoordinates(tok);
        if (coord && coord.r === r && coord.c === c) {
          list.push(tok);
        }
      });
    });
    return list;
  };

  // Check if a coordinates is a starting block of any player
  const getStartCellColor = (r: number, c: number): TokenColor | null => {
    for (const color of ['red', 'yellow', 'green', 'blue'] as TokenColor[]) {
      const idx = START_INDEXES[color];
      const coord = CORRECTED_TRACK[idx];
      if (coord.r === r && coord.c === c) return color;
    }
    return null;
  };

  // Check if coordinates belongs to home path of any player
  const getHomePathColor = (r: number, c: number): TokenColor | null => {
    for (const color of ['red', 'yellow', 'green', 'blue'] as TokenColor[]) {
      const paths = HOME_PATHS[color];
      if (paths.some((p) => p.r === r && p.c === c)) return color;
    }
    return null;
  };

  // Check if coordinates belongs to Home base area (6x6 corners)
  const getBaseColor = (r: number, c: number): TokenColor | null => {
    if (r < 6 && c < 6) return 'red';
    if (r < 6 && c >= 9) return 'yellow';
    if (r >= 9 && c >= 9) return 'green';
    if (r >= 9 && c < 6) return 'blue';
    return null;
  };

  // Render cell contents
  const renderCell = (r: number, c: number) => {
    // 1. Center of the board: Home Goal
    if (r === 7 && c === 7) {
      return (
        <div key="center-goal" className="relative w-full h-full flex items-center justify-center bg-slate-900 border border-slate-700 shadow-inner overflow-hidden">
          {/* Triangular sector decorations */}
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 rotate-45 scale-150 pointer-events-none">
            <div className={`${palette.red} opacity-30 border border-slate-700`} />
            <div className={`${palette.yellow} opacity-30 border border-slate-700`} />
            <div className={`${palette.blue} opacity-30 border border-slate-700`} />
            <div className={`${palette.green} opacity-30 border border-slate-700`} />
          </div>
          <Award className="h-6 w-6 text-yellow-400 z-10 animate-bounce" />
        </div>
      );
    }

    const tokensInCell = getTokensAtCell(r, c);
    const startColor = getStartCellColor(r, c);
    const homeColor = getHomePathColor(r, c);
    const baseColor = getBaseColor(r, c);
    const isSafe = SAFE_CELL_INDEXES.some((idx) => CORRECTED_TRACK[idx].r === r && CORRECTED_TRACK[idx].c === c);

    // Apply color palettes per type
    let cellBg = palette.trackBg;
    if (baseColor) {
      cellBg = 'transparent'; // Handled by outer base containers
    } else if (homeColor) {
      cellBg =
        homeColor === 'red' ? palette.red + ' opacity-[0.45]' :
        homeColor === 'yellow' ? palette.yellow + ' opacity-[0.45]' :
        homeColor === 'green' ? palette.green + ' opacity-[0.45]' :
        palette.blue + ' opacity-[0.45]';
    } else if (startColor) {
      cellBg =
        startColor === 'red' ? palette.red + ' opacity-[0.6]' :
        startColor === 'yellow' ? palette.yellow + ' opacity-[0.6]' :
        startColor === 'green' ? palette.green + ' opacity-[0.6]' :
        palette.blue + ' opacity-[0.6]';
    }

    const isGridSquare = (r >= 6 && r <= 8) || (c >= 6 && c <= 8);

    // Base area squares inside the 6x6 (except safe slots offsets)
    if (!isGridSquare && baseColor) {
      const isOffset = BASE_OFFSETS[baseColor].some((o) => o.r === r && o.c === c);
      return (
        <div
          key={`${r}-${c}`}
          className={`w-full h-full flex items-center justify-center transition-all ${
            isOffset
              ? 'bg-slate-900/40 rounded-full border border-slate-700/80'
              : 'transparent'
          }`}
        >
          {/* Active token at home base */}
          {tokensInCell.length > 0 && renderTokensStack(tokensInCell)}
        </div>
      );
    }

    return (
      <div
        key={`${r}-${c}`}
        className={`relative w-full h-full flex items-center justify-center transition-all ${cellBg} ${
          showGridLines ? palette.cellBorder + ' border-[0.5px]' : ''
        } ${isSafe ? 'ring-1 ring-inset ring-slate-500/30' : ''}`}
      >
        {/* Safe Star icon indicator */}
        {isSafe && !tokensInCell.length && (
          <Star className={`h-4.5 w-4.5 absolute opacity-45 ${
            style === 'neon' ? 'text-cyan-400' : 'text-slate-500'
          }`} />
        )}

        {/* Start point shield indicator */}
        {startColor && !tokensInCell.length && (
          <Shield className="h-4.5 w-4.5 absolute opacity-30 text-white" />
        )}

        {/* Render stacked/clustered tokens inside the cell */}
        {tokensInCell.length > 0 && renderTokensStack(tokensInCell)}
      </div>
    );
  };

  // Stack tokens nicely if multiple are inside the same grid box
  const renderTokensStack = (stackedTokens: Token[]) => {
    const isMultiple = stackedTokens.length > 1;

    return (
      <div className={`grid ${
        stackedTokens.length <= 1 ? 'grid-cols-1' :
        stackedTokens.length <= 2 ? 'grid-cols-2 gap-0.5' :
        'grid-cols-2 gap-0.5'
      } items-center justify-center w-full h-full p-1`}>
        {stackedTokens.map((token) => {
          const isMyTurn = currentTurn === token.color && activeColor === token.color;
          const isMovable = isMyTurn && hasRolled && validMovableIds.includes(token.id);

          // Get appropriate token visual color
          let tokenColorStyle = 'bg-red-500 hover:bg-red-400 ring-rose-300';
          if (token.color === 'green') tokenColorStyle = 'bg-emerald-500 hover:bg-emerald-400 ring-emerald-300';
          if (token.color === 'yellow') tokenColorStyle = 'bg-amber-400 hover:bg-amber-300 ring-amber-200';
          if (token.color === 'blue') tokenColorStyle = 'bg-blue-500 hover:bg-blue-400 ring-sky-300';

          return (
            <button
              key={`${token.color}-${token.id}`}
              onClick={() => isMovable && onMoveToken(token.id)}
              disabled={!isMovable}
              className={`relative rounded-full aspect-square transition-all duration-300 transform select-none cursor-pointer flex items-center justify-center ${tokenColorStyle} ${
                isMultiple ? 'w-5 h-5 shadow-xs' : 'w-7.5 h-7.5 shadow-md hover:scale-115'
              } ${
                isMovable
                  ? 'animate-bounce ring-4 ring-white shadow-[0_0_12px_rgba(255,255,255,0.9)] scale-110 z-20'
                  : 'border border-white/40'
              }`}
              title={`Bidak ${token.color.toUpperCase()} #${token.id + 1} (${
                token.status === 'base' ? 'Keluar Base' : `Langkah ${token.stepsTraveled}`
              })`}
            >
              <span className={`font-mono font-bold leading-none ${isMultiple ? 'text-[8px]' : 'text-xs'} text-white`}>
                {token.id + 1}
              </span>
              
              {/* Highlight active halo spinner */}
              {isMovable && (
                <span className="absolute -inset-1 rounded-full border-2 border-dashed border-emerald-400 animate-spin opacity-80" />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`relative aspect-square w-full max-w-[560px] rounded-2xl mx-auto p-4 ${palette.bg} border-4 ${palette.border} shadow-2xl`}>
      {/* Dynamic Grid Container of 15x15 */}
      <div className="grid grid-cols-15 grid-rows-15 w-full h-full relative font-sans">
        
        {/* Outer bases styled as beautiful big interactive solid cards for Ludo Corners */}
        
        {/* Red Home Base (Top-Left 6x6) */}
        <div className={`absolute top-0 left-0 w-[40%] h-[40%] rounded-xl ${
          style === 'neon' ? 'bg-rose-950/20 border-2 border-rose-500/40' :
          style === 'wood' ? 'bg-[#5c3e21]/30 border-2 border-[#5c3e21]' :
          'bg-rose-50 border-2 border-rose-200'
        } p-3 flex flex-col justify-between pointer-events-none z-10 shadow-sm`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-rose-500 tracking-wider">MERAH</span>
            <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse" />
          </div>
          <div className="grid grid-cols-6 grid-rows-6 w-full h-[75%]" />
        </div>

        {/* Yellow Home Base (Top-Right 6x6) */}
        <div className={`absolute top-0 right-0 w-[40%] h-[40%] rounded-xl ${
          style === 'neon' ? 'bg-yellow-950/20 border-2 border-yellow-500/40' :
          style === 'wood' ? 'bg-[#5c3e21]/30 border-2 border-[#5c3e21]' :
          'bg-amber-50 border-2 border-amber-200'
        } p-3 flex flex-col justify-between pointer-events-none z-10 shadow-sm`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-amber-500 tracking-wider">KUNING</span>
            <div className="w-4 h-4 rounded-full bg-amber-400 animate-pulse" />
          </div>
          <div className="grid grid-cols-6 grid-rows-6 w-full h-[75%]" />
        </div>

        {/* Blue Home Base (Bottom-Left 6x6) */}
        <div className={`absolute bottom-0 left-0 w-[40%] h-[40%] rounded-xl ${
          style === 'neon' ? 'bg-cyan-950/20 border-2 border-cyan-500/40' :
          style === 'wood' ? 'bg-[#5c3e21]/30 border-2 border-[#5c3e21]' :
          'bg-blue-50 border-2 border-blue-200'
        } p-3 flex flex-col justify-between pointer-events-none z-10 shadow-sm`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-blue-500 tracking-wider">BIRU</span>
            <div className="w-4 h-4 rounded-full bg-blue-500 animate-pulse" />
          </div>
          <div className="grid grid-cols-6 grid-rows-6 w-full h-[75%]" />
        </div>

        {/* Green Home Base (Bottom-Right 6x6) */}
        <div className={`absolute bottom-0 right-0 w-[40%] h-[40%] rounded-xl ${
          style === 'neon' ? 'bg-emerald-950/20 border-2 border-emerald-500/40' :
          style === 'wood' ? 'bg-[#5c3e21]/30 border-2 border-[#5c3e21]' :
          'bg-emerald-50 border-2 border-emerald-200'
        } p-3 flex flex-col justify-between pointer-events-none z-10 shadow-sm`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-emerald-500 tracking-wider">HIJAU</span>
            <div className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="grid grid-cols-6 grid-rows-6 w-full h-[75%]" />
        </div>

        {/* Map grid items dynamically 15x15 */}
        {Array.from({ length: 15 }).map((_, r) =>
          Array.from({ length: 15 }).map((_, c) => renderCell(r, c))
        )}
      </div>
    </div>
  );
}
