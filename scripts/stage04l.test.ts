import fs from 'node:fs';
import path from 'node:path';
import { COPY } from '../src/data/i18n';
import {
  ADMIN_EMAILS,
  AdminApprovalError,
  assertVerifiedAdminActor,
  isVerifiedAdminActor,
  type AdminActor,
} from '../src/lib/adminAuth';
import {
  approveAndPromoteOrderRequest,
  deriveDeterministicOrderId,
  deriveOfficialOrderNumber,
  mapAuditEntrySnapshot,
  rejectOrderRequest,
  startOrderRequestReview,
  verifyOrderRequestPricing,
  type AdminOrderRequestStoreAdapter,
  type AdminOrderRequestTransactionAdapter,
} from '../src/lib/adminOrderRequests';
import {
  calculateAuthoritativeOrderRequestPricing,
  halalasToSar,
  inspectOrderRequestVerification,
  sarToHalalas,
  type AuthoritativeCatalogLookup,
  type AuthoritativeMenuRecord,
} from '../src/lib/authoritativePricing';
import {
  mapOrderRequestSnapshot,
  mapOrderSnapshot,
  normalizeOrderRequestStatus,
  submitCustomerOrderRequest,
  type OrderRequestPersistenceAdapter,
} from '../src/lib/firestoreSync';
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

class InMemorySparkFirestoreHarness {
  orderRequests = new Map<string, Record<string, unknown>>();
  orders = new Map<string, Record<string, unknown>>();
  menu = new Map<string, AuthoritativeMenuRecord>();
  customizations = new Map<string, ProductCustomizationConfig>();
  auditLogs = new Map<string, Record<string, unknown>>();
  coffeeOptions: CoffeeOptionsSettings = {
    milkSelectionEnabled: true,
    coconutMilkExtraPrice: 3,
    hotColdSelectionEnabled: true,
  };
  private txChain: Promise<void> = Promise.resolve();
  private clockMs = 1770000000000;

  seedCatalog() {
    this.menu.set('v60-ethiopia-hot-cold', {
      id: 'v60-ethiopia-hot-cold',
      name: 'Ethiopia Hot / Cold',
      nameEn: 'Ethiopia Hot / Cold',
      nameAr: 'إثيوبيا (حار / بارد)',
      category: 'V60',
      price: 12,
      inStock: true,
      supportsTemp: true,
      allowTemperature: true,
      allowMilkOption: true,
      imageUrl: 'https://example.com/v60.jpg',
    });

    this.menu.set('cotd-small', {
      id: 'cotd-small',
      name: 'Coffee of the Day – Small',
      nameEn: 'Coffee of the Day – Small',
      nameAr: 'قهوة اليوم – صغير',
      category: 'Coffee of the Day',
      price: 6.5,
      inStock: true,
      supportsTemp: true,
      allowMilkOption: true,
      imageUrl: '',
    });

    this.menu.set('matcha-iced', {
      id: 'matcha-iced',
      name: 'Iced Matcha',
      nameEn: 'Iced Matcha',
      nameAr: 'آيس ماتشا',
      category: 'Matcha',
      price: 17,
      inStock: true,
      allowMilkOption: true,
      coconutMilkPrice: 4,
      imageUrl: '',
    });

    this.customizations.set('v60-ethiopia-hot-cold', {
      productId: 'v60-ethiopia-hot-cold',
      enabled: true,
      schemaVersion: 1,
      allowSpecialInstructions: true,
      groups: [
        {
          id: 'size',
          name: 'Size',
          nameAr: 'الحجم',
          type: 'single',
          required: true,
          minSelections: 1,
          maxSelections: 1,
          displayOrder: 0,
          enabled: true,
          options: [
            {
              id: 'regular',
              name: 'Regular',
              nameAr: 'عادي',
              additionalPrice: 0,
              enabled: true,
              isDefault: true,
              displayOrder: 0,
            },
            {
              id: 'large',
              name: 'Large',
              nameAr: 'كبير',
              additionalPrice: 4.5,
              enabled: true,
              displayOrder: 1,
            },
          ],
        },
        {
          id: 'brew-profile',
          name: 'Brew Style',
          nameAr: 'أسلوب التقطير',
          type: 'multiple',
          required: false,
          minSelections: 0,
          maxSelections: 2,
          displayOrder: 1,
          enabled: true,
          options: [
            {
              id: 'extra-shot',
              name: 'Extra Espresso Shot',
              nameAr: 'إضافة شوت إسبريسو',
              additionalPrice: 3.25,
              enabled: true,
              displayOrder: 0,
            },
            {
              id: 'oat-milk',
              name: 'Oat Milk',
              nameAr: 'حليب شوفان',
              additionalPrice: 2.25,
              enabled: true,
              displayOrder: 1,
            },
          ],
        },
      ],
    });
  }

  getCatalogLookup(): AuthoritativeCatalogLookup {
    return {
      getMenuDoc: (id) => this.menu.get(id) ?? null,
      getCustomizationDoc: (id) => this.customizations.get(id) ?? null,
      coffeeOptions: this.coffeeOptions,
    };
  }

  createStoreAdapter(): AdminOrderRequestStoreAdapter {
    return {
      runTransaction: async <T>(
        fn: (tx: AdminOrderRequestTransactionAdapter) => Promise<T>,
      ): Promise<T> => {
        let releaseLock: () => void = () => {};
        const prev = this.txChain;
        this.txChain = new Promise<void>((resolve) => {
          releaseLock = resolve;
        });

        await prev;
        try {
          // Stage staged writes so failed transactions never mutate store state
          const stagedReqUpdates = new Map<string, Record<string, unknown>>();
          const stagedOrders = new Map<string, Record<string, unknown>>();
          const stagedAudits = new Map<string, Record<string, unknown>>();
          const tsNow = ++this.clockMs;

          const txAdapter: AdminOrderRequestTransactionAdapter = {
            getOrderRequest: async (requestId) => {
              const raw = this.orderRequests.get(requestId);
              return raw ? structuredClone(raw) : null;
            },
            getOrder: async (orderId) => {
              const raw = this.orders.get(orderId);
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
            updateOrderRequest: (requestId, fullDoc) => {
              stagedReqUpdates.set(requestId, structuredClone(fullDoc));
            },
            setOrder: (orderId, docData) => {
              stagedOrders.set(orderId, structuredClone(docData));
            },
            setAuditLog: (auditId, auditDoc) => {
              stagedAudits.set(auditId, structuredClone(auditDoc));
            },
            serverTimestamp: () => tsNow,
            nowMs: () => tsNow,
          };

          const result = await fn(txAdapter);

          // Atomic commit on success
          for (const [k, v] of stagedReqUpdates.entries()) {
            this.orderRequests.set(k, v);
          }
          for (const [k, v] of stagedOrders.entries()) {
            this.orders.set(k, v);
          }
          for (const [k, v] of stagedAudits.entries()) {
            this.auditLogs.set(k, v);
          }
          return result;
        } finally {
          releaseLock();
        }
      },
    };
  }
}

const VERIFIED_ADMIN: AdminActor = {
  uid: 'admin_uid_001',
  email: 'tashflow26@gmail.com',
  emailVerified: true,
  isAnonymous: false,
  providerId: 'google.com',
};

function makeSampleRequestDoc(requestId: string, customerUid = 'cust_guest_01'): Record<string, unknown> {
  return {
    requestId,
    customerUid,
    customerName: 'Noura Al-Qahtani',
    customerContact: '0551234567',
    orderType: 'pickup',
    currency: 'SAR',
    lang: 'en',
    orderNote: 'Waiting near entrance',
    items: [
      {
        itemId: 'v60-ethiopia-hot-cold',
        name: 'Ethiopia Hot / Cold',
        nameAr: 'إثيوبيا (حار / بارد)',
        quantity: 2,
        temperature: 'Cold',
        selectedCustomizations: [
          { groupId: 'size', optionId: 'large' },
          { groupId: 'brew-profile', optionId: 'extra-shot' },
        ],
        specialInstructions: 'Light ice',
      },
      {
        itemId: 'matcha-iced',
        name: 'Iced Matcha',
        quantity: 1,
        milkOption: 'coconut',
      },
    ],
    status: 'pending_review',
    requestSource: 'customer-app-spark',
    createdAt: 1770000000000,
    updatedAt: 1770000000000,
  };
}

async function main() {
  console.log('Running Palm Metric Stage 04L Verification Suite (20 tests)...\n');

  // 1. Admin authorization enforcement
  await runTest('1. Enforces verified Admin authentication and blocks anonymous/customer accounts', async () => {
    assert(isVerifiedAdminActor(VERIFIED_ADMIN), 'Verified email allowlist admin passes');
    assert(
      isVerifiedAdminActor({ uid: '39H76y4E55g5yX2uY0lE5bQ3a393', isAnonymous: false }),
      'Explicit allowlisted admin UID passes',
    );
    assert(
      isVerifiedAdminActor({
        uid: 'custom_admin_uid',
        email: 'staff@palmmetric.com',
        emailVerified: true,
        isAnonymous: false,
        providerId: 'google.com',
        isAdminDocPresent: true,
      }),
      'Verified user with /admins/{uid} doc passes',
    );
    assert(!isVerifiedAdminActor(null), 'Null user fails');
    assert(
      !isVerifiedAdminActor({
        uid: 'anon_1',
        isAnonymous: true,
        providerId: 'anonymous',
        email: 'tashflow26@gmail.com',
        emailVerified: true,
      }),
      'Anonymous provider with spoofed email MUST be rejected',
    );
    assert(
      !isVerifiedAdminActor({
        uid: 'cust_1',
        email: 'tashflow26@gmail.com',
        emailVerified: false,
        isAnonymous: false,
        providerId: 'google.com',
      }),
      'Unverified email MUST be rejected',
    );
    assert(
      !isVerifiedAdminActor({
        uid: 'cust_2',
        email: 'randomcustomer@gmail.com',
        emailVerified: true,
        isAnonymous: false,
        providerId: 'google.com',
      }),
      'Non-admin verified email MUST be rejected',
    );

    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    harness.orderRequests.set('req_auth_block', makeSampleRequestDoc('req_auth_block'));
    let blockedErr: unknown = null;
    try {
      await approveAndPromoteOrderRequest({
        requestId: 'req_auth_block',
        admin: { uid: 'guest_1', isAnonymous: true },
        store: harness.createStoreAdapter(),
      });
    } catch (err) {
      blockedErr = err;
    }
    assert(blockedErr instanceof AdminApprovalError, 'Non-admin approval throws AdminApprovalError');
    assertEqual((blockedErr as AdminApprovalError).reasonCode, 'ADMIN_AUTH_REQUIRED', 'Fails with ADMIN_AUTH_REQUIRED');
    assertEqual(harness.orders.size, 0, 'No /orders created on unauthorized attempt');
  });

  // 2. Integer halala pricing accuracy
  await runTest('2. Calculates authoritative halala-exact SAR pricing across base prices, sizes, and add-ons', () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    const mapped = mapOrderRequestSnapshot('req_price_01', makeSampleRequestDoc('req_price_01'));
    const breakdown = calculateAuthoritativeOrderRequestPricing(
      mapped,
      harness.getCatalogLookup(),
      VERIFIED_ADMIN,
    );

    // Line 1: V60 base 12 + Large 4.5 + Extra Shot 3.25 = 19.75 * 2 = 39.50 SAR
    // Line 2: Iced Matcha base 17 + Coconut 4 (product coconutMilkPrice override) = 21.00 * 1 = 21.00 SAR
    // Total: 60.50 SAR
    assertEqual(breakdown.currency, 'SAR', 'Currency is SAR');
    assertEqual(breakdown.orderType, 'pickup', 'Order type is pickup');
    assertEqual(breakdown.discountSar, 0, 'Zero invented discounts');
    assertEqual(breakdown.taxSar, 0, 'Zero invented taxes');
    assertEqual(breakdown.items[0].unitPriceSar, 19.75, 'V60 unit price verified');
    assertEqual(breakdown.items[0].lineTotalSar, 39.5, 'V60 line total verified');
    assertEqual(breakdown.items[1].unitPriceSar, 21, 'Matcha + Coconut override price verified');
    assertEqual(breakdown.subtotalSar, 60.5, 'Subtotal exact in SAR');
    assertEqual(breakdown.totalBillSar, 60.5, 'Total exact in SAR');
    assertEqual(halalasToSar(sarToHalalas(0.1) + sarToHalalas(0.2)), 0.3, 'Halala prevents JS 0.1+0.2 float drift');
  });

  // 3. Out-of-stock / unavailable product blocks verification and promotion
  await runTest('3. Out-of-stock product blocks both catalog inspection and order promotion', async () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    harness.menu.set('matcha-iced', {
      ...harness.menu.get('matcha-iced')!,
      inStock: false,
    });
    harness.orderRequests.set('req_oos_01', makeSampleRequestDoc('req_oos_01'));

    const mapped = mapOrderRequestSnapshot('req_oos_01', harness.orderRequests.get('req_oos_01')!);
    const inspection = inspectOrderRequestVerification(mapped, harness.getCatalogLookup(), VERIFIED_ADMIN);
    assert(!inspection.canApprove, 'Inspection blocks out-of-stock product');
    assertEqual(inspection.issues[0].code, 'OUT_OF_STOCK', 'Diagnostic identifies OUT_OF_STOCK');

    let caught: unknown = null;
    try {
      await approveAndPromoteOrderRequest({
        requestId: 'req_oos_01',
        admin: VERIFIED_ADMIN,
        store: harness.createStoreAdapter(),
      });
    } catch (err) {
      caught = err;
    }
    assert(caught instanceof AdminApprovalError, 'Promotion blocked on out-of-stock item');
    assertEqual((caught as AdminApprovalError).reasonCode, 'OUT_OF_STOCK', 'Throws OUT_OF_STOCK');
    assertEqual(harness.orders.size, 0, 'Zero orders created');
  });

  // 4. Insufficient numeric stock counter blocks approval
  await runTest('4. Numeric stockQuantity lower than requested quantity blocks promotion', async () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    harness.menu.set('v60-ethiopia-hot-cold', {
      ...harness.menu.get('v60-ethiopia-hot-cold')!,
      stockQuantity: 1, // Request asks for qty 2
    });
    harness.orderRequests.set('req_low_stock', makeSampleRequestDoc('req_low_stock'));

    let caught: unknown = null;
    try {
      await verifyOrderRequestPricing({
        requestId: 'req_low_stock',
        admin: VERIFIED_ADMIN,
        store: harness.createStoreAdapter(),
      });
    } catch (err) {
      caught = err;
    }
    assert(caught instanceof AdminApprovalError, 'Verify blocked when quantity exceeds stockQuantity');
    assertEqual((caught as AdminApprovalError).reasonCode, 'INSUFFICIENT_STOCK', 'Reports INSUFFICIENT_STOCK');
  });

  // 5. Missing / deleted product blocks approval
  await runTest('5. Deleted or unknown product in request blocks verification and promotion', async () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    harness.menu.delete('matcha-iced');
    harness.orderRequests.set('req_missing_sku', makeSampleRequestDoc('req_missing_sku'));

    let caught: unknown = null;
    try {
      await approveAndPromoteOrderRequest({
        requestId: 'req_missing_sku',
        admin: VERIFIED_ADMIN,
        store: harness.createStoreAdapter(),
      });
    } catch (err) {
      caught = err;
    }
    assert(caught instanceof AdminApprovalError, 'Deleted SKU throws error');
    assertEqual((caught as AdminApprovalError).reasonCode, 'UNKNOWN_PRODUCT', 'Reports UNKNOWN_PRODUCT');
    assertEqual(harness.orders.size, 0, 'No order created when product is missing');
  });

  // 6. Disabled customization option blocks approval
  await runTest('6. Disabled or unavailable customization option blocks verification and approval', async () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    const cfg = structuredClone(harness.customizations.get('v60-ethiopia-hot-cold')!);
    cfg.groups[1].options[0].enabled = false; // Disable extra-shot
    harness.customizations.set('v60-ethiopia-hot-cold', cfg);
    harness.orderRequests.set('req_dis_opt', makeSampleRequestDoc('req_dis_opt'));

    let caught: unknown = null;
    try {
      await approveAndPromoteOrderRequest({
        requestId: 'req_dis_opt',
        admin: VERIFIED_ADMIN,
        store: harness.createStoreAdapter(),
      });
    } catch (err) {
      caught = err;
    }
    assert(caught instanceof AdminApprovalError, 'Disabled option blocks promotion');
    assertEqual((caught as AdminApprovalError).reasonCode, 'INVALID_OR_DISABLED_OPTION', 'Reports INVALID_OR_DISABLED_OPTION');
  });

  // 7. Missing required customization group blocks approval
  await runTest('7. Missing required customization group blocks verification and promotion', async () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    const reqDoc = makeSampleRequestDoc('req_req_group');
    (reqDoc.items as Record<string, unknown>[])[0] = {
      itemId: 'v60-ethiopia-hot-cold',
      quantity: 1,
      // Missing required 'size' group
    };
    harness.orderRequests.set('req_req_group', reqDoc);

    let caught: unknown = null;
    try {
      await verifyOrderRequestPricing({
        requestId: 'req_req_group',
        admin: VERIFIED_ADMIN,
        store: harness.createStoreAdapter(),
      });
    } catch (err) {
      caught = err;
    }
    assert(caught instanceof AdminApprovalError, 'Missing required group throws error');
    assertEqual((caught as AdminApprovalError).reasonCode, 'REQUIRED_GROUP_MISSING', 'Reports REQUIRED_GROUP_MISSING');
  });

  // 8. Invalid/negative catalog price fails closed & ignores tampered client numbers
  await runTest('8. Invalid/negative catalog prices fail closed and tampered client fields cannot affect verified total', async () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    harness.orderRequests.set('req_tamper', {
      ...makeSampleRequestDoc('req_tamper'),
      // Even if a rogue doc had client-injected price properties, pricing must completely ignore them
      totalBill: 0.01,
      items: [{ itemId: 'cotd-small', quantity: 2, price: 0.01, overridePrice: 0 }],
    });

    const res = await verifyOrderRequestPricing({
      requestId: 'req_tamper',
      admin: VERIFIED_ADMIN,
      store: harness.createStoreAdapter(),
    });
    assertEqual(res.breakdown.totalBillSar, 13, 'Authoritative price 6.5 * 2 = 13 SAR ignores client 0.01');

    harness.menu.set('cotd-small', {
      ...harness.menu.get('cotd-small')!,
      price: -5,
    });
    let negErr: unknown = null;
    try {
      await verifyOrderRequestPricing({
        requestId: 'req_tamper',
        admin: VERIFIED_ADMIN,
        store: harness.createStoreAdapter(),
      });
    } catch (err) {
      negErr = err;
    }
    assert(negErr instanceof AdminApprovalError, 'Negative catalog price fails verification');
    assertEqual((negErr as AdminApprovalError).reasonCode, 'NEGATIVE_CATALOG_PRICE', 'Reports NEGATIVE_CATALOG_PRICE');
  });

  // 9. Start Review lifecycle step
  await runTest('9. startOrderRequestReview moves pending_review to reviewing and creates start_review audit log', async () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    harness.orderRequests.set('req_rev_01', makeSampleRequestDoc('req_rev_01'));
    const store = harness.createStoreAdapter();

    const updated = await startOrderRequestReview({
      requestId: 'req_rev_01',
      admin: VERIFIED_ADMIN,
      store,
    });
    assertEqual(updated.status, 'reviewing', 'Status transitioned to reviewing');
    assertEqual(updated.reviewedBy, VERIFIED_ADMIN.uid, 'Recorded reviewedBy admin UID');
    const logs = Array.from(harness.auditLogs.values());
    assertEqual(logs.length, 1, 'Recorded 1 audit log entry');
    assertEqual(logs[0].action, 'start_review', 'Audit action is start_review');
    assertEqual(logs[0].previousStatus, 'pending_review', 'Audit captured previousStatus');
    assertEqual(logs[0].newStatus, 'reviewing', 'Audit captured newStatus');
  });

  // 10. Verify workflow step
  await runTest('10. verifyOrderRequestPricing transitions to verified and logs verify_request + price_verification', async () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    harness.orderRequests.set('req_ver_01', makeSampleRequestDoc('req_ver_01'));
    const store = harness.createStoreAdapter();

    await startOrderRequestReview({ requestId: 'req_ver_01', admin: VERIFIED_ADMIN, store });
    const res = await verifyOrderRequestPricing({
      requestId: 'req_ver_01',
      admin: VERIFIED_ADMIN,
      store,
    });

    assertEqual(res.request.status, 'verified', 'Status transitioned to verified');
    assertEqual(res.request.verifiedTotalSar, 60.5, 'Verified total saved on request');
    const saved = harness.orderRequests.get('req_ver_01')!;
    assertEqual(saved.verifiedBy, VERIFIED_ADMIN.uid, 'Saved verifiedBy UID');
    assert(Boolean(saved.verifiedPricing), 'Saved full verifiedPricing snapshot');
    const actions = Array.from(harness.auditLogs.values()).map((a) => a.action);
    assert(actions.includes('verify_request'), 'Audit contains verify_request');
    assert(actions.includes('price_verification'), 'Audit contains price_verification');
  });

  // 11. Approve & Promote creates /orders and links /orderRequests cleanly
  await runTest('11. approveAndPromoteOrderRequest creates canonical /orders doc, links request, and records audit trail', async () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    harness.orderRequests.set('req_prom_01', makeSampleRequestDoc('req_prom_01', 'uid_customer_99'));
    const store = harness.createStoreAdapter();

    const result = await approveAndPromoteOrderRequest({
      requestId: 'req_prom_01',
      admin: VERIFIED_ADMIN,
      store,
    });

    const expectedOrderId = deriveDeterministicOrderId('req_prom_01');
    const expectedOrderNumber = deriveOfficialOrderNumber('req_prom_01');

    assertEqual(result.idempotentReplay, false, 'Initial promotion is not a replay');
    assertEqual(result.orderId, expectedOrderId, 'Order ID derived deterministically');
    assertEqual(result.orderNumber, expectedOrderNumber, 'Official PM-XXXXXX order number generated');
    assert(expectedOrderNumber.startsWith('PM-') && expectedOrderNumber.length === 9, 'Follows PM-XXXXXX format');
    assertEqual(harness.orders.size, 1, 'Exactly one order created');

    const orderDoc = harness.orders.get(expectedOrderId)!;
    assertEqual(orderDoc.customerUid, 'uid_customer_99', 'Customer ownership preserved');
    assertEqual(orderDoc.sourceRequestId, 'req_prom_01', 'sourceRequestId linked');
    assertEqual(orderDoc.orderType, 'pickup', 'Order type pickup');
    assertEqual(orderDoc.currency, 'SAR', 'Currency SAR');
    assertEqual(orderDoc.status, 'Pending', 'Initial kitchen status Pending');
    assertEqual(orderDoc.paymentMethod, 'pay_on_pickup', 'Pay on pickup set cleanly');
    assertEqual(orderDoc.paymentStatus, 'unpaid', 'Payment status initialized unpaid');
    assertEqual(orderDoc.totalBill, 60.5, 'Authoritative totalBill saved on /orders');

    const reqDoc = harness.orderRequests.get('req_prom_01')!;
    assertEqual(reqDoc.status, 'order_created', 'Request marked order_created');
    assertEqual(reqDoc.approvedOrderId, expectedOrderId, 'Request stores approvedOrderId');
    assertEqual(reqDoc.approvedOrderNumber, expectedOrderNumber, 'Request stores approvedOrderNumber');

    const actions = Array.from(harness.auditLogs.values()).map((a) => a.action);
    assert(actions.includes('approve_and_promote'), 'Audit records approve_and_promote');
    assert(actions.includes('order_promotion'), 'Audit records order_promotion');
  });

  // 12. Concurrency protection (parallel double clicks)
  await runTest('12. Concurrent / double-click approvals create strictly one /orders document (zero duplicates)', async () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    harness.orderRequests.set('req_race_01', makeSampleRequestDoc('req_race_01'));
    const store = harness.createStoreAdapter();

    const [r1, r2, r3] = await Promise.all([
      approveAndPromoteOrderRequest({ requestId: 'req_race_01', admin: VERIFIED_ADMIN, store }),
      approveAndPromoteOrderRequest({ requestId: 'req_race_01', admin: VERIFIED_ADMIN, store }),
      approveAndPromoteOrderRequest({ requestId: 'req_race_01', admin: VERIFIED_ADMIN, store }),
    ]);

    assertEqual(harness.orders.size, 1, 'Concurrent execution creates strictly one /orders doc');
    assertEqual(r1.orderId, r2.orderId, 'All concurrent callers receive same orderId');
    assertEqual(r2.orderId, r3.orderId, 'All concurrent callers receive same orderId (3rd)');
    assertEqual(
      [r1.idempotentReplay, r2.idempotentReplay, r3.idempotentReplay].filter(Boolean).length,
      2,
      'Exactly two callers treated as idempotent replays',
    );
  });

  // 13. Already-promoted legacy 'approved' or existing deterministic /orders doc cannot duplicate
  await runTest('13. Re-promotion on legacy approved status or existing /orders doc returns existing order safely', async () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    const orderId = deriveDeterministicOrderId('req_legacy_app');
    harness.orderRequests.set('req_legacy_app', {
      ...makeSampleRequestDoc('req_legacy_app'),
      status: 'approved',
      approvedOrderId: orderId,
      approvedOrderNumber: 'PM-555111',
      verifiedTotalSar: 60.5,
    });
    harness.orders.set(orderId, {
      orderNumber: 'PM-555111',
      customerUid: 'cust_guest_01',
      totalBill: 60.5,
      status: 'Preparing',
    });

    const res = await approveAndPromoteOrderRequest({
      requestId: 'req_legacy_app',
      admin: VERIFIED_ADMIN,
      store: harness.createStoreAdapter(),
    });
    assert(res.idempotentReplay, 'Detected existing order as idempotentReplay');
    assertEqual(res.orderNumber, 'PM-555111', 'Preserved existing PM-555111 order number');
    assertEqual(harness.orders.size, 1, 'Did not create duplicate order');
  });

  // 14. Reject workflow & mandatory reason enforcement
  await runTest('14. rejectOrderRequest requires non-empty reason, updates status rejected, and writes reject_request audit', async () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    harness.orderRequests.set('req_rej_01', makeSampleRequestDoc('req_rej_01'));
    const store = harness.createStoreAdapter();

    let emptyErr: unknown = null;
    try {
      await rejectOrderRequest({
        requestId: 'req_rej_01',
        admin: VERIFIED_ADMIN,
        reason: '   ',
        store,
      });
    } catch (err) {
      emptyErr = err;
    }
    assert(emptyErr instanceof AdminApprovalError, 'Blank rejection reason throws error');
    assertEqual((emptyErr as AdminApprovalError).reasonCode, 'REJECTION_REASON_REQUIRED', 'Requires reason');

    const rejected = await rejectOrderRequest({
      requestId: 'req_rej_01',
      admin: VERIFIED_ADMIN,
      reason: 'Selected bean origin finished for today',
      store,
    });
    assertEqual(rejected.status, 'rejected', 'Status set to rejected');
    assertEqual(
      rejected.rejectionReason,
      'Selected bean origin finished for today',
      'Rejection reason persisted',
    );
    const logs = Array.from(harness.auditLogs.values());
    assertEqual(logs[0].action, 'reject_request', 'Audit log action is reject_request');
  });

  // 15. Invalid state transitions (cannot reject promoted; cannot approve rejected)
  await runTest('15. Prevents invalid state transitions between terminal states (promoted <-> rejected)', async () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    const store = harness.createStoreAdapter();

    harness.orderRequests.set('req_term_1', makeSampleRequestDoc('req_term_1'));
    await approveAndPromoteOrderRequest({ requestId: 'req_term_1', admin: VERIFIED_ADMIN, store });

    let rejectAfterApproveErr: unknown = null;
    try {
      await rejectOrderRequest({
        requestId: 'req_term_1',
        admin: VERIFIED_ADMIN,
        reason: 'Too late to reject',
        store,
      });
    } catch (err) {
      rejectAfterApproveErr = err;
    }
    assert(
      rejectAfterApproveErr instanceof AdminApprovalError &&
        rejectAfterApproveErr.reasonCode === 'ALREADY_PROMOTED',
      'Refuses rejecting already promoted request',
    );

    harness.orderRequests.set('req_term_2', makeSampleRequestDoc('req_term_2'));
    await rejectOrderRequest({
      requestId: 'req_term_2',
      admin: VERIFIED_ADMIN,
      reason: 'Closed early',
      store,
    });

    let approveAfterRejectErr: unknown = null;
    try {
      await approveAndPromoteOrderRequest({ requestId: 'req_term_2', admin: VERIFIED_ADMIN, store });
    } catch (err) {
      approveAfterRejectErr = err;
    }
    assert(
      approveAfterRejectErr instanceof AdminApprovalError &&
        approveAfterRejectErr.reasonCode === 'TERMINAL_REQUEST_STATUS',
      'Refuses approving already rejected request',
    );
  });

  // 16. Live catalog change between verify & final approval recomputes/blocks atomically
  await runTest('16. Final atomic promotion re-validates live catalog prices & stock changes after initial verify', async () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    harness.orderRequests.set('req_drift_01', makeSampleRequestDoc('req_drift_01'));
    const store = harness.createStoreAdapter();

    const verified = await verifyOrderRequestPricing({
      requestId: 'req_drift_01',
      admin: VERIFIED_ADMIN,
      store,
    });
    assertEqual(verified.breakdown.totalBillSar, 60.5, 'Initial verified total is 60.50 SAR');

    // Store updates catalog price +2 SAR on V60 before admin clicks Approve & Create Order
    harness.menu.set('v60-ethiopia-hot-cold', {
      ...harness.menu.get('v60-ethiopia-hot-cold')!,
      price: 14,
    });

    const promoted = await approveAndPromoteOrderRequest({
      requestId: 'req_drift_01',
      admin: VERIFIED_ADMIN,
      store,
    });
    // 2 * (+2 SAR) = +4 SAR -> 64.50 SAR
    assertEqual(promoted.totalBillSar, 64.5, 'Final order uses live updated catalog price (64.50 SAR)');
    const orderDoc = harness.orders.get(promoted.orderId)!;
    assertEqual(orderDoc.totalBill, 64.5, '/orders totalBill reflects updated live price');
  });

  // 17. Customer tracking integration & OrderRequest/Order snapshot mapping
  await runTest('17. Customer tracker maps verified breakdown, order_created link, rejection reason, and audit snapshot', () => {
    assertEqual(normalizeOrderRequestStatus('verified'), 'verified', 'Maps verified cleanly');
    assertEqual(normalizeOrderRequestStatus('order_created'), 'order_created', 'Maps order_created cleanly');
    assertEqual(normalizeOrderRequestStatus('approved'), 'approved', 'Preserves legacy approved');

    const mappedReq = mapOrderRequestSnapshot('req_track_99', {
      ...makeSampleRequestDoc('req_track_99'),
      status: 'order_created',
      approvedOrderId: 'ord_req_track_99',
      approvedOrderNumber: 'PM-884422',
      verifiedTotalSar: 60.5,
      verifiedPricing: {
        currency: 'SAR',
        orderType: 'pickup',
        pricingVersion: 2,
        subtotalSar: 60.5,
        discountSar: 0,
        taxSar: 0,
        totalBillSar: 60.5,
        itemCount: 3,
        verifiedAtMs: 1770000005000,
        verifiedByUid: 'admin_uid_001',
        items: [],
      },
    });
    assertEqual(mappedReq.status, 'order_created', 'Mapped status order_created');
    assertEqual(mappedReq.verifiedTotalSar, 60.5, 'Mapped verifiedTotalSar');
    assertEqual(mappedReq.approvedOrderNumber, 'PM-884422', 'Mapped approvedOrderNumber');

    const mappedOrder = mapOrderSnapshot('ord_req_track_99', {
      orderNumber: 'PM-884422',
      customerUid: 'cust_guest_01',
      customerName: 'Noura',
      customerContact: '0551234567',
      items: [{ itemId: 'cotd-small', name: 'Coffee of the Day', price: 6.5, quantity: 2 }],
      subtotal: 13,
      discountTotal: 0,
      taxTotal: 0,
      totalBill: 13,
      currency: 'SAR',
      orderType: 'pickup',
      status: 'Preparing',
      sourceRequestId: 'req_track_99',
      paymentMethod: 'pay_on_pickup',
      paymentStatus: 'unpaid',
    });
    assertEqual(mappedOrder.sourceRequestId, 'req_track_99', 'Mapped sourceRequestId on Order');
    assertEqual(mappedOrder.paymentMethod, 'pay_on_pickup', 'Mapped paymentMethod');
    assertEqual(mappedOrder.total, 13, 'Mapped total');

    const audit = mapAuditEntrySnapshot('aud_1', {
      requestId: 'req_track_99',
      action: 'order_promotion',
      adminUid: 'admin_uid_001',
      verifiedTotalSar: 60.5,
      createdAt: 1770000005000,
    });
    assertEqual(audit.action, 'order_promotion', 'Audit snapshot mapped');
  });

  // 18. Static Security Rules, Blueprint & Spark Plan Compliance Audit
  await runTest('18. Spark security rules, blueprint, and Admin/Customer UI preserve Spark isolation and tamper resistance', () => {
    const sparkRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.spark.rules'), 'utf8');
    const prodRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const blueprint = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8'));
    const adminService = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/adminOrderRequests.ts'), 'utf8');
    const adminPage = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AdminOrderRequestsPage.tsx'), 'utf8');
    const trackerPage = fs.readFileSync(path.resolve(process.cwd(), 'src/components/OrderTrackerPage.tsx'), 'utf8');
    const headerSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Header.tsx'), 'utf8');

    assert(!prodRules.includes('orderRequestAuditLogs'), 'Production firestore.rules left untouched');
    assert(sparkRules.includes('match /orderRequestAuditLogs/{auditId}'), 'Spark rules include /orderRequestAuditLogs');
    assert(sparkRules.includes('allow update, delete: if false;'), 'Audit logs cannot be modified or deleted');
    assert(
      sparkRules.includes("!(existing().status in ['order_created', 'approved', 'rejected', 'cancelled'])"),
      'Spark rules prevent overwriting finalized order requests',
    );
    assert(
      sparkRules.includes("'verified', 'order_created'"),
      'Spark rules allow verified and order_created statuses',
    );
    assert(
      sparkRules.includes("data.approvedBy == request.auth.uid"),
      'Spark rules bind approvedBy to authenticated admin UID',
    );
    assert('/orderRequestAuditLogs/{auditId}' in blueprint.firestore, 'Blueprint documents /orderRequestAuditLogs/{auditId}');

    assert(!adminService.includes('firebase/functions'), 'Stage 04L admin service has zero Cloud Functions runtime dependency');
    assert(!adminService.includes('createPalmMetricOrder'), 'Stage 04L does not invoke legacy callable');
    assert(adminService.includes('runTransaction'), 'Uses atomic Firestore runTransaction');
    assert(adminPage.includes('isVerifiedAdminActor'), 'Admin UI strictly gated by verified Admin actor');
    assert(trackerPage.includes('requestVerifiedTotalLabel'), 'Customer tracker displays verified final SAR total');
    assert(headerSrc.includes('showAdminNav'), 'Admin nav hidden from non-admin customer view');
    assert(ADMIN_EMAILS.has('palmmetric1@gmail.com'), 'Admin allowlist preserved');
  });

  // 19. Bilingual AR & EN completeness check
  await runTest('19. COPY.ar and COPY.en contain all Stage 04L Admin & Tracker i18n keys', () => {
    const keys: Array<keyof typeof COPY.en> = [
      'requestStatusVerifiedTitle',
      'requestVerifiedTotalLabel',
      'requestVerifiedBreakdownTitle',
      'requestDiscountLabel',
      'requestTaxLabel',
      'navAdmin',
      'adminDashboardTitle',
      'adminDashboardSubtitle',
      'adminFilterAll',
      'adminFilterPending',
      'adminFilterReviewing',
      'adminFilterVerified',
      'adminFilterRejected',
      'adminFilterCreated',
      'adminSearchPlaceholder',
      'adminSortNewest',
      'adminSortOldest',
      'adminStartReviewBtn',
      'adminVerifyRequestBtn',
      'adminApprovePromoteBtn',
      'adminRejectBtn',
      'adminConfirmApproveTitle',
      'adminConfirmApproveDesc',
      'adminConfirmApproveBtn',
      'adminCancelBtn',
      'adminRejectReasonLabel',
      'adminRejectReasonPlaceholder',
      'adminRejectReasonRequiredErr',
      'adminCatalogCheckPassed',
      'adminCatalogCheckBlocked',
      'adminVerificationBreakdownHeading',
      'adminAuditTrailHeading',
      'adminNoRequestsTitle',
      'adminNoRequestsDesc',
      'adminOrderCreatedBanner',
    ];
    for (const k of keys) {
      assert(typeof COPY.ar[k] === 'string' && COPY.ar[k].trim().length > 0, `COPY.ar.${k} missing`);
      assert(typeof COPY.en[k] === 'string' && COPY.en[k].trim().length > 0, `COPY.en.${k} missing`);
    }
  });

  // 20. Full Spark End-to-End Integration: Stage 04K Customer Submit -> Stage 04L Admin Approve -> Customer Order Read
  await runTest('20. Full End-to-End Flow: Customer Request (04K) -> Review -> Verify -> Approve & Promote -> Order Read (04L)', async () => {
    const harness = new InMemorySparkFirestoreHarness();
    harness.seedCatalog();
    const store = harness.createStoreAdapter();

    const customerAdapter: OrderRequestPersistenceAdapter = {
      ensureSession: async () => ({ user: { uid: 'guest_e2e_user_1' } }),
      getExistingRequest: async (id) => harness.orderRequests.get(id) ?? null,
      createRequestDoc: async (id, payload) => {
        // Verify zero price fields from client
        const items = payload.items as Array<Record<string, unknown>>;
        for (const it of items) {
          assert(!('price' in it) && !('totalBill' in payload), 'Customer request contains zero client prices');
        }
        harness.orderRequests.set(id, {
          ...payload,
          createdAt: 1770000010000,
          updatedAt: 1770000010000,
        });
      },
      serverTimestampValue: () => 1770000010000,
    };

    const createdReq = await submitCustomerOrderRequest(
      {
        orderType: 'pickup',
        customerName: 'Faisal Al-Harbi',
        customerPhone: '0506439172',
        orderNote: 'Morning pickup',
        lang: 'ar',
        items: [
          {
            itemId: 'v60-ethiopia-hot-cold',
            quantity: 1,
            temperature: 'Hot',
            selectedCustomizations: [{ groupId: 'size', optionId: 'large' }],
          },
          {
            itemId: 'cotd-small',
            quantity: 2,
            temperature: 'Hot',
          },
        ],
      },
      customerAdapter,
    );

    assertEqual(createdReq.status, 'pending_review', 'Customer request starts as pending_review');
    assertVerifiedAdminActor(VERIFIED_ADMIN);

    await startOrderRequestReview({ requestId: createdReq.requestId, admin: VERIFIED_ADMIN, store });
    const verifiedRes = await verifyOrderRequestPricing({
      requestId: createdReq.requestId,
      admin: VERIFIED_ADMIN,
      store,
    });
    // 1x V60 Large (12 + 4.5 = 16.5) + 2x COTD Small (6.5 * 2 = 13) = 29.50 SAR
    assertEqual(verifiedRes.breakdown.totalBillSar, 29.5, 'E2E verified total = 29.50 SAR');

    const promotedRes = await approveAndPromoteOrderRequest({
      requestId: createdReq.requestId,
      admin: VERIFIED_ADMIN,
      store,
    });
    assertEqual(promotedRes.totalBillSar, 29.5, 'Promoted order total = 29.50 SAR');

    const customerVisibleReq = mapOrderRequestSnapshot(
      createdReq.requestId,
      harness.orderRequests.get(createdReq.requestId)!,
    );
    assertEqual(customerVisibleReq.status, 'order_created', 'Tracker sees order_created');
    assertEqual(customerVisibleReq.approvedOrderId, promotedRes.orderId, 'Tracker links to /orders doc');

    const customerVisibleOrder = mapOrderSnapshot(
      promotedRes.orderId,
      harness.orders.get(promotedRes.orderId)!,
    );
    assertEqual(customerVisibleOrder.orderNumber, promotedRes.orderNumber, 'Official order number visible');
    assertEqual(customerVisibleOrder.total, 29.5, 'Official order total 29.50 SAR visible');
    assertEqual(customerVisibleOrder.status, 'Pending', 'Official order status Pending');
  });

  console.log(`\nStage 04L Test Summary: ${passed} passed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
