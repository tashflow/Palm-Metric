import type {
  CartItem,
  CoffeeOptionsSettings,
  CustomizationGroup,
  CustomizationOption,
  Language,
  MenuItem,
  ProductCustomizationConfig,
  SelectedCustomizationItem,
} from '../types';
import { formatPrice, roundCurrency } from './format';

export const DEFAULT_COFFEE_OPTIONS: CoffeeOptionsSettings = {
  milkSelectionEnabled: true,
  coconutMilkExtraPrice: 3,
  hotColdSelectionEnabled: true,
};

const MILK_COMPATIBLE_CATEGORIES = new Set([
  'v60',
  'espresso',
  'matcha',
  'specialty',
  'coffee',
]);

export function inferItemAllowsMilk(item: MenuItem | undefined | null): boolean {
  if (!item) return false;
  if (typeof item.allowMilkOption === 'boolean') return item.allowMilkOption;
  const cat = item.category.trim().toLowerCase();
  return MILK_COMPATIBLE_CATEGORIES.has(cat);
}

export function resolveEffectiveCustomizationConfig(
  item: MenuItem | null | undefined,
  primaryConfig: ProductCustomizationConfig | null | undefined,
  hasFirestoreDoc: boolean,
  coffeeOptions: CoffeeOptionsSettings = DEFAULT_COFFEE_OPTIONS,
): ProductCustomizationConfig | null {
  // Admin productCustomizations/{productId} is always authoritative when present
  if (hasFirestoreDoc || primaryConfig) {
    return primaryConfig ?? null;
  }
  if (!item) return null;

  if (!coffeeOptions.milkSelectionEnabled || !inferItemAllowsMilk(item)) {
    return null;
  }

  const coconutPrice = sanitizeAdditionalPrice(
    typeof item.coconutMilkPrice === 'number'
      ? item.coconutMilkPrice
      : coffeeOptions.coconutMilkExtraPrice,
  );

  return {
    productId: item.id,
    enabled: true,
    schemaVersion: 0,
    updatedBy: 'coffeeOptions-fallback',
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
            additionalPrice: coconutPrice,
            enabled: true,
            isDefault: false,
            displayOrder: 1,
          },
        ],
      },
    ],
  };
}

export function hasTemperatureCustomizationGroup(groups: CustomizationGroup[]): boolean {
  return groups.some((g) => {
    const blob = `${g.id} ${g.name} ${g.nameAr || ''}`.toLowerCase();
    return /\b(temp|temperature|hot|cold|iced)\b|درجة\s*الحرارة|حار\s*\/\s*بارد/.test(blob);
  });
}

export function resolveItemSupportsTemperature(
  item: MenuItem | null | undefined,
  activeGroups: CustomizationGroup[],
  coffeeOptions: CoffeeOptionsSettings = DEFAULT_COFFEE_OPTIONS,
): boolean {
  if (!item) return false;
  if (!coffeeOptions.hotColdSelectionEnabled) return false;
  if (hasTemperatureCustomizationGroup(activeGroups)) return false;
  if (typeof item.allowTemperature === 'boolean') return item.allowTemperature;
  return Boolean(item.supportsTemp);
}

export const MAX_CUSTOMIZATION_OPTION_PRICE = 5000;

export function sanitizeAdditionalPrice(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  if (raw > MAX_CUSTOMIZATION_OPTION_PRICE) {
    return roundCurrency(MAX_CUSTOMIZATION_OPTION_PRICE);
  }
  return roundCurrency(raw);
}

export function getLocalizedLabel(
  name: string,
  nameAr: string | undefined,
  lang: Language,
): string {
  const enText = name.trim();
  const arText = (nameAr || '').trim();
  if (lang === 'ar') {
    return arText || enText;
  }
  return enText || arText;
}

export function normalizeCustomizationConfig(
  productId: string,
  rawData: unknown,
  updatedAtMs?: number,
): ProductCustomizationConfig | null {
  if (!rawData || typeof rawData !== 'object') return null;
  const data = rawData as Record<string, unknown>;

  const rawGroups = Array.isArray(data.groups) ? data.groups : [];
  const normalizedGroups: CustomizationGroup[] = [];
  const seenGroupIds = new Set<string>();

  rawGroups.forEach((rawGroup, gIdx) => {
    if (!rawGroup || typeof rawGroup !== 'object') return;
    const g = rawGroup as Record<string, unknown>;

    const id = typeof g.id === 'string' ? g.id.trim() : '';
    const name = typeof g.name === 'string' ? g.name.trim() : '';
    const nameAr = typeof g.nameAr === 'string' ? g.nameAr.trim() : undefined;

    if (!id || seenGroupIds.has(id) || (!name && !nameAr)) return;
    seenGroupIds.add(id);

    const rawOptions = Array.isArray(g.options) ? g.options : [];
    const normalizedOptions: CustomizationOption[] = [];
    const seenOptionIds = new Set<string>();

    rawOptions.forEach((rawOpt, oIdx) => {
      if (!rawOpt || typeof rawOpt !== 'object') return;
      const o = rawOpt as Record<string, unknown>;

      const optId = typeof o.id === 'string' ? o.id.trim() : '';
      const optName = typeof o.name === 'string' ? o.name.trim() : '';
      const optNameAr = typeof o.nameAr === 'string' ? o.nameAr.trim() : undefined;

      if (!optId || seenOptionIds.has(optId) || (!optName && !optNameAr)) return;
      seenOptionIds.add(optId);

      normalizedOptions.push({
        id: optId,
        name: optName || optNameAr || optId,
        nameAr: optNameAr || undefined,
        additionalPrice: sanitizeAdditionalPrice(
          typeof o.additionalPrice === 'number' ? o.additionalPrice : Number(o.additionalPrice),
        ),
        enabled: typeof o.enabled === 'boolean' ? o.enabled : true,
        isDefault: Boolean(o.isDefault),
        displayOrder:
          typeof o.displayOrder === 'number' && Number.isFinite(o.displayOrder)
            ? o.displayOrder
            : oIdx,
      });
    });

    normalizedOptions.sort((a, b) => a.displayOrder - b.displayOrder);

    const required = Boolean(g.required);
    const rawMin =
      typeof g.minSelections === 'number' && Number.isFinite(g.minSelections)
        ? Math.max(0, Math.floor(g.minSelections))
        : 0;
    const rawMax =
      typeof g.maxSelections === 'number' && Number.isFinite(g.maxSelections)
        ? Math.max(0, Math.floor(g.maxSelections))
        : 0;

    const explicitType = g.type === 'single' || g.type === 'multiple' ? g.type : undefined;
    const type = explicitType ?? (rawMax === 1 ? 'single' : 'multiple');

    const minSelections = required ? Math.max(1, rawMin) : rawMin;
    const maxSelections =
      type === 'single'
        ? 1
        : Math.max(minSelections, rawMax > 0 ? rawMax : Math.max(1, normalizedOptions.length));

    normalizedGroups.push({
      id,
      name: name || nameAr || id,
      nameAr: nameAr || undefined,
      type,
      required,
      minSelections,
      maxSelections,
      displayOrder:
        typeof g.displayOrder === 'number' && Number.isFinite(g.displayOrder)
          ? g.displayOrder
          : gIdx,
      enabled: typeof g.enabled === 'boolean' ? g.enabled : true,
      options: normalizedOptions,
    });
  });

  normalizedGroups.sort((a, b) => a.displayOrder - b.displayOrder);

  return {
    productId:
      typeof data.productId === 'string' && data.productId.trim()
        ? data.productId.trim()
        : productId,
    enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
    groups: normalizedGroups,
    updatedAtMs,
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
    schemaVersion:
      typeof data.schemaVersion === 'number' && Number.isFinite(data.schemaVersion)
        ? data.schemaVersion
        : 1,
    allowSpecialInstructions:
      typeof data.allowSpecialInstructions === 'boolean'
        ? data.allowSpecialInstructions
        : true,
  };
}

export function getActiveCustomizationGroups(
  config: ProductCustomizationConfig | null | undefined,
): CustomizationGroup[] {
  if (!config || !config.enabled) return [];

  return config.groups
    .filter((group) => group.enabled)
    .map((group) => ({
      ...group,
      options: group.options.filter((opt) => opt.enabled),
    }))
    .filter((group) => group.options.length > 0);
}

export function getBrokenRequiredGroups(
  config: ProductCustomizationConfig | null | undefined,
): CustomizationGroup[] {
  if (!config || !config.enabled) return [];
  return config.groups.filter(
    (group) =>
      group.enabled &&
      group.required &&
      group.options.filter((opt) => opt.enabled).length === 0,
  );
}

export function buildInitialCustomizationSelections(
  groups: CustomizationGroup[],
): Record<string, string[]> {
  const initial: Record<string, string[]> = {};

  groups.forEach((group) => {
    const enabledDefaults = group.options
      .filter((opt) => opt.enabled && opt.isDefault)
      .map((opt) => opt.id);

    if (enabledDefaults.length === 0) {
      initial[group.id] = [];
      return;
    }

    const cap = group.type === 'single' ? 1 : Math.max(1, group.maxSelections);
    initial[group.id] = enabledDefaults.slice(0, cap);
  });

  return initial;
}

export function toggleCustomizationOption(
  groups: CustomizationGroup[],
  currentSelections: Record<string, string[]>,
  groupId: string,
  optionId: string,
): { next: Record<string, string[]>; maxReached: boolean } {
  const group = groups.find((g) => g.id === groupId && g.enabled);
  if (!group) return { next: currentSelections, maxReached: false };

  const option = group.options.find((o) => o.id === optionId && o.enabled);
  if (!option) return { next: currentSelections, maxReached: false };

  const validEnabledIds = new Set(
    group.options.filter((o) => o.enabled).map((o) => o.id),
  );
  const existing = (currentSelections[groupId] ?? []).filter((id) =>
    validEnabledIds.has(id),
  );
  const isSelected = existing.includes(optionId);

  if (group.type === 'single') {
    if (isSelected && !group.required && group.minSelections === 0) {
      return {
        next: { ...currentSelections, [groupId]: [] },
        maxReached: false,
      };
    }
    return {
      next: { ...currentSelections, [groupId]: [optionId] },
      maxReached: false,
    };
  }

  if (isSelected) {
    return {
      next: {
        ...currentSelections,
        [groupId]: existing.filter((id) => id !== optionId),
      },
      maxReached: false,
    };
  }

  const cap = Math.max(1, group.maxSelections || group.options.length);
  if (existing.length >= cap) {
    if (cap === 1) {
      return {
        next: { ...currentSelections, [groupId]: [optionId] },
        maxReached: false,
      };
    }
    return { next: currentSelections, maxReached: true };
  }

  return {
    next: { ...currentSelections, [groupId]: [...existing, optionId] },
    maxReached: false,
  };
}

export interface CustomizationGroupValidationError {
  code: 'required' | 'min' | 'max' | 'unavailable_option';
  min: number;
  max: number;
  selectedCount: number;
}

export interface CustomizationValidationResult {
  valid: boolean;
  groupErrors: Record<string, CustomizationGroupValidationError>;
  hasBrokenRequiredGroup: boolean;
}

export function validateCustomizationSelections(
  config: ProductCustomizationConfig | null | undefined,
  selections: Record<string, string[]>,
): CustomizationValidationResult {
  const activeGroups = getActiveCustomizationGroups(config);
  const brokenRequired = getBrokenRequiredGroups(config);
  const groupErrors: Record<string, CustomizationGroupValidationError> = {};

  brokenRequired.forEach((group) => {
    groupErrors[group.id] = {
      code: 'unavailable_option',
      min: Math.max(1, group.minSelections),
      max: group.type === 'single' ? 1 : Math.max(1, group.maxSelections),
      selectedCount: 0,
    };
  });

  activeGroups.forEach((group) => {
    const enabledOptionIds = new Set(
      group.options.filter((o) => o.enabled).map((o) => o.id),
    );
    const chosen = (selections[group.id] ?? []).filter((id) =>
      enabledOptionIds.has(id),
    );
    const count = chosen.length;
    const min = group.required ? Math.max(1, group.minSelections) : group.minSelections;
    const max =
      group.type === 'single'
        ? 1
        : Math.max(min, group.maxSelections || group.options.length);

    if (count === 0 && group.required) {
      groupErrors[group.id] = { code: 'required', min, max, selectedCount: count };
    } else if (count < min) {
      groupErrors[group.id] = { code: 'min', min, max, selectedCount: count };
    } else if (count > max) {
      groupErrors[group.id] = { code: 'max', min, max, selectedCount: count };
    }
  });

  return {
    valid: Object.keys(groupErrors).length === 0,
    groupErrors,
    hasBrokenRequiredGroup: brokenRequired.length > 0,
  };
}

export interface CustomizationPricingBreakdown {
  basePrice: number;
  optionsTotal: number;
  unitPrice: number;
  selectedItems: SelectedCustomizationItem[];
}

export function calculateCustomizationPricing(
  basePrice: number,
  config: ProductCustomizationConfig | null | undefined,
  selections: Record<string, string[]>,
): CustomizationPricingBreakdown {
  const safeBase = roundCurrency(
    typeof basePrice === 'number' && Number.isFinite(basePrice) && basePrice > 0
      ? basePrice
      : 0,
  );

  const activeGroups = getActiveCustomizationGroups(config);
  const selectedItems: SelectedCustomizationItem[] = [];

  activeGroups.forEach((group) => {
    const chosenSet = new Set(selections[group.id] ?? []);
    group.options.forEach((opt) => {
      if (!opt.enabled || !chosenSet.has(opt.id)) return;
      selectedItems.push({
        groupId: group.id,
        groupName: group.name,
        groupNameAr: group.nameAr,
        optionId: opt.id,
        optionName: opt.name,
        optionNameAr: opt.nameAr,
        additionalPrice: sanitizeAdditionalPrice(opt.additionalPrice),
      });
    });
  });

  const optionsTotal = roundCurrency(
    selectedItems.reduce(
      (sum, item) => roundCurrency(sum + sanitizeAdditionalPrice(item.additionalPrice)),
      0,
    ),
  );

  const unitPrice = roundCurrency(safeBase + optionsTotal);

  return {
    basePrice: safeBase,
    optionsTotal,
    unitPrice,
    selectedItems,
  };
}

export function formatSelectedCustomizationsForDisplay(
  items: SelectedCustomizationItem[] | undefined,
  lang: Language,
): string {
  if (!items || items.length === 0) return '';
  return items
    .map((entry) => {
      const label = getLocalizedLabel(entry.optionName, entry.optionNameAr, lang);
      return entry.additionalPrice > 0
        ? `${label} (+${formatPrice(entry.additionalPrice)})`
        : label;
    })
    .join(' · ');
}

export function formatSelectedCustomizationsBilingual(
  items: SelectedCustomizationItem[] | undefined,
): string {
  if (!items || items.length === 0) return '';
  return items
    .map((entry) => {
      const enName = entry.optionName.trim();
      const arName = (entry.optionNameAr || '').trim();
      const namePart =
        arName && enName && arName !== enName ? `${enName} / ${arName}` : enName || arName;
      return entry.additionalPrice > 0
        ? `${namePart} (+${formatPrice(entry.additionalPrice)} ﷼)`
        : namePart;
    })
    .join(', ');
}

export function formatSelectedCustomizationsDetailedBilingual(
  items: SelectedCustomizationItem[] | undefined,
): string[] {
  if (!items || items.length === 0) return [];
  const grouped = new Map<
    string,
    { groupLabel: string; optionLabels: string[] }
  >();

  items.forEach((entry) => {
    const groupEn = entry.groupName.trim();
    const groupAr = (entry.groupNameAr || '').trim();
    const groupLabel =
      groupAr && groupEn && groupAr !== groupEn
        ? `${groupEn} / ${groupAr}`
        : groupEn || groupAr || entry.groupId;

    const optEn = entry.optionName.trim();
    const optAr = (entry.optionNameAr || '').trim();
    const optName =
      optAr && optEn && optAr !== optEn
        ? `${optEn} / ${optAr}`
        : optEn || optAr || entry.optionId;
    const priceTag =
      entry.additionalPrice > 0
        ? ` (+${formatPrice(entry.additionalPrice)} ﷼)`
        : ' (+0 ﷼)';

    const existing = grouped.get(entry.groupId);
    if (existing) {
      existing.optionLabels.push(`${optName}${priceTag}`);
    } else {
      grouped.set(entry.groupId, {
        groupLabel,
        optionLabels: [`${optName}${priceTag}`],
      });
    }
  });

  return Array.from(grouped.values()).map(
    (g) => `${g.groupLabel}: ${g.optionLabels.join(', ')}`,
  );
}

export type CartReviewReason =
  | { code: 'item_unavailable' }
  | { code: 'config_disabled' }
  | { code: 'option_disabled'; optionName: string; optionNameAr?: string }
  | { code: 'price_changed'; oldPrice: number; newPrice: number };

export interface CartItemConsistencyResult {
  status: 'ok' | 'review_required';
  reasons: CartReviewReason[];
  expectedUnitPrice: number;
}

export function auditCartItemAgainstLiveCatalog(
  cartItem: CartItem,
  menuItem: MenuItem | undefined,
  config: ProductCustomizationConfig | null | undefined,
  configLoaded: boolean,
  coffeeOptions: CoffeeOptionsSettings = DEFAULT_COFFEE_OPTIONS,
): CartItemConsistencyResult {
  const reasons: CartReviewReason[] = [];

  if (menuItem && !menuItem.inStock) {
    reasons.push({ code: 'item_unavailable' });
  }

  const selections = cartItem.customizations ?? [];
  const isLegacyCoffeeFallbackSelection =
    selections.length > 0 && selections.every((s) => s.groupId === 'legacy-milk');

  let expectedUnitPrice = roundCurrency(cartItem.price);

  if (selections.length > 0 && configLoaded) {
    const effectiveConfig = config
      ? config
      : isLegacyCoffeeFallbackSelection
        ? resolveEffectiveCustomizationConfig(menuItem, null, false, coffeeOptions)
        : null;

    if (!effectiveConfig || !effectiveConfig.enabled) {
      reasons.push({ code: 'config_disabled' });
    } else {
      let liveOptionsTotal = 0;
      let allOptionsValid = true;

      selections.forEach((sel) => {
        const group = effectiveConfig.groups.find((g) => g.id === sel.groupId && g.enabled);
        const opt = group?.options.find((o) => o.id === sel.optionId && o.enabled);
        if (!group || !opt) {
          allOptionsValid = false;
          reasons.push({
            code: 'option_disabled',
            optionName: sel.optionName,
            optionNameAr: sel.optionNameAr,
          });
        } else {
          liveOptionsTotal = roundCurrency(
            liveOptionsTotal + sanitizeAdditionalPrice(opt.additionalPrice),
          );
        }
      });

      if (allOptionsValid && menuItem) {
        expectedUnitPrice = roundCurrency(menuItem.price + liveOptionsTotal);
        const currentUnitPrice = roundCurrency(cartItem.price);
        if (Math.abs(expectedUnitPrice - currentUnitPrice) >= 0.01) {
          reasons.push({
            code: 'price_changed',
            oldPrice: currentUnitPrice,
            newPrice: expectedUnitPrice,
          });
        }
      }
    }
  } else if (selections.length === 0 && menuItem) {
    expectedUnitPrice = roundCurrency(menuItem.price);
    const currentPrice = roundCurrency(cartItem.price);
    if (Math.abs(expectedUnitPrice - currentPrice) >= 0.01) {
      reasons.push({
        code: 'price_changed',
        oldPrice: currentPrice,
        newPrice: expectedUnitPrice,
      });
    }
  }

  return {
    status: reasons.length > 0 ? 'review_required' : 'ok',
    reasons,
    expectedUnitPrice,
  };
}
