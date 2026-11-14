import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Clock, Copy, ExternalLink, MapPin, Minus, Plus, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { BUSINESS } from '../data/menu';
import { COPY } from '../data/i18n';
import { activeProjectId } from '../lib/firebase';
import type {
  Billboard,
  CartItem,
  Language,
  MenuItem,
  StoreSettings,
  TempChoice,
} from '../types';
import { BillboardCarousel } from './BillboardCarousel';
import { StorageImage } from './MediaAsset';
import {
  matchBillboardItems,
  SeasonalSpotlight,
  type SpotlightEntry,
} from './SeasonalSpotlight';

interface MenuPageProps {
  lang: Language;
  billboards: Billboard[];
  billboardsLoading: boolean;
  items: MenuItem[];
  menuLoading: boolean;
  menuError: string | null;
  authError?: string | null;
  onDismissAuthError?: () => void;
  cart: CartItem[];
  storeSettings?: StoreSettings;
  onQuickAdd: (item: MenuItem, temp?: TempChoice) => void;
  onUpdateQty: (cartKey: string, delta: number) => void;
  onSelectItem: (item: MenuItem) => void;
  onOpenInfo: () => void;
  canSeedCatalog: boolean;
  seeding: boolean;
  onSeedCatalog: () => void;
  onSignInAdmin: () => void;
  isSignedIn: boolean;
}

export function MenuPage({
  lang,
  billboards,
  billboardsLoading,
  items,
  menuLoading,
  menuError,
  authError,
  onDismissAuthError,
  cart,
  storeSettings,
  onQuickAdd,
  onUpdateQty,
  onSelectItem,
  onOpenInfo,
  canSeedCatalog,
  seeding,
  onSeedCatalog,
  onSignInAdmin,
  isSignedIn,
}: MenuPageProps) {
  const t = COPY[lang];
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [tempSelections, setTempSelections] = useState<Record<string, TempChoice>>({});
  const [mascotBounces, setMascotBounces] = useState(0);
  const [copiedRules, setCopiedRules] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  const handleCopyDomain = () => {
    if (!currentHost) return;
    void navigator.clipboard?.writeText(currentHost).then(() => {
      setCopiedDomain(true);
      window.setTimeout(() => setCopiedDomain(false), 2000);
    });
  };

  const recommendedRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /menu/{id} { allow list: if resource.data.inStock == true; }
    match /billboards/{id} { allow list: if resource.data.isActive == true; }
    match /mediaAssets/{id} { allow get: if resource.data.isPublic == true; }
  }
}`;

  const handleCopyRules = () => {
    void navigator.clipboard?.writeText(recommendedRules).then(() => {
      setCopiedRules(true);
      window.setTimeout(() => setCopiedRules(false), 2000);
    });
  };

  const hasOffers = useMemo(
    () => items.some((item) => item.isOffer || (item.originalPrice && item.originalPrice > item.price)),
    [items],
  );

  const categories = useMemo(() => {
    const unique = new Set<string>();
    items.forEach((item) => {
      if (item.category.trim()) unique.add(item.category.trim());
    });
    const list = ['All'];
    if (hasOffers) list.push('__offers__');
    return [...list, ...Array.from(unique)];
  }, [items, hasOffers]);

  useEffect(() => {
    if (
      selectedCategory !== 'All' &&
      !categories.some((c) => c.toLowerCase() === selectedCategory.toLowerCase())
    ) {
      setSelectedCategory('All');
    }
  }, [categories, selectedCategory]);

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'All') return items;
    if (selectedCategory === '__offers__') {
      return items.filter(
        (item) => item.isOffer || (item.originalPrice && item.originalPrice > item.price),
      );
    }
    return items.filter(
      (item) => item.category.toLowerCase() === selectedCategory.toLowerCase(),
    );
  }, [items, selectedCategory]);

  const getTempForItem = (itemId: string): TempChoice => tempSelections[itemId] ?? 'hot';

  const setTempForItem = (itemId: string, temp: TempChoice) => {
    setTempSelections((prev) => ({ ...prev, [itemId]: temp }));
  };

  const getCartQuantity = (item: MenuItem): { cartKey: string; qty: number } => {
    const temp = item.supportsTemp ? getTempForItem(item.id) : undefined;
    const baseKey = temp ? `${item.id}::${temp}` : item.id;
    const exactKey = `${baseKey}::`;
    const found = cart.find((c) => c.cartKey === exactKey);
    return { cartKey: exactKey, qty: found?.quantity ?? 0 };
  };

  const spotlightEntries = useMemo<SpotlightEntry[]>(
    () =>
      billboards.map((billboard) => ({
        billboard,
        matchedItems: matchBillboardItems(billboard, items),
      })),
    [billboards, items],
  );

  const spotlightItemMap = useMemo(() => {
    const map = new Map<string, Billboard>();
    spotlightEntries.forEach(({ billboard, matchedItems }) => {
      matchedItems.forEach((item) => {
        if (!map.has(item.id)) map.set(item.id, billboard);
      });
    });
    return map;
  }, [spotlightEntries]);

  const handleSelectBillboardCategory = (cat: string) => {
    setSelectedCategory(cat);
    const el = document.getElementById('palm-menu-tabs');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const announcementText =
    lang === 'ar'
      ? storeSettings?.announcementAr || storeSettings?.announcement
      : storeSettings?.announcement || storeSettings?.announcementAr;

  const customHeroGreeting =
    lang === 'ar'
      ? storeSettings?.heroTitleAr || storeSettings?.heroTitle
      : storeSettings?.heroTitle || storeSettings?.heroTitleAr;

  const customHeroSubtitle =
    lang === 'ar'
      ? storeSettings?.heroSubtitleAr || storeSettings?.heroSubtitle
      : storeSettings?.heroSubtitle || storeSettings?.heroSubtitleAr;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 pb-32 sm:px-6 space-y-6">
      {storeSettings && !storeSettings.storeOpen && (
        <div
          role="status"
          className="rounded-2xl border border-[#F97066]/40 bg-[#4A1C1A] px-4 py-3 text-center text-xs sm:text-sm font-extrabold text-[#FEE4E2]"
        >
          {t.storeClosedBanner}
        </div>
      )}

      {announcementText && (
        <div className="rounded-2xl border border-[#C9A227]/45 bg-[#132D23] px-4 py-2.5 text-center text-xs sm:text-sm font-bold text-[#F5F0E6]">
          {announcementText}
        </div>
      )}

      {/* Top Promotional Billboard / Hero Slider from Firestore */}
      <BillboardCarousel
        lang={lang}
        billboards={billboards}
        loading={billboardsLoading}
        onSelectCategory={handleSelectBillboardCategory}
      />

      {/* Brand Hero with Background-Free Animated Mascot */}
      <section className="relative overflow-hidden rounded-3xl border border-[#C9A227]/30 bg-gradient-to-br from-[#143025] via-[#1A3C2F] to-[#112920] px-5 py-6 sm:px-10 sm:py-8 shadow-[0_20px_50px_-14px_rgba(4,14,10,0.65)]">
        <svg
          className="pointer-events-none absolute -end-10 -top-10 h-60 w-60 text-[#C9A227]/12"
          viewBox="0 0 200 200"
          fill="none"
          aria-hidden="true"
        >
          <path d="M100 100 C100 45 55 15 10 15 L10 100 Z" stroke="currentColor" strokeWidth="2" />
          <path d="M105 95 C140 50 175 45 190 55 C175 85 140 100 105 95 Z" stroke="currentColor" strokeWidth="2" />
          <path d="M105 95 C105 40 125 10 140 15 C145 45 130 75 105 95 Z" stroke="currentColor" strokeWidth="2" />
          <rect x="10" y="108" width="85" height="36" stroke="currentColor" strokeWidth="2" />
          <rect x="108" y="108" width="82" height="82" stroke="currentColor" strokeWidth="2" />
        </svg>

        <div className="relative flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-10">
          <div className="relative flex items-center justify-center shrink-0 md:order-2">
            <div
              className="pointer-events-none absolute inset-0 scale-110 rounded-full bg-[radial-gradient(circle,rgba(201,162,39,0.24)_0%,rgba(245,240,230,0.06)_42%,rgba(26,60,47,0)_72%)]"
              aria-hidden="true"
            />
            <motion.button
              type="button"
              onClick={() => setMascotBounces((n) => n + 1)}
              aria-label="Palm Metric Mascot"
              animate={{
                scale: mascotBounces > 0 ? [1, 1.09, 0.96, 1] : 1,
                rotate: mascotBounces > 0 ? [0, -6, 6, 0] : 0,
              }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.94 }}
              className="relative cursor-pointer focus:outline-none"
            >
              <img
                src={BUSINESS.mascotSrc}
                alt="Palm Metric Mascot"
                className="animate-mascot h-40 w-40 sm:h-52 sm:w-52 object-contain drop-shadow-[0_18px_26px_rgba(0,0,0,0.48)] select-none"
              />
            </motion.button>
          </div>

          <div className="text-center md:text-start md:order-1 max-w-xl">
            <p className="text-xs sm:text-sm font-bold tracking-wide text-[#C9A227]">
              {customHeroGreeting || t.heroGreeting}
            </p>
            <h1 className="mt-1.5 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#F5F0E6] leading-tight">
              {lang === 'ar' ? (
                <>
                  <span>{BUSINESS.nameAr}</span>
                  <span className="mx-2.5 text-[#C9A227]">·</span>
                  <span className="font-en text-2xl sm:text-3xl font-bold text-[#F5F0E6]/90">
                    {BUSINESS.nameEn}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-en">{BUSINESS.nameEn}</span>
                  <span className="mx-2.5 text-[#C9A227]">·</span>
                  <span className="font-ar text-2xl sm:text-3xl font-bold text-[#F5F0E6]/90">
                    {BUSINESS.nameAr}
                  </span>
                </>
              )}
            </h1>

            <p className="mt-2.5 text-sm sm:text-base font-medium text-[#F5F0E6]/85 leading-relaxed">
              {customHeroSubtitle || t.brandTagline}
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center md:justify-start gap-3">
              <div className="inline-flex min-h-[42px] items-center gap-2 rounded-2xl border border-[#C9A227]/35 bg-[#132D23]/80 px-4 py-2 text-xs sm:text-sm font-bold text-[#F5F0E6]">
                <Clock className="h-4 w-4 text-[#C9A227]" />
                <span>{storeSettings?.prepTime || t.heroPrepBadge}</span>
              </div>

              <button
                type="button"
                onClick={onOpenInfo}
                className="palm-btn-gold inline-flex min-h-[42px] items-center gap-2 rounded-2xl px-4 py-2 text-xs sm:text-sm font-extrabold cursor-pointer"
              >
                <MapPin className="h-4 w-4" />
                <span>{t.heroVisitBtn}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Seasonal Spotlight populated from active Firestore Billboards */}
      <SeasonalSpotlight
        lang={lang}
        entries={spotlightEntries}
        onQuickAdd={onQuickAdd}
        onSelectItem={onSelectItem}
        onExploreCategory={handleSelectBillboardCategory}
      />

      {/* Category Filter Tabs */}
      <div
        id="palm-menu-tabs"
        role="tablist"
        aria-label="Menu categories"
        className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
      >
        {categories.map((cat) => {
          const active = selectedCategory.toLowerCase() === cat.toLowerCase();
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedCategory(cat)}
              className={`min-h-[40px] rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                active
                  ? 'palm-btn-gold'
                  : 'bg-[#132D23] text-[#F5F0E6] border border-[#C9A227]/25 hover:border-[#C9A227]/65'
              }`}
            >
              {cat === 'All' ? t.allCategories : cat === '__offers__' ? t.offersTab : cat}
            </button>
          );
        })}
      </div>

      {authError && (
        <div className="palm-card rounded-3xl p-5 sm:p-6 space-y-3 border-2 border-[#C9A227]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-[#1A3C2F]">
                {lang === 'ar'
                  ? 'إضافة نطاق التطبيق في Firebase Authentication'
                  : `Firebase Authentication Setup in ${activeProjectId}`}
              </h2>
              <p className="mt-1 text-xs sm:text-sm font-semibold text-[#3B594B] leading-relaxed">
                {authError}
              </p>
            </div>
            {onDismissAuthError && (
              <button
                type="button"
                onClick={onDismissAuthError}
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E6DEC8] text-[#1A3C2F] hover:bg-[#DDD3B8] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {currentHost && (
            <div
              dir="ltr"
              className="flex items-center justify-between gap-2 rounded-xl bg-[#132D23] px-3.5 py-2.5 text-xs text-[#F5F0E6] font-mono"
            >
              <span className="truncate">{currentHost}</span>
              <button
                type="button"
                onClick={handleCopyDomain}
                className="palm-btn-gold inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-sans font-extrabold whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedDomain ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>
                  {copiedDomain
                    ? lang === 'ar'
                      ? 'تم النسخ'
                      : 'Copied'
                    : lang === 'ar'
                      ? 'نسخ النطاق'
                      : 'Copy Domain'}
                </span>
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={`https://console.firebase.google.com/project/${activeProjectId}/authentication/settings`}
              target="_blank"
              rel="noopener noreferrer"
              className="palm-btn-forest inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold"
            >
              <span>
                {lang === 'ar'
                  ? 'فتح إعدادات Authorized Domains'
                  : 'Open Authentication Settings'}
              </span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      )}

      {menuLoading ? (
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="palm-list-card flex items-center gap-3 rounded-2xl p-2.5 sm:p-3"
            >
              <div className="h-[72px] w-[72px] sm:h-20 sm:w-20 shrink-0 rounded-xl bg-[#E4DAC4] animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-1/2 rounded bg-[#E4DAC4] animate-pulse" />
                <div className="h-3 w-2/3 rounded bg-[#E4DAC4] animate-pulse" />
                <div className="h-3 w-1/4 rounded bg-[#E4DAC4] animate-pulse" />
              </div>
              <div className="h-10 w-20 shrink-0 rounded-xl bg-[#E4DAC4] animate-pulse" />
            </div>
          ))}
        </div>
      ) : menuError && items.length === 0 ? (
        <div className="palm-card rounded-3xl p-6 sm:p-8 space-y-4">
          <div className="flex items-start gap-3">
            <SlidersHorizontal className="h-6 w-6 shrink-0 text-[#912018] mt-0.5" />
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#912018]">
                {lang === 'ar'
                  ? 'صلاحيات قاعدة البيانات تمنع قراءة القائمة'
                  : `Firestore Rules Required in ${activeProjectId}`}
              </h2>
              <p className="mt-1 text-xs sm:text-sm font-semibold text-[#3B594B] leading-relaxed">
                {menuError}
              </p>
            </div>
          </div>

          <pre
            dir="ltr"
            className="overflow-x-auto rounded-2xl bg-[#132D23] p-4 text-xs text-[#F5F0E6] font-mono leading-relaxed"
          >
            {recommendedRules}
          </pre>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCopyRules}
              className="palm-btn-gold inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-extrabold cursor-pointer"
            >
              {copiedRules ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span>
                {copiedRules
                  ? lang === 'ar'
                    ? 'تم النسخ'
                    : 'Copied'
                  : lang === 'ar'
                    ? 'نسخ قواعد Firestore'
                    : 'Copy Firestore Rules'}
              </span>
            </button>

            <a
              href={`https://console.firebase.google.com/project/${activeProjectId}/firestore/rules`}
              target="_blank"
              rel="noopener noreferrer"
              className="palm-btn-forest inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold"
            >
              <span>
                {lang === 'ar' ? 'فتح قواعد Firebase Console' : 'Open Firebase Console Rules'}
              </span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="palm-card rounded-3xl p-8 sm:p-12 text-center">
          <SlidersHorizontal className="mx-auto h-9 w-9 text-[#9E7C16]" />
          <h2 className="mt-4 text-xl font-extrabold text-[#1A3C2F]">{t.menuEmptyTitle}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#4A6457]">{t.menuEmptyDesc}</p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {canSeedCatalog ? (
              <button
                type="button"
                disabled={seeding}
                onClick={onSeedCatalog}
                className="palm-btn-gold inline-flex min-h-[46px] items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-extrabold cursor-pointer disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                <span>{seeding ? t.seedingMenuBtn : t.seedMenuBtn}</span>
              </button>
            ) : !isSignedIn ? (
              <button
                type="button"
                onClick={onSignInAdmin}
                className="palm-btn-forest inline-flex min-h-[46px] items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold cursor-pointer"
              >
                {t.adminSignInSeedBtn}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-3">
          {filteredItems.map((item) => {
            const outOfStock = !item.inStock;
            const currentTemp = item.supportsTemp ? getTempForItem(item.id) : undefined;
            const { cartKey, qty } = getCartQuantity(item);
            const primaryName =
              lang === 'ar' ? item.nameAr || item.name : item.nameEn || item.name;
            const secondaryName =
              lang === 'ar'
                ? item.nameEn || (item.nameAr ? item.name : '')
                : item.nameAr || '';
            const descriptionText =
              lang === 'ar' ? item.descriptionAr || item.description : item.description;

            const spotlightBillboard = spotlightItemMap.get(item.id);
            const isSpotlighted = Boolean(spotlightBillboard);
            const hasDiscount = Boolean(item.originalPrice && item.originalPrice > item.price);
            const isOffer = Boolean(item.isOffer || hasDiscount);

            return (
              <article
                key={item.id}
                className={`palm-list-card flex items-center gap-2.5 sm:gap-3 rounded-2xl p-2.5 sm:p-3 ${
                  isSpotlighted
                    ? '!border-2 !border-[#C9A227] !shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_0_#A6831B,0_12px_22px_-8px_rgba(201,162,39,0.28)]'
                    : ''
                } ${outOfStock ? 'opacity-60' : 'palm-list-card-interactive'}`}
              >
                <button
                  type="button"
                  disabled={outOfStock}
                  onClick={() => onSelectItem(item)}
                  aria-label={primaryName}
                  className={`block h-[72px] w-[72px] sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-xl text-left ${
                    outOfStock ? 'cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <StorageImage
                    src={item.imageUrl}
                    alt={primaryName}
                    fallbackLabel={primaryName}
                    disabled={outOfStock}
                    className="h-full w-full"
                  />
                </button>

                <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#6E603A] truncate">
                    {spotlightBillboard && (
                      <>
                        <span className="text-[#947210] font-extrabold shrink-0">
                          {t.seasonalKicker}
                        </span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span className="truncate">
                      {lang === 'ar' && item.categoryAr ? item.categoryAr : item.category}
                    </span>
                    {isOffer && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#7D5E08] font-extrabold shrink-0">
                          {item.offerLabel || t.specialOfferBadge}
                        </span>
                      </>
                    )}
                    {outOfStock && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#912018] shrink-0">{t.outOfStockLabel}</span>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={outOfStock}
                    onClick={() => onSelectItem(item)}
                    className={`min-w-0 text-start ${
                      outOfStock ? 'cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  >
                    <h3 className="truncate text-sm sm:text-[15px] font-extrabold leading-tight text-[#1A3C2F]">
                      {primaryName}
                    </h3>
                    {secondaryName && secondaryName !== primaryName && (
                      <p className="truncate text-[11px] font-semibold text-[#546E61] leading-snug">
                        {secondaryName}
                      </p>
                    )}
                  </button>

                  {descriptionText && (
                    <p className="line-clamp-1 text-[11px] text-[#4A6457] leading-snug">
                      {descriptionText}
                    </p>
                  )}

                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-baseline gap-1.5 text-xs sm:text-sm font-extrabold text-[#1A3C2F] tabular-nums">
                      <span>
                        {item.price} {t.currency}
                      </span>
                      {hasDiscount && (
                        <span className="text-[11px] font-bold text-[#756C59] line-through">
                          {item.originalPrice} {t.currency}
                        </span>
                      )}
                    </span>

                    {item.supportsTemp && !outOfStock && (
                      <div className="inline-flex items-center gap-1 rounded-lg bg-[#E6DEC8] p-0.5">
                        <button
                          type="button"
                          onClick={() => setTempForItem(item.id, 'hot')}
                          className={`min-h-[26px] rounded-md px-2 text-[11px] font-bold cursor-pointer transition-colors ${
                            currentTemp === 'hot'
                              ? 'bg-[#1A3C2F] text-[#C9A227]'
                              : 'text-[#3B594B] hover:text-[#1A3C2F]'
                          }`}
                        >
                          {t.hotLabel}
                        </button>
                        <button
                          type="button"
                          onClick={() => setTempForItem(item.id, 'cold')}
                          className={`min-h-[26px] rounded-md px-2 text-[11px] font-bold cursor-pointer transition-colors ${
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
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  {outOfStock ? (
                    <span className="rounded-xl bg-[#DFD7C4] px-2.5 py-2 text-[11px] font-extrabold text-[#6E6758] whitespace-nowrap">
                      {t.unavailableBtn}
                    </span>
                  ) : qty === 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onSelectItem(item)}
                        aria-label={`${t.customizeBtn}: ${primaryName}`}
                        title={t.customizeBtn}
                        className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-[#E6DEC8] text-[#1A3C2F] hover:bg-[#DBD1B6] cursor-pointer shrink-0"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onQuickAdd(item, currentTemp)}
                        className="palm-btn-gold h-10 rounded-xl px-3 sm:px-3.5 text-xs font-extrabold flex items-center justify-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span>{t.addBtn}</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex h-10 items-center gap-1 rounded-xl bg-[#1A3C2F] px-1 text-[#F5F0E6] shadow-[0_3px_0_#0D2119]">
                      <button
                        type="button"
                        onClick={() => onUpdateQty(cartKey, -1)}
                        aria-label="Decrease quantity"
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#254E3E] text-[#F5F0E6] hover:bg-[#2E614D] cursor-pointer"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-[18px] text-center font-en text-xs font-extrabold tabular-nums text-[#C9A227]">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQty(cartKey, 1)}
                        aria-label="Increase quantity"
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C9A227] text-[#142A20] hover:bg-[#D4AE34] cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
