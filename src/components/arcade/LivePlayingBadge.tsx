import React, { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';

const MIN_VIEWERS = 600;
const MAX_VIEWERS = 15000;

function seedBaseForGame(gameId: string): number {
  let hash = 0;
  for (let i = 0; i < gameId.length; i++) {
    hash = (hash * 31 + gameId.charCodeAt(i)) >>> 0;
  }
  // Spread realistically between 1,400 and 12,800 per game
  if (gameId.includes('AVIATOR')) return 9840 + (hash % 3200);
  if (gameId.includes('MINES')) return 5620 + (hash % 2900);
  if (gameId.includes('VOLCANO')) return 4180 + (hash % 2600);
  if (gameId.includes('MONEY')) return 3450 + (hash % 2400);
  if (gameId.includes('TWIST')) return 2790 + (hash % 2100);
  return 1150 + (hash % 4900);
}

export function useLivePlayingCount(gameId: string): number {
  const [count, setCount] = useState<number>(() => seedBaseForGame(gameId));

  useEffect(() => {
    const base = seedBaseForGame(gameId);
    setCount(base);

    const interval = window.setInterval(() => {
      setCount((prev) => {
        // Gentle YouTube-Live-style viewer drift
        const delta = Math.floor(Math.random() * 145) - 68;
        const pull = Math.round((base - prev) * 0.08);
        const next = prev + delta + pull;
        return Math.max(MIN_VIEWERS, Math.min(MAX_VIEWERS, next));
      });
    }, 2900);

    return () => window.clearInterval(interval);
  }, [gameId]);

  return count;
}

export const LivePlayingBadge: React.FC<{
  gameId: string;
  compact?: boolean;
  className?: string;
}> = ({ gameId, compact = false, className = '' }) => {
  const viewers = useLivePlayingCount(gameId);

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md bg-black/75 border border-white/15 shadow-md select-none ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'
      } ${className}`}
    >
      <span className="inline-flex items-center gap-1 rounded bg-[#E11D48] px-1.5 py-0.5 text-[9px] font-black tracking-wider text-white uppercase leading-none">
        LIVE
      </span>
      <span className="inline-flex items-center gap-1 font-mono-num font-bold text-slate-100 leading-none">
        <Eye className={compact ? 'w-3 h-3 text-slate-300' : 'w-3.5 h-3.5 text-slate-300'} />
        <span>{viewers.toLocaleString('en-IN')}</span>
        {!compact && <span className="text-slate-400 font-semibold hidden xs:inline">playing</span>}
      </span>
    </div>
  );
};
