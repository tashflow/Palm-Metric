import { canonicalizeProductId } from '../data/menu';
import { buildCartKey, roundCurrency } from './format';
import type { CartItem } from '../types';

export function migrateLegacyCartItems(items: CartItem[]): CartItem[] {
  if (!Array.isArray(items)) return [];
  const merged = new Map<string, CartItem>();

  items.forEach((entry) => {
    if (!entry || typeof entry !== 'object' || !entry.itemId) return;
    const canonicalId = canonicalizeProductId(entry.itemId);
    const note = typeof entry.note === 'string' ? entry.note : '';
    const customizations = Array.isArray(entry.customizations) ? entry.customizations : undefined;
    const nextCartKey =
      canonicalId !== entry.itemId || !entry.cartKey
        ? buildCartKey(canonicalId, note, entry.temp, customizations)
        : entry.cartKey;

    const existing = merged.get(nextCartKey);
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + Math.max(1, entry.quantity || 1));
    } else {
      merged.set(nextCartKey, {
        ...entry,
        cartKey: nextCartKey,
        itemId: canonicalId,
        note,
        quantity: Math.max(1, Math.min(99, entry.quantity || 1)),
        price: roundCurrency(Number(entry.price) || 0),
      });
    }
  });

  return Array.from(merged.values());
}
