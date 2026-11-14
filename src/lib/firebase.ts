import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocsFromServer,
  getFirestore,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { getDownloadURL, getStorage, ref } from 'firebase/storage';

// Connected to the same Firebase project ("palm-metric-app") used by the Palm Metric Admin App
const firebaseConfig = {
  apiKey: 'AIzaSyBmmyvlE3GKl8PVc1LHNBZOsl_MkqCWPlo',
  authDomain: 'palm-metric-app.firebaseapp.com',
  projectId: 'palm-metric-app',
  storageBucket: 'palm-metric-app.firebasestorage.app',
  messagingSenderId: '522581928710',
  appId: '1:522581928710:web:993ecee99d938707fc8c87',
  measurementId: 'G-2JWQ84KMLT',
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const activeProjectId = firebaseConfig.projectId;

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
  path: string | null,
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocsFromServer(
      query(collection(db, 'menu'), where('inStock', '==', true), limit(1)),
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

const mediaAssetPromiseCache = new Map<string, Promise<string>>();

function extractMediaAssetId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const patterns = [
    /^firestore-media:\/\/([a-zA-Z0-9_-]+)$/i,
    /^firestore-media\/([a-zA-Z0-9_-]+)$/i,
    /^\/?mediaAssets\/([a-zA-Z0-9_-]+)$/i,
  ];
  for (const rx of patterns) {
    const m = trimmed.match(rx);
    if (m?.[1]) return m[1];
  }
  return null;
}

function toDataUrl(payload: string, mimeType: string): string {
  const trimmed = payload.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) return trimmed;
  return `data:${mimeType || 'image/jpeg'};base64,${trimmed}`;
}

async function fetchMediaAssetChunk(
  assetId: string,
  index: number,
): Promise<{ index: number; data: string } | null> {
  const candidateIds = [String(index), `chunk_${index}`, `chunk-${index}`];
  for (const chunkId of candidateIds) {
    const snap = await getDoc(doc(db, 'mediaAssets', assetId, 'chunks', chunkId));
    if (snap.exists()) {
      const d = snap.data();
      return {
        index: typeof d.index === 'number' ? d.index : index,
        data: typeof d.data === 'string' ? d.data : '',
      };
    }
  }
  return null;
}

async function loadMediaAssetFromFirestore(assetId: string): Promise<string> {
  try {
    const assetSnap = await getDoc(doc(db, 'mediaAssets', assetId));
    if (!assetSnap.exists()) return '';

    const data = assetSnap.data();
    const mimeType = typeof data.mimeType === 'string' ? data.mimeType : 'image/jpeg';

    if (typeof data.inlineData === 'string' && data.inlineData.trim().length > 0) {
      return toDataUrl(data.inlineData, mimeType);
    }

    const chunkCount = typeof data.chunkCount === 'number' ? data.chunkCount : 0;
    if (chunkCount > 0) {
      const chunkIndices = Array.from({ length: chunkCount }, (_, idx) => idx);
      const chunks = await Promise.all(
        chunkIndices.map((idx) => fetchMediaAssetChunk(assetId, idx)),
      );
      const validChunks = chunks
        .filter((c): c is { index: number; data: string } => Boolean(c && c.data))
        .sort((a, b) => a.index - b.index);
      if (validChunks.length > 0) {
        const joined = validChunks.map((c) => c.data).join('');
        return toDataUrl(joined, mimeType);
      }
    }

    return '';
  } catch (error) {
    console.warn('Unable to load Firestore mediaAsset:', assetId, error);
    return '';
  }
}

export async function resolveStorageUrl(rawUrl: string | undefined | null): Promise<string> {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  const assetId = extractMediaAssetId(trimmed);
  if (assetId) {
    const cached = mediaAssetPromiseCache.get(assetId);
    if (cached) return cached;

    const pending = loadMediaAssetFromFirestore(assetId).then((url) => {
      if (!url) mediaAssetPromiseCache.delete(assetId);
      return url;
    });
    mediaAssetPromiseCache.set(assetId, pending);
    return pending;
  }

  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  try {
    const storageRef = ref(storage, trimmed);
    return await getDownloadURL(storageRef);
  } catch (error) {
    console.warn('Unable to resolve Firebase Storage media path:', trimmed, error);
    return '';
  }
}
