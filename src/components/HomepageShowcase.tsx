import { motion } from 'motion/react';
import {
  ArrowRight,
  Clock,
  Coffee,
  Croissant,
  Droplets,
  Flame,
  Leaf,
  MapPin,
  Minus,
  Plus,
  Snowflake,
  Sparkles,
} from 'lucide-react';
import { BUSINESS, CATEGORIES } from '../data/menu';
import { COPY } from '../data/i18n';
import { BRAND_MEDIA, getCategoryArtwork } from '../lib/brandMedia';
import {
  formatPrice,
  getCategoryLabel,
  getItemDescription,
  getItemSecondaryTitle,
  getItemTitle,
} from '../lib/format';
import { resolveItemSupportsTemperature } from '../lib/customization';
import type {
  CoffeeOptionsSettings,
  Language,
  MenuItem,
  StoreSettings,
  TempChoice,
} from '../types';
import { StorageImage } from './MediaAsset';

interface HeroSectionProps {
  lang: Language;
  storeSettings?: StoreSettings;
  mascotBounces: number;
  onMascotTap: () => void;
  onExploreCoffee: () => void;
  onExploreStory: () => void;
  onShortcutAllMenu: () => void;
  onShortcutV60: () => void;
  onShortcutSeasonal?: () => void;
  onOpenInfo: () => void;
}

export function HeroSection({
  lang,
  storeSettings,
  mascotBounces,
  onMascotTap,
  onExploreCoffee,
  onExploreStory,
  onShortcutAllMenu,
  onShortcutV60,
  onShortcutSeasonal,
  onOpenInfo,
}: HeroSectionProps) {
  const t = COPY[lang];
  const ArrowIcon = lang === 'ar' ? (
    <ArrowRight className="h-4 w-4 rotate-180" />
  ) : (
    <ArrowRight className="h-4 w-4" />
  );

  const customHeroGreeting =
    lang === 'ar'
      ? storeSettings?.heroTitleAr || storeSettings?.heroTitle
      : storeSettings?.heroTitle || storeSettings?.heroTitleAr;

  const customHeroSubtitle =
    lang === 'ar'
      ? storeSettings?.heroSubtitleAr || storeSettings?.heroSubtitle
      : storeSettings?.heroSubtitle || storeSettings?.heroSubtitleAr;

  return (
    <section
      aria-labelledby="palm-hero-heading"
      className="space-y-4"
    >
      <div className="relative overflow-hidden rounded-3xl border border-[#C9A227]/30 bg-gradient-to-br from-[#10271E] via-[#17362A] to-[#0D2119] shadow-[0_24px_60px_-16px_rgba(4,14,10,0.72)]">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          {/* Editorial Copy & Primary Actions */}
          <div className="lg:col-span-6 flex flex-col justify-between p-6 sm:p-8 lg:p-11 gap-6">
            <div>
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 shrink-0 rounded-2xl bg-[#F5F0E6] p-1 border border-[#C9A227]/60 shadow-[0_3px_0_#CDBE9F]">
                  <img
                    src={BUSINESS.logoSrc}
                    alt={`${BUSINESS.nameEn} logo`}
                    className="h-full w-full rounded-xl object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-wide text-[#C9A227] truncate">
                    {customHeroGreeting || t.heroEyebrow}
                  </p>
                  <p className="text-xs font-semibold text-[#F5F0E6]/75 truncate">
                    {lang === 'ar'
                      ? `${BUSINESS.nameAr} · ${BUSINESS.nameEn}`
                      : `${BUSINESS.nameEn} · ${BUSINESS.nameAr}`}
                  </p>
                </div>
              </div>

              <h1
                id="palm-hero-heading"
                className="font-editorial mt-6 text-3xl sm:text-5xl lg:text-[54px] font-bold tracking-tight text-[#F5F0E6] leading-[1.12] [text-wrap:balance]"
              >
                {t.heroHeadline}
              </h1>

              <p className="mt-4 max-w-xl text-sm sm:text-base font-medium text-[#F5F0E6]/82 leading-relaxed">
                {customHeroSubtitle || t.brandTagline}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onExploreCoffee}
                  className="palm-btn-gold inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-extrabold whitespace-nowrap cursor-pointer"
                >
                  <span>{t.heroExploreBtn}</span>
                  {ArrowIcon}
                </button>

                <button
                  type="button"
                  onClick={onExploreStory}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-[#C9A227]/45 bg-[#132D23]/80 px-5 py-3 text-sm font-bold text-[#F5F0E6] hover:border-[#C9A227] hover:text-[#C9A227] whitespace-nowrap cursor-pointer transition-colors"
                >
                  <span>{t.heroStoryBtn}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#C9A227]/20 pt-4 text-xs font-semibold text-[#F5F0E6]/78">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-[#C9A227] shrink-0" />
                  <span>{storeSettings?.prepTime || t.heroPrepBadge}</span>
                </span>
                <span aria-hidden="true" className="text-[#C9A227]/60">
                  ·
                </span>
                <button
                  type="button"
                  onClick={onOpenInfo}
                  className="inline-flex items-center gap-1.5 text-[#C9A227] hover:underline cursor-pointer"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span>{t.heroVisitBtn}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Photography Stage + Subtle Mascot Accent */}
          <div className="lg:col-span-6 relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-auto lg:min-h-[420px] overflow-hidden bg-[#0E221A]">
            <img
              src={BRAND_MEDIA.heroCoffee}
              alt={
                lang === 'ar'
                  ? 'ركن القهوة المختصة في بالم مترك وتقطير V60'
                  : 'Palm Metric specialty coffee bar with steaming V60 pour-over and ceramic espresso cups'
              }
              referrerPolicy="no-referrer"
              loading="eager"
              className="h-full w-full object-cover"
            />
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0D2119]/85 via-[#0D2119]/20 to-transparent lg:bg-gradient-to-r rtl:lg:bg-gradient-to-l lg:from-[#0D2119]/55 lg:via-transparent lg:to-transparent"
              aria-hidden="true"
            />

            <motion.button
              type="button"
              onClick={onMascotTap}
              aria-label="Palm Metric Mascot"
              animate={{
                scale: mascotBounces > 0 ? [1, 1.09, 0.96, 1] : 1,
                rotate: mascotBounces > 0 ? [0, -6, 6, 0] : 0,
              }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="absolute bottom-3 end-3 sm:bottom-5 sm:end-5 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#C9A227] rounded-2xl"
            >
              <img
                src={BUSINESS.mascotSrc}
                alt="Palm Metric Mascot"
                className="animate-mascot h-20 w-20 sm:h-28 sm:w-28 object-contain drop-shadow-[0_14px_22px_rgba(0,0,0,0.62)] select-none"
              />
            </motion.button>
          </div>
        </div>
      </div>

      {/* Customer Convenience Shortcut Bar */}
      <nav
        aria-label="Quick shortcuts"
        className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1"
      >
        <button
          type="button"
          onClick={onShortcutAllMenu}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#C9A227]/35 bg-[#132D23] px-4 py-2 text-xs sm:text-sm font-bold text-[#F5F0E6] hover:border-[#C9A227] hover:text-[#C9A227] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
        >
          <Coffee className="h-4 w-4 text-[#C9A227]" />
          <span>{t.shortcutAllMenu}</span>
        </button>

        <button
          type="button"
          onClick={onShortcutV60}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#C9A227]/35 bg-[#132D23] px-4 py-2 text-xs sm:text-sm font-bold text-[#F5F0E6] hover:border-[#C9A227] hover:text-[#C9A227] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
        >
          <Droplets className="h-4 w-4 text-[#C9A227]" />
          <span>{t.shortcutV60}</span>
        </button>

        {onShortcutSeasonal && (
          <button
            type="button"
            onClick={onShortcutSeasonal}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#C9A227]/35 bg-[#132D23] px-4 py-2 text-xs sm:text-sm font-bold text-[#F5F0E6] hover:border-[#C9A227] hover:text-[#C9A227] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Sparkles className="h-4 w-4 text-[#C9A227]" />
            <span>{t.shortcutSeasonal}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenInfo}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#C9A227]/35 bg-[#132D23] px-4 py-2 text-xs sm:text-sm font-bold text-[#F5F0E6] hover:border-[#C9A227] hover:text-[#C9A227] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
        >
          <MapPin className="h-4 w-4 text-[#C9A227]" />
          <span>{t.shortcutContact}</span>
        </button>
      </nav>
    </section>
  );
}

interface FeaturedCoffeeSectionProps {
  lang: Language;
  featuredItems: MenuItem[];
  loading: boolean;
  coffeeOptions?: CoffeeOptionsSettings;
  getTempForItem: (itemId: string) => TempChoice;
  onSetTemp: (itemId: string, temp: TempChoice) => void;
  getCartQuantity: (item: MenuItem) => { cartKey: string; qty: number };
  onQuickAdd: (item: MenuItem, temp?: TempChoice) => void;
  onUpdateQty: (cartKey: string, delta: number) => void;
  onSelectItem: (item: MenuItem) => void;
}

export function FeaturedCoffeeSection({
  lang,
  featuredItems,
  loading,
  coffeeOptions,
  getTempForItem,
  onSetTemp,
  getCartQuantity,
  onQuickAdd,
  onUpdateQty,
  onSelectItem,
}: FeaturedCoffeeSectionProps) {
  const t = COPY[lang];

  if (loading && featuredItems.length === 0) {
    return (
      <section aria-label={t.featuredTitle} className="space-y-5">
        <div className="space-y-2">
          <div className="h-3.5 w-28 rounded bg-[#234A3B] animate-pulse" />
          <div className="h-8 w-56 rounded bg-[#234A3B] animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="palm-card overflow-hidden rounded-3xl"
            >
              <div className="aspect-[4/3] w-full bg-[#E4DAC4] animate-pulse" />
              <div className="p-5 space-y-3">
                <div className="h-3 w-24 rounded bg-[#E4DAC4] animate-pulse" />
                <div className="h-5 w-3/4 rounded bg-[#E4DAC4] animate-pulse" />
                <div className="h-10 w-full rounded-xl bg-[#E4DAC4] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (featuredItems.length === 0) return null;

  return (
    <section id="palm-featured-coffee" aria-labelledby="palm-featured-heading" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-[#C9A227]/20 pb-4">
        <div>
          <p className="text-xs font-bold tracking-wide text-[#C9A227]">{t.featuredKicker}</p>
          <h2
            id="palm-featured-heading"
            className="font-editorial mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F0E6] [text-wrap:balance]"
          >
            {t.featuredTitle}
          </h2>
        </div>
        <p className="text-xs sm:text-sm font-medium text-[#F5F0E6]/78 max-w-md leading-relaxed">
          {t.featuredSubtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {featuredItems.map((item) => {
          const primaryName = getItemTitle(item, lang);
          const secondaryName = getItemSecondaryTitle(item, lang);
          const descriptionText = getItemDescription(item, lang);
          const categoryLabel = getCategoryLabel(item.category, lang, item.categoryAr);
          const outOfStock = !item.inStock;
          const showsTemp = resolveItemSupportsTemperature(item, [], coffeeOptions);
          const currentTemp = showsTemp ? getTempForItem(item.id) : undefined;
          const { cartKey, qty } = getCartQuantity(item);
          const displayImage = item.imageUrl || getCategoryArtwork(item.category);

          return (
            <article
              key={`featured-${item.id}`}
              className={`palm-card flex flex-col overflow-hidden rounded-3xl ${
                outOfStock ? 'opacity-65' : 'palm-card-interactive'
              }`}
            >
              <button
                type="button"
                disabled={outOfStock}
                onClick={() => onSelectItem(item)}
                aria-label={`${primaryName} — ${t.viewDetailsBtn}`}
                className={`group relative aspect-[4/3] w-full overflow-hidden bg-[#132D23] text-start ${
                  outOfStock ? 'cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <StorageImage
                  src={displayImage}
                  alt={primaryName}
                  fallbackLabel={primaryName}
                  disabled={outOfStock}
                  className="h-full w-full transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </button>

              <div className="flex flex-1 flex-col justify-between p-5 gap-4">
                <div>
                  {/* Quiet unboxed metadata line */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-[#6E603A]">
                    <span>{categoryLabel}</span>
                    {showsTemp && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {t.hotLabel} / {t.coldLabel}
                        </span>
                      </>
                    )}
                    {outOfStock && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#912018]">{t.outOfStockLabel}</span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={outOfStock}
                    onClick={() => onSelectItem(item)}
                    className={`mt-1.5 w-full text-start ${
                      outOfStock ? 'cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  >
                    <h3 className="text-lg font-extrabold text-[#1A3C2F] leading-snug hover:text-[#7D5E08] transition-colors">
                      {primaryName}
                    </h3>
                    {secondaryName && secondaryName !== primaryName && (
                      <p className="mt-0.5 text-xs font-semibold text-[#546E61] truncate">
                        {secondaryName}
                      </p>
                    )}
                  </button>

                  {descriptionText && (
                    <p className="mt-2 line-clamp-2 text-xs text-[#4A6457] leading-relaxed">
                      {descriptionText}
                    </p>
                  )}
                </div>

                <div className="space-y-3 border-t border-[#1A3C2F]/10 pt-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-en text-base sm:text-lg font-extrabold text-[#1A3C2F] tabular-nums">
                      {formatPrice(item.price)} {t.currency}
                    </span>

                    {showsTemp && !outOfStock && (
                      <div className="inline-flex items-center gap-1 rounded-xl bg-[#E6DEC8] p-1">
                        <button
                          type="button"
                          onClick={() => onSetTemp(item.id, 'hot')}
                          className={`min-h-[34px] rounded-lg px-2.5 text-[11px] font-bold cursor-pointer transition-colors ${
                            currentTemp === 'hot'
                              ? 'bg-[#1A3C2F] text-[#C9A227]'
                              : 'text-[#3B594B] hover:text-[#1A3C2F]'
                          }`}
                        >
                          {t.hotLabel}
                        </button>
                        <button
                          type="button"
                          onClick={() => onSetTemp(item.id, 'cold')}
                          className={`min-h-[34px] rounded-lg px-2.5 text-[11px] font-bold cursor-pointer transition-colors ${
                            currentTemp === 'cold'
                              ? 'bg-[#1A3C2F] text-[#C9A227]'
                              : 'text-[#3B594B] hover:text-[#1A3C2F]'
                          }`}
                        >
                          {t.coldLabel}
                        </button>
                      </div>
                    )}
                  </div>

                  {!outOfStock ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectItem(item)}
                        className="min-h-[44px] rounded-xl border border-[#1A3C2F]/20 bg-[#EAE2D0] px-3.5 py-2 text-xs font-bold text-[#1A3C2F] hover:bg-[#DFD4BC] whitespace-nowrap cursor-pointer transition-colors"
                      >
                        {t.viewDetailsBtn}
                      </button>

                      {qty === 0 ? (
                        <button
                          type="button"
                          onClick={() => onQuickAdd(item, currentTemp)}
                          className="palm-btn-gold flex-1 min-h-[44px] rounded-xl px-4 py-2 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <Plus className="h-4 w-4 stroke-[2.5]" />
                          <span>{t.addBtn}</span>
                        </button>
                      ) : (
                        <div className="flex-1 flex h-11 items-center justify-between rounded-xl bg-[#1A3C2F] px-1.5 text-[#F5F0E6]">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(cartKey, -1)}
                            aria-label="Decrease quantity"
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#254E3E] text-[#F5F0E6] hover:bg-[#2E614D] cursor-pointer"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="font-en text-xs font-extrabold text-[#C9A227] tabular-nums">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(cartKey, 1)}
                            aria-label="Increase quantity"
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#C9A227] text-[#142A20] hover:bg-[#D4AE34] cursor-pointer"
                          >
                            <Plus className="h-4 w-4 stroke-[2.5]" />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="block rounded-xl bg-[#DFD7C4] py-2.5 text-center text-xs font-extrabold text-[#6E6758]">
                      {t.unavailableBtn}
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

interface CategoriesSectionProps {
  lang: Language;
  items: MenuItem[];
  selectedCategory: string;
  onSelectCategory: (categoryEn: string) => void;
}

function getCategoryTileIcon(catId: string) {
  switch (catId) {
    case 'coffee-of-the-day':
      return <Coffee className="h-5 w-5" />;
    case 'v60':
      return <Droplets className="h-5 w-5" />;
    case 'espresso':
      return <Flame className="h-5 w-5" />;
    case 'matcha':
      return <Leaf className="h-5 w-5" />;
    case 'specialty':
      return <Sparkles className="h-5 w-5" />;
    case 'cold-drinks':
      return <Snowflake className="h-5 w-5" />;
    case 'food':
      return <Croissant className="h-5 w-5" />;
    default:
      return <Coffee className="h-5 w-5" />;
  }
}

export function CategoriesSection({
  lang,
  items,
  selectedCategory,
  onSelectCategory,
}: CategoriesSectionProps) {
  const t = COPY[lang];

  return (
    <section id="palm-coffee-categories" aria-labelledby="palm-categories-heading" className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-[#C9A227]/20 pb-4">
        <div>
          <p className="text-xs font-bold tracking-wide text-[#C9A227]">{t.categoriesKicker}</p>
          <h2
            id="palm-categories-heading"
            className="font-editorial mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F0E6] [text-wrap:balance]"
          >
            {t.categoriesTitle}
          </h2>
        </div>
        <p className="text-xs sm:text-sm font-medium text-[#F5F0E6]/78 max-w-md leading-relaxed">
          {t.categoriesSubtitle}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory.toLowerCase() === cat.en.toLowerCase();
          const count = items.filter(
            (m) =>
              m.category.trim().toLowerCase() === cat.en.toLowerCase() ||
              m.category.trim().toLowerCase() === cat.id.toLowerCase(),
          ).length;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.en)}
              className={`group flex min-h-[112px] flex-col items-start justify-between rounded-2xl p-4 text-start transition-all cursor-pointer ${
                isSelected
                  ? 'border-2 border-[#C9A227] bg-[#F5F0E6] text-[#1A3C2F] shadow-[0_6px_0_#CDBE9F]'
                  : 'border border-[#C9A227]/25 bg-[#132D23] text-[#F5F0E6] hover:border-[#C9A227]/65 hover:-translate-y-0.5'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                    isSelected
                      ? 'bg-[#1A3C2F] text-[#C9A227]'
                      : 'bg-[#1D4435] text-[#C9A227] group-hover:bg-[#235240]'
                  }`}
                >
                  {getCategoryTileIcon(cat.id)}
                </span>
                {count > 0 && (
                  <span
                    className={`font-en text-xs font-bold tabular-nums ${
                      isSelected ? 'text-[#546E61]' : 'text-[#F5F0E6]/60'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </div>

              <div className="mt-3 w-full min-w-0">
                <span className="block truncate text-sm font-extrabold leading-tight">
                  {lang === 'ar' ? cat.ar : cat.en}
                </span>
                <span
                  className={`mt-1 block truncate text-[11px] font-semibold ${
                    isSelected ? 'text-[#546E61]' : 'text-[#F5F0E6]/65'
                  }`}
                >
                  {lang === 'ar' ? cat.en : cat.ar}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface BrandStorySectionProps {
  lang: Language;
  onOpenInfo: () => void;
}

export function BrandStorySection({ lang, onOpenInfo }: BrandStorySectionProps) {
  const t = COPY[lang];

  return (
    <section
      id="palm-brand-story"
      aria-labelledby="palm-story-heading"
      className="overflow-hidden rounded-3xl border border-[#C9A227]/30 bg-gradient-to-br from-[#122B22] to-[#0D2119] shadow-[0_22px_50px_-14px_rgba(4,14,10,0.68)]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-5 relative aspect-[4/3] lg:aspect-auto lg:min-h-[340px] overflow-hidden bg-[#0E221A]">
          <img
            src={BRAND_MEDIA.storyCraft}
            alt={
              lang === 'ar'
                ? 'تحضير قهوة V60 والماتشا يدوياً في بار بالم مترك'
                : 'Handcrafted V60 pour-over blooming beside a bamboo matcha whisk at Palm Metric'
            }
            referrerPolicy="no-referrer"
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0D2119]/65 via-transparent to-transparent"
            aria-hidden="true"
          />
        </div>

        <div className="lg:col-span-7 flex flex-col justify-between p-6 sm:p-8 lg:p-11 gap-6">
          <div>
            <p className="text-xs font-bold tracking-wide text-[#C9A227]">{t.storyKicker}</p>
            <h2
              id="palm-story-heading"
              className="font-editorial mt-2 text-2xl sm:text-4xl font-bold tracking-tight text-[#F5F0E6] leading-tight [text-wrap:balance]"
            >
              {t.storyTitle}
            </h2>
            <p className="mt-4 text-sm sm:text-base font-medium text-[#F5F0E6]/82 leading-relaxed max-w-2xl">
              {t.storyBody}
            </p>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-[#C9A227]/20 pt-5 text-xs sm:text-sm font-bold text-[#F5F0E6]">
              <span className="text-[#C9A227]">{t.storyHighlight1}</span>
              <span>{t.storyHighlight2}</span>
              <span>{t.storyHighlight3}</span>
            </div>

            <div>
              <button
                type="button"
                onClick={onOpenInfo}
                className="palm-btn-gold inline-flex min-h-[46px] items-center gap-2 rounded-2xl px-5 py-2.5 text-xs sm:text-sm font-extrabold whitespace-nowrap cursor-pointer"
              >
                <MapPin className="h-4 w-4" />
                <span>{t.storyContactBtn}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
