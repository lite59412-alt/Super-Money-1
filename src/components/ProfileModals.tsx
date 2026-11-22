import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  Check,
  Flag,
  KeyRound,
  Scale,
  ShieldCheck,
  Smartphone,
  Star,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  addUserPaymentMethodFirestore,
  deleteUserPaymentMethodFirestore,
  firebaseForgotPassword,
  firebaseLogin,
  firebaseSignUp,
  formatDateTime,
  reportReviewFirestore,
  submitKycFirestore,
  submitOrUpdateReviewFirestore,
} from '../lib/api';
import type {
  NotificationItem,
  PaymentMethod,
  ReviewItem,
  ReviewScheduleMeta,
  UserProfile,
} from '../types';

const INDIAN_STATES = [
  'Maharashtra',
  'Karnataka',
  'Delhi',
  'Gujarat',
  'Tamil Nadu',
  'Uttar Pradesh',
  'West Bengal',
  'Rajasthan',
  'Kerala',
  'Madhya Pradesh',
  'Andhra Pradesh',
  'Assam',
  'Nagaland',
  'Odisha',
  'Sikkim',
  'Telangana',
];

// ============================================================================
// 1. ACCOUNT AUTH MODAL (Register with Password+Confirm, Login, Reset)
// ============================================================================
export const AccountAuthModal: React.FC<{
  onClose: () => void;
  onAuthSuccess: () => void;
}> = ({ onClose, onAuthSuccess }) => {
  const [mode, setMode] = useState<'register' | 'login' | 'forgot'>('register');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [stateName, setStateName] = useState('Maharashtra');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (mode === 'register' && password !== confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'register') {
        await firebaseSignUp({
          name: name.trim(),
          mobile: mobile.replace(/\D/g, ''),
          email: email.trim().toLowerCase(),
          state: stateName,
          password,
          referralCode: referralCode.trim().toUpperCase(),
        });
        onAuthSuccess();
        onClose();
      } else if (mode === 'login') {
        await firebaseLogin({
          identifier: identifier.trim(),
          password,
        });
        onAuthSuccess();
        onClose();
      } else {
        const res = await firebaseForgotPassword(email.trim().toLowerCase());
        setMessage(res.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const passwordsMismatch = mode === 'register' && confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl bg-[#0D1B38] border border-blue-900/60 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-blue-900/50">
          <div>
            <h2 className="text-lg font-bold text-white">Switch Account / Sign Up</h2>
            <p className="text-xs text-slate-400">Create a new account or sign in with Gmail / Mobile</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close auth modal"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800/70 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#071126]">
            {([
              ['register', 'Sign Up'],
              ['login', 'Sign In'],
              ['forgot', 'Reset PIN'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setMode(key);
                  setError('');
                  setMessage('');
                }}
                className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                  mode === key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-3.5 py-2.5 text-xs text-rose-200">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/40 px-3.5 py-2.5 text-xs text-emerald-200">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Gmail / Email ID</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="yourname@gmail.com"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">10-Digit Mobile Number</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9876543210"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num text-sm"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">State</label>
                    <select
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm"
                    >
                      {INDIAN_STATES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Referral Code (Optional)</label>
                    <input
                      type="text"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      placeholder="RAHUL100"
                      className="w-full min-h-[44px] px-3 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num uppercase text-sm"
                    />
                  </div>
                </div>
              </>
            )}

            {mode === 'login' && (
              <div>
                <label className="block text-xs text-slate-300 mb-1">Registered Email ID</label>
                <input
                  type="email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="yourname@gmail.com"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm"
                  required
                />
              </div>
            )}

            {mode === 'forgot' && (
              <div>
                <label className="block text-xs text-slate-300 mb-1">Registered Email ID</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="yourname@gmail.com"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  We will send a Firebase password reset link directly to your inbox.
                </p>
              </div>
            )}

            {mode !== 'forgot' && (
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Password (min 6 chars)
                </label>
                <input
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm"
                  required
                />
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label className="block text-xs text-slate-300 mb-1">Confirm Password</label>
                <input
                  type="password"
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className={`w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border text-white text-sm ${
                    passwordsMismatch ? 'border-rose-500/80' : 'border-blue-800/70'
                  }`}
                  required
                />
                {passwordsMismatch && (
                  <p className="text-[11px] text-rose-300 mt-1">Passwords do not match.</p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || passwordsMismatch}
              className="w-full min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2"
            >
              {mode === 'register' ? <UserPlus className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
              <span>
                {mode === 'register'
                  ? 'Create Account'
                  : mode === 'login'
                  ? 'Sign In'
                  : 'Send Reset Email'}
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. KYC VERIFICATION MODAL
// ============================================================================
export const KycModal: React.FC<{
  user: UserProfile;
  onClose: () => void;
  onUpdated: () => void;
}> = ({ user, onClose, onUpdated }) => {
  const [docType, setDocType] = useState('PAN Card');
  const [docNumber, setDocNumber] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!ageConfirmed) {
      setError('You must confirm you are 18+ years old.');
      return;
    }
    setLoading(true);
    try {
      await submitKycFirestore({
        documentType: docType,
        documentNumber: docNumber,
        fullName: user.name,
      });
      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'KYC submission failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-[#0D1B38] border border-blue-900/60 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-blue-900/50">
          <h2 className="text-lg font-bold text-white">KYC Verification</h2>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800/70 text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-2xl bg-[#0A1630] p-4 border border-blue-900/40 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Verification Status</p>
              <p className="text-base font-bold capitalize text-white mt-0.5">{user.kycStatus}</p>
            </div>
            <ShieldCheck className={`w-8 h-8 ${user.kycStatus === 'verified' ? 'text-emerald-400' : 'text-amber-400'}`} />
          </div>

          {user.kycStatus === 'verified' ? (
            <div className="space-y-3 text-sm text-slate-300">
              <p>
                Your identity ({user.kycDocumentType || 'PAN Card'} ending in{' '}
                <span className="font-mono-num text-white">{user.kycDocumentLast4 || '4821'}</span>) is verified.
              </p>
              <p className="text-xs text-slate-400">
                Only masked references are stored. Full document numbers, banking passwords, and UPI PINs are never stored.
              </p>
              <button onClick={onClose} className="w-full min-h-[44px] rounded-xl bg-blue-600 text-white font-semibold text-sm">
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {error && <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 p-3 text-xs text-rose-200">{error}</div>}
              <div>
                <label className="block text-xs text-slate-300 mb-1">Document Type</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm"
                >
                  <option value="PAN Card">PAN Card</option>
                  <option value="Aadhaar (Masked)">Aadhaar (Masked)</option>
                  <option value="Voter ID">Voter ID</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Document Number (only last 4 stored)</label>
                <input
                  type="text"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num uppercase text-sm"
                  required
                />
              </div>
              <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(e) => setAgeConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-blue-700"
                />
                <span>I confirm I am 18+ years old and reside in a permitted Indian state.</span>
              </label>
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[46px] rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm"
              >
                {loading ? 'Submitting...' : 'Submit for Verification'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. PAYMENT METHODS MODAL
// ============================================================================
export const PaymentMethodsModal: React.FC<{
  methods: PaymentMethod[];
  onClose: () => void;
  onUpdated: () => void;
}> = ({ methods, onClose, onUpdated }) => {
  const [type, setType] = useState<'upi' | 'bank'>('upi');
  const [label, setLabel] = useState('');
  const [upiId, setUpiId] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await addUserPaymentMethodFirestore({
        type,
        label: label || (type === 'upi' ? 'My UPI' : 'My Bank'),
        upiId: type === 'upi' ? upiId.trim() : undefined,
        accountHolderName: type === 'bank' ? accountHolderName.trim() : undefined,
        accountNumber: type === 'bank' ? accountNumber.trim() : undefined,
        ifscCode: type === 'bank' ? ifscCode.trim().toUpperCase() : undefined,
      });
      setLabel('');
      setUpiId('');
      setAccountHolderName('');
      setAccountNumber('');
      setIfscCode('');
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save method.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteUserPaymentMethodFirestore(id);
    onUpdated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-[#0D1B38] border border-blue-900/60 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-blue-900/50">
          <h2 className="text-lg font-bold text-white">Saved Payout Methods</h2>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800/70 text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {methods.length > 0 && (
            <div className="space-y-2">
              {methods.map((pm) => (
                <div key={pm.id} className="flex items-center justify-between rounded-2xl bg-[#0A1630] border border-blue-900/40 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-300 flex items-center justify-center shrink-0">
                      {pm.type === 'upi' ? <Smartphone className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{pm.label}</p>
                      <p className="text-xs text-slate-400 font-mono-num truncate">
                        {pm.type === 'upi' ? pm.upiId : `${pm.accountNumberMasked} · ${pm.ifscCode}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(pm.id)}
                    aria-label="Remove payment method"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-rose-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAdd} className="space-y-3 pt-3 border-t border-blue-900/40">
            <p className="text-xs font-semibold text-blue-300">Add New Payout Method</p>
            {error && <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 p-2.5 text-xs text-rose-200">{error}</div>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setType('upi')} className={`min-h-[40px] rounded-xl text-xs font-semibold ${type === 'upi' ? 'bg-blue-600 text-white' : 'bg-[#13264F] text-slate-300'}`}>UPI ID</button>
              <button type="button" onClick={() => setType('bank')} className={`min-h-[40px] rounded-xl text-xs font-semibold ${type === 'bank' ? 'bg-blue-600 text-white' : 'bg-[#13264F] text-slate-300'}`}>Bank Account</button>
            </div>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Primary UPI)" className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm" />
            {type === 'upi' ? (
              <input type="text" value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="name@okaxis" className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm" required />
            ) : (
              <>
                <input type="text" value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} placeholder="Account Holder Name" className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm" required />
                <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Bank Account Number" className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num text-sm" required />
                <input type="text" value={ifscCode} onChange={(e) => setIfscCode(e.target.value.toUpperCase())} placeholder="IFSC Code (e.g. HDFC0001245)" className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num uppercase text-sm" required />
              </>
            )}
            <button type="submit" disabled={loading} className="w-full min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm">
              {loading ? 'Saving...' : 'Save Method'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. GENUINE COMMUNITY REVIEWS MODAL
// ============================================================================
export const ReviewsModal: React.FC<{
  currentUserId: string;
  reviews: ReviewItem[];
  reviewSchedule?: ReviewScheduleMeta | null;
  onClose: () => void;
  onUpdated: () => void;
}> = ({ currentUserId, reviews, reviewSchedule, onClose, onUpdated }) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const cooldownMs = reviewSchedule?.userCooldownEndsAt
    ? Math.max(0, new Date(reviewSchedule.userCooldownEndsAt).getTime() - Date.now())
    : 0;
  const isCoolingDown = !editingId && cooldownMs > 0;
  const cooldownLabel = (() => {
    const mins = Math.ceil(cooldownMs / 60000);
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return hrs > 0 ? `${hrs}h ${rem}m` : `${rem}m`;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await submitOrUpdateReviewFirestore({
        id: editingId || undefined,
        rating,
        comment,
      });
      setEditingId(null);
      setComment('');
      setRating(5);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save review.');
    } finally {
      setLoading(false);
    }
  };

  const handleReport = async (id: string) => {
    await reportReviewFirestore(id);
    onUpdated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-[#0D1B38] border border-blue-900/60 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-blue-900/50">
          <div>
            <h2 className="text-lg font-bold text-white">Player Reviews</h2>
            <p className="text-xs text-slate-400">Community feedback</p>
          </div>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800/70 text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <form onSubmit={handleSubmit} className="rounded-2xl bg-[#0A1630] border border-blue-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">
                {editingId ? 'Edit Your Review' : 'Write a Review'}
              </p>
            </div>
            {isCoolingDown && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-200">
                You recently posted a review. Next new review opens in{' '}
                <span className="font-mono-num font-semibold">{cooldownLabel}</span> (you can still edit your existing review below).
              </div>
            )}
            {error && <p className="text-xs text-rose-300">{error}</p>}
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center"
                  aria-label={`Rate ${star} stars`}
                >
                  <Star className={`w-6 h-6 ${star <= rating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`} />
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Share your honest experience with games, payouts, or support..."
              className="w-full p-3 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm focus:outline-none focus:border-blue-400"
              required
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading || isCoolingDown}
                className="flex-1 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm"
              >
                {editingId ? 'Update Review' : 'Submit Review'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setComment('');
                  }}
                  className="px-4 min-h-[44px] rounded-xl bg-slate-800 text-slate-300 text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="space-y-3">
            {reviews.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">
                No reviews submitted yet. Be the first genuine user to share feedback above.
              </p>
            ) : (
              reviews.map((rev) => (
                <div key={rev.id} className="rounded-2xl bg-[#112246] border border-blue-900/40 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{rev.userName}</p>
                      <p className="text-xs text-slate-400">{formatDateTime(rev.updatedAt)}</p>
                    </div>
                    <div className="flex items-center gap-0.5 text-amber-400">
                      {Array.from({ length: rev.rating }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-current" />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">{rev.comment}</p>
                  <div className="flex items-center justify-between pt-1 text-xs">
                    {rev.userId === currentUserId ? (
                      <button
                        onClick={() => {
                          setEditingId(rev.id);
                          setRating(rev.rating);
                          setComment(rev.comment);
                        }}
                        className="text-blue-400 hover:underline font-medium"
                      >
                        Edit review
                      </button>
                    ) : (
                      <span />
                    )}
                    <button
                      onClick={() => handleReport(rev.id)}
                      className="flex items-center gap-1 text-slate-400 hover:text-rose-300"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      <span>
                        {rev.reportedBy.includes(currentUserId) ? 'Reported' : 'Report'}
                      </span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 5. LEGAL, COMPLIANCE & RESPONSIBLE GAMING MODAL
// ============================================================================
export const LegalComplianceModal: React.FC<{
  prohibitedStates: string[];
  onClose: () => void;
}> = ({ prohibitedStates, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
    <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-[#0D1B38] border border-blue-900/60 shadow-2xl">
      <div className="flex items-center justify-between px-5 py-4 border-b border-blue-900/50">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold text-white">Legal & Responsible Gaming</h2>
        </div>
        <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800/70 text-slate-300">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 space-y-4 text-sm text-slate-300 leading-relaxed">
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 text-amber-100 text-xs space-y-1.5">
          <p className="font-bold flex items-center gap-1.5 text-amber-300">
            <AlertTriangle className="w-4 h-4" />
            Regulatory & Licensing Disclosure
          </p>
          <p>
            This application is a skill-based gaming & rewards software architecture. Before operating real-money deposits or payouts commercially in India, the operator must independently verify central and state gaming laws, obtain required licences, register applicable GST/TDS tax compliance, and complete authorized payment gateway onboarding.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-white mb-1">1. Age & Jurisdiction Restrictions</h3>
          <p className="text-xs text-slate-300">
            Strictly 18+ only. Real-money deposits and withdrawals are restricted in prohibited jurisdictions:{' '}
            <span className="text-white font-medium">{prohibitedStates.join(', ')}</span>.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-white mb-1">2. Fair Play & No Guaranteed Earnings</h3>
          <p className="text-xs text-slate-300">
            All games are pure skill challenges with server-verified scoring. Game results are never manipulated and no winning percentage or fixed income is guaranteed.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-white mb-1">3. Wallet, Bonus & Withdrawal Policy</h3>
          <p className="text-xs text-slate-300">
            Bonus Balance is tracked separately from Available Withdrawable Balance and cannot be withdrawn directly. Minimum withdrawal is ₹200 after KYC verification. No deposit is ever required to release an already-earned withdrawal.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-white mb-1">4. Privacy & Security</h3>
          <p className="text-xs text-slate-300">
            Passwords are salted and hashed with scrypt. Banking passwords, UPI PINs, and plaintext OTPs are never collected or stored.
          </p>
        </div>

        <button onClick={onClose} className="w-full min-h-[44px] rounded-xl bg-blue-600 text-white font-semibold text-sm">
          Close
        </button>
      </div>
    </div>
  </div>
);

// ============================================================================
// 6. REAL-TIME NOTIFICATIONS DRAWER
// ============================================================================
export const NotificationsDrawer: React.FC<{
  notifications: NotificationItem[];
  onClose: () => void;
  onMarkAllRead: () => void;
}> = ({ notifications, onClose, onMarkAllRead }) => (
  <div className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-sm">
    <div className="w-full max-w-md h-full bg-[#0D1B38] border-l border-blue-900/60 flex flex-col shadow-2xl">
      <div className="flex items-center justify-between px-5 py-4 border-b border-blue-900/50">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-400" />
          <h2 className="text-base font-bold text-white">Notifications</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onMarkAllRead}
            className="text-xs text-blue-400 hover:text-blue-300 font-medium px-2 py-1 flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" />
            Mark all read
          </button>
          <button onClick={onClose} className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-800/70 text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {notifications.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No notifications yet.</p>
        ) : (
          notifications.map((n) => {
            const isWithdrawalRejection =
              n.category === 'withdrawal' &&
              (n.title.toLowerCase().includes('rejected') ||
                n.message.toLowerCase().includes('rejected'));
            return (
              <div
                key={n.id}
                className={`rounded-2xl p-3.5 border transition-colors ${
                  isWithdrawalRejection
                    ? 'bg-rose-500/12 border-rose-500/45'
                    : n.read
                    ? 'bg-[#0A1630] border-blue-900/30'
                    : 'bg-[#142854] border-blue-500/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isWithdrawalRejection && (
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <p
                      className={`text-sm font-semibold truncate ${
                        isWithdrawalRejection ? 'text-rose-200' : 'text-white'
                      }`}
                    >
                      {n.title}
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {formatDateTime(n.createdAt)}
                  </span>
                </div>
                {isWithdrawalRejection && (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-rose-300 mt-1">
                    Admin Withdrawal Notice
                  </p>
                )}
                <p
                  className={`text-xs mt-1 leading-relaxed whitespace-pre-wrap ${
                    isWithdrawalRejection ? 'text-rose-100' : 'text-slate-300'
                  }`}
                >
                  {n.message}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  </div>
);
