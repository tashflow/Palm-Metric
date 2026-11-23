import type {
  CoffeeOptionsSettings,
  CustomizationGroup,
  CustomizationOption,
  OrderRequest,
  OrderRequestCustomizationSelection,
  OrderRequestItem,
  ProductCustomizationConfig,
  SelectedCustomizationItem,
  VerifiedPricingBreakdown,
  VerifiedPricingLineItem,
} from '../types';
import { AdminApprovalError, type AdminActor } from './adminAuth';
import { DEFAULT_COFFEE_OPTIONS } from './customization';

export const HALALAS_PER_SAR = 100;
export const MAX_AMOUNT_SAR = 100000;
export const MAX_CUSTOMIZATION_OPTION_PRICE_SAR = 5000;
export const MAX_AMOUNT_HALALAS = MAX_AMOUNT_SAR * HALALAS_PER_SAR;
export const MAX_OPTION_PRICE_HALALAS =
  MAX_CUSTOMIZATION_OPTION_PRICE_SAR * HALALAS_PER_SAR;
export const STAGE_04L_PRICING_VERSION = 2;

const MILK_COMPATIBLE_CATEGORIES = new Set([
  'v60',
  'espresso',
  'matcha',
  'specialty',
  'coffee',
]);

export interface AuthoritativeMenuRecord {
  id: string;
  name?: string;
  nameEn?: string;
  nameAr?: string;
  category?: string;
  price?: unknown;
  inStock?: unknown;
  isAvailable?: unknown;
  available?: unknown;
  outOfStock?: unknown;
  stockQuantity?: unknown;
  stockCount?: unknown;
  allowMilkOption?: unknown;
  coconutMilkPrice?: unknown;
  allowTemperature?: unknown;
  supportsTemp?: unknown;
  imageUrl?: unknown;
}

export interface AuthoritativeCatalogLookup {
  getMenuDoc: (itemId: string) => AuthoritativeMenuRecord | null | undefined;
  getCustomizationDoc: (itemId: string) => ProductCustomizationConfig | null | undefined;
  coffeeOptions?: CoffeeOptionsSettings | null;
}

export interface PricingVerificationIssue {
  itemIndex: number;
  itemId: string;
  code: string;
  message: string;
}

export interface RequestPricingInspectionResult {
  canApprove: boolean;
  issues: PricingVerificationIssue[];
  breakdown: VerifiedPricingBreakdown | null;
}

export function sarToHalalas(
  rawAmount: unknown,
  fieldName = 'price',
  maxHalalas = MAX_AMOUNT_HALALAS,
): number {
  if (typeof rawAmount !== 'number' || !Number.isFinite(rawAmount)) {
    throw new AdminApprovalError(
      'failed-precondition',
      `Invalid numeric catalog value for ${fieldName}.`,
      'INVALID_CATALOG_PRICE',
    );
  }
  if (rawAmount < 0) {
    throw new AdminApprovalError(
      'failed-precondition',
      `Negative ${fieldName} is not allowed in catalog pricing.`,
      'NEGATIVE_CATALOG_PRICE',
    );
  }
  const halalas = Math.round(rawAmount * HALALAS_PER_SAR);
  if (halalas > maxHalalas) {
    throw new AdminApprovalError(
      'failed-precondition',
      `Catalog ${fieldName} exceeds maximum permitted bound.`,
      'PRICE_OVERFLOW',
    );
  }
  return halalas;
}

export function halalasToSar(halalas: number): number {
  if (!Number.isFinite(halalas)) {
    throw new AdminApprovalError(
      'internal',
      'Monetary calculation overflow.',
      'MONETARY_OVERFLOW',
    );
  }
  return Math.round(halalas) / HALALAS_PER_SAR;
}

export interface ManagedNumericStockState {
  hasManagedStock: boolean;
  hasStockQuantityField: boolean;
  hasStockCountField: boolean;
  availableQuantity?: number;
}

export function extractManagedNumericStock(
  menuDoc: AuthoritativeMenuRecord,
): ManagedNumericStockState {
  const hasStockQuantityField = typeof menuDoc.stockQuantity === 'number';
  const hasStockCountField = typeof menuDoc.stockCount === 'number';

  if (!hasStockQuantityField && !hasStockCountField) {
    return {
      hasManagedStock: false,
      hasStockQuantityField: false,
      hasStockCountField: false,
    };
  }

  const candidates: number[] = [];
  if (hasStockQuantityField) candidates.push(menuDoc.stockQuantity as number);
  if (hasStockCountField) candidates.push(menuDoc.stockCount as number);

  if (candidates.some((v) => !Number.isFinite(v))) {
    return {
      hasManagedStock: true,
      hasStockQuantityField,
      hasStockCountField,
      availableQuantity: 0,
    };
  }

  return {
    hasManagedStock: true,
    hasStockQuantityField,
    hasStockCountField,
    availableQuantity: Math.min(...candidates),
  };
}

export function aggregateRequestedQuantitiesByItem(
  items: OrderRequestItem[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    const cleanId = typeof item.itemId === 'string' ? item.itemId.trim() : '';
    if (!cleanId) continue;
    const qty =
      typeof item.quantity === 'number' && Number.isInteger(item.quantity) && item.quantity > 0
        ? item.quantity
        : 0;
    if (qty > 0) {
      totals.set(cleanId, (totals.get(cleanId) ?? 0) + qty);
    }
  }
  return totals;
}

export interface StockDeductionPlan {
  itemId: string;
  deductedQuantity: number;
  previousStock: number;
  remainingStock: number;
  updatesStockQuantity: boolean;
  updatesStockCount: boolean;
}

export function computeStockDeductionPlans(
  items: OrderRequestItem[],
  catalog: AuthoritativeCatalogLookup,
): StockDeductionPlan[] {
  const totals = aggregateRequestedQuantitiesByItem(items);
  const plans: StockDeductionPlan[] = [];

  for (const [itemId, totalRequested] of totals.entries()) {
    const menuDoc = catalog.getMenuDoc(itemId);
    if (!menuDoc) {
      throw new AdminApprovalError(
        'not-found',
        `Product "${itemId}" was not found in the active Firestore catalog.`,
        'UNKNOWN_PRODUCT',
      );
    }

    const stockCheck = isAuthoritativeMenuItemAvailable(menuDoc, totalRequested);
    if (!stockCheck.available) {
      throw new AdminApprovalError(
        'failed-precondition',
        stockCheck.reason || `Product "${itemId}" is unavailable.`,
        stockCheck.reasonCode || 'OUT_OF_STOCK',
      );
    }

    const managed = extractManagedNumericStock(menuDoc);
    if (!managed.hasManagedStock || managed.availableQuantity === undefined) {
      // Do NOT invent inventory tracking for products without numeric stock fields.
      continue;
    }

    if (!Number.isInteger(managed.availableQuantity) || managed.availableQuantity < totalRequested) {
      throw new AdminApprovalError(
        'failed-precondition',
        `Requested total quantity (${totalRequested}) exceeds remaining inventory (${managed.availableQuantity}) for "${menuDoc.name || itemId}".`,
        managed.availableQuantity <= 0 ? 'OUT_OF_STOCK' : 'INSUFFICIENT_STOCK',
      );
    }

    const remainingStock = managed.availableQuantity - totalRequested;
    plans.push({
      itemId,
      deductedQuantity: totalRequested,
      previousStock: managed.availableQuantity,
      remainingStock,
      updatesStockQuantity: managed.hasStockQuantityField,
      updatesStockCount: managed.hasStockCountField,
    });
  }

  return plans;
}

export function isAuthoritativeMenuItemAvailable(
  menuDoc: AuthoritativeMenuRecord,
  requestedQuantity = 1,
): { available: boolean; reasonCode?: string; reason?: string } {
  if (menuDoc.outOfStock === true) {
    return {
      available: false,
      reasonCode: 'OUT_OF_STOCK',
      reason: `Product "${menuDoc.name || menuDoc.id}" is marked out of stock.`,
    };
  }
  if (
    menuDoc.inStock === false ||
    menuDoc.isAvailable === false ||
    menuDoc.available === false
  ) {
    return {
      available: false,
      reasonCode: 'OUT_OF_STOCK',
      reason: `Product "${menuDoc.name || menuDoc.id}" is currently unavailable.`,
    };
  }

  const managed = extractManagedNumericStock(menuDoc);
  if (managed.hasManagedStock) {
    const numericStock = managed.availableQuantity;
    if (numericStock === undefined || !Number.isFinite(numericStock) || numericStock <= 0) {
      return {
        available: false,
        reasonCode: 'OUT_OF_STOCK',
        reason: `Product "${menuDoc.name || menuDoc.id}" has zero remaining stock.`,
      };
    }
    if (!Number.isInteger(numericStock) || numericStock < requestedQuantity) {
      return {
        available: false,
        reasonCode: 'INSUFFICIENT_STOCK',
        reason: `Requested quantity (${requestedQuantity}) exceeds available stock (${numericStock}) for "${menuDoc.name || menuDoc.id}".`,
      };
    }
  }

  return { available: true };
}

function inferMenuAllowsMilk(menuDoc: AuthoritativeMenuRecord): boolean {
  if (typeof menuDoc.allowMilkOption === 'boolean') return menuDoc.allowMilkOption;
  const cat = String(menuDoc.category ?? '').trim().toLowerCase();
  return MILK_COMPATIBLE_CATEGORIES.has(cat);
}

export function resolveAuthoritativeCustomizationConfig(
  menuDoc: AuthoritativeMenuRecord,
  customizationDoc: ProductCustomizationConfig | null | undefined,
  coffeeOptions: CoffeeOptionsSettings = DEFAULT_COFFEE_OPTIONS,
): ProductCustomizationConfig | null {
  if (customizationDoc) {
    return customizationDoc;
  }

  if (!coffeeOptions.milkSelectionEnabled || !inferMenuAllowsMilk(menuDoc)) {
    return null;
  }

  const rawCoconut =
    typeof menuDoc.coconutMilkPrice === 'number' && Number.isFinite(menuDoc.coconutMilkPrice)
      ? menuDoc.coconutMilkPrice
      : coffeeOptions.coconutMilkExtraPrice;
  const coconutSar = halalasToSar(
    sarToHalalas(Math.max(0, rawCoconut), 'coconutMilkPrice', MAX_OPTION_PRICE_HALALAS),
  );

  return {
    productId: menuDoc.id,
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

function formatCustomSummaryBilingual(items: SelectedCustomizationItem[] | undefined): string {
  if (!items || items.length === 0) return '';
  return items
    .map((entry) => {
      const enName = entry.optionName.trim();
      const arName = (entry.optionNameAr || '').trim();
      const namePart =
        arName && enName && arName !== enName ? `${enName} / ${arName}` : enName || arName;
      return entry.additionalPrice > 0 ? `${namePart} (+${entry.additionalPrice} ﷼)` : namePart;
    })
    .join(', ');
}

function isSizeGroup(group: CustomizationGroup): boolean {
  return (
    /^(size|cup[-_]?size)$/i.test(group.id.trim()) ||
    /size|حجم/i.test(`${group.id} ${group.name} ${group.nameAr ?? ''}`)
  );
}

export function validateAndPriceOrderRequestItem(
  item: OrderRequestItem,
  menuDoc: AuthoritativeMenuRecord | null | undefined,
  customizationDoc: ProductCustomizationConfig | null | undefined,
  coffeeOptions: CoffeeOptionsSettings = DEFAULT_COFFEE_OPTIONS,
): {
  lineItem: VerifiedPricingLineItem;
  lineTotalHalalas: number;
} {
  const itemId = typeof item.itemId === 'string' ? item.itemId.trim() : '';
  if (!itemId) {
    throw new AdminApprovalError('invalid-argument', 'Order item is missing itemId.', 'INVALID_ITEM_ID');
  }

  if (
    typeof item.quantity !== 'number' ||
    !Number.isInteger(item.quantity) ||
    item.quantity < 1 ||
    item.quantity > 99
  ) {
    throw new AdminApprovalError(
      'invalid-argument',
      `Item quantity for "${itemId}" must be a whole number between 1 and 99.`,
      'INVALID_QUANTITY',
    );
  }

  if (!menuDoc) {
    throw new AdminApprovalError(
      'not-found',
      `Product "${itemId}" was not found in the active Firestore catalog.`,
      'UNKNOWN_PRODUCT',
    );
  }

  const stockCheck = isAuthoritativeMenuItemAvailable(menuDoc, item.quantity);
  if (!stockCheck.available) {
    throw new AdminApprovalError(
      'failed-precondition',
      stockCheck.reason || `Product "${itemId}" is unavailable.`,
      stockCheck.reasonCode || 'OUT_OF_STOCK',
    );
  }

  const basePriceHalalas = sarToHalalas(menuDoc.price, `menu/${itemId}.price`);
  const effectiveConfig = resolveAuthoritativeCustomizationConfig(
    menuDoc,
    customizationDoc,
    coffeeOptions,
  );

  if (
    effectiveConfig &&
    effectiveConfig.allowSpecialInstructions === false &&
    item.specialInstructions?.trim()
  ) {
    throw new AdminApprovalError(
      'invalid-argument',
      `Special instructions are not enabled for "${menuDoc.name || itemId}".`,
      'SPECIAL_INSTRUCTIONS_DISABLED',
    );
  }

  const mergedSelections: OrderRequestCustomizationSelection[] = [];
  const seenPairs = new Set<string>();

  for (const sel of item.selectedCustomizations ?? []) {
    const groupId = typeof sel.groupId === 'string' ? sel.groupId.trim() : '';
    const optionId = typeof sel.optionId === 'string' ? sel.optionId.trim() : '';
    if (!groupId || !optionId) {
      throw new AdminApprovalError(
        'invalid-argument',
        `Invalid customization reference on "${itemId}".`,
        'INVALID_CUSTOMIZATION_IDS',
      );
    }
    const pairKey = `${groupId}::${optionId}`;
    if (seenPairs.has(pairKey)) {
      throw new AdminApprovalError(
        'invalid-argument',
        `Duplicate customization selection (${optionId}) in group ${groupId}.`,
        'DUPLICATE_CUSTOMIZATION',
      );
    }
    seenPairs.add(pairKey);
    mergedSelections.push({ groupId, optionId });
  }

  // Reconcile legacy milkOption field if not already represented in selectedCustomizations
  if (item.milkOption && item.milkOption !== 'none') {
    const hasMilkSelection = mergedSelections.some(
      (sel) => sel.groupId === 'legacy-milk' || /milk/i.test(sel.groupId),
    );
    if (!hasMilkSelection) {
      const milkGroup = effectiveConfig?.groups.find(
        (g) => g.id === 'legacy-milk' || /milk|حليب/i.test(`${g.id} ${g.name}`),
      );
      if (milkGroup && effectiveConfig?.enabled) {
        mergedSelections.push({ groupId: milkGroup.id, optionId: item.milkOption });
      } else {
        throw new AdminApprovalError(
          'failed-precondition',
          `Milk option "${item.milkOption}" is not enabled for "${menuDoc.name || itemId}".`,
          'INVALID_OR_DISABLED_GROUP',
        );
      }
    }
  }

  // Reconcile explicit selectedSizeId if customization config defines a size group
  if (item.selectedSizeId && effectiveConfig?.enabled) {
    const sizeGroup = effectiveConfig.groups.find((g) => isSizeGroup(g));
    if (sizeGroup && !mergedSelections.some((sel) => sel.groupId === sizeGroup.id)) {
      mergedSelections.push({ groupId: sizeGroup.id, optionId: item.selectedSizeId });
    }
  }

  const authoritativeSelections: SelectedCustomizationItem[] = [];

  if (!effectiveConfig || !effectiveConfig.enabled) {
    if (mergedSelections.length > 0) {
      throw new AdminApprovalError(
        'failed-precondition',
        `Customizations are disabled or unavailable for "${menuDoc.name || itemId}".`,
        'CUSTOMIZATIONS_DISABLED',
      );
    }
  } else {
    const groups = Array.isArray(effectiveConfig.groups) ? effectiveConfig.groups : [];
    const groupById = new Map<string, CustomizationGroup>();
    groups.forEach((g) => {
      if (g && typeof g.id === 'string') {
        groupById.set(g.id, g);
      }
    });

    const selectionsByGroup = new Map<string, string[]>();

    for (const sel of mergedSelections) {
      const group = groupById.get(sel.groupId);
      if (!group || group.enabled === false) {
        throw new AdminApprovalError(
          'failed-precondition',
          `Customization group "${sel.groupId}" is unavailable for "${menuDoc.name || itemId}".`,
          'INVALID_OR_DISABLED_GROUP',
        );
      }

      const optionById = new Map<string, CustomizationOption>();
      (group.options ?? []).forEach((o) => {
        if (o && typeof o.id === 'string') {
          optionById.set(o.id, o);
        }
      });

      const option = optionById.get(sel.optionId);
      if (!option || option.enabled === false) {
        throw new AdminApprovalError(
          'failed-precondition',
          `Customization option "${sel.optionId}" is disabled or unavailable for "${menuDoc.name || itemId}".`,
          'INVALID_OR_DISABLED_OPTION',
        );
      }

      const chosen = selectionsByGroup.get(group.id) ?? [];
      chosen.push(option.id);
      selectionsByGroup.set(group.id, chosen);
    }

    const sortedGroups = [...groups].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

    for (const group of sortedGroups) {
      if (group.enabled === false) continue;

      const enabledOptions = (group.options ?? []).filter((o) => o.enabled !== false);
      const chosenIds = selectionsByGroup.get(group.id) ?? [];
      const count = chosenIds.length;

      if (group.required && enabledOptions.length === 0) {
        throw new AdminApprovalError(
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
        throw new AdminApprovalError(
          'failed-precondition',
          `Required customization group "${group.name}" is missing a selection.`,
          'REQUIRED_GROUP_MISSING',
        );
      }
      if (count < min) {
        throw new AdminApprovalError(
          'failed-precondition',
          `Customization group "${group.name}" requires at least ${min} selection(s).`,
          'MIN_SELECTIONS_NOT_MET',
        );
      }
      if (count > max) {
        throw new AdminApprovalError(
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
          const optHalalas = sarToHalalas(
            opt.additionalPrice ?? 0,
            `option ${opt.id} additionalPrice`,
            MAX_OPTION_PRICE_HALALAS,
          );
          authoritativeSelections.push({
            groupId: group.id,
            groupName: group.name,
            ...(group.nameAr ? { groupNameAr: group.nameAr } : {}),
            optionId: opt.id,
            optionName: opt.name,
            ...(opt.nameAr ? { optionNameAr: opt.nameAr } : {}),
            additionalPrice: halalasToSar(optHalalas),
          });
        }
      }
    }
  }

  let customizationHalalas = 0;
  for (const sel of authoritativeSelections) {
    customizationHalalas += sarToHalalas(
      sel.additionalPrice,
      `selected option ${sel.optionId}`,
      MAX_OPTION_PRICE_HALALAS,
    );
  }

  const unitPriceHalalas = basePriceHalalas + customizationHalalas;
  const lineTotalHalalas = unitPriceHalalas * item.quantity;
  if (lineTotalHalalas > MAX_AMOUNT_HALALAS) {
    throw new AdminApprovalError(
      'invalid-argument',
      `Line total for "${menuDoc.name || itemId}" exceeds maximum permitted SAR bound.`,
      'LINE_TOTAL_EXCEEDED',
    );
  }

  const selectedCustomizations =
    authoritativeSelections.length > 0 ? authoritativeSelections : undefined;
  const specialInstructions = item.specialInstructions?.trim().slice(0, 160) || undefined;
  const temperature =
    item.temperature === 'Hot' || item.temperature === 'Cold' ? item.temperature : undefined;

  const customSummary = formatCustomSummaryBilingual(selectedCustomizations);
  const mergedNote = [temperature, customSummary, specialInstructions]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 240);

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
  const itemName = String(menuDoc.nameEn || menuDoc.name || itemId).trim().slice(0, 120);
  const itemNameAr = menuDoc.nameAr ? String(menuDoc.nameAr).trim().slice(0, 120) : undefined;

  const lineItem: VerifiedPricingLineItem = {
    itemId,
    name: itemName,
    ...(itemNameAr ? { nameAr: itemNameAr } : {}),
    quantity: item.quantity,
    basePriceSar: halalasToSar(basePriceHalalas),
    customizationTotalSar: halalasToSar(customizationHalalas),
    unitPriceSar: halalasToSar(unitPriceHalalas),
    lineTotalSar: halalasToSar(lineTotalHalalas),
    ...(selectedCustomizations ? { selectedCustomizations } : {}),
    ...(temperature ? { temperature } : {}),
    ...(milkOption ? { milkOption } : {}),
    ...(milkExtraPrice !== undefined ? { milkExtraPrice } : {}),
    ...(specialInstructions ? { specialInstructions } : {}),
    note: mergedNote,
    imageUrl: safeImageUrl,
    inStock: true,
  };

  return { lineItem, lineTotalHalalas };
}

export function calculateAuthoritativeOrderRequestPricing(
  orderRequest: Pick<OrderRequest, 'requestId' | 'items' | 'orderType' | 'currency'>,
  catalog: AuthoritativeCatalogLookup,
  adminActor?: AdminActor | null,
  verifiedAtMs = Date.now(),
): VerifiedPricingBreakdown {
  if (orderRequest.orderType !== 'pickup') {
    throw new AdminApprovalError(
      'invalid-argument',
      'Only pickup order requests are permitted.',
      'INVALID_ORDER_TYPE',
    );
  }
  if (orderRequest.currency !== 'SAR') {
    throw new AdminApprovalError(
      'invalid-argument',
      'Only SAR currency is supported.',
      'INVALID_CURRENCY',
    );
  }
  if (!Array.isArray(orderRequest.items) || orderRequest.items.length === 0 || orderRequest.items.length > 50) {
    throw new AdminApprovalError(
      'invalid-argument',
      'Order request must contain between 1 and 50 line items.',
      'ITEMS_COUNT_OUT_OF_RANGE',
    );
  }

  const coffeeOptions = catalog.coffeeOptions ?? DEFAULT_COFFEE_OPTIONS;
  const pricedLines: VerifiedPricingLineItem[] = [];
  let subtotalHalalas = 0;
  let itemCount = 0;

  for (const item of orderRequest.items) {
    const cleanId = typeof item.itemId === 'string' ? item.itemId.trim() : '';
    const menuDoc = catalog.getMenuDoc(cleanId) ?? null;
    const customDoc = catalog.getCustomizationDoc(cleanId) ?? null;

    const { lineItem, lineTotalHalalas } = validateAndPriceOrderRequestItem(
      item,
      menuDoc,
      customDoc,
      coffeeOptions,
    );
    pricedLines.push(lineItem);
    subtotalHalalas += lineTotalHalalas;
    itemCount += lineItem.quantity;
  }

  // Validate cumulative SKU demand across all line items (prevents split-line overselling)
  const aggregatedQtyByItem = aggregateRequestedQuantitiesByItem(orderRequest.items);
  for (const [cleanId, totalQty] of aggregatedQtyByItem.entries()) {
    const menuDoc = catalog.getMenuDoc(cleanId) ?? null;
    if (!menuDoc) {
      throw new AdminApprovalError(
        'not-found',
        `Product "${cleanId}" was not found in the active Firestore catalog.`,
        'UNKNOWN_PRODUCT',
      );
    }
    const aggregatedCheck = isAuthoritativeMenuItemAvailable(menuDoc, totalQty);
    if (!aggregatedCheck.available) {
      throw new AdminApprovalError(
        'failed-precondition',
        aggregatedCheck.reason || `Product "${cleanId}" is unavailable.`,
        aggregatedCheck.reasonCode || 'OUT_OF_STOCK',
      );
    }
  }

  if (subtotalHalalas < 0 || subtotalHalalas > MAX_AMOUNT_HALALAS) {
    throw new AdminApprovalError(
      'invalid-argument',
      'Verified order total exceeds permitted SAR bounds.',
      'ORDER_TOTAL_EXCEEDED',
    );
  }

  // Store-configured discount/tax rules only: currently zero discounts and zero extra fees.
  const discountHalalas = 0;
  const taxHalalas = 0;
  const totalBillHalalas = subtotalHalalas - discountHalalas + taxHalalas;

  return {
    currency: 'SAR',
    orderType: 'pickup',
    pricingVersion: STAGE_04L_PRICING_VERSION,
    subtotalSar: halalasToSar(subtotalHalalas),
    discountSar: halalasToSar(discountHalalas),
    taxSar: halalasToSar(taxHalalas),
    totalBillSar: halalasToSar(totalBillHalalas),
    itemCount,
    verifiedAtMs,
    verifiedByUid: adminActor?.uid || 'system',
    ...(adminActor?.email ? { verifiedByEmail: adminActor.email } : {}),
    items: pricedLines,
  };
}

export function inspectOrderRequestVerification(
  orderRequest: Pick<OrderRequest, 'requestId' | 'items' | 'orderType' | 'currency'>,
  catalog: AuthoritativeCatalogLookup,
  adminActor?: AdminActor | null,
): RequestPricingInspectionResult {
  const issues: PricingVerificationIssue[] = [];

  if (orderRequest.orderType !== 'pickup') {
    issues.push({
      itemIndex: -1,
      itemId: '',
      code: 'INVALID_ORDER_TYPE',
      message: 'Only pickup orders are supported.',
    });
  }
  if (orderRequest.currency !== 'SAR') {
    issues.push({
      itemIndex: -1,
      itemId: '',
      code: 'INVALID_CURRENCY',
      message: 'Currency must be SAR.',
    });
  }
  if (!Array.isArray(orderRequest.items) || orderRequest.items.length === 0) {
    issues.push({
      itemIndex: -1,
      itemId: '',
      code: 'EMPTY_ITEMS',
      message: 'Order request has no items.',
    });
    return { canApprove: false, issues, breakdown: null };
  }

  const coffeeOptions = catalog.coffeeOptions ?? DEFAULT_COFFEE_OPTIONS;
  const pricedLines: VerifiedPricingLineItem[] = [];
  let subtotalHalalas = 0;
  let itemCount = 0;

  orderRequest.items.forEach((item, idx) => {
    const cleanId = typeof item.itemId === 'string' ? item.itemId.trim() : '';
    const menuDoc = catalog.getMenuDoc(cleanId) ?? null;
    const customDoc = catalog.getCustomizationDoc(cleanId) ?? null;

    try {
      const { lineItem, lineTotalHalalas } = validateAndPriceOrderRequestItem(
        item,
        menuDoc,
        customDoc,
        coffeeOptions,
      );
      pricedLines.push(lineItem);
      subtotalHalalas += lineTotalHalalas;
      itemCount += lineItem.quantity;
    } catch (err) {
      const code =
        err instanceof AdminApprovalError
          ? err.reasonCode || err.code
          : 'VERIFICATION_FAILED';
      const message =
        err instanceof Error ? err.message : 'Unable to verify catalog item.';
      issues.push({
        itemIndex: idx,
        itemId: cleanId,
        code,
        message,
      });
    }
  });

  // Check aggregated demand per SKU (in case multiple cart variants share one stock-tracked product)
  const aggregatedQtyByItem = aggregateRequestedQuantitiesByItem(orderRequest.items);
  for (const [cleanId, totalQty] of aggregatedQtyByItem.entries()) {
    const menuDoc = catalog.getMenuDoc(cleanId) ?? null;
    if (!menuDoc) continue;
    const aggCheck = isAuthoritativeMenuItemAvailable(menuDoc, totalQty);
    if (!aggCheck.available && !issues.some((iss) => iss.itemId === cleanId)) {
      issues.push({
        itemIndex: -1,
        itemId: cleanId,
        code: aggCheck.reasonCode || 'INSUFFICIENT_STOCK',
        message: aggCheck.reason || `Insufficient combined stock for "${cleanId}".`,
      });
    }
  }

  if (issues.length > 0) {
    return { canApprove: false, issues, breakdown: null };
  }

  const totalBillSar = halalasToSar(subtotalHalalas);
  return {
    canApprove: true,
    issues: [],
    breakdown: {
      currency: 'SAR',
      orderType: 'pickup',
      pricingVersion: STAGE_04L_PRICING_VERSION,
      subtotalSar: totalBillSar,
      discountSar: 0,
      taxSar: 0,
      totalBillSar,
      itemCount,
      verifiedAtMs: Date.now(),
      verifiedByUid: adminActor?.uid || 'preview',
      ...(adminActor?.email ? { verifiedByEmail: adminActor.email } : {}),
      items: pricedLines,
    },
  };
}
