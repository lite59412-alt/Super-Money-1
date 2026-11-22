import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  ImagePlus,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  adminAddPaymentMethodFirestore,
  adminDeletePaymentMethodFirestore,
  adminGetPaymentMethodsFirestore,
  adminUpdatePaymentMethodFirestore,
  compressImageToBase64,
  formatDateTime,
} from '../lib/api';
import type { AdminDepositPaymentMethod } from '../types';

interface AdminPaymentMethodsSectionProps {
  onActionSuccess: (msg: string) => void;
  onActionError: (msg: string) => void;
  onParentRefresh?: () => void;
}

const AutoQrPreview: React.FC<{ upiId: string; merchantName: string; sizeClass?: string }> = ({
  upiId,
  merchantName,
  sizeClass = 'w-28 h-28',
}) => {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let active = true;
    const cleanUpi = upiId.trim();
    if (!cleanUpi) {
      setSrc('');
      return;
    }
    const uri = `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(
      merchantName.trim() || 'Merchant'
    )}&cu=INR`;
    QRCode.toDataURL(uri, {
      width: 240,
      margin: 2,
      color: { dark: '#071126', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc('');
      });
    return () => {
      active = false;
    };
  }, [upiId, merchantName]);

  if (!src) {
    return (
      <div
        className={`${sizeClass} rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center text-[10px] font-semibold`}
      >
        QR Preview
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={`Auto UPI QR for ${upiId}`}
      className={`${sizeClass} object-contain rounded-lg`}
    />
  );
};

// QR images are compressed on the client via shared Canvas helper (maxWidth 600px, JPEG 0.6)
// and saved directly inside Firestore `app_config/payment_methods` without Firebase Storage.

export const AdminPaymentMethodsSection: React.FC<AdminPaymentMethodsSectionProps> = ({
  onActionSuccess,
  onActionError,
  onParentRefresh,
}) => {
  const [methods, setMethods] = useState<AdminDepositPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Add / Edit form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [qrImageDataUrl, setQrImageDataUrl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [isPrimary, setIsPrimary] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadMethods = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await adminGetPaymentMethodsFirestore();
        setMethods(res.methods || []);
      } catch (err) {
        onActionError(
          err instanceof Error ? err.message : 'Unable to load deposit payment methods.'
        );
      } finally {
        setLoading(false);
      }
    },
    [onActionError]
  );

  useEffect(() => {
    loadMethods(false);
  }, [loadMethods]);

  const openAddForm = () => {
    setEditingId(null);
    setLabel('');
    setMerchantName('GameReward Official');
    setUpiId('');
    setInstructions('Scan QR or pay via UPI and submit your 12-digit UTR number.');
    setQrImageDataUrl(null);
    setIsActive(true);
    setIsPrimary(methods.length === 0);
    setShowForm(true);
  };

  const openEditForm = (m: AdminDepositPaymentMethod) => {
    setEditingId(m.id);
    setLabel(m.label);
    setMerchantName(m.merchantName);
    setUpiId(m.upiId);
    setInstructions(m.instructions || '');
    setQrImageDataUrl(m.qrImageDataUrl ?? null);
    setIsActive(m.isActive);
    setIsPrimary(m.isPrimary);
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setQrImageDataUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleQrFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToBase64(file, 600, 0.6);
      setQrImageDataUrl(dataUrl);
    } catch (err) {
      onActionError(err instanceof Error ? err.message : 'Unable to process QR code image.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLabel = label.trim();
    const cleanName = merchantName.trim();
    const cleanUpi = upiId.trim().toLowerCase();

    if (cleanLabel.length < 2) {
      onActionError('Enter a payment method label (e.g., PhonePe Business QR).');
      return;
    }
    if (cleanName.length < 2) {
      onActionError('Enter a payee display name.');
      return;
    }
    if (!/^[\w.-]+@[\w.-]+$/.test(cleanUpi)) {
      onActionError('Enter a valid UPI ID (e.g., yourname@okaxis or 9876543210@ybl).');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        label: cleanLabel,
        merchantName: cleanName,
        upiId: cleanUpi,
        instructions: instructions.trim(),
        qrImageDataUrl,
        isActive,
        isPrimary,
      };

      if (editingId) {
        const res = await adminUpdatePaymentMethodFirestore(editingId, payload);
        setMethods(res.methods);
        onActionSuccess(res.message);
      } else {
        const res = await adminAddPaymentMethodFirestore(payload);
        setMethods(res.methods);
        onActionSuccess(res.message);
      }
      resetForm();
      onParentRefresh?.();
    } catch (err) {
      onActionError(err instanceof Error ? err.message : 'Unable to save payment method.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetPrimary = async (m: AdminDepositPaymentMethod) => {
    setBusyId(m.id);
    try {
      const res = await adminUpdatePaymentMethodFirestore(m.id, {
        isPrimary: true,
        isActive: true,
      });
      setMethods(res.methods);
      onActionSuccess(`"${m.label}" is now the Primary Deposit QR & UPI method.`);
      onParentRefresh?.();
    } catch (err) {
      onActionError(err instanceof Error ? err.message : 'Unable to set primary payment method.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (m: AdminDepositPaymentMethod) => {
    setBusyId(m.id);
    try {
      const res = await adminUpdatePaymentMethodFirestore(m.id, {
        isActive: !m.isActive,
      });
      setMethods(res.methods);
      onActionSuccess(
        !m.isActive
          ? `"${m.label}" enabled for user deposits.`
          : `"${m.label}" disabled for user deposits.`
      );
      onParentRefresh?.();
    } catch (err) {
      onActionError(err instanceof Error ? err.message : 'Unable to update payment method status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      const res = await adminDeletePaymentMethodFirestore(id);
      setMethods(res.methods);
      setConfirmDeleteId(null);
      onActionSuccess(res.message);
      onParentRefresh?.();
    } catch (err) {
      onActionError(err instanceof Error ? err.message : 'Unable to delete payment method.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyUpi = (m: AdminDepositPaymentMethod) => {
    navigator.clipboard?.writeText(m.upiId).catch(() => {});
    setCopiedId(m.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  if (loading && methods.length === 0) {
    return (
      <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-10 text-center text-sm text-slate-400">
        Loading Deposit Payment Methods...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <QrCode className="w-5 h-5 text-sky-400" />
            <span>Deposit Payment Methods (QR &amp; UPI)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Add or edit your QR code image and UPI ID. Active methods appear live to users on the
            Add Money / Deposit screen.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadMethods(true)}
            className="min-h-[40px] px-3 rounded-xl bg-[#13264F] hover:bg-[#1B356B] text-xs font-semibold text-blue-200 inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={openAddForm}
            className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white inline-flex items-center gap-1.5 shadow-lg shadow-blue-600/25"
          >
            <Plus className="w-4 h-4" />
            <span>Add QR / UPI Method</span>
          </button>
        </div>
      </div>

      {/* Add / Edit QR & UPI Form */}
      {showForm && (
        <form
          onSubmit={handleSubmitForm}
          className="rounded-2xl bg-[#0D1B38] border border-sky-500/40 p-5 space-y-4 shadow-xl shadow-blue-950/50"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-blue-900/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-300 flex items-center justify-center">
                {editingId ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {editingId ? 'Edit Deposit QR & UPI Method' : 'Add New Deposit QR & UPI Method'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Upload your own PhonePe / GPay / Paytm QR image or leave blank to auto-generate QR
                  from UPI ID
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="w-8 h-8 rounded-lg bg-[#071126] hover:bg-[#13264F] text-slate-400 hover:text-white flex items-center justify-center"
              aria-label="Close form"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Inputs */}
            <div className="lg:col-span-7 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Method Label <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. PhonePe Business QR"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white focus:outline-none focus:border-sky-400"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Payee / Merchant Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    placeholder="e.g. GameReward Official"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white focus:outline-none focus:border-sky-400"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Merchant UPI ID <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. yourname@okaxis or 9876543210@ybl"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm font-mono-num text-sky-200 focus:outline-none focus:border-sky-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Payment Instructions for Users (Optional)
                </label>
                <textarea
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Scan this QR via PhonePe / GPay / Paytm and submit your 12-digit UTR."
                  className="w-full p-3 rounded-xl bg-[#071126] border border-blue-800/70 text-xs text-white focus:outline-none focus:border-sky-400 resize-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-500"
                  />
                  <span>Active (Visible to users for deposit)</span>
                </label>

                <label className="inline-flex items-center gap-2 text-xs text-amber-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPrimary}
                    onChange={(e) => {
                      setIsPrimary(e.target.checked);
                      if (e.target.checked) setIsActive(true);
                    }}
                    className="w-4 h-4 rounded accent-amber-400"
                  />
                  <span>Set as Primary Default QR &amp; UPI</span>
                </label>
              </div>
            </div>

            {/* Right QR Upload & Live Preview */}
            <div className="lg:col-span-5 rounded-2xl bg-[#071126] border border-blue-900/60 p-4 flex flex-col items-center justify-between gap-3">
              <div className="w-full flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-300">
                  {qrImageDataUrl ? 'Uploaded Custom QR Image' : 'Auto-Generated UPI QR'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md font-semibold ${
                    qrImageDataUrl
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-blue-500/15 text-blue-300'
                  }`}
                >
                  {qrImageDataUrl ? 'Custom QR' : 'Auto QR'}
                </span>
              </div>

              <div className="bg-white p-2.5 rounded-2xl shadow-lg">
                {qrImageDataUrl ? (
                  <img
                    src={qrImageDataUrl}
                    alt="Uploaded Merchant QR Code"
                    className="w-40 h-40 object-contain rounded-lg"
                  />
                ) : (
                  <AutoQrPreview
                    upiId={upiId}
                    merchantName={merchantName}
                    sizeClass="w-40 h-40"
                  />
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleQrFileChange}
                className="hidden"
              />

              <div className="w-full flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 min-h-[40px] px-3 rounded-xl bg-[#13264F] hover:bg-[#1B356B] border border-blue-700/60 text-xs font-semibold text-sky-200 inline-flex items-center justify-center gap-1.5"
                >
                  {qrImageDataUrl ? <Upload className="w-3.5 h-3.5" /> : <ImagePlus className="w-3.5 h-3.5" />}
                  <span>{qrImageDataUrl ? 'Change QR Image' : 'Upload QR Image'}</span>
                </button>
                {qrImageDataUrl && (
                  <button
                    type="button"
                    onClick={() => setQrImageDataUrl(null)}
                    className="min-h-[40px] px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-xs font-semibold text-rose-300"
                  >
                    Remove QR
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400 text-center">
                Supports PNG, JPG, or WebP screenshots of your PhonePe, GPay, Paytm, or BharatPe QR.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-blue-900/50">
            <button
              type="button"
              onClick={resetForm}
              className="min-h-[42px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[42px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white inline-flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>
                {saving
                  ? 'Saving...'
                  : editingId
                  ? 'Save Changes'
                  : 'Save Payment Method'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* List of Saved Deposit QR & UPI Methods */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {methods.map((m) => (
          <div
            key={m.id}
            className={`rounded-2xl bg-[#0D1B38] border p-4 space-y-4 transition-all ${
              m.isPrimary
                ? 'border-sky-400/60 shadow-lg shadow-blue-950/50'
                : m.isActive
                ? 'border-blue-900/60'
                : 'border-slate-800 opacity-75'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-bold text-white truncate">{m.label}</h3>
                  {m.isPrimary && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/35 text-amber-300 text-[10px] font-bold">
                      <Star className="w-3 h-3 fill-amber-300" />
                      Primary
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      m.isActive
                        ? 'bg-emerald-500/15 border border-emerald-500/35 text-emerald-300'
                        : 'bg-slate-700/60 border border-slate-600 text-slate-300'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    {m.isActive ? 'Live for Users' : 'Hidden'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Updated {formatDateTime(m.updatedAt)}
                </p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#071126] border border-blue-900/60 text-blue-300 font-semibold shrink-0">
                {m.qrImageDataUrl ? 'Custom QR' : 'Auto QR'}
              </span>
            </div>

            <div className="flex items-center gap-4 rounded-xl bg-[#071126] border border-blue-900/50 p-3">
              <div className="bg-white p-2 rounded-xl shrink-0">
                {m.qrImageDataUrl ? (
                  <img
                    src={m.qrImageDataUrl}
                    alt={`${m.label} QR`}
                    className="w-24 h-24 object-contain rounded"
                  />
                ) : (
                  <AutoQrPreview
                    upiId={m.upiId}
                    merchantName={m.merchantName}
                    sizeClass="w-24 h-24"
                  />
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-1.5">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase">Payee Name</p>
                  <p className="text-xs font-bold text-white truncate">{m.merchantName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase">UPI ID</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs font-mono-num font-bold text-sky-300 truncate">
                      {m.upiId}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopyUpi(m)}
                      className="p-1 rounded-md bg-[#13264F] hover:bg-[#1B356B] text-slate-300 hover:text-white shrink-0"
                      title="Copy UPI ID"
                    >
                      {copiedId === m.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
                {m.instructions && (
                  <p className="text-[11px] text-slate-400 line-clamp-2">{m.instructions}</p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openEditForm(m)}
                disabled={busyId === m.id}
                className="min-h-[36px] px-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/35 border border-blue-500/40 text-xs font-semibold text-blue-200 inline-flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>

              {!m.isPrimary && (
                <button
                  type="button"
                  onClick={() => handleSetPrimary(m)}
                  disabled={busyId === m.id}
                  className="min-h-[36px] px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-xs font-semibold text-amber-200 inline-flex items-center gap-1.5"
                >
                  <Star className="w-3.5 h-3.5" />
                  <span>Set Primary</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleToggleActive(m)}
                disabled={busyId === m.id || (m.isActive && methods.filter((x) => x.isActive).length <= 1)}
                className="min-h-[36px] px-3 rounded-xl bg-[#13264F] hover:bg-[#1B356B] disabled:opacity-40 text-xs font-semibold text-slate-200"
              >
                {m.isActive ? 'Hide' : 'Enable'}
              </button>

              {methods.length > 1 &&
                (confirmDeleteId === m.id ? (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      type="button"
                      onClick={() => handleDelete(m.id)}
                      disabled={busyId === m.id}
                      className="min-h-[36px] px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white"
                    >
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="min-h-[36px] px-2.5 rounded-xl bg-slate-800 text-xs text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(m.id)}
                    disabled={busyId === m.id}
                    className="min-h-[36px] px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-xs font-semibold text-rose-300 inline-flex items-center gap-1 ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
