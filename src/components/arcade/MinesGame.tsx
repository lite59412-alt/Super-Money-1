import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bomb, ChevronDown, Shuffle, Sparkles, Star } from 'lucide-react';
import { WalletSummary } from '../../types';
import { formatINR } from '../../lib/api';
import { casinoAudio } from '../../lib/casinoAudio';
import { ArcadeShell, arcadePayout, arcadeWager } from './ArcadeShell';
import { BetAmountControl } from './BetAmountControl';

interface MinesGameProps {
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

const TOTAL_TILES = 25;
const MINE_OPTIONS = [1, 2, 3, 5, 7, 10, 15, 20];

function computeMultiplier(minesCount: number, safeRevealed: number): number {
  if (safeRevealed <= 0) return 1.0;
  let prob = 1;
  for (let i = 0; i < safeRevealed; i++) {
    prob *= (TOTAL_TILES - minesCount - i) / (TOTAL_TILES - i);
  }
  const raw = 0.97 / Math.max(0.0001, prob);
  return Math.round(raw * 100) / 100;
}

export const MinesGame: React.FC<MinesGameProps> = ({
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
  const [minesCount, setMinesCount] = useState<number>(3);
  const [bet, setBet] = useState<number>(20);
  const [lockedBet, setLockedBet] = useState<number>(20);
  const [phase, setPhase] = useState<'idle' | 'playing' | 'busted' | 'cashed'>('idle');
  const [mineIndices, setMineIndices] = useState<Set<number>>(new Set());
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [explodedTile, setExplodedTile] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [shakeBoard, setShakeBoard] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('Choose Mines & Bet, then tap Start Game');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const playable = Math.round((wallet.availableBalance + wallet.bonusBalance) * 100) / 100;
  const stripRef = useRef<HTMLDivElement | null>(null);

  // Synchronous concurrency guards eliminate rapid-click races & double payouts
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const phaseRef = useRef<'idle' | 'playing' | 'busted' | 'cashed'>('idle');
  const mineIndicesRef = useRef<Set<number>>(new Set());
  const revealedRef = useRef<Set<number>>(new Set());
  const lockedBetRef = useRef<number>(20);
  const shakeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);
    };
  }, []);

  const safeCount = revealed.size;
  const currentMult = useMemo(
    () => computeMultiplier(minesCount, safeCount),
    [minesCount, safeCount]
  );
  const currentCashout = Math.round(lockedBet * currentMult * 100) / 100;

  // Multiplier strip shows next 6 steps ahead
  const multSteps = useMemo(() => {
    const maxSafe = TOTAL_TILES - minesCount;
    const arr: { step: number; mult: number }[] = [];
    for (let s = 1; s <= Math.min(maxSafe, 14); s++) {
      arr.push({ step: s, mult: computeMultiplier(minesCount, s) });
    }
    return arr;
  }, [minesCount]);

  // Smoothly keep the current active multiplier pill centered in the horizontal strip
  useEffect(() => {
    const container = stripRef.current;
    if (!container || safeCount <= 0) return;
    const activeEl = container.querySelector<HTMLElement>(`[data-step="${safeCount}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [safeCount]);

  const handleStartGame = async () => {
    if (busyRef.current || phaseRef.current === 'playing') return;
    casinoAudio.unlock();
    setErrorMsg(null);
    if (playable < bet) {
      setErrorMsg('Insufficient balance. Please Add Money to continue playing.');
      return;
    }

    busyRef.current = true;
    setBusy(true);
    try {
      const wAfter = await arcadeWager(gameId, gameName, bet);
      if (!mountedRef.current) return;
      onWalletUpdated(wAfter);
    } catch (err) {
      busyRef.current = false;
      if (mountedRef.current) {
        setBusy(false);
        setErrorMsg(err instanceof Error ? err.message : 'Unable to start round.');
      }
      return;
    }

    // Place mines randomly across 25 tiles
    const mines = new Set<number>();
    while (mines.size < minesCount) {
      mines.add(Math.floor(Math.random() * TOTAL_TILES));
    }

    mineIndicesRef.current = mines;
    revealedRef.current = new Set();
    lockedBetRef.current = bet;
    phaseRef.current = 'playing';

    setMineIndices(mines);
    setRevealed(new Set());
    setLockedBet(bet);
    setExplodedTile(null);
    setShakeBoard(false);
    setPhase('playing');
    setStatusMsg('Tap any tile to uncover a Golden Star — Cash Out anytime!');
    casinoAudio.playButtonClick();

    busyRef.current = false;
    setBusy(false);
  };

  const handleTileClick = async (idx: number) => {
    if (phaseRef.current !== 'playing' || busyRef.current || revealedRef.current.has(idx)) return;
    casinoAudio.unlock();

    // Dynamic fairness assist on first click if admin winRatio is high
    const activeMines = new Set(mineIndicesRef.current);
    if (revealedRef.current.size === 0 && activeMines.has(idx) && Math.random() * 100 < winRatio * 0.45) {
      for (let alt = 0; alt < TOTAL_TILES; alt++) {
        if (!activeMines.has(alt) && alt !== idx) {
          activeMines.delete(idx);
          activeMines.add(alt);
          break;
        }
      }
      mineIndicesRef.current = activeMines;
      setMineIndices(activeMines);
    }

    if (activeMines.has(idx)) {
      // BOOM! Mine triggered
      busyRef.current = true;
      phaseRef.current = 'busted';
      setBusy(true);
      setExplodedTile(idx);
      setPhase('busted');
      setShakeBoard(true);
      if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = window.setTimeout(() => {
        if (mountedRef.current) setShakeBoard(false);
      }, 460);

      setStatusMsg('BOOM! You hit a mine. Tap Start Game to try again.');
      casinoAudio.playMineBomb();
      try {
        const w = await arcadePayout(
          gameId,
          gameName,
          lockedBetRef.current,
          0,
          `Hit mine after ${revealedRef.current.size} safe tile(s)`
        );
        if (mountedRef.current) onWalletUpdated(w);
      } catch {
        // ignore
      } finally {
        busyRef.current = false;
        if (mountedRef.current) setBusy(false);
      }
      return;
    }

    // Safe Golden Star!
    const nextRevealed = new Set(revealedRef.current);
    nextRevealed.add(idx);
    revealedRef.current = nextRevealed;
    setRevealed(nextRevealed);
    casinoAudio.playMineSafe(nextRevealed.size);

    const nextMult = computeMultiplier(minesCount, nextRevealed.size);
    const nextWin = Math.round(lockedBetRef.current * nextMult * 100) / 100;
    setStatusMsg(`Safe! Current Payout: ${formatINR(nextWin)} (${nextMult}x)`);

    // Auto-cashout if all safe tiles cleared
    if (nextRevealed.size >= TOTAL_TILES - minesCount) {
      await handleCashout(nextRevealed.size);
    }
  };

  const handleRandomPick = () => {
    if (phaseRef.current !== 'playing' || busyRef.current) return;
    const candidates: number[] = [];
    for (let i = 0; i < TOTAL_TILES; i++) {
      if (!revealedRef.current.has(i)) candidates.push(i);
    }
    if (candidates.length === 0) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    void handleTileClick(pick);
  };

  const handleCashout = async (overrideSafeCount?: number) => {
    const count = overrideSafeCount ?? revealedRef.current.size;
    if (phaseRef.current !== 'playing' || count <= 0 || busyRef.current) return;

    busyRef.current = true;
    phaseRef.current = 'cashed';
    setBusy(true);
    setPhase('cashed');

    const stake = lockedBetRef.current;
    const mult = computeMultiplier(minesCount, count);
    const winAmount = Math.round(stake * mult * 100) / 100;
    casinoAudio.playCashout();
    setStatusMsg(`Cashed out ${formatINR(winAmount)} at ${mult}x!`);

    try {
      const w = await arcadePayout(
        gameId,
        gameName,
        stake,
        winAmount,
        `Mines cashout after ${count} safe star(s) at ${mult}x`
      );
      if (mountedRef.current) onWalletUpdated(w);
    } catch (err) {
      if (mountedRef.current) {
        setErrorMsg(err instanceof Error ? err.message : 'Cashout failed.');
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

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
      <div className="flex-1 flex flex-col justify-between max-w-xl w-full mx-auto px-3 py-2 gap-2.5 overflow-y-auto bg-gradient-to-b from-[#081F44] via-[#061836] to-[#040E22]">
        {/* Top Multiplier Ladder Strip + Mines Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="relative">
              <select
                value={minesCount}
                disabled={phase === 'playing' || busy}
                onChange={(e) => setMinesCount(Number(e.target.value))}
                className="appearance-none bg-[#0D2E63] border border-sky-400/40 rounded-xl pl-3 pr-8 py-1.5 text-xs font-extrabold text-white disabled:opacity-50"
              >
                {MINE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    💣 Mines: {m}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-sky-300 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold">
              <span className="px-2.5 py-1 rounded-xl bg-amber-400/15 border border-amber-400/35 text-amber-300 font-mono-num">
                ★ {safeCount}/{TOTAL_TILES - minesCount}
              </span>
              {phase === 'playing' && (
                <button
                  type="button"
                  onClick={handleRandomPick}
                  disabled={busy}
                  className="px-2.5 py-1 rounded-xl bg-sky-500/20 border border-sky-400/40 text-sky-200 hover:bg-sky-500/30 active:scale-95 flex items-center gap-1 transition"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Random</span>
                </button>
              )}
            </div>
          </div>

          {/* Horizontal Multiplier Progression */}
          <div ref={stripRef} className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {multSteps.map(({ step, mult }) => {
              const achieved = step <= safeCount;
              const isNext = step === safeCount + 1 && phase === 'playing';
              return (
                <div
                  key={step}
                  data-step={step}
                  className={`shrink-0 px-2.5 py-1 rounded-lg border text-center transition-all duration-300 ${
                    achieved
                      ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 scale-105'
                      : isNext
                      ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                      : 'bg-[#0C254E] border-sky-500/20 text-slate-400'
                  }`}
                >
                  <p className="text-[9px] font-bold uppercase opacity-75">Hit {step}</p>
                  <p className="text-xs font-black font-mono-num">{mult.toFixed(2)}x</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5x5 Isometric Blue Jewel Board with True 3D Flip Tiles */}
        <div
          className={`rounded-3xl p-2.5 sm:p-3.5 bg-gradient-to-b from-[#0E3168] to-[#081F44] border border-sky-400/30 shadow-2xl shadow-blue-950/80 ${
            shakeBoard ? 'animate-board-shake' : ''
          }`}
        >
          <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
            {Array.from({ length: TOTAL_TILES }, (_, idx) => {
              const isRevealed = revealed.has(idx);
              const isMine = mineIndices.has(idx);
              const isEndReveal = phase === 'busted' || phase === 'cashed';
              const isFlipped = isRevealed || (isEndReveal && isMine);
              const isExploded = explodedTile === idx;
              const isPassiveMine = isEndReveal && isMine && !isExploded;

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={phase !== 'playing' || isRevealed || busy}
                  onClick={() => void handleTileClick(idx)}
                  className="aspect-square perspective-800 group focus:outline-none disabled:cursor-default"
                >
                  <div
                    className="relative w-full h-full preserve-3d will-change-transform"
                    style={{
                      transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                      transition: `transform 0.42s cubic-bezier(0.22, 1, 0.36, 1) ${
                        isPassiveMine ? `${(idx % 7) * 24}ms` : '0ms'
                      }`,
                    }}
                  >
                    {/* FRONT FACE — Unrevealed Sapphire Jewel Tile */}
                    <div
                      className={`absolute inset-0 backface-hidden rounded-xl sm:rounded-2xl flex items-center justify-center border transition-all duration-150 ${
                        phase === 'playing'
                          ? 'bg-gradient-to-b from-[#2563EB] via-[#1D4ED8] to-[#1E3A8A] border-sky-300/45 shadow-[0_4px_0_#0F2557] group-hover:brightness-110 group-active:translate-y-0.5 cursor-pointer'
                          : 'bg-gradient-to-b from-[#1A3E7A] to-[#112A56] border-sky-400/25 shadow-[0_4px_0_#0A1B3B] opacity-90'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full bg-sky-200/25 shadow-inner" />
                    </div>

                    {/* BACK FACE — Revealed Star or Exploded/Passive Mine */}
                    <div
                      className={`absolute inset-0 backface-hidden rotate-y-180 rounded-xl sm:rounded-2xl flex items-center justify-center border ${
                        isExploded
                          ? 'bg-gradient-to-br from-rose-500 to-red-800 border-rose-300 shadow-lg shadow-rose-600/50'
                          : isMine
                          ? 'bg-rose-950/85 border-rose-500/45 opacity-85'
                          : 'bg-gradient-to-br from-amber-300/30 via-yellow-500/20 to-emerald-500/25 border-amber-300/80 shadow-lg shadow-amber-500/25'
                      }`}
                    >
                      {isMine ? (
                        <Bomb
                          className={`w-6 h-6 sm:w-7 sm:h-7 ${
                            isExploded ? 'text-white scale-110' : 'text-rose-400'
                          }`}
                        />
                      ) : (
                        <Star
                          className={`w-7 h-7 sm:w-8 sm:h-8 text-amber-300 fill-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.9)] ${
                            isRevealed ? 'animate-symbol-win' : ''
                          }`}
                        />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Status Message */}
        <p className="text-center text-xs font-bold text-sky-200/90 px-2">{statusMsg}</p>

        {errorMsg && (
          <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-3 py-2 text-xs text-rose-200 font-semibold text-center">
            {errorMsg}
          </div>
        )}

        {/* Bottom Bet & Action Console */}
        <div className="rounded-2xl bg-[#091A38] border border-sky-400/25 p-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-stretch">
            <div className="sm:col-span-6">
              <BetAmountControl
                value={bet}
                onChange={setBet}
                disabled={phase === 'playing' || busy}
              />
            </div>

            {phase === 'playing' ? (
              <button
                type="button"
                disabled={safeCount === 0 || busy}
                onClick={() => void handleCashout()}
                className="sm:col-span-6 min-h-[70px] rounded-2xl bg-gradient-to-b from-amber-300 via-yellow-500 to-orange-500 hover:brightness-110 active:scale-[0.98] disabled:opacity-45 text-slate-950 font-black flex flex-col items-center justify-center shadow-xl shadow-amber-500/30 transition-all"
              >
                <span className="text-[11px] uppercase tracking-wider font-extrabold opacity-80">
                  {safeCount === 0 ? 'PICK A TILE FIRST' : `CASHOUT (${currentMult}x)`}
                </span>
                <span className="text-xl font-mono-num">
                  {safeCount === 0 ? formatINR(lockedBet) : formatINR(currentCashout)}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleStartGame()}
                className="sm:col-span-6 min-h-[70px] rounded-2xl bg-gradient-to-b from-emerald-400 to-green-600 hover:brightness-110 active:scale-[0.98] disabled:opacity-60 text-slate-950 font-black text-base tracking-wide flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30 transition-all"
              >
                <Sparkles className="w-5 h-5" />
                <span>{busy ? 'STARTING...' : `START GAME · ${formatINR(bet)}`}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </ArcadeShell>
  );
};
