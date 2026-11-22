import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  FileArchive,
  Gamepad2,
  Gift,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { getPublicAppReleaseFirestore, normalizeDirectApkUrl } from '../lib/api';
import type { AppReleaseConfig } from '../types';

interface PublicApkDownloadPageProps {
  referralCode?: string;
  onContinueToApp: () => void;
}

function formatApkSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const PublicApkDownloadPage: React.FC<PublicApkDownloadPageProps> = ({
  referralCode,
  onContinueToApp,
}) => {
  const [release, setRelease] = useState<AppReleaseConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    let active = true;
    getPublicAppReleaseFirestore()
      .then((res) => {
        if (active) setRelease(res);
      })
      .catch(() => {
        if (active) setRelease(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const cleanRef = (referralCode || '').trim().toUpperCase();
  const directApkUrl = release?.downloadUrl ? normalizeDirectApkUrl(release.downloadUrl) : '';
  const hasApk = Boolean(release?.enabled && directApkUrl);
  const sizeLabel = release?.fileSizeBytes ? formatApkSize(release.fileSizeBytes) : '';

  const handleCopyCode = async () => {
    if (!cleanRef) return;
    try {
      await navigator.clipboard.writeText(cleanRef);
    } catch {
      // ignore clipboard errors
    }
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 2200);
  };

  return (
    <div className="min-h-screen bg-[#071126] text-slate-100 flex flex-col items-center justify-center p-4 pt-safe-top pb-safe">
      <div className="w-full max-w-md rounded-3xl bg-gradient-to-b from-[#0E2045] to-[#0A1630] border border-blue-800/60 p-6 shadow-2xl space-y-5">
        {/* App Header */}
        <div className="text-center space-y-2.5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 border border-blue-400/40 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <Gamepad2 className="w-8 h-8 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">
              Official Android App · No Login Needed
            </p>
            <h1 className="text-2xl font-extrabold text-white mt-1">
              {release?.appName || 'GameReward App'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Direct APK download — install in seconds and start playing right away.
            </p>
          </div>
        </div>

        {/* Friend Referral Code Card (if shared with ?ref=CODE) */}
        {cleanRef && (
          <div className="rounded-2xl bg-[#071126] border border-amber-400/35 p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5 shrink-0" />
                <span>Friend&apos;s Referral Code</span>
              </p>
              <p className="text-xl font-extrabold tracking-[0.18em] text-white font-mono-num mt-0.5">
                {cleanRef}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Use this code at signup to unlock your bonus
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="min-h-[42px] px-3.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-colors"
            >
              {copiedCode ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* APK Info & Direct Download Action */}
        <div className="rounded-2xl bg-[#071126] border border-blue-900/60 p-4 space-y-4">
          {loading ? (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
              <p className="text-xs">Preparing direct APK download...</p>
            </div>
          ) : hasApk && release ? (
            <>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-300 flex items-center justify-center shrink-0">
                  <FileArchive className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-sm font-bold text-white truncate">
                      {release.fileName || 'GameReward.apk'}
                    </p>
                    <span className="px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-200 text-[10px] font-mono-num font-bold">
                      v{release.version || '1.0.0'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono-num mt-0.5">
                    Android APK{sizeLabel ? ` · ${sizeLabel}` : ''} · Safe Verified Build
                  </p>
                </div>
              </div>

              {release.releaseNotes && (
                <p className="text-xs text-slate-300 leading-relaxed">{release.releaseNotes}</p>
              )}

              <a
                href={directApkUrl}
                download={release.fileName || 'GameReward.apk'}
                className="w-full min-h-[52px] px-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 hover:brightness-110 active:scale-[0.99] text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/25 transition"
              >
                <Download className="w-5 h-5" />
                <span>Download APK Directly</span>
              </a>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Instant download · No account or login required</span>
              </div>
            </>
          ) : (
            <div className="py-4 text-center space-y-2">
              <Smartphone className="w-7 h-7 text-slate-500 mx-auto" />
              <p className="text-sm font-semibold text-white">APK Package Updating</p>
              <p className="text-xs text-slate-400">
                The direct APK link is not published yet. You can still open the web app below.
              </p>
            </div>
          )}
        </div>

        {/* Continue to Web App / Login */}
        <button
          type="button"
          onClick={onContinueToApp}
          className="w-full min-h-[46px] px-4 rounded-2xl bg-[#13264F] hover:bg-[#1B356B] border border-blue-800/60 text-blue-100 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
        >
          <span>Open App / Login</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
