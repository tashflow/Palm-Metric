import { ShoppingBag } from 'lucide-react';
import { COPY } from '../data/i18n';
import type { Language } from '../types';

interface FloatingCartBarProps {
  lang: Language;
  itemCount: number;
  total: number;
  onOpenCheckout: () => void;
}

export function FloatingCartBar({
  lang,
  itemCount,
  total,
  onOpenCheckout,
}: FloatingCartBarProps) {
  if (itemCount <= 0) return null;
  const t = COPY[lang];

  return (
    <div className="fixed bottom-4 inset-x-4 z-40 mx-auto max-w-xl">
      <button
        type="button"
        onClick={onOpenCheckout}
        className="palm-cart-bar flex w-full min-h-[58px] items-center justify-between gap-4 rounded-2xl px-4 py-3 cursor-pointer active:translate-y-0.5 transition-transform"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 min-w-[36px] items-center justify-center rounded-xl bg-[#1A3C2F] px-2.5 font-en text-sm font-extrabold text-[#C9A227] tabular-nums">
            {itemCount}
          </span>
          <div className="text-start">
            <span className="block text-sm sm:text-base font-extrabold text-[#142A20]">
              {t.viewCartCheckout}
            </span>
            <span className="block text-[11px] font-semibold text-[#1A3C2F]/80">
              {itemCount} {itemCount === 1 ? t.itemSingular : t.itemPlural}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-en text-base sm:text-lg font-extrabold text-[#142A20] tabular-nums">
            {total} {t.currency}
          </span>
          <ShoppingBag className="h-5 w-5 text-[#142A20]" />
        </div>
      </button>
    </div>
  );
}
