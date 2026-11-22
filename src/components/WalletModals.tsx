import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle2,
  CreditCard,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import {
  formatINR,
  getUserWithdrawalSettingsFirestore,
  submitDepositRequestFirestore,
  submitWithdrawalRequestFirestore,
} from '../lib/api';
import type {
  DepositPaymentMethod,
  DepositRecord,
  UserProfile,
  WalletSummary,
  WithdrawalRecord,
} from '../types';

interface DepositModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const DepositModal: React.FC<DepositModalProps> = ({ onClose, onSuccess }) => {
  const [amount, setAmount] = useState<string>('300');
  const [paymentMethod, setPaymentMethod] = useState<DepositPaymentMethod>('PhonePe');
  const [utrNumber, setUtrNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<DepositRecord | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await submitDepositRequestFirestore({
        amount: Number(amount),
        paymentMethod,
        utrNumber,
      });
      setSubmitted(res.deposit);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit deposit request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl bg-[#0D1B38] border border-blue-900/60 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-blue-900/50">
          <div>
            <h2 className="text-lg font-bold text-white">Add Money</h2>
            <p className="text-xs text-slate-400">UPI / UTR · Instant Firestore sync</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close deposit modal"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800/70 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-4 py-3 text-sm text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Deposit Amount (INR)
                </label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {['100', '300', '500', '1000'].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAmount(val)}
                      className={`min-h-[42px] rounded-xl text-sm font-mono-num font-semibold transition-colors ${
                        amount === val
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#152954] text-slate-200 hover:bg-[#1D366B]'
                      }`}
                    >
                      ₹{val}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={100}
                  max={50000}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num text-lg font-semibold focus:outline-none focus:border-blue-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  UPI Payment App
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['PhonePe', 'GPay', 'Paytm', 'UPI QR'] as const).map((pm) => (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => setPaymentMethod(pm)}
                      className={`min-h-[40px] rounded-xl text-xs font-semibold border transition-colors ${
                        paymentMethod === pm
                          ? 'bg-blue-600/20 border-blue-400 text-white'
                          : 'bg-[#122347] border-blue-900/50 text-slate-300 hover:text-white'
                      }`}
                    >
                      {pm}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  12-Digit UTR / Transaction ID
                </label>
                <input
                  type="text"
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value.toUpperCase())}
                  placeholder="Enter UTR number"
                  className="w-full min-h-[46px] px-4 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num text-sm focus:outline-none focus:border-blue-400"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <CreditCard className="w-4 h-4" />
                <span>{loading ? 'Submitting...' : `Submit Deposit ${formatINR(Number(amount || 0))}`}</span>
              </button>
            </form>
          ) : (
            <div className="text-center space-y-4 py-3">
              <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center bg-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Deposit Request Submitted</h3>
                <p className="text-xs text-slate-400 font-mono-num mt-1">
                  {submitted.utrNumber} · {formatINR(submitted.amount)} · Pending Admin Review
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface WithdrawModalProps {
  user: UserProfile;
  wallet: WalletSummary;
  onClose: () => void;
  onSuccess: () => void;
  onOpenKyc: () => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  user,
  wallet,
  onClose,
  onSuccess,
  onOpenKyc,
}) => {
  const [liveSettings, setLiveSettings] = useState<{
    minWithdrawalLimit: number;
    withdrawalNoticeBanner: {
      enabled: boolean;
      title: string;
      message: string;
      isCustom?: boolean;
    };
    hasCustomSettings: boolean;
  } | null>(null);

  const [methodType, setMethodType] = useState<'upi' | 'bank'>('upi');
  const [amount, setAmount] = useState<string>(
    String(Math.max(wallet.minWithdrawalLimit, Math.min(wallet.availableBalance, wallet.minWithdrawalLimit)))
  );
  const defaultUpi = user.paymentMethods.find((p) => p.type === 'upi');
  const defaultBank = user.paymentMethods.find((p) => p.type === 'bank');

  const [upiId, setUpiId] = useState(defaultUpi?.upiId || '');
  const [accountHolderName, setAccountHolderName] = useState(defaultBank?.accountHolderName || user.name);
  const [accountNumber, setAccountNumber] = useState(defaultBank?.accountNumber || '');
  const [ifscCode, setIfscCode] = useState(defaultBank?.ifscCode || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<WithdrawalRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUserWithdrawalSettingsFirestore()
      .then((res) => {
        if (cancelled) return;
        setLiveSettings(res);
        setAmount((prev) => {
          const prevNum = Number(prev || 0);
          if (prevNum === wallet.minWithdrawalLimit || prevNum < res.minWithdrawalLimit) {
            return String(res.minWithdrawalLimit);
          }
          return prev;
        });
      })
      .catch(() => {
        // Fallback to wallet summary values already fetched for this user
      });
    return () => {
      cancelled = true;
    };
  }, [wallet.minWithdrawalLimit]);

  const effectiveMinLimit = liveSettings?.minWithdrawalLimit ?? wallet.minWithdrawalLimit;
  const effectiveNoticeBanner =
    liveSettings?.withdrawalNoticeBanner ?? wallet.withdrawalNoticeBanner;

  const numericAmount = Number(amount || 0);
  const belowMinBalance = wallet.availableBalance < effectiveMinLimit;
  const belowMinInput = numericAmount > 0 && numericAmount < effectiveMinLimit;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (numericAmount < effectiveMinLimit) {
      setError(`Minimum withdrawal limit is ${formatINR(effectiveMinLimit)}.`);
      return;
    }
    if (belowMinBalance || numericAmount > wallet.availableBalance) {
      setError(
        `Minimum withdrawal is ${formatINR(effectiveMinLimit)}. Your current Withdrawable Balance is ${formatINR(wallet.availableBalance)}.`
      );
      return;
    }
    setLoading(true);
    try {
      const res = await submitWithdrawalRequestFirestore({
        amount: Number(amount),
        methodType,
        upiId: methodType === 'upi' ? upiId : undefined,
        accountHolderName: methodType === 'bank' ? accountHolderName : undefined,
        accountNumber: methodType === 'bank' ? accountNumber : undefined,
        ifscCode: methodType === 'bank' ? ifscCode : undefined,
      });
      setSubmitted(res.withdrawal);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit withdrawal request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl bg-[#0D1B38] border border-blue-900/60 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-blue-900/50">
          <div>
            <h2 className="text-lg font-bold text-white">Withdraw Funds</h2>
            <p className="text-xs text-slate-400">
              Min withdrawal {formatINR(effectiveMinLimit)} · Transparent processing
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close withdraw modal"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800/70 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Admin-Controlled Withdrawal Notification Banner */}
          {effectiveNoticeBanner?.enabled &&
            effectiveNoticeBanner.message.trim().length > 0 && (
              <div className="rounded-2xl bg-gradient-to-r from-blue-600/20 via-sky-500/12 to-[#0A1630] border border-sky-400/45 px-4 py-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/35 text-sky-300 flex items-center justify-center shrink-0 mt-0.5">
                  <Bell className="w-4 h-4" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
                    {effectiveNoticeBanner.title || 'Withdrawal Notice'}
                  </p>
                  <p className="text-xs text-slate-100 leading-relaxed whitespace-pre-wrap break-words">
                    {effectiveNoticeBanner.message}
                  </p>
                </div>
              </div>
            )}

          {error && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {user.kycStatus !== 'verified' ? (
            <div className="space-y-4 text-center py-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">KYC Verification Required</h3>
                <p className="text-sm text-slate-300">
                  Identity verification is required before processing withdrawals. Current status:{' '}
                  <strong className="capitalize text-amber-300">{user.kycStatus}</strong>.
                </p>
              </div>
              <button
                onClick={() => {
                  onClose();
                  onOpenKyc();
                }}
                className="w-full min-h-[46px] rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm"
              >
                Go to KYC Verification
              </button>
            </div>
          ) : submitted ? (
            <div className="text-center space-y-4 py-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Withdrawal Request Submitted</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Status: <strong className="text-amber-300">{submitted.status}</strong> · {submitted.transactionId}
                </p>
              </div>
              <div className="rounded-xl bg-[#0A1630] p-3.5 text-xs text-slate-300 text-left space-y-1">
                <p>Amount: <span className="font-mono-num text-white font-semibold">{formatINR(submitted.amount)}</span></p>
                <p>Destination: <span className="text-white">{submitted.methodType === 'upi' ? submitted.upiId : `${submitted.accountHolderName} · ${submitted.ifscCode}`}</span></p>
                <p className="text-slate-400 pt-1">
                  Track status live in Wallet → Withdrawals. Payouts are only marked Completed once actually settled.
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm"
              >
                Track in Wallet
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5 rounded-2xl bg-[#0A1630] p-3.5 border border-blue-900/40">
                <div>
                  <p className="text-xs text-slate-400">Withdrawable Balance</p>
                  <p className="text-lg font-bold text-emerald-400 font-mono-num">
                    {formatINR(wallet.availableBalance)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Bonus (Non-withdrawable)</p>
                  <p className="text-lg font-bold text-slate-300 font-mono-num">
                    {formatINR(wallet.bonusBalance)}
                  </p>
                </div>
              </div>

              {(belowMinBalance || belowMinInput) && (
                <div className="rounded-xl bg-amber-500/15 border border-amber-400/45 px-4 py-3 text-xs text-amber-200 leading-relaxed">
                  <strong className="text-amber-300">Minimum Withdrawal Notice:</strong> Minimum withdrawal amount is{' '}
                  <strong className="font-mono-num text-white">{formatINR(effectiveMinLimit)}</strong>.
                  {belowMinBalance && (
                    <>
                      {' '}You need{' '}
                      <strong className="font-mono-num text-white">
                        {formatINR(Math.max(0, effectiveMinLimit - wallet.availableBalance))}
                      </strong>{' '}
                      more in your Withdrawable Balance to submit a withdrawal.
                    </>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Withdrawal Amount (Min {formatINR(effectiveMinLimit)})
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(effectiveMinLimit, wallet.availableBalance)}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num text-lg font-semibold focus:outline-none focus:border-blue-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Payout Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMethodType('upi')}
                    className={`min-h-[44px] rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-colors ${
                      methodType === 'upi'
                        ? 'bg-blue-600/20 border-blue-400 text-white'
                        : 'bg-[#122347] border-blue-900/50 text-slate-300'
                    }`}
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>UPI ID</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethodType('bank')}
                    className={`min-h-[44px] rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-colors ${
                      methodType === 'bank'
                        ? 'bg-blue-600/20 border-blue-400 text-white'
                        : 'bg-[#122347] border-blue-900/50 text-slate-300'
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Bank Account</span>
                  </button>
                </div>
              </div>

              {methodType === 'upi' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">UPI ID</label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="yourname@okaxis"
                    className="w-full min-h-[46px] px-4 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm focus:outline-none focus:border-blue-400"
                    required
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={accountHolderName}
                      onChange={(e) => setAccountHolderName(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Bank Account Number
                    </label>
                    <input
                      type="text"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="9–18 digit account number"
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">IFSC Code</label>
                    <input
                      type="text"
                      value={ifscCode}
                      onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                      placeholder="HDFC0001245"
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num uppercase text-sm"
                      required
                    />
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-400 leading-relaxed">
                We never request any deposit, fee, or UPI PIN to release your earned withdrawal.
              </p>

              <button
                type="submit"
                disabled={loading || wallet.availableBalance < effectiveMinLimit}
                className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
              >
                {loading ? 'Submitting Request...' : `Request Withdrawal of ${formatINR(Number(amount || 0))}`}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. WITHDRAWAL REJECTION NOTICE MODAL
// ============================================================================
export const WithdrawalRejectionModal: React.FC<{
  withdrawal: WithdrawalRecord;
  onAcknowledge: () => void;
  onViewWallet: () => void;
}> = ({ withdrawal, onAcknowledge, onViewWallet }) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="withdrawal-rejection-title"
    >
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl bg-[#0D1B38] border border-rose-500/45 shadow-2xl shadow-rose-950/50">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 bg-gradient-to-r from-rose-600/20 via-rose-500/10 to-transparent border-b border-rose-500/25">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-400/40 text-rose-300 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-rose-300">
                Admin Notice
              </span>
              <h2
                id="withdrawal-rejection-title"
                className="text-lg font-bold text-white leading-tight"
              >
                Withdrawal Request Rejected
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onAcknowledge}
            aria-label="Close rejection notice"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-800/70 text-slate-300 hover:text-white shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Highlighted Rejection Reason */}
          <div className="rounded-2xl bg-rose-500/12 border border-rose-400/45 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Rejection Reason</span>
            </div>
            <p className="text-base font-semibold text-white leading-relaxed whitespace-pre-wrap break-words">
              {withdrawal.rejectionReason || 'Your withdrawal request could not be processed. Please review your details and try again.'}
            </p>
          </div>

          {/* Refund Confirmation */}
          <div className="rounded-2xl bg-emerald-500/12 border border-emerald-400/40 px-4 py-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-300">
                Amount Refunded
              </p>
              <p className="text-sm text-white mt-0.5 leading-snug">
                Your withdrawal amount of{' '}
                <strong className="font-mono-num text-emerald-300">
                  {formatINR(withdrawal.amount)}
                </strong>{' '}
                has been refunded to your Available Balance.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={onViewWallet}
              className="min-h-[46px] rounded-xl bg-[#13264F] hover:bg-[#1B356D] border border-blue-500/40 text-blue-100 font-semibold text-sm transition-colors"
            >
              View Wallet
            </button>
            <button
              type="button"
              onClick={onAcknowledge}
              className="min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

