import React, { useEffect, useState } from 'react';
import { Crown, RotateCcw, Sparkles, Star, Trophy } from 'lucide-react';
import { formatINR } from '../../lib/api';

export interface GameOutcomeEvent {
  id: number;
  type: 'win' | 'lose';
  amount: number;
  betAmount?: number;
}

const WIN_DURATION_MS = 2500;
const LOSE_DURATION_MS = 1000;

const CONFETTI_PARTICLES: Array<{
  tx: string;
  ty: string;
  rot: string;
  color: string;
  size: string;
  delay: string;
}> = [
  { tx: '0px', ty: '-128px', rot: '65deg', color: 'bg-amber-300', size: 'w-2.5 h-2.5 rounded-full', delay: '0ms' },
  { tx: '48px', ty: '-118px', rot: '130deg', color: 'bg-emerald-300', size: 'w-2 h-4 rounded-sm', delay: '40ms' },
  { tx: '92px', ty: '-94px', rot: '185deg', color: 'bg-yellow-400', size: 'w-3 h-3 rounded-full', delay: '80ms' },
  { tx: '124px', ty: '-48px', rot: '235deg', color: 'bg-sky-300', size: 'w-2 h-3.5 rounded-sm', delay: '30ms' },
  { tx: '134px', ty: '8px', rot: '290deg', color: 'bg-amber-400', size: 'w-2.5 h-2.5 rounded-full', delay: '90ms' },
  { tx: '116px', ty: '64px', rot: '330deg', color: 'bg-emerald-400', size: 'w-2 h-4 rounded-sm', delay: '60ms' },
  { tx: '76px', ty: '104px', rot: '45deg', color: 'bg-yellow-300', size: 'w-2.5 h-2.5 rounded-full', delay: '110ms' },
  { tx: '24px', ty: '120px', rot: '115deg', color: 'bg-amber-300', size: 'w-2 h-3.5 rounded-sm', delay: '50ms' },
  { tx: '-32px', ty: '118px', rot: '-65deg', color: 'bg-emerald-300', size: 'w-2.5 h-2.5 rounded-full', delay: '20ms' },
  { tx: '-84px', ty: '98px', rot: '-120deg', color: 'bg-sky-300', size: 'w-2 h-4 rounded-sm', delay: '70ms' },
  { tx: '-120px', ty: '56px', rot: '-175deg', color: 'bg-yellow-400', size: 'w-2.5 h-2.5 rounded-full', delay: '40ms' },
  { tx: '-136px', ty: '2px', rot: '-230deg', color: 'bg-amber-400', size: 'w-2 h-3.5 rounded-sm', delay: '100ms' },
  { tx: '-122px', ty: '-54px', rot: '-285deg', color: 'bg-emerald-400', size: 'w-3 h-3 rounded-full', delay: '30ms' },
  { tx: '-88px', ty: '-98px', rot: '-330deg', color: 'bg-yellow-300', size: 'w-2 h-4 rounded-sm', delay: '80ms' },
  { tx: '-44px', ty: '-120px', rot: '-40deg', color: 'bg-white', size: 'w-2 h-2 rounded-full', delay: '50ms' },
  { tx: '66px', ty: '-44px', rot: '95deg', color: 'bg-white', size: 'w-1.5 h-1.5 rounded-full', delay: '140ms' },
  { tx: '-68px', ty: '-40px', rot: '-95deg', color: 'bg-amber-200', size: 'w-1.5 h-1.5 rounded-full', delay: '160ms' },
  { tx: '0px', ty: '98px', rot: '180deg', color: 'bg-yellow-200', size: 'w-2 h-2 rounded-full', delay: '130ms' },
];

const FLOATING_COINS: Array<{
  tx: string;
  ty: string;
  delay: string;
}> = [
  { tx: '-102px', ty: '-72px', delay: '60ms' },
  { tx: '104px', ty: '-68px', delay: '120ms' },
  { tx: '-114px', ty: '34px', delay: '180ms' },
  { tx: '114px', ty: '38px', delay: '90ms' },
  { tx: '-54px', ty: '-106px', delay: '150ms' },
  { tx: '58px', ty: '-104px', delay: '200ms' },
];

export const GameOutcomeOverlay: React.FC<{
  outcome: GameOutcomeEvent | null;
  onDone?: () => void;
}> = ({ outcome, onDone }) => {
  const [displayAmount, setDisplayAmount] = useState(0);
  const [countDone, setCountDone] = useState(false);
  const onDoneRef = React.useRef(onDone);
  onDoneRef.current = onDone;

  const outcomeId = outcome?.id ?? null;
  const outcomeType = outcome?.type ?? null;
  const outcomeAmount = outcome?.amount ?? 0;

  useEffect(() => {
    if (outcomeId === null || !outcomeType) return;
    setCountDone(false);
    const duration = outcomeType === 'win' ? WIN_DURATION_MS : LOSE_DURATION_MS;
    const dismissTimer = window.setTimeout(() => {
      onDoneRef.current?.();
    }, duration);

    let rafId = 0;
    if (outcomeType === 'win' && outcomeAmount > 0) {
      const target = outcomeAmount;
      const start = performance.now();
      const countMs = 820;
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / countMs);
        // Ease-out quart for dramatic, juicy prize count-up
        const eased = 1 - Math.pow(1 - progress, 4);
        setDisplayAmount(Math.round(target * eased * 100) / 100);
        if (progress < 1) {
          rafId = requestAnimationFrame(tick);
        } else {
          setDisplayAmount(target);
          setCountDone(true);
        }
      };
      rafId = requestAnimationFrame(tick);
    } else {
      setDisplayAmount(0);
    }

    return () => {
      window.clearTimeout(dismissTimer);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [outcomeId, outcomeType, outcomeAmount]);

  if (!outcome) return null;

  if (outcome.type === 'win') {
    const mult =
      typeof outcome.betAmount === 'number' && outcome.betAmount > 0
        ? Math.round((outcome.amount / outcome.betAmount) * 100) / 100
        : 0;
    const isMegaWin = mult >= 5;
    const isBigWin = !isMegaWin && mult >= 2.5;
    const headline = isMegaWin ? 'MEGA WIN!' : isBigWin ? 'BIG WIN!' : 'YOU WON!';

    return (
      <div
        key={outcome.id}
        className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4"
        aria-live="polite"
      >
        <div className="relative flex items-center justify-center animate-outcome-win-lifecycle">
          {/* Soft Dark-Gold Radial Backdrop Glow */}
          <div className="absolute w-80 h-80 rounded-full bg-gradient-to-tr from-amber-500/35 via-yellow-300/25 to-emerald-400/30 blur-3xl animate-outcome-glow" />

          {/* Rotating Sunburst Rays */}
          <div
            className="absolute w-72 h-72 rounded-full opacity-55 animate-outcome-sunburst"
            style={{
              background:
                'repeating-conic-gradient(from 0deg, rgba(251,191,36,0.28) 0deg 12deg, transparent 12deg 28deg)',
              maskImage: 'radial-gradient(circle, black 28%, transparent 72%)',
              WebkitMaskImage: 'radial-gradient(circle, black 28%, transparent 72%)',
            }}
          />

          {/* Dual Expanding Pulse Rings */}
          <span className="absolute w-48 h-48 rounded-full border-2 border-amber-300/65 animate-outcome-ring" />
          <span
            className="absolute w-48 h-48 rounded-full border-2 border-emerald-300/50 animate-outcome-ring"
            style={{ animationDelay: '220ms' }}
          />

          {/* Radial Confetti & Gold Sparks */}
          {CONFETTI_PARTICLES.map((p, idx) => (
            <span
              key={idx}
              className={`absolute ${p.size} ${p.color} animate-outcome-confetti`}
              style={
                {
                  '--tx': p.tx,
                  '--ty': p.ty,
                  '--rot': p.rot,
                  animationDelay: p.delay,
                } as React.CSSProperties
              }
            />
          ))}

          {/* Floating Gold Rupee Coins */}
          {FLOATING_COINS.map((c, idx) => (
            <span
              key={`coin-${idx}`}
              className="absolute w-7 h-7 rounded-full bg-gradient-to-br from-yellow-200 via-amber-400 to-orange-500 border border-yellow-100/80 shadow-md shadow-amber-500/40 flex items-center justify-center text-[12px] font-black text-amber-950 animate-outcome-coin"
              style={
                {
                  '--tx': c.tx,
                  '--ty': c.ty,
                  animationDelay: c.delay,
                } as React.CSSProperties
              }
            >
              ₹
            </span>
          ))}

          {/* Celebratory Win Card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#1E2E14]/96 via-[#0F211F]/96 to-[#091523]/96 border-2 border-amber-300/90 shadow-2xl shadow-amber-500/40 px-8 py-6 text-center min-w-[255px] max-w-[330px] backdrop-blur-md">
            {/* Inner Gold Rim Glow */}
            <span className="absolute inset-[2px] rounded-[22px] border border-yellow-200/20 pointer-events-none" />

            {/* Dual Diagonal Shimmer Sweeps */}
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-200/25 to-transparent -translate-x-full animate-outcome-shimmer" />
            <span
              className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-200/20 to-transparent -translate-x-full animate-outcome-shimmer"
              style={{ animationDelay: '950ms' }}
            />

            <div className="relative space-y-2">
              {/* Emblem with orbiting stars */}
              <div className="relative w-14 h-14 mx-auto flex items-center justify-center">
                <Star className="w-3.5 h-3.5 text-yellow-200 fill-yellow-300 absolute -top-1 -left-2 animate-pulse" />
                <Star
                  className="w-3 h-3 text-emerald-200 fill-emerald-300 absolute -bottom-0.5 -right-2 animate-pulse"
                  style={{ animationDelay: '220ms' }}
                />
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-yellow-200 via-amber-400 to-orange-500 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/50 animate-outcome-trophy">
                  {isMegaWin ? <Crown className="w-7 h-7" /> : <Trophy className="w-7 h-7" />}
                </div>
              </div>

              {/* Headline */}
              <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300 flex items-center justify-center gap-1.5 pt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-yellow-200" />
                <span>{headline}</span>
                <Sparkles className="w-3.5 h-3.5 text-yellow-200" />
              </p>

              {/* Animated Prize Amount */}
              <p
                className={`text-4xl sm:text-[42px] leading-none font-black font-mono-num tracking-tight bg-gradient-to-b from-white via-amber-200 to-emerald-300 bg-clip-text text-transparent drop-shadow-[0_2px_12px_rgba(251,191,36,0.45)] transition-transform duration-200 ${
                  countDone ? 'scale-105' : 'scale-100'
                }`}
              >
                +{formatINR(displayAmount)}
              </p>

              {/* Multiplier & Wallet Credit Line */}
              <div className="pt-1 flex items-center justify-center gap-2 text-[11px] font-semibold">
                {mult > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-400/20 border border-amber-300/45 text-amber-200 font-mono-num font-bold">
                    {mult}×
                  </span>
                )}
                <span className="text-emerald-300/95">Added to Wallet</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Exact 1-second "Better Luck Next Time" loss animation
  return (
    <div
      key={outcome.id}
      className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4"
      aria-live="polite"
    >
      <div className="relative animate-outcome-lose-lifecycle">
        <div className="rounded-2xl bg-[#0D162B]/92 border border-rose-400/45 shadow-2xl shadow-black/60 px-6 py-4 text-center backdrop-blur-md min-w-[225px] max-w-[295px]">
          <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-rose-500/18 border border-rose-400/35 text-rose-300 flex items-center justify-center animate-outcome-shake">
            <RotateCcw className="w-5 h-5" />
          </div>
          <p className="text-base sm:text-lg font-extrabold tracking-tight text-white">
            Better Luck Next Time
          </p>
          <p className="text-[11px] text-slate-300 mt-0.5">
            Try again on the next round!
          </p>
        </div>
      </div>
    </div>
  );
};
