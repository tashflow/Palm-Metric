import { createHash, randomInt } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { computeAuthoritativeOrderTotals } from './orderPricing';
import {
  DEFAULT_BACKEND_COFFEE_OPTIONS,
  validateAndPriceLineItem,
  validateCreateOrderEnvelope,
} from './orderValidation';
import {
  AuthoritativeOrderLineItem,
  CanonicalOrderDoc,
  CoffeeOptionsDoc,
  CreateOrderResponse,
  IdempotencyRecord,
  MenuCatalogDoc,
  OrderBackendError,
  PRICING_VERSION,
  ProductCustomizationDoc,
  SUPPORTED_CURRENCY,
} from './types';

export interface OrderTransactionAdapter {
  createOrderId(): string;
  getIdempotencyRecord(keyDocId: string): Promise<IdempotencyRecord | null>;
  getMenuItem(itemId: string): Promise<MenuCatalogDoc | null>;
  getProductCustomization(itemId: string): Promise<ProductCustomizationDoc | null>;
  getCoffeeOptions(): Promise<CoffeeOptionsDoc | null>;
  setOrder(orderId: string, doc: CanonicalOrderDoc): void;
  setIdempotencyRecord(keyDocId: string, record: IdempotencyRecord): void;
  serverTimestamp(): unknown;
}

export interface OrderStoreAdapter {
  runTransaction<T>(fn: (tx: OrderTransactionAdapter) => Promise<T>): Promise<T>;
}

export function buildIdempotencyDocId(customerUid: string, idempotencyKey: string): string {
  const hash = createHash('sha256')
    .update(`${customerUid}::${idempotencyKey}`)
    .digest('hex')
    .slice(0, 40);
  return `idem_${hash}`;
}

export function generateServerOrderNumber(): string {
  const code = randomInt(100000, 999999);
  return `PM-${code}`;
}

export function createFirestoreOrderStoreAdapter(db: Firestore): OrderStoreAdapter {
  return {
    async runTransaction<T>(fn: (tx: OrderTransactionAdapter) => Promise<T>): Promise<T> {
      return db.runTransaction(async (tx) => {
        const adapter: OrderTransactionAdapter = {
          createOrderId() {
            return db.collection('orders').doc().id;
          },
          async getIdempotencyRecord(keyDocId: string) {
            const snap = await tx.get(db.collection('idempotencyKeys').doc(keyDocId));
            if (!snap.exists) return null;
            return snap.data() as IdempotencyRecord;
          },
          async getMenuItem(itemId: string) {
            const snap = await tx.get(db.collection('menu').doc(itemId));
            if (!snap.exists) return null;
            return { ...(snap.data() as MenuCatalogDoc), id: snap.id };
          },
          async getProductCustomization(itemId: string) {
            const snap = await tx.get(db.collection('productCustomizations').doc(itemId));
            if (!snap.exists) return null;
            return snap.data() as ProductCustomizationDoc;
          },
          async getCoffeeOptions() {
            const snap = await tx.get(db.collection('settings').doc('coffeeOptions'));
            if (!snap.exists) return null;
            const d = snap.data() as Record<string, unknown>;
            return {
              milkSelectionEnabled:
                typeof d.milkSelectionEnabled === 'boolean'
                  ? d.milkSelectionEnabled
                  : DEFAULT_BACKEND_COFFEE_OPTIONS.milkSelectionEnabled,
              coconutMilkExtraPrice:
                typeof d.coconutMilkExtraPrice === 'number' &&
                Number.isFinite(d.coconutMilkExtraPrice)
                  ? d.coconutMilkExtraPrice
                  : DEFAULT_BACKEND_COFFEE_OPTIONS.coconutMilkExtraPrice,
              hotColdSelectionEnabled:
                typeof d.hotColdSelectionEnabled === 'boolean'
                  ? d.hotColdSelectionEnabled
                  : DEFAULT_BACKEND_COFFEE_OPTIONS.hotColdSelectionEnabled,
            };
          },
          setOrder(orderId: string, docData: CanonicalOrderDoc) {
            tx.set(db.collection('orders').doc(orderId), docData);
          },
          setIdempotencyRecord(keyDocId: string, record: IdempotencyRecord) {
            tx.set(db.collection('idempotencyKeys').doc(keyDocId), record);
          },
          serverTimestamp() {
            return FieldValue.serverTimestamp();
          },
        };

        return fn(adapter);
      });
    },
  };
}

export async function executeAuthoritativeOrderCreation(
  store: OrderStoreAdapter,
  rawPayload: unknown,
  authenticatedUid: string,
): Promise<CreateOrderResponse> {
  const { request, digest } = validateCreateOrderEnvelope(rawPayload, authenticatedUid);
  const keyDocId = buildIdempotencyDocId(authenticatedUid, request.idempotencyKey);

  return store.runTransaction(async (tx) => {
    // 1. Strict READ-BEFORE-WRITE phase inside transaction
    const uniqueItemIds = Array.from(new Set(request.items.map((item) => item.itemId)));

    const [existingIdem, coffeeOptionsDoc, menuResults, customResults] = await Promise.all([
      tx.getIdempotencyRecord(keyDocId),
      tx.getCoffeeOptions(),
      Promise.all(uniqueItemIds.map((id) => tx.getMenuItem(id))),
      Promise.all(uniqueItemIds.map((id) => tx.getProductCustomization(id))),
    ]);

    if (existingIdem) {
      if (existingIdem.requestDigest !== digest) {
        throw new OrderBackendError(
          'failed-precondition',
          'This idempotencyKey has already been used with a different order payload.',
          'IDEMPOTENCY_CONFLICT',
        );
      }
      return {
        ...existingIdem.responseSnapshot,
        idempotentReplay: true,
      };
    }

    const menuMap = new Map<string, MenuCatalogDoc | null>();
    const customMap = new Map<string, ProductCustomizationDoc | null>();
    uniqueItemIds.forEach((id, idx) => {
      menuMap.set(id, menuResults[idx]);
      customMap.set(id, customResults[idx]);
    });

    const coffeeOptions = coffeeOptionsDoc ?? DEFAULT_BACKEND_COFFEE_OPTIONS;

    // 2. Authoritative item validation & integer halala pricing phase
    const pricedItems: AuthoritativeOrderLineItem[] = [];
    const lineTotalsHalalas: number[] = [];

    for (const inputItem of request.items) {
      const { lineItem, lineTotalHalalas } = validateAndPriceLineItem(
        inputItem,
        menuMap.get(inputItem.itemId) ?? null,
        customMap.get(inputItem.itemId) ?? null,
        coffeeOptions,
      );
      pricedItems.push(lineItem);
      lineTotalsHalalas.push(lineTotalHalalas);
    }

    const totals = computeAuthoritativeOrderTotals(lineTotalsHalalas);

    const orderId = tx.createOrderId();
    const orderNumber = generateServerOrderNumber();
    const notes = request.orderNote ? `Pickup · ${request.orderNote}`.slice(0, 240) : 'Pickup';
    const ts = tx.serverTimestamp();

    const canonicalOrderDoc: CanonicalOrderDoc = {
      orderNumber,
      customerUid: authenticatedUid,
      customerName: request.customerName,
      customerContact: request.customerContact,
      items: pricedItems,
      subtotal: totals.subtotalSar,
      totalBill: totals.totalBillSar,
      currency: SUPPORTED_CURRENCY,
      orderType: 'pickup',
      status: 'Pending',
      notes,
      sourceApp: 'palm-metric-customer',
      ...(request.lang ? { lang: request.lang } : {}),
      idempotencyKey: request.idempotencyKey,
      pricingVersion: PRICING_VERSION,
      createdAt: ts,
      updatedAt: ts,
    };

    const response: CreateOrderResponse = {
      orderId,
      orderNumber,
      customerUid: authenticatedUid,
      customerName: request.customerName,
      customerContact: request.customerContact,
      orderType: 'pickup',
      currency: SUPPORTED_CURRENCY,
      status: 'Pending',
      notes,
      subtotal: totals.subtotalSar,
      totalBill: totals.totalBillSar,
      pricingVersion: PRICING_VERSION,
      idempotentReplay: false,
      items: pricedItems,
    };

    const idempotencyRecord: IdempotencyRecord = {
      customerUid: authenticatedUid,
      idempotencyKey: request.idempotencyKey,
      requestDigest: digest,
      orderId,
      orderNumber,
      responseSnapshot: response,
      createdAt: ts,
    };

    // 3. Atomic WRITE phase inside transaction
    tx.setOrder(orderId, canonicalOrderDoc);
    tx.setIdempotencyRecord(keyDocId, idempotencyRecord);

    return response;
  });
}
