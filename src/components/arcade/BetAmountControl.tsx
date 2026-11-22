import React, { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { casinoAudio } from '../../lib/casinoAudio';

export const MIN_BET = 1;
export const MAX_BET = 50000;

export function clampBet(val: number): number {
  if (!Number.isFinite(val)) return MIN_BET;
  return Math.max(MIN_BET, Math.min(MAX_BET, Math.round(val)));
}

function getStepFor(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    if (current < 10) return 1;
    if (current < 50) return 5;
    if (current < 100) return 10;
    if (current < 500) return 50;
    if (current < 2000) return 100;
    if (current < 10000) return 500;
    return 1000;
  }
  if (current <= 10) return 1;
  if (current <= 50) return 5;
  if (current <= 100) return 10;
  if (current <= 500) return 50;
  if (current <= 2000) return 100;
  if (current <= 10000) return 500;
  return 1000;
}

interface BetAmountControlProps {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
  className?: string;
}

export const BetAmountControl: React.FC<BetAmountControlProps> = ({
  value,
  onChange,
  disabled = false,
  label,
  compact = false,
  className = '',
}) => {
  const [draft, setDraft] = useState<string>(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const handleDecrease = () => {
    if (disabled) return;
    casinoAudio.playButtonClick();
    const step = getStepFor(value, -1);
    onChange(clampBet(value - step));
  };

  const handleIncrease = () => {
    if (disabled) return;
    casinoAudio.playButtonClick();
    const step = getStepFor(value, 1);
    onChange(clampBet(value + step));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setDraft(raw);
    if (raw !== '') {
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed)) {
        onChange(clampBet(parsed));
      }
    }
  };

  const handleBlur = () => {
    const parsed = parseInt(draft, 10);
    const clamped = Number.isFinite(parsed) ? clampBet(parsed) : MIN_BET;
    onChange(clamped);
    setDraft(String(clamped));
  };

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-slate-300">
          <span>{label}</span>
          <span className="text-slate-400 font-mono-num">₹1 – ₹50,000</span>
        </div>
      )}
      <div
        className={`flex items-center gap-1.5 rounded-2xl bg-[#0D1119]/95 border border-white/15 p-1 shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)] ${
          disabled ? 'opacity-55' : ''
        }`}
      >
        <button
          type="button"
          disabled={disabled || value <= MIN_BET}
          onClick={handleDecrease}
          aria-label="Decrease bet"
          className={`${
            compact ? 'w-10 h-10' : 'w-11 h-11'
          } shrink-0 rounded-xl bg-gradient-to-b from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 border border-white/15 shadow-[0_3px_0_#07090E] active:translate-y-[2px] active:shadow-none flex items-center justify-center text-white transition disabled:opacity-35`}
        >
          <Minus className="w-4 h-4 stroke-[2.8]" />
        </button>

        <div className="flex-1 min-w-0 flex items-center justify-center gap-1 px-2">
          <span className="text-sm font-black text-amber-400 select-none">₹</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={disabled}
            value={draft}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Bet amount in rupees"
            className="w-full bg-transparent text-center text-base font-black font-mono-num text-white focus:outline-none placeholder:text-slate-500"
            placeholder="10"
          />
        </div>

        <button
          type="button"
          disabled={disabled || value >= MAX_BET}
          onClick={handleIncrease}
          aria-label="Increase bet"
          className={`${
            compact ? 'w-10 h-10' : 'w-11 h-11'
          } shrink-0 rounded-xl bg-gradient-to-b from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 border border-white/15 shadow-[0_3px_0_#07090E] active:translate-y-[2px] active:shadow-none flex items-center justify-center text-white transition disabled:opacity-35`}
        >
          <Plus className="w-4 h-4 stroke-[2.8]" />
        </button>
      </div>
    </div>
  );
};
