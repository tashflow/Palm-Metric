import fs from 'node:fs';
import path from 'node:path';
import { COPY } from '../src/data/i18n';
import { buildOrderRequestItemsFromCart } from '../src/components/CheckoutPage';
import {
  GuestFirebaseAuthUnavailableError,
  OrderRequestError,
  buildCustomerOrderRequestPayload,
  computeStableOrderRequestId,
  formatOrderRequestNumber,
  mapOrderRequestSnapshot,
  mapOrderSnapshot,
  normalizeOrderRequestStatus,
  submitCustomerOrderRequest,
  type OrderRequestPersistenceAdapter,
} from '../src/lib/firestoreSync';
import { buildBilingualOrderRequestWhatsAppSummary } from '../src/lib/whatsapp';
import type { CartItem } from '../src/types';

let passed = 0;
let failed = 0;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`,
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
    console.error(err);
  }
}

function makeFakeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    cartKey: 'v60-ethiopia-hot-cold::temp=cold::note=Less ice',
    itemId: 'v60-ethiopia-hot-cold',
    name: 'Ethiopia V60',
    nameAr: 'في ٦٠ إثيوبيا',
    nameEn: 'Ethiopia V60',
    price: 25,
    basePrice: 20,
    customizationTotal: 5,
    customizations: [
      {
        groupId: 'brew-profile',
        groupName: 'Brew Profile',
        groupNameAr: 'أسلوب التحضير',
        optionId: 'slow-drip',
        optionName: 'Slow Drip',
        optionNameAr: 'تقطير بطيء',
        additionalPrice: 5,
      },
    ],
    imageUrl: '',
    quantity: 2,
    note: 'Less ice',
    temp: 'cold',
    ...overrides,
  };
}

async function main(): Promise<void> {
  // 1. Guest Firebase Auth fail-closed enforcement
  await runTest('1. Rejects request build & submission when Firebase UID is missing (fail-closed)', async () => {
    let buildErr: unknown = null;
    try {
      buildCustomerOrderRequestPayload(
        {
          orderType: 'pickup',
          customerName: 'Guest Customer',
          customerPhone: '0551234567',
          items: [{ itemId: 'cotd-small', quantity: 1 }],
        },
        '   ',
        'req_test_0001',
      );
    } catch (err) {
      buildErr = err;
    }
    assert(
      buildErr instanceof GuestFirebaseAuthUnavailableError,
      'Missing UID must throw GuestFirebaseAuthUnavailableError',
    );

    let submitErr: unknown = null;
    const adapter: OrderRequestPersistenceAdapter = {
      ensureSession: async () => ({ user: null, errorCode: 'auth/operation-not-allowed' }),
      getExistingRequest: async () => null,
      createRequestDoc: async () => {
        throw new Error('Must not attempt Firestore write without UID');
      },
      serverTimestampValue: () => 'SERVER_TIMESTAMP',
    };

    try {
      await submitCustomerOrderRequest(
        {
          orderType: 'pickup',
          customerName: 'Guest Customer',
          customerPhone: '0551234567',
          items: [{ itemId: 'cotd-small', quantity: 1 }],
        },
        adapter,
      );
    } catch (err) {
      submitErr = err;
    }
    assert(
      submitErr instanceof GuestFirebaseAuthUnavailableError,
      'submitCustomerOrderRequest must fail closed when anonymous session is unavailable',
    );
  });

  // 2. Request creation to /orderRequests/{requestId} (not /orders)
  await runTest('2. Submits valid pickup order request to /orderRequests/{requestId}', async () => {
    const writes: Array<{ requestId: string; payload: Record<string, unknown> }> = [];
    const adapter: OrderRequestPersistenceAdapter = {
      ensureSession: async () => ({ user: { uid: 'anon_uid_spark_1' } }),
      getExistingRequest: async () => null,
      createRequestDoc: async (requestId, payload) => {
        writes.push({ requestId, payload });
      },
      serverTimestampValue: () => ({ __type: 'serverTimestamp' }),
    };

    const result = await submitCustomerOrderRequest(
      {
        requestId: 'req_spark_case2_abcdef12',
        orderType: 'pickup',
        customerName: '  Sara Al-Otaibi ',
        customerPhone: ' 0558889990 ',
        orderNote: 'Arriving in 10 mins',
        lang: 'en',
        items: [
          {
            itemId: 'v60-ethiopia-hot-cold',
            name: 'Ethiopia V60',
            nameAr: 'في ٦٠ إثيوبيا',
            quantity: 2,
            temperature: 'Cold',
            milkOption: 'coconut',
            selectedSizeId: 'large',
            specialInstructions: 'Light ice',
            selectedCustomizations: [{ groupId: 'grind', optionId: 'medium' }],
          },
        ],
      },
      adapter,
    );

    assertEqual(writes.length, 1, 'Exactly one createRequestDoc call performed');
    assertEqual(writes[0].requestId, 'req_spark_case2_abcdef12', 'Request ID preserved');
    assertEqual(writes[0].payload.customerUid, 'anon_uid_spark_1', 'Owner UID stamped from auth session');
    assertEqual(writes[0].payload.status, 'pending_review', 'Initial status is strictly pending_review');
    assertEqual(writes[0].payload.orderType, 'pickup', 'Service mode is pickup only');
    assertEqual(writes[0].payload.currency, 'SAR', 'Currency is SAR');
    assertEqual(writes[0].payload.requestSource, 'customer-app-spark', 'Source tag set');
    assertEqual(result.status, 'pending_review', 'Returned request has pending_review status');
    assertEqual(result.duplicatePrevented, false, 'Fresh submission not flagged duplicate');
  });

  // 3. Customer UID ownership & tampering prevention
  await runTest('3. Enforces customerUid ownership and ignores spoofed UID during submission', async () => {
    const writes: Array<{ payload: Record<string, unknown> }> = [];
    const adapter: OrderRequestPersistenceAdapter = {
      ensureSession: async () => ({ user: { uid: 'real_firebase_uid_999' } }),
      getExistingRequest: async () => null,
      createRequestDoc: async (_id, payload) => {
        writes.push({ payload });
      },
      serverTimestampValue: () => 'TS',
    };

    const forgedInput = {
      requestId: 'req_spark_uid_test_1234',
      orderType: 'pickup' as const,
      customerName: 'Faisal',
      customerPhone: '0501234567',
      customerUid: 'spoofed_other_uid',
      items: [{ itemId: 'cotd-small', quantity: 1 }],
    };

    await submitCustomerOrderRequest(forgedInput, adapter);
    assertEqual(
      writes[0].payload.customerUid,
      'real_firebase_uid_999',
      'Authenticated session UID overrides any spoofed UID',
    );
  });

  // 4. Customer name & contact validation
  await runTest('4. Rejects missing customer name or contact shorter than 4 characters', () => {
    let errName: unknown = null;
    try {
      buildCustomerOrderRequestPayload(
        {
          orderType: 'pickup',
          customerName: '   ',
          customerPhone: '0551234567',
          items: [{ itemId: 'cotd-small', quantity: 1 }],
        },
        'uid_1',
        'req_valid_id_01',
      );
    } catch (err) {
      errName = err;
    }
    assert(
      errName instanceof OrderRequestError && errName.reasonCode === 'INVALID_CUSTOMER_NAME',
      'Blank customer name rejected with INVALID_CUSTOMER_NAME',
    );

    let errPhone: unknown = null;
    try {
      buildCustomerOrderRequestPayload(
        {
          orderType: 'pickup',
          customerName: 'Noura',
          customerPhone: '055',
          items: [{ itemId: 'cotd-small', quantity: 1 }],
        },
        'uid_1',
        'req_valid_id_01',
      );
    } catch (err) {
      errPhone = err;
    }
    assert(
      errPhone instanceof OrderRequestError && errPhone.reasonCode === 'INVALID_CUSTOMER_CONTACT',
      'Short customer contact (<4 chars) rejected with INVALID_CUSTOMER_CONTACT',
    );
  });

  // 5. Empty cart and >50 items rejection
  await runTest('5. Rejects empty item lists and lists exceeding 50 items', () => {
    let emptyErr: unknown = null;
    try {
      buildCustomerOrderRequestPayload(
        {
          orderType: 'pickup',
          customerName: 'Omar',
          customerPhone: '0551234567',
          items: [],
        },
        'uid_1',
        'req_valid_id_02',
      );
    } catch (err) {
      emptyErr = err;
    }
    assert(
      emptyErr instanceof OrderRequestError && emptyErr.reasonCode === 'ITEMS_COUNT_OUT_OF_RANGE',
      'Empty items rejected',
    );

    const tooMany = Array.from({ length: 51 }, () => ({ itemId: 'cotd-small', quantity: 1 }));
    let overErr: unknown = null;
    try {
      buildCustomerOrderRequestPayload(
        {
          orderType: 'pickup',
          customerName: 'Omar',
          customerPhone: '0551234567',
          items: tooMany,
        },
        'uid_1',
        'req_valid_id_02',
      );
    } catch (err) {
      overErr = err;
    }
    assert(
      overErr instanceof OrderRequestError && overErr.reasonCode === 'ITEMS_COUNT_OUT_OF_RANGE',
      'Over 50 items rejected',
    );
  });

  // 6. Invalid quantity bounds (0, -1, 1.5, 100, NaN)
  await runTest('6. Rejects invalid quantities (0, -1, 1.5, 100, NaN)', () => {
    for (const badQty of [0, -1, 1.5, 100, Number.NaN]) {
      let caught: unknown = null;
      try {
        buildCustomerOrderRequestPayload(
          {
            orderType: 'pickup',
            customerName: 'Omar',
            customerPhone: '0551234567',
            items: [{ itemId: 'cotd-small', quantity: badQty }],
          },
          'uid_1',
          'req_valid_id_03',
        );
      } catch (err) {
        caught = err;
      }
      assert(
        caught instanceof OrderRequestError && caught.reasonCode === 'INVALID_QUANTITY',
        `Quantity ${String(badQty)} must be rejected with INVALID_QUANTITY`,
      );
    }
  });

  // 7. Invalid / missing itemId rejection + legacy alias canonicalization
  await runTest('7. Rejects missing or malformed itemId and canonicalizes legacy aliases', () => {
    for (const badId of ['', '   ', 'bad/id with spaces', '../orders/hack']) {
      let caught: unknown = null;
      try {
        buildCustomerOrderRequestPayload(
          {
            orderType: 'pickup',
            customerName: 'Lama',
            customerPhone: '0551234567',
            items: [{ itemId: badId, quantity: 1 }],
          },
          'uid_1',
          'req_valid_id_04',
        );
      } catch (err) {
        caught = err;
      }
      assert(
        caught instanceof OrderRequestError && caught.reasonCode === 'INVALID_ITEM_ID',
        `Malformed itemId "${badId}" rejected with INVALID_ITEM_ID`,
      );
    }

    const validPayload = buildCustomerOrderRequestPayload(
      {
        orderType: 'pickup',
        customerName: 'Lama',
        customerPhone: '0551234567',
        items: [{ itemId: 'v60-ethiopia', quantity: 1 }],
      },
      'uid_1',
      'req_valid_id_04',
    );
    assertEqual(
      validPayload.items[0].itemId,
      'v60-ethiopia-hot-cold',
      'Legacy alias v60-ethiopia canonicalized to v60-ethiopia-hot-cold',
    );
  });

  // 8. Request submission failure error handling
  await runTest('8. Normalizes Firestore write failures into OrderRequestError cleanly', async () => {
    const adapter: OrderRequestPersistenceAdapter = {
      ensureSession: async () => ({ user: { uid: 'uid_fail_test' } }),
      getExistingRequest: async () => null,
      createRequestDoc: async () => {
        const fsErr = new Error('Missing or insufficient permissions') as Error & { code: string };
        fsErr.code = 'permission-denied';
        throw fsErr;
      },
      serverTimestampValue: () => 'TS',
    };

    let caught: unknown = null;
    try {
      await submitCustomerOrderRequest(
        {
          requestId: 'req_fail_case_01',
          orderType: 'pickup',
          customerName: 'Khalid',
          customerPhone: '0551234567',
          items: [{ itemId: 'cotd-small', quantity: 1 }],
        },
        adapter,
      );
    } catch (err) {
      caught = err;
    }
    assert(caught instanceof OrderRequestError, 'Throws OrderRequestError on Firestore failure');
    assertEqual((caught as OrderRequestError).code, 'permission-denied', 'Preserves normalized Firestore code');
  });

  // 9. Duplicate submission prevention & retry idempotency with stable requestId
  await runTest('9. Prevents duplicate requests on retries and already-exists race using stable requestId', async () => {
    const stableA = computeStableOrderRequestId('uid_1', 'fp_same', 'nonce_abc');
    const stableB = computeStableOrderRequestId('uid_1', 'fp_same', 'nonce_abc');
    const stableOther = computeStableOrderRequestId('uid_1', 'fp_same', 'nonce_xyz');
    assertEqual(stableA, stableB, 'Stable requestId is deterministic for identical checkout attempt');
    assert(stableA !== stableOther, 'Different attempt nonce yields distinct requestId');
    assert(stableA.startsWith('req_'), 'Stable requestId uses req_ prefix');

    let writeAttempts = 0;
    const preExistingAdapter: OrderRequestPersistenceAdapter = {
      ensureSession: async () => ({ user: { uid: 'uid_dup' } }),
      getExistingRequest: async () => ({
        requestId: stableA,
        customerUid: 'uid_dup',
        customerName: 'Maha',
        customerContact: '0551112222',
        orderType: 'pickup',
        currency: 'SAR',
        status: 'pending_review',
        items: [{ itemId: 'cotd-small', quantity: 1 }],
      }),
      createRequestDoc: async () => {
        writeAttempts += 1;
      },
      serverTimestampValue: () => 'TS',
    };

    const existingRes = await submitCustomerOrderRequest(
      {
        requestId: stableA,
        orderType: 'pickup',
        customerName: 'Maha',
        customerPhone: '0551112222',
        items: [{ itemId: 'cotd-small', quantity: 1 }],
      },
      preExistingAdapter,
    );
    assertEqual(writeAttempts, 0, 'Pre-existing committed request skips duplicate write');
    assertEqual(existingRes.duplicatePrevented, true, 'Flags duplicatePrevented when reusing existing request');

    // Race recovery if write fails with already-exists / permission-denied because doc just committed
    let readCount = 0;
    const raceAdapter: OrderRequestPersistenceAdapter = {
      ensureSession: async () => ({ user: { uid: 'uid_race' } }),
      getExistingRequest: async () => {
        readCount += 1;
        if (readCount === 1) return null;
        return {
          requestId: 'req_race_recover_1',
          customerUid: 'uid_race',
          customerName: 'Maha',
          customerContact: '0551112222',
          orderType: 'pickup',
          currency: 'SAR',
          status: 'pending_review',
          items: [{ itemId: 'cotd-small', quantity: 1 }],
        };
      },
      createRequestDoc: async () => {
        const err = new Error('Document already exists') as Error & { code: string };
        err.code = 'already-exists';
        throw err;
      },
      serverTimestampValue: () => 'TS',
    };

    const raceRes = await submitCustomerOrderRequest(
      {
        requestId: 'req_race_recover_1',
        orderType: 'pickup',
        customerName: 'Maha',
        customerPhone: '0551112222',
        items: [{ itemId: 'cotd-small', quantity: 1 }],
      },
      raceAdapter,
    );
    assertEqual(raceRes.duplicatePrevented, true, 'Race condition recovers existing request safely');
  });

  // 10. Cart preservation on failure
  await runTest('10. Preserves caller input on failure and CheckoutPage only clears cart after await resolves', async () => {
    const cartItems: CartItem[] = [makeFakeCartItem()];
    const snapshotBefore = JSON.stringify(cartItems);
    const requestItems = buildOrderRequestItemsFromCart(cartItems);

    const failingAdapter: OrderRequestPersistenceAdapter = {
      ensureSession: async () => ({ user: { uid: 'uid_preserve' } }),
      getExistingRequest: async () => null,
      createRequestDoc: async () => {
        throw new Error('Network unreachable');
      },
      serverTimestampValue: () => 'TS',
    };

    let rejected = false;
    try {
      await submitCustomerOrderRequest(
        {
          requestId: 'req_preserve_cart_1',
          orderType: 'pickup',
          customerName: 'Huda',
          customerPhone: '0551234567',
          items: requestItems,
        },
        failingAdapter,
      );
    } catch {
      rejected = true;
    }

    assert(rejected, 'Failing submission rejects cleanly');
    assertEqual(JSON.stringify(cartItems), snapshotBefore, 'Input cart items remain untouched on failure');

    const checkoutSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CheckoutPage.tsx'), 'utf8');
    const submitIdx = checkoutSrc.indexOf('const submittedRequest = await submitCustomerOrderRequest');
    const clearIdx = checkoutSrc.indexOf('onClearCart();');
    assert(submitIdx > 0 && clearIdx > submitIdx, 'onClearCart() executes strictly after await submitCustomerOrderRequest');
  });

  // 11. Request confirmation wording (no confirmed invoice or prep claim)
  await runTest('11. Request confirmation wording states awaiting Admin review (never confirmed/preparing)', () => {
    for (const lang of ['ar', 'en'] as const) {
      const t = COPY[lang];
      assert(
        t.requestSubmittedTitle.length > 0 && t.requestSubmittedSubtitle.length > 0,
        `Request confirmation copy exists for ${lang}`,
      );
      assert(
        !/in preparation|confirmed invoice|تم بدء التحضير|فاتورة نهائية معتمدة/i.test(t.requestSubmittedTitle),
        `${lang} request title does not claim order is confirmed or in preparation`,
      );
    }
    assert(
      COPY.en.requestSubmittedSubtitle.toLowerCase().includes('not confirmed or in preparation yet'),
      'English subtitle explicitly clarifies order is not confirmed or in preparation yet',
    );
    assert(
      COPY.ar.requestSubmittedSubtitle.includes('لم يتم اعتماد الطلب أو بدء التحضير بعد'),
      'Arabic subtitle explicitly clarifies order is not confirmed or in preparation yet',
    );
  });

  // 12. WhatsApp Order Request summary wording
  await runTest('12. WhatsApp Order Request message uses awaiting-Admin wording and omits unverified totals', () => {
    const url = buildBilingualOrderRequestWhatsAppSummary({
      requestNumber: 'REQ-ABC123',
      requestId: 'req_chk_abc123',
      customerName: 'Noura',
      customerPhone: '0551112233',
      orderNote: 'Arrive at 6pm',
      whatsappNumber: '966506439172',
      items: [
        {
          itemId: 'v60-ethiopia-hot-cold',
          nameEn: 'Ethiopia V60',
          nameAr: 'في ٦٠ إثيوبيا',
          quantity: 2,
          temperature: 'Cold',
          milkOption: 'coconut',
          selectedSizeId: 'large',
          specialInstructions: 'Light ice',
          selectedCustomizations: [
            {
              groupId: 'brew',
              groupName: 'Brew',
              groupNameAr: 'التحضير',
              optionId: 'slow',
              optionName: 'Slow Drip',
              optionNameAr: 'تقطير بطيء',
            },
          ],
        },
      ],
    });

    assert(url.startsWith('https://wa.me/966506439172?text='), 'Targets configured WhatsApp 966506439172');
    const decoded = decodeURIComponent(url.split('?text=')[1]);
    assert(decoded.includes('ORDER REQUEST — AWAITING ADMIN CONFIRMATION'), 'Includes English pending-admin header');
    assert(decoded.includes('طلب مبدئي — بانتظار تأكيد الإدارة والسعر النهائي'), 'Includes Arabic pending-admin header');
    assert(decoded.includes('REQ-ABC123 (req_chk_abc123)'), 'Includes request number and ID');
    assert(decoded.includes('Pending Admin Verification (SAR)'), 'States SAR price is pending Admin verification');
    assert(!decoded.includes('Subtotal /'), 'Must NOT include confirmed Subtotal line');
    assert(!decoded.includes('Total /'), 'Must NOT include confirmed Total line');
  });

  // 13. Zero client-supplied financial or privileged admin fields
  await runTest('13. Strips/omits ALL financial and privileged Admin fields from /orderRequests payloads', () => {
    const cartPayloadItems = buildOrderRequestItemsFromCart([makeFakeCartItem()]);
    const fullPayload = buildCustomerOrderRequestPayload(
      {
        orderType: 'pickup',
        customerName: 'Tamper Tester',
        customerPhone: '0559998888',
        items: [
          {
            ...cartPayloadItems[0],
            // Inject forged financial fields dynamically
            ...({
              price: 0.01,
              basePrice: 0.01,
              customizationTotal: 0,
              additionalPrice: 0,
              milkExtraPrice: 0,
              subtotal: 0.01,
              total: 0.01,
            } as Record<string, unknown>),
          },
        ],
        ...({
          total: 0.01,
          totalBill: 0.01,
          subtotal: 0.01,
          discount: 100,
          tax: 0,
          approvedOrderId: 'forged_order',
          approvedOrderNumber: 'PM-0001',
          rejectionReason: 'forged',
          status: 'approved',
        } as Record<string, unknown>),
      },
      'uid_clean_test',
      'req_clean_payload_1',
    );

    const forbiddenTopKeys = [
      'price',
      'subtotal',
      'total',
      'totalBill',
      'discount',
      'tax',
      'pricingVersion',
      'approvedOrderId',
      'approvedOrderNumber',
      'rejectionReason',
      'reviewedBy',
    ];
    for (const k of forbiddenTopKeys) {
      assert(!(k in fullPayload), `Top-level payload must NOT contain "${k}"`);
    }
    assertEqual(fullPayload.status, 'pending_review', 'Forged status forced to pending_review');

    const forbiddenItemKeys = [
      'price',
      'basePrice',
      'customizationTotal',
      'additionalPrice',
      'milkExtraPrice',
      'subtotal',
      'total',
      'discount',
    ];
    for (const k of forbiddenItemKeys) {
      assert(!(k in fullPayload.items[0]), `Line item must NOT contain "${k}"`);
    }
  });

  // 14. Bilingual AR (RTL) & EN (LTR) completeness
  await runTest('14. COPY.ar and COPY.en contain all Stage 04K request checkout, error, and tracker keys', () => {
    const stage04kKeys: Array<keyof typeof COPY.en> = [
      'requestCheckoutTitle',
      'requestPickupNoticeDesc',
      'estimatedSubtotalLabel',
      'estimatedCheckoutTotalLabel',
      'estimatedPriceDisclaimer',
      'submitOrderRequestBtn',
      'submittingOrderRequestBtn',
      'requestSubmittedTitle',
      'requestSubmittedSubtitle',
      'requestReferenceLabel',
      'requestAwaitingAdminBadge',
      'requestSendWhatsappBtn',
      'requestTrackStatusBtn',
      'requestDuplicateNotice',
      'requestSectionLabel',
      'requestStepSubmitted',
      'requestStepReview',
      'requestStepVerified',
      'requestStepOrderCreated',
      'requestStepSubmittedHint',
      'requestStepReviewHint',
      'requestStepVerifiedHint',
      'requestStepOrderCreatedHint',
      'requestStatusPendingTitle',
      'requestStatusReviewingTitle',
      'requestStatusApprovedTitle',
      'requestStatusRejectedTitle',
      'requestStatusCancelledTitle',
      'requestViewFinalOrderBtn',
      'requestPendingPriceNotice',
      'requestTypeBadge',
      'orderTypeBadge',
      'errInvalidItem',
      'errInvalidQuantity',
      'errRequestSubmitFailed',
    ];

    for (const key of stage04kKeys) {
      assert(typeof COPY.ar[key] === 'string' && COPY.ar[key].trim().length > 0, `COPY.ar.${key} missing/empty`);
      assert(typeof COPY.en[key] === 'string' && COPY.en[key].trim().length > 0, `COPY.en.${key} missing/empty`);
    }
  });

  // 15. Existing /orders compatibility & OrderRequest snapshot mapping
  await runTest('15. Preserves existing /orders snapshot mapping and normalizes /orderRequests statuses', () => {
    assertEqual(normalizeOrderRequestStatus('pending'), 'pending_review', 'pending -> pending_review');
    assertEqual(normalizeOrderRequestStatus('in_review'), 'reviewing', 'in_review -> reviewing');
    assertEqual(normalizeOrderRequestStatus('verified'), 'verified', 'verified -> verified');
    assertEqual(normalizeOrderRequestStatus('order_created'), 'order_created', 'order_created -> order_created');
    assertEqual(normalizeOrderRequestStatus('approved'), 'approved', 'approved -> approved');
    assertEqual(normalizeOrderRequestStatus('declined'), 'rejected', 'declined -> rejected');
    assertEqual(normalizeOrderRequestStatus('canceled'), 'cancelled', 'canceled -> cancelled');

    const reqSnap = mapOrderRequestSnapshot('req_snap_001', {
      requestId: 'req_snap_001',
      customerUid: 'uid_c1',
      customerName: 'Amira',
      customerContact: '0552223344',
      status: 'approved',
      approvedOrderId: 'ord_final_77',
      approvedOrderNumber: 'PM-7711',
      items: [{ itemId: 'cotd-small', quantity: 2 }],
    });
    assertEqual(reqSnap.status, 'approved', 'Maps approved status');
    assertEqual(reqSnap.approvedOrderId, 'ord_final_77', 'Preserves approvedOrderId link');
    assertEqual(reqSnap.requestNumber, formatOrderRequestNumber('req_snap_001'), 'Formats REQ- ref');

    const ordSnap = mapOrderSnapshot('ord_final_77', {
      orderNumber: 'PM-7711',
      customerUid: 'uid_c1',
      customerName: 'Amira',
      customerContact: '0552223344',
      status: 'Preparing',
      totalBill: 22,
      items: [{ itemId: 'cotd-small', name: 'Coffee of the Day', price: 11, quantity: 2 }],
    });
    assertEqual(ordSnap.status, 'Preparing', 'Existing /orders mapping preserved');
    assertEqual(ordSnap.total, 22, 'Existing totalBill mapping preserved');
  });

  // 16. Static architecture, Cloud Function removal, Spark rules proposal, and blueprint checks
  await runTest('16. Customer App removes runtime createPalmMetricOrder / httpsCallable and spark rules enforce Spark security', () => {
    const syncSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/firestoreSync.ts'), 'utf8');
    const checkoutSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CheckoutPage.tsx'), 'utf8');
    const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    const sparkRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.spark.rules'), 'utf8');
    const blueprint = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8'));

    assert(!syncSrc.includes('firebase/functions'), 'firestoreSync.ts must not import firebase/functions');
    assert(!syncSrc.includes('httpsCallable'), 'firestoreSync.ts must not invoke httpsCallable');
    assert(!syncSrc.includes('createPalmMetricOrder'), 'firestoreSync.ts must not invoke createPalmMetricOrder');
    assert(!/setDoc\s*\(\s*doc\s*\(\s*db\s*,\s*['"]orders['"]/.test(syncSrc), 'firestoreSync.ts must not write directly to /orders via setDoc');
    assert(!/addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*['"]orders['"]/.test(syncSrc), 'firestoreSync.ts must not write directly to /orders via addDoc');
    assert(!checkoutSrc.includes('createVerifiedPalmMetricOrder'), 'CheckoutPage.tsx migrated off callable');
    assert(checkoutSrc.includes('submitCustomerOrderRequest'), 'CheckoutPage.tsx uses submitCustomerOrderRequest');
    assert(checkoutSrc.includes('submittingLockRef'), 'CheckoutPage.tsx has synchronous double-click lock');
    assert(appSrc.includes('onRequestSubmitted') && appSrc.includes('onGoToTracker'), 'App.tsx wires request submission callbacks');
    assert(appSrc.includes("activeOrderId.startsWith('req_')"), 'App.tsx avoids subscribing to /orders for req_ IDs');

    // Verify local Spark rules artifact
    assert(sparkRules.includes('match /orderRequests/{requestId}'), 'Spark rules include /orderRequests/{requestId}');
    assert(
      sparkRules.includes('allow create: if isValidId(orderId) && isAdmin() && isValidAdminOrderCreate(incoming(), orderId);'),
      'Spark rules block customers from creating /orders',
    );
    assert(sparkRules.includes("data.status == 'pending_review'"), 'Spark rules lock request create status to pending_review');
    assert(sparkRules.includes("data.orderType == 'pickup'"), 'Spark rules lock request orderType to pickup');
    assert(sparkRules.includes("data.currency == 'SAR'"), 'Spark rules lock request currency to SAR');
    assert(sparkRules.includes('item.quantity is int && item.quantity >= 1 && item.quantity <= 99'), 'Spark rules enforce integer quantity 1..99');
    const reqCreateBlock = sparkRules.match(/function isValidOrderRequestCreate[\s\S]*?\n    \}/)?.[0] ?? '';
    const reqItemBlock = sparkRules.match(/function isValidOrderRequestItem[\s\S]*?\n    \}/)?.[0] ?? '';
    assert(reqCreateBlock.length > 0 && reqItemBlock.length > 0, 'Order request validation functions exist in spark rules');
    assert(!reqCreateBlock.includes('totalBill') && !reqCreateBlock.includes('subtotal'), 'isValidOrderRequestCreate must not allow totalBill/subtotal');
    assert(!reqItemBlock.includes('price') && !reqItemBlock.includes('basePrice'), 'isValidOrderRequestItem must not allow price/basePrice');
    assert('/orderRequests/{requestId}' in blueprint.firestore, 'firebase-blueprint.json documents /orderRequests/{requestId}');
  });

  // 17. Cart-to-OrderRequest mapper excludes prices and preserves customization selections
  await runTest('17. buildOrderRequestItemsFromCart maps selections, temp, and notes without price fields', () => {
    const mapped = buildOrderRequestItemsFromCart([makeFakeCartItem()]);
    assertEqual(mapped.length, 1, 'Maps one cart line');
    assertEqual(mapped[0].itemId, 'v60-ethiopia-hot-cold', 'Preserves itemId');
    assertEqual(mapped[0].quantity, 2, 'Preserves integer quantity');
    assertEqual(mapped[0].temperature, 'Cold', 'Maps cold -> Cold');
    assertEqual(mapped[0].specialInstructions, 'Less ice', 'Maps specialInstructions');
    assertEqual(mapped[0].selectedCustomizations?.[0]?.groupId, 'brew-profile', 'Maps customization groupId');
    assertEqual(mapped[0].selectedCustomizations?.[0]?.optionId, 'slow-drip', 'Maps customization optionId');
    assert(!('price' in mapped[0]), 'Cart mapper omits price');
    assert(!('basePrice' in mapped[0]), 'Cart mapper omits basePrice');
    assert(!('customizationTotal' in mapped[0]), 'Cart mapper omits customizationTotal');
  });

  console.log(`\nStage 04K Test Summary: ${passed} passed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
