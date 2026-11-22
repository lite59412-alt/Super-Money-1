import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCw, Sparkles, Zap } from 'lucide-react';
import { WalletSummary } from '../../types';
import { formatINR } from '../../lib/api';
import { casinoAudio } from '../../lib/casinoAudio';
import { ArcadeShell, arcadePayout, arcadeWager } from './ArcadeShell';
import { BetAmountControl } from './BetAmountControl';

interface MoneyRollingGameProps {
  gameId: string;
  gameName: string;
  wallet: WalletSummary;
  onlinePlayers: number;
  winRatio: number;
  onBack: () => void;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onWalletUpdated: (w: WalletSummary) => void;
}

type ReelSym = '0' | '1' | '2' | '5' | '10' | '00' | '-';
type MultSym = '2X' | '5X' | '10X' | 'WHEEL' | 'RESPIN';

const MAIN_SYMS: ReelSym[] = ['0', '1', '2', '5', '10', '00', '-'];
const MULT_SYMS: MultSym[] = ['2X', '5X', '10X', 'WHEEL', 'RESPIN'];

const WHEEL_SEGMENTS: { label: string; mult: number; color: string; text: string }[] = [
  { label: '2X', mult: 2, color: '#166534', text: '#fef08a' },
  { label: '5X', mult: 5, color: '#991b1b', text: '#ffffff' },
  { label: '10X', mult: 10, color: '#b45309', text: '#fef9c3' },
  { label: '25X', mult: 25, color: '#1e3a8a', text: '#fde047' },
  { label: '50X', mult: 50, color: '#581c87', text: '#fef08a' },
  { label: '3X', mult: 3, color: '#0f766e', text: '#ffffff' },
  { label: '15X', mult: 15, color: '#be123c', text: '#fef08a' },
  { label: '100X', mult: 100, color: '#ca8a04', text: '#0f172a' },
];

function renderMainToken(sym: ReelSym) {
  if (sym === '-') {
    return <span className="text-3xl font-black text-slate-500/60">—</span>;
  }
  const colorClass =
    sym === '10' || sym === '00'
      ? 'from-amber-200 via-yellow-400 to-amber-600'
      : sym === '5'
      ? 'from-emerald-200 via-emerald-400 to-green-600'
      : 'from-white via-amber-100 to-yellow-400';
  return (
    <span
      className={`text-4xl sm:text-5xl font-black font-mono-num bg-gradient-to-b ${colorClass} bg-clip-text text-transparent drop-shadow-[0_4px_10px_rgba(251,191,36,0.45)]`}
    >
      {sym}
    </span>
  );
}

function renderMultToken(sym: MultSym) {
  if (sym === 'WHEEL') {
    return (
      <div className="flex flex-col items-center">
        <span className="text-xs font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-300 to-yellow-500 text-slate-950 shadow">
          WHEEL
        </span>
        <span className="text-[10px] font-bold text-amber-200 mt-0.5">BONUS</span>
      </div>
    );
  }
  if (sym === 'RESPIN') {
    return (
      <div className="flex flex-col items-center">
        <span className="text-xs font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-950 shadow">
          RE-SPIN
        </span>
        <span className="text-[10px] font-bold text-emerald-200 mt-0.5">FREE</span>
      </div>
    );
  }
  return (
    <span className="text-2xl sm:text-3xl font-black font-mono-num bg-gradient-to-b from-amber-200 via-yellow-400 to-orange-500 bg-clip-text text-transparent drop-shadow-[0_3px_10px_rgba(251,191,36,0.5)]">
      {sym}
    </span>
  );
}

const CELL_H = 112;
const STRIP_LEN = 14;

interface SmoothDrumProps<T extends string> {
  strip: T[];
  spinKey: number;
  durationMs: number;
  isWinner: boolean;
  isMult?: boolean;
  renderToken: (sym: T) => React.ReactNode;
}

function SmoothDrum<T extends string>({
  strip,
  spinKey,
  durationMs,
  isWinner,
  isMult = false,
  renderToken,
}: SmoothDrumProps<T>) {
  const targetY = -((strip.length - 1) * CELL_H);
  return (
    <div
      className={`relative h-[112px] rounded-2xl overflow-hidden flex items-start justify-center border shadow-inner transition-shadow duration-300 ${
        isMult
          ? 'bg-gradient-to-b from-[#332200] via-[#4D3400] to-[#261800] border-amber-400/70'
          : 'bg-gradient-to-b from-[#1A0D0E] via-[#2B1517] to-[#140A0B] border-amber-500/35'
      } ${isWinner ? 'ring-2 ring-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.5)]' : ''}`}
    >
      <motion.div
        key={spinKey}
        initial={{ y: 0 }}
        animate={{ y: targetY }}
        transition={
          spinKey === 0
            ? { duration: 0 }
            : {
                duration: durationMs / 1000,
                ease: [0.14, 0.88, 0.24, 1.03],
              }
        }
        className="w-full flex flex-col items-center will-change-transform"
      >
        {strip.map((sym, idx) => (
          <div
            key={idx}
            style={{ height: CELL_H }}
            className={`w-full shrink-0 flex items-center justify-center ${
              isWinner && idx === strip.length - 1 ? 'animate-symbol-win' : ''
            }`}
          >
            {renderToken(sym)}
          </div>
        ))}
      </motion.div>

      {/* Top/Bottom glossy drum shadow shading */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-black/65 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/65 to-transparent" />
    </div>
  );
}

function buildStrip<T>(prev: T, target: T, pool: T[]): T[] {
  const arr: T[] = [prev];
  for (let i = 1; i < STRIP_LEN - 1; i++) {
    arr.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  arr.push(target);
  return arr;
}

export const MoneyRollingGame: React.FC<MoneyRollingGameProps> = ({
  gameId,
  gameName,
  wallet,
  onlinePlayers,
  winRatio,
  onBack,
  onOpenDeposit,
  onOpenWithdraw,
  onWalletUpdated,
}) => {
  const [bet, setBet] = useState<number>(20);
  const [reelStrips, setReelStrips] = useState<[ReelSym[], ReelSym[], ReelSym[]]>([
    ['5'],
    ['0'],
    ['0'],
  ]);
  const [multStrip, setMultStrip] = useState<MultSym[]>(['2X']);
  const [spinKey, setSpinKey] = useState<number>(0);
  const [spinning, setSpinning] = useState(false);
  const [wheelAngle, setWheelAngle] = useState(0);
  const [turbo, setTurbo] = useState(false);
  const [autoSpin, setAutoSpin] = useState(false);
  const [lastWin, setLastWin] = useState<number>(0);
  const [bannerText, setBannerText] = useState<string>('MATCH NUMBERS + MULTIPLIER TO WIN!');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const playable = Math.round((wallet.availableBalance + wallet.bonusBalance) * 100) / 100;

  // Live refs eliminate stale closures & race conditions completely
  const mountedRef = useRef(true);
  const spinningRef = useRef(false);
  const autoRef = useRef(false);
  const playableRef = useRef(playable);
  playableRef.current = playable;
  const betRef = useRef(bet);
  betRef.current = bet;
  const turboRef = useRef(turbo);
  turboRef.current = turbo;
  const winRatioRef = useRef(winRatio);
  winRatioRef.current = winRatio;
  const wheelAngleRef = useRef(wheelAngle);
  wheelAngleRef.current = wheelAngle;
  const lastReelsRef = useRef<[ReelSym, ReelSym, ReelSym]>(['5', '0', '0']);
  const lastMultRef = useRef<MultSym>('2X');
  const onWalletUpdatedRef = useRef(onWalletUpdated);
  onWalletUpdatedRef.current = onWalletUpdated;
  const timersRef = useRef<number[]>([]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      if (mountedRef.current) fn();
    }, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      autoRef.current = false;
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  useEffect(() => {
    autoRef.current = autoSpin;
  }, [autoSpin]);

  const handleSpinRef = useRef<() => Promise<void>>(async () => {});

  const handleSpin = useCallback(async () => {
    if (spinningRef.current) return;
    casinoAudio.unlock();
    setErrorMsg(null);

    const currentBet = betRef.current;
    if (playableRef.current < currentBet) {
      setErrorMsg('Insufficient balance. Please Add Money to continue playing.');
      setAutoSpin(false);
      autoRef.current = false;
      return;
    }

    spinningRef.current = true;
    setSpinning(true);
    setLastWin(0);
    setBannerText('REELS ROLLING...');

    try {
      const wAfter = await arcadeWager(gameId, gameName, currentBet);
      if (!mountedRef.current) return;
      onWalletUpdatedRef.current(wAfter);
    } catch (err) {
      spinningRef.current = false;
      if (mountedRef.current) {
        setSpinning(false);
        setAutoSpin(false);
        autoRef.current = false;
        setErrorMsg(err instanceof Error ? err.message : 'Bet failed.');
      }
      return;
    }

    casinoAudio.playLeverPull();

    // Determine fair outcome governed by Admin winRatio
    const isWin = Math.random() * 100 < winRatioRef.current;
    let finalReels: [ReelSym, ReelSym, ReelSym];
    let finalMult: MultSym;
    let totalWin = 0;
    let triggerWheel = false;

    if (isWin) {
      const tier = Math.random();
      if (tier > 0.86) {
        finalReels = ['10', '0', '0'];
        finalMult = 'WHEEL';
        triggerWheel = true;
      } else if (tier > 0.62) {
        finalReels = ['5', '0', '-'];
        finalMult = Math.random() > 0.45 ? '5X' : '2X';
        const mVal = finalMult === '5X' ? 5 : 2;
        totalWin = Math.round(currentBet * (1.2 + mVal * 0.45) * 100) / 100;
      } else if (tier > 0.3) {
        finalReels = ['2', '5', '-'];
        finalMult = '2X';
        totalWin = Math.round(currentBet * 2.1 * 100) / 100;
      } else {
        finalReels = ['1', '0', '-'];
        finalMult = 'RESPIN';
        totalWin = Math.round(currentBet * 1.55 * 100) / 100;
      }
    } else {
      finalReels = ['-', '0', '-'];
      finalMult = Math.random() > 0.5 ? '2X' : '5X';
      totalWin = 0;
    }

    // Build smooth vertical strips starting from previous settled symbols
    const prevR = lastReelsRef.current;
    const prevM = lastMultRef.current;
    setReelStrips([
      buildStrip(prevR[0], finalReels[0], MAIN_SYMS),
      buildStrip(prevR[1], finalReels[1], MAIN_SYMS),
      buildStrip(prevR[2], finalReels[2], MAIN_SYMS),
    ]);
    setMultStrip(buildStrip(prevM, finalMult, MULT_SYMS));
    lastReelsRef.current = finalReels;
    lastMultRef.current = finalMult;
    setSpinKey((k) => k + 1);

    const isTurbo = turboRef.current;
    const d0 = isTurbo ? 420 : 760;
    const d1 = isTurbo ? 560 : 980;
    const d2 = isTurbo ? 700 : 1200;
    const d3 = isTurbo ? 840 : 1440;

    schedule(() => casinoAudio.playReelStop(0), d0);
    schedule(() => casinoAudio.playReelStop(1), d1);
    schedule(() => casinoAudio.playReelStop(2), d2);

    schedule(async () => {
      casinoAudio.playReelStop(3);

      let detail = `Reels [${finalReels.join(' ')}] × ${finalMult}`;

      if (triggerWheel) {
        setBannerText('BONUS WHEEL ACTIVATED!');
        const segIdx = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
        const seg = WHEEL_SEGMENTS[segIdx];
        const segArc = 360 / WHEEL_SEGMENTS.length;
        // Align landed segment cleanly under top pointer
        const desiredAngle = 360 - (segIdx * segArc + segArc / 2);
        const curMod = ((wheelAngleRef.current % 360) + 360) % 360;
        const delta = ((desiredAngle - curMod) + 360) % 360;
        const nextAngle = wheelAngleRef.current + 360 * 4 + delta;
        wheelAngleRef.current = nextAngle;
        setWheelAngle(nextAngle);
        casinoAudio.playWheelUnlock();

        await new Promise<void>((resolve) => {
          schedule(resolve, isTurbo ? 950 : 1650);
        });
        if (!mountedRef.current) return;

        totalWin = Math.round(currentBet * Math.min(20, Math.max(3, seg.mult * 0.5)) * 100) / 100;
        detail = `Bonus Wheel landed on ${seg.label}!`;
      }

      if (totalWin > 0) {
        casinoAudio.playWinFanfare();
        setLastWin(totalWin);
        setBannerText(`BIG WIN +${formatINR(totalWin)}!`);
      } else {
        setBannerText('TRY AGAIN — SPIN FOR 100X WHEEL!');
      }

      try {
        const wFinal = await arcadePayout(gameId, gameName, currentBet, totalWin, detail);
        if (mountedRef.current) {
          onWalletUpdatedRef.current(wFinal);
        }
      } catch {
        // ignore network hiccup
      }

      spinningRef.current = false;
      if (!mountedRef.current) return;
      setSpinning(false);

      if (autoRef.current) {
        schedule(() => {
          if (autoRef.current && !spinningRef.current) {
            void handleSpinRef.current();
          }
        }, isTurbo ? 460 : 880);
      }
    }, d3);
  }, [gameId, gameName, schedule]);

  handleSpinRef.current = handleSpin;

  const isTurbo = turbo;
  const dur0 = isTurbo ? 420 : 760;
  const dur1 = isTurbo ? 560 : 980;
  const dur2 = isTurbo ? 700 : 1200;
  const dur3 = isTurbo ? 840 : 1440;
  const isWinGlow = !spinning && lastWin > 0;

  return (
    <ArcadeShell
      gameId={gameId}
      title={gameName}
      wallet={wallet}
      onlinePlayers={onlinePlayers}
      onBack={onBack}
      onOpenDeposit={onOpenDeposit}
      onOpenWithdraw={onOpenWithdraw}
      onWalletUpdated={onWalletUpdated}
    >
      <div className="flex-1 flex flex-col justify-between max-w-xl w-full mx-auto px-3 py-2 gap-2 overflow-y-auto bg-gradient-to-b from-[#2B0C0B] via-[#1B0709] to-[#0B0609]">
        {/* Top Prize Wheel Canopy */}
        <div className="relative flex flex-col items-center pt-1">
          <div className="relative w-64 sm:w-72 h-32 sm:h-36 overflow-hidden flex items-start justify-center">
            {/* Pointer Triangle */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[16px] border-t-amber-300 drop-shadow-[0_2px_6px_rgba(251,191,36,0.9)]" />
            {/* Rotating SVG Prize Wheel */}
            <svg
              viewBox="0 0 240 240"
              className="w-64 sm:w-72 h-64 sm:h-72 drop-shadow-[0_10px_28px_rgba(251,191,36,0.35)] will-change-transform"
              style={{
                transform: `rotate(${wheelAngle}deg)`,
                transition: `transform ${isTurbo ? 0.9 : 1.6}s cubic-bezier(0.14, 0.86, 0.22, 1)`,
              }}
            >
              <circle cx="120" cy="120" r="116" fill="#78350f" stroke="#fbbf24" strokeWidth="6" />
              {WHEEL_SEGMENTS.map((seg, i) => {
                const startA = (i * 360) / WHEEL_SEGMENTS.length - 90;
                const endA = ((i + 1) * 360) / WHEEL_SEGMENTS.length - 90;
                const rad1 = (startA * Math.PI) / 180;
                const rad2 = (endA * Math.PI) / 180;
                const x1 = 120 + 110 * Math.cos(rad1);
                const y1 = 120 + 110 * Math.sin(rad1);
                const x2 = 120 + 110 * Math.cos(rad2);
                const y2 = 120 + 110 * Math.sin(rad2);
                const midA = ((startA + endA) / 2) * (Math.PI / 180);
                const tx = 120 + 76 * Math.cos(midA);
                const ty = 120 + 76 * Math.sin(midA);
                return (
                  <g key={seg.label}>
                    <path
                      d={`M120,120 L${x1},${y1} A110,110 0 0,1 ${x2},${y2} Z`}
                      fill={seg.color}
                      stroke="#fde047"
                      strokeWidth="2"
                    />
                    <text
                      x={tx}
                      y={ty}
                      fill={seg.text}
                      fontSize="13"
                      fontWeight="900"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${(startA + endA) / 2 + 90}, ${tx}, ${ty})`}
                    >
                      {seg.label}
                    </text>
                  </g>
                );
              })}
              <circle cx="120" cy="120" r="26" fill="#0f172a" stroke="#fbbf24" strokeWidth="4" />
            </svg>
          </div>

          {/* Ornate Gold Title Plaque */}
          <div className="-mt-4 z-10 px-6 py-1.5 rounded-full bg-gradient-to-r from-amber-600 via-yellow-400 to-amber-600 border-2 border-yellow-200 shadow-xl shadow-amber-900/60">
            <span className="text-sm sm:text-base font-black tracking-wider text-slate-950 uppercase">
              MONEY ROLLING
            </span>
          </div>
        </div>

        {/* Status / Win Ticker */}
        <div
          className={`rounded-xl px-3 py-1.5 text-center text-xs font-extrabold tracking-wide border transition-colors duration-300 ${
            lastWin > 0
              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
              : 'bg-black/40 border-amber-500/25 text-amber-200'
          }`}
        >
          {bannerText}
        </div>

        {/* 3 Main Smooth Reels + 1 Multiplier Reel Cabinet */}
        <div className="relative rounded-3xl p-3 bg-gradient-to-b from-[#451314] via-[#2C0B0C] to-[#1A0708] border-2 border-amber-400/70 shadow-2xl shadow-amber-950/60">
          {/* Glowing center payline */}
          <div
            className={`pointer-events-none absolute left-2 right-2 top-1/2 -translate-y-1/2 h-[2px] z-20 transition-opacity duration-300 ${
              isWinGlow
                ? 'bg-gradient-to-r from-transparent via-amber-300 to-transparent opacity-100 shadow-[0_0_12px_#fbbf24]'
                : 'bg-gradient-to-r from-transparent via-amber-400/50 to-transparent opacity-60'
            }`}
          />

          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2].map((idx) => (
              <SmoothDrum
                key={idx}
                strip={reelStrips[idx]}
                spinKey={spinKey}
                durationMs={idx === 0 ? dur0 : idx === 1 ? dur1 : dur2}
                isWinner={isWinGlow}
                renderToken={renderMainToken}
              />
            ))}
            <SmoothDrum
              strip={multStrip}
              spinKey={spinKey}
              durationMs={dur3}
              isWinner={isWinGlow}
              isMult
              renderToken={renderMultToken}
            />
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[11px] font-bold text-amber-200/80 px-1">
            <span>REELS 1 · 2 · 3</span>
            <span className="text-amber-300 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> MULTIPLIER REEL
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-3 py-2 text-xs text-rose-200 font-semibold text-center">
            {errorMsg}
          </div>
        )}

        {/* Bottom Slot Control Bar */}
        <div className="rounded-2xl bg-[#140A0C]/95 border border-amber-500/25 p-3 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono-num">
            <span className="text-slate-400">
              WIN <strong className="text-emerald-300 text-sm">{formatINR(lastWin)}</strong>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  casinoAudio.playButtonClick();
                  setTurbo((t) => !t);
                }}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-extrabold flex items-center gap-1 transition ${
                  turbo
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-white/5 text-slate-300 border-white/15'
                }`}
              >
                <Zap className="w-3 h-3" /> TURBO
              </button>
              <button
                type="button"
                onClick={() => {
                  casinoAudio.playButtonClick();
                  setAutoSpin((a) => {
                    const next = !a;
                    autoRef.current = next;
                    if (next && !spinningRef.current) {
                      void handleSpinRef.current();
                    }
                    return next;
                  });
                }}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-extrabold transition ${
                  autoSpin
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-white/5 text-slate-300 border-white/15'
                }`}
              >
                {autoSpin ? 'AUTO ON' : 'AUTO'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-stretch">
            <div className="sm:col-span-7">
              <BetAmountControl value={bet} onChange={setBet} disabled={spinning || autoSpin} />
            </div>
            <button
              type="button"
              onClick={() => void handleSpin()}
              disabled={spinning}
              className="sm:col-span-5 min-h-[68px] rounded-2xl bg-gradient-to-b from-amber-300 via-yellow-500 to-orange-600 hover:brightness-110 active:scale-[0.97] disabled:opacity-60 text-slate-950 font-black text-lg tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-amber-600/35 transition-all"
            >
              <RotateCw className={`w-6 h-6 ${spinning ? 'animate-spin' : ''}`} />
              <span>{spinning ? 'ROLLING' : 'SPIN'}</span>
            </button>
          </div>
        </div>
      </div>
    </ArcadeShell>
  );
};
