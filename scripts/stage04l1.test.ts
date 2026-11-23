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
  deriveOfficialOrderNumberCandidate,
  rejectOrderRequest,
  startOrderRequestReview,
  verifyOrderRequestPricing,
  type AdminOrderRequestStoreAdapter,
  type AdminOrderRequestTransactionAdapter,
} from '../src/lib/adminOrderRequests';
import {
  type AuthoritativeCatalogLookup,
  type AuthoritativeMenuRecord,
} from '../src/lib/authoritativePricing';
import {
  mapOrderSnapshot,
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

class InMemoryHardenedFirestoreHarness {
  orderRequests = new Map<string, Record<string, unknown>>();
  orders = new Map<string, Record<string, unknown>>();
  orderNumbers = new Map<string, Record<string, unknown>>();
  menu = new Map<string, AuthoritativeMenuRecord & Record<string, unknown>>();
  customizations = new Map<string, ProductCustomizationConfig>();
  auditLogs = new Map<string, Record<string, unknown>>();
  admins = new Map<string, Record<string, unknown>>();
  coffeeOptions: CoffeeOptionsSettings = {
    milkSelectionEnabled: true,
    coconutMilkExtraPrice: 3,
    hotColdSelectionEnabled: true,
  };
  failBeforeCommit = false;
  private txChain: Promise<void> = Promise.resolve();
  private clockMs = 1775000000000;

  seedCatalog() {
    this.menu.set('v60-ethiopia-hot-cold', {
      id: 'v60-ethiopia-hot-cold',
      name: 'Ethiopia Hot / Cold',
      nameEn: 'Ethiopia Hot / Cold',
      nameAr: 'إثيوبيا (حار / بارد)',
      category: 'V60',
      price: 12,
      inStock: true,
      stockQuantity: 10,
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
      // Intentionally NO numeric stockQuantity/stockCount to verify non-tracked products keep boolean-only behavior
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
      stockCount: 5,
      outOfStock: false,
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
          const stagedReqUpdates = new Map<string, Record<string, unknown>>();
          const stagedOrders = new Map<string, Record<string, unknown>>();
          const stagedAudits = new Map<string, Record<string, unknown>>();
          const stagedMenuUpdates = new Map<string, Record<string, unknown>>();
          const stagedOrderNumbers = new Map<string, Record<string, unknown>>();
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
            getOrderNumberClaim: async (orderNumber) => {
              const raw = this.orderNumbers.get(orderNumber);
              return raw ? structuredClone(raw) : null;
            },
            updateOrderRequest: (requestId, fullDoc) => {
              stagedReqUpdates.set(requestId, structuredClone(fullDoc));
            },
            setOrder: (orderId, docData) => {
              stagedOrders.set(orderId, structuredClone(docData));
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
            setOrderNumberClaim: (orderNumber, claimDoc) => {
              if (this.orderNumbers.has(orderNumber)) {
                throw new Error(`OrderNumber "${orderNumber}" is already claimed (immutable create rule).`);
              }
              stagedOrderNumbers.set(orderNumber, structuredClone(claimDoc));
            },
            serverTimestamp: () => tsNow,
            nowMs: () => tsNow,
          };

          const result = await fn(txAdapter);

          if (this.failBeforeCommit) {
            throw new Error('Simulated Firestore transaction commit failure.');
          }

          // Simulate Spark Security Rules cross-document existsAfter invariants before committing
          for (const [orderNumber, claim] of stagedOrderNumbers.entries()) {
            const targetOrderId = String(claim.orderId);
            const afterOrder = stagedOrders.get(targetOrderId) ?? this.orders.get(targetOrderId);
            if (!afterOrder || afterOrder.orderNumber !== orderNumber) {
              throw new Error(`Rule violation: orderNumber claim "${orderNumber}" lacks matching /orders doc.`);
            }
          }

          for (const [k, v] of stagedMenuUpdates.entries()) {
            this.menu.set(k, { ...(v as AuthoritativeMenuRecord & Record<string, unknown>), id: k });
          }
          for (const [k, v] of stagedOrderNumbers.entries()) {
            this.orderNumbers.set(k, v);
          }
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

function makeRequestDoc(
  requestId: string,
  items: Array<Record<string, unknown>>,
  customerUid = 'cust_guest_01',
): Record<string, unknown> {
  return {
    requestId,
    customerUid,
    customerName: 'Noura Al-Qahtani',
    customerContact: '0551234567',
    orderType: 'pickup',
    currency: 'SAR',
    lang: 'en',
    orderNote: 'Pickup counter',
    items,
    status: 'pending_review',
    requestSource: 'customer-app-spark',
    createdAt: 1775000000000,
    updatedAt: 1775000000000,
  };
}

async function main() {
  console.log('Running Palm Metric Stage 04L.1 Security, Inventory & Integrity Hardening Suite (12 tests)...\n');

  // 1. Admin privilege escalation & allowlist consistency
  await runTest('1. Blocks admin privilege escalation attempts and verifies UID/email allowlist consistency', () => {
    const prodRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const sparkRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.spark.rules'), 'utf8');

    // /admins/{adminId} strictly denies client create/update/delete
    const adminsBlockMatch = sparkRules.match(/match \/admins\/\{adminId\} \{[\s\S]*?\n    \}/);
    assert(adminsBlockMatch, '/admins/{adminId} rules block exists');
    const adminsBlock = adminsBlockMatch![0];
    assert(adminsBlock.includes('allow create, update, delete: if false;'), '/admins denies self-creation & updates');

    // Allowlists consistent across adminAuth.ts, firestore.rules, firestore.spark.rules
    for (const email of ADMIN_EMAILS) {
      assert(prodRules.includes(`'${email}'`), `firestore.rules contains ${email}`);
      assert(sparkRules.includes(`'${email}'`), `firestore.spark.rules contains ${email}`);
    }
    for (const uid of ADMIN_UIDS) {
      assert(prodRules.includes(`'${uid}'`), `firestore.rules contains UID ${uid}`);
      assert(sparkRules.includes(`'${uid}'`), `firestore.spark.rules contains UID ${uid}`);
    }

    // Anonymous / spoofed / unverified / malformed UID escalation attempts MUST fail closed
    assert(
      !isVerifiedAdminActor({
        uid: '39H76y4E55g5yX2uY0lE5bQ3a393',
        isAnonymous: true,
        providerId: 'anonymous',
      }),
      'Even allowlisted UID MUST be rejected if anonymous',
    );
    assert(
      !isVerifiedAdminActor({
        uid: 'cust_escalate',
        email: 'customer@example.com',
        emailVerified: false,
        isAnonymous: false,
        isAdminDocPresent: true,
      }),
      'Unverified email with /admins doc MUST be rejected',
    );
    assert(
      !isVerifiedAdminActor({
        uid: 'admins/39H76y4E55g5yX2uY0lE5bQ3a393',
        email: 'tashflow26@gmail.com',
        emailVerified: true,
        isAnonymous: false,
      }),
      'Path-traversal UID MUST be rejected',
    );
    assert(
      !isVerifiedAdminActor({
        uid: ' 39H76y4E55g5yX2uY0lE5bQ3a393 ',
        isAnonymous: false,
      }),
      'Whitespace-padded UID MUST be rejected',
    );
  });

  // 2. Unauthorized audit creation
  await runTest('2. Blocks unauthorized audit log creation from customers, guests, and spoofed actors', async () => {
    const harness = new InMemoryHardenedFirestoreHarness();
    harness.seedCatalog();
    harness.orderRequests.set(
      'req_audit_sec',
      makeRequestDoc('req_audit_sec', [{ itemId: 'cotd-small', quantity: 1 }]),
    );
    const store = harness.createStoreAdapter();
    const sparkRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.spark.rules'), 'utf8');

    const callers: Array<AdminActor | null> = [
      null,
      { uid: 'anon_guest_1', isAnonymous: true, providerId: 'anonymous' },
      { uid: 'cust_email_1', email: 'buyer@gmail.com', emailVerified: true, isAnonymous: false, providerId: 'google.com' },
      { uid: 'spoof_admin', email: 'tashflow26@gmail.com', emailVerified: false, isAnonymous: false, providerId: 'password' },
    ];

    for (const actor of callers) {
      let errCount = 0;
      for (const op of [
        () => startOrderRequestReview({ requestId: 'req_audit_sec', admin: actor, store }),
        () => verifyOrderRequestPricing({ requestId: 'req_audit_sec', admin: actor, store }),
        () => approveAndPromoteOrderRequest({ requestId: 'req_audit_sec', admin: actor, store }),
        () => rejectOrderRequest({ requestId: 'req_audit_sec', admin: actor, reason: 'Unauthorized test', store }),
      ]) {
        try {
          await op();
        } catch (err) {
          if (err instanceof AdminApprovalError && err.reasonCode === 'ADMIN_AUTH_REQUIRED') {
            errCount += 1;
          }
        }
      }
      assertEqual(errCount, 4, 'All 4 admin lifecycle actions reject unauthorized caller');
    }

    assertEqual(harness.auditLogs.size, 0, 'Zero unauthorized audit records written');
    assert(sparkRules.includes('allow create: if isValidId(auditId) && isAdmin() && isValidOrderRequestAuditLog(incoming());'), 'Spark rules gate audit create to verified isAdmin()');
    assert(sparkRules.includes('data.adminUid == request.auth.uid'), 'Audit rule binds adminUid to request.auth.uid');
    assert(sparkRules.includes('allow update, delete: if false;'), 'Audit logs are strictly immutable');
  });

  // 3. Concurrent stock reservation / deduction prevents overselling + preserves non-tracked items
  await runTest('3. Concurrent promotions atomically deduct managed inventory without overselling or inventing stock', async () => {
    const harness = new InMemoryHardenedFirestoreHarness();
    harness.seedCatalog();
    harness.menu.set('matcha-iced', {
      ...harness.menu.get('matcha-iced')!,
      stockCount: 5,
    });
    harness.orderRequests.set(
      'req_conc_a',
      makeRequestDoc('req_conc_a', [
        { itemId: 'matcha-iced', quantity: 3 },
        { itemId: 'cotd-small', quantity: 2 },
      ]),
    );
    harness.orderRequests.set(
      'req_conc_b',
      makeRequestDoc('req_conc_b', [{ itemId: 'matcha-iced', quantity: 3 }]),
    );
    const store = harness.createStoreAdapter();

    const settled = await Promise.allSettled([
      approveAndPromoteOrderRequest({ requestId: 'req_conc_a', admin: VERIFIED_ADMIN, store }),
      approveAndPromoteOrderRequest({ requestId: 'req_conc_b', admin: VERIFIED_ADMIN, store }),
    ]);

    const fulfilled = settled.filter((s) => s.status === 'fulfilled');
    const rejected = settled.filter((s) => s.status === 'rejected');
    assertEqual(fulfilled.length, 1, 'Strictly one concurrent order succeeds when combined demand is 6 > 5');
    assertEqual(rejected.length, 1, 'Second concurrent approval is rejected instead of overselling');
    const rejErr = (rejected[0] as PromiseRejectedResult).reason;
    assert(rejErr instanceof AdminApprovalError && rejErr.reasonCode === 'INSUFFICIENT_STOCK', 'Second throws INSUFFICIENT_STOCK');
    assertEqual(harness.orders.size, 1, 'Only 1 /orders document created');
    assertEqual(harness.menu.get('matcha-iced')!.stockCount, 2, 'Stock atomically deducted 5 - 3 = 2');
    assertEqual(harness.menu.get('cotd-small')!.stockQuantity, undefined, 'Non-tracked product never receives synthetic stockQuantity');
    assertEqual(harness.menu.get('cotd-small')!.stockCount, undefined, 'Non-tracked product never receives synthetic stockCount');
  });

  // 4. Stock reaching zero sets inStock: false + multi-line demand aggregation blocks split-line oversell
  await runTest('4. Multi-line SKU aggregation blocks split-line oversell and depletion marks item out of stock', async () => {
    const harness = new InMemoryHardenedFirestoreHarness();
    harness.seedCatalog();
    harness.menu.set('v60-ethiopia-hot-cold', {
      ...harness.menu.get('v60-ethiopia-hot-cold')!,
      stockQuantity: 3,
      outOfStock: false,
    });
    // Split across 2 line items: qty 2 + qty 2 = 4 > stockQuantity 3
    harness.orderRequests.set(
      'req_split_line',
      makeRequestDoc('req_split_line', [
        { itemId: 'v60-ethiopia-hot-cold', quantity: 2, temperature: 'Hot', selectedCustomizations: [{ groupId: 'size', optionId: 'regular' }] },
        { itemId: 'v60-ethiopia-hot-cold', quantity: 2, temperature: 'Cold', selectedCustomizations: [{ groupId: 'size', optionId: 'large' }] },
      ]),
    );
    const store = harness.createStoreAdapter();

    let splitErr: unknown = null;
    try {
      await approveAndPromoteOrderRequest({ requestId: 'req_split_line', admin: VERIFIED_ADMIN, store });
    } catch (err) {
      splitErr = err;
    }
    assert(splitErr instanceof AdminApprovalError && splitErr.reasonCode === 'INSUFFICIENT_STOCK', 'Split-line demand 4 > 3 blocked');
    assertEqual(harness.menu.get('v60-ethiopia-hot-cold')!.stockQuantity, 3, 'Blocked request does not alter stock');

    // Exact depletion: qty 3 leaves stockQuantity: 0 and marks inStock: false
    harness.orderRequests.set(
      'req_deplete_exact',
      makeRequestDoc('req_deplete_exact', [
        { itemId: 'v60-ethiopia-hot-cold', quantity: 3, temperature: 'Hot', selectedCustomizations: [{ groupId: 'size', optionId: 'regular' }] },
      ]),
    );
    await approveAndPromoteOrderRequest({ requestId: 'req_deplete_exact', admin: VERIFIED_ADMIN, store });
    const depletedMenu = harness.menu.get('v60-ethiopia-hot-cold')!;
    assertEqual(depletedMenu.stockQuantity, 0, 'Exact stock depleted to 0');
    assertEqual(depletedMenu.inStock, false, 'Depleted menu item marked inStock: false');
    assertEqual(depletedMenu.outOfStock, true, 'Depleted menu item marked outOfStock: true');
  });

  // 5. Failed transaction rollback (partial failure must NEVER deduct item 1 stock)
  await runTest('5. Failed transaction and partial item failure leave inventory, orders, and audit completely clean', async () => {
    const harness = new InMemoryHardenedFirestoreHarness();
    harness.seedCatalog(); // v60 stockQuantity=10, matcha stockCount=5
    const store = harness.createStoreAdapter();

    // Case A: Item 1 valid (stock 10, qty 2), Item 2 insufficient stock (stock 5, qty 6)
    harness.orderRequests.set(
      'req_partial_fail',
      makeRequestDoc('req_partial_fail', [
        { itemId: 'v60-ethiopia-hot-cold', quantity: 2, selectedCustomizations: [{ groupId: 'size', optionId: 'regular' }] },
        { itemId: 'matcha-iced', quantity: 6 },
      ]),
    );
    let partialErr: unknown = null;
    try {
      await approveAndPromoteOrderRequest({ requestId: 'req_partial_fail', admin: VERIFIED_ADMIN, store });
    } catch (err) {
      partialErr = err;
    }
    assert(partialErr instanceof AdminApprovalError && partialErr.reasonCode === 'INSUFFICIENT_STOCK', 'Item 2 blocks promotion');
    assertEqual(harness.menu.get('v60-ethiopia-hot-cold')!.stockQuantity, 10, 'Item 1 stock untouched on validation failure');
    assertEqual(harness.menu.get('matcha-iced')!.stockCount, 5, 'Item 2 stock untouched');
    assertEqual(harness.orders.size, 0, 'Zero orders created');
    assertEqual(harness.orderNumbers.size, 0, 'Zero orderNumbers claimed');

    // Case B: Aborted transaction during commit rolls back all staged writes atomically
    harness.orderRequests.set(
      'req_abort_tx',
      makeRequestDoc('req_abort_tx', [
        { itemId: 'v60-ethiopia-hot-cold', quantity: 2, selectedCustomizations: [{ groupId: 'size', optionId: 'regular' }] },
      ]),
    );
    harness.failBeforeCommit = true;
    let commitErr: unknown = null;
    try {
      await approveAndPromoteOrderRequest({ requestId: 'req_abort_tx', admin: VERIFIED_ADMIN, store });
    } catch (err) {
      commitErr = err;
    }
    harness.failBeforeCommit = false;
    assert(commitErr instanceof Error, 'Aborted commit throws error');
    assertEqual(harness.menu.get('v60-ethiopia-hot-cold')!.stockQuantity, 10, 'Stock rolled back cleanly');
    assertEqual(harness.orders.size, 0, 'Order rolled back cleanly');
    assertEqual(harness.orderNumbers.size, 0, 'Order number claim rolled back cleanly');
    assertEqual(harness.orderRequests.get('req_abort_tx')!.status, 'pending_review', 'Request status remained pending_review');
    assertEqual(harness.auditLogs.size, 0, 'Audit records rolled back cleanly');
  });

  // 6. Duplicate promotion NEVER deducts stock twice or creates a second order
  await runTest('6. Repeated and concurrent duplicate promotion deducts stock strictly once', async () => {
    const harness = new InMemoryHardenedFirestoreHarness();
    harness.seedCatalog(); // v60 stockQuantity: 10
    harness.orderRequests.set(
      'req_dup_stock',
      makeRequestDoc('req_dup_stock', [
        { itemId: 'v60-ethiopia-hot-cold', quantity: 4, selectedCustomizations: [{ groupId: 'size', optionId: 'regular' }] },
      ]),
    );
    const store = harness.createStoreAdapter();

    const first = await approveAndPromoteOrderRequest({
      requestId: 'req_dup_stock',
      admin: VERIFIED_ADMIN,
      store,
    });
    const [second, third] = await Promise.all([
      approveAndPromoteOrderRequest({ requestId: 'req_dup_stock', admin: VERIFIED_ADMIN, store }),
      approveAndPromoteOrderRequest({ requestId: 'req_dup_stock', admin: VERIFIED_ADMIN, store }),
    ]);

    assertEqual(first.idempotentReplay, false, 'First promotion executes write');
    assertEqual(second.idempotentReplay, true, 'Second call returns idempotent replay');
    assertEqual(third.idempotentReplay, true, 'Third concurrent call returns idempotent replay');
    assertEqual(second.orderNumber, first.orderNumber, 'Replay preserves same orderNumber');
    assertEqual(harness.orders.size, 1, 'Strictly 1 order created');
    assertEqual(harness.menu.get('v60-ethiopia-hot-cold')!.stockQuantity, 6, 'Stock deducted 10 - 4 = 6 ONCE only');
  });

  // 7. Inconsistent existing order fails closed before idempotent replay
  await runTest('7. Inconsistent existing /orders document (mismatched sourceRequestId/customerUid/missing target) fails closed', async () => {
    const harness = new InMemoryHardenedFirestoreHarness();
    harness.seedCatalog();
    const store = harness.createStoreAdapter();

    // Case A: Existing /orders doc has wrong sourceRequestId
    const reqIdA = 'req_incons_a';
    const orderIdA = deriveDeterministicOrderId(reqIdA);
    harness.orderRequests.set(
      reqIdA,
      makeRequestDoc(reqIdA, [{ itemId: 'cotd-small', quantity: 1 }], 'cust_1'),
    );
    harness.orders.set(orderIdA, {
      orderNumber: 'PM-111222',
      customerUid: 'cust_1',
      sourceRequestId: 'req_DIFFERENT',
      totalBill: 6.5,
      status: 'Pending',
    });

    let errA: unknown = null;
    try {
      await approveAndPromoteOrderRequest({ requestId: reqIdA, admin: VERIFIED_ADMIN, store });
    } catch (err) {
      errA = err;
    }
    assert(errA instanceof AdminApprovalError && errA.reasonCode === 'INCONSISTENT_EXISTING_ORDER', 'Blocks existing order with mismatched sourceRequestId');

    // Case B: Existing /orders doc belongs to wrong customerUid even with matching sourceRequestId
    const reqIdB = 'req_incons_b';
    const orderIdB = deriveDeterministicOrderId(reqIdB);
    harness.orderRequests.set(
      reqIdB,
      {
        ...makeRequestDoc(reqIdB, [{ itemId: 'cotd-small', quantity: 1 }], 'cust_real'),
        status: 'order_created',
        approvedOrderId: orderIdB,
        approvedOrderNumber: 'PM-333444',
      },
    );
    harness.orders.set(orderIdB, {
      orderNumber: 'PM-333444',
      customerUid: 'cust_attacker',
      sourceRequestId: reqIdB,
      totalBill: 6.5,
      status: 'Pending',
    });

    let errB: unknown = null;
    try {
      await approveAndPromoteOrderRequest({ requestId: reqIdB, admin: VERIFIED_ADMIN, store });
    } catch (err) {
      errB = err;
    }
    assert(errB instanceof AdminApprovalError && errB.reasonCode === 'INCONSISTENT_EXISTING_ORDER', 'Blocks existing order with mismatched customerUid');

    // Case C: Request marked order_created but target /orders doc is missing
    const reqIdC = 'req_incons_c';
    harness.orderRequests.set(reqIdC, {
      ...makeRequestDoc(reqIdC, [{ itemId: 'cotd-small', quantity: 1 }], 'cust_c'),
      status: 'order_created',
      approvedOrderId: deriveDeterministicOrderId(reqIdC),
      approvedOrderNumber: 'PM-777888',
    });
    let errC: unknown = null;
    try {
      await approveAndPromoteOrderRequest({ requestId: reqIdC, admin: VERIFIED_ADMIN, store });
    } catch (err) {
      errC = err;
    }
    assert(errC instanceof AdminApprovalError && errC.reasonCode === 'INCONSISTENT_PROMOTION_STATE', 'Blocks order_created request with missing order');
  });

  // 8. Official order number collision prevention & legacy compatibility
  await runTest('8. Resolves FNV-1a PM-XXXXXX collisions deterministically while preserving legacy orders', async () => {
    const harness = new InMemoryHardenedFirestoreHarness();
    harness.seedCatalog();
    const store = harness.createStoreAdapter();

    const collidingNum = deriveOfficialOrderNumber('req_collision_new');
    assertEqual(
      deriveOfficialOrderNumberCandidate('req_collision_new', 0),
      collidingNum,
      'Attempt 0 equals canonical FNV-1a PM-XXXXXX',
    );
    const probe1 = deriveOfficialOrderNumberCandidate('req_collision_new', 1);
    assert(probe1 !== collidingNum && /^PM-\d{6}$/.test(probe1), 'Probe 1 generates distinct 6-digit PM-XXXXXX');
    const expanded13 = deriveOfficialOrderNumberCandidate('req_collision_new', 13);
    assert(/^PM-[A-Z0-9]{10}$/.test(expanded13), 'Attempt >=13 expands cleanly within maxLength=24');

    // Pre-claim attempt 0 under another requestId
    harness.orderNumbers.set(collidingNum, {
      orderNumber: collidingNum,
      orderId: 'ord_req_earlier',
      requestId: 'req_earlier',
      customerUid: 'cust_other',
      createdAt: 1774000000000,
    });
    harness.orderRequests.set(
      'req_collision_new',
      makeRequestDoc('req_collision_new', [{ itemId: 'cotd-small', quantity: 1 }], 'cust_col_2'),
    );

    const promoted = await approveAndPromoteOrderRequest({
      requestId: 'req_collision_new',
      admin: VERIFIED_ADMIN,
      store,
    });
    assert(promoted.orderNumber !== collidingNum, 'Collision avoided: assigned non-colliding order number');
    assertEqual(promoted.orderNumber, probe1, 'Selected deterministic probe 1');
    assertEqual(harness.orderNumbers.get(collidingNum)!.requestId, 'req_earlier', 'Original orderNumber owner untouched');
    assertEqual(harness.orderNumbers.get(probe1)!.requestId, 'req_collision_new', 'New orderNumber claimed atomically');

    // Idempotent replay preserves collision-resolved number
    const replay = await approveAndPromoteOrderRequest({
      requestId: 'req_collision_new',
      admin: VERIFIED_ADMIN,
      store,
    });
    assert(replay.idempotentReplay, 'Subsequent replay succeeds');
    assertEqual(replay.orderNumber, probe1, 'Replay preserves collision-resolved orderNumber');

    // Legacy order compatibility without /orderNumbers claim doc still maps cleanly
    const legacyMapped = mapOrderSnapshot('legacy_ord_99', {
      orderNumber: 'PM-102030',
      customerUid: 'legacy_cust',
      customerName: 'Legacy Guest',
      customerPhone: '0500000001',
      items: [{ itemId: 'cotd-small', name: 'Coffee of the Day', price: 6.5, quantity: 1 }],
      total: 6.5,
      status: 'Completed',
    });
    assertEqual(legacyMapped.orderNumber, 'PM-102030', 'Legacy order without orderNumbers claim remains readable');
  });

  // 9. Terminal request modification blocked across all lifecycle operations
  await runTest('9. Blocks modification of rejected, cancelled, and already-promoted requests', async () => {
    const harness = new InMemoryHardenedFirestoreHarness();
    harness.seedCatalog();
    const store = harness.createStoreAdapter();

    harness.orderRequests.set('req_rej_term', makeRequestDoc('req_rej_term', [{ itemId: 'cotd-small', quantity: 1 }]));
    await rejectOrderRequest({
      requestId: 'req_rej_term',
      admin: VERIFIED_ADMIN,
      reason: 'Closing soon',
      store,
    });

    for (const action of [
      () => startOrderRequestReview({ requestId: 'req_rej_term', admin: VERIFIED_ADMIN, store }),
      () => verifyOrderRequestPricing({ requestId: 'req_rej_term', admin: VERIFIED_ADMIN, store }),
      () => approveAndPromoteOrderRequest({ requestId: 'req_rej_term', admin: VERIFIED_ADMIN, store }),
      () => rejectOrderRequest({ requestId: 'req_rej_term', admin: VERIFIED_ADMIN, reason: 'Overwrite attempt', store }),
    ]) {
      let err: unknown = null;
      try {
        await action();
      } catch (caught) {
        err = caught;
      }
      assert(err instanceof AdminApprovalError, 'Rejected request refuses further transitions');
    }

    harness.orderRequests.set('req_can_term', {
      ...makeRequestDoc('req_can_term', [{ itemId: 'cotd-small', quantity: 1 }]),
      status: 'cancelled',
    });
    let canErr: unknown = null;
    try {
      await approveAndPromoteOrderRequest({ requestId: 'req_can_term', admin: VERIFIED_ADMIN, store });
    } catch (err) {
      canErr = err;
    }
    assert(canErr instanceof AdminApprovalError && canErr.reasonCode === 'TERMINAL_REQUEST_STATUS', 'Cancelled request cannot be promoted');
  });

  // 10. Customer order creation attempts & Spark security rules completeness
  await runTest('10. Customer order creation is blocked and firestore.spark.rules enforces atomic promotion & stock bounds', async () => {
    const sparkRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.spark.rules'), 'utf8');
    const blueprint = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8'));

    // Orders create rule requires isAdmin()
    const ordersBlock = sparkRules.match(/match \/orders\/\{orderId\} \{[\s\S]*?\n    \}/)![0];
    assert(
      ordersBlock.includes('allow create: if isValidId(orderId) && isAdmin() && isValidAdminOrderCreate(incoming(), orderId);'),
      'Customers and anonymous users blocked from /orders create',
    );
    assert(ordersBlock.includes("incoming().diff(existing()).affectedKeys().hasOnly(['status', 'updatedAt'])"), 'Order updates cannot alter financial fields');

    // OrderRequests customer create cannot contain prices or admin fields, update restricted to isAdmin()
    const reqBlock = sparkRules.match(/match \/orderRequests\/\{requestId\} \{[\s\S]*?\n    \}/)![0];
    assert(reqBlock.includes('allow update: if isValidId(requestId) && isAdmin() && isValidOrderRequestAdminUpdate(incoming(), requestId);'), 'Customers cannot update /orderRequests');
    assert(sparkRules.includes('data.lang == existing().lang') && sparkRules.includes('data.orderNote == existing().orderNote'), 'Admins cannot tamper with customer lang/orderNote');
    assert(sparkRules.includes('existsAfter(/databases/$(database)/documents/orders/$(data.approvedOrderId))'), 'Rules verify /orders existsAfter on request promotion');
    assert(sparkRules.includes('existsAfter(/databases/$(database)/documents/orderRequests/$(data.sourceRequestId))'), 'Rules verify /orderRequests existsAfter on order create');
    assert(sparkRules.includes('existsAfter(/databases/$(database)/documents/orderNumbers/$(data.orderNumber))'), 'Rules verify /orderNumbers existsAfter on order create');
    assert(sparkRules.includes("data.stockQuantity is number && data.stockQuantity >= 0"), 'MenuItem rules prevent negative stockQuantity');
    assert(sparkRules.includes("data.stockCount is number && data.stockCount >= 0"), 'MenuItem rules prevent negative stockCount');

    // Blueprint parity check
    assert('/orderNumbers/{orderNumber}' in blueprint.firestore, 'Blueprint includes /orderNumbers/{orderNumber}');
    assert('stockQuantity' in blueprint.entities.MenuItem.properties, 'Blueprint MenuItem includes stockQuantity');

    // Customer flow submits strictly to /orderRequests without prices
    let capturedOrderRequestsWrite = false;
    const customerAdapter: OrderRequestPersistenceAdapter = {
      ensureSession: async () => ({ user: { uid: 'cust_uid_safe_1' } }),
      getExistingRequest: async () => null,
      createRequestDoc: async (_id, payload) => {
        assert(!('totalBill' in payload) && !('approvedOrderId' in payload), 'Customer payload contains zero prices/admin fields');
        capturedOrderRequestsWrite = true;
      },
      serverTimestampValue: () => 1775000000000,
    };
    await submitCustomerOrderRequest(
      {
        orderType: 'pickup',
        customerName: 'Saleh',
        customerPhone: '0506439172',
        items: [{ itemId: 'cotd-small', quantity: 1 }],
      },
      customerAdapter,
    );
    assert(capturedOrderRequestsWrite, 'Customer checkout routes only through /orderRequests');
  });

  // 11. Mixed tracked & non-tracked catalog E2E verification
  await runTest('11. E2E mixed basket: deducts stock-tracked items and ignores non-tracked items without partial state', async () => {
    const harness = new InMemoryHardenedFirestoreHarness();
    harness.seedCatalog(); // v60 stockQuantity=10, cotd-small untracked, matcha stockCount=5
    const store = harness.createStoreAdapter();

    harness.orderRequests.set(
      'req_e2e_hard',
      makeRequestDoc('req_e2e_hard', [
        { itemId: 'v60-ethiopia-hot-cold', quantity: 2, selectedCustomizations: [{ groupId: 'size', optionId: 'large' }] },
        { itemId: 'cotd-small', quantity: 3 },
        { itemId: 'matcha-iced', quantity: 1 },
      ]),
    );

    await startOrderRequestReview({ requestId: 'req_e2e_hard', admin: VERIFIED_ADMIN, store });
    const ver = await verifyOrderRequestPricing({ requestId: 'req_e2e_hard', admin: VERIFIED_ADMIN, store });
    // Verify alone does NOT deduct inventory!
    assertEqual(harness.menu.get('v60-ethiopia-hot-cold')!.stockQuantity, 10, 'Verify step does NOT deduct v60 stock prematurely');
    assertEqual(harness.menu.get('matcha-iced')!.stockCount, 5, 'Verify step does NOT deduct matcha stock prematurely');
    // 2*(12+4.5) + 3*6.5 + 1*17 = 33 + 19.5 + 17 = 69.5 SAR
    assertEqual(ver.breakdown.totalBillSar, 69.5, 'Verified total = 69.50 SAR');

    const promoted = await approveAndPromoteOrderRequest({
      requestId: 'req_e2e_hard',
      admin: VERIFIED_ADMIN,
      store,
    });
    assertEqual(promoted.totalBillSar, 69.5, 'Promoted total = 69.50 SAR');
    assertEqual(harness.menu.get('v60-ethiopia-hot-cold')!.stockQuantity, 8, 'v60 stock deducted 10 -> 8');
    assertEqual(harness.menu.get('matcha-iced')!.stockCount, 4, 'matcha stockCount deducted 5 -> 4');
    assertEqual(harness.menu.get('cotd-small')!.stockQuantity, undefined, 'Untracked item untouched');
    assertEqual(harness.orders.get(promoted.orderId)!.sourceRequestId, 'req_e2e_hard', 'Order links sourceRequestId');
    assertEqual(harness.orderNumbers.get(promoted.orderNumber)!.orderId, promoted.orderId, 'Order number claim linked');
  });

  // 12. Reject request preserves inventory untouched & verifies rejector UID
  await runTest('12. Rejecting a request never modifies menu stock and records verified rejector UID', async () => {
    const harness = new InMemoryHardenedFirestoreHarness();
    harness.seedCatalog();
    harness.orderRequests.set(
      'req_rej_stock',
      makeRequestDoc('req_rej_stock', [
        { itemId: 'v60-ethiopia-hot-cold', quantity: 5, selectedCustomizations: [{ groupId: 'size', optionId: 'regular' }] },
      ]),
    );
    const store = harness.createStoreAdapter();

    const rejected = await rejectOrderRequest({
      requestId: 'req_rej_stock',
      admin: VERIFIED_ADMIN,
      reason: 'Customer requested cancellation via WhatsApp',
      store,
    });
    assertEqual(rejected.status, 'rejected', 'Marked rejected');
    assertEqual(rejected.rejectedBy, VERIFIED_ADMIN.uid, 'Recorded verified admin UID');
    assertEqual(harness.menu.get('v60-ethiopia-hot-cold')!.stockQuantity, 10, 'Inventory untouched on reject');
    assertEqual(harness.orders.size, 0, 'Zero orders created on reject');
    assertEqual(harness.orderNumbers.size, 0, 'Zero orderNumbers claimed on reject');
  });

  console.log(`\nStage 04L.1 Hardening Test Summary: ${passed} passed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
