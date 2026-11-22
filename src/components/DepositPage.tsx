import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  History,
  Info,
  QrCode,
  ShieldCheck,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { registerBackHandler } from '../lib/androidBridge';
import {
  db,
  formatINR,
  getDepositOffersFirestore,
  submitDepositRequestFirestore,
} from '../lib/api';
import type {
  AdminDepositPaymentMethod,
  DepositPaymentMethod,
  DepositRecord,
  DepositTier,
  MerchantPaymentConfig,
  WalletSummary,
} from '../types';

interface DepositPageProps {
  wallet: WalletSummary;
  onBack: () => void;
  onOpenHistory: () => void;
  onOpenLegal: () => void;
  onSuccess: () => void;
}

type DepositStep = 'amount' | 'method' | 'pay' | 'utr' | 'submitted';

const PAYMENT_METHODS: Array<{
  id: DepositPaymentMethod;
  title: string;
  subtitle: string;
  accentBg: string;
  badgeText: string;
  schemePrefix: string;
}> = [
  {
    id: 'PhonePe',
    title: 'PhonePe',
    subtitle: 'Pay via PhonePe UPI & submit UTR',
    accentBg: 'from-[#5F259F] to-[#431875]',
    badgeText: 'Pe',
    schemePrefix: 'phonepe://pay',
  },
  {
    id: 'GPay',
    title: 'Google Pay (GPay)',
    subtitle: 'Instant GPay UPI transfer & UTR',
    accentBg: 'from-[#1A73E8] to-[#1557B0]',
    badgeText: 'G',
    schemePrefix: 'tez://upi/pay',
  },
  {
    id: 'Paytm',
    title: 'Paytm UPI',
    subtitle: 'Paytm Wallet / UPI ID transfer',
    accentBg: 'from-[#00BAF2] to-[#0077B6]',
    badgeText: 'P',
    schemePrefix: 'paytmmp://pay',
  },
  {
    id: 'UPI QR',
    title: 'Scan QR Code',
    subtitle: 'Scan QR with any Indian UPI app',
    accentBg: 'from-[#2563EB] to-[#0284C7]',
    badgeText: 'QR',
    schemePrefix: 'upi://pay',
  },
];

const UtrSuccessAnimation: React.FC<{ variant: 'submitted' | 'approved' }> = ({ variant }) => {
  const isApproved = variant === 'approved';
  const strokePrimary = isApproved ? '#34D399' : '#38BDF8';
  const strokeSecondary = isApproved ? '#10B981' : '#3B82F6';
  const sparkColor = isApproved ? 'bg-emerald-300' : 'bg-sky-300';
  const haloClass = isApproved
    ? 'border-emerald-400/50 bg-emerald-500/10'
    : 'border-sky-400/50 bg-blue-500/12';

  const sparks: Array<{ tx: string; ty: string; size: string }> = [
    { tx: '0px', ty: '-38px', size: 'w-2 h-2' },
    { tx: '33px', ty: '-19px', size: 'w-1.5 h-1.5' },
    { tx: '33px', ty: '19px', size: 'w-2 h-2' },
    { tx: '0px', ty: '38px', size: 'w-1.5 h-1.5' },
    { tx: '-33px', ty: '19px', size: 'w-2 h-2' },
    { tx: '-33px', ty: '-19px', size: 'w-1.5 h-1.5' },
  ];

  return (
    <div
      key={variant}
      className="relative w-24 h-24 mx-auto flex items-center justify-center select-none"
      aria-hidden="true"
    >
      {/* Expanding subtle sonar halo */}
      <span
        className={`absolute inset-2 rounded-full border-2 animate-lottie-ripple ${haloClass}`}
      />

      {/* Radial Lottie-style spark dots */}
      {sparks.map((sp, i) => (
        <span
          key={i}
          className={`absolute rounded-full ${sp.size} ${sparkColor} animate-lottie-spark`}
          style={
            {
              '--tx': sp.tx,
              '--ty': sp.ty,
            } as React.CSSProperties
          }
        />
      ))}

      {/* Vector ring + checkmark */}
      <div
        className={`relative w-20 h-20 rounded-full flex items-center justify-center animate-lottie-pop shadow-lg ${
          isApproved
            ? 'bg-emerald-500/15 shadow-emerald-500/20'
            : 'bg-blue-500/15 shadow-sky-500/25'
        }`}
      >
        <svg viewBox="0 0 88 88" className="w-20 h-20 overflow-visible">
          <defs>
            <linearGradient id={`utr-grad-${variant}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={strokePrimary} />
              <stop offset="100%" stopColor={strokeSecondary} />
            </linearGradient>
          </defs>
          {/* Faint track ring */}
          <circle
            cx="44"
            cy="44"
            r="36"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-blue-900/60"
          />
          {/* Animated drawn ring */}
          <circle
            cx="44"
            cy="44"
            r="36"
            fill="none"
            stroke={`url(#utr-grad-${variant})`}
            strokeWidth="4"
            strokeLinecap="round"
            transform="rotate(-90 44 44)"
            className="animate-lottie-ring"
          />
          {/* Animated drawn checkmark */}
          <path
            d="M29 45.5L39.5 55.5L60 34"
            fill="none"
            stroke={strokePrimary}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-lottie-check"
          />
        </svg>
      </div>
    </div>
  );
};

export const DepositPage: React.FC<DepositPageProps> = ({
  wallet,
  onBack,
  onOpenHistory,
  onOpenLegal,
  onSuccess,
}) => {
  const [step, setStep] = useState<DepositStep>('amount');
  const [tiers, setTiers] = useState<DepositTier[]>([]);
  const [isFirstOffer, setIsFirstOffer] = useState(true);
  const [merchantConfig, setMerchantConfig] = useState<MerchantPaymentConfig>({
    upiId: 'gamereward.pay@okaxis',
    merchantName: 'GameReward Official',
    qrImageDataUrl: null,
    instructions: '',
    updatedAt: '',
  });
  const [depositAccounts, setDepositAccounts] = useState<AdminDepositPaymentMethod[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  const [amountInput, setAmountInput] = useState<string>('300');
  const [paymentMethod, setPaymentMethod] = useState<DepositPaymentMethod>('PhonePe');
  const [utrNumber, setUtrNumber] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedUpi, setCopiedUpi] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submittedDeposit, setSubmittedDeposit] = useState<DepositRecord | null>(null);
  const [liveBalance, setLiveBalance] = useState<number>(wallet.availableBalance);

  useEffect(() => {
    setLiveBalance(wallet.availableBalance);
  }, [wallet.availableBalance]);

  // Real-time Firestore listener on the submitted deposit transaction so Admin approval reflects instantly
  useEffect(() => {
    if (step !== 'submitted' || !submittedDeposit || submittedDeposit.status !== 'Pending') {
      return;
    }
    const txRef = doc(db, 'transactions', submittedDeposit.id);
    const unsub = onSnapshot(
      txRef,
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data() as Record<string, unknown>;
        const rawStatus = String(d.status || 'pending');
        if (rawStatus !== 'pending') {
          const mappedStatus =
            rawStatus === 'approved' ? 'Successful' : 'Failed';
          setSubmittedDeposit((prev) =>
            prev
              ? {
                  ...prev,
                  status: mappedStatus,
                  creditedAmount:
                    typeof d.creditedAmount === 'number' ? d.creditedAmount : prev.amount,
                  failureReason:
                    typeof d.rejectionReason === 'string'
                      ? d.rejectionReason
                      : typeof d.failureReason === 'string'
                      ? d.failureReason
                      : undefined,
                }
              : prev
          );
          onSuccess();
        }
      },
      () => {
        // ignore transient listener errors
      }
    );
    return () => unsub();
  }, [step, submittedDeposit?.id, submittedDeposit?.status, onSuccess]);

  const loadOffers = async () => {
    try {
      const res = await getDepositOffersFirestore();
      setIsFirstOffer(res.isFirstDepositOffer);
      setTiers(res.tiers);
      if (res.merchantPaymentConfig) {
        setMerchantConfig(res.merchantPaymentConfig);
      }
      if (Array.isArray(res.depositPaymentMethods) && res.depositPaymentMethods.length > 0) {
        setDepositAccounts(res.depositPaymentMethods);
        const primary =
          res.depositPaymentMethods.find((m) => m.isPrimary) || res.depositPaymentMethods[0];
        setSelectedAccountId((prev) =>
          res.depositPaymentMethods!.some((m) => m.id === prev) ? prev : primary.id
        );
      }
    } catch {
      // fallback defaults remain active
    }
  };

  useEffect(() => {
    loadOffers();
  }, []);

  const numericAmount = useMemo(() => {
    const parsed = Math.round(Number(amountInput));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [amountInput]);

  const bonusSummary = useMemo(() => {
    if (tiers.length === 0 || numericAmount < 100) {
      return { bonusPercent: 0, bonusAmount: 0, totalValue: numericAmount };
    }
    const exact = tiers.find((t) => t.amount === numericAmount);
    if (exact) {
      return {
        bonusPercent: exact.bonusPercent,
        bonusAmount: exact.bonusAmount,
        totalValue: exact.totalValue,
      };
    }
    const sorted = [...tiers].sort((a, b) => b.amount - a.amount);
    const matched = sorted.find((t) => numericAmount >= t.amount) || tiers[0];
    const bonusAmount = Math.round((numericAmount * matched.bonusPercent) / 100);
    return {
      bonusPercent: matched.bonusPercent,
      bonusAmount,
      totalValue: numericAmount + bonusAmount,
    };
  }, [tiers, numericAmount]);

  const activePayee = useMemo(() => {
    const selected = depositAccounts.find((m) => m.id === selectedAccountId) || depositAccounts[0];
    if (selected) {
      return {
        label: selected.label,
        upiId: selected.upiId,
        merchantName: selected.merchantName,
        qrImageDataUrl: selected.qrImageDataUrl ?? null,
        instructions: selected.instructions || '',
      };
    }
    return {
      label: 'Primary UPI & QR',
      upiId: merchantConfig.upiId,
      merchantName: merchantConfig.merchantName,
      qrImageDataUrl: merchantConfig.qrImageDataUrl ?? null,
      instructions: merchantConfig.instructions || '',
    };
  }, [depositAccounts, selectedAccountId, merchantConfig]);

  const upiUri = useMemo(() => {
    const pa = encodeURIComponent(activePayee.upiId);
    const pn = encodeURIComponent(activePayee.merchantName);
    const am = numericAmount > 0 ? numericAmount.toFixed(2) : '300.00';
    const tn = encodeURIComponent(`GameReward Deposit ${numericAmount}`);
    return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
  }, [activePayee.upiId, activePayee.merchantName, numericAmount]);

  // Generate crisp ISO-standard scannable UPI QR code whenever amount or merchant UPI changes
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(upiUri, {
      width: 240,
      margin: 2,
      color: {
        dark: '#071126',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [upiUri]);

  const displayQrSrc = activePayee.qrImageDataUrl || qrDataUrl;

  const handleCopyUpi = () => {
    navigator.clipboard?.writeText(activePayee.upiId).catch(() => {});
    setCopiedUpi(true);
    window.setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleContinueFromAmount = () => {
    setError('');
    if (numericAmount < 100 || numericAmount > 50000) {
      setError('Please enter a valid deposit amount between ₹100 and ₹50,000.');
      return;
    }
    setStep('method');
  };

  const handleSubmitUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleaned = utrNumber.trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9]{8,28}$/.test(cleaned)) {
      setError('Enter your valid 12-digit UTR / Transaction ID (8–28 letters or digits).');
      return;
    }

    setLoading(true);
    try {
      const res = await submitDepositRequestFirestore({
        amount: numericAmount,
        paymentMethod,
        utrNumber: cleaned,
        upiId: activePayee.upiId,
      });
      setSubmittedDeposit(res.deposit);
      setStep('submitted');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit payment request.');
    } finally {
      setLoading(false);
    }
  };

  const handleHeaderBack = () => {
    setError('');
    if (step === 'utr') {
      setStep('pay');
    } else if (step === 'pay') {
      setStep('method');
    } else if (step === 'method') {
      setStep('amount');
    } else {
      onBack();
    }
  };

  const backFnRef = React.useRef(handleHeaderBack);
  backFnRef.current = handleHeaderBack;

  useEffect(() => {
    return registerBackHandler(() => {
      backFnRef.current();
      return true;
    });
  }, []);

  const stepIndex = step === 'amount' ? 1 : step === 'method' ? 2 : step === 'pay' ? 3 : 4;

  return (
    <div className="min-h-screen bg-[#071126] text-slate-100 flex flex-col">
      {/* Compact Sticky Top Header with Android Status-Bar Safe Area */}
      <header className="sticky top-0 z-30 pt-safe-top bg-[#0A1630]/95 backdrop-blur-md border-b border-blue-900/50 px-4">
        <div className="h-14 flex items-center justify-between">
        <button
          type="button"
          onClick={handleHeaderBack}
          aria-label="Go back"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[#13264F] text-slate-200"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-white whitespace-nowrap">Add Money</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenLegal}
            aria-label="Deposit rules"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[#13264F] text-sky-300"
          >
            <Info className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onOpenHistory}
            aria-label="Deposit history"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[#13264F] text-sky-300"
          >
            <History className="w-5 h-5" />
          </button>
        </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 pt-4 pb-36 space-y-5">
        {/* Cash Balance Clean Blue Summary Card */}
        <section className="rounded-2xl bg-gradient-to-br from-[#1D4ED8] via-[#1E40AF] to-[#132761] border border-sky-400/35 p-4 sm:p-5 text-white shadow-xl shadow-blue-950/60 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-sky-200">
              Available Cash Balance
            </p>
            <p className="text-3xl font-extrabold font-mono-num mt-0.5 text-white">
              {formatINR(liveBalance)}
            </p>
            <p className="text-xs font-semibold mt-1 text-blue-100/90">
              Bonus Balance:{' '}
              <span className="font-mono-num text-sky-200">{formatINR(wallet.bonusBalance)}</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/12 border border-sky-300/30 flex items-center justify-center shrink-0">
            <Wallet className="w-6 h-6 text-sky-200" />
          </div>
        </section>

        {/* Clean 4-Step Progress Bar */}
        {step !== 'submitted' && (
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { idx: 1, label: '1. Amount' },
              { idx: 2, label: '2. Method' },
              { idx: 3, label: '3. Pay' },
              { idx: 4, label: '4. Txn ID' },
            ].map((item) => {
              const active = stepIndex === item.idx;
              const done = stepIndex > item.idx;
              return (
                <div
                  key={item.idx}
                  className={`rounded-xl px-2 py-2 text-center text-[11px] sm:text-xs font-bold border transition-colors ${
                    active
                      ? 'bg-blue-600/25 border-blue-400 text-white'
                      : done
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-[#0D1B38] border-blue-900/50 text-slate-400'
                  }`}
                >
                  {item.label}
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-4 py-3 text-sm text-rose-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 1: ENTER CUSTOM AMOUNT OR PICK DEPOSIT BONUS TIER           */}
        {/* ================================================================ */}
        {step === 'amount' && (
          <div className="space-y-5">
            {/* Custom Amount Input Box */}
            <section className="rounded-3xl bg-[#0B1936] border border-blue-700/50 p-5 space-y-3 shadow-lg shadow-blue-950/40">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="deposit-amount-input" className="text-sm font-bold text-white">
                  Enter Deposit Amount
                </label>
                <span className="text-xs text-blue-200/75 font-mono-num">Min ₹100 · Max ₹50,000</span>
              </div>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-extrabold text-sky-400 font-mono-num">
                  ₹
                </span>
                <input
                  id="deposit-amount-input"
                  type="number"
                  inputMode="numeric"
                  min={100}
                  max={50000}
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="Enter amount (e.g. 500)"
                  className="w-full min-h-[56px] pl-10 pr-4 rounded-2xl bg-[#071126] border border-blue-600/60 focus:border-sky-400 focus:outline-none text-2xl font-extrabold text-white font-mono-num"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                <span className="text-slate-300">
                  Cash: <strong className="text-white font-mono-num">{formatINR(numericAmount)}</strong>
                  {bonusSummary.bonusAmount > 0 && (
                    <>
                      {' '}
                      + Bonus:{' '}
                      <strong className="text-sky-300 font-mono-num">
                        {formatINR(bonusSummary.bonusAmount)}
                      </strong>
                    </>
                  )}
                </span>
                <span className="text-emerald-400 font-bold font-mono-num">
                  Total Value: {formatINR(bonusSummary.totalValue)}
                </span>
              </div>
            </section>

            {/* Tiered Deposit Bonus Offer Grid — Clean Royal Blue Theme */}
            <div className="space-y-3.5">
              <div className="text-center space-y-1">
                <div className="flex items-center justify-center gap-3">
                  <span className="h-[1px] w-10 bg-gradient-to-r from-transparent to-sky-400" />
                  <h2 className="text-base font-extrabold text-sky-200 tracking-tight">
                    {isFirstOffer ? 'First Deposit Bonus Tiers' : 'Reload Deposit Bonus Tiers'}
                  </h2>
                  <span className="h-[1px] w-10 bg-gradient-to-l from-transparent to-sky-400" />
                </div>
                <p className="text-xs text-blue-200/75">
                  Tap any quick tier below or enter a custom amount above.
                </p>
              </div>

              <section className="grid grid-cols-2 gap-3">
                {tiers.map((tier) => {
                  const isSelected = tier.amount === numericAmount;
                  return (
                    <button
                      key={tier.amount}
                      type="button"
                      onClick={() => setAmountInput(String(tier.amount))}
                      className={`relative rounded-2xl text-left transition-all overflow-hidden border ${
                        isSelected
                          ? 'bg-gradient-to-br from-[#1D4ED8]/45 via-[#132E6B] to-[#0B1B40] border-sky-400 shadow-lg shadow-blue-600/30 ring-1 ring-sky-400/75'
                          : 'bg-gradient-to-b from-[#0E2148] to-[#091632] hover:from-[#122A5B] hover:to-[#0C1D42] border-blue-700/50 hover:border-blue-500/70'
                      }`}
                    >
                      <div
                        className={`inline-block px-2.5 py-0.5 rounded-br-xl text-[11px] font-extrabold font-mono-num ${
                          isSelected
                            ? 'bg-gradient-to-r from-sky-400 to-blue-400 text-slate-950'
                            : 'bg-gradient-to-r from-blue-600 to-sky-500 text-white'
                        }`}
                      >
                        {tier.totalPercentLabel}
                      </div>

                      <div className="px-3 pt-2 pb-2 grid grid-cols-2 gap-1.5 border-b border-blue-400/15">
                        <div>
                          <p className="text-[11px] text-blue-200/70 font-medium">Cash + Bonus</p>
                          <p className="text-xs font-bold text-slate-100 font-mono-num">
                            ₹{tier.amount}+₹{tier.bonusAmount}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] text-blue-200/70 font-medium">Total</p>
                          <p className="text-xs font-bold text-sky-300 font-mono-num">
                            {formatINR(tier.totalValue)}
                          </p>
                        </div>
                      </div>

                      <div className="py-2.5 px-3 text-center">
                        <span className="text-xl font-extrabold text-white font-mono-num">
                          {formatINR(tier.amount)}
                        </span>
                      </div>

                      {isSelected && (
                        <div className="absolute bottom-0 right-0 w-6 h-6 bg-sky-400 rounded-tl-xl flex items-center justify-center text-slate-950">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </section>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 2: SELECT PAYMENT METHOD (PhonePe, GPay, Paytm, QR Code)    */}
        {/* ================================================================ */}
        {step === 'method' && (
          <div className="space-y-4">
            <section className="rounded-2xl bg-[#0B1936] border border-blue-700/50 p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-blue-200/75">Selected Deposit Amount</p>
                <p className="text-2xl font-extrabold text-white font-mono-num">
                  {formatINR(numericAmount)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-sky-300 font-mono-num font-bold">
                  +{formatINR(bonusSummary.bonusAmount)} Bonus
                </p>
                <button
                  type="button"
                  onClick={() => setStep('amount')}
                  className="text-xs text-blue-400 hover:text-sky-300 font-semibold mt-0.5"
                >
                  Change Amount
                </button>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-bold text-white">Choose Payment Method</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PAYMENT_METHODS.map((m) => {
                  const selected = paymentMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      className={`min-h-[76px] rounded-2xl p-4 text-left flex items-center justify-between gap-3 border transition-all ${
                        selected
                          ? 'bg-[#132B5E] border-sky-400 ring-1 ring-sky-400/60 shadow-lg shadow-blue-950/60'
                          : 'bg-[#0B1936] hover:bg-[#10244D] border-blue-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-11 h-11 rounded-xl bg-gradient-to-br ${m.accentBg} flex items-center justify-center text-white font-extrabold text-base shrink-0 shadow`}
                        >
                          {m.id === 'UPI QR' ? <QrCode className="w-5 h-5" /> : m.badgeText}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{m.title}</p>
                          <p className="text-xs text-slate-400 truncate">{m.subtitle}</p>
                        </div>
                      </div>
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          selected
                            ? 'bg-sky-400 border-sky-400 text-slate-950'
                            : 'border-slate-600'
                        }`}
                      >
                        {selected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 3: MAKE PAYMENT VIA QR CODE / UPI ID                        */}
        {/* ================================================================ */}
        {step === 'pay' && (
          <div className="space-y-4">
            <section className="rounded-3xl bg-[#0D1B38] border border-blue-800/60 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-blue-300 font-semibold">
                    Step 3 · Pay via {paymentMethod}
                  </p>
                  <h2 className="text-lg font-extrabold text-white">
                    Pay Exactly <span className="text-sky-300 font-mono-num">{formatINR(numericAmount)}</span>
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('method')}
                  className="text-xs text-blue-400 hover:text-sky-300 font-semibold whitespace-nowrap"
                >
                  Switch App
                </button>
              </div>

              {/* Selector when Admin has multiple active QR / UPI accounts */}
              {depositAccounts.length > 1 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-400">
                    Choose Official Receiver Account
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {depositAccounts.map((acc) => {
                      const active = acc.id === selectedAccountId;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => setSelectedAccountId(acc.id)}
                          className={`min-h-[36px] px-3 rounded-xl text-xs font-bold border transition-colors ${
                            active
                              ? 'bg-blue-600/25 border-sky-400 text-white'
                              : 'bg-[#071126] border-blue-900/60 text-slate-300 hover:border-blue-600'
                          }`}
                        >
                          {acc.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Scannable QR Code Container */}
              <div className="flex flex-col sm:flex-row items-center gap-5 rounded-2xl bg-[#071126] border border-blue-900/60 p-4">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <div className="bg-white p-3 rounded-2xl shadow-lg">
                    {displayQrSrc ? (
                      <img
                        src={displayQrSrc}
                        alt={`UPI QR code for ${formatINR(numericAmount)}`}
                        className="w-44 h-44 object-contain"
                      />
                    ) : (
                      <div className="w-44 h-44 flex items-center justify-center text-slate-900 text-xs font-semibold">
                        Generating QR...
                      </div>
                    )}
                  </div>
                  {displayQrSrc && (
                    <a
                      href={displayQrSrc}
                      download={`deposit-qr-${activePayee.upiId.replace(/[^a-z0-9]/gi, '-')}.png`}
                      className="text-[11px] font-semibold text-sky-300 hover:text-sky-200 inline-flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Save QR Image</span>
                    </a>
                  )}
                </div>

                <div className="flex-1 w-full space-y-3">
                  <div>
                    <p className="text-[11px] text-slate-400">Official Payee Name</p>
                    <p className="text-sm font-bold text-white">{activePayee.merchantName}</p>
                  </div>

                  <div>
                    <p className="text-[11px] text-slate-400 mb-1">Merchant UPI ID</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-h-[42px] px-3 rounded-xl bg-[#0D1B38] border border-blue-800/70 flex items-center text-xs sm:text-sm font-mono-num font-bold text-sky-300 truncate">
                        {activePayee.upiId}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyUpi}
                        className="min-h-[42px] px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                      >
                        {copiedUpi ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        <span>{copiedUpi ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {activePayee.instructions && (
                    <p className="text-[11px] text-blue-200/85 bg-[#0D1B38] border border-blue-900/50 rounded-xl px-3 py-2 leading-relaxed">
                      {activePayee.instructions}
                    </p>
                  )}

                  <a
                    href={upiUri}
                    className="w-full min-h-[44px] px-4 rounded-xl bg-[#13264F] hover:bg-[#1B356D] border border-blue-700/60 text-xs font-bold text-blue-200 flex items-center justify-center gap-2 transition-colors"
                  >
                    <Smartphone className="w-4 h-4 text-sky-300" />
                    <span>Open {paymentMethod} / UPI App</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>
                  Scan the QR code or pay <strong className="text-white font-mono-num">{formatINR(numericAmount)}</strong> to the UPI ID above using <strong className="text-white">{paymentMethod}</strong>.
                </li>
                <li>
                  Note down your <strong className="text-white">12-digit Transaction ID / UTR</strong> after completing the payment.
                </li>
                <li>
                  Tap <strong className="text-emerald-300">I Have Paid — Enter Transaction ID</strong> below to submit your UTR to Admin.
                </li>
              </ol>

              <button
                type="button"
                onClick={() => {
                  setError('');
                  setStep('utr');
                }}
                className="w-full min-h-[52px] rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 active:scale-[0.99] text-slate-950 font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/20 transition-all"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>I Have Paid — Enter Transaction ID</span>
              </button>
            </section>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 4: ENTER TRANSACTION ID (UTR) & COMPLETE PAYMENT            */}
        {/* ================================================================ */}
        {step === 'utr' && (
          <div className="space-y-4">
            <section className="rounded-2xl bg-[#0D1B38] border border-blue-900/60 p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-400">Payment Summary</p>
                <p className="text-lg font-extrabold text-white font-mono-num">
                  {formatINR(numericAmount)} · <span className="font-sans text-blue-300">{paymentMethod}</span>
                </p>
                <p className="text-[11px] text-slate-400 font-mono-num">{activePayee.upiId}</p>
              </div>
              <button
                type="button"
                onClick={() => setStep('pay')}
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold whitespace-nowrap"
              >
                View QR Again
              </button>
            </section>

            <form
              onSubmit={handleSubmitUtr}
              className="rounded-3xl bg-[#0B1936] border border-sky-400/40 p-5 space-y-4"
            >
              <div>
                <p className="text-xs font-semibold text-sky-300 mb-1">
                  Step 4 · Confirm Your Payment
                </p>
                <label htmlFor="utr-input" className="block text-base font-bold text-white mb-1">
                  Enter Transaction ID / UTR Number
                </label>
                <p className="text-xs text-slate-400 mb-3">
                  Paste the 12-digit UTR / UPI Reference ID from your {paymentMethod} receipt (e.g. 432219847561 or T241118192837465).
                </p>
                <input
                  id="utr-input"
                  type="text"
                  autoFocus
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value.toUpperCase())}
                  placeholder="Enter 12-digit UTR / Transaction ID"
                  className="w-full min-h-[52px] px-4 rounded-2xl bg-[#071126] border border-blue-700/80 focus:border-sky-400 focus:outline-none text-base font-mono-num font-bold text-white tracking-wider"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[52px] rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 hover:brightness-110 disabled:opacity-60 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-xl shadow-blue-600/25 transition-all"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {loading
                    ? 'Sending Request to Admin...'
                    : `Complete Payment (${formatINR(numericAmount)})`}
                </span>
              </button>
            </form>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 5: REQUEST SENT / LIVE ADMIN APPROVAL CONFIRMATION          */}
        {/* ================================================================ */}
        {step === 'submitted' && submittedDeposit && (
          <section
            className={`rounded-3xl bg-gradient-to-b from-[#0E2148] to-[#0A1630] border p-6 text-center space-y-5 shadow-xl ${
              submittedDeposit.status === 'Successful'
                ? 'border-emerald-400/60'
                : submittedDeposit.status === 'Failed'
                ? 'border-rose-400/60'
                : 'border-sky-400/50'
            }`}
          >
            {submittedDeposit.status === 'Failed' ? (
              <div className="w-16 h-16 mx-auto rounded-2xl border bg-rose-500/15 border-rose-400/40 text-rose-300 flex items-center justify-center">
                <AlertCircle className="w-8 h-8" />
              </div>
            ) : (
              <UtrSuccessAnimation
                variant={submittedDeposit.status === 'Successful' ? 'approved' : 'submitted'}
              />
            )}

            <div className="space-y-1.5">
              {submittedDeposit.status === 'Pending' && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 border border-sky-400/35 text-sky-300 text-[11px] font-bold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>UTR Received · In Verification Queue</span>
                </div>
              )}
              <h2 className="text-xl font-extrabold text-white">
                {submittedDeposit.status === 'Successful'
                  ? 'Money Added to Your Account!'
                  : submittedDeposit.status === 'Failed'
                  ? 'Deposit Request Rejected'
                  : 'UTR Submitted Successfully!'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                {submittedDeposit.status === 'Successful'
                  ? `Admin verified your Transaction ID and credited ${formatINR(submittedDeposit.creditedAmount ?? submittedDeposit.amount)} to your wallet.`
                  : submittedDeposit.status === 'Failed'
                  ? submittedDeposit.failureReason || 'Transaction ID could not be verified by Admin.'
                  : 'Your payment request is now in the Admin Panel verification queue. As soon as Admin verifies your UTR, the amount will automatically reflect in your wallet.'}
              </p>
            </div>

            <div className="rounded-2xl bg-[#071126] border border-blue-900/60 p-4 space-y-2 text-xs text-left">
              <div className="flex justify-between">
                <span className="text-slate-400">Request ID</span>
                <span className="font-mono-num font-bold text-white">{submittedDeposit.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Payment Method</span>
                <span className="font-bold text-blue-300">
                  {submittedDeposit.paymentMethod || submittedDeposit.gateway}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Transaction ID / UTR</span>
                <span className="font-mono-num font-bold text-amber-300">
                  {submittedDeposit.utrNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">
                  {submittedDeposit.status === 'Successful' ? 'Credited Amount' : 'Requested Amount'}
                </span>
                <span className="font-mono-num font-bold text-white">
                  {formatINR(
                    submittedDeposit.status === 'Successful'
                      ? (submittedDeposit.creditedAmount ?? submittedDeposit.amount)
                      : submittedDeposit.amount
                  )}
                </span>
              </div>
              {submittedDeposit.bonusAmount > 0 && submittedDeposit.status !== 'Failed' && (
                <div className="flex justify-between">
                  <span className="text-slate-400">
                    {submittedDeposit.status === 'Successful' ? 'Bonus Credited' : 'Eligible Tier Bonus'}
                  </span>
                  <span className="font-mono-num font-bold text-emerald-400">
                    +{formatINR(submittedDeposit.bonusAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-blue-900/50">
                <span className="text-slate-400">Current Status</span>
                <span
                  className={`font-bold ${
                    submittedDeposit.status === 'Successful'
                      ? 'text-emerald-400'
                      : submittedDeposit.status === 'Failed'
                      ? 'text-rose-400'
                      : 'text-amber-300'
                  }`}
                >
                  {submittedDeposit.status === 'Pending'
                    ? 'Pending Admin Verification'
                    : submittedDeposit.status}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onOpenHistory}
                className="min-h-[46px] rounded-xl bg-[#13264F] hover:bg-[#1B356D] text-white text-xs sm:text-sm font-bold"
              >
                Track Status
              </button>
              <button
                type="button"
                onClick={onBack}
                className="min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold"
              >
                Back to Home
              </button>
            </div>
          </section>
        )}

        {/* Transparent Rules Footer */}
        {step !== 'submitted' && (
          <section className="rounded-2xl bg-[#0B1936] border border-blue-800/50 p-4 space-y-1.5 text-xs text-slate-300 leading-relaxed">
            <p className="text-sm font-bold text-sky-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Secure Verification & Fair Wallet Policy
            </p>
            <p>
              1. Every manual UPI deposit is matched against your submitted Transaction ID / UTR in the Admin Panel before wallet credit.
            </p>
            <p>
              2. Approved cash deposits credit to your Available Balance, and eligible tier bonuses credit separately to Bonus Balance.
            </p>
          </section>
        )}
      </main>

      {/* Bottom Sticky Action CTA for Step 1 & Step 2 */}
      {(step === 'amount' || step === 'method') && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-[#071126] via-[#071126]/95 to-transparent pt-4 pb-5 px-4">
          <div className="max-w-2xl mx-auto">
            {step === 'amount' ? (
              <div className="space-y-1.5">
                {numericAmount >= 100 && (
                  <div className="flex justify-end">
                    <span className="px-3 py-1 rounded-lg bg-sky-400 text-slate-950 text-xs font-extrabold font-mono-num shadow">
                      You can get {formatINR(bonusSummary.totalValue)}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleContinueFromAmount}
                  className="w-full min-h-[52px] rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 hover:brightness-110 active:scale-[0.99] text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-xl shadow-blue-600/30 transition-all"
                >
                  <CreditCard className="w-5 h-5" />
                  <span>Continue to Payment Method ({formatINR(numericAmount)})</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setStep('pay');
                }}
                className="w-full min-h-[52px] rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 hover:brightness-110 active:scale-[0.99] text-white font-extrabold text-base shadow-xl shadow-blue-600/30 transition-all"
              >
                Proceed with {paymentMethod} ({formatINR(numericAmount)})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
