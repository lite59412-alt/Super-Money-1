import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyAlciOARSZY1bxc707M5jK3ya6efYmh6Yk',
  authDomain: 'skillplay-1ba46.firebaseapp.com',
  projectId: 'skillplay-1ba46',
  storageBucket: 'skillplay-1ba46.firebasestorage.app',
  messagingSenderId: '37848703795',
  appId: '1:37848703795:web:c7604ef265e6eb040f1446',
  measurementId: 'G-4CW7SK5LW0',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Keep users persistently logged in across WebView / Capacitor Android APK restarts
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Unable to set browserLocalPersistence:', err);
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'app_config', 'connection_check'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration — Firestore client is offline.');
    }
  }
}

/**
 * Compresses an uploaded image file client-side via HTML <canvas> into a lightweight
 * JPEG Base64 data URL suitable for storing directly in Cloud Firestore (no Firebase Storage).
 */
export async function compressImageToBase64(
  file: File,
  maxWidth = 600,
  quality = 0.6
): Promise<string> {
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowed.includes(file.type.toLowerCase())) {
    throw new Error('Please select a PNG, JPG, or WebP image file.');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('Image file is too large (maximum 12 MB).');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(file);
  });

  return await new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;
      if (width > maxWidth) {
        const scale = maxWidth / width;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      // Guard against exceeding Firestore 1MB doc limit
      if (compressed.length > 450_000) {
        resolve(canvas.toDataURL('image/jpeg', Math.max(0.35, quality - 0.2)));
        return;
      }
      resolve(compressed);
    };
    img.onerror = () => reject(new Error('Selected file is not a valid image.'));
    img.src = rawDataUrl;
  });
}
