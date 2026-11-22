import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Gamepad2,
  KeyRound,
  LogIn,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import {
  firebaseForgotPassword,
  firebaseLogin,
  firebaseSignUp,
} from '../lib/firebaseService';
import { registerBackHandler } from '../lib/androidBridge';

const INDIAN_STATES = [
  'Maharashtra',
  'Karnataka',
  'Delhi',
  'Gujarat',
  'Rajasthan',
  'Uttar Pradesh',
  'Tamil Nadu',
  'West Bengal',
  'Madhya Pradesh',
  'Kerala',
  'Punjab',
  'Haryana',
  'Bihar',
  'Odisha',
];

interface AuthLandingPageProps {
  onAuthenticated: () => Promise<void>;
}

export const AuthLandingPage: React.FC<AuthLandingPageProps> = ({
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');

  // Form fields
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [stateName, setStateName] = useState('Maharashtra');
  const [referralCode, setReferralCode] = useState('');
  const [isAdultChecked, setIsAdultChecked] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  // Auto-apply referral code from query parameter (?ref=CODE) if present
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const refParam = (params.get('ref') || '').trim().toUpperCase();
      if (refParam && /^[A-Z0-9_-]{3,24}$/.test(refParam)) {
        setReferralCode(refParam);
        setMode('signup');
        setInfoMsg(`Referral code ${refParam} applied! Complete Sign Up to link your account.`);
      }
    } catch {
      // ignore invalid URL search params
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    if (!identifier.trim() || !password) {
      setError('Enter your Email ID and Password.');
      return;
    }
    setBusy(true);
    try {
      await firebaseLogin({ identifier: identifier.trim(), password });
      await onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid Email ID or Password.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    if (!isAdultChecked) {
      setError('You must confirm you are 18+ to create an account.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }
    setBusy(true);
    try {
      await firebaseSignUp({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        mobile: mobile.replace(/\D/g, ''),
        password,
        state: stateName,
        referralCode: referralCode.trim() || undefined,
      });
      await onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete sign up.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setBusy(true);
    try {
      const res = await firebaseForgotPassword(email || identifier);
      setInfoMsg(res.message);
      setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send password reset email.');
    } finally {
      setBusy(false);
    }
  };

  const modeRef = React.useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    return registerBackHandler(() => {
      if (modeRef.current !== 'login') {
        setMode('login');
        setError('');
        setInfoMsg('');
        return true;
      }
      return false;
    });
  }, []);

  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <div className="min-h-screen pt-safe-page pb-safe bg-[radial-gradient(ellipse_at_top,#152F68_0%,#091532_52%,#050B1A_100%)] text-slate-100 flex flex-col justify-center items-center px-4 pb-8">
      <div className="w-full max-w-md space-y-5">
        {/* Brand Hero Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-br from-blue-400 via-blue-600 to-indigo-800 border border-blue-300/40 flex items-center justify-center shadow-[0_12px_32px_rgba(37,99,235,0.45)]">
            <Gamepad2 className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            GameReward
          </h1>
          <p className="text-xs sm:text-sm text-blue-200/85">
            3D Arcade &amp; Casino Hub · Instant ₹100 Welcome Bonus + 30-Day Daily Rewards
          </p>
        </div>

        {/* Main Auth Card */}
        <div className="rounded-3xl bg-[#0C1A39]/95 border border-blue-700/45 shadow-[0_24px_60px_rgba(0,0,0,0.65)] overflow-hidden">
          {/* Login / Sign Up Switcher */}
          <div className="grid grid-cols-2 p-1.5 bg-[#071126] border-b border-blue-900/50">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
                setInfoMsg('');
              }}
              className={`min-h-[44px] rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition ${
                mode === 'login' || mode === 'forgot'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>Login</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError('');
                setInfoMsg('');
              }}
              className={`min-h-[44px] rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition ${
                mode === 'signup'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Sign Up</span>
            </button>
          </div>

          <div className="p-5 sm:p-6 space-y-4">
            {error && (
              <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-3.5 py-2.5 text-xs text-rose-200 font-medium">
                {error}
              </div>
            )}
            {infoMsg && (
              <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/40 px-3.5 py-2.5 text-xs text-emerald-200 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{infoMsg}</span>
              </div>
            )}

            {/* LOGIN FORM */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Gmail / Email ID
                  </label>
                  <input
                    type="email"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter your registered Gmail / Email ID"
                    className="w-full min-h-[48px] px-4 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm focus:outline-none focus:border-blue-400"
                    required
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setEmail(identifier.includes('@') ? identifier : '');
                        setError('');
                        setInfoMsg('');
                      }}
                      className="text-[11px] font-semibold text-blue-300 hover:text-blue-200"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full min-h-[48px] px-4 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm focus:outline-none focus:border-blue-400"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 hover:brightness-110 active:scale-[0.98] disabled:opacity-60 text-white font-extrabold text-sm shadow-lg shadow-blue-600/30 transition"
                >
                  {busy ? 'Signing In...' : 'Login to Play'}
                </button>
              </form>
            )}

            {/* SIGN UP FORM (Firebase Email/Password + Firestore Profile) */}
            {mode === 'signup' && (
              <form onSubmit={handleSignup} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rohit Kumar"
                    className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm focus:outline-none focus:border-emerald-400"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Gmail / Email ID
                  </label>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. yourname@gmail.com"
                    className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm focus:outline-none focus:border-emerald-400"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit mobile"
                      className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num text-sm focus:outline-none focus:border-emerald-400"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      State
                    </label>
                    <select
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      className="w-full min-h-[46px] px-3 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm"
                    >
                      {INDIAN_STATES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Password (min 8 chars)
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm focus:outline-none focus:border-emerald-400"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className={`w-full min-h-[46px] px-3.5 rounded-xl bg-[#071126] border text-white text-sm focus:outline-none ${
                      passwordsMismatch
                        ? 'border-rose-500/80 focus:border-rose-400'
                        : 'border-blue-800/70 focus:border-emerald-400'
                    }`}
                    required
                  />
                  {passwordsMismatch && (
                    <p className="text-[11px] text-rose-300 mt-1">
                      Passwords do not match.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Referral Code <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="e.g. A7K9M2"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num uppercase text-sm"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={isAdultChecked}
                    onChange={(e) => setIsAdultChecked(e.target.checked)}
                  />
                  <span>I confirm I am 18+ years old and accept Responsible Gaming Terms.</span>
                </label>

                <button
                  type="submit"
                  disabled={busy || passwordsMismatch}
                  className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-105 active:scale-[0.98] disabled:opacity-60 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{busy ? 'Creating Account...' : 'Sign Up & Start Playing'}</span>
                </button>
              </form>
            )}

            {/* FORGOT PASSWORD FORM (Firebase Email Reset) */}
            {mode === 'forgot' && (
              <form onSubmit={handleResetPassword} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-blue-400" />
                    Reset Password
                  </h2>
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-xs text-blue-300 hover:text-blue-200"
                  >
                    Back to Login
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Enter your registered Gmail / Email ID and we&apos;ll send a secure password reset link immediately.
                </p>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="yourname@gmail.com"
                  className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white text-sm"
                  required
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[46px] rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm"
                >
                  {busy ? 'Sending Reset Link...' : 'Send Password Reset Email'}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>18+ Only · Firebase Cloud Auth · Real-Time Synced Wallet</span>
        </p>
      </div>
    </div>
  );
};
