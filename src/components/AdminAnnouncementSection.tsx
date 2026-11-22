import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Eye,
  Gift,
  Info,
  Megaphone,
  PowerOff,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
} from 'lucide-react';
import {
  adminGetAnnouncementFirestore,
  adminSaveAnnouncementFirestore,
  formatDateTime,
} from '../lib/api';
import type {
  AppAnnouncementConfig,
  AppAnnouncementHistoryItem,
  AppAnnouncementTone,
} from '../types';

interface AdminAnnouncementSectionProps {
  onNotify: (msg: string) => void;
  onError: (msg: string) => void;
}

const TONE_OPTIONS: {
  id: AppAnnouncementTone;
  label: string;
  desc: string;
  accent: string;
}[] = [
  {
    id: 'info',
    label: 'Important Info',
    desc: 'Blue notice style',
    accent: 'border-sky-400/50 bg-sky-500/15 text-sky-200',
  },
  {
    id: 'offer',
    label: 'Offer / Bonus',
    desc: 'Gold highlight style',
    accent: 'border-amber-400/50 bg-amber-500/15 text-amber-200',
  },
  {
    id: 'success',
    label: 'Good News',
    desc: 'Emerald success style',
    accent: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200',
  },
  {
    id: 'alert',
    label: 'Urgent Alert',
    desc: 'Rose warning style',
    accent: 'border-rose-400/50 bg-rose-500/15 text-rose-200',
  },
];

export const AdminAnnouncementSection: React.FC<AdminAnnouncementSectionProps> = ({
  onNotify,
  onError,
}) => {
  const [config, setConfig] = useState<AppAnnouncementConfig | null>(null);
  const [history, setHistory] = useState<AppAnnouncementHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editor state
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<AppAnnouncementTone>('info');
  const [buttonLabel, setButtonLabel] = useState('Got It');
  const [showMode, setShowMode] = useState<'every_open' | 'once_per_update'>('every_open');

  const loadAnnouncement = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await adminGetAnnouncementFirestore();
      if (res?.announcement) {
        setConfig(res.announcement);
        setEnabled(Boolean(res.announcement.enabled));
        setTitle(res.announcement.title || '');
        setMessage(res.announcement.message || '');
        setTone(res.announcement.tone || 'info');
        setButtonLabel(res.announcement.buttonLabel || 'Got It');
        setShowMode(res.announcement.showMode || 'every_open');
      }
      if (Array.isArray(res?.history)) {
        setHistory(res.history);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to load app notice settings.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    loadAnnouncement(false);
  }, [loadAnnouncement]);

  const handleSave = async (e: React.FormEvent, overrideEnabled?: boolean) => {
    e.preventDefault();
    const targetEnabled = typeof overrideEnabled === 'boolean' ? overrideEnabled : enabled;
    const trimmedTitle = title.trim();
    const trimmedMessage = message.trim();

    if (targetEnabled && !trimmedTitle && !trimmedMessage) {
      onError('Please enter a heading or message before turning ON the startup popup.');
      return;
    }

    setSaving(true);
    try {
      const res = await adminSaveAnnouncementFirestore({
        enabled: targetEnabled,
        title: trimmedTitle,
        message: trimmedMessage,
        tone,
        buttonLabel: buttonLabel.trim() || 'Got It',
        showMode,
      });
      if (res?.announcement) {
        setConfig(res.announcement);
        setEnabled(Boolean(res.announcement.enabled));
      }
      if (Array.isArray(res?.history)) {
        setHistory(res.history);
      }
      onNotify(
        targetEnabled
          ? 'Startup information popup is LIVE! All users will see it as soon as they open the app.'
          : 'Startup information popup turned OFF.'
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to save app notice.');
    } finally {
      setSaving(false);
    }
  };

  const applyFromHistory = (item: AppAnnouncementHistoryItem) => {
    setTitle(item.title);
    setMessage(item.message);
    setTone(item.tone);
    setButtonLabel(item.buttonLabel || 'Got It');
    setShowMode(item.showMode || 'every_open');
    setEnabled(true);
    onNotify('Loaded notice into editor. Click "Save & Publish Notice" to push it live.');
  };

  if (loading && !config) {
    return (
      <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-10 text-center text-sm text-slate-400">
        Loading App Notices &amp; Startup Information...
      </div>
    );
  }

  const previewToneStyles: Record<
    AppAnnouncementTone,
    { border: string; iconBg: string; badge: string; btn: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    info: {
      border: 'border-sky-400/45',
      iconBg: 'from-blue-500 to-sky-400 text-slate-950',
      badge: 'bg-sky-500/20 text-sky-200 border-sky-400/35',
      btn: 'from-blue-600 via-blue-500 to-sky-500 text-white',
      Icon: Info,
    },
    offer: {
      border: 'border-amber-400/45',
      iconBg: 'from-amber-400 to-orange-500 text-slate-950',
      badge: 'bg-amber-500/20 text-amber-200 border-amber-400/35',
      btn: 'from-amber-400 via-yellow-400 to-orange-500 text-slate-950',
      Icon: Gift,
    },
    success: {
      border: 'border-emerald-400/45',
      iconBg: 'from-emerald-400 to-teal-500 text-slate-950',
      badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/35',
      btn: 'from-emerald-500 to-teal-500 text-slate-950',
      Icon: CheckCircle2,
    },
    alert: {
      border: 'border-rose-400/45',
      iconBg: 'from-rose-500 to-orange-500 text-white',
      badge: 'bg-rose-500/20 text-rose-200 border-rose-400/35',
      btn: 'from-rose-600 to-orange-500 text-white',
      Icon: AlertTriangle,
    },
  };

  const activePreviewStyle = previewToneStyles[tone];
  const PreviewIcon = activePreviewStyle.Icon;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-300 flex items-center justify-center shrink-0">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-white">App Startup Information / Notices</h2>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                  config?.enabled
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/35'
                    : 'bg-slate-700/60 text-slate-300 border border-slate-600/50'
                }`}
              >
                {config?.enabled ? `ACTIVE · REV #${config.revision}` : 'OFF'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Share important updates, maintenance alerts, or bonus announcements. When enabled, this message pops up automatically as soon as users open the app.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadAnnouncement(false)}
          className="min-h-[38px] px-3.5 rounded-xl bg-[#13264F] hover:bg-[#1B356B] text-blue-200 text-xs font-semibold inline-flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Editor + Live Preview Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <form
          onSubmit={(e) => handleSave(e)}
          className="xl:col-span-7 rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-4"
        >
          {/* Enable Switch */}
          <div className="rounded-2xl bg-[#071126] border border-blue-900/60 p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <BellRing className={`w-4 h-4 ${enabled ? 'text-emerald-400' : 'text-slate-500'}`} />
              <div>
                <p className="text-xs font-bold text-white">Show Popup on App Open</p>
                <p className="text-[11px] text-slate-400">
                  Turn ON to show this notice automatically to every user when they open the app.
                </p>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4 accent-emerald-500"
              />
              <span className={`text-xs font-bold ${enabled ? 'text-emerald-300' : 'text-slate-400'}`}>
                {enabled ? 'ON' : 'OFF'}
              </span>
            </label>
          </div>

          {/* Heading */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Notice Heading / Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="e.g. Important Update · New Weekend Bonus Live!"
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Message Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Information Message for Users
              </label>
              <span className="text-[11px] font-mono-num text-slate-400">
                {message.length}/1500
              </span>
            </div>
            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1500}
              placeholder="Write any information you want users to see immediately when they open the app (supports line breaks)..."
              className="w-full p-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white focus:outline-none focus:border-blue-500 resize-y leading-relaxed"
            />
          </div>

          {/* Style Theme */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">Popup Style</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TONE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTone(opt.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    tone === opt.id
                      ? `${opt.accent} ring-1 ring-white/30`
                      : 'bg-[#071126] border-blue-900/50 text-slate-300 hover:border-blue-700/70'
                  }`}
                >
                  <p className="text-xs font-bold">{opt.label}</p>
                  <p className="text-[10px] opacity-80 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Button Label + Frequency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Close / Action Button Label
              </label>
              <input
                type="text"
                value={buttonLabel}
                onChange={(e) => setButtonLabel(e.target.value)}
                maxLength={40}
                placeholder="Got It"
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Display Frequency
              </label>
              <select
                value={showMode}
                onChange={(e) =>
                  setShowMode(e.target.value === 'once_per_update' ? 'once_per_update' : 'every_open')
                }
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="every_open">Every time user opens app</option>
                <option value="once_per_update">Once per published update</option>
              </select>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 min-h-[46px] px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Publishing...' : 'Save & Publish Notice'}</span>
            </button>
            {config?.enabled && (
              <button
                type="button"
                disabled={saving}
                onClick={(e) => handleSave(e, false)}
                className="min-h-[46px] px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-200 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <PowerOff className="w-4 h-4" />
                <span>Turn Off Popup</span>
              </button>
            )}
          </div>
        </form>

        {/* Live User Popup Preview */}
        <div className="xl:col-span-5 rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-200 uppercase tracking-wider inline-flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-blue-400" />
                <span>Live User Popup Preview</span>
              </span>
              <span className="text-[11px] text-slate-400">
                {enabled ? 'Will show on app open' : 'Currently OFF'}
              </span>
            </div>

            <div
              className={`rounded-3xl bg-gradient-to-b from-[#13295A] via-[#0C1B3B] to-[#081229] border ${activePreviewStyle.border} shadow-2xl overflow-hidden`}
            >
              <div className="px-4 py-3.5 border-b border-blue-800/50 flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${activePreviewStyle.iconBg} flex items-center justify-center shrink-0`}
                >
                  <PreviewIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${activePreviewStyle.badge}`}
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    Official Notice
                  </span>
                  <h4 className="text-sm font-extrabold text-white mt-1 break-words">
                    {title.trim() || 'Your Notice Heading Appears Here'}
                  </h4>
                </div>
              </div>

              <div className="px-4 py-4">
                <p className="text-xs sm:text-sm text-blue-100/90 whitespace-pre-line leading-relaxed break-words">
                  {message.trim() ||
                    'Write your announcement in the editor. Every user will see this message automatically as soon as they open the app.'}
                </p>
              </div>

              <div className="px-4 py-3.5 border-t border-blue-900/50 bg-[#081229]/90">
                <div
                  className={`w-full min-h-[42px] rounded-xl bg-gradient-to-r ${activePreviewStyle.btn} font-extrabold text-xs flex items-center justify-center`}
                >
                  {buttonLabel.trim() || 'Got It'}
                </div>
              </div>
            </div>
          </div>

          {config?.updatedAt && (
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>
                Last updated {formatDateTime(config.updatedAt)} by {config.updatedBy || 'Admin'}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Recent Published Notices History */}
      <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-3.5">
        <div>
          <h3 className="text-sm font-bold text-white">Recent Published Notices</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Quickly reuse a previous announcement by loading it into the editor.
          </p>
        </div>

        {history.length === 0 ? (
          <div className="rounded-xl bg-[#071126] border border-blue-900/40 p-5 text-center text-xs text-slate-400">
            No notices published yet.
          </div>
        ) : (
          <div className="space-y-2.5">
            {history.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="rounded-xl bg-[#071126] border border-blue-900/45 p-3.5 flex flex-wrap items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold text-white">{item.title || 'Untitled Notice'}</p>
                    <span className="px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 text-[10px] font-semibold uppercase">
                      {item.tone}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono-num">
                      {formatDateTime(item.publishedAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 whitespace-pre-line line-clamp-2">
                    {item.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => applyFromHistory(item)}
                  className="min-h-[34px] px-3 rounded-lg bg-[#13264F] hover:bg-[#1B356B] text-blue-200 text-[11px] font-semibold inline-flex items-center gap-1.5 shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Load into Editor</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
