import { createHash } from 'node:crypto';
import { computeAuthoritativeItemPricing, halalasToSar, sarToHalalas } from './orderPricing';
import {
  AuthoritativeOrderLineItem,
  AuthoritativeSelectedCustomization,
  CoffeeOptionsDoc,
  CreateOrderRequest,
  CustomizationGroupDoc,
  CustomizationOptionDoc,
  MAX_CUSTOMIZATIONS_PER_ITEM,
  MAX_ITEM_QUANTITY,
  MAX_ORDER_ITEMS,
  MenuCatalogDoc,
  OrderBackendError,
  OrderInputItem,
  ProductCustomizationDoc,
  SUPPORTED_CURRENCY,
} from './types';

export const DEFAULT_BACKEND_COFFEE_OPTIONS: CoffeeOptionsDoc = {
  milkSelectionEnabled: true,
  coconutMilkExtraPrice: 3,
  hotColdSelectionEnabled: true,
};

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_IDEMPOTENCY_REGEX = /^[a-zA-Z0-9_-]{8,128}$/;

const FORBIDDEN_TOP_LEVEL_KEYS = [
  'adminApproved',
  'paymentVerified',
  'completed',
  'internalStatus',
  'adminNotes',
  'refundStatus',
  'pricingVersion',
  'sourceApp',
  'createdAt',
  'updatedAt',
] as const;

const FORBIDDEN_ITEM_KEYS = [
  'adminApproved',
  'discountApproved',
  'overridePrice',
] as const;

const MILK_COMPATIBLE_CATEGORIES = new Set([
  'v60',
  'espresso',
  'matcha',
  'specialty',
  'coffee',
]);

function stripControlChars(input: string): string {
  // Remove non-printable ASCII control chars except basic whitespace before trimming
  return input.replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function isCatalogItemInStock(menu: MenuCatalogDoc): boolean {
  if (menu.outOfStock === true) return false;
  if (typeof menu.inStock === 'boolean') return menu.inStock;
  if (typeof menu.isAvailable === 'boolean') return menu.isAvailable;
  if (typeof menu.available === 'boolean') return menu.available;
  return true;
}

export function inferCatalogItemAllowsMilk(menu: MenuCatalogDoc): boolean {
  if (typeof menu.allowMilkOption === 'boolean') return menu.allowMilkOption;
  const cat = (menu.category || '').trim().toLowerCase();
  return MILK_COMPATIBLE_CATEGORIES.has(cat);
}

export function validateCreateOrderEnvelope(
  rawPayload: unknown,
  authenticatedUid: string,
): { request: CreateOrderRequest; digest: string } {
  const cleanUid = (authenticatedUid || '').trim();
  if (!cleanUid || cleanUid.length > 128) {
    throw new OrderBackendError(
      'unauthenticated',
      'Authentication is required before placing an order.',
      'UNAUTHENTICATED',
    );
  }

  if (!isPlainObject(rawPayload)) {
    throw new OrderBackendError(
      'invalid-argument',
      'Order payload must be a valid JSON object.',
      'INVALID_PAYLOAD',
    );
  }

  for (const key of FORBIDDEN_TOP_LEVEL_KEYS) {
    if (key in rawPayload && rawPayload[key] !== undefined) {
      throw new OrderBackendError(
        'permission-denied',
        `Client is not permitted to supply privileged field "${key}".`,
        'PRIVILEGED_FIELD_FORBIDDEN',
      );
    }
  }

  if ('status' in rawPayload && rawPayload.status !== undefined && rawPayload.status !== 'Pending') {
    throw new OrderBackendError(
      'permission-denied',
      'Orders can only be initialized with status Pending.',
      'STATUS_OVERRIDE_FORBIDDEN',
    );
  }

  if (
    'customerUid' in rawPayload &&
    rawPayload.customerUid !== undefined &&
    rawPayload.customerUid !== cleanUid
  ) {
    throw new OrderBackendError(
      'permission-denied',
      'customerUid mismatch with authenticated session.',
      'UID_MISMATCH',
    );
  }

  if (rawPayload.orderType !== 'pickup') {
    throw new OrderBackendError(
      'invalid-argument',
      'Palm Metric operates pickup-only orders. Invalid orderType.',
      'INVALID_ORDER_TYPE',
    );
  }

  if (
    rawPayload.currency !== undefined &&
    rawPayload.currency !== SUPPORTED_CURRENCY
  ) {
    throw new OrderBackendError(
      'invalid-argument',
      `Unsupported currency. Only ${SUPPORTED_CURRENCY} is accepted.`,
      'INVALID_CURRENCY',
    );
  }

  const rawIdempotencyKey =
    typeof rawPayload.idempotencyKey === 'string'
      ? rawPayload.idempotencyKey.trim()
      : '';
  if (!VALID_IDEMPOTENCY_REGEX.test(rawIdempotencyKey)) {
    throw new OrderBackendError(
      'invalid-argument',
      'Valid idempotencyKey (8-128 alphanumeric/hyphen/underscore chars) is required.',
      'INVALID_IDEMPOTENCY_KEY',
    );
  }

  const customerName =
    typeof rawPayload.customerName === 'string'
      ? stripControlChars(rawPayload.customerName)
      : '';
  if (customerName.length < 1 || customerName.length > 80) {
    throw new OrderBackendError(
      'invalid-argument',
      'Customer name is required (1-80 characters).',
      'INVALID_CUSTOMER_NAME',
    );
  }

  const customerContact =
    typeof rawPayload.customerContact === 'string'
      ? stripControlChars(rawPayload.customerContact)
      : '';
  if (customerContact.length < 4 || customerContact.length > 80) {
    throw new OrderBackendError(
      'invalid-argument',
      'Valid mobile contact (4-80 characters) is required.',
      'INVALID_CUSTOMER_CONTACT',
    );
  }

  let orderNote: string | undefined;
  if (rawPayload.orderNote !== undefined) {
    if (typeof rawPayload.orderNote !== 'string') {
      throw new OrderBackendError(
        'invalid-argument',
        'orderNote must be a string.',
        'INVALID_ORDER_NOTE',
      );
    }
    const cleanNote = stripControlChars(rawPayload.orderNote);
    if (cleanNote.length > 220) {
      throw new OrderBackendError(
        'invalid-argument',
        'Order note cannot exceed 220 characters.',
        'ORDER_NOTE_TOO_LONG',
      );
    }
    orderNote = cleanNote || undefined;
  }

  let lang: 'ar' | 'en' | undefined;
  if (rawPayload.lang !== undefined) {
    if (rawPayload.lang !== 'ar' && rawPayload.lang !== 'en') {
      throw new OrderBackendError(
        'invalid-argument',
        'Language must be ar or en.',
        'INVALID_LANG',
      );
    }
    lang = rawPayload.lang;
  }

  if (!Array.isArray(rawPayload.items)) {
    throw new OrderBackendError(
      'invalid-argument',
      'Order items must be a non-empty array.',
      'INVALID_ITEMS',
    );
  }
  if (rawPayload.items.length < 1 || rawPayload.items.length > MAX_ORDER_ITEMS) {
    throw new OrderBackendError(
      'invalid-argument',
      `Order must contain between 1 and ${MAX_ORDER_ITEMS} line items.`,
      'ITEMS_COUNT_OUT_OF_RANGE',
    );
  }

  const normalizedItems: OrderInputItem[] = rawPayload.items.map((rawItem, idx) => {
    if (!isPlainObject(rawItem)) {
      throw new OrderBackendError(
        'invalid-argument',
        `Order item at index ${idx} is invalid.`,
        'INVALID_ITEM_OBJECT',
      );
    }

    for (const key of FORBIDDEN_ITEM_KEYS) {
      if (key in rawItem && rawItem[key] !== undefined) {
        throw new OrderBackendError(
          'permission-denied',
          `Item field "${key}" is not allowed from client.`,
          'PRIVILEGED_ITEM_FIELD_FORBIDDEN',
        );
      }
    }

    const itemId = typeof rawItem.itemId === 'string' ? rawItem.itemId.trim() : '';
    if (!VALID_ID_REGEX.test(itemId)) {
      throw new OrderBackendError(
        'invalid-argument',
        `Invalid product ID at item index ${idx}.`,
        'INVALID_ITEM_ID',
      );
    }

    const quantity = rawItem.quantity;
    if (
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_ITEM_QUANTITY
    ) {
      throw new OrderBackendError(
        'invalid-argument',
        `Item quantity for ${itemId} must be an integer between 1 and ${MAX_ITEM_QUANTITY}.`,
        'INVALID_QUANTITY',
      );
    }

    let temperature: 'Hot' | 'Cold' | undefined;
    if (rawItem.temperature !== undefined) {
      if (rawItem.temperature !== 'Hot' && rawItem.temperature !== 'Cold') {
        throw new OrderBackendError(
          'invalid-argument',
          `Invalid temperature selection for ${itemId}.`,
          'INVALID_TEMPERATURE',
        );
      }
      temperature = rawItem.temperature;
    }

    let specialInstructions: string | undefined;
    if (rawItem.specialInstructions !== undefined) {
      if (typeof rawItem.specialInstructions !== 'string') {
        throw new OrderBackendError(
          'invalid-argument',
          `specialInstructions for ${itemId} must be a string.`,
          'INVALID_SPECIAL_INSTRUCTIONS',
        );
      }
      const cleanInstructions = stripControlChars(rawItem.specialInstructions);
      if (cleanInstructions.length > 160) {
        throw new OrderBackendError(
          'invalid-argument',
          `Special instructions for ${itemId} cannot exceed 160 characters.`,
          'SPECIAL_INSTRUCTIONS_TOO_LONG',
        );
      }
      specialInstructions = cleanInstructions || undefined;
    }

    let selectedCustomizations: Array<{ groupId: string; optionId: string }> | undefined;
    if (rawItem.selectedCustomizations !== undefined) {
      if (!Array.isArray(rawItem.selectedCustomizations)) {
        throw new OrderBackendError(
          'invalid-argument',
          `selectedCustomizations for ${itemId} must be an array.`,
          'INVALID_CUSTOMIZATIONS_ARRAY',
        );
      }
      if (rawItem.selectedCustomizations.length > MAX_CUSTOMIZATIONS_PER_ITEM) {
        throw new OrderBackendError(
          'invalid-argument',
          `Too many customization selections for ${itemId}.`,
          'TOO_MANY_CUSTOMIZATIONS',
        );
      }

      const seenPairs = new Set<string>();
      const cleanedSelections: Array<{ groupId: string; optionId: string }> = [];

      for (const sel of rawItem.selectedCustomizations) {
        if (!isPlainObject(sel)) {
          throw new OrderBackendError(
            'invalid-argument',
            `Invalid customization entry for ${itemId}.`,
            'INVALID_CUSTOMIZATION_ENTRY',
          );
        }
        const groupId = typeof sel.groupId === 'string' ? sel.groupId.trim() : '';
        const optionId = typeof sel.optionId === 'string' ? sel.optionId.trim() : '';
        if (!groupId || groupId.length > 80 || !optionId || optionId.length > 80) {
          throw new OrderBackendError(
            'invalid-argument',
            `Invalid customization groupId/optionId for ${itemId}.`,
            'INVALID_CUSTOMIZATION_IDS',
          );
        }
        const pairKey = `${groupId}::${optionId}`;
        if (seenPairs.has(pairKey)) {
          throw new OrderBackendError(
            'invalid-argument',
            `Duplicate customization selection (${optionId}) in group ${groupId}.`,
            'DUPLICATE_CUSTOMIZATION',
          );
        }
        seenPairs.add(pairKey);
        cleanedSelections.push({ groupId, optionId });
      }

      if (cleanedSelections.length > 0) {
        selectedCustomizations = cleanedSelections;
      }
    }

    return {
      itemId,
      quantity,
      ...(temperature ? { temperature } : {}),
      ...(specialInstructions ? { specialInstructions } : {}),
      ...(selectedCustomizations ? { selectedCustomizations } : {}),
    };
  });

  const normalizedRequest: CreateOrderRequest = {
    idempotencyKey: rawIdempotencyKey,
    orderType: 'pickup',
    currency: SUPPORTED_CURRENCY,
    ...(lang ? { lang } : {}),
    customerName,
    customerContact,
    ...(orderNote ? { orderNote } : {}),
    items: normalizedItems,
  };

  // Deterministic canonical digest covering authenticated user, customer info, and ordered items
  const digest = computeRequestDigest(cleanUid, normalizedRequest);
  return { request: normalizedRequest, digest };
}

export function computeRequestDigest(
  customerUid: string,
  req: CreateOrderRequest,
): string {
  const canonicalPayload = {
    customerUid,
    orderType: req.orderType,
    currency: req.currency ?? SUPPORTED_CURRENCY,
    customerName: req.customerName,
    customerContact: req.customerContact,
    orderNote: req.orderNote ?? '',
    items: req.items.map((item) => ({
      itemId: item.itemId,
      quantity: item.quantity,
      temperature: item.temperature ?? '',
      specialInstructions: item.specialInstructions ?? '',
      selectedCustomizations: (item.selectedCustomizations ?? [])
        .map((c) => `${c.groupId}:${c.optionId}`)
        .sort(),
    })),
  };

  return createHash('sha256')
    .update(JSON.stringify(canonicalPayload))
    .digest('hex');
}

export function resolveCatalogCustomizationConfig(
  menu: MenuCatalogDoc,
  customizationDoc: ProductCustomizationDoc | null,
  coffeeOptions: CoffeeOptionsDoc = DEFAULT_BACKEND_COFFEE_OPTIONS,
): ProductCustomizationDoc | null {
  if (customizationDoc) {
    return customizationDoc;
  }

  if (!coffeeOptions.milkSelectionEnabled || !inferCatalogItemAllowsMilk(menu)) {
    return null;
  }

  const rawCoconut =
    typeof menu.coconutMilkPrice === 'number' && Number.isFinite(menu.coconutMilkPrice)
      ? menu.coconutMilkPrice
      : coffeeOptions.coconutMilkExtraPrice;
  const coconutHalalas = sarToHalalas(Math.max(0, rawCoconut), 'coconutMilkPrice');
  const coconutSar = halalasToSar(coconutHalalas);

  return {
    productId: menu.id,
    enabled: true,
    schemaVersion: 0,
    allowSpecialInstructions: true,
    groups: [
      {
        id: 'legacy-milk',
        name: 'Milk Selection',
        nameAr: 'اختيار الحليب',
        type: 'single',
        required: false,
        minSelections: 0,
        maxSelections: 1,
        displayOrder: 0,
        enabled: true,
        options: [
          {
            id: 'regular',
            name: 'Regular Milk',
            nameAr: 'حليب عادي',
            additionalPrice: 0,
            enabled: true,
            isDefault: false,
            displayOrder: 0,
          },
          {
            id: 'coconut',
            name: 'Coconut Milk',
            nameAr: 'حليب جوز الهند',
            additionalPrice: coconutSar,
            enabled: true,
            isDefault: false,
            displayOrder: 1,
          },
        ],
      },
    ],
  };
}

function formatCustomSummaryBilingual(
  items: AuthoritativeSelectedCustomization[] | undefined,
): string {
  if (!items || items.length === 0) return '';
  return items
    .map((entry) => {
      const enName = entry.optionName.trim();
      const arName = (entry.optionNameAr || '').trim();
      const namePart =
        arName && enName && arName !== enName ? `${enName} / ${arName}` : enName || arName;
      return entry.additionalPrice > 0
        ? `${namePart} (+${entry.additionalPrice} ﷼)`
        : namePart;
    })
    .join(', ');
}

export function validateAndPriceLineItem(
  itemInput: OrderInputItem,
  menuDoc: MenuCatalogDoc | null,
  customizationDoc: ProductCustomizationDoc | null,
  coffeeOptions: CoffeeOptionsDoc = DEFAULT_BACKEND_COFFEE_OPTIONS,
): {
  lineItem: AuthoritativeOrderLineItem;
  lineTotalHalalas: number;
} {
  if (!menuDoc) {
    throw new OrderBackendError(
      'not-found',
      `Product "${itemInput.itemId}" was not found in the active menu.`,
      'UNKNOWN_PRODUCT',
    );
  }

  if (!isCatalogItemInStock(menuDoc)) {
    throw new OrderBackendError(
      'failed-precondition',
      `Product "${menuDoc.name || itemInput.itemId}" is currently out of stock.`,
      'OUT_OF_STOCK',
    );
  }

  if (typeof menuDoc.price !== 'number' || !Number.isFinite(menuDoc.price) || menuDoc.price < 0) {
    throw new OrderBackendError(
      'failed-precondition',
      `Product "${itemInput.itemId}" has invalid catalog pricing.`,
      'INVALID_CATALOG_PRICE',
    );
  }

  const effectiveConfig = resolveCatalogCustomizationConfig(
    menuDoc,
    customizationDoc,
    coffeeOptions,
  );

  if (
    effectiveConfig &&
    effectiveConfig.allowSpecialInstructions === false &&
    itemInput.specialInstructions
  ) {
    throw new OrderBackendError(
      'invalid-argument',
      `Special instructions are not enabled for "${menuDoc.name || itemInput.itemId}".`,
      'SPECIAL_INSTRUCTIONS_DISABLED',
    );
  }

  const clientSelections = itemInput.selectedCustomizations ?? [];
  const authoritativeSelections: AuthoritativeSelectedCustomization[] = [];

  if (!effectiveConfig || !effectiveConfig.enabled) {
    if (clientSelections.length > 0) {
      throw new OrderBackendError(
        'failed-precondition',
        `Customizations are disabled or unavailable for "${menuDoc.name || itemInput.itemId}".`,
        'CUSTOMIZATIONS_DISABLED',
      );
    }
  } else {
    const groups = Array.isArray(effectiveConfig.groups) ? effectiveConfig.groups : [];
    const groupById = new Map<string, CustomizationGroupDoc>();
    groups.forEach((g) => {
      if (g && typeof g.id === 'string') {
        groupById.set(g.id, g);
      }
    });

    const selectionsByGroup = new Map<string, string[]>();

    for (const sel of clientSelections) {
      const group = groupById.get(sel.groupId);
      if (!group || group.enabled === false) {
        throw new OrderBackendError(
          'failed-precondition',
          `Customization group "${sel.groupId}" is unavailable for "${menuDoc.name || itemInput.itemId}".`,
          'INVALID_OR_DISABLED_GROUP',
        );
      }

      const optionById = new Map<string, CustomizationOptionDoc>();
      (group.options ?? []).forEach((o) => {
        if (o && typeof o.id === 'string') {
          optionById.set(o.id, o);
        }
      });

      const option = optionById.get(sel.optionId);
      if (!option || option.enabled === false) {
        throw new OrderBackendError(
          'failed-precondition',
          `Customization option "${sel.optionId}" is unavailable or disabled.`,
          'INVALID_OR_DISABLED_OPTION',
        );
      }

      const list = selectionsByGroup.get(group.id) ?? [];
      list.push(option.id);
      selectionsByGroup.set(group.id, list);
    }

    // Validate all enabled groups' min/max/required constraints in displayOrder
    const sortedGroups = [...groups].sort(
      (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
    );

    for (const group of sortedGroups) {
      if (group.enabled === false) continue;

      const enabledOptions = (group.options ?? []).filter((o) => o.enabled !== false);
      const chosenIds = selectionsByGroup.get(group.id) ?? [];
      const count = chosenIds.length;

      if (group.required && enabledOptions.length === 0) {
        throw new OrderBackendError(
          'failed-precondition',
          `Required customization group "${group.name}" currently has no enabled options.`,
          'BROKEN_REQUIRED_GROUP',
        );
      }

      const rawMin = Number.isFinite(group.minSelections)
        ? Math.max(0, Math.floor(group.minSelections))
        : 0;
      const min = group.required ? Math.max(1, rawMin) : rawMin;
      const rawMax = Number.isFinite(group.maxSelections)
        ? Math.max(0, Math.floor(group.maxSelections))
        : 0;
      const max =
        group.type === 'single'
          ? 1
          : Math.max(min, rawMax > 0 ? rawMax : Math.max(1, enabledOptions.length));

      if (group.required && count === 0) {
        throw new OrderBackendError(
          'failed-precondition',
          `Required customization group "${group.name}" is missing a selection.`,
          'REQUIRED_GROUP_MISSING',
        );
      }
      if (count < min) {
        throw new OrderBackendError(
          'failed-precondition',
          `Customization group "${group.name}" requires at least ${min} selection(s).`,
          'MIN_SELECTIONS_NOT_MET',
        );
      }
      if (count > max) {
        throw new OrderBackendError(
          'invalid-argument',
          `Customization group "${group.name}" allows at most ${max} selection(s).`,
          'MAX_SELECTIONS_EXCEEDED',
        );
      }

      if (count > 0) {
        const chosenSet = new Set(chosenIds);
        const sortedOpts = [...enabledOptions].sort(
          (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
        );
        for (const opt of sortedOpts) {
          if (!chosenSet.has(opt.id)) continue;
          const optPriceSar = halalasToSar(
            sarToHalalas(opt.additionalPrice ?? 0, `option ${opt.id} additionalPrice`),
          );
          authoritativeSelections.push({
            groupId: group.id,
            groupName: group.name,
            ...(group.nameAr ? { groupNameAr: group.nameAr } : {}),
            optionId: opt.id,
            optionName: opt.name,
            ...(opt.nameAr ? { optionNameAr: opt.nameAr } : {}),
            additionalPrice: optPriceSar,
          });
        }
      }
    }
  }

  const pricing = computeAuthoritativeItemPricing(
    menuDoc.price,
    authoritativeSelections.map((s) => s.additionalPrice),
    itemInput.quantity,
  );

  const selectedCustomizations =
    authoritativeSelections.length > 0 ? authoritativeSelections : undefined;

  const customSummary = formatCustomSummaryBilingual(selectedCustomizations);
  const mergedNote = [
    itemInput.temperature,
    customSummary,
    itemInput.specialInstructions,
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 240);

  // Derive legacy-compatible milk metadata strictly from authoritative selections
  const milkSel = selectedCustomizations?.find(
    (c) =>
      c.groupId === 'legacy-milk' ||
      /milk|حليب/i.test(`${c.groupId} ${c.groupName} ${c.optionName}`),
  );
  let milkOption: 'regular' | 'coconut' | undefined;
  let milkExtraPrice: number | undefined;
  if (milkSel) {
    if (
      milkSel.optionId === 'coconut' ||
      /coconut|جوز\s*الهند/i.test(`${milkSel.optionName} ${milkSel.optionNameAr || ''}`)
    ) {
      milkOption = 'coconut';
      milkExtraPrice = milkSel.additionalPrice;
    } else if (
      milkSel.optionId === 'regular' ||
      /regular|عادي/i.test(`${milkSel.optionName} ${milkSel.optionNameAr || ''}`)
    ) {
      milkOption = 'regular';
      milkExtraPrice = milkSel.additionalPrice;
    }
  }

  const rawImage = typeof menuDoc.imageUrl === 'string' ? menuDoc.imageUrl.trim() : '';
  const safeImageUrl = rawImage.startsWith('data:') ? '' : rawImage.slice(0, 512);
  const itemName = (menuDoc.nameEn || menuDoc.name || itemInput.itemId).trim().slice(0, 120);
  const itemNameAr = menuDoc.nameAr ? menuDoc.nameAr.trim().slice(0, 120) : undefined;

  const lineItem: AuthoritativeOrderLineItem = {
    itemId: itemInput.itemId,
    name: itemName,
    ...(itemNameAr ? { nameAr: itemNameAr } : {}),
    price: pricing.unitPriceSar,
    basePrice: pricing.basePriceSar,
    customizationTotal: pricing.customizationTotalSar,
    quantity: itemInput.quantity,
    ...(selectedCustomizations ? { selectedCustomizations } : {}),
    ...(itemInput.specialInstructions
      ? { specialInstructions: itemInput.specialInstructions }
      : {}),
    note: mergedNote,
    imageUrl: safeImageUrl,
    ...(itemInput.temperature ? { temperature: itemInput.temperature } : {}),
    ...(milkOption ? { milkOption } : {}),
    ...(milkExtraPrice !== undefined ? { milkExtraPrice } : {}),
  };

  return {
    lineItem,
    lineTotalHalalas: pricing.lineTotalHalalas,
  };
}
