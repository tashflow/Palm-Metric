import type {
  AvailabilityFilter,
  Language,
  MenuItem,
  MenuSortOption,
} from '../types';
import { getItemTitle } from './format';

export interface MenuFilterState {
  category: string;
  search: string;
  origin: string;
  processingMethod: string;
  roastLevel: string;
  minPrice: string;
  maxPrice: string;
  availability: AvailabilityFilter;
  sortBy: MenuSortOption;
}

export const INITIAL_MENU_FILTERS: MenuFilterState = {
  category: 'All',
  search: '',
  origin: 'all',
  processingMethod: 'all',
  roastLevel: 'all',
  minPrice: '',
  maxPrice: '',
  availability: 'all',
  sortBy: 'default',
};

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export interface AvailableFilterOptions {
  origins: FilterOption[];
  processingMethods: FilterOption[];
  roastLevels: FilterOption[];
  inStockCount: number;
  outOfStockCount: number;
  minCatalogPrice: number | null;
  maxCatalogPrice: number | null;
}

const PROCESSING_ORDER = ['washed', 'natural', 'honey', 'anaerobic'];
const ROAST_ORDER = ['light', 'medium-light', 'medium', 'medium-dark', 'dark'];

export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getCanonicalOriginKey(item: MenuItem): string {
  const raw = item.origin || item.country || item.originAr || item.countryAr || '';
  return raw.trim().toLowerCase();
}

export function getMenuItemOrigin(item: MenuItem, lang: Language): string {
  if (lang === 'ar') {
    return (item.originAr || item.countryAr || item.origin || item.country || '').trim();
  }
  return (item.origin || item.country || item.originAr || item.countryAr || '').trim();
}

export function getMenuItemRegion(item: MenuItem, lang: Language): string {
  if (lang === 'ar') {
    return (item.regionAr || item.region || '').trim();
  }
  return (item.region || item.regionAr || '').trim();
}

export function getCanonicalProcessingKey(item: MenuItem): string {
  const raw = item.processingMethod || item.processingMethodAr || '';
  return raw.trim().toLowerCase();
}

export function getMenuItemProcessingLabel(
  rawMethod: string | undefined,
  lang: Language,
  explicitAr?: string,
): string {
  if (lang === 'ar' && explicitAr?.trim()) {
    return explicitAr.trim();
  }
  const clean = (rawMethod || '').trim();
  if (!clean) {
    return explicitAr?.trim() || '';
  }
  if (lang !== 'ar') return clean;

  switch (clean.toLowerCase()) {
    case 'washed':
      return 'مغسولة';
    case 'natural':
      return 'مجففة';
    case 'honey':
      return 'عسلية';
    case 'anaerobic':
      return 'لاهوائية';
    default:
      return clean;
  }
}

export function getMenuItemProcessing(item: MenuItem, lang: Language): string {
  return getMenuItemProcessingLabel(item.processingMethod, lang, item.processingMethodAr);
}

export function getCanonicalRoastKey(item: MenuItem): string {
  return (item.roastLevel || '').trim().toLowerCase();
}

export function getMenuItemRoastLabel(
  rawRoast: string | undefined,
  lang: Language,
): string {
  const clean = (rawRoast || '').trim();
  if (!clean) return '';
  if (lang !== 'ar') return clean;

  switch (clean.toLowerCase()) {
    case 'light':
      return 'خفيف';
    case 'medium-light':
    case 'medium light':
      return 'متوسط خفيف';
    case 'medium':
      return 'متوسط';
    case 'medium-dark':
    case 'medium dark':
      return 'متوسط غامق';
    case 'dark':
      return 'غامق';
    default:
      return clean;
  }
}

export function getMenuItemTastingNotes(item: MenuItem, lang: Language): string[] {
  const primary = lang === 'ar' ? item.tastingNotesAr : item.tastingNotes;
  const fallback = lang === 'ar' ? item.tastingNotes : item.tastingNotesAr;
  const chosen = primary && primary.length > 0 ? primary : fallback;
  if (!Array.isArray(chosen)) return [];
  return chosen.map((note) => note.trim()).filter(Boolean);
}

export function getMenuItemBrewMethods(item: MenuItem): string[] {
  if (!Array.isArray(item.brewMethods)) return [];
  return item.brewMethods.map((method) => method.trim()).filter(Boolean);
}

export function countActiveAttributeFilters(filters: MenuFilterState): number {
  let count = 0;
  if (filters.origin !== 'all') count += 1;
  if (filters.processingMethod !== 'all') count += 1;
  if (filters.roastLevel !== 'all') count += 1;
  if (filters.minPrice.trim() !== '') count += 1;
  if (filters.maxPrice.trim() !== '') count += 1;
  if (filters.availability !== 'all') count += 1;
  return count;
}

export function hasAnyActiveDiscoveryFilter(filters: MenuFilterState): boolean {
  return (
    filters.category !== 'All' ||
    filters.search.trim() !== '' ||
    filters.sortBy !== 'default' ||
    countActiveAttributeFilters(filters) > 0
  );
}

export function extractAvailableFilterOptions(
  items: MenuItem[],
  lang: Language,
): AvailableFilterOptions {
  const originMap = new Map<string, FilterOption>();
  const processMap = new Map<string, FilterOption>();
  const roastMap = new Map<string, FilterOption>();
  let inStockCount = 0;
  let outOfStockCount = 0;
  let minCatalogPrice: number | null = null;
  let maxCatalogPrice: number | null = null;

  items.forEach((item) => {
    if (item.inStock) {
      inStockCount += 1;
    } else {
      outOfStockCount += 1;
    }

    if (Number.isFinite(item.price)) {
      minCatalogPrice =
        minCatalogPrice === null ? item.price : Math.min(minCatalogPrice, item.price);
      maxCatalogPrice =
        maxCatalogPrice === null ? item.price : Math.max(maxCatalogPrice, item.price);
    }

    const originKey = getCanonicalOriginKey(item);
    const originLabel = getMenuItemOrigin(item, lang);
    if (originKey && originLabel) {
      const existing = originMap.get(originKey);
      if (existing) {
        existing.count += 1;
      } else {
        originMap.set(originKey, { value: originKey, label: originLabel, count: 1 });
      }
    }

    const processKey = getCanonicalProcessingKey(item);
    const processLabel = getMenuItemProcessing(item, lang);
    if (processKey && processLabel) {
      const existing = processMap.get(processKey);
      if (existing) {
        existing.count += 1;
      } else {
        processMap.set(processKey, { value: processKey, label: processLabel, count: 1 });
      }
    }

    const roastKey = getCanonicalRoastKey(item);
    const roastLabel = getMenuItemRoastLabel(item.roastLevel, lang);
    if (roastKey && roastLabel) {
      const existing = roastMap.get(roastKey);
      if (existing) {
        existing.count += 1;
      } else {
        roastMap.set(roastKey, { value: roastKey, label: roastLabel, count: 1 });
      }
    }
  });

  const origins = Array.from(originMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label, lang === 'ar' ? 'ar' : 'en'),
  );

  const processingMethods = Array.from(processMap.values()).sort((a, b) => {
    const aIdx = PROCESSING_ORDER.indexOf(a.value);
    const bIdx = PROCESSING_ORDER.indexOf(b.value);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.label.localeCompare(b.label, lang === 'ar' ? 'ar' : 'en');
  });

  const roastLevels = Array.from(roastMap.values()).sort((a, b) => {
    const aIdx = ROAST_ORDER.indexOf(a.value);
    const bIdx = ROAST_ORDER.indexOf(b.value);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.label.localeCompare(b.label, lang === 'ar' ? 'ar' : 'en');
  });

  return {
    origins,
    processingMethods,
    roastLevels,
    inStockCount,
    outOfStockCount,
    minCatalogPrice,
    maxCatalogPrice,
  };
}

function buildSearchCorpus(item: MenuItem): string {
  const parts: string[] = [
    item.name,
    item.nameEn || '',
    item.nameAr || '',
    item.category,
    item.categoryAr || '',
    item.description,
    item.descriptionAr || '',
    item.origin || '',
    item.originAr || '',
    item.country || '',
    item.countryAr || '',
    item.region || '',
    item.regionAr || '',
    item.processingMethod || '',
    item.processingMethodAr || '',
    getMenuItemProcessingLabel(item.processingMethod, 'ar', item.processingMethodAr),
    item.roastLevel || '',
    getMenuItemRoastLabel(item.roastLevel, 'ar'),
    item.variety || '',
    item.producer || '',
    item.altitude || '',
    ...(item.tastingNotes || []),
    ...(item.tastingNotesAr || []),
    ...(item.brewMethods || []),
  ];

  return normalizeSearchText(parts.filter(Boolean).join(' '));
}

function parsePriceBound(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function filterAndSortMenuItems(
  items: MenuItem[],
  filters: MenuFilterState,
  lang: Language,
): MenuItem[] {
  const normalizedQuery = normalizeSearchText(filters.search);
  const queryTokens = normalizedQuery ? normalizedQuery.split(' ').filter(Boolean) : [];
  const minBound = parsePriceBound(filters.minPrice);
  const maxBound = parsePriceBound(filters.maxPrice);

  const indexed = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => {
      if (filters.category === '__offers__') {
        const isOffer = Boolean(
          item.isOffer || (item.originalPrice && item.originalPrice > item.price),
        );
        if (!isOffer) return false;
      } else if (filters.category !== 'All') {
        if (item.category.trim().toLowerCase() !== filters.category.trim().toLowerCase()) {
          return false;
        }
      }

      if (filters.origin !== 'all') {
        if (getCanonicalOriginKey(item) !== filters.origin) return false;
      }

      if (filters.processingMethod !== 'all') {
        if (getCanonicalProcessingKey(item) !== filters.processingMethod) return false;
      }

      if (filters.roastLevel !== 'all') {
        if (getCanonicalRoastKey(item) !== filters.roastLevel) return false;
      }

      if (minBound !== null && item.price < minBound) return false;
      if (maxBound !== null && item.price > maxBound) return false;

      if (filters.availability === 'in-stock' && !item.inStock) return false;
      if (filters.availability === 'out-of-stock' && item.inStock) return false;

      if (queryTokens.length > 0) {
        const corpus = buildSearchCorpus(item);
        const matchesAll = queryTokens.every((token) => corpus.includes(token));
        if (!matchesAll) return false;
      }

      return true;
    });

  const locale = lang === 'ar' ? 'ar' : 'en';

  indexed.sort((a, b) => {
    switch (filters.sortBy) {
      case 'price-asc': {
        const diff = a.item.price - b.item.price;
        return diff !== 0 ? diff : a.idx - b.idx;
      }
      case 'price-desc': {
        const diff = b.item.price - a.item.price;
        return diff !== 0 ? diff : a.idx - b.idx;
      }
      case 'name-asc': {
        const diff = getItemTitle(a.item, lang).localeCompare(
          getItemTitle(b.item, lang),
          locale,
        );
        return diff !== 0 ? diff : a.idx - b.idx;
      }
      case 'name-desc': {
        const diff = getItemTitle(b.item, lang).localeCompare(
          getItemTitle(a.item, lang),
          locale,
        );
        return diff !== 0 ? diff : a.idx - b.idx;
      }
      case 'default':
      default: {
        const orderA = a.item.order ?? a.idx;
        const orderB = b.item.order ?? b.idx;
        return orderA !== orderB ? orderA - orderB : a.idx - b.idx;
      }
    }
  });

  return indexed.map(({ item }) => item);
}
