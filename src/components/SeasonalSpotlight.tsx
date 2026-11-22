import { ArrowRight, Plus, SlidersHorizontal } from 'lucide-react';
import { COPY } from '../data/i18n';
import { formatPrice, getCategoryLabel, getItemTitle } from '../lib/format';
import type { Billboard, Language, MenuItem, TempChoice } from '../types';
import { StorageImage, StorageVideo } from './MediaAsset';

export interface SpotlightEntry {
  billboard: Billboard;
  matchedItems: MenuItem[];
}

interface SeasonalSpotlightProps {
  lang: Language;
  entries: SpotlightEntry[];
  onQuickAdd: (item: MenuItem, temp?: TempChoice) => void;
  onSelectItem: (item: MenuItem) => void;
  onExploreCategory: (category: string) => void;
}

export function matchBillboardItems(billboard: Billboard, items: MenuItem[]): MenuItem[] {
  if (items.length === 0) return [];

  const linkedIds = new Set<string>(
    [billboard.itemId, ...(billboard.itemIds ?? [])]
      .filter((v): v is string => Boolean(v))
      .map((v) => v.trim().toLowerCase()),
  );

  const explicitMatches =
    linkedIds.size > 0
      ? items.filter((item) => linkedIds.has(item.id.toLowerCase()))
      : [];

  if (explicitMatches.length > 0) {
    return explicitMatches.slice(0, 3);
  }

  const targetCat = billboard.category?.trim().toLowerCase();
  const textBlob = [
    billboard.title,
    billboard.titleEn,
    billboard.titleAr,
    billboard.subtitle,
    billboard.subtitleEn,
    billboard.subtitleAr,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const scored = items
    .map((item) => {
      let score = 0;
      const names = [item.name, item.nameEn, item.nameAr]
        .filter((n): n is string => Boolean(n && n.trim().length > 2))
        .map((n) => n.trim().toLowerCase());

      for (const n of names) {
        if (textBlob.includes(n)) {
          score += 5;
        } else {
          const words = n.split(/\s+/).filter((w) => w.length >= 4);
          for (const w of words) {
            if (textBlob.includes(w)) score += 2;
          }
        }
      }

      if (targetCat && item.category.trim().toLowerCase() === targetCat) {
        score += 3;
      }

      if (billboard.isOffer && (item.isOffer || (item.originalPrice && item.originalPrice > item.price))) {
        score += 2;
      }

      return { item, score };
    })
    .filter((entry) => entry.score >= 3)
    .sort((a, b) => {
      if (a.item.inStock !== b.item.inStock) return a.item.inStock ? -1 : 1;
      return b.score - a.score;
    });

  return scored.slice(0, 2).map((s) => s.item);
}

export function SeasonalSpotlight({
  lang,
  entries,
  onQuickAdd,
  onSelectItem,
  onExploreCategory,
}: SeasonalSpotlightProps) {
  if (entries.length === 0) return null;

  const t = COPY[lang];
  const visibleEntries = entries.slice(0, 3);
  const singleMode = visibleEntries.length === 1;

  return (
    <section
      id="palm-seasonal-spotlight"
      aria-labelledby="seasonal-spotlight-heading"
      className="relative overflow-hidden rounded-3xl border border-[#C9A227]/35 bg-gradient-to-br from-[#112A20] via-[#163428] to-[#0D2119] p-5 sm:p-7 shadow-[0_22px_50px_-14px_rgba(4,14,10,0.7)]"
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-5 border-b border-[#C9A227]/20">
        <div>
          <p className="text-xs font-bold tracking-wide text-[#C9A227]">
            {t.seasonalKicker}
          </p>
          <h2
            id="seasonal-spotlight-heading"
            className="font-editorial mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F0E6] [text-wrap:balance]"
          >
            {t.seasonalTitle}
          </h2>
        </div>
        <p className="text-xs sm:text-sm font-medium text-[#F5F0E6]/78 max-w-md leading-relaxed">
          {t.seasonalSubtitle}
        </p>
      </div>

      <div
        className={`mt-6 grid gap-5 ${
          singleMode
            ? 'grid-cols-1'
            : visibleEntries.length === 2
              ? 'grid-cols-1 lg:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        }`}
      >
        {visibleEntries.map(({ billboard, matchedItems }) => {
          const title =
            lang === 'ar'
              ? billboard.titleAr || billboard.title
              : billboard.titleEn || billboard.title;
          const subtitle =
            lang === 'ar'
              ? billboard.subtitleAr || billboard.subtitle
              : billboard.subtitleEn || billboard.subtitle;
          const primaryImage = billboard.mediaUrl || matchedItems[0]?.imageUrl || '';

          return (
            <article
              key={billboard.id}
              className={`group flex flex-col ${
                singleMode ? 'lg:flex-row lg:items-stretch' : ''
              } overflow-hidden rounded-2xl border border-[#C9A227]/30 bg-[#153327]/95 transition-transform duration-200 hover:-translate-y-0.5`}
            >
              <div
                className={`relative overflow-hidden shrink-0 ${
                  singleMode
                    ? 'aspect-[16/10] lg:aspect-auto lg:w-[46%] lg:min-h-[260px]'
                    : 'aspect-[16/10] w-full'
                }`}
              >
                {primaryImage ? (
                  billboard.mediaUrl && billboard.mediaType === 'video' ? (
                    <StorageVideo
                      src={billboard.mediaUrl}
                      poster={billboard.posterUrl}
                      title={title}
                      className="h-full w-full"
                    />
                  ) : (
                    <StorageImage
                      src={primaryImage}
                      alt={title}
                      fallbackLabel={title}
                      className="h-full w-full"
                    />
                  )
                ) : (
                  <div
                    className="h-full w-full bg-[radial-gradient(circle_at_top_right,rgba(201,162,39,0.34),rgba(16,39,30,0.98)_70%)] flex items-end p-5"
                    aria-hidden="true"
                  >
                    <span className="font-en text-xs font-extrabold tracking-widest text-[#C9A227]/90">
                      PALM METRIC
                    </span>
                  </div>
                )}

                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0D2119]/75 via-transparent to-transparent"
                  aria-hidden="true"
                />
              </div>

              <div className="flex flex-1 flex-col justify-between p-5 gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#C9A227]">
                    <span>{billboard.badge || t.seasonalKicker}</span>
                    {billboard.category && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#F5F0E6]/80">
                          {getCategoryLabel(billboard.category, lang)}
                        </span>
                      </>
                    )}
                  </div>

                  <h3 className="mt-1.5 text-lg sm:text-xl font-extrabold text-[#F5F0E6] leading-snug [text-wrap:balance]">
                    {title}
                  </h3>

                  {subtitle && (
                    <p className="mt-1.5 text-xs sm:text-sm text-[#F5F0E6]/80 line-clamp-2 leading-relaxed">
                      {subtitle}
                    </p>
                  )}
                </div>

                {matchedItems.length > 0 ? (
                  <div className="divide-y divide-[#C9A227]/20 border-t border-[#C9A227]/20 pt-3 space-y-2.5">
                    {matchedItems.map((item) => {
                      const itemName = getItemTitle(item, lang);
                      const outOfStock = !item.inStock;

                      return (
                        <div
                          key={item.id}
                          className="pt-2.5 first:pt-0 flex items-center justify-between gap-3"
                        >
                          <button
                            type="button"
                            disabled={outOfStock}
                            onClick={() => onSelectItem(item)}
                            className={`min-w-0 flex-1 text-start ${
                              outOfStock ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                            }`}
                          >
                            <span className="block truncate text-sm font-extrabold text-[#F5F0E6] hover:text-[#C9A227] transition-colors">
                              {itemName}
                            </span>
                            <span className="mt-0.5 flex items-center gap-2 text-xs font-bold text-[#C9A227] tabular-nums">
                              <span>
                                {formatPrice(item.price)} {t.currency}
                              </span>
                              {item.originalPrice !== undefined && item.originalPrice > item.price && (
                                <span className="text-[#F5F0E6]/50 line-through">
                                  {formatPrice(item.originalPrice)} {t.currency}
                                </span>
                              )}
                              {outOfStock && (
                                <span className="text-[#F9A8A1]">· {t.outOfStockLabel}</span>
                              )}
                            </span>
                          </button>

                          {!outOfStock && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => onSelectItem(item)}
                                aria-label={`${t.customizeBtn}: ${itemName}`}
                                className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#C9A227]/35 bg-[#112920] text-[#F5F0E6] hover:border-[#C9A227] cursor-pointer"
                              >
                                <SlidersHorizontal className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onQuickAdd(item, item.supportsTemp ? 'hot' : undefined)
                                }
                                className="palm-btn-gold inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                                <span>{t.addBtn}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="pt-3 border-t border-[#C9A227]/20 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onExploreCategory(billboard.category || 'All')}
                      className="palm-btn-gold inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-extrabold whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>
                        {billboard.ctaLabel ||
                          (billboard.category ? t.seasonalExploreBtn : t.seasonalMenuBtn)}
                      </span>
                      <ArrowRight
                        className={`h-4 w-4 ${lang === 'ar' ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
