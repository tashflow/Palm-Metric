import { doc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import type { ProductCustomizationConfig } from '../types';
import { normalizeCustomizationConfig } from './customization';
import { db } from './firebase';

export type CustomizationLoadStatus = 'loading' | 'ready' | 'none' | 'unavailable';

export interface CustomizationCacheEntry {
  config: ProductCustomizationConfig | null;
  status: Exclude<CustomizationLoadStatus, 'loading'>;
  fetchedAtMs: number;
}

const configMemoryCache = new Map<string, CustomizationCacheEntry>();
const pendingGets = new Map<string, Promise<CustomizationCacheEntry>>();

function extractUpdatedAtMs(raw: unknown): number | undefined {
  if (!raw) return undefined;
  if (raw instanceof Timestamp) return raw.toMillis();
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'toMillis' in raw &&
    typeof (raw as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (raw as { toMillis: () => number }).toMillis();
  }
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

export function getCachedProductCustomization(
  productId: string,
): CustomizationCacheEntry | undefined {
  return configMemoryCache.get(productId);
}

export function clearCustomizationCache(): void {
  configMemoryCache.clear();
  pendingGets.clear();
}

export function hasCachedRequiredCustomization(productId: string): boolean {
  const cached = configMemoryCache.get(productId);
  if (!cached || cached.status !== 'ready' || !cached.config || !cached.config.enabled) {
    return false;
  }
  return cached.config.groups.some((g) => g.enabled && g.required);
}

export async function fetchProductCustomizationOnce(
  productId: string,
): Promise<CustomizationCacheEntry> {
  const cleanId = productId.trim();
  if (!cleanId) {
    return { config: null, status: 'none', fetchedAtMs: Date.now() };
  }

  const cached = configMemoryCache.get(cleanId);
  if (cached && Date.now() - cached.fetchedAtMs < 60_000) {
    return cached;
  }

  const inflight = pendingGets.get(cleanId);
  if (inflight) return inflight;

  const task = (async (): Promise<CustomizationCacheEntry> => {
    try {
      const snap = await getDoc(doc(db, 'productCustomizations', cleanId));
      if (!snap.exists()) {
        const entry: CustomizationCacheEntry = {
          config: null,
          status: 'none',
          fetchedAtMs: Date.now(),
        };
        configMemoryCache.set(cleanId, entry);
        return entry;
      }

      const data = snap.data();
      const updatedAtMs = extractUpdatedAtMs(data.updatedAt);
      const parsed = normalizeCustomizationConfig(cleanId, data, updatedAtMs);
      const entry: CustomizationCacheEntry = {
        config: parsed,
        status: parsed ? 'ready' : 'none',
        fetchedAtMs: Date.now(),
      };
      configMemoryCache.set(cleanId, entry);
      return entry;
    } catch (error) {
      console.warn(`Customization config unavailable for productCustomizations/${cleanId}:`, error);
      return {
        config: null,
        status: 'unavailable',
        fetchedAtMs: Date.now(),
      };
    } finally {
      pendingGets.delete(cleanId);
    }
  })();

  pendingGets.set(cleanId, task);
  return task;
}

export function subscribeProductCustomization(
  productId: string,
  onUpdate: (entry: CustomizationCacheEntry) => void,
): () => void {
  const cleanId = productId.trim();
  if (!cleanId) {
    onUpdate({ config: null, status: 'none', fetchedAtMs: Date.now() });
    return () => {};
  }

  const cached = configMemoryCache.get(cleanId);
  if (cached) {
    onUpdate(cached);
  }

  const docRef = doc(db, 'productCustomizations', cleanId);
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        const entry: CustomizationCacheEntry = {
          config: null,
          status: 'none',
          fetchedAtMs: Date.now(),
        };
        configMemoryCache.set(cleanId, entry);
        onUpdate(entry);
        return;
      }

      const data = snapshot.data();
      const updatedAtMs = extractUpdatedAtMs(data.updatedAt);
      const parsed = normalizeCustomizationConfig(cleanId, data, updatedAtMs);
      const entry: CustomizationCacheEntry = {
        config: parsed,
        status: parsed ? 'ready' : 'none',
        fetchedAtMs: Date.now(),
      };
      configMemoryCache.set(cleanId, entry);
      onUpdate(entry);
    },
    (error) => {
      console.warn(
        `Real-time customization listener unavailable for productCustomizations/${cleanId}:`,
        error,
      );
      onUpdate({
        config: cached?.config ?? null,
        status: cached?.config ? cached.status : 'unavailable',
        fetchedAtMs: Date.now(),
      });
    },
  );
}
