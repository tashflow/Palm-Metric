import fs from 'node:fs';
import path from 'node:path';
import {
  ADMIN_EMAILS,
  ADMIN_UIDS,
  AdminApprovalError,
  isVerifiedAdminActor,
  type AdminActor,
} from '../src/lib/adminAuth';
import {
  approveAndPromoteOrderRequest,
  deriveDeterministicOrderId,
  deriveOfficialOrderNumber,
  rejectOrderRequest,
  startOrderRequestReview,
  verifyOrderRequestPricing,
  type AdminOrderRequestStoreAdapter,
  type AdminOrderRequestTransactionAdapter,
} from '../src/lib/adminOrderRequests';
import {
  calculateAuthoritativeOrderRequestPricing,
  computeStockDeductionPlans,
  inspectOrderRequestVerification,
  type AuthoritativeCatalogLookup,
  type AuthoritativeMenuRecord,
} from '../src/lib/authoritativePricing';
import {
  mapOrderRequestSnapshot,
  mapOrderSnapshot,
  submitCustomerOrderRequest,
  type OrderRequestPersistenceAdapter,
} from '../src/lib/firestoreSync';
import { buildBilingualOrderRequestWhatsAppSummary } from '../src/lib/whatsapp';
import type { CoffeeOptionsSettings, ProductCustomizationConfig } from '../src/types';

let passed = 0;
let failed = 0;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message} (expected=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)})`,
    );
  }
}

async function runTest(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(err instanceof Error ? err.stack || err.message : String(err));
  }
}

class Stage04MHarness {
  orderRequests = new Map<string, Record<string, unknown>>();
  orders = new Map<string, Record<string, unknown>>();
  orderNumbers = new Map<string, Record<string, unknown>>();
  menu = new Map<string, AuthoritativeMenuRecord & Record<string, unknown>>();
  customizations = new Map<string, ProductCustomizationConfig>();
  auditLogs = new Map<string, Record<string, unknown>>();
  coffeeOptions: CoffeeOptionsSettings = {
    milkSelectionEnabled: true,
    coconutMilkExtraPrice: 3,
    hotColdSelectionEnabled: true,
  };
  private clockMs = 1776000000000;

  seedCatalog() {
    this.menu.set('v60-ethiopia-hot-cold', {
      id: 'v60-ethiopia-hot-cold',
      name: 'Ethiopia Hot / Cold',
      nameEn: 'Ethiopia Hot / Cold',
      nameAr: 'إثيوبيا (حار / بارد)',
      category: 'V60',
      price: 15,
      inStock: true,
      stockQuantity: 5,
      allowMilkOption: true,
    });
    this.menu.set('espresso-single', {
      id: 'espresso-single',
      name: 'Espresso',
      nameEn: 'Espresso',
      nameAr: 'إسبريسو',
      category: 'Espresso',
      price: 10,
      inStock: true,
      stockQuantity: 2,
    });
    this.menu.set('cold-brew', {
      id: 'cold-brew',
      name: 'Cold Brew',
      nameEn: 'Cold Brew',
      nameAr: 'كولد برو',
      category: 'Cold Drinks',
      price: 18,
      inStock: false, // out of stock
      stockQuantity: 0,
    });
    this.menu.set('cookie-classic', {
      id: 'cookie-classic',
      name: 'Classic Cookie',
      nameEn: 'Classic Cookie',
      nameAr: 'كوكيز كلاسيك',
      category: 'Food',
      price: 8,
      inStock: true,
      // No managed numeric stock fields (boolean-only tracking)
    });
  }

  createStoreAdapter(): AdminOrderRequestStoreAdapter {
    return {
      runTransaction: async <T>(
        fn: (tx: AdminOrderRequestTransactionAdapter) => Promise<T>,
      ): Promise<T> => {
        const stagedReqUpdates = new Map<string, Record<string, unknown>>();
        const stagedOrders = new Map<string, Record<string, unknown>>();
        const stagedAudits = new Map<string, Record<string, unknown>>();
        const stagedMenuUpdates = new Map<string, Record<string, unknown>>();
        const stagedOrderNumbers = new Map<string, Record<string, unknown>>();
        const tsNow = ++this.clockMs;

        const txAdapter: AdminOrderRequestTransactionAdapter = {
          getOrderRequest: async (reqId) => {
            const raw = this.orderRequests.get(reqId);
            return raw ? structuredClone(raw) : null;
          },
          getOrder: async (ordId) => {
            const raw = this.orders.get(ordId);
            return raw ? structuredClone(raw) : null;
          },
          getMenuDoc: async (itemId) => {
            const raw = this.menu.get(itemId);
            return raw ? structuredClone(raw) : null;
          },
          getCustomizationDoc: async (itemId) => {
            const raw = this.customizations.get(itemId);
            return raw ? structuredClone(raw) : null;
          },
          getCoffeeOptions: async () => structuredClone(this.coffeeOptions),
          getOrderNumberClaim: async (orderNum) => {
            const raw = this.orderNumbers.get(orderNum);
            return raw ? structuredClone(raw) : null;
          },
          updateOrderRequest: (reqId, fullDoc) => {
            stagedReqUpdates.set(reqId, structuredClone(fullDoc));
          },
          setOrder: (ordId, docData) => {
            stagedOrders.set(ordId, structuredClone(docData));
          },
          setAuditLog: (auditId, auditDoc) => {
            stagedAudits.set(auditId, structuredClone(auditDoc));
          },
          updateMenuDoc: (itemId, fullMenuDoc) => {
            if ('id' in fullMenuDoc) {
              throw new Error('Menu update payload MUST NOT inject synthetic id key.');
            }
            stagedMenuUpdates.set(itemId, structuredClone(fullMenuDoc));
          },
          setOrderNumberClaim: (orderNum, claimDoc) => {
            if (this.orderNumbers.has(orderNum)) {
              throw new Error(`OrderNumber "${orderNum}" already claimed.`);
            }
            stagedOrderNumbers.set(orderNum, structuredClone(claimDoc));
          },
          serverTimestamp: () => tsNow,
          nowMs: () => tsNow,
        };

        const result = await fn(txAdapter);

        // Commit staged writes
        for (const [k, v] of stagedReqUpdates.entries()) this.orderRequests.set(k, v);
        for (const [k, v] of stagedOrders.entries()) this.orders.set(k, v);
        for (const [k, v] of stagedAudits.entries()) this.auditLogs.set(k, v);
        for (const [k, v] of stagedMenuUpdates.entries()) this.menu.set(k, v as any);
        for (const [k, v] of stagedOrderNumbers.entries()) this.orderNumbers.set(k, v);

        return result;
      },
    };
  }
}

async function runStage04MTests() {
  console.log('Running Palm Metric Stage 04M Integration & Compatibility Suite...');

  const harness = new Stage04MHarness();
  harness.seedCatalog();

  const adminActor: AdminActor = {
    uid: '39H76y4E55g5yX2uY0lE5bQ3a393',
    email: 'palmmetric1@gmail.com',
    emailVerified: true,
    isAnonymous: false,
    providerId: 'google.com',
  };

  await runTest('1. Admin authorization validates verified allowlist and blocks anonymous/unverified actors', () => {
    const verifiedAdmin = isVerifiedAdminActor(adminActor);
    assert(verifiedAdmin, 'Valid admin actor must pass isVerifiedAdminActor');

    const anonActor: AdminActor = {
      uid: 'anon123',
      email: 'palmmetric1@gmail.com',
      emailVerified: true,
      isAnonymous: true,
      providerId: 'anonymous',
    };
    assert(!isVerifiedAdminActor(anonActor), 'Anonymous actor must be rejected');

    const unverifiedActor: AdminActor = {
      uid: 'user456',
      email: 'outsider@gmail.com',
      emailVerified: false,
      isAnonymous: false,
      providerId: 'google.com',
    };
    assert(!isVerifiedAdminActor(unverifiedActor), 'Unverified external actor must be rejected');
  });

  await runTest('2. Customer submits unpriced order request to /orderRequests with pending_review status', async () => {
    let createdDoc: Record<string, unknown> | null = null;
    const persistenceAdapter: OrderRequestPersistenceAdapter = {
      ensureSession: async () => ({ user: { uid: 'cust_uid_999' } }),
      getExistingRequest: async () => null,
      createRequestDoc: async (requestId, payload) => {
        createdDoc = payload;
        harness.orderRequests.set(requestId, payload);
      },
      serverTimestampValue: () => 1776000000000,
    };

    const submitted = await submitCustomerOrderRequest(
      {
        requestId: 'req_test_04m_111111',
        orderType: 'pickup',
        customerName: 'Ahmad Salem',
        customerPhone: '+966506439172',
        orderNote: 'Extra hot please',
        items: [{ itemId: 'v60-ethiopia-hot-cold', quantity: 2, temperature: 'Hot' }],
        lang: 'en',
      },
      persistenceAdapter,
    );

    assertEqual(submitted.status, 'pending_review', 'Status must be pending_review');
    assertEqual(submitted.customerUid, 'cust_uid_999', 'Customer UID must match session');
    assert(createdDoc !== null, 'Request doc must be written');
  });

  await runTest('3. Admin inspects, reviews, verifies pricing, and approves/promotes order request', async () => {
    const requestId = 'req_test_04m_111111';
    const store = harness.createStoreAdapter();

    // Start Review
    const reviewed = await startOrderRequestReview({
      requestId,
      admin: adminActor,
      store,
    });
    assertEqual(reviewed.status, 'reviewing', 'Status must transition to reviewing');

    // Verify Pricing & Stock
    const verifiedResult = await verifyOrderRequestPricing({
      requestId,
      admin: adminActor,
      store,
    });
    assertEqual(verifiedResult.breakdown.totalBillSar, 30, 'Total bill for 2x V60 (15 SAR) must be 30 SAR');
    assertEqual(verifiedResult.request.status, 'verified', 'Status must transition to verified');

    // Approve and Promote
    const promoted = await approveAndPromoteOrderRequest({
      requestId,
      admin: adminActor,
      store,
    });
    assert(!promoted.idempotentReplay, 'First promotion must not be a replay');
    assertEqual(promoted.totalBillSar, 30, 'Promoted order total must be 30 SAR');
    assert(promoted.orderNumber.startsWith('PM-'), 'Official order number must start with PM-');

    // Verify inventory deduction (stock 5 -> 3)
    const menuDoc = harness.menu.get('v60-ethiopia-hot-cold');
    assertEqual(menuDoc?.stockQuantity, 3, 'Stock quantity must decrease from 5 to 3 atomically');

    // Verify /orders doc created
    const orderDoc = harness.orders.get(promoted.orderId);
    assert(orderDoc !== undefined, 'Canonical /orders document must be created');
    assertEqual(orderDoc?.status, 'Pending', 'New order status must be Pending');
    assertEqual(orderDoc?.sourceRequestId, requestId, 'Order must link sourceRequestId');
  });

  await runTest('4. Idempotent re-promotion returns existing promoted order without duplicating stock', async () => {
    const requestId = 'req_test_04m_111111';
    const store = harness.createStoreAdapter();

    const stockBefore = harness.menu.get('v60-ethiopia-hot-cold')?.stockQuantity;

    const promotedAgain = await approveAndPromoteOrderRequest({
      requestId,
      admin: adminActor,
      store,
    });
    assert(promotedAgain.idempotentReplay, 'Second promotion must be an idempotent replay');
    assertEqual(promotedAgain.totalBillSar, 30, 'Total must remain 30 SAR');

    const stockAfter = harness.menu.get('v60-ethiopia-hot-cold')?.stockQuantity;
    assertEqual(stockAfter, stockBefore, 'Stock must not be deducted twice on idempotent replay');
  });

  await runTest('5. Insufficient stock blocks verification and promotion with OUT_OF_STOCK / INSUFFICIENT_STOCK', async () => {
    const requestId = 'req_test_stock_fail';
    harness.orderRequests.set(requestId, {
      requestId,
      customerUid: 'cust_uid_888',
      customerName: 'Sultan Fahad',
      customerContact: '+966500000000',
      orderType: 'pickup',
      currency: 'SAR',
      items: [{ itemId: 'espresso-single', quantity: 5 }], // only 2 in stock
      status: 'pending_review',
      requestSource: 'customer-app-spark',
      createdAt: 1776000000000,
      updatedAt: 1776000000000,
    });

    const store = harness.createStoreAdapter();
    let threw = false;
    try {
      await verifyOrderRequestPricing({
        requestId,
        admin: adminActor,
        store,
      });
    } catch (err) {
      threw = true;
      assert(err instanceof AdminApprovalError, 'Must throw AdminApprovalError');
      assertEqual((err as AdminApprovalError).reasonCode, 'INSUFFICIENT_STOCK', 'Reason code must be INSUFFICIENT_STOCK');
    }
    assert(threw, 'Verification must throw on stock shortage');
  });

  await runTest('6. Legacy order mapping preserves old schema and new reader formats', () => {
    const legacyRaw = {
      orderNumber: 'PM-102030',
      customerUid: 'uid_legacy_1',
      customerName: 'Noura Ali',
      customerPhone: '+966511111111',
      items: [{ itemId: 'v60-ethiopia-hot-cold', name: 'Ethiopia V60', price: 15, quantity: 1 }],
      total: 15,
      status: 'Ready',
      orderType: 'pickup',
      createdAt: 1775000000000,
    };
    const mapped = mapOrderSnapshot('ord_legacy_1', legacyRaw);
    assertEqual(mapped.orderNumber, 'PM-102030', 'Order number must map correctly');
    assertEqual(mapped.total, 15, 'Total must map correctly');
    assertEqual(mapped.status, 'Ready', 'Status must map correctly');
    assertEqual(mapped.customerPhone, '+966511111111', 'Phone must map correctly');
  });

  await runTest('7. Spark rules preserve Admin category compatibility, /admins lock, allowlist parity, and list-query safety', () => {
    const sparkRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.spark.rules'), 'utf8');
    const catMatch = sparkRules.match(/function isValidCategory\(data\) \{[\s\S]*?\n    \}/);
    assert(catMatch, 'isValidCategory block must exist in firestore.spark.rules');
    const catBlock = catMatch![0];
    assert(catBlock.includes('data.keys().size() <= 15'), 'isValidCategory must permit up to 15 keys');
    for (const key of ['key', 'allowMilkOption', 'allowTemperature']) {
      assert(catBlock.includes(`'${key}'`), `isValidCategory must allow Admin field '${key}'`);
    }

    const adminsBlock = sparkRules.match(/match \/admins\/\{adminId\} \{[\s\S]*?\n    \}/)?.[0] || '';
    assert(adminsBlock.includes('allow create, update, delete: if false;'), '/admins/{adminId} must block client mutations');

    for (const email of ADMIN_EMAILS) {
      assert(sparkRules.includes(`'${email}'`), `Spark rules allowlist must include email ${email}`);
    }
    for (const uid of ADMIN_UIDS) {
      assert(sparkRules.includes(`'${uid}'`), `Spark rules allowlist must include UID ${uid}`);
    }
    assert(
      sparkRules.includes('allow list: if isSignedIn() && (\n        isVerifiedAdminToken()'),
      'Collection list rules must use isVerifiedAdminToken() without DB exists() calls',
    );
  });

  await runTest('8. WhatsApp Order Request summary and tracker snapshot preserve Spark zero-trust contract', () => {
    const waUrl = buildBilingualOrderRequestWhatsAppSummary({
      requestNumber: 'REQ-04M101',
      requestId: 'req_test_04m_111111',
      items: [{ itemId: 'v60-ethiopia-hot-cold', name: 'Ethiopia Hot / Cold', nameAr: 'إثيوبيا (حار / بارد)', quantity: 2, temperature: 'Hot' }],
      customerName: 'Ahmad Salem',
      customerPhone: '+966506439172',
      orderNote: 'Pickup ASAP',
    });
    assert(waUrl.startsWith('https://wa.me/966506439172?text='), 'WhatsApp URL must target fixed 966506439172 number');
    const decoded = decodeURIComponent(waUrl.split('?text=')[1] || '');
    assert(decoded.includes('ORDER REQUEST'), 'WhatsApp summary must state order request status');
    assert(decoded.includes('Pending Admin Verification'), 'WhatsApp summary must state pricing awaits Admin verification');
    assert(!decoded.includes('Total / الإجمالي:'), 'WhatsApp request summary must omit unverified client totals');

    const promotedSnap = mapOrderRequestSnapshot(
      'req_test_04m_111111',
      harness.orderRequests.get('req_test_04m_111111')!,
    );
    assertEqual(promotedSnap.status, 'order_created', 'Tracker snapshot must reflect promoted status');
    assert(typeof promotedSnap.approvedOrderNumber === 'string' && promotedSnap.approvedOrderNumber.startsWith('PM-'), 'Tracker snapshot must expose approved PM- order number');
    assertEqual(promotedSnap.verifiedTotalSar, 30, 'Tracker snapshot must expose Admin-verified SAR total');
  });

  console.log(`\nStage 04M Test Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runStage04MTests().catch((err) => {
  console.error('Unhandled error in stage04m tests:', err);
  process.exit(1);
});
