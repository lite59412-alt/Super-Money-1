import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, RotateCw, ShoppingBag, Sparkles, Zap } from 'lucide-react';
import { WalletSummary } from '../../types';
import { formatINR } from '../../lib/api';
import { casinoAudio } from '../../lib/casinoAudio';
import { ArcadeShell, arcadePayout, arcadeWager } from './ArcadeShell';
import { BetAmountControl } from './BetAmountControl';

interface HotVolcanoGameProps {
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

interface SlotSym {
  id: string;
  emoji: string;
  label: string;
  mult: number;
  glow: string;
}

const SYMBOLS: SlotSym[] = [
  { id: 'volcano', emoji: '🌋', label: 'SCATTER', mult: 12, glow: 'rgba(249,115,22,0.75)' },
  { id: 'seven', emoji: '7️⃣', label: '777', mult: 8, glow: 'rgba(239,68,68,0.75)' },
  { id: 'bell', emoji: '🔔', label: 'BELL', mult: 5, glow: 'rgba(250,204,21,0.7)' },
  { id: 'melon', emoji: '🍉', label: 'MELON', mult: 3.5, glow: 'rgba(34,197,94,0.6)' },
  { id: 'plum', emoji: '🍇', label: 'GRAPE', mult: 2.5, glow: 'rgba(168,85,247,0.6)' },
  { id: 'lemon', emoji: '🍋', label: 'LEMON', mult: 2.0, glow: 'rgba(253,224,71,0.6)' },
  { id: 'cherry', emoji: '🍒', label: 'CHERRY', mult: 1.6, glow: 'rgba(244,63,94,0.6)' },
];

const INITIAL_COLS: [SlotSym[], SlotSym[], SlotSym[]] = [
  [SYMBOLS[1], SYMBOLS[0], SYMBOLS[2]],
  [SYMBOLS[2], SYMBOLS[0], SYMBOLS[3]],
  [SYMBOLS[6], SYMBOLS[0], SYMBOLS[4]],
];

const ROW_H = 82;
const STRIP_ROWS = 15; // 12 random passing rows + 3 final visible rows

function randomSym(excludeScatter = false): SlotSym {
  const pool = excludeScatter ? SYMBOLS.slice(1) : SYMBOLS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildColumnStrip(prev3: SlotSym[], next3: SlotSym[]): SlotSym[] {
  const arr: SlotSym[] = [...prev3];
  for (let i = 0; i < STRIP_ROWS - 6; i++) {
    arr.push(randomSym(false));
  }
  arr.push(...next3);
  return arr;
}

interface SmoothVolcanoColumnProps {
  strip: SlotSym[];
  spinKey: number;
  durationMs: number;
  winRows: number[];
  anticipation: boolean;
  settled: boolean;
}

const SmoothVolcanoColumn: React.FC<SmoothVolcanoColumnProps> = ({
  strip,
  spinKey,
  durationMs,
  winRows,
  anticipation,
  settled,
}) => {
  const targetY = -((strip.length - 3) * ROW_H);
  const finalStartIdx = strip.length - 3;

  return (
    <div
      style={{ height: ROW_H * 3 }}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#2A0E0C] via-[#1D0908] to-[#120505] border shadow-inner transition-all duration-300 ${
        anticipation
          ? 'border-orange-400 shadow-[0_0_24px_rgba(249,115,22,0.6)]'
          : 'border-amber-500/30'
      }`}
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
                ease: [0.13, 0.88, 0.22, 1.03],
              }
        }
        className="w-full flex flex-col will-change-transform"
      >
        {strip.map((sym, idx) => {
          const rowIndex = idx - finalStartIdx;
          const isWinCell = settled && rowIndex >= 0 && winRows.includes(rowIndex);
          return (
            <div
              key={idx}
              style={{ height: ROW_H }}
              className={`w-full shrink-0 flex flex-col items-center justify-center border-b border-amber-500/10 transition-colors duration-300 ${
                isWinCell ? 'bg-gradient-to-b from-amber-500/35 to-orange-700/35' : ''
              }`}
            >
              <span
                className={`text-4xl sm:text-[42px] leading-none select-none ${
                  isWinCell ? 'animate-symbol-win' : ''
                }`}
                style={{
                  filter: isWinCell ? `drop-shadow(0 0 14px ${sym.glow})` : undefined,
                }}
              >
                {sym.emoji}
              </span>
              {sym.id === 'volcano' && (
                <span className="mt-1 px-1.5 py-0.5 rounded bg-orange-500 text-[9px] font-black text-slate-950 leading-none">
                  FREE
                </span>
              )}
            </div>
          );
        })}
      </motion.div>

      {/* Top/Bottom curved reel lighting */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/70 to-transparent" />
    </div>
  );
};

export const HotVolcanoGame: React.FC<HotVolcanoGameProps> = ({
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
  const [colStrips, setColStrips] = useState<[SlotSym[], SlotSym[], SlotSym[]]>(INITIAL_COLS);
  const [spinKey, setSpinKey] = useState<number>(0);
  const [spinning, setSpinning] = useState(false);
  const [winRows, setWinRows] = useState<number[]>([]);
  const [anticipationCol2, setAnticipationCol2] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [freeSpinsLeft, setFreeSpinsLeft] = useState(0);
  const [turbo, setTurbo] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [headline, setHeadline] = useState('LAND 3 VOLCANOES FOR 10 FREE SPINS!');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const playable = Math.round((wallet.availableBalance + wallet.bonusBalance) * 100) / 100;
  const bonusBuyCost = Math.round(bet * 25 * 100) / 100;

  // Live refs prevent stale closures & double-charge race conditions
  const mountedRef = useRef(true);
  const spinningRef = useRef(false);
  const autoRef = useRef(false);
  const freeRef = useRef(0);
  const playableRef = useRef(playable);
  playableRef.current = playable;
  const betRef = useRef(bet);
  betRef.current = bet;
  const turboRef = useRef(turbo);
  turboRef.current = turbo;
  const winRatioRef = useRef(winRatio);
  winRatioRef.current = winRatio;
  const lastColsRef = useRef<[SlotSym[], SlotSym[], SlotSym[]]>(INITIAL_COLS);
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
    autoRef.current = autoplay;
  }, [autoplay]);

  const triggerSpinRef = useRef<(forceScatter?: boolean, alreadyPaid?: boolean) => Promise<void>>(
    async () => {}
  );

  const triggerSpin = useCallback(
    async (forceScatter = false, alreadyPaid = false) => {
      if (spinningRef.current && !alreadyPaid) return;
      casinoAudio.unlock();
      setErrorMsg(null);

      const currentBet = betRef.current;
      const usingFreeSpin = !alreadyPaid && freeRef.current > 0;
      const cost = alreadyPaid || usingFreeSpin ? 0 : currentBet;

      if (cost > 0 && playableRef.current < cost) {
        setErrorMsg('Insufficient balance. Please Add Money to continue playing.');
        setAutoplay(false);
        autoRef.current = false;
        return;
      }

      spinningRef.current = true;
      setSpinning(true);
      setWinRows([]);
      setAnticipationCol2(false);
      setLastWin(0);

      if (usingFreeSpin) {
        freeRef.current = Math.max(0, freeRef.current - 1);
        setFreeSpinsLeft(freeRef.current);
        setHeadline(`🔥 FREE SPIN ACTIVE (${freeRef.current} left) — 2X MULTIPLIER!`);
      } else if (alreadyPaid) {
        setHeadline('🌋 BONUS BUY ERUPTING...');
      } else {
        setHeadline('VOLCANO ERUPTING...');
      }

      if (cost > 0) {
        try {
          const wAfter = await arcadeWager(gameId, gameName, cost);
          if (!mountedRef.current) return;
          onWalletUpdatedRef.current(wAfter);
        } catch (err) {
          spinningRef.current = false;
          if (mountedRef.current) {
            setSpinning(false);
            setAutoplay(false);
            autoRef.current = false;
            setErrorMsg(err instanceof Error ? err.message : 'Spin failed.');
          }
          return;
        }
      }

      casinoAudio.playLeverPull();

      const effectiveRatio = usingFreeSpin
        ? Math.min(82, winRatioRef.current + 18)
        : winRatioRef.current;
      const isWin = forceScatter || Math.random() * 100 < effectiveRatio;

      // Build final 3x3 grid (rows 0, 1, 2 x cols 0, 1, 2)
      const grid: SlotSym[][] = [
        [randomSym(true), randomSym(true), randomSym(true)],
        [randomSym(true), randomSym(true), randomSym(true)],
        [randomSym(true), randomSym(true), randomSym(true)],
      ];

      if (forceScatter || (isWin && !usingFreeSpin && Math.random() < 0.14)) {
        grid[1][0] = SYMBOLS[0];
        grid[1][1] = SYMBOLS[0];
        grid[1][2] = SYMBOLS[0];
      } else if (isWin) {
        const winRow = Math.floor(Math.random() * 3);
        const symPool = SYMBOLS.slice(1);
        const chosen = symPool[Math.floor(Math.random() * symPool.length)];
        grid[winRow] = [chosen, chosen, chosen];
        // Avoid accidental extra wins on non-win rows unless lucky double
        for (let r = 0; r < 3; r++) {
          if (r !== winRow && grid[r][0].id === grid[r][1].id && grid[r][1].id === grid[r][2].id) {
            grid[r][2] = SYMBOLS[(SYMBOLS.indexOf(grid[r][2]) + 1) % (SYMBOLS.length - 1) + 1];
          }
        }
      } else {
        for (let r = 0; r < 3; r++) {
          if (grid[r][0].id === grid[r][1].id && grid[r][1].id === grid[r][2].id) {
            grid[r][2] = SYMBOLS[(SYMBOLS.indexOf(grid[r][2]) + 1) % (SYMBOLS.length - 1) + 1];
          }
        }
      }

      const nextCols: [SlotSym[], SlotSym[], SlotSym[]] = [
        [grid[0][0], grid[1][0], grid[2][0]],
        [grid[0][1], grid[1][1], grid[2][1]],
        [grid[0][2], grid[1][2], grid[2][2]],
      ];

      // Check scatter anticipation on col 3 if cols 1 & 2 both carry a volcano scatter
      const hasScatterCol0 = nextCols[0].some((s) => s.id === 'volcano');
      const hasScatterCol1 = nextCols[1].some((s) => s.id === 'volcano');
      const triggerAnticipation = hasScatterCol0 && hasScatterCol1;

      const prev = lastColsRef.current;
      setColStrips([
        buildColumnStrip(prev[0], nextCols[0]),
        buildColumnStrip(prev[1], nextCols[1]),
        buildColumnStrip(prev[2], nextCols[2]),
      ]);
      lastColsRef.current = nextCols;
      setSpinKey((k) => k + 1);

      const isTurbo = turboRef.current;
      const d0 = isTurbo ? 420 : 760;
      const d1 = isTurbo ? 580 : 1020;
      const d2 = triggerAnticipation ? (isTurbo ? 880 : 1520) : isTurbo ? 740 : 1280;

      schedule(() => casinoAudio.playReelStop(0), d0);
      schedule(() => {
        casinoAudio.playReelStop(1);
        if (triggerAnticipation) {
          setAnticipationCol2(true);
          setHeadline('🔥 2 VOLCANOES! WATCH REEL 3...');
        }
      }, d1);

      schedule(async () => {
        casinoAudio.playReelStop(2);
        setAnticipationCol2(false);

        const matchedRows: number[] = [];
        let totalMult = 0;
        let scatterCount = 0;

        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            if (grid[r][c].id === 'volcano') scatterCount++;
          }
          if (grid[r][0].id === grid[r][1].id && grid[r][1].id === grid[r][2].id) {
            matchedRows.push(r);
            totalMult += grid[r][0].mult;
          }
        }

        if (scatterCount >= 3) {
          freeRef.current += 10;
          setFreeSpinsLeft(freeRef.current);
          casinoAudio.playVolcanoErupt();
        }

        const freeMult = usingFreeSpin ? 2 : 1;
        const winAmount =
          totalMult > 0 ? Math.round(currentBet * totalMult * 0.55 * freeMult * 100) / 100 : 0;

        setWinRows(matchedRows);
        setLastWin(winAmount);

        if (scatterCount >= 3) {
          setHeadline(`🌋 10 FREE SPINS TRIGGERED! +${formatINR(winAmount)}`);
        } else if (winAmount > 0) {
          casinoAudio.playWinFanfare();
          setHeadline(`🔥 ERUPTION WIN +${formatINR(winAmount)}!`);
        } else {
          setHeadline('SPIN AGAIN FOR LAVA JACKPOT!');
        }

        const recordedBet = alreadyPaid ? Math.round(currentBet * 25 * 100) / 100 : cost;
        try {
          const wFinal = await arcadePayout(
            gameId,
            gameName,
            recordedBet,
            winAmount,
            winAmount > 0
              ? `Hot Volcano matched ${matchedRows.length} line(s) for ${formatINR(winAmount)}`
              : 'Hot Volcano spin'
          );
          if (mountedRef.current) {
            onWalletUpdatedRef.current(wFinal);
          }
        } catch {
          // silent fallback
        }

        spinningRef.current = false;
        if (!mountedRef.current) return;
        setSpinning(false);

        if (autoRef.current || freeRef.current > 0) {
          schedule(() => {
            if ((autoRef.current || freeRef.current > 0) && !spinningRef.current) {
              void triggerSpinRef.current(false, false);
            }
          }, isTurbo ? 460 : 840);
        }
      }, d2);
    },
    [gameId, gameName, schedule]
  );

  triggerSpinRef.current = triggerSpin;

  const handleBonusBuy = async () => {
    if (spinningRef.current) return;
    casinoAudio.unlock();
    setErrorMsg(null);

    const buyCost = Math.round(betRef.current * 25 * 100) / 100;
    if (playableRef.current < buyCost) {
      setErrorMsg(`Bonus Buy needs ${formatINR(buyCost)}. Lower bet or Add Money.`);
      return;
    }

    spinningRef.current = true;
    setSpinning(true);
    try {
      const wAfter = await arcadeWager(gameId, `${gameName} Bonus Buy`, buyCost);
      if (!mountedRef.current) return;
      onWalletUpdatedRef.current(wAfter);
    } catch (err) {
      spinningRef.current = false;
      if (mountedRef.current) {
        setSpinning(false);
        setErrorMsg(err instanceof Error ? err.message : 'Bonus Buy failed.');
      }
      return;
    }

    // Pass alreadyPaid=true so triggerSpin does NOT charge bet a second time
    await triggerSpinRef.current(true, true);
  };

  const isTurbo = turbo;
  const dur0 = isTurbo ? 420 : 760;
  const dur1 = isTurbo ? 580 : 1020;
  const dur2 = anticipationCol2 ? (isTurbo ? 880 : 1520) : isTurbo ? 740 : 1280;

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
      <div className="flex-1 flex flex-col justify-between max-w-xl w-full mx-auto px-3 py-2 gap-2 overflow-y-auto bg-gradient-to-b from-[#330907] via-[#1C0606] to-[#0C0406]">
        {/* Volcano Header & Free Spins Badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 via-red-600 to-rose-800 flex items-center justify-center shadow-lg shadow-orange-600/40 border border-amber-300/60">
              <Flame className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight bg-gradient-to-r from-amber-200 via-orange-400 to-red-400 bg-clip-text text-transparent">
                HOT VOLCANO 3×3
              </h2>
              <p className="text-[11px] font-bold text-amber-200/80">
                5 Paylines · Up to 2,500× Jackpot
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleBonusBuy()}
            disabled={spinning || freeSpinsLeft > 0}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-red-600 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg shadow-orange-600/35 hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>BUY {formatINR(bonusBuyCost)}</span>
          </button>
        </div>

        {/* Dynamic Status / Free Spins Strip */}
        <div
          className={`rounded-xl px-3 py-1.5 text-center text-xs font-extrabold tracking-wide border transition-colors duration-300 ${
            freeSpinsLeft > 0
              ? 'bg-orange-500/25 border-orange-400 text-amber-200'
              : lastWin > 0
              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
              : 'bg-black/45 border-orange-500/30 text-amber-200'
          }`}
        >
          {headline}
        </div>

        {/* 3x3 Fiery Cascading Slot Cabinet */}
        <div className="relative rounded-3xl p-2.5 sm:p-3 bg-gradient-to-b from-[#57120B] via-[#310A07] to-[#1A0505] border-2 border-amber-500/70 shadow-2xl shadow-orange-950/70">
          {/* Glowing Lava Side Gems */}
          <div className="pointer-events-none absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-24 rounded-full bg-gradient-to-b from-amber-300 via-orange-500 to-red-600 blur-[1px]" />
          <div className="pointer-events-none absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-24 rounded-full bg-gradient-to-b from-amber-300 via-orange-500 to-red-600 blur-[1px]" />

          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((cIdx) => (
              <SmoothVolcanoColumn
                key={cIdx}
                strip={colStrips[cIdx]}
                spinKey={spinKey}
                durationMs={cIdx === 0 ? dur0 : cIdx === 1 ? dur1 : dur2}
                winRows={winRows}
                anticipation={cIdx === 2 && anticipationCol2}
                settled={!spinning}
              />
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-amber-200/80 px-1">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              {freeSpinsLeft > 0 ? `FREE SPINS: ${freeSpinsLeft}` : '3× 🌋 = 10 FREE SPINS'}
            </span>
            <span className="font-mono-num text-emerald-300">WIN {formatINR(lastWin)}</span>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-3 py-2 text-xs text-rose-200 font-semibold text-center">
            {errorMsg}
          </div>
        )}

        {/* Controls */}
        <div className="rounded-2xl bg-[#160808]/95 border border-orange-500/25 p-3 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-400">
              BET <strong className="text-amber-300 font-mono-num">{formatINR(bet)}</strong>
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
                  setAutoplay((a) => {
                    const next = !a;
                    autoRef.current = next;
                    if (next && !spinningRef.current) {
                      void triggerSpinRef.current(false, false);
                    }
                    return next;
                  });
                }}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-extrabold transition ${
                  autoplay
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-white/5 text-slate-300 border-white/15'
                }`}
              >
                {autoplay ? 'AUTO ON' : 'AUTO'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-stretch">
            <div className="sm:col-span-7">
              <BetAmountControl
                value={bet}
                onChange={setBet}
                disabled={spinning || autoplay || freeSpinsLeft > 0}
              />
            </div>
            <button
              type="button"
              onClick={() => void triggerSpin(false, false)}
              disabled={spinning}
              className="sm:col-span-5 min-h-[68px] rounded-2xl bg-gradient-to-b from-amber-300 via-orange-500 to-red-600 hover:brightness-110 active:scale-[0.97] disabled:opacity-60 text-slate-950 font-black text-lg tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-orange-600/35 transition-all"
            >
              <RotateCw className={`w-6 h-6 ${spinning ? 'animate-spin' : ''}`} />
              <span>{freeSpinsLeft > 0 ? `FREE (${freeSpinsLeft})` : spinning ? 'SPINNING' : 'SPIN'}</span>
            </button>
          </div>
        </div>
      </div>
    </ArcadeShell>
  );
};
