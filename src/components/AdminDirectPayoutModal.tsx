import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Phone,
  QrCode,
  Send,
  Smartphone,
  X,
} from 'lucide-react';
import { formatINR } from '../lib/api';
import type { UserProfile, WithdrawalRecord, WithdrawalStatus } from '../types';

interface AdminDirectPayoutModalProps {
  withdrawal: WithdrawalRecord;
  user?: UserProfile | null;
  onClose: () => void;
  onMarkStatus: (id: string, status: WithdrawalStatus) => Promise<void>;
}

const MOBILE_UPI_HANDLES = [
  { label: 'PhonePe (@ybl)', suffix: '@ybl' },
  { label: 'PhonePe (@ibl)', suffix: '@ibl' },
  { label: 'GPay (@okaxis)', suffix: '@okaxis' },
  { label: 'GPay (@okicici)', suffix: '@okicici' },
  { label: 'Paytm (@ptyes)', suffix: '@ptyes' },
];

export const AdminDirectPayoutModal: React.FC<AdminDirectPayoutModalProps> = ({
  withdrawal,
  user,
  onClose,
  onMarkStatus,
}) => {
  const savedUserUpi = user?.paymentMethods?.find((m) => m.type === 'upi')?.upiId || '';
  const initialUpi = (withdrawal.upiId || savedUserUpi || '').trim();
  const userMobile = (withdrawal.userMobile || user?.mobile || '').replace(/\D/g, '').slice(-10);

  const [payMode, setPayMode] = useState<'upi' | 'mobile'>(initialUpi ? 'upi' : 'mobile');
  const [customUpiId, setCustomUpiId] = useState<string>(initialUpi);
  const [mobileHandle, setMobileHandle] = useState<string>('@ybl');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedField, setCopiedField] = useState<'upi' | 'mobile' | 'bank' | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<WithdrawalStatus | null>(null);

  const resolvedPayeeUpi = useMemo(() => {
    if (payMode === 'upi') {
      return customUpiId.trim();
    }
    if (!userMobile) return '';
    return `${userMobile}${mobileHandle}`;
  }, [payMode, customUpiId, userMobile, mobileHandle]);

  const upiQuery = useMemo(() => {
    if (!resolvedPayeeUpi || !resolvedPayeeUpi.includes('@')) return '';
    const params = new URLSearchParams({
      pa: resolvedPayeeUpi,
      pn: withdrawal.userName || user?.name || 'Player',
      am: String(withdrawal.amount),
      cu: 'INR',
      tn: `Payout ${withdrawal.transactionId}`,
    });
    return params.toString();
  }, [resolvedPayeeUpi, withdrawal.userName, withdrawal.amount, withdrawal.transactionId, user?.name]);

  const upiUri = upiQuery ? `upi://pay?${upiQuery}` : '';
  const phonePeUri = upiQuery ? `phonepe://pay?${upiQuery}` : '';
  const gPayUri = upiQuery ? `tez://upi/pay?${upiQuery}` : '';
  const paytmUri = upiQuery ? `paytmmp://pay?${upiQuery}` : '';

  useEffect(() => {
    let active = true;
    if (!upiUri) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(upiUri, {
      width: 220,
      margin: 2,
      color: { dark: '#071126', light: '#FFFFFF' },
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

  const handleCopy = (field: 'upi' | 'mobile' | 'bank', value: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField((prev) => (prev === field ? null : prev)), 2000);
  };

  const handleStatusUpdate = async (nextStatus: WithdrawalStatus) => {
    setUpdatingStatus(nextStatus);
    try {
      await onMarkStatus(withdrawal.id, nextStatus);
      if (nextStatus === 'Completed') {
        onClose();
      }
    } finally {
      setUpdatingStatus(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="direct-payout-title"
    >
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl bg-[#0D1B38] border border-sky-500/40 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-blue-900/60 bg-gradient-to-r from-blue-600/20 via-sky-500/10 to-transparent">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
              Admin Direct Payout
            </p>
            <h2 id="direct-payout-title" className="text-lg font-bold text-white leading-tight">
              Pay {formatINR(withdrawal.amount)} to {withdrawal.userName}
            </h2>
            <p className="text-xs text-slate-400 font-mono-num mt-0.5">
              {withdrawal.userId} · {withdrawal.transactionId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close direct payout modal"
            className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-800/80 text-slate-300 hover:text-white flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* User Requested Payout Method Info */}
          <div className="rounded-2xl bg-[#071126] border border-blue-900/60 p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-400">Requested Method</span>
              <span className="font-semibold text-white uppercase">
                {withdrawal.methodType === 'upi' ? 'UPI Transfer' : 'Bank Account'}
              </span>
            </div>
            {withdrawal.methodType === 'upi' && withdrawal.upiId && (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400">Requested UPI ID</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono-num font-semibold text-sky-300">{withdrawal.upiId}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('upi', withdrawal.upiId!)}
                    className="p-1.5 rounded-lg bg-[#13264F] hover:bg-[#1B356B] text-blue-200"
                    title="Copy UPI ID"
                  >
                    {copiedField === 'upi' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )}
            {withdrawal.methodType === 'bank' && (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400">Bank Details</span>
                <div className="flex items-center gap-1.5 text-right">
                  <span className="font-mono-num text-slate-200">
                    {withdrawal.accountHolderName} · {withdrawal.accountNumber} · {withdrawal.ifscCode}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        'bank',
                        `${withdrawal.accountHolderName} | A/C: ${withdrawal.accountNumber} | IFSC: ${withdrawal.ifscCode}`
                      )
                    }
                    className="p-1.5 rounded-lg bg-[#13264F] hover:bg-[#1B356B] text-blue-200 shrink-0"
                    title="Copy Bank Details"
                  >
                    {copiedField === 'bank' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )}
            {userMobile && (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400">Registered Mobile</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono-num font-semibold text-white">+91 {userMobile}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('mobile', userMobile)}
                    className="p-1.5 rounded-lg bg-[#13264F] hover:bg-[#1B356B] text-blue-200"
                    title="Copy Mobile Number"
                  >
                    {copiedField === 'mobile' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Choose Pay Target: User UPI ID vs Mobile Number */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPayMode('upi')}
                className={`min-h-[42px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors ${
                  payMode === 'upi'
                    ? 'bg-sky-600/20 border-sky-400 text-white'
                    : 'bg-[#0A1630] border-blue-900/60 text-slate-300 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Pay to UPI ID</span>
              </button>
              <button
                type="button"
                onClick={() => setPayMode('mobile')}
                className={`min-h-[42px] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors ${
                  payMode === 'mobile'
                    ? 'bg-sky-600/20 border-sky-400 text-white'
                    : 'bg-[#0A1630] border-blue-900/60 text-slate-300 hover:text-white'
                }`}
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Pay to Mobile No.</span>
              </button>
            </div>

            {payMode === 'upi' ? (
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Recipient UPI ID
                </label>
                <input
                  type="text"
                  value={customUpiId}
                  onChange={(e) => setCustomUpiId(e.target.value)}
                  placeholder="e.g. username@okaxis or 9876543210@ybl"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-white font-mono-num text-sm focus:outline-none focus:border-sky-400"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs bg-[#071126] border border-blue-800/70 rounded-xl px-3.5 py-2.5">
                  <div>
                    <p className="text-[11px] text-slate-400">UPI Address via Mobile Number</p>
                    <p className="text-sm font-bold font-mono-num text-sky-300 mt-0.5">
                      {resolvedPayeeUpi || 'No mobile number on file'}
                    </p>
                  </div>
                  {userMobile && (
                    <button
                      type="button"
                      onClick={() => handleCopy('mobile', userMobile)}
                      className="min-h-[34px] px-3 rounded-lg bg-[#13264F] hover:bg-[#1B356B] text-xs font-semibold text-blue-200 inline-flex items-center gap-1"
                    >
                      {copiedField === 'mobile' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy No.</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MOBILE_UPI_HANDLES.map((h) => (
                    <button
                      key={h.suffix}
                      type="button"
                      onClick={() => setMobileHandle(h.suffix)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                        mobileHandle === h.suffix
                          ? 'bg-sky-600/25 border-sky-400 text-sky-200'
                          : 'bg-[#0A1630] border-blue-900/60 text-slate-300 hover:text-white'
                      }`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Direct Pay App Buttons (PhonePe / GPay / Paytm / Any UPI) */}
          {upiUri ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-sky-400" />
                <span>Open Payment App Directly ({formatINR(withdrawal.amount)})</span>
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                <a
                  href={phonePeUri}
                  className="min-h-[46px] px-3.5 rounded-xl bg-gradient-to-r from-[#5F259F] to-[#431875] hover:brightness-110 text-white text-xs font-bold flex items-center justify-between gap-2 transition-all"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center text-[11px] font-extrabold">
                      Pe
                    </span>
                    <span>PhonePe</span>
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </a>

                <a
                  href={gPayUri}
                  className="min-h-[46px] px-3.5 rounded-xl bg-gradient-to-r from-[#1A73E8] to-[#1557B0] hover:brightness-110 text-white text-xs font-bold flex items-center justify-between gap-2 transition-all"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center text-[11px] font-extrabold">
                      G
                    </span>
                    <span>Google Pay</span>
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </a>

                <a
                  href={paytmUri}
                  className="min-h-[46px] px-3.5 rounded-xl bg-gradient-to-r from-[#00BAF2] to-[#0077B6] hover:brightness-110 text-white text-xs font-bold flex items-center justify-between gap-2 transition-all"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center text-[11px] font-extrabold">
                      P
                    </span>
                    <span>Paytm UPI</span>
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </a>

                <a
                  href={upiUri}
                  className="min-h-[46px] px-3.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0284C7] hover:brightness-110 text-white text-xs font-bold flex items-center justify-between gap-2 transition-all"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center text-[11px] font-extrabold">
                      UPI
                    </span>
                    <span>Any UPI App</span>
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </a>
              </div>

              {/* Scannable QR Code for paying from Admin's phone */}
              {qrDataUrl && (
                <div className="rounded-2xl bg-[#071126] border border-blue-900/60 p-3.5 flex flex-col sm:flex-row items-center gap-4">
                  <div className="p-2 rounded-xl bg-white shrink-0">
                    <img
                      src={qrDataUrl}
                      alt={`UPI QR for ${resolvedPayeeUpi}`}
                      className="w-32 h-32 block"
                    />
                  </div>
                  <div className="space-y-1.5 text-center sm:text-left min-w-0">
                    <p className="text-xs font-bold text-white flex items-center justify-center sm:justify-start gap-1.5">
                      <QrCode className="w-3.5 h-3.5 text-sky-400" />
                      <span>Scan with PhonePe / GPay</span>
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Scan this QR from your PhonePe, GPay, or Paytm app to instantly send{' '}
                      <strong className="text-white font-mono-num">{formatINR(withdrawal.amount)}</strong>{' '}
                      to <strong className="text-sky-300 font-mono-num break-all">{resolvedPayeeUpi}</strong>.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-amber-500/12 border border-amber-400/40 px-4 py-3 text-xs text-amber-200">
              Enter a valid UPI ID (containing <span className="font-mono-num">@</span>) or switch to{' '}
              <strong>Pay to Mobile No.</strong> to launch PhonePe, GPay, or UPI QR.
            </div>
          )}

          {/* After Payment Confirmation Actions */}
          <div className="border-t border-blue-900/60 pt-4 space-y-2.5">
            <p className="text-[11px] text-slate-400">
              Once payment is sent from your UPI app, update the withdrawal status below:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={updatingStatus !== null}
                onClick={() => handleStatusUpdate('Processing')}
                className="min-h-[44px] px-4 rounded-xl bg-[#152954] hover:bg-[#1E3B75] disabled:opacity-50 text-xs font-semibold text-white"
              >
                {updatingStatus === 'Processing' ? 'Updating...' : 'Mark as Processing'}
              </button>
              <button
                type="button"
                disabled={updatingStatus !== null}
                onClick={() => handleStatusUpdate('Completed')}
                className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white inline-flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {updatingStatus === 'Completed' ? 'Completing...' : 'Payment Sent · Mark Paid'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
