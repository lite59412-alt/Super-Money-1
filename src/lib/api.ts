export {
  app,
  auth,
  compressImageToBase64,
  db,
  firebaseConfig,
  handleFirestoreError,
  OperationType,
  testConnection,
} from './firebase';

export * from './firebaseService';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Converts common cloud share links (Google Drive, Dropbox) into direct
 * no-login APK download URLs while preserving direct GitHub Releases / CDN links.
 */
export function normalizeDirectApkUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';

  // Google Drive: https://drive.google.com/file/d/{FILE_ID}/view?...
  const driveFileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (driveFileMatch?.[1]) {
    return `https://drive.google.com/uc?export=download&id=${driveFileMatch[1]}`;
  }

  // Google Drive: https://drive.google.com/open?id={FILE_ID} or uc?id={FILE_ID}
  const driveIdMatch = trimmed.match(/drive\.google\.com\/(?:open|uc)\?[^#]*\bid=([a-zA-Z0-9_-]+)/i);
  if (driveIdMatch?.[1]) {
    return `https://drive.google.com/uc?export=download&id=${driveIdMatch[1]}`;
  }

  // Dropbox: convert ?dl=0 to ?dl=1 (or append dl=1) for instant direct download
  if (/dropbox\.com\//i.test(trimmed)) {
    if (/[?&]dl=0\b/i.test(trimmed)) {
      return trimmed.replace(/([?&])dl=0\b/i, '$1dl=1');
    }
    if (!/[?&]dl=1\b/i.test(trimmed)) {
      return `${trimmed}${trimmed.includes('?') ? '&' : '?'}dl=1`;
    }
  }

  return trimmed;
}

