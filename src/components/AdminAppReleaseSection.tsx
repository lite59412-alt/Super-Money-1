import React, { useCallback, useEffect, useState } from 'react';
import {
  Download,
  FileArchive,
  Link2,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react';
import {
  adminGetAppReleaseFirestore,
  adminSaveAppReleaseFirestore,
  formatDateTime,
  normalizeDirectApkUrl,
} from '../lib/api';
import type { AppReleaseConfig } from '../types';

interface AdminAppReleaseSectionProps {
  onNotify: (msg: string) => void;
  onError: (msg: string) => void;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const AdminAppReleaseSection: React.FC<AdminAppReleaseSectionProps> = ({
  onNotify,
  onError,
}) => {
  const [release, setRelease] = useState<AppReleaseConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [appName, setAppName] = useState('GameReward App');
  const [version, setVersion] = useState('1.0.0');
  const [fileName, setFileName] = useState('GameReward-v1.0.0.apk');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [fileSizeMb, setFileSizeMb] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [shareTemplate, setShareTemplate] = useState(
    'Install GameReward App & use my Referral Code {CODE} while signing up to earn bonus rewards!'
  );

  const loadRelease = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await adminGetAppReleaseFirestore();
        setRelease(res);
        setEnabled(Boolean(res.enabled));
        setAppName(res.appName || 'GameReward App');
        setVersion(res.version || '1.0.0');
        setFileName(res.fileName || 'GameReward-v1.0.0.apk');
        setDownloadUrl(res.downloadUrl || '');
        setFileSizeMb(
          res.fileSizeBytes > 0 ? String(Math.round((res.fileSizeBytes / (1024 * 1024)) * 10) / 10) : ''
        );
        setReleaseNotes(res.releaseNotes || '');
        setShareTemplate(
          res.shareMessageTemplate ||
            'Install GameReward App & use my Referral Code {CODE} while signing up to earn bonus rewards!'
        );
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Unable to load app release settings.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [onError]
  );

  useEffect(() => {
    loadRelease(false);
  }, [loadRelease]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawUrl = downloadUrl.trim();
    if (rawUrl && !/^https?:\/\//i.test(rawUrl)) {
      onError('Direct APK URL must start with https:// or http:// (e.g., GitHub Releases or Google Drive link).');
      return;
    }
    const cleanUrl = rawUrl ? normalizeDirectApkUrl(rawUrl) : '';

    setSaving(true);
    try {
      const sizeBytes =
        fileSizeMb.trim() && Number.isFinite(Number(fileSizeMb))
          ? Math.max(0, Math.round(Number(fileSizeMb) * 1024 * 1024))
          : 0;

      const saved = await adminSaveAppReleaseFirestore({
        enabled,
        appName: appName.trim() || 'GameReward App',
        version: version.trim() || '1.0.0',
        fileName: fileName.trim() || (cleanUrl ? 'GameReward.apk' : null),
        downloadUrl: cleanUrl || null,
        fileSizeBytes: sizeBytes,
        mimeType: 'application/vnd.android.package-archive',
        releaseNotes: releaseNotes.trim(),
        shareMessageTemplate: shareTemplate.trim(),
      });
      setRelease(saved);
      if (cleanUrl && cleanUrl !== rawUrl) {
        setDownloadUrl(cleanUrl);
      }
      onNotify(
        cleanUrl
          ? 'Direct no-login APK download link & referral share settings saved!'
          : 'App share settings saved.'
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to save app release settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveUrl = async () => {
    setRemoving(true);
    try {
      const saved = await adminSaveAppReleaseFirestore({
        fileName: null,
        downloadUrl: null,
        fileSizeBytes: 0,
      });
      setRelease(saved);
      setDownloadUrl('');
      setFileName('');
      setFileSizeMb('');
      setConfirmRemove(false);
      onNotify('App APK link cleared.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to clear app package.');
    } finally {
      setRemoving(false);
    }
  };

  if (loading && !release) {
    return (
      <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-10 text-center text-sm text-slate-400">
        Loading App Release &amp; Direct Share settings...
      </div>
    );
  }

  const hasFile = Boolean(release?.fileName && release?.downloadUrl);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">App APK &amp; Direct Referral Share</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Connect your direct Android APK link (GitHub Releases / Google Drive / CDN) in Firestore so users can share &amp; download the app directly from Refer &amp; Earn without needing Firebase Storage.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadRelease(false)}
          className="min-h-[38px] px-3.5 rounded-xl bg-[#13264F] hover:bg-[#1B356B] text-blue-200 text-xs font-semibold inline-flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Current Active APK Status */}
      <div className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileArchive className="w-4 h-4 text-emerald-400" />
            <span>Active Android App Package</span>
          </h3>
          <span
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
              hasFile && release?.enabled
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                : hasFile
                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                : 'bg-slate-700/50 text-slate-300 border border-slate-600/50'
            }`}
          >
            {hasFile && release?.enabled
              ? 'LIVE FOR USER SHARING'
              : hasFile
              ? 'CONFIGURED (SHARING PAUSED)'
              : 'NO APK LINK SET'}
          </span>
        </div>

        {hasFile && release ? (
          <div className="rounded-2xl bg-[#071126] border border-emerald-500/25 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-white truncate">{release.fileName}</p>
                <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-200 text-[11px] font-mono-num font-bold">
                  v{release.version}
                </span>
                {release.fileSizeBytes > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 text-[11px] font-mono-num font-semibold">
                    {formatFileSize(release.fileSizeBytes)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate">
                App: <span className="text-slate-200 font-semibold">{release.appName}</span>
                {release.uploadedAt ? ` · Updated ${formatDateTime(release.uploadedAt)}` : ''}
                {release.uploadedBy ? ` by ${release.uploadedBy}` : ''}
              </p>
              <p className="text-[11px] text-sky-300/90 font-mono-num truncate">
                {release.downloadUrl}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <a
                href={release.downloadUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Test Download</span>
              </a>

              {!confirmRemove ? (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  className="min-h-[40px] px-3.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Remove</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={removing}
                    onClick={handleRemoveUrl}
                    className="min-h-[40px] px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                  >
                    {removing ? 'Removing...' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                    className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-[#071126] border border-dashed border-blue-800/70 p-6 text-center space-y-1.5">
            <Smartphone className="w-7 h-7 text-slate-500 mx-auto" />
            <p className="text-sm font-semibold text-slate-200">No Android APK Link Configured</p>
            <p className="text-xs text-slate-400">
              Paste your GitHub Releases or direct <span className="font-mono-num text-blue-300">.apk</span> download URL below to enable direct app sharing in Refer &amp; Earn.
            </p>
          </div>
        )}
      </div>

      {/* App Details, Direct APK URL & Share Message Template Form */}
      <form
        onSubmit={handleSave}
        className="rounded-2xl bg-[#0D1B38] border border-blue-900/50 p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">APK Package URL &amp; Referral Share Message</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              100% Spark-plan Serverless — stored directly in Firestore <span className="font-mono-num text-blue-300">app_config/app_release</span>.
            </p>
          </div>

          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none px-3.5 py-2 rounded-xl bg-[#071126] border border-blue-900/60">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 accent-emerald-500 rounded"
            />
            <span className="text-xs font-bold text-white">
              {enabled ? 'Direct App Sharing Enabled' : 'Sharing Disabled'}
            </span>
          </label>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-sky-400" />
            <span>Direct APK Download URL (GitHub Releases / Drive / CDN)</span>
          </label>
          <input
            type="url"
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            placeholder="https://github.com/your-org/your-app/releases/latest/download/SkillPlay.apk"
            className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-sky-200 font-mono-num focus:outline-none focus:border-blue-500"
          />
          {downloadUrl.trim() && normalizeDirectApkUrl(downloadUrl) !== downloadUrl.trim() && (
            <p className="text-[11px] text-emerald-300 mt-1.5 font-mono-num break-all">
              Auto-converted to direct no-login APK link: {normalizeDirectApkUrl(downloadUrl)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Display App Name
            </label>
            <input
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              maxLength={80}
              placeholder="GameReward App"
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              App Version
            </label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              maxLength={30}
              placeholder="1.0.0"
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white font-mono-num focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              APK File Name
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              maxLength={80}
              placeholder="SkillPlay-v1.0.apk"
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white font-mono-num focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Approx Size (MB)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={fileSizeMb}
              onChange={(e) => setFileSizeMb(e.target.value)}
              placeholder="12.5"
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white font-mono-num focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Short Release Notes (optional)
          </label>
          <input
            type="text"
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            maxLength={300}
            placeholder="Latest official Android APK · Fast withdrawals & smooth games"
            className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Share Message Sent With App
            </label>
            <span className="text-[11px] font-mono-num text-amber-300">
              Use {'{CODE}'} for user&apos;s Referral Code
            </span>
          </div>
          <textarea
            rows={3}
            value={shareTemplate}
            onChange={(e) => setShareTemplate(e.target.value)}
            maxLength={500}
            placeholder="Install GameReward App & use my Referral Code {CODE} while signing up to earn bonus rewards!"
            className="w-full p-3.5 rounded-xl bg-[#071126] border border-blue-800/70 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
            <span>Only users with Firestore role &ldquo;admin&rdquo; can update app release settings.</span>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save App Release Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
