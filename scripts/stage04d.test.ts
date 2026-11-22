import { buildBilingualWhatsAppSummary } from '../src/lib/whatsapp';
import { COPY } from '../src/data/i18n';
import {
  CATEGORIES,
  LEGACY_PRODUCT_ID_ALIASES,
  MENU_ITEMS,
  canonicalizeProductId,
} from '../src/data/menu';
import { migrateLegacyCartItems } from '../src/lib/cart';
import {
  DEFAULT_COFFEE_OPTIONS,
  auditCartItemAgainstLiveCatalog,
  buildInitialCustomizationSelections,
  calculateCustomizationPricing,
  formatSelectedCustomizationsDetailedBilingual,
  normalizeCustomizationConfig,
  resolveEffectiveCustomizationConfig,
  resolveItemSupportsTemperature,
  toggleCustomizationOption,
  validateCustomizationSelections,
} from '../src/lib/customization';
import {
  GuestFirebaseAuthUnavailableError,
  buildCallableCreateOrderPayload,
  buildCanonicalOrderPayload,
  computeDeterministicIdempotencyKey,
  mapOrderSnapshot,
} from '../src/lib/firestoreSync';
import { buildCartKey, formatPrice, roundCurrency } from '../src/lib/format';
import type {
  CartItem,
  MenuItem,
  ProductCustomizationConfig,
} from '../src/types';

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

function runTest(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(err);
  }
}

// 1. Product ID alignment & legacy localStorage cart migration
runTest('Product ID alignment covers all 18 Admin IDs + 2 Customer starter IDs', () => {
  const expectedAdminIds = [
    'cotd-small',
    'cotd-large',
    'v60-ethiopia-hot-cold',
    'v60-colombia-hot-cold',
    'v60-yemen-hot-cold',
    'espresso-flat-white',
    'espresso-cappuccino',
    'matcha-palm-regular-milk',
    'matcha-palm-coconut-milk',
    'matcha-iced',
    'specialty-iced-spanish-latte',
    'specialty-iced-white-mocha',
    'cold-hibiscus-small',
    'cold-hibiscus-large',
    'cold-iced-tea-peach',
    'food-palm-muffin',
    'food-cookies',
    'food-golden-crown',
    'food-pudding',
    'food-croissant',
  ];

  assertEqual(CATEGORIES.length, 7, 'Should preserve all 7 menu categories');
  assertEqual(MENU_ITEMS.length, 20, 'Should preserve all 20 starter menu products');

  const ids = new Set(MENU_ITEMS.map((i) => i.id));
  expectedAdminIds.forEach((id) => {
    assert(ids.has(id), `Expected aligned product ID ${id} in MENU_ITEMS`);
  });

  Object.entries(LEGACY_PRODUCT_ID_ALIASES).forEach(([legacyId, canonicalId]) => {
    assertEqual(
      canonicalizeProductId(legacyId),
      canonicalId,
      `Legacy ID ${legacyId} should resolve to ${canonicalId}`,
    );
  });
});

runTest('Legacy localStorage cart items migrate seamlessly to canonical product IDs', () => {
  const legacyCart: CartItem[] = [
    {
      cartKey: 'v60-ethiopia::temp=hot::note=light ice',
      itemId: 'v60-ethiopia',
      name: 'Ethiopia V60',
      price: 20,
      imageUrl: '',
      quantity: 1,
      note: 'light ice',
      temp: 'hot',
    },
    {
      cartKey: 'esp-flat-white::note=',
      itemId: 'esp-flat-white',
      name: 'Flat White',
      price: 16,
      imageUrl: '',
      quantity: 2,
      note: '',
    },
  ];

  const migrated = migrateLegacyCartItems(legacyCart);
  assertEqual(migrated.length, 2, 'Two migrated items kept');
  assertEqual(migrated[0].itemId, 'v60-ethiopia-hot-cold', 'V60 Ethiopia migrated');
  assert(
    migrated[0].cartKey.startsWith('v60-ethiopia-hot-cold::'),
    'Migrated cartKey rebuilt with canonical ID',
  );
  assertEqual(migrated[1].itemId, 'espresso-flat-white', 'Flat White migrated');
});

// 2. Guest Authentication & Fail-Closed UID Enforcement
runTest('Canonical order builder rejects missing/fake UID with GuestFirebaseAuthUnavailableError', () => {
  let caught: unknown = null;
  try {
    buildCanonicalOrderPayload(
      {
        orderType: 'pickup',
        customerName: 'Guest Tester',
        customerPhone: '0551234567',
        items: [{ itemId: 'cotd-small', name: 'Coffee of the Day - Small', price: 9, quantity: 1, note: '', imageUrl: '' }],
        total: 9,
      },
      '   ',
      'PM-1001',
    );
  } catch (err) {
    caught = err;
  }
  assert(
    caught instanceof GuestFirebaseAuthUnavailableError,
    'Empty UID must throw GuestFirebaseAuthUnavailableError so no unauthenticated guest_ ID is sent to Firestore',
  );
});

// 3. Canonical Order Schema & Bounds
runTest('Canonical order payload uses exact Admin-compatible schema & recomputes totalBill', () => {
  const payload = buildCanonicalOrderPayload(
    {
      orderType: 'pickup',
      customerName: '  Noura Al-Qahtani  ',
      customerPhone: ' 0501112233 ',
      orderNote: 'Arriving in 10 minutes',
      items: [
        {
          itemId: 'v60-ethiopia-hot-cold',
          name: 'Ethiopia V60',
          nameAr: 'في ٦٠ إثيوبيا',
          price: 23.15,
          basePrice: 20,
          customizationTotal: 3.15,
          quantity: 2,
          temperature: 'Cold',
          selectedCustomizations: [
            {
              groupId: 'brew-style',
              groupName: 'Brew Profile',
              groupNameAr: 'أسلوب التحضير',
              optionId: 'fruity-drop',
              optionName: 'Cold Bloom',
              optionNameAr: 'تقطير بارد',
              additionalPrice: 3.15,
            },
          ],
          specialInstructions: 'Extra clarity',
          note: 'Cold · Cold Bloom / تقطير بارد (+3.15 ﷼) · Extra clarity',
          imageUrl: '',
        },
      ],
      total: 99999, // forged/tampered total must be ignored in payload recomputation
      lang: 'ar',
    },
    'anon_uid_abc123',
    'PM-4829',
  );

  const allowedKeys = new Set([
    'orderNumber',
    'customerUid',
    'customerName',
    'customerContact',
    'items',
    'totalBill',
    'status',
    'notes',
  ]);

  Object.keys(payload).forEach((k) => {
    assert(allowedKeys.has(k), `Unexpected top-level key in canonical order payload: ${k}`);
  });

  assertEqual(payload.orderNumber, 'PM-4829', 'Order number matches');
  assertEqual(payload.customerUid, 'anon_uid_abc123', 'Real Firebase UID preserved');
  assertEqual(payload.customerName, 'Noura Al-Qahtani', 'Customer name trimmed');
  assertEqual(payload.customerContact, '0501112233', 'customerContact matches trimmed phone');
  assertEqual(payload.status, 'Pending', 'Status defaults strictly to Pending');
  assertEqual(payload.totalBill, 46.3, 'totalBill recomputed from sanitized line items (2 * 23.15 = 46.3)');
  assert(
    payload.notes.startsWith('Pickup · Arriving in 10 minutes'),
    'Pickup indicator prefixed into notes cleanly',
  );
  assertEqual(payload.items[0].temperature, 'Cold', 'Line item preserves temperature');
  assert(
    Array.isArray(payload.items[0].selectedCustomizations),
    'Line item preserves structured selectedCustomizations',
  );
});

// 4. Historical Order Reading Compatibility
runTest('mapOrderSnapshot reads both legacy delivery/total/customerPhone and canonical pickup/totalBill/customerContact orders', () => {
  const legacyOrder = mapOrderSnapshot('ord_legacy_1', {
    orderNumber: 'PM-0912',
    orderType: 'delivery',
    customerName: 'Tariq',
    customerPhone: '0550001122',
    deliveryLocation: 'Olaya St, Riyadh',
    mapsLink: 'https://maps.google.com/?q=24.7136,46.6753',
    orderNote: 'Ring bell',
    items: [
      {
        itemId: 'esp-flat-white',
        name: 'Flat White',
        price: 19,
        quantity: 1,
        temperature: 'Hot',
        milkOption: 'coconut',
        milkExtraPrice: 3,
      },
    ],
    total: 19,
    status: 'Completed',
  });

  assertEqual(legacyOrder.orderType, 'delivery', 'Historical delivery order stays delivery');
  assertEqual(legacyOrder.customerPhone, '0550001122', 'Reads legacy customerPhone');
  assertEqual(legacyOrder.total, 19, 'Reads legacy total');
  assertEqual(legacyOrder.orderNote, 'Ring bell', 'Reads legacy orderNote');
  assert(
    legacyOrder.items[0].note.includes('Coconut Milk (+3'),
    'Synthesizes readable summary from legacy milkOption fields',
  );

  const canonicalPickupOrder = mapOrderSnapshot('ord_new_2', {
    orderNumber: 'PM-7712',
    customerUid: 'uid_xyz',
    customerName: 'Salma',
    customerContact: '0549998877',
    notes: 'Pickup · At counter',
    items: [
      {
        itemId: 'espresso-flat-white',
        name: 'Flat White',
        price: 16,
        quantity: 1,
      },
    ],
    totalBill: 16,
    status: 'Ready',
  });

  assertEqual(canonicalPickupOrder.orderType, 'pickup', 'Canonical order without delivery fields resolves to pickup');
  assertEqual(canonicalPickupOrder.customerPhone, '0549998877', 'Reads canonical customerContact');
  assertEqual(canonicalPickupOrder.total, 16, 'Reads canonical totalBill');
  assertEqual(canonicalPickupOrder.orderNote, 'At counter', 'Unwraps Pickup · prefix for display');
  assertEqual(canonicalPickupOrder.status, 'Ready', 'Preserves Ready status');
});

// 5. Customization Rules, Authoritative Precedence, Temp Dedup, Live Catalog Audit
runTest('Authoritative productCustomizations precedence vs settings/coffeeOptions fallback + temp dedup', () => {
  const flatWhite: MenuItem = {
    id: 'espresso-flat-white',
    name: 'Flat White',
    nameAr: 'فلات وايت',
    nameEn: 'Flat White',
    description: '',
    price: 16,
    category: 'Espresso',
    imageUrl: '',
    inStock: true,
    supportsTemp: false,
  };

  // Case A: No productCustomizations doc -> synthesizes legacy-milk from settings/coffeeOptions
  const fallbackCfg = resolveEffectiveCustomizationConfig(flatWhite, null, false, {
    milkSelectionEnabled: true,
    coconutMilkExtraPrice: 4,
    hotColdSelectionEnabled: true,
  });
  assert(fallbackCfg !== null, 'Fallback config synthesized when no Firestore doc exists');
  assertEqual(
    fallbackCfg?.groups[0].options[1].additionalPrice,
    4,
    'Coconut milk surcharge honors settings/coffeeOptions.coconutMilkExtraPrice',
  );

  // Case B: Firestore doc exists with enabled: false -> authoritative (NO fallback milk shown!)
  const disabledDocCfg: ProductCustomizationConfig = {
    productId: 'espresso-flat-white',
    enabled: false,
    schemaVersion: 1,
    groups: [],
  };
  const resolvedAuthoritative = resolveEffectiveCustomizationConfig(
    flatWhite,
    disabledDocCfg,
    true,
    DEFAULT_COFFEE_OPTIONS,
  );
  assertEqual(
    resolvedAuthoritative?.enabled,
    false,
    'When productCustomizations/{id} exists with enabled:false, it overrides coffeeOptions fallback',
  );

  // Temperature dedup when custom Temperature group exists
  const v60Item: MenuItem = {
    ...flatWhite,
    id: 'v60-ethiopia-hot-cold',
    category: 'V60',
    supportsTemp: true,
  };
  const customWithTempGroup = normalizeCustomizationConfig('v60-ethiopia-hot-cold', {
    productId: 'v60-ethiopia-hot-cold',
    enabled: true,
    schemaVersion: 1,
    groups: [
      {
        id: 'temp',
        name: 'Temperature',
        nameAr: 'درجة الحرارة',
        type: 'single',
        required: true,
        minSelections: 1,
        maxSelections: 1,
        displayOrder: 0,
        enabled: true,
        options: [
          { id: 'hot', name: 'Hot', nameAr: 'حار', additionalPrice: 0, enabled: true, displayOrder: 0 },
          { id: 'cold', name: 'Cold', nameAr: 'بارد', additionalPrice: 0, enabled: true, displayOrder: 1 },
        ],
      },
    ],
  });

  assertEqual(
    resolveItemSupportsTemperature(v60Item, customWithTempGroup?.groups ?? [], DEFAULT_COFFEE_OPTIONS),
    false,
    'Builtin Hot/Cold toggle is suppressed when Admin configured a Temperature customization group',
  );
  assertEqual(
    resolveItemSupportsTemperature(v60Item, [], { ...DEFAULT_COFFEE_OPTIONS, hotColdSelectionEnabled: false }),
    false,
    'Builtin Hot/Cold toggle hides when settings/coffeeOptions.hotColdSelectionEnabled is false',
  );
});

runTest('Customization selection validation, disabled option exclusion, & live price audit', () => {
  const cfg = normalizeCustomizationConfig('matcha-iced', {
    productId: 'matcha-iced',
    enabled: true,
    schemaVersion: 1,
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
          { id: 'oat', name: 'Oat Milk', nameAr: 'حليب الشوفان', additionalPrice: 4, enabled: true, isDefault: true, displayOrder: 0 },
          { id: 'almond', name: 'Almond Milk', nameAr: 'حليب اللوز', additionalPrice: 3.5, enabled: false, isDefault: false, displayOrder: 1 },
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
          { id: 'shot', name: 'Extra Shot', nameAr: 'شوت إضافي', additionalPrice: 5.25, enabled: true, displayOrder: 0 },
          { id: 'honey', name: 'Honey', nameAr: 'عسل', additionalPrice: 2.1, enabled: true, displayOrder: 1 },
          { id: 'syrup', name: 'Vanilla Syrup', nameAr: 'فانيليا', additionalPrice: 2.5, enabled: true, displayOrder: 2 },
        ],
      },
    ],
  });

  assert(cfg !== null, 'Config normalized');
  let sel = buildInitialCustomizationSelections(cfg!.groups);
  assertEqual(sel.milk[0], 'oat', 'Default option pre-selected');

  // Attempt to toggle disabled option 'almond' -> ignored
  const afterDisabledToggle = toggleCustomizationOption(cfg!.groups, sel, 'milk', 'almond');
  assertEqual(afterDisabledToggle.next.milk[0], 'oat', 'Disabled option cannot be selected');

  // Toggle 3 multi-select options when maxSelections=2
  sel = toggleCustomizationOption(cfg!.groups, sel, 'toppings', 'shot').next;
  sel = toggleCustomizationOption(cfg!.groups, sel, 'toppings', 'honey').next;
  const thirdAttempt = toggleCustomizationOption(cfg!.groups, sel, 'toppings', 'syrup');
  assertEqual(thirdAttempt.maxReached, true, 'Enforces maxSelections limit of 2');

  const val = validateCustomizationSelections(cfg, thirdAttempt.next);
  assertEqual(val.valid, true, 'Valid required + optional selection passes');

  const pricing = calculateCustomizationPricing(18, cfg, thirdAttempt.next);
  assertEqual(pricing.optionsTotal, 11.35, '4 + 5.25 + 2.1 = 11.35 SAR');
  assertEqual(pricing.unitPrice, 29.35, '18 + 11.35 = 29.35 SAR');

  // Audit cart item when menu price increased from 18 -> 20
  const cartItem: CartItem = {
    cartKey: buildCartKey('matcha-iced', '', undefined, pricing.selectedItems),
    itemId: 'matcha-iced',
    name: 'Iced Matcha',
    price: pricing.unitPrice,
    basePrice: 18,
    customizationTotal: pricing.optionsTotal,
    customizations: pricing.selectedItems,
    imageUrl: '',
    quantity: 2,
    note: '',
  };

  const liveMenuItem: MenuItem = {
    id: 'matcha-iced',
    name: 'Iced Matcha',
    description: '',
    price: 20,
    category: 'Matcha',
    imageUrl: '',
    inStock: true,
    supportsTemp: false,
  };

  const audit = auditCartItemAgainstLiveCatalog(cartItem, liveMenuItem, cfg, true);
  assertEqual(audit.status, 'review_required', 'Price change flags review_required');
  assertEqual(audit.expectedUnitPrice, 31.35, 'Expected unit price updates to 20 + 11.35 = 31.35');
  assertEqual(audit.reasons[0].code, 'price_changed', 'Reason is price_changed');
});

// 6. Floating-point SAR Precision & Cart Key Uniqueness
runTest('SAR currency rounding prevents IEEE-754 drift & buildCartKey separates distinct variants', () => {
  assertEqual(roundCurrency(0.1 + 0.2), 0.3, '0.1 + 0.2 rounds cleanly to 0.30');
  assertEqual(formatPrice(18.0), '18', 'Whole SAR values format cleanly without trailing .00');
  assertEqual(formatPrice(18.5), '18.50', 'Fractional SAR formats with 2 decimals');

  const keyA = buildCartKey('v60-ethiopia-hot-cold', '', 'hot', [
    { groupId: 'milk', optionId: 'oat' },
  ]);
  const keyB = buildCartKey('v60-ethiopia-hot-cold', '', 'cold', [
    { groupId: 'milk', optionId: 'oat' },
  ]);
  const keyC = buildCartKey('v60-ethiopia-hot-cold', 'extra hot', 'hot', [
    { groupId: 'milk', optionId: 'oat' },
  ]);
  assert(keyA !== keyB && keyA !== keyC && keyB !== keyC, 'Cart keys separate temp & notes unambiguously');
});

// 7. WhatsApp Bilingual Pickup Summary
runTest('WhatsApp pickup summary outputs product, qty, groups, options, prices, instructions, total & pickup text', () => {
  const url = buildBilingualWhatsAppSummary({
    orderNumber: 'PM-5544',
    orderId: 'order_doc_123',
    orderType: 'pickup',
    customerName: 'Khalid',
    customerPhone: '0501234567',
    orderNote: 'On my way',
    total: 24.5,
    items: [
      {
        cartKey: 'test',
        itemId: 'v60-colombia-hot-cold',
        name: 'Colombia V60',
        nameEn: 'Colombia V60',
        nameAr: 'في ٦٠ كولومبيا',
        price: 24.5,
        imageUrl: '',
        quantity: 1,
        note: 'High bloom',
        temp: 'hot',
        customizations: [
          {
            groupId: 'size',
            groupName: 'Cup Size',
            groupNameAr: 'الحجم',
            optionId: 'large',
            optionName: 'Large',
            optionNameAr: 'كبير',
            additionalPrice: 4.5,
          },
          {
            groupId: 'milk',
            groupName: 'Milk',
            groupNameAr: 'الحليب',
            optionId: 'regular',
            optionName: 'Regular Milk',
            optionNameAr: 'حليب عادي',
            additionalPrice: 0,
          },
        ],
      },
    ],
  });

  const decoded = decodeURIComponent(url.split('text=')[1] || '');
  assert(decoded.includes('Pickup | استلام من الفرع'), 'Includes Pickup order type header');
  assert(decoded.includes('Colombia V60 / في ٦٠ كولومبيا'), 'Includes bilingual product title');
  assert(decoded.includes('Cup Size / الحجم: Large / كبير (+4.50 ﷼)'), 'Includes group EN/AR + option EN/AR + surcharge');
  assert(decoded.includes('Milk / الحليب: Regular Milk / حليب عادي (+0 ﷼)'), 'Includes +0 SAR explicit price');
  assert(decoded.includes('High bloom'), 'Includes item special instructions');
  assert(decoded.includes('Pay upon pickup at branch'), 'Includes pickup payment badge');
  assert(!decoded.toLowerCase().includes('cash on delivery'), 'Does NOT include delivery wording');

  const lines = formatSelectedCustomizationsDetailedBilingual(undefined);
  assertEqual(lines.length, 0, 'Empty customization details produce empty array');
});

// 8. Bilingual AR & EN Dictionary Integrity
runTest('Arabic and English i18n dictionaries contain all Stage 04D keys without empties', () => {
  const keys = Object.keys(COPY.en) as Array<keyof typeof COPY.en>;
  keys.forEach((key) => {
    assert(
      typeof COPY.ar[key] === 'string' && COPY.ar[key].trim().length > 0,
      `Arabic translation non-empty for key: ${key}`,
    );
    assert(
      typeof COPY.en[key] === 'string' && COPY.en[key].trim().length > 0,
      `English translation non-empty for key: ${key}`,
    );
  });
});

// 9. Stage 04E Client Callable Payload & Idempotency Key Integrity
runTest('Stage 04E callable payload omits client money overrides and computes deterministic idempotency keys', () => {
  const keyA = computeDeterministicIdempotencyKey('cartA|0501234567', 'attempt1');
  const keyB = computeDeterministicIdempotencyKey('cartA|0501234567', 'attempt1');
  const keyC = computeDeterministicIdempotencyKey('cartB|0501234567', 'attempt1');
  assertEqual(keyA, keyB, 'Identical checkout fingerprint + nonce yields deterministic idempotencyKey');
  assert(keyA !== keyC, 'Changed cart fingerprint produces distinct idempotencyKey');
  assert(/^[a-zA-Z0-9_-]{8,128}$/.test(keyA), 'Idempotency key satisfies backend regex constraints');

  const payload = buildCallableCreateOrderPayload({
    idempotencyKey: keyA,
    orderType: 'pickup',
    customerName: 'Noura',
    customerPhone: '0501234567',
    orderNote: 'Arriving soon',
    total: 9999,
    lang: 'en',
    items: [
      {
        itemId: 'v60-ethiopia', // legacy alias should canonicalize cleanly
        name: 'Ethiopia V60',
        price: 0.01, // must NOT be forwarded in callable payload
        quantity: 2,
        temperature: 'Hot',
        specialInstructions: 'Clean cup',
        note: 'ignored',
        imageUrl: '',
        selectedCustomizations: [
          {
            groupId: 'brew-style',
            groupName: 'Brew Style',
            optionId: 'fruity',
            optionName: 'Fruity',
            additionalPrice: 0.01,
          },
        ],
      },
    ],
  });

  assertEqual(payload.orderType, 'pickup', 'Pickup-only enforced');
  assertEqual(payload.currency, 'SAR', 'SAR enforced');
  assertEqual(payload.items[0].itemId, 'v60-ethiopia-hot-cold', 'Legacy ID canonicalized for backend');
  assert(!('price' in payload.items[0]), 'Client unit price is omitted from callable payload');
  assert(!('total' in payload) && !('totalBill' in payload), 'Client total is omitted from callable payload');
  assertEqual(payload.items[0].selectedCustomizations?.[0]?.groupId, 'brew-style', 'Forwards groupId');
  assert(
    !('additionalPrice' in (payload.items[0].selectedCustomizations?.[0] ?? {})),
    'Client option price omitted from callable selection payload',
  );
});

runTest('Stage 04E WhatsApp builder formats directly from server-verified OrderLineItem[]', () => {
  const verifiedUrl = buildBilingualWhatsAppSummary({
    orderNumber: 'PM-991100',
    orderId: 'srv_order_xyz',
    orderType: 'pickup',
    customerName: 'Fahad',
    customerPhone: '0551234567',
    total: 27.3,
    items: [
      {
        itemId: 'matcha-iced',
        name: 'Iced Matcha',
        nameAr: 'ماتشا مثلجة',
        price: 27.3,
        basePrice: 18,
        customizationTotal: 9.3,
        quantity: 1,
        selectedCustomizations: [
          {
            groupId: 'milk',
            groupName: 'Milk Type',
            groupNameAr: 'نوع الحليب',
            optionId: 'oat',
            optionName: 'Oat Milk',
            optionNameAr: 'حليب الشوفان',
            additionalPrice: 4.1,
          },
          {
            groupId: 'toppings',
            groupName: 'Add-ons',
            groupNameAr: 'الإضافات',
            optionId: 'shot',
            optionName: 'Extra Shot',
            optionNameAr: 'شوت إضافي',
            additionalPrice: 5.2,
          },
        ],
        specialInstructions: 'Less ice',
        note: 'Oat Milk · Extra Shot',
        imageUrl: '',
      },
    ],
  });

  const decoded = decodeURIComponent(verifiedUrl.split('text=')[1] || '');
  assert(decoded.includes('PM-991100 (srv_order_xyz)'), 'Contains server order number & ID');
  assert(decoded.includes('Oat Milk / حليب الشوفان (+4.10 ﷼)'), 'Shows authoritative oat milk surcharge');
  assert(decoded.includes('Extra Shot / شوت إضافي (+5.20 ﷼)'), 'Shows authoritative extra shot surcharge');
  assert(decoded.includes('*Total / الإجمالي:* 27.30 ﷼'), 'Shows authoritative server totalBill');
  assert(decoded.includes('Less ice'), 'Preserves special instructions from verified OrderLineItem');
});

console.log(`\nStage 04D/04E Client Test Summary: ${passed} passed, ${failed} failed.`);
const nodeProc = (globalThis as { process?: { exit?: (code: number) => void } }).process;
if (failed > 0) {
  nodeProc?.exit?.(1);
  throw new Error(`${failed} Stage 04D/04E tests failed.`);
}
nodeProc?.exit?.(0);

