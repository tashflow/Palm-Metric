import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  executeAuthoritativeOrderCreation,
  type OrderStoreAdapter,
  type OrderTransactionAdapter,
} from '../orderCreation';
import { computeAuthoritativeItemPricing, halalasToSar, sarToHalalas } from '../orderPricing';
import {
  CanonicalOrderDoc,
  CoffeeOptionsDoc,
  IdempotencyRecord,
  MenuCatalogDoc,
  OrderBackendError,
  ProductCustomizationDoc,
} from '../types';

interface MockDbState {
  menu: Map<string, MenuCatalogDoc>;
  productCustomizations: Map<string, ProductCustomizationDoc>;
  coffeeOptions: CoffeeOptionsDoc | null;
  orders: Map<string, CanonicalOrderDoc>;
  idempotencyKeys: Map<string, IdempotencyRecord>;
  nextOrderSeq: number;
}

function createSeededMockState(): MockDbState {
  const menu = new Map<string, MenuCatalogDoc>();
  menu.set('cotd-small', {
    id: 'cotd-small',
    name: 'Coffee of the Day - Small',
    nameAr: 'قهوة اليوم - صغير',
    price: 9,
    category: 'Coffee of the Day',
    inStock: true,
    supportsTemp: true,
    imageUrl: 'https://example.com/cotd.jpg',
  });
  menu.set('v60-ethiopia-hot-cold', {
    id: 'v60-ethiopia-hot-cold',
    name: 'Ethiopia V60',
    nameAr: 'في ٦٠ إثيوبيا',
    price: 20,
    category: 'V60',
    inStock: true,
    supportsTemp: true,
    imageUrl: '',
  });
  menu.set('espresso-flat-white', {
    id: 'espresso-flat-white',
    name: 'Flat White',
    nameAr: 'فلات وايت',
    price: 16,
    category: 'Espresso',
    inStock: true,
    allowMilkOption: true,
    imageUrl: '',
  });
  menu.set('matcha-iced', {
    id: 'matcha-iced',
    name: 'Iced Matcha',
    nameAr: 'ماتشا مثلجة',
    price: 18,
    category: 'Matcha',
    inStock: true,
    imageUrl: '',
  });
  menu.set('food-croissant', {
    id: 'food-croissant',
    name: 'Butter Croissant',
    nameAr: 'كرواسون بالزبدة',
    price: 12.15,
    category: 'Food',
    inStock: true,
    imageUrl: '',
  });
  menu.set('cold-out-of-stock', {
    id: 'cold-out-of-stock',
    name: 'Seasonal Reserve',
    nameAr: 'محصول موسمي',
    price: 28,
    category: 'V60',
    inStock: false,
    imageUrl: '',
  });
  menu.set('disabled-custom-item', {
    id: 'disabled-custom-item',
    name: 'Espresso Macchiato',
    nameAr: 'إسبريسو ماكياتو',
    price: 14,
    category: 'Espresso',
    inStock: true,
    imageUrl: '',
  });

  const productCustomizations = new Map<string, ProductCustomizationDoc>();
  productCustomizations.set('matcha-iced', {
    productId: 'matcha-iced',
    enabled: true,
    schemaVersion: 1,
    allowSpecialInstructions: true,
    groups: [
      {
        id: 'milk',
        name: 'Milk Type',
        nameAr: 'نوع الحليب',
        type: 'single',
        required: true,
        minSelections: 1,
        maxSelections: 1,
        displayOrder: 0,
        enabled: true,
        options: [
          {
            id: 'oat',
            name: 'Oat Milk',
            nameAr: 'حليب الشوفان',
            additionalPrice: 4.1,
            enabled: true,
            isDefault: true,
            displayOrder: 0,
          },
          {
            id: 'almond',
            name: 'Almond Milk',
            nameAr: 'حليب اللوز',
            additionalPrice: 3.5,
            enabled: false,
            displayOrder: 1,
          },
        ],
      },
      {
        id: 'toppings',
        name: 'Add-ons',
        nameAr: 'الإضافات',
        type: 'multiple',
        required: false,
        minSelections: 0,
        maxSelections: 2,
        displayOrder: 1,
        enabled: true,
        options: [
          {
            id: 'shot',
            name: 'Extra Shot',
            nameAr: 'شوت إضافي',
            additionalPrice: 5.2,
            enabled: true,
            displayOrder: 0,
          },
          {
            id: 'honey',
            name: 'Organic Honey',
            nameAr: 'عسل عضوي',
            additionalPrice: 2.35,
            enabled: true,
            displayOrder: 1,
          },
          {
            id: 'vanilla',
            name: 'Vanilla Syrup',
            nameAr: 'فانيليا',
            additionalPrice: 2,
            enabled: true,
            displayOrder: 2,
          },
        ],
      },
    ],
  });

  productCustomizations.set('disabled-custom-item', {
    productId: 'disabled-custom-item',
    enabled: false,
    schemaVersion: 1,
    groups: [
      {
        id: 'legacy-milk',
        name: 'Milk Selection',
        type: 'single',
        required: false,
        minSelections: 0,
        maxSelections: 1,
        displayOrder: 0,
        enabled: true,
        options: [
          {
            id: 'coconut',
            name: 'Coconut Milk',
            additionalPrice: 3,
            enabled: true,
            displayOrder: 0,
          },
        ],
      },
    ],
  });

  return {
    menu,
    productCustomizations,
    coffeeOptions: {
      milkSelectionEnabled: true,
      coconutMilkExtraPrice: 3.5,
      hotColdSelectionEnabled: true,
    },
    orders: new Map(),
    idempotencyKeys: new Map(),
    nextOrderSeq: 1,
  };
}

function createTransactionalMockStore(state: MockDbState): OrderStoreAdapter {
  let txQueue = Promise.resolve();

  return {
    runTransaction<T>(fn: (tx: OrderTransactionAdapter) => Promise<T>): Promise<T> {
      // Serialize transactions sequentially like Firestore optimistic locks to verify concurrency/read-before-write
      const run = txQueue.then(async () => {
        let writeStarted = false;
        const stagedOrders = new Map<string, CanonicalOrderDoc>();
        const stagedIdem = new Map<string, IdempotencyRecord>();

        const assertReadPhase = (op: string) => {
          if (writeStarted) {
            throw new Error(`Firestore transaction violation: ${op} called after write phase`);
          }
        };

        const tx: OrderTransactionAdapter = {
          createOrderId() {
            const id = `order_srv_${state.nextOrderSeq}`;
            state.nextOrderSeq += 1;
            return id;
          },
          async getIdempotencyRecord(keyDocId: string) {
            assertReadPhase('getIdempotencyRecord');
            return state.idempotencyKeys.get(keyDocId) ?? null;
          },
          async getMenuItem(itemId: string) {
            assertReadPhase('getMenuItem');
            return state.menu.get(itemId) ?? null;
          },
          async getProductCustomization(itemId: string) {
            assertReadPhase('getProductCustomization');
            return state.productCustomizations.get(itemId) ?? null;
          },
          async getCoffeeOptions() {
            assertReadPhase('getCoffeeOptions');
            return state.coffeeOptions;
          },
          setOrder(orderId: string, docData: CanonicalOrderDoc) {
            writeStarted = true;
            stagedOrders.set(orderId, docData);
          },
          setIdempotencyRecord(keyDocId: string, record: IdempotencyRecord) {
            writeStarted = true;
            stagedIdem.set(keyDocId, record);
          },
          serverTimestamp() {
            return { _serverTimestamp: true };
          },
        };

        const result = await fn(tx);
        // Atomic commit after fn resolves without error
        stagedOrders.forEach((v, k) => state.orders.set(k, v));
        stagedIdem.forEach((v, k) => state.idempotencyKeys.set(k, v));
        return result;
      });

      txQueue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(err);
  }
}

async function expectBackendError(
  promise: Promise<unknown>,
  expectedCode: string,
  expectedReason?: string,
): Promise<void> {
  let caught: unknown = null;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  assert(caught instanceof OrderBackendError, `Expected OrderBackendError, got ${String(caught)}`);
  assert.equal(caught.code, expectedCode, `Expected error code ${expectedCode}, got ${caught.code}`);
  if (expectedReason) {
    assert.equal(
      caught.reasonCode,
      expectedReason,
      `Expected reasonCode ${expectedReason}, got ${caught.reasonCode}`,
    );
  }
}

async function main() {
  // 1. Manipulated item base price ignored
  await test('01. Client manipulated item base price is ignored; server uses authoritative /menu price', async () => {
    const state = createSeededMockState();
    const store = createTransactionalMockStore(state);
    const res = await executeAuthoritativeOrderCreation(
      store,
      {
        idempotencyKey: 'idem_test_case_01',
        orderType: 'pickup',
        currency: 'SAR',
        customerName: 'Noura',
        customerContact: '0501112233',
        items: [
          {
            itemId: 'v60-ethiopia-hot-cold',
            quantity: 2,
            temperature: 'Cold',
            price: 0.01,
            basePrice: 0.01,
          },
        ],
      },
      'uid_guest_01',
    );
    assert.equal(res.items[0].price, 20);
    assert.equal(res.subtotal, 40);
    assert.equal(res.totalBill, 40);
  });

  // 2. Manipulated customization option additionalPrice ignored
  await test('02. Client manipulated customization additionalPrice is ignored; server computes authoritative option total', async () => {
    const state = createSeededMockState();
    const store = createTransactionalMockStore(state);
    const res = await executeAuthoritativeOrderCreation(
      store,
      {
        idempotencyKey: 'idem_test_case_02',
        orderType: 'pickup',
        customerName: 'Faisal',
        customerContact: '0552223344',
        items: [
          {
            itemId: 'matcha-iced',
            quantity: 1,
            selectedCustomizations: [
              { groupId: 'milk', optionId: 'oat', additionalPrice: 0 },
              { groupId: 'toppings', optionId: 'shot', additionalPrice: 0 },
            ],
          },
        ],
      },
      'uid_guest_02',
    );
    // 18 + 4.10 + 5.20 = 27.30
    assert.equal(res.items[0].basePrice, 18);
    assert.equal(res.items[0].customizationTotal, 9.3);
    assert.equal(res.items[0].price, 27.3);
    assert.equal(res.totalBill, 27.3);
  });

  // 3. Manipulated totalBill / subtotal ignored
  await test('03. Client manipulated totalBill/subtotal is ignored; authoritative sum stored', async () => {
    const state = createSeededMockState();
    const store = createTransactionalMockStore(state);
    const res = await executeAuthoritativeOrderCreation(
      store,
      {
        idempotencyKey: 'idem_test_case_03',
        orderType: 'pickup',
        customerName: 'Lama',
        customerContact: '0540001122',
        subtotal: 1,
        totalBill: 1,
        total: 1,
        items: [{ itemId: 'cotd-small', quantity: 3 }],
      },
      'uid_guest_03',
    );
    assert.equal(res.subtotal, 27);
    assert.equal(res.totalBill, 27);
  });

  // 4. Negative, zero, or fractional quantity rejected
  await test('04. Zero, negative, and non-integer quantities are rejected', async () => {
    const store = createTransactionalMockStore(createSeededMockState());
    for (const badQty of [0, -2, 1.5, 100]) {
      await expectBackendError(
        executeAuthoritativeOrderCreation(
          store,
          {
            idempotencyKey: `idem_bad_qty_${String(badQty).replace('.', '_')}_test`,
            orderType: 'pickup',
            customerName: 'Tester',
            customerContact: '0501234567',
            items: [{ itemId: 'cotd-small', quantity: badQty }],
          },
          'uid_guest_04',
        ),
        'invalid-argument',
        'INVALID_QUANTITY',
      );
    }
  });

  // 5. Unknown product ID rejected
  await test('05. Unknown / non-existent product ID is rejected', async () => {
    const store = createTransactionalMockStore(createSeededMockState());
    await expectBackendError(
      executeAuthoritativeOrderCreation(
        store,
        {
          idempotencyKey: 'idem_test_case_05',
          orderType: 'pickup',
          customerName: 'Tester',
          customerContact: '0501234567',
          items: [{ itemId: 'free-secret-drink', quantity: 1 }],
        },
        'uid_guest_05',
      ),
      'not-found',
      'UNKNOWN_PRODUCT',
    );
  });

  // 6. Out-of-stock item rejected
  await test('06. Out-of-stock menu item is rejected', async () => {
    const store = createTransactionalMockStore(createSeededMockState());
    await expectBackendError(
      executeAuthoritativeOrderCreation(
        store,
        {
          idempotencyKey: 'idem_test_case_06',
          orderType: 'pickup',
          customerName: 'Tester',
          customerContact: '0501234567',
          items: [{ itemId: 'cold-out-of-stock', quantity: 1 }],
        },
        'uid_guest_06',
      ),
      'failed-precondition',
      'OUT_OF_STOCK',
    );
  });

  // 7. Missing required customization group rejected
  await test('07. Missing required customization group is rejected', async () => {
    const store = createTransactionalMockStore(createSeededMockState());
    await expectBackendError(
      executeAuthoritativeOrderCreation(
        store,
        {
          idempotencyKey: 'idem_test_case_07',
          orderType: 'pickup',
          customerName: 'Tester',
          customerContact: '0501234567',
          items: [{ itemId: 'matcha-iced', quantity: 1 }],
        },
        'uid_guest_07',
      ),
      'failed-precondition',
      'REQUIRED_GROUP_MISSING',
    );
  });

  // 8. Disabled customization option rejected
  await test('08. Disabled customization option is rejected', async () => {
    const store = createTransactionalMockStore(createSeededMockState());
    await expectBackendError(
      executeAuthoritativeOrderCreation(
        store,
        {
          idempotencyKey: 'idem_test_case_08',
          orderType: 'pickup',
          customerName: 'Tester',
          customerContact: '0501234567',
          items: [
            {
              itemId: 'matcha-iced',
              quantity: 1,
              selectedCustomizations: [{ groupId: 'milk', optionId: 'almond' }],
            },
          ],
        },
        'uid_guest_08',
      ),
      'failed-precondition',
      'INVALID_OR_DISABLED_OPTION',
    );
  });

  // 9. Exceeding maxSelections rejected
  await test('09. Exceeding maxSelections constraint in customization group is rejected', async () => {
    const store = createTransactionalMockStore(createSeededMockState());
    await expectBackendError(
      executeAuthoritativeOrderCreation(
        store,
        {
          idempotencyKey: 'idem_test_case_09',
          orderType: 'pickup',
          customerName: 'Tester',
          customerContact: '0501234567',
          items: [
            {
              itemId: 'matcha-iced',
              quantity: 1,
              selectedCustomizations: [
                { groupId: 'milk', optionId: 'oat' },
                { groupId: 'toppings', optionId: 'shot' },
                { groupId: 'toppings', optionId: 'honey' },
                { groupId: 'toppings', optionId: 'vanilla' },
              ],
            },
          ],
        },
        'uid_guest_09',
      ),
      'invalid-argument',
      'MAX_SELECTIONS_EXCEEDED',
    );
  });

  // 10. Customization submitted when productCustomizations/{id}.enabled == false rejected
  await test('10. Submitting customizations when productCustomizations/{id}.enabled is false is rejected without fallback', async () => {
    const store = createTransactionalMockStore(createSeededMockState());
    await expectBackendError(
      executeAuthoritativeOrderCreation(
        store,
        {
          idempotencyKey: 'idem_test_case_10',
          orderType: 'pickup',
          customerName: 'Tester',
          customerContact: '0501234567',
          items: [
            {
              itemId: 'disabled-custom-item',
              quantity: 1,
              selectedCustomizations: [{ groupId: 'legacy-milk', optionId: 'coconut' }],
            },
          ],
        },
        'uid_guest_10',
      ),
      'failed-precondition',
      'CUSTOMIZATIONS_DISABLED',
    );
  });

  // 11. Legacy coffeeOptions fallback when no productCustomizations/{id} doc exists
  await test('11. Legacy coffeeOptions milk fallback validates and prices coconut milk from settings/coffeeOptions', async () => {
    const store = createTransactionalMockStore(createSeededMockState());
    const res = await executeAuthoritativeOrderCreation(
      store,
      {
        idempotencyKey: 'idem_test_case_11',
        orderType: 'pickup',
        customerName: 'Reem',
        customerContact: '0551110099',
        items: [
          {
            itemId: 'espresso-flat-white',
            quantity: 2,
            selectedCustomizations: [{ groupId: 'legacy-milk', optionId: 'coconut' }],
          },
        ],
      },
      'uid_guest_11',
    );
    // 16 + 3.50 = 19.50 * 2 = 39
    assert.equal(res.items[0].price, 19.5);
    assert.equal(res.items[0].milkOption, 'coconut');
    assert.equal(res.items[0].milkExtraPrice, 3.5);
    assert.equal(res.totalBill, 39);
  });

  // 12. Privileged / forged status & admin fields rejected
  await test('12. Forged privileged fields (status=Completed, adminApproved, paymentVerified, customerUid spoof) rejected', async () => {
    const store = createTransactionalMockStore(createSeededMockState());
    await expectBackendError(
      executeAuthoritativeOrderCreation(
        store,
        {
          idempotencyKey: 'idem_test_case_12a',
          orderType: 'pickup',
          customerName: 'Attacker',
          customerContact: '0500000000',
          status: 'Completed',
          items: [{ itemId: 'cotd-small', quantity: 1 }],
        },
        'uid_guest_12',
      ),
      'permission-denied',
      'STATUS_OVERRIDE_FORBIDDEN',
    );
    await expectBackendError(
      executeAuthoritativeOrderCreation(
        store,
        {
          idempotencyKey: 'idem_test_case_12b',
          orderType: 'pickup',
          customerName: 'Attacker',
          customerContact: '0500000000',
          adminApproved: true,
          items: [{ itemId: 'cotd-small', quantity: 1 }],
        },
        'uid_guest_12',
      ),
      'permission-denied',
      'PRIVILEGED_FIELD_FORBIDDEN',
    );
    await expectBackendError(
      executeAuthoritativeOrderCreation(
        store,
        {
          idempotencyKey: 'idem_test_case_12c',
          orderType: 'pickup',
          customerUid: 'someone_else_uid',
          customerName: 'Attacker',
          customerContact: '0500000000',
          items: [{ itemId: 'cotd-small', quantity: 1 }],
        },
        'uid_guest_12',
      ),
      'permission-denied',
      'UID_MISMATCH',
    );
  });

  // 13. Non-pickup orderType and non-SAR currency rejected
  await test('13. Non-pickup orderType (delivery) and unsupported currency rejected', async () => {
    const store = createTransactionalMockStore(createSeededMockState());
    await expectBackendError(
      executeAuthoritativeOrderCreation(
        store,
        {
          idempotencyKey: 'idem_test_case_13a',
          orderType: 'delivery',
          customerName: 'Customer',
          customerContact: '0501234567',
          items: [{ itemId: 'cotd-small', quantity: 1 }],
        },
        'uid_guest_13',
      ),
      'invalid-argument',
      'INVALID_ORDER_TYPE',
    );
    await expectBackendError(
      executeAuthoritativeOrderCreation(
        store,
        {
          idempotencyKey: 'idem_test_case_13b',
          orderType: 'pickup',
          currency: 'USD',
          customerName: 'Customer',
          customerContact: '0501234567',
          items: [{ itemId: 'cotd-small', quantity: 1 }],
        },
        'uid_guest_13',
      ),
      'invalid-argument',
      'INVALID_CURRENCY',
    );
  });

  // 14. Integer halala SAR precision & canonical Admin order structure
  await test('14. Halala integer math avoids floating-point drift and stores Admin-compatible pickup order', async () => {
    assert.equal(sarToHalalas(0.1) + sarToHalalas(0.2), 30);
    assert.equal(halalasToSar(30), 0.3);
    const calc = computeAuthoritativeItemPricing(12.15, [4.1, 2.35], 3);
    assert.equal(calc.unitPriceSar, 18.6);
    assert.equal(calc.lineTotalSar, 55.8);

    const state = createSeededMockState();
    const store = createTransactionalMockStore(state);
    const res = await executeAuthoritativeOrderCreation(
      store,
      {
        idempotencyKey: 'idem_test_case_14',
        orderType: 'pickup',
        currency: 'SAR',
        lang: 'ar',
        customerName: 'سارة الحربي',
        customerContact: '0559876543',
        orderNote: 'وصلت عند المدخل',
        items: [
          {
            itemId: 'matcha-iced',
            quantity: 2,
            specialInstructions: 'Light ice',
            selectedCustomizations: [
              { groupId: 'milk', optionId: 'oat' },
              { groupId: 'toppings', optionId: 'honey' },
            ],
          },
          {
            itemId: 'food-croissant',
            quantity: 1,
          },
        ],
      },
      'uid_guest_14',
    );

    // Matcha: 18 + 4.10 + 2.35 = 24.45 * 2 = 48.90; Croissant: 12.15; Total = 61.05
    assert.equal(res.subtotal, 61.05);
    assert.equal(res.totalBill, 61.05);
    assert.equal(res.status, 'Pending');
    assert.equal(res.notes, 'Pickup · وصلت عند المدخل');
    assert.equal(state.orders.size, 1);
    const stored = state.orders.get(res.orderId);
    assert(stored, 'Order written cleanly to orders collection');
    assert.equal(stored.customerUid, 'uid_guest_14');
    assert.equal(stored.customerContact, '0559876543');
    assert.equal(stored.currency, 'SAR');
    assert.equal(stored.orderType, 'pickup');
  });

  // 15. Unauthenticated request rejected
  await test('15. Unauthenticated request (empty UID) is rejected', async () => {
    const store = createTransactionalMockStore(createSeededMockState());
    await expectBackendError(
      executeAuthoritativeOrderCreation(
        store,
        {
          idempotencyKey: 'idem_test_case_15',
          orderType: 'pickup',
          customerName: 'Anon',
          customerContact: '0501234567',
          items: [{ itemId: 'cotd-small', quantity: 1 }],
        },
        '',
      ),
      'unauthenticated',
      'UNAUTHENTICATED',
    );
  });

  // 16. Duplicate idempotencyKey replay returns original order without duplication
  await test('16. Retrying with identical idempotencyKey returns existing order cleanly without duplicates', async () => {
    const state = createSeededMockState();
    const store = createTransactionalMockStore(state);
    const payload = {
      idempotencyKey: 'idem_test_case_16',
      orderType: 'pickup',
      customerName: 'Bader',
      customerContact: '0503334444',
      items: [{ itemId: 'cotd-small', quantity: 2 }],
    };

    const first = await executeAuthoritativeOrderCreation(store, payload, 'uid_guest_16');
    const second = await executeAuthoritativeOrderCreation(store, payload, 'uid_guest_16');

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(second.orderId, first.orderId);
    assert.equal(second.orderNumber, first.orderNumber);
    assert.equal(second.totalBill, first.totalBill);
    assert.equal(state.orders.size, 1, 'Only one order document exists in Firestore');
  });

  // 17. Reused idempotencyKey with different payload rejected
  await test('17. Reusing same idempotencyKey with a modified payload is rejected', async () => {
    const state = createSeededMockState();
    const store = createTransactionalMockStore(state);
    await executeAuthoritativeOrderCreation(
      store,
      {
        idempotencyKey: 'idem_test_case_17',
        orderType: 'pickup',
        customerName: 'Tariq',
        customerContact: '0505556666',
        items: [{ itemId: 'cotd-small', quantity: 1 }],
      },
      'uid_guest_17',
    );

    await expectBackendError(
      executeAuthoritativeOrderCreation(
        store,
        {
          idempotencyKey: 'idem_test_case_17',
          orderType: 'pickup',
          customerName: 'Tariq',
          customerContact: '0505556666',
          items: [{ itemId: 'v60-ethiopia-hot-cold', quantity: 1 }],
        },
        'uid_guest_17',
      ),
      'failed-precondition',
      'IDEMPOTENCY_CONFLICT',
    );
  });

  // 18. Concurrent parallel submissions with same idempotencyKey preserve single order
  await test('18. Concurrent parallel submissions with same idempotencyKey create exactly one order', async () => {
    const state = createSeededMockState();
    const store = createTransactionalMockStore(state);
    const payload = {
      idempotencyKey: 'idem_test_case_18',
      orderType: 'pickup',
      customerName: 'Huda',
      customerContact: '0507778888',
      items: [{ itemId: 'v60-ethiopia-hot-cold', quantity: 1 }],
    };

    const [a, b] = await Promise.all([
      executeAuthoritativeOrderCreation(store, payload, 'uid_guest_18'),
      executeAuthoritativeOrderCreation(store, payload, 'uid_guest_18'),
    ]);

    assert.equal(a.orderId, b.orderId);
    assert.equal(Number(a.idempotentReplay) + Number(b.idempotentReplay), 1);
    assert.equal(state.orders.size, 1);
  });

  // 19 & 20. Firestore Rules PII isolation and client-write lock checks
  await test('19. Firestore rules block direct client /orders create & /idempotencyKeys access', () => {
    const rulesPath = path.resolve(process.cwd(), '../firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');
    const ordersMatch = rules.match(/match \/orders\/\{orderId\} \{[\s\S]*?\n    \}/);
    assert(ordersMatch, '/orders/{orderId} rule block exists');
    assert(ordersMatch[0].includes('allow create: if false;'), 'Direct client order creation is denied');
    assert(ordersMatch[0].includes('isAdmin()'), 'Only verified admins can update or delete orders');
    assert(
      rules.includes('match /idempotencyKeys/{keyId} {\n      allow read, write: if false;'),
      'idempotencyKeys collection denies all client reads/writes',
    );
  });

  await test('20. Firestore rules enforce customerUid == request.auth.uid on order get & list (no cross-customer read)', () => {
    const rulesPath = path.resolve(process.cwd(), '../firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');
    const ordersMatch = rules.match(/match \/orders\/\{orderId\} \{[\s\S]*?\n    \}/);
    assert(ordersMatch, '/orders/{orderId} rule block exists');
    assert(
      ordersMatch[0].includes('existing().customerUid == request.auth.uid'),
      'Customer single-order get enforces customerUid == request.auth.uid',
    );
    assert(
      ordersMatch[0].includes('resource.data.customerUid == request.auth.uid'),
      'Customer order list enforces resource.data.customerUid == request.auth.uid',
    );
    assert(!ordersMatch[0].includes('allow list: if true'), 'Blanket order listing forbidden');
    assert(!ordersMatch[0].includes('allow list: if isSignedIn();'), 'Unscoped signed-in listing forbidden');
  });

  console.log(`\nStage 04E Backend Test Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
