import { CATEGORIES } from '../data/menu';
import type {
  Language,
  MenuItem,
  OrderStatus,
  SelectedCustomizationItem,
  TempChoice,
} from '../types';

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function formatPrice(value: number): string {
  const rounded = roundCurrency(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export function buildCartKey(
  itemId: string,
  note: string = '',
  temp?: TempChoice,
  customizations?: Pick<SelectedCustomizationItem, 'groupId' | 'optionId'>[],
): string {
  const cleanNote = note.trim().toLowerCase();
  const baseKey = temp ? `${itemId}::${temp}` : itemId;
  const legacyKey = `${baseKey}::${cleanNote}`;
  if (!customizations || customizations.length === 0) {
    return legacyKey;
  }
  const cfgSignature = customizations
    .map((c) => `${c.groupId}:${c.optionId}`)
    .sort()
    .join(',');
  return `${legacyKey}::cfg[${cfgSignature}]`;
}

export function getItemTitle(
  item: Pick<MenuItem, 'name' | 'nameAr' | 'nameEn'>,
  lang: Language,
): string {
  return lang === 'ar'
    ? item.nameAr || item.name
    : item.nameEn || item.name;
}

export function getItemSecondaryTitle(
  item: Pick<MenuItem, 'name' | 'nameAr' | 'nameEn'>,
  lang: Language,
): string {
  const primary = getItemTitle(item, lang);
  const secondary =
    lang === 'ar'
      ? item.nameEn || (item.nameAr ? item.name : '')
      : item.nameAr || '';
  return secondary && secondary !== primary ? secondary : '';
}

export function getItemDescription(
  item: Pick<MenuItem, 'description' | 'descriptionAr'>,
  lang: Language,
): string {
  if (lang === 'ar') {
    return item.descriptionAr || item.description || '';
  }
  return item.description || item.descriptionAr || '';
}

export function getCategoryLabel(
  category: string,
  lang: Language,
  explicitAr?: string,
): string {
  if (lang !== 'ar') return category;
  if (explicitAr && explicitAr.trim()) return explicitAr.trim();

  const normalized = category.trim().toLowerCase();
  const match = CATEGORIES.find(
    (c) =>
      c.en.toLowerCase() === normalized ||
      c.id.toLowerCase() === normalized ||
      c.ar === category.trim(),
  );
  return match?.ar || category;
}

export function getOrderStatusLabel(status: OrderStatus, lang: Language): string {
  if (lang !== 'ar') return status;
  switch (status) {
    case 'Pending':
      return 'قيد الانتظار';
    case 'Preparing':
      return 'قيد التحضير';
    case 'Ready':
      return 'جاهز';
    case 'Completed':
      return 'مكتمل';
    case 'Cancelled':
      return 'ملغي';
  }
}
