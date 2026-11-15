import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { MENU_ITEMS, CATEGORIES } from '../data/menu';
import type {
  Billboard,
  Language,
  MediaType,
  MenuItem,
  Order,
  OrderLineItem,
  OrderStatus,
  OrderType,
  StoreSettings,
} from '../types';
import { auth, db, handleFirestoreError, OperationType, resolveStorageUrl } from './firebase';

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
  const cleanId = id.trim().toLowerCase();
  const cleanName = name.trim().toLowerCase();
  return MENU_ITEMS.find(
    (item) =>
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

const FALLBACK_MENU_ITEMS: MenuItem[] = MENU_ITEMS.map((item) => ({
  id: item.id,
  name: item.nameEn,
  nameAr: item.nameAr,
  nameEn: item.nameEn,
  description: '',
  price: item.price,
  category: 'Specialty',
  imageUrl: '',
  inStock: true,
  supportsTemp: item.supportsTemp,
}));

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
              descriptionAr: data.descriptionAr ? String(data.descriptionAr) : undefined,
              price: Number.isFinite(price) ? price : 0,
              category: categoryText,
              categoryAr: categoryArText,
              imageUrl,
              inStock: isMenuItemInStock(data),
              supportsTemp:
                isCoffeeOfTheDay ||
                Boolean(localMatch?.supportsTemp) ||
                /hot\s*\/\s*cold|حار\s*\/\s*بارد/i.test(`${name} ${nameAr ?? ''}`),
              order: typeof data.order === 'number' ? data.order : undefined,
            } satisfies MenuItem;
          }),
        );

        resolved.sort((a, b) => {
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
  onData({ storeOpen: true });
  return () => {};
}

export interface CreateOrderInput {
  orderType: OrderType;
  customerName: string;
  customerPhone: string;
  deliveryLocation?: string;
  mapsLink?: string;
  orderNote?: string;
  items: OrderLineItem[];
  total: number;
  lang?: Language;
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<{ id: string; orderNumber: string }> {
  const customerUid = auth.currentUser?.uid || `guest_${Date.now()}`;

  const customerName = input.customerName.trim().slice(0, 80);
  const customerContact = input.customerPhone.trim().slice(0, 80);
  const deliveryLocation = input.deliveryLocation?.trim();
  const mapsLink = input.mapsLink?.trim();
  const orderNote = input.orderNote?.trim();

  if (!customerName) {
    throw new Error('Customer name is required.');
  }
  if (customerContact.length < 4) {
    throw new Error('Mobile number must be at least 4 characters.');
  }
  if (input.items.length === 0 || input.items.length > 50) {
    throw new Error('Order must include between 1 and 50 items.');
  }

  const orderRef = doc(collection(db, 'orders'));
  const randomCode = Math.floor(1000 + Math.random() * 9000);
  const orderNumber = `PM-${randomCode}`;

  // Keep order line item imageUrl short (skip large inline data: URIs) to stay well within doc limits
  const sanitizedItems = input.items.slice(0, 50).map((item) => ({
    itemId: item.itemId.slice(0, 128),
    name: item.name.slice(0, 120),
    price: Number(item.price.toFixed(2)),
    quantity: Math.max(1, Math.min(99, Math.round(item.quantity))),
    note: item.note.trim().slice(0, 160),
    imageUrl: item.imageUrl.startsWith('data:') ? '' : item.imageUrl.slice(0, 512),
  }));

  const cleanTotal = Number(Math.max(0, Math.min(100000, input.total)).toFixed(2));

  const combinedNotes = [
    input.orderType === 'delivery' ? 'Delivery' : 'Pickup',
    deliveryLocation,
    mapsLink,
    orderNote,
  ]
    .filter(Boolean)
    .join(' | ')
    .slice(0, 240);

  // Matches Admin App's strict isValidOrderCreate(data) rule schema
  const payload: Record<string, unknown> = {
    orderNumber,
    customerUid,
    orderType: input.orderType,
    customerName,
    customerPhone: customerContact,
    items: sanitizedItems,
    total: cleanTotal,
    status: 'Pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (deliveryLocation) {
    payload.deliveryLocation = deliveryLocation;
  }
  if (mapsLink) {
    payload.mapsLink = mapsLink;
  }
  if (orderNote) {
    payload.orderNote = orderNote;
  }
  const itemCount = sanitizedItems.reduce((sum, item) => sum + item.quantity, 0);
  if (itemCount > 0) {
    payload.itemCount = itemCount;
  }
  payload.sourceApp = 'palm-metric-order';
  payload.lang = input.lang ?? 'ar';

  try {
    await setDoc(orderRef, payload);
    return { id: orderRef.id, orderNumber };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `orders/${orderRef.id}`);
  }
}

function mapOrderSnapshot(id: string, data: DocumentData): Order {
  const rawStatus = String(data.status ?? 'Pending');
  const normalizedStatus = (['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'].includes(
    rawStatus,
  )
    ? rawStatus
    : 'Pending') as OrderStatus;

  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items: OrderLineItem[] = rawItems.map((it: DocumentData) => ({
    itemId: String(it.itemId ?? ''),
    name: String(it.name ?? 'Item'),
    price: Number(it.price ?? 0),
    quantity: Number(it.quantity ?? 1),
    note: String(it.note ?? ''),
    imageUrl: String(it.imageUrl ?? ''),
  }));

  return {
    id,
    orderNumber: String(data.orderNumber ?? id.slice(0, 8).toUpperCase()),
    orderType:
      typeof data.notes === 'string' && data.notes.toLowerCase().startsWith('pickup')
        ? 'pickup'
        : 'delivery',
    customerName: String(data.customerName ?? 'Guest'),
    customerPhone: String(data.customerContact ?? data.customerPhone ?? ''),
    deliveryLocation: data.deliveryLocation ? String(data.deliveryLocation) : undefined,
    mapsLink: data.mapsLink ? String(data.mapsLink) : undefined,
    orderNote: data.notes
      ? String(data.notes)
      : data.orderNote
        ? String(data.orderNote)
        : undefined,
    items,
    total: Number(data.totalBill ?? data.total ?? 0),
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
