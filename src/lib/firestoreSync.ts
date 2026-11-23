import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { canonicalizeProductId, MENU_ITEMS, CATEGORIES } from '../data/menu';
import type {
  Billboard,
  CoffeeOptionsSettings,
  Language,
  MediaType,
  MenuItem,
  Order,
  OrderLineItem,
  OrderRequest,
  OrderRequestCustomizationSelection,
  OrderRequestItem,
  OrderRequestStatus,
  OrderStatus,
  OrderType,
  SelectedCustomizationItem,
  StoreSettings,
} from '../types';
import { DEFAULT_COFFEE_OPTIONS } from './customization';
import {
  auth,
  db,
  ensureGuestFirebaseSession,
  handleFirestoreError,
  OperationType,
  resolveStorageUrl,
} from './firebase';
import { roundCurrency } from './format';

function inferMediaType(data: DocumentData, url: string): MediaType {
  const explicit = String(data.mediaType ?? data.type ?? '').toLowerCase();
  if (explicit === 'video' || explicit.startsWith('video/')) return 'video';
  if (explicit === 'image' || explicit.startsWith('image/')) return 'image';
  if (data.videoUrl && !data.imageUrl) return 'video';
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return 'video';
  return 'image';
}

function isBillboardActive(data: DocumentData): boolean {
  if (typeof data.isActive === 'boolean') return data.isActive;
  if (typeof data.active === 'boolean') return data.active;
  return true;
}

function isMenuItemInStock(data: DocumentData): boolean {
  if (typeof data.inStock === 'boolean') return data.inStock;
  if (typeof data.isAvailable === 'boolean') return data.isAvailable;
  if (typeof data.available === 'boolean') return data.available;
  return true;
}

function extractTimestampMs(val: unknown): number | undefined {
  if (!val) return undefined;
  if (val instanceof Timestamp) return val.toMillis();
  if (
    typeof val === 'object' &&
    val !== null &&
    'toMillis' in val &&
    typeof (val as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function pickRawImageField(data: DocumentData): string {
  const candidates = [
    data.imageUrl,
    data.storagePath,
    data.mediaUrl,
    data.photoUrl,
    data.image,
    data.url,
  ];
  for (const val of candidates) {
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return '';
}

function pickRawBillboardMediaField(data: DocumentData): string {
  const candidates = [
    data.mediaUrl,
    data.storagePath,
    data.videoUrl,
    data.imageUrl,
    data.image,
    data.url,
  ];
  for (const val of candidates) {
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return '';
}

function findLocalCatalogMatch(id: string, name: string) {
  const canonical = canonicalizeProductId(id).toLowerCase();
  const cleanId = id.trim().toLowerCase();
  const cleanName = name.trim().toLowerCase();
  return MENU_ITEMS.find(
    (item) =>
      item.id.toLowerCase() === canonical ||
      item.id.toLowerCase() === cleanId ||
      item.nameEn.toLowerCase() === cleanName ||
      item.nameAr.toLowerCase() === cleanName,
  );
}

function findCategoryArabicLabel(category: string): string | undefined {
  const clean = category.trim().toLowerCase();
  const found = CATEGORIES.find((c) => c.en.toLowerCase() === clean || c.id.toLowerCase() === clean);
  return found?.ar;
}

function parseOptionalString(val: unknown): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseStringList(val: unknown): string[] | undefined {
  if (Array.isArray(val)) {
    const cleaned = val
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (typeof val === 'string') {
    const cleaned = val
      .split(/[,،·/|]+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  return undefined;
}

export function subscribeBillboards(
  onData: (billboards: Billboard[]) => void,
  onError: (err: Error) => void,
): () => void {
  // Admin App's Firestore rules require filtering by isActive == true for public list queries
  const billboardsQuery = query(collection(db, 'billboards'), where('isActive', '==', true));

  return onSnapshot(
    billboardsQuery,
    async (snapshot) => {
      try {
        const activeDocs = snapshot.docs
          .map((d) => ({ id: d.id, data: d.data() }))
          .filter(({ data }) => isBillboardActive(data));

        const resolved = await Promise.all(
          activeDocs.map(async ({ id, data }) => {
            const rawMedia = pickRawBillboardMediaField(data);
            const mediaUrl = await resolveStorageUrl(rawMedia);
            const mediaType = inferMediaType(data, mediaUrl || rawMedia);

            return {
              id,
              title: String(data.title ?? 'Palm Metric'),
              titleAr: data.titleAr ? String(data.titleAr) : undefined,
              titleEn: data.titleEn ? String(data.titleEn) : undefined,
              subtitle: data.subtitle ? String(data.subtitle) : undefined,
              subtitleAr: data.subtitleAr ? String(data.subtitleAr) : undefined,
              subtitleEn: data.subtitleEn ? String(data.subtitleEn) : undefined,
              mediaUrl,
              mediaType,
              active: true,
              order: typeof data.order === 'number' ? data.order : 50,
              category: data.category ? String(data.category) : undefined,
              ctaLabel: data.ctaLabel ? String(data.ctaLabel) : undefined,
              badge: data.badge ? String(data.badge) : undefined,
              isOffer: Boolean(data.badge),
              sourceCollection: 'billboards',
            } satisfies Billboard;
          }),
        );

        resolved.sort((a, b) => a.order - b.order);
        onData(resolved.filter((b) => Boolean(b.mediaUrl || b.title)));
      } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'billboards');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

const FALLBACK_MENU_ITEMS: MenuItem[] = MENU_ITEMS.map((item, idx) => {
  const cat = CATEGORIES.find((c) => c.id === item.categoryId);
  return {
    id: item.id,
    name: item.nameEn,
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    description: '',
    price: item.price,
    category: cat?.en || 'Specialty',
    categoryAr: cat?.ar,
    imageUrl: '',
    inStock: true,
    supportsTemp: item.supportsTemp,
    order: idx,
    origin: item.origin,
    originAr: item.originAr,
    country: item.country,
    countryAr: item.countryAr,
  };
});

export function subscribeMenu(
  onData: (items: MenuItem[]) => void,
  onError: (err: Error) => void,
): () => void {
  // Admin App's Firestore rules require filtering by inStock == true for public list queries
  const menuQuery = query(collection(db, 'menu'), where('inStock', '==', true));

  return onSnapshot(
    menuQuery,
    async (snapshot) => {
      try {
        if (snapshot.empty) {
          onData(FALLBACK_MENU_ITEMS);
          return;
        }
        const resolved = await Promise.all(
          snapshot.docs.map(async (d) => {
            const data = d.data();
            const rawImage = pickRawImageField(data);
            const imageUrl = await resolveStorageUrl(rawImage);

            const name = String(data.name ?? 'Untitled Item');
            const categoryText = String(data.category ?? 'Signature');
            const localMatch = findLocalCatalogMatch(d.id, name);
            const localIdx = localMatch ? MENU_ITEMS.indexOf(localMatch) : -1;

            const nameAr = data.nameAr ? String(data.nameAr) : localMatch?.nameAr;
            const nameEn = data.nameEn ? String(data.nameEn) : name;
            const categoryArText = data.categoryAr
              ? String(data.categoryAr)
              : findCategoryArabicLabel(categoryText);

            const isCoffeeOfTheDay =
              d.id.toLowerCase().startsWith('cotd') ||
              /coffee\s*of\s*the\s*day|قهوة\s*اليوم/i.test(`${name} ${nameAr ?? ''}`);

            const price = Number(data.price ?? 0);

            return {
              id: d.id,
              name,
              nameAr,
              nameEn,
              description: String(data.description ?? ''),
              descriptionAr: parseOptionalString(data.descriptionAr),
              price: Number.isFinite(price) ? price : 0,
              originalPrice:
                typeof data.originalPrice === 'number' && Number.isFinite(data.originalPrice)
                  ? data.originalPrice
                  : undefined,
              isOffer: typeof data.isOffer === 'boolean' ? data.isOffer : undefined,
              offerLabel: parseOptionalString(data.offerLabel),
              category: categoryText,
              categoryAr: categoryArText,
              imageUrl,
              inStock: isMenuItemInStock(data),
              prepTime: parseOptionalString(data.prepTime),
              supportsTemp:
                isCoffeeOfTheDay ||
                Boolean(localMatch?.supportsTemp) ||
                Boolean(data.allowTemperature) ||
                Boolean(data.supportsTemp) ||
                /hot\s*\/\s*cold|حار\s*\/\s*بارد/i.test(`${name} ${nameAr ?? ''}`),
              allowMilkOption:
                typeof data.allowMilkOption === 'boolean' ? data.allowMilkOption : undefined,
              coconutMilkPrice:
                typeof data.coconutMilkPrice === 'number' &&
                Number.isFinite(data.coconutMilkPrice)
                  ? data.coconutMilkPrice
                  : undefined,
              allowTemperature:
                typeof data.allowTemperature === 'boolean' ? data.allowTemperature : undefined,
              order:
                typeof data.order === 'number'
                  ? data.order
                  : localIdx >= 0
                    ? localIdx
                    : undefined,
              origin: parseOptionalString(data.origin) ?? localMatch?.origin,
              originAr: parseOptionalString(data.originAr) ?? localMatch?.originAr,
              region: parseOptionalString(data.region),
              regionAr: parseOptionalString(data.regionAr),
              country: parseOptionalString(data.country) ?? localMatch?.country,
              countryAr: parseOptionalString(data.countryAr) ?? localMatch?.countryAr,
              processingMethod: parseOptionalString(data.processingMethod),
              processingMethodAr: parseOptionalString(data.processingMethodAr),
              roastLevel: parseOptionalString(data.roastLevel),
              altitude: parseOptionalString(data.altitude),
              variety: parseOptionalString(data.variety),
              tastingNotes: parseStringList(data.tastingNotes),
              tastingNotesAr: parseStringList(data.tastingNotesAr),
              brewMethods: parseStringList(data.brewMethods),
              producer: parseOptionalString(data.producer),
            } satisfies MenuItem;
          }),
        );

        resolved.sort((a, b) => {
          if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
          if (a.order !== undefined) return -1;
          if (b.order !== undefined) return 1;
          if (a.category !== b.category) return a.category.localeCompare(b.category);
          return a.name.localeCompare(b.name);
        });
        onData(resolved.length > 0 ? resolved : FALLBACK_MENU_ITEMS);
      } catch (err) {
        console.warn('Error processing menu snapshot, falling back to local catalog:', err);
        onData(FALLBACK_MENU_ITEMS);
      }
    },
    (error) => {
      console.warn('Menu Firestore query offline/unavailable, falling back to local catalog:', error);
      onData(FALLBACK_MENU_ITEMS);
    },
  );
}

export function subscribeStoreSettings(
  onData: (settings: StoreSettings) => void,
): () => void {
  let latestSettings: StoreSettings = {
    storeOpen: true,
    coffeeOptions: { ...DEFAULT_COFFEE_OPTIONS },
  };
  onData(latestSettings);

  // Admin App stores milk & temperature configuration at settings/coffeeOptions (public get)
  const coffeeOptionsRef = doc(db, 'settings', 'coffeeOptions');
  const unsubCoffee = onSnapshot(
    coffeeOptionsRef,
    (snap) => {
      if (!snap.exists()) {
        latestSettings = {
          ...latestSettings,
          coffeeOptions: { ...DEFAULT_COFFEE_OPTIONS },
        };
        onData(latestSettings);
        return;
      }
      const data = snap.data();
      const parsedCoffee: CoffeeOptionsSettings = {
        milkSelectionEnabled:
          typeof data.milkSelectionEnabled === 'boolean'
            ? data.milkSelectionEnabled
            : DEFAULT_COFFEE_OPTIONS.milkSelectionEnabled,
        coconutMilkExtraPrice:
          typeof data.coconutMilkExtraPrice === 'number' &&
          Number.isFinite(data.coconutMilkExtraPrice) &&
          data.coconutMilkExtraPrice >= 0
            ? roundCurrency(Math.min(500, data.coconutMilkExtraPrice))
            : DEFAULT_COFFEE_OPTIONS.coconutMilkExtraPrice,
        hotColdSelectionEnabled:
          typeof data.hotColdSelectionEnabled === 'boolean'
            ? data.hotColdSelectionEnabled
            : DEFAULT_COFFEE_OPTIONS.hotColdSelectionEnabled,
        updatedAtMs: extractTimestampMs(data.updatedAt),
      };
      latestSettings = {
        ...latestSettings,
        coffeeOptions: parsedCoffee,
      };
      onData(latestSettings);
    },
    (error) => {
      console.warn('settings/coffeeOptions listener unavailable, using defaults:', error);
    },
  );

  return () => {
    unsubCoffee();
  };
}

export class GuestFirebaseAuthUnavailableError extends Error {
  readonly code?: string;
  constructor(code?: string) {
    super(
      code
        ? `Guest Firebase session unavailable (${code}). Enable Anonymous Auth in Firebase Console.`
        : 'Guest Firebase session unavailable.',
    );
    this.name = 'GuestFirebaseAuthUnavailableError';
    this.code = code;
  }
}

export interface CreateOrderInput {
  orderType: OrderType;
  customerName: string;
  customerPhone: string;
  orderNote?: string;
  items: OrderLineItem[];
  total: number;
  lang?: Language;
}

function sanitizeSelectedCustomizations(
  items: SelectedCustomizationItem[] | undefined,
): SelectedCustomizationItem[] | undefined {
  if (!Array.isArray(items) || items.length === 0) return undefined;
  const cleaned = items.slice(0, 30).map((sel) => ({
    groupId: String(sel.groupId || '').slice(0, 80),
    groupName: String(sel.groupName || '').slice(0, 120),
    ...(sel.groupNameAr ? { groupNameAr: String(sel.groupNameAr).slice(0, 120) } : {}),
    optionId: String(sel.optionId || '').slice(0, 80),
    optionName: String(sel.optionName || '').slice(0, 120),
    ...(sel.optionNameAr ? { optionNameAr: String(sel.optionNameAr).slice(0, 120) } : {}),
    additionalPrice: roundCurrency(
      typeof sel.additionalPrice === 'number' &&
        Number.isFinite(sel.additionalPrice) &&
        sel.additionalPrice > 0
        ? Math.min(5000, sel.additionalPrice)
        : 0,
    ),
  }));
  return cleaned.length > 0 ? cleaned : undefined;
}

export interface CanonicalOrderPayload {
  orderNumber: string;
  customerUid: string;
  customerName: string;
  customerContact: string;
  items: Record<string, unknown>[];
  totalBill: number;
  status: 'Pending';
  notes: string;
}

export function buildCanonicalOrderPayload(
  input: CreateOrderInput,
  customerUid: string,
  orderNumber: string,
): CanonicalOrderPayload {
  const cleanUid = customerUid.trim();
  if (!cleanUid || cleanUid.length > 128) {
    throw new GuestFirebaseAuthUnavailableError('auth/missing-uid');
  }

  const customerName = input.customerName.trim().slice(0, 80);
  const customerContact = input.customerPhone.trim().slice(0, 80);
  const rawUserNote = input.orderNote?.trim() || '';

  if (!customerName) {
    throw new Error('Customer name is required.');
  }
  if (customerContact.length < 4) {
    throw new Error('Mobile number must be at least 4 characters.');
  }
  if (input.items.length === 0 || input.items.length > 50) {
    throw new Error('Order must include between 1 and 50 items.');
  }

  const sanitizedItems = input.items.slice(0, 50).map((item) => {
    const cleanQty = Math.max(1, Math.min(99, Math.round(item.quantity)));
    const cleanUnitPrice = roundCurrency(
      typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0
        ? Math.min(100000, item.price)
        : 0,
    );
    const selectedCustomizations = sanitizeSelectedCustomizations(item.selectedCustomizations);
    const specialInstructions = item.specialInstructions?.trim().slice(0, 160) || undefined;

    const entry: Record<string, unknown> = {
      itemId: item.itemId.slice(0, 128),
      name: item.name.slice(0, 120),
      price: cleanUnitPrice,
      quantity: cleanQty,
      note: (item.note || '').trim().slice(0, 240),
      imageUrl: item.imageUrl.startsWith('data:') ? '' : item.imageUrl.slice(0, 512),
    };

    if (item.nameAr) entry.nameAr = item.nameAr.slice(0, 120);
    if (typeof item.basePrice === 'number' && Number.isFinite(item.basePrice)) {
      entry.basePrice = roundCurrency(Math.max(0, item.basePrice));
    }
    if (
      typeof item.customizationTotal === 'number' &&
      Number.isFinite(item.customizationTotal)
    ) {
      entry.customizationTotal = roundCurrency(Math.max(0, item.customizationTotal));
    }
    if (selectedCustomizations) {
      entry.selectedCustomizations = selectedCustomizations;
    }
    if (specialInstructions) {
      entry.specialInstructions = specialInstructions;
    }
    if (item.temperature === 'Hot' || item.temperature === 'Cold') {
      entry.temperature = item.temperature;
    }
    if (
      item.milkOption === 'none' ||
      item.milkOption === 'regular' ||
      item.milkOption === 'coconut'
    ) {
      entry.milkOption = item.milkOption;
    }
    if (typeof item.milkExtraPrice === 'number' && Number.isFinite(item.milkExtraPrice)) {
      entry.milkExtraPrice = roundCurrency(Math.max(0, item.milkExtraPrice));
    }
    return entry;
  });

  const computedTotal = roundCurrency(
    sanitizedItems.reduce(
      (sum, it) => sum + Number(it.price) * Number(it.quantity),
      0,
    ),
  );
  const totalBill = roundCurrency(Math.max(0, Math.min(100000, computedTotal)));

  // Prefix concise Pickup indicator within Admin's 240-char notes cap
  const notes = rawUserNote ? `Pickup · ${rawUserNote}`.slice(0, 240) : 'Pickup';

  return {
    orderNumber,
    customerUid: cleanUid,
    customerName,
    customerContact,
    items: sanitizedItems,
    totalBill,
    status: 'Pending',
    notes,
  };
}

export class OrderRequestError extends Error {
  readonly code: string;
  readonly reasonCode?: string;

  constructor(code: string, message: string, reasonCode?: string) {
    super(message);
    this.name = 'OrderRequestError';
    this.code = code;
    this.reasonCode = reasonCode;
  }
}

export const BackendOrderError = OrderRequestError;

export interface CallableCreateOrderRequest {
  idempotencyKey: string;
  orderType: 'pickup';
  currency: 'SAR';
  lang?: Language;
  customerName: string;
  customerContact: string;
  orderNote?: string;
  items: Array<{
    itemId: string;
    quantity: number;
    temperature?: 'Hot' | 'Cold';
    specialInstructions?: string;
    selectedCustomizations?: Array<{
      groupId: string;
      optionId: string;
    }>;
  }>;
}

function fnv1aHex(input: string, seedOffset: number): string {
  let hash = (0x811c9dc5 ^ seedOffset) >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function computeDeterministicIdempotencyKey(
  checkoutFingerprint: string,
  attemptNonce: string,
): string {
  const cleanNonce = attemptNonce.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'attempt';
  const combined = `${checkoutFingerprint}::${cleanNonce}`;
  const h1 = fnv1aHex(combined, 0);
  const h2 = fnv1aHex(combined.split('').reverse().join(''), 0x9e3779b9);
  return `pm_${cleanNonce}_${h1}${h2}`.slice(0, 120);
}

export function computeStableOrderRequestId(
  customerUid: string,
  checkoutFingerprint: string,
  attemptNonce: string,
): string {
  const cleanNonce = attemptNonce.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28) || 'attempt';
  const combined = `${customerUid.trim()}::${checkoutFingerprint}::${cleanNonce}`;
  const h1 = fnv1aHex(combined, 0);
  const h2 = fnv1aHex(combined.split('').reverse().join(''), 0x9e3779b9);
  return `req_${cleanNonce}_${h1}${h2}`.slice(0, 120);
}

export function formatOrderRequestNumber(requestId: string): string {
  const tail = requestId.replace(/^req_/, '').replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
  return `REQ-${tail || 'NEW'}`;
}

export function buildCallableCreateOrderPayload(
  input: CreateOrderInput & { idempotencyKey: string },
): CallableCreateOrderRequest {
  if (input.orderType !== 'pickup') {
    throw new OrderRequestError('invalid-argument', 'Palm Metric supports pickup orders only.', 'INVALID_ORDER_TYPE');
  }

  const customerName = input.customerName.trim().slice(0, 80);
  const customerContact = input.customerPhone.trim().slice(0, 80);
  const orderNote = input.orderNote?.trim().slice(0, 220) || undefined;
  const idempotencyKey = input.idempotencyKey.trim();

  if (!idempotencyKey || idempotencyKey.length < 8) {
    throw new OrderRequestError('invalid-argument', 'Invalid idempotency key.', 'INVALID_IDEMPOTENCY_KEY');
  }
  if (!customerName) {
    throw new OrderRequestError('invalid-argument', 'Customer name is required.', 'INVALID_CUSTOMER_NAME');
  }
  if (customerContact.length < 4) {
    throw new OrderRequestError('invalid-argument', 'Mobile number must be at least 4 characters.', 'INVALID_CUSTOMER_CONTACT');
  }
  if (input.items.length === 0 || input.items.length > 50) {
    throw new OrderRequestError('invalid-argument', 'Order must include between 1 and 50 items.', 'ITEMS_COUNT_OUT_OF_RANGE');
  }

  return {
    idempotencyKey,
    orderType: 'pickup',
    currency: 'SAR',
    ...(input.lang ? { lang: input.lang } : {}),
    customerName,
    customerContact,
    ...(orderNote ? { orderNote } : {}),
    items: input.items.slice(0, 50).map((item) => {
      const cleanQty = Math.max(1, Math.min(99, Math.round(item.quantity)));
      const specialInstructions = item.specialInstructions?.trim().slice(0, 160) || undefined;
      const selectedCustomizations =
        Array.isArray(item.selectedCustomizations) && item.selectedCustomizations.length > 0
          ? item.selectedCustomizations.slice(0, 30).map((sel) => ({
              groupId: String(sel.groupId || '').trim().slice(0, 80),
              optionId: String(sel.optionId || '').trim().slice(0, 80),
            }))
          : undefined;

      return {
        itemId: canonicalizeProductId(item.itemId).slice(0, 128),
        quantity: cleanQty,
        ...(item.temperature === 'Hot' || item.temperature === 'Cold'
          ? { temperature: item.temperature }
          : {}),
        ...(specialInstructions ? { specialInstructions } : {}),
        ...(selectedCustomizations ? { selectedCustomizations } : {}),
      };
    }),
  };
}

export interface CreateOrderRequestItemInput {
  itemId: string;
  name?: string;
  nameAr?: string;
  quantity: number;
  selectedSizeId?: string;
  temperature?: 'Hot' | 'Cold';
  milkOption?: 'none' | 'regular' | 'coconut';
  specialInstructions?: string;
  selectedCustomizations?: Array<{
    groupId: string;
    groupName?: string;
    optionId: string;
    optionName?: string;
  }>;
}

export interface CreateOrderRequestInput {
  requestId?: string;
  attemptNonce?: string;
  orderType: OrderType;
  customerName: string;
  customerPhone: string;
  orderNote?: string;
  items: CreateOrderRequestItemInput[];
  lang?: Language;
}

export interface CustomerOrderRequestWritePayload {
  requestId: string;
  customerUid: string;
  customerName: string;
  customerContact: string;
  orderType: 'pickup';
  currency: 'SAR';
  lang?: Language;
  orderNote?: string;
  items: OrderRequestItem[];
  status: 'pending_review';
  requestSource: 'customer-app-spark';
}

const VALID_ID_RX = /^[a-zA-Z0-9_-]{1,128}$/;

function inferSizeIdFromSelectionOrProduct(
  item: CreateOrderRequestItemInput,
  canonicalId: string,
): string | undefined {
  if (typeof item.selectedSizeId === 'string' && item.selectedSizeId.trim()) {
    return item.selectedSizeId.trim().slice(0, 80);
  }
  const sizeSelection = item.selectedCustomizations?.find(
    (sel) =>
      /^(size|cup[-_]?size)$/i.test(sel.groupId.trim()) ||
      /size|حجم/i.test(`${sel.groupId} ${sel.groupName ?? ''}`),
  );
  if (sizeSelection?.optionId.trim()) {
    return sizeSelection.optionId.trim().slice(0, 80);
  }
  if (canonicalId.endsWith('-small')) return 'small';
  if (canonicalId.endsWith('-large')) return 'large';
  return undefined;
}

function inferMilkSelectionFromCustomizations(
  item: CreateOrderRequestItemInput,
): 'none' | 'regular' | 'coconut' | undefined {
  if (
    item.milkOption === 'none' ||
    item.milkOption === 'regular' ||
    item.milkOption === 'coconut'
  ) {
    return item.milkOption;
  }
  const milkSel = item.selectedCustomizations?.find(
    (sel) =>
      sel.groupId === 'legacy-milk' ||
      /milk|حليب/i.test(`${sel.groupId} ${sel.groupName ?? ''} ${sel.optionName ?? ''}`),
  );
  if (!milkSel) return undefined;
  const blob = `${milkSel.optionId} ${milkSel.optionName ?? ''}`.toLowerCase();
  if (/coconut|جوز\s*الهند/.test(blob)) return 'coconut';
  if (/regular|عادي/.test(blob)) return 'regular';
  return undefined;
}

export function buildCustomerOrderRequestPayload(
  input: CreateOrderRequestInput,
  customerUid: string,
  requestId: string,
): CustomerOrderRequestWritePayload {
  const cleanUid = typeof customerUid === 'string' ? customerUid.trim() : '';
  if (!cleanUid || cleanUid.length > 128) {
    throw new GuestFirebaseAuthUnavailableError('auth/missing-uid');
  }

  const cleanRequestId = typeof requestId === 'string' ? requestId.trim() : '';
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(cleanRequestId)) {
    throw new OrderRequestError(
      'invalid-argument',
      'Invalid order request reference ID.',
      'INVALID_REQUEST_ID',
    );
  }

  if (input.orderType !== 'pickup') {
    throw new OrderRequestError(
      'invalid-argument',
      'Palm Metric supports pickup order requests only.',
      'INVALID_ORDER_TYPE',
    );
  }

  const customerName = typeof input.customerName === 'string' ? input.customerName.trim().slice(0, 80) : '';
  const customerContact = typeof input.customerPhone === 'string' ? input.customerPhone.trim().slice(0, 80) : '';
  const orderNote = typeof input.orderNote === 'string' ? input.orderNote.trim().slice(0, 220) || undefined : undefined;

  if (!customerName) {
    throw new OrderRequestError('invalid-argument', 'Customer name is required.', 'INVALID_CUSTOMER_NAME');
  }
  if (customerContact.length < 4) {
    throw new OrderRequestError(
      'invalid-argument',
      'Mobile number must be at least 4 characters.',
      'INVALID_CUSTOMER_CONTACT',
    );
  }
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 50) {
    throw new OrderRequestError(
      'invalid-argument',
      'Order request must include between 1 and 50 items.',
      'ITEMS_COUNT_OUT_OF_RANGE',
    );
  }

  const sanitizedItems: OrderRequestItem[] = input.items.map((rawItem) => {
    const rawId = typeof rawItem?.itemId === 'string' ? rawItem.itemId.trim() : '';
    const canonicalId = rawId ? canonicalizeProductId(rawId).trim() : '';
    if (!canonicalId || !VALID_ID_RX.test(canonicalId)) {
      throw new OrderRequestError(
        'invalid-argument',
        'Each item in the request must have a valid product item ID.',
        'INVALID_ITEM_ID',
      );
    }

    if (
      typeof rawItem.quantity !== 'number' ||
      !Number.isFinite(rawItem.quantity) ||
      !Number.isInteger(rawItem.quantity) ||
      rawItem.quantity < 1 ||
      rawItem.quantity > 99
    ) {
      throw new OrderRequestError(
        'invalid-argument',
        'Item quantity must be a whole number between 1 and 99.',
        'INVALID_QUANTITY',
      );
    }

    const selectedCustomizations: OrderRequestCustomizationSelection[] | undefined = Array.isArray(
      rawItem.selectedCustomizations,
    )
      ? rawItem.selectedCustomizations
          .slice(0, 30)
          .map((sel) => ({
            groupId: typeof sel?.groupId === 'string' ? sel.groupId.trim().slice(0, 80) : '',
            optionId: typeof sel?.optionId === 'string' ? sel.optionId.trim().slice(0, 80) : '',
          }))
          .filter((sel) => sel.groupId.length > 0 && sel.optionId.length > 0)
      : undefined;

    const selectedSizeId = inferSizeIdFromSelectionOrProduct(rawItem, canonicalId);
    const milkOption = inferMilkSelectionFromCustomizations(rawItem);
    const specialInstructions =
      typeof rawItem.specialInstructions === 'string'
        ? rawItem.specialInstructions.trim().slice(0, 160) || undefined
        : undefined;
    const cleanName =
      typeof rawItem.name === 'string' && rawItem.name.trim()
        ? rawItem.name.trim().slice(0, 120)
        : undefined;
    const cleanNameAr =
      typeof rawItem.nameAr === 'string' && rawItem.nameAr.trim()
        ? rawItem.nameAr.trim().slice(0, 120)
        : undefined;

    const entry: OrderRequestItem = {
      itemId: canonicalId,
      quantity: rawItem.quantity,
    };
    if (cleanName) entry.name = cleanName;
    if (cleanNameAr) entry.nameAr = cleanNameAr;
    if (selectedSizeId) entry.selectedSizeId = selectedSizeId;
    if (selectedCustomizations && selectedCustomizations.length > 0) {
      entry.selectedCustomizations = selectedCustomizations;
    }
    if (rawItem.temperature === 'Hot' || rawItem.temperature === 'Cold') {
      entry.temperature = rawItem.temperature;
    }
    if (milkOption) {
      entry.milkOption = milkOption;
    }
    if (specialInstructions) {
      entry.specialInstructions = specialInstructions;
    }

    return entry;
  });

  return {
    requestId: cleanRequestId,
    customerUid: cleanUid,
    customerName,
    customerContact,
    orderType: 'pickup',
    currency: 'SAR',
    ...(input.lang ? { lang: input.lang } : {}),
    ...(orderNote ? { orderNote } : {}),
    items: sanitizedItems,
    status: 'pending_review',
    requestSource: 'customer-app-spark',
  };
}

export interface OrderRequestPersistenceAdapter {
  ensureSession: () => Promise<{ user: { uid: string } | null; errorCode?: string }>;
  getExistingRequest: (requestId: string) => Promise<DocumentData | null>;
  createRequestDoc: (requestId: string, payload: Record<string, unknown>) => Promise<void>;
  serverTimestampValue: () => unknown;
}

const defaultOrderRequestAdapter: OrderRequestPersistenceAdapter = {
  ensureSession: ensureGuestFirebaseSession,
  async getExistingRequest(requestId: string): Promise<DocumentData | null> {
    const snap = await getDoc(doc(db, 'orderRequests', requestId));
    return snap.exists() ? snap.data() : null;
  },
  async createRequestDoc(requestId: string, payload: Record<string, unknown>): Promise<void> {
    await setDoc(doc(db, 'orderRequests', requestId), payload);
  },
  serverTimestampValue: () => serverTimestamp(),
};

function normalizeFirestoreErrorCode(err: unknown): string {
  const raw =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code ?? '')
      : '';
  return raw.trim().toLowerCase() || 'unknown';
}

export function normalizeOrderRequestStatus(raw: unknown): OrderRequestStatus {
  const val = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (val === 'pending_review' || val === 'pending') return 'pending_review';
  if (val === 'reviewing' || val === 'in_review') return 'reviewing';
  if (val === 'verified') return 'verified';
  if (val === 'order_created') return 'order_created';
  if (val === 'approved') return 'approved';
  if (val === 'rejected' || val === 'declined') return 'rejected';
  if (val === 'cancelled' || val === 'canceled') return 'cancelled';
  return 'pending_review';
}

export function mapOrderRequestSnapshot(id: string, data: DocumentData): OrderRequest {
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items: OrderRequestItem[] = rawItems.map((it: DocumentData) => {
    const itemId = String(it?.itemId ?? '');
    const catalogMatch = findLocalCatalogMatch(itemId, String(it?.name ?? ''));
    const selectedCustomizations = Array.isArray(it?.selectedCustomizations)
      ? it.selectedCustomizations
          .map((sel: DocumentData) => ({
            groupId: String(sel?.groupId ?? ''),
            optionId: String(sel?.optionId ?? ''),
          }))
          .filter((sel: OrderRequestCustomizationSelection) => sel.groupId && sel.optionId)
      : undefined;

    return {
      itemId,
      name: it?.name ? String(it.name) : catalogMatch?.nameEn,
      nameAr: it?.nameAr ? String(it.nameAr) : catalogMatch?.nameAr,
      quantity:
        typeof it?.quantity === 'number' && Number.isFinite(it.quantity)
          ? Math.max(1, Math.min(99, Math.round(it.quantity)))
          : 1,
      selectedSizeId: it?.selectedSizeId ? String(it.selectedSizeId) : undefined,
      selectedCustomizations:
        selectedCustomizations && selectedCustomizations.length > 0
          ? selectedCustomizations
          : undefined,
      temperature:
        it?.temperature === 'Hot' || it?.temperature === 'Cold' ? it.temperature : undefined,
      milkOption:
        it?.milkOption === 'none' ||
        it?.milkOption === 'regular' ||
        it?.milkOption === 'coconut'
          ? it.milkOption
          : undefined,
      specialInstructions: it?.specialInstructions ? String(it.specialInstructions) : undefined,
    };
  });

  const requestId = typeof data.requestId === 'string' && data.requestId ? data.requestId : id;
  const rawVerifiedPricing =
    data.verifiedPricing && typeof data.verifiedPricing === 'object'
      ? (data.verifiedPricing as OrderRequest['verifiedPricing'])
      : undefined;
  const verifiedTotalSar =
    typeof data.verifiedTotalSar === 'number' && Number.isFinite(data.verifiedTotalSar)
      ? data.verifiedTotalSar
      : rawVerifiedPricing && typeof rawVerifiedPricing.totalBillSar === 'number'
        ? rawVerifiedPricing.totalBillSar
        : undefined;

  return {
    id,
    requestId,
    requestNumber: formatOrderRequestNumber(requestId),
    customerUid: String(data.customerUid ?? ''),
    customerName: String(data.customerName ?? 'Guest'),
    customerContact: String(data.customerContact ?? ''),
    orderType: 'pickup',
    currency: 'SAR',
    lang: data.lang === 'ar' || data.lang === 'en' ? data.lang : undefined,
    orderNote: data.orderNote ? String(data.orderNote) : undefined,
    items,
    status: normalizeOrderRequestStatus(data.status),
    requestSource: data.requestSource ? String(data.requestSource) : undefined,
    reviewedBy: data.reviewedBy ? String(data.reviewedBy) : undefined,
    reviewedAtMs: extractTimestampMs(data.reviewedAt),
    verifiedBy: data.verifiedBy ? String(data.verifiedBy) : undefined,
    verifiedAtMs: extractTimestampMs(data.verifiedAt),
    verifiedTotalSar,
    verifiedPricing: rawVerifiedPricing,
    approvedBy: data.approvedBy ? String(data.approvedBy) : undefined,
    approvedAtMs: extractTimestampMs(data.approvedAt),
    approvedOrderId: data.approvedOrderId ? String(data.approvedOrderId) : undefined,
    approvedOrderNumber: data.approvedOrderNumber ? String(data.approvedOrderNumber) : undefined,
    rejectedBy: data.rejectedBy ? String(data.rejectedBy) : undefined,
    rejectedAtMs: extractTimestampMs(data.rejectedAt),
    rejectionReason: data.rejectionReason ? String(data.rejectionReason) : undefined,
    createdAtMs: extractTimestampMs(data.createdAt),
    updatedAtMs: extractTimestampMs(data.updatedAt),
  };
}

export async function submitCustomerOrderRequest(
  input: CreateOrderRequestInput,
  adapter: OrderRequestPersistenceAdapter = defaultOrderRequestAdapter,
): Promise<OrderRequest> {
  const session = await adapter.ensureSession();
  const realUid = session.user?.uid;
  if (!realUid) {
    throw new GuestFirebaseAuthUnavailableError(session.errorCode);
  }

  const fingerprint = `${input.customerPhone.trim()}::${input.items
    .map((i) => `${canonicalizeProductId(i.itemId)}x${i.quantity}`)
    .join(',')}`;
  const requestId =
    input.requestId && /^[a-zA-Z0-9_-]{8,128}$/.test(input.requestId.trim())
      ? input.requestId.trim()
      : computeStableOrderRequestId(
          realUid,
          fingerprint,
          input.attemptNonce || `r_${Date.now().toString(36)}`,
        );

  const payload = buildCustomerOrderRequestPayload(input, realUid, requestId);

  try {
    const existing = await adapter.getExistingRequest(requestId);
    if (existing && String(existing.customerUid ?? '') === realUid) {
      return {
        ...mapOrderRequestSnapshot(requestId, existing),
        duplicatePrevented: true,
      };
    }
  } catch {
    // Proceed cleanly to write attempt if pre-read fails (e.g. strict offline / get-rule on missing doc)
  }

  const firestoreDoc: Record<string, unknown> = {
    ...payload,
    createdAt: adapter.serverTimestampValue(),
    updatedAt: adapter.serverTimestampValue(),
  };

  try {
    await adapter.createRequestDoc(requestId, firestoreDoc);
    const nowMs = Date.now();
    return {
      ...payload,
      id: requestId,
      requestNumber: formatOrderRequestNumber(requestId),
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      duplicatePrevented: false,
    };
  } catch (err) {
    if (err instanceof OrderRequestError || err instanceof GuestFirebaseAuthUnavailableError) {
      throw err;
    }

    const code = normalizeFirestoreErrorCode(err);
    if (code.includes('already-exists') || code.includes('permission-denied')) {
      try {
        const existingAfterRace = await adapter.getExistingRequest(requestId);
        if (existingAfterRace && String(existingAfterRace.customerUid ?? '') === realUid) {
          return {
            ...mapOrderRequestSnapshot(requestId, existingAfterRace),
            duplicatePrevented: true,
          };
        }
      } catch {
        // Ignore follow-up read error and report original failure
      }
    }

    const message =
      err instanceof Error && err.message ? err.message : 'Unable to submit order request.';
    throw new OrderRequestError(code, message);
  }
}

export function mapOrderSnapshot(id: string, data: DocumentData): Order {
  const rawStatus = String(data.status ?? 'Pending');
  const normalizedStatus = (['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'].includes(
    rawStatus,
  )
    ? rawStatus
    : 'Pending') as OrderStatus;

  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items: OrderLineItem[] = rawItems.map((it: DocumentData) => {
    const selectedCustomizations = Array.isArray(it.selectedCustomizations)
      ? (it.selectedCustomizations as SelectedCustomizationItem[])
      : undefined;
    const itemSummaryParts: string[] = [];
    if (it.note) {
      itemSummaryParts.push(String(it.note));
    } else {
      if (it.temperature) itemSummaryParts.push(String(it.temperature));
      if (it.milkOption === 'coconut') {
        itemSummaryParts.push(
          typeof it.milkExtraPrice === 'number' && it.milkExtraPrice > 0
            ? `Coconut Milk (+${it.milkExtraPrice} ﷼)`
            : 'Coconut Milk',
        );
      } else if (it.milkOption === 'regular') {
        itemSummaryParts.push('Regular Milk');
      }
      if (selectedCustomizations && selectedCustomizations.length > 0) {
        itemSummaryParts.push(
          selectedCustomizations.map((c) => c.optionName).join(', '),
        );
      }
      if (it.specialInstructions) {
        itemSummaryParts.push(String(it.specialInstructions));
      }
    }

    return {
      itemId: String(it.itemId ?? ''),
      name: String(it.name ?? 'Item'),
      nameAr: it.nameAr ? String(it.nameAr) : undefined,
      price: Number(it.price ?? 0),
      basePrice: typeof it.basePrice === 'number' ? it.basePrice : undefined,
      customizationTotal:
        typeof it.customizationTotal === 'number' ? it.customizationTotal : undefined,
      quantity: Number(it.quantity ?? 1),
      selectedCustomizations,
      specialInstructions: it.specialInstructions ? String(it.specialInstructions) : undefined,
      note: itemSummaryParts.filter(Boolean).join(' · '),
      imageUrl: String(it.imageUrl ?? ''),
      temperature:
        it.temperature === 'Hot' || it.temperature === 'Cold' ? it.temperature : undefined,
      milkOption:
        it.milkOption === 'none' ||
        it.milkOption === 'regular' ||
        it.milkOption === 'coconut'
          ? it.milkOption
          : undefined,
      milkExtraPrice:
        typeof it.milkExtraPrice === 'number' ? it.milkExtraPrice : undefined,
    };
  });

  const hasHistoricalDelivery =
    data.orderType === 'delivery' || Boolean(data.deliveryLocation) || Boolean(data.mapsLink);

  const rawNotes = data.notes
    ? String(data.notes)
    : data.orderNote
      ? String(data.orderNote)
      : undefined;
  const cleanedOrderNote =
    rawNotes === 'Pickup'
      ? undefined
      : rawNotes?.startsWith('Pickup · ')
        ? rawNotes.slice('Pickup · '.length).trim() || undefined
        : rawNotes;

  return {
    id,
    orderNumber: String(data.orderNumber ?? id.slice(0, 8).toUpperCase()),
    customerUid: data.customerUid ? String(data.customerUid) : undefined,
    orderType: hasHistoricalDelivery ? 'delivery' : 'pickup',
    customerName: String(data.customerName ?? 'Guest'),
    customerPhone: String(data.customerContact ?? data.customerPhone ?? ''),
    deliveryLocation: data.deliveryLocation ? String(data.deliveryLocation) : undefined,
    mapsLink: data.mapsLink ? String(data.mapsLink) : undefined,
    orderNote: cleanedOrderNote,
    items,
    subtotal: typeof data.subtotal === 'number' ? data.subtotal : undefined,
    discountTotal: typeof data.discountTotal === 'number' ? data.discountTotal : undefined,
    taxTotal: typeof data.taxTotal === 'number' ? data.taxTotal : undefined,
    total: Number(data.totalBill ?? data.total ?? 0),
    currency: data.currency === 'SAR' ? 'SAR' : undefined,
    pricingVersion: typeof data.pricingVersion === 'number' ? data.pricingVersion : undefined,
    sourceRequestId: data.sourceRequestId ? String(data.sourceRequestId) : undefined,
    paymentMethod: data.paymentMethod === 'pay_on_pickup' ? 'pay_on_pickup' : undefined,
    paymentStatus:
      data.paymentStatus === 'paid' || data.paymentStatus === 'unpaid'
        ? data.paymentStatus
        : undefined,
    approvedBy: data.approvedBy ? String(data.approvedBy) : undefined,
    approvedAtMs: extractTimestampMs(data.approvedAt),
    status: normalizedStatus,
    createdAtMs: extractTimestampMs(data.createdAt),
    updatedAtMs: extractTimestampMs(data.updatedAt),
  };
}

export function subscribeOrder(
  orderId: string,
  onData: (order: Order | null) => void,
  onError: (err: Error) => void,
): () => void {
  if (!auth.currentUser) {
    onData(null);
    return () => {};
  }

  const path = `orders/${orderId}`;
  const orderDocRef = doc(db, 'orders', orderId);

  return onSnapshot(
    orderDocRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData(mapOrderSnapshot(snapshot.id, snapshot.data()));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function subscribeCustomerOrders(
  customerUid: string,
  onData: (orders: Order[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!customerUid) {
    onData([]);
    return () => {};
  }

  const ordersQuery = query(collection(db, 'orders'), where('customerUid', '==', customerUid));

  return onSnapshot(
    ordersQuery,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapOrderSnapshot(d.id, d.data()))
        .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'orders');
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function subscribeOrderRequest(
  requestId: string,
  onData: (request: OrderRequest | null) => void,
  onError: (err: Error) => void,
): () => void {
  if (!auth.currentUser || !requestId) {
    onData(null);
    return () => {};
  }

  const path = `orderRequests/${requestId}`;
  const reqDocRef = doc(db, 'orderRequests', requestId);

  return onSnapshot(
    reqDocRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData(mapOrderRequestSnapshot(snapshot.id, snapshot.data()));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function subscribeCustomerOrderRequests(
  customerUid: string,
  onData: (requests: OrderRequest[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (!customerUid) {
    onData([]);
    return () => {};
  }

  const requestsQuery = query(
    collection(db, 'orderRequests'),
    where('customerUid', '==', customerUid),
  );

  return onSnapshot(
    requestsQuery,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => mapOrderRequestSnapshot(d.id, d.data()))
        .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'orderRequests');
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export async function seedPalmMetricMenuForAdmin(): Promise<void> {
  const batch = writeBatch(db);
  const allowedCategories = new Set([
    'V60',
    'Espresso',
    'Matcha',
    'Specialty',
    'Cold Drinks',
    'Food',
    'Coffee',
    'Desserts',
  ]);

  for (const item of MENU_ITEMS) {
    const catObj = CATEGORIES.find((c) => c.id === item.categoryId);
    const category = catObj && allowedCategories.has(catObj.en) ? catObj.en : 'Specialty';
    batch.set(doc(db, 'menu', item.id), {
      name: item.nameEn.slice(0, 80),
      category,
      price: item.price,
      description: '',
      inStock: true,
      imageUrl: '',
      storagePath: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'menu');
  }
}
