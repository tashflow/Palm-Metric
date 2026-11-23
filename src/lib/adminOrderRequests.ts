import {
  collection,
  doc,
  getDoc,
  limit as firestoreLimit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { normalizeCustomizationConfig } from './customization';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  mapOrderRequestSnapshot,
  normalizeOrderRequestStatus,
} from './firestoreSync';
import {
  AdminApprovalError,
  assertVerifiedAdminActor,
  type AdminActor,
} from './adminAuth';
import {
  calculateAuthoritativeOrderRequestPricing,
  computeStockDeductionPlans,
  type AuthoritativeCatalogLookup,
  type AuthoritativeMenuRecord,
  type StockDeductionPlan,
  STAGE_04L_PRICING_VERSION,
} from './authoritativePricing';
import type {
  AdminOrderRequestAuditAction,
  CoffeeOptionsSettings,
  OrderRequest,
  OrderRequestAuditEntry,
  ProductCustomizationConfig,
  VerifiedPricingBreakdown,
} from '../types';
import { DEFAULT_COFFEE_OPTIONS } from './customization';

function fnv1aHex(input: string, seedOffset: number): string {
  let hash = (0x811c9dc5 ^ seedOffset) >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function deriveDeterministicOrderId(requestId: string): string {
  const clean = requestId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!clean) {
    throw new AdminApprovalError('invalid-argument', 'Invalid requestId for order derivation.', 'INVALID_REQUEST_ID');
  }
  const candidate = clean.startsWith('ord_') ? clean : `ord_${clean}`;
  if (candidate.length <= 128) {
    return candidate;
  }
  return `ord_${fnv1aHex(clean, 0)}${fnv1aHex(clean, 0x9e3779b9)}`;
}

export function deriveOfficialOrderNumber(requestId: string): string {
  const clean = requestId.trim();
  const h1 = parseInt(fnv1aHex(clean, 0x45d9f3b), 16);
  const sixDigits = 100000 + (h1 % 900000);
  return `PM-${sixDigits}`;
}

export function deriveOfficialOrderNumberCandidate(requestId: string, attempt = 0): string {
  if (attempt <= 0) {
    return deriveOfficialOrderNumber(requestId);
  }
  const clean = requestId.trim();
  if (attempt <= 12) {
    const h = parseInt(
      fnv1aHex(`${clean}::collision::${attempt}`, (0x9e3779b9 + attempt) >>> 0),
      16,
    );
    const sixDigits = 100000 + (h % 900000);
    return `PM-${sixDigits}`;
  }
  const hHigh = fnv1aHex(clean, attempt).toUpperCase();
  const hLow = fnv1aHex(`${clean}::${attempt}`, 0x85ebca6b).slice(0, 2).toUpperCase();
  return `PM-${hHigh}${hLow}`;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export interface AdminOrderRequestTransactionAdapter {
  getOrderRequest(requestId: string): Promise<DocumentData | null>;
  getOrder(orderId: string): Promise<DocumentData | null>;
  getMenuDoc(itemId: string): Promise<AuthoritativeMenuRecord | null>;
  getCustomizationDoc(itemId: string): Promise<ProductCustomizationConfig | null>;
  getCoffeeOptions(): Promise<CoffeeOptionsSettings | null>;
  getOrderNumberClaim?(orderNumber: string): Promise<DocumentData | null>;
  updateOrderRequest(requestId: string, fullDoc: Record<string, unknown>): void;
  setOrder(orderId: string, docData: Record<string, unknown>): void;
  setAuditLog(auditId: string, auditDoc: Record<string, unknown>): void;
  updateMenuDoc?(itemId: string, fullMenuDoc: Record<string, unknown>): void;
  setOrderNumberClaim?(orderNumber: string, claimDoc: Record<string, unknown>): void;
  serverTimestamp(): unknown;
  nowMs(): number;
}

export interface AdminOrderRequestStoreAdapter {
  runTransaction<T>(fn: (tx: AdminOrderRequestTransactionAdapter) => Promise<T>): Promise<T>;
}

function parseCoffeeOptionsDoc(data: DocumentData | undefined): CoffeeOptionsSettings | null {
  if (!data) return null;
  return {
    milkSelectionEnabled:
      typeof data.milkSelectionEnabled === 'boolean'
        ? data.milkSelectionEnabled
        : DEFAULT_COFFEE_OPTIONS.milkSelectionEnabled,
    coconutMilkExtraPrice:
      typeof data.coconutMilkExtraPrice === 'number' && Number.isFinite(data.coconutMilkExtraPrice)
        ? Math.max(0, Math.min(500, data.coconutMilkExtraPrice))
        : DEFAULT_COFFEE_OPTIONS.coconutMilkExtraPrice,
    hotColdSelectionEnabled:
      typeof data.hotColdSelectionEnabled === 'boolean'
        ? data.hotColdSelectionEnabled
        : DEFAULT_COFFEE_OPTIONS.hotColdSelectionEnabled,
  };
}

export const defaultAdminOrderRequestStore: AdminOrderRequestStoreAdapter = {
  async runTransaction<T>(fn: (tx: AdminOrderRequestTransactionAdapter) => Promise<T>): Promise<T> {
    return runTransaction(db, async (tx) => {
      const adapter: AdminOrderRequestTransactionAdapter = {
        async getOrderRequest(requestId: string) {
          const snap = await tx.get(doc(db, 'orderRequests', requestId));
          return snap.exists() ? snap.data() : null;
        },
        async getOrder(orderId: string) {
          const snap = await tx.get(doc(db, 'orders', orderId));
          return snap.exists() ? snap.data() : null;
        },
        async getMenuDoc(itemId: string) {
          const snap = await tx.get(doc(db, 'menu', itemId));
          if (!snap.exists()) return null;
          return { ...(snap.data() as AuthoritativeMenuRecord), id: snap.id };
        },
        async getCustomizationDoc(itemId: string) {
          const snap = await tx.get(doc(db, 'productCustomizations', itemId));
          if (!snap.exists()) return null;
          return normalizeCustomizationConfig(itemId, snap.data());
        },
        async getCoffeeOptions() {
          const snap = await tx.get(doc(db, 'settings', 'coffeeOptions'));
          if (!snap.exists()) return null;
          return parseCoffeeOptionsDoc(snap.data());
        },
        async getOrderNumberClaim(orderNumber: string) {
          const snap = await tx.get(doc(db, 'orderNumbers', orderNumber));
          return snap.exists() ? snap.data() : null;
        },
        updateOrderRequest(requestId: string, fullDoc: Record<string, unknown>) {
          tx.update(doc(db, 'orderRequests', requestId), fullDoc);
        },
        setOrder(orderId: string, docData: Record<string, unknown>) {
          tx.set(doc(db, 'orders', orderId), docData);
        },
        setAuditLog(auditId: string, auditDoc: Record<string, unknown>) {
          tx.set(doc(db, 'orderRequestAuditLogs', auditId), auditDoc);
        },
        updateMenuDoc(itemId: string, fullMenuDoc: Record<string, unknown>) {
          tx.update(doc(db, 'menu', itemId), fullMenuDoc);
        },
        setOrderNumberClaim(orderNumber: string, claimDoc: Record<string, unknown>) {
          tx.set(doc(db, 'orderNumbers', orderNumber), claimDoc);
        },
        serverTimestamp() {
          return serverTimestamp();
        },
        nowMs() {
          return Date.now();
        },
      };

      return fn(adapter);
    });
  },
};

function buildAuditLogId(requestId: string, action: AdminOrderRequestAuditAction, nowMs: number): string {
  const cleanReq = requestId.replace(/[^a-zA-Z0-9_-]/g, '').slice(-32) || 'req';
  const rand = Math.random().toString(36).slice(2, 8);
  return `aud_${cleanReq}_${action}_${nowMs.toString(36)}_${rand}`.slice(0, 128);
}

function createAuditPayload(params: {
  requestId: string;
  action: AdminOrderRequestAuditAction;
  admin: AdminActor;
  previousStatus?: string;
  newStatus?: string;
  approvedOrderId?: string;
  approvedOrderNumber?: string;
  verifiedTotalSar?: number;
  reason?: string;
  details?: string;
  ts: unknown;
}): Record<string, unknown> {
  return stripUndefinedDeep({
    requestId: params.requestId,
    action: params.action,
    adminUid: params.admin.uid,
    ...(params.admin.email ? { adminEmail: params.admin.email.slice(0, 200) } : {}),
    ...(params.previousStatus ? { previousStatus: params.previousStatus } : {}),
    ...(params.newStatus ? { newStatus: params.newStatus } : {}),
    ...(params.approvedOrderId ? { approvedOrderId: params.approvedOrderId } : {}),
    ...(params.approvedOrderNumber ? { approvedOrderNumber: params.approvedOrderNumber } : {}),
    ...(params.verifiedTotalSar !== undefined ? { verifiedTotalSar: params.verifiedTotalSar } : {}),
    ...(params.reason ? { reason: params.reason.slice(0, 300) } : {}),
    ...(params.details ? { details: params.details.slice(0, 500) } : {}),
    createdAt: params.ts,
  });
}

function preserveExistingRequestCore(requestId: string, raw: DocumentData): Record<string, unknown> {
  return stripUndefinedDeep({
    requestId: raw.requestId || requestId,
    customerUid: raw.customerUid,
    customerName: raw.customerName,
    customerContact: raw.customerContact,
    orderType: raw.orderType || 'pickup',
    currency: raw.currency || 'SAR',
    ...(raw.lang === 'ar' || raw.lang === 'en' ? { lang: raw.lang } : {}),
    ...(raw.orderNote !== undefined ? { orderNote: raw.orderNote } : {}),
    items: raw.items,
    ...(raw.requestSource ? { requestSource: raw.requestSource } : {}),
    createdAt: raw.createdAt,
  });
}

function buildUpdatedMenuStockPayload(
  rawMenu: AuthoritativeMenuRecord,
  plan: StockDeductionPlan,
  ts: unknown,
): Record<string, unknown> {
  const { id: _stripSyntheticId, ...rest } = rawMenu as AuthoritativeMenuRecord &
    Record<string, unknown>;
  const updated: Record<string, unknown> = {
    ...rest,
    updatedAt: ts,
  };
  if (plan.updatesStockQuantity) {
    updated.stockQuantity = plan.remainingStock;
  }
  if (plan.updatesStockCount) {
    updated.stockCount = plan.remainingStock;
  }
  if (plan.remainingStock === 0) {
    updated.inStock = false;
    if ('outOfStock' in updated) updated.outOfStock = true;
    if ('isAvailable' in updated) updated.isAvailable = false;
    if ('available' in updated) updated.available = false;
  }
  return stripUndefinedDeep(updated);
}

async function loadCatalogLookupForRequest(
  tx: AdminOrderRequestTransactionAdapter,
  request: OrderRequest,
): Promise<AuthoritativeCatalogLookup> {
  const uniqueIds = Array.from(new Set(request.items.map((item) => item.itemId.trim()).filter(Boolean)));
  const [coffeeOptions, menuList, customList] = await Promise.all([
    tx.getCoffeeOptions(),
    Promise.all(uniqueIds.map((id) => tx.getMenuDoc(id))),
    Promise.all(uniqueIds.map((id) => tx.getCustomizationDoc(id))),
  ]);

  const menuMap = new Map<string, AuthoritativeMenuRecord | null>();
  const customMap = new Map<string, ProductCustomizationConfig | null>();
  uniqueIds.forEach((id, idx) => {
    menuMap.set(id, menuList[idx]);
    customMap.set(id, customList[idx]);
  });

  return {
    getMenuDoc: (itemId) => menuMap.get(itemId) ?? null,
    getCustomizationDoc: (itemId) => customMap.get(itemId) ?? null,
    coffeeOptions: coffeeOptions ?? DEFAULT_COFFEE_OPTIONS,
  };
}

export async function startOrderRequestReview(params: {
  requestId: string;
  admin: AdminActor | null | undefined;
  store?: AdminOrderRequestStoreAdapter;
}): Promise<OrderRequest> {
  const admin = assertVerifiedAdminActor(params.admin);
  const store = params.store ?? defaultAdminOrderRequestStore;
  const requestId = params.requestId.trim();

  return store.runTransaction(async (tx) => {
    const raw = await tx.getOrderRequest(requestId);
    if (!raw) {
      throw new AdminApprovalError('not-found', `Order request "${requestId}" was not found.`, 'REQUEST_NOT_FOUND');
    }

    const mapped = mapOrderRequestSnapshot(requestId, raw);
    const status = normalizeOrderRequestStatus(raw.status);

    if (status === 'reviewing') {
      return mapped;
    }

    if (status !== 'pending_review') {
      throw new AdminApprovalError(
        'failed-precondition',
        `Cannot start review for request in status "${status}".`,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const ts = tx.serverTimestamp();
    const nowMs = tx.nowMs();
    const updatedDoc = stripUndefinedDeep({
      ...preserveExistingRequestCore(requestId, raw),
      status: 'reviewing',
      reviewedBy: admin.uid,
      reviewedAt: ts,
      updatedAt: ts,
    });

    tx.updateOrderRequest(requestId, updatedDoc);
    tx.setAuditLog(
      buildAuditLogId(requestId, 'start_review', nowMs),
      createAuditPayload({
        requestId,
        action: 'start_review',
        admin,
        previousStatus: status,
        newStatus: 'reviewing',
        details: 'Admin started reviewing pickup order request.',
        ts,
      }),
    );

    return {
      ...mapped,
      status: 'reviewing',
      reviewedBy: admin.uid,
      reviewedAtMs: nowMs,
      updatedAtMs: nowMs,
    };
  });
}

export async function verifyOrderRequestPricing(params: {
  requestId: string;
  admin: AdminActor | null | undefined;
  store?: AdminOrderRequestStoreAdapter;
}): Promise<{ request: OrderRequest; breakdown: VerifiedPricingBreakdown }> {
  const admin = assertVerifiedAdminActor(params.admin);
  const store = params.store ?? defaultAdminOrderRequestStore;
  const requestId = params.requestId.trim();

  return store.runTransaction(async (tx) => {
    const raw = await tx.getOrderRequest(requestId);
    if (!raw) {
      throw new AdminApprovalError('not-found', `Order request "${requestId}" was not found.`, 'REQUEST_NOT_FOUND');
    }

    const mapped = mapOrderRequestSnapshot(requestId, raw);
    const status = normalizeOrderRequestStatus(raw.status);

    if (status === 'order_created' || status === 'approved') {
      throw new AdminApprovalError(
        'failed-precondition',
        'Order request has already been promoted to an active order.',
        'ALREADY_PROMOTED',
      );
    }
    if (status === 'rejected' || status === 'cancelled') {
      throw new AdminApprovalError(
        'failed-precondition',
        `Cannot verify a ${status} order request.`,
        'TERMINAL_REQUEST_STATUS',
      );
    }

    const catalog = await loadCatalogLookupForRequest(tx, mapped);
    const nowMs = tx.nowMs();
    const breakdown = calculateAuthoritativeOrderRequestPricing(mapped, catalog, admin, nowMs);
    const ts = tx.serverTimestamp();
    const reviewedBy = raw.reviewedBy ? String(raw.reviewedBy) : admin.uid;

    const updatedDoc = stripUndefinedDeep({
      ...preserveExistingRequestCore(requestId, raw),
      status: 'verified',
      reviewedBy,
      ...(raw.reviewedAt ? { reviewedAt: raw.reviewedAt } : { reviewedAt: ts }),
      verifiedBy: admin.uid,
      verifiedAt: ts,
      verifiedTotalSar: breakdown.totalBillSar,
      verifiedPricing: breakdown,
      updatedAt: ts,
    });

    tx.updateOrderRequest(requestId, updatedDoc);
    tx.setAuditLog(
      buildAuditLogId(requestId, 'verify_request', nowMs),
      createAuditPayload({
        requestId,
        action: 'verify_request',
        admin,
        previousStatus: status,
        newStatus: 'verified',
        verifiedTotalSar: breakdown.totalBillSar,
        details: `Verified ${breakdown.itemCount} item(s) against live Firestore catalog.`,
        ts,
      }),
    );
    tx.setAuditLog(
      buildAuditLogId(requestId, 'price_verification', nowMs + 1),
      createAuditPayload({
        requestId,
        action: 'price_verification',
        admin,
        previousStatus: status,
        newStatus: 'verified',
        verifiedTotalSar: breakdown.totalBillSar,
        details: `Authoritative SAR total computed: ${breakdown.totalBillSar.toFixed(2)} SAR.`,
        ts,
      }),
    );

    return {
      breakdown,
      request: {
        ...mapped,
        status: 'verified',
        reviewedBy,
        reviewedAtMs: mapped.reviewedAtMs ?? nowMs,
        verifiedBy: admin.uid,
        verifiedAtMs: nowMs,
        verifiedTotalSar: breakdown.totalBillSar,
        verifiedPricing: breakdown,
        updatedAtMs: nowMs,
      },
    };
  });
}

export interface ApproveAndPromoteResult {
  idempotentReplay: boolean;
  orderId: string;
  orderNumber: string;
  totalBillSar: number;
  breakdown: VerifiedPricingBreakdown | null;
  request: OrderRequest;
}

export async function approveAndPromoteOrderRequest(params: {
  requestId: string;
  admin: AdminActor | null | undefined;
  store?: AdminOrderRequestStoreAdapter;
}): Promise<ApproveAndPromoteResult> {
  const admin = assertVerifiedAdminActor(params.admin);
  const store = params.store ?? defaultAdminOrderRequestStore;
  const requestId = params.requestId.trim();
  const deterministicOrderId = deriveDeterministicOrderId(requestId);
  const deterministicOrderNumber = deriveOfficialOrderNumber(requestId);

  return store.runTransaction(async (tx) => {
    const [rawReq, existingDeterministicOrder] = await Promise.all([
      tx.getOrderRequest(requestId),
      tx.getOrder(deterministicOrderId),
    ]);

    if (!rawReq) {
      throw new AdminApprovalError('not-found', `Order request "${requestId}" was not found.`, 'REQUEST_NOT_FOUND');
    }

    const mapped = mapOrderRequestSnapshot(requestId, rawReq);
    const currentStatus = normalizeOrderRequestStatus(rawReq.status);
    const mappedApprovedOrderId =
      mapped.approvedOrderId && mapped.approvedOrderId !== deterministicOrderId
        ? mapped.approvedOrderId
        : null;
    const mappedApprovedOrder = mappedApprovedOrderId
      ? await tx.getOrder(mappedApprovedOrderId)
      : null;

    // Step 1: Reject/cancel terminal check ALWAYS executes before any idempotent replay
    if (currentStatus === 'rejected' || currentStatus === 'cancelled') {
      if (existingDeterministicOrder !== null || mappedApprovedOrder !== null) {
        throw new AdminApprovalError(
          'failed-precondition',
          `Inconsistent state: request "${requestId}" is "${currentStatus}" yet a linked /orders document exists.`,
          'INCONSISTENT_PROMOTION_STATE',
        );
      }
      throw new AdminApprovalError(
        'failed-precondition',
        `Cannot approve request "${requestId}" because its status is "${currentStatus}".`,
        'TERMINAL_REQUEST_STATUS',
      );
    }

    // Step 2: Relationship invariant validation & safe idempotent replay
    if (currentStatus === 'order_created' || currentStatus === 'approved') {
      const targetOrderId = mapped.approvedOrderId || deterministicOrderId;
      const targetOrder = mappedApprovedOrderId ? mappedApprovedOrder : existingDeterministicOrder;
      if (!targetOrder) {
        throw new AdminApprovalError(
          'failed-precondition',
          `Promoted request "${requestId}" references missing order "${targetOrderId}".`,
          'INCONSISTENT_PROMOTION_STATE',
        );
      }

      const targetCustomerUid = typeof targetOrder.customerUid === 'string' ? targetOrder.customerUid : '';
      if (targetCustomerUid !== mapped.customerUid) {
        throw new AdminApprovalError(
          'failed-precondition',
          `Existing order "${targetOrderId}" belongs to a different customerUid than request "${requestId}".`,
          'INCONSISTENT_EXISTING_ORDER',
        );
      }

      const targetSourceReq =
        typeof targetOrder.sourceRequestId === 'string' ? targetOrder.sourceRequestId : '';
      if (currentStatus === 'order_created') {
        if (targetSourceReq !== requestId) {
          throw new AdminApprovalError(
            'failed-precondition',
            `Existing order "${targetOrderId}" sourceRequestId ("${targetSourceReq}") does not match "${requestId}".`,
            'INCONSISTENT_EXISTING_ORDER',
          );
        }
      } else if (targetSourceReq && targetSourceReq !== requestId) {
        throw new AdminApprovalError(
          'failed-precondition',
          `Legacy promoted order "${targetOrderId}" sourceRequestId ("${targetSourceReq}") does not match "${requestId}".`,
          'INCONSISTENT_EXISTING_ORDER',
        );
      }

      const existingOrderNumber = targetOrder.orderNumber ? String(targetOrder.orderNumber) : '';
      if (
        mapped.approvedOrderNumber &&
        existingOrderNumber &&
        mapped.approvedOrderNumber !== existingOrderNumber
      ) {
        throw new AdminApprovalError(
          'failed-precondition',
          `Order number mismatch between request ("${mapped.approvedOrderNumber}") and order ("${existingOrderNumber}").`,
          'INCONSISTENT_EXISTING_ORDER',
        );
      }

      const resolvedOrderNumber =
        mapped.approvedOrderNumber || existingOrderNumber || deterministicOrderNumber;
      const resolvedTotal =
        mapped.verifiedTotalSar ??
        mapped.verifiedPricing?.totalBillSar ??
        (typeof targetOrder.totalBill === 'number' ? targetOrder.totalBill : 0);

      return {
        idempotentReplay: true,
        orderId: targetOrderId,
        orderNumber: resolvedOrderNumber,
        totalBillSar: resolvedTotal,
        breakdown: mapped.verifiedPricing ?? null,
        request: {
          ...mapped,
          status: currentStatus === 'approved' ? 'approved' : 'order_created',
          approvedOrderId: targetOrderId,
          approvedOrderNumber: resolvedOrderNumber,
          verifiedTotalSar: resolvedTotal,
        },
      };
    }

    if (existingDeterministicOrder !== null) {
      const existingSourceReq =
        typeof existingDeterministicOrder.sourceRequestId === 'string'
          ? existingDeterministicOrder.sourceRequestId
          : '';
      const existingCustomerUid =
        typeof existingDeterministicOrder.customerUid === 'string'
          ? existingDeterministicOrder.customerUid
          : '';
      if (existingSourceReq !== requestId || existingCustomerUid !== mapped.customerUid) {
        throw new AdminApprovalError(
          'failed-precondition',
          `Target order "${deterministicOrderId}" failed sourceRequestId/customerUid consistency check.`,
          'INCONSISTENT_EXISTING_ORDER',
        );
      }

      const resolvedOrderNumber = existingDeterministicOrder.orderNumber
        ? String(existingDeterministicOrder.orderNumber)
        : deterministicOrderNumber;
      const resolvedTotal =
        typeof existingDeterministicOrder.totalBill === 'number'
          ? existingDeterministicOrder.totalBill
          : mapped.verifiedTotalSar ?? 0;

      return {
        idempotentReplay: true,
        orderId: deterministicOrderId,
        orderNumber: resolvedOrderNumber,
        totalBillSar: resolvedTotal,
        breakdown: mapped.verifiedPricing ?? null,
        request: {
          ...mapped,
          status: 'order_created',
          approvedOrderId: deterministicOrderId,
          approvedOrderNumber: resolvedOrderNumber,
          verifiedTotalSar: resolvedTotal,
        },
      };
    }

    if (!mapped.customerUid || !mapped.customerName || mapped.customerContact.length < 4) {
      throw new AdminApprovalError(
        'invalid-argument',
        'Order request is missing required customer identity or contact fields.',
        'INVALID_CUSTOMER_DATA',
      );
    }

    // Step 3: Phase 1 Reads — live catalog, pricing, managed inventory, and unique official order number (all BEFORE writes)
    const catalog = await loadCatalogLookupForRequest(tx, mapped);
    const nowMs = tx.nowMs();
    const breakdown = calculateAuthoritativeOrderRequestPricing(mapped, catalog, admin, nowMs);
    const stockDeductions = computeStockDeductionPlans(mapped.items, catalog);

    if (stockDeductions.length > 0 && typeof tx.updateMenuDoc !== 'function') {
      throw new AdminApprovalError(
        'internal',
        'Transaction adapter does not support atomic menu stock deduction.',
        'INVENTORY_ADAPTER_MISSING',
      );
    }

    let officialOrderNumber = deterministicOrderNumber;
    let claimAlreadyOwned = false;
    if (typeof tx.getOrderNumberClaim === 'function') {
      let resolved = false;
      for (let attempt = 0; attempt <= 24; attempt += 1) {
        const candidate = deriveOfficialOrderNumberCandidate(requestId, attempt);
        const existingClaim = await tx.getOrderNumberClaim(candidate);
        if (!existingClaim) {
          officialOrderNumber = candidate;
          claimAlreadyOwned = false;
          resolved = true;
          break;
        }
        if (
          existingClaim.requestId === requestId &&
          existingClaim.orderId === deterministicOrderId
        ) {
          officialOrderNumber = candidate;
          claimAlreadyOwned = true;
          resolved = true;
          break;
        }
      }
      if (!resolved) {
        throw new AdminApprovalError(
          'aborted',
          'Unable to allocate a unique official order number after collision retries.',
          'ORDER_NUMBER_COLLISION_EXHAUSTED',
        );
      }
    }

    const ts = tx.serverTimestamp();
    const cleanNotes = mapped.orderNote
      ? `Pickup · ${mapped.orderNote}`.slice(0, 240)
      : 'Pickup';

    const orderItems = breakdown.items.map((line) =>
      stripUndefinedDeep({
        itemId: line.itemId,
        name: line.name,
        ...(line.nameAr ? { nameAr: line.nameAr } : {}),
        price: line.unitPriceSar,
        basePrice: line.basePriceSar,
        customizationTotal: line.customizationTotalSar,
        quantity: line.quantity,
        ...(line.selectedCustomizations ? { selectedCustomizations: line.selectedCustomizations } : {}),
        ...(line.specialInstructions ? { specialInstructions: line.specialInstructions } : {}),
        note: line.note,
        imageUrl: line.imageUrl,
        ...(line.temperature ? { temperature: line.temperature } : {}),
        ...(line.milkOption ? { milkOption: line.milkOption } : {}),
        ...(line.milkExtraPrice !== undefined ? { milkExtraPrice: line.milkExtraPrice } : {}),
      }),
    );

    const newOrderDoc = stripUndefinedDeep({
      orderNumber: officialOrderNumber,
      customerUid: mapped.customerUid,
      customerName: mapped.customerName,
      customerContact: mapped.customerContact,
      items: orderItems,
      subtotal: breakdown.subtotalSar,
      discountTotal: breakdown.discountSar,
      taxTotal: breakdown.taxSar,
      totalBill: breakdown.totalBillSar,
      currency: 'SAR',
      orderType: 'pickup',
      status: 'Pending',
      notes: cleanNotes,
      sourceApp: 'palm-metric-admin-spark',
      ...(mapped.lang ? { lang: mapped.lang } : {}),
      idempotencyKey: requestId,
      pricingVersion: STAGE_04L_PRICING_VERSION,
      sourceRequestId: requestId,
      paymentMethod: 'pay_on_pickup',
      paymentStatus: 'unpaid',
      approvedBy: admin.uid,
      approvedAt: ts,
      createdAt: ts,
      updatedAt: ts,
    });

    const reviewedBy = rawReq.reviewedBy ? String(rawReq.reviewedBy) : admin.uid;
    const verifiedBy = rawReq.verifiedBy ? String(rawReq.verifiedBy) : admin.uid;

    const updatedRequestDoc = stripUndefinedDeep({
      ...preserveExistingRequestCore(requestId, rawReq),
      status: 'order_created',
      reviewedBy,
      ...(rawReq.reviewedAt ? { reviewedAt: rawReq.reviewedAt } : { reviewedAt: ts }),
      verifiedBy,
      ...(rawReq.verifiedAt ? { verifiedAt: rawReq.verifiedAt } : { verifiedAt: ts }),
      verifiedTotalSar: breakdown.totalBillSar,
      verifiedPricing: breakdown,
      approvedBy: admin.uid,
      approvedAt: ts,
      approvedOrderId: deterministicOrderId,
      approvedOrderNumber: officialOrderNumber,
      updatedAt: ts,
    });

    // Step 4: Phase 2 Atomic Writes (uniqueness claim, managed stock deduction, /orders, /orderRequests, /orderRequestAuditLogs)
    if (typeof tx.setOrderNumberClaim === 'function' && !claimAlreadyOwned) {
      tx.setOrderNumberClaim(officialOrderNumber, {
        orderNumber: officialOrderNumber,
        orderId: deterministicOrderId,
        requestId,
        customerUid: mapped.customerUid,
        createdAt: ts,
      });
    }

    for (const plan of stockDeductions) {
      const rawMenu = catalog.getMenuDoc(plan.itemId);
      if (rawMenu && tx.updateMenuDoc) {
        tx.updateMenuDoc(plan.itemId, buildUpdatedMenuStockPayload(rawMenu, plan, ts));
      }
    }

    tx.setOrder(deterministicOrderId, newOrderDoc);
    tx.updateOrderRequest(requestId, updatedRequestDoc);

    tx.setAuditLog(
      buildAuditLogId(requestId, 'approve_and_promote', nowMs),
      createAuditPayload({
        requestId,
        action: 'approve_and_promote',
        admin,
        previousStatus: currentStatus,
        newStatus: 'order_created',
        approvedOrderId: deterministicOrderId,
        approvedOrderNumber: officialOrderNumber,
        verifiedTotalSar: breakdown.totalBillSar,
        details:
          stockDeductions.length > 0
            ? `Approved request (${breakdown.totalBillSar.toFixed(2)} SAR) and atomically deducted stock on ${stockDeductions.length} item(s).`
            : `Approved order request and verified total ${breakdown.totalBillSar.toFixed(2)} SAR.`,
        ts,
      }),
    );

    tx.setAuditLog(
      buildAuditLogId(requestId, 'order_promotion', nowMs + 1),
      createAuditPayload({
        requestId,
        action: 'order_promotion',
        admin,
        previousStatus: currentStatus,
        newStatus: 'order_created',
        approvedOrderId: deterministicOrderId,
        approvedOrderNumber: officialOrderNumber,
        verifiedTotalSar: breakdown.totalBillSar,
        details: `Promoted to /orders/${deterministicOrderId} (${officialOrderNumber}).`,
        ts,
      }),
    );

    return {
      idempotentReplay: false,
      orderId: deterministicOrderId,
      orderNumber: officialOrderNumber,
      totalBillSar: breakdown.totalBillSar,
      breakdown,
      request: {
        ...mapped,
        status: 'order_created',
        reviewedBy,
        reviewedAtMs: mapped.reviewedAtMs ?? nowMs,
        verifiedBy,
        verifiedAtMs: mapped.verifiedAtMs ?? nowMs,
        verifiedTotalSar: breakdown.totalBillSar,
        verifiedPricing: breakdown,
        approvedBy: admin.uid,
        approvedAtMs: nowMs,
        approvedOrderId: deterministicOrderId,
        approvedOrderNumber: officialOrderNumber,
        updatedAtMs: nowMs,
      },
    };
  });
}

export async function rejectOrderRequest(params: {
  requestId: string;
  admin: AdminActor | null | undefined;
  reason: string;
  store?: AdminOrderRequestStoreAdapter;
}): Promise<OrderRequest> {
  const admin = assertVerifiedAdminActor(params.admin);
  const store = params.store ?? defaultAdminOrderRequestStore;
  const requestId = params.requestId.trim();
  const cleanReason = typeof params.reason === 'string' ? params.reason.trim().slice(0, 300) : '';

  if (cleanReason.length < 3) {
    throw new AdminApprovalError(
      'invalid-argument',
      'A clear rejection reason (at least 3 characters) is required.',
      'REJECTION_REASON_REQUIRED',
    );
  }

  const deterministicOrderId = deriveDeterministicOrderId(requestId);

  return store.runTransaction(async (tx) => {
    const [rawReq, existingOrder] = await Promise.all([
      tx.getOrderRequest(requestId),
      tx.getOrder(deterministicOrderId),
    ]);

    if (!rawReq) {
      throw new AdminApprovalError('not-found', `Order request "${requestId}" was not found.`, 'REQUEST_NOT_FOUND');
    }

    const mapped = mapOrderRequestSnapshot(requestId, rawReq);
    const currentStatus = normalizeOrderRequestStatus(rawReq.status);
    const linkedOrder =
      mapped.approvedOrderId && mapped.approvedOrderId !== deterministicOrderId
        ? await tx.getOrder(mapped.approvedOrderId)
        : existingOrder;

    if (currentStatus === 'order_created' || currentStatus === 'approved') {
      throw new AdminApprovalError(
        'failed-precondition',
        'Cannot reject an order request after a final order has already been created.',
        'ALREADY_PROMOTED',
      );
    }

    if (linkedOrder !== null) {
      const existingSourceReq =
        typeof linkedOrder.sourceRequestId === 'string' ? linkedOrder.sourceRequestId : '';
      if (existingSourceReq && existingSourceReq !== requestId) {
        throw new AdminApprovalError(
          'failed-precondition',
          'Existing target order document belongs to a different sourceRequestId.',
          'INCONSISTENT_EXISTING_ORDER',
        );
      }
      throw new AdminApprovalError(
        'failed-precondition',
        'Cannot reject an order request because its target /orders document already exists.',
        'ALREADY_PROMOTED',
      );
    }

    if (currentStatus === 'rejected' || currentStatus === 'cancelled') {
      throw new AdminApprovalError(
        'failed-precondition',
        `Order request is already ${currentStatus}.`,
        'TERMINAL_REQUEST_STATUS',
      );
    }

    const ts = tx.serverTimestamp();
    const nowMs = tx.nowMs();
    const reviewedBy = rawReq.reviewedBy ? String(rawReq.reviewedBy) : admin.uid;

    const updatedDoc = stripUndefinedDeep({
      ...preserveExistingRequestCore(requestId, rawReq),
      status: 'rejected',
      reviewedBy,
      ...(rawReq.reviewedAt ? { reviewedAt: rawReq.reviewedAt } : { reviewedAt: ts }),
      ...(rawReq.verifiedBy ? { verifiedBy: rawReq.verifiedBy } : {}),
      ...(rawReq.verifiedAt ? { verifiedAt: rawReq.verifiedAt } : {}),
      ...(rawReq.verifiedTotalSar !== undefined ? { verifiedTotalSar: rawReq.verifiedTotalSar } : {}),
      ...(rawReq.verifiedPricing ? { verifiedPricing: rawReq.verifiedPricing } : {}),
      rejectedBy: admin.uid,
      rejectedAt: ts,
      rejectionReason: cleanReason,
      updatedAt: ts,
    });

    tx.updateOrderRequest(requestId, updatedDoc);
    tx.setAuditLog(
      buildAuditLogId(requestId, 'reject_request', nowMs),
      createAuditPayload({
        requestId,
        action: 'reject_request',
        admin,
        previousStatus: currentStatus,
        newStatus: 'rejected',
        reason: cleanReason,
        details: `Admin rejected order request: ${cleanReason}`,
        ts,
      }),
    );

    return {
      ...mapped,
      status: 'rejected',
      reviewedBy,
      reviewedAtMs: mapped.reviewedAtMs ?? nowMs,
      rejectedBy: admin.uid,
      rejectedAtMs: nowMs,
      rejectionReason: cleanReason,
      updatedAtMs: nowMs,
    };
  });
}

export async function fetchAuthoritativeCatalogForRequest(
  request: OrderRequest,
): Promise<AuthoritativeCatalogLookup> {
  const uniqueIds = Array.from(
    new Set(request.items.map((it) => it.itemId.trim()).filter(Boolean)),
  );

  const [coffeeSnap, menuSnaps, customSnaps] = await Promise.all([
    getDoc(doc(db, 'settings', 'coffeeOptions')),
    Promise.all(uniqueIds.map((id) => getDoc(doc(db, 'menu', id)))),
    Promise.all(uniqueIds.map((id) => getDoc(doc(db, 'productCustomizations', id)))),
  ]);

  const menuMap = new Map<string, AuthoritativeMenuRecord | null>();
  const customMap = new Map<string, ProductCustomizationConfig | null>();

  uniqueIds.forEach((id, idx) => {
    const mSnap = menuSnaps[idx];
    menuMap.set(
      id,
      mSnap.exists() ? ({ ...(mSnap.data() as AuthoritativeMenuRecord), id: mSnap.id }) : null,
    );
    const cSnap = customSnaps[idx];
    customMap.set(
      id,
      cSnap.exists() ? normalizeCustomizationConfig(id, cSnap.data()) : null,
    );
  });

  const coffeeOptions = coffeeSnap.exists()
    ? parseCoffeeOptionsDoc(coffeeSnap.data()) ?? DEFAULT_COFFEE_OPTIONS
    : DEFAULT_COFFEE_OPTIONS;

  return {
    getMenuDoc: (itemId) => menuMap.get(itemId) ?? null,
    getCustomizationDoc: (itemId) => customMap.get(itemId) ?? null,
    coffeeOptions,
  };
}

export function subscribeAllOrderRequestsForAdmin(
  onData: (requests: OrderRequest[]) => void,
  onError: (err: Error) => void,
): () => void {
  const requestsQuery = query(collection(db, 'orderRequests'));

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
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function mapAuditEntrySnapshot(id: string, data: DocumentData): OrderRequestAuditEntry {
  const rawCreated = data.createdAt;
  let createdAtMs: number | undefined;
  if (rawCreated && typeof rawCreated === 'object' && 'toMillis' in rawCreated) {
    createdAtMs = (rawCreated as { toMillis: () => number }).toMillis();
  } else if (typeof rawCreated === 'number') {
    createdAtMs = rawCreated;
  }

  return {
    id,
    requestId: String(data.requestId ?? ''),
    action: String(data.action ?? 'verify_request') as AdminOrderRequestAuditAction,
    adminUid: String(data.adminUid ?? ''),
    adminEmail: data.adminEmail ? String(data.adminEmail) : undefined,
    previousStatus: data.previousStatus
      ? normalizeOrderRequestStatus(data.previousStatus)
      : undefined,
    newStatus: data.newStatus ? normalizeOrderRequestStatus(data.newStatus) : undefined,
    approvedOrderId: data.approvedOrderId ? String(data.approvedOrderId) : undefined,
    approvedOrderNumber: data.approvedOrderNumber ? String(data.approvedOrderNumber) : undefined,
    verifiedTotalSar:
      typeof data.verifiedTotalSar === 'number' ? data.verifiedTotalSar : undefined,
    reason: data.reason ? String(data.reason) : undefined,
    details: data.details ? String(data.details) : undefined,
    createdAtMs,
  };
}

export function subscribeOrderRequestAuditLogs(
  onData: (entries: OrderRequestAuditEntry[]) => void,
  onError?: (err: Error) => void,
  maxEntries = 100,
): () => void {
  const auditQuery = query(collection(db, 'orderRequestAuditLogs'), firestoreLimit(maxEntries));

  return onSnapshot(
    auditQuery,
    (snapshot) => {
      const entries = snapshot.docs
        .map((d) => mapAuditEntrySnapshot(d.id, d.data()))
        .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
      onData(entries);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'orderRequestAuditLogs');
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}
