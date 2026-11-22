import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Info, Minus, Plus, RotateCcw, SearchX, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { COPY } from '../data/i18n';
import { activeProjectId } from '../lib/firebase';
import { getCategoryArtwork } from '../lib/brandMedia';
import { resolveItemSupportsTemperature } from '../lib/customization';
import {
  buildCartKey,
  formatPrice,
  getCategoryLabel,
  getItemDescription,
  getItemSecondaryTitle,
  getItemTitle,
} from '../lib/format';
import {
  extractAvailableFilterOptions,
  filterAndSortMenuItems,
  getMenuItemOrigin,
  getMenuItemProcessing,
  getMenuItemTastingNotes,
  INITIAL_MENU_FILTERS,
  type MenuFilterState,
} from '../lib/menuFilter';
import type {
  Billboard,
  CartItem,
  Language,
  MenuItem,
  StoreSettings,
  TempChoice,
} from '../types';
import { BillboardCarousel } from './BillboardCarousel';
import {
  BrandStorySection,
  CategoriesSection,
  FeaturedCoffeeSection,
  HeroSection,
} from './HomepageShowcase';
import { StorageImage } from './MediaAsset';
import { MenuDiscoveryBar } from './MenuDiscoveryBar';
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
  const [filters, setFilters] = useState<MenuFilterState>(INITIAL_MENU_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tempSelections, setTempSelections] = useState<Record<string, TempChoice>>({});
  const [mascotBounces, setMascotBounces] = useState(0);
  const [copiedRules, setCopiedRules] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const updateFilters = (patch: Partial<MenuFilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const clearAllFilters = () => {
    setFilters(INITIAL_MENU_FILTERS);
  };

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

  const categoryArLookup = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((item) => {
      const cat = item.category.trim();
      if (cat && item.categoryAr && !map.has(cat.toLowerCase())) {
        map.set(cat.toLowerCase(), item.categoryAr);
      }
    });
    return map;
  }, [items]);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    items.forEach((item) => {
      if (item.category.trim()) unique.add(item.category.trim());
    });
    const list = ['All'];
    if (hasOffers) list.push('__offers__');
    return [...list, ...Array.from(unique)];
  }, [items, hasOffers]);

  const filterOptions = useMemo(
    () => extractAvailableFilterOptions(items, lang),
    [items, lang],
  );

  useEffect(() => {
    setFilters((prev) => {
      let changed = false;
      const next = { ...prev };

      if (
        prev.category !== 'All' &&
        !categories.some((c) => c.toLowerCase() === prev.category.toLowerCase())
      ) {
        next.category = 'All';
        changed = true;
      }

      if (
        prev.origin !== 'all' &&
        !filterOptions.origins.some((opt) => opt.value === prev.origin)
      ) {
        next.origin = 'all';
        changed = true;
      }

      if (
        prev.processingMethod !== 'all' &&
        !filterOptions.processingMethods.some((opt) => opt.value === prev.processingMethod)
      ) {
        next.processingMethod = 'all';
        changed = true;
      }

      if (
        prev.roastLevel !== 'all' &&
        !filterOptions.roastLevels.some((opt) => opt.value === prev.roastLevel)
      ) {
        next.roastLevel = 'all';
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [categories, filterOptions]);

  const filteredItems = useMemo(
    () => filterAndSortMenuItems(items, filters, lang),
    [items, filters, lang],
  );

  const getTempForItem = (itemId: string): TempChoice => tempSelections[itemId] ?? 'hot';

  const setTempForItem = (itemId: string, temp: TempChoice) => {
    setTempSelections((prev) => ({ ...prev, [itemId]: temp }));
  };

  const itemSupportsTemp = (item: MenuItem): boolean =>
    resolveItemSupportsTemperature(item, [], storeSettings?.coffeeOptions);

  const getCartQuantity = (item: MenuItem): { cartKey: string; qty: number } => {
    const temp = itemSupportsTemp(item) ? getTempForItem(item.id) : undefined;
    const exactKey = buildCartKey(item.id, '', temp);
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

  const scrollToElement = (elementId: string) => {
    const el = document.getElementById(elementId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const featuredItems = useMemo(() => {
    const available = items.filter((item) => item.inStock);
    const source = available.length > 0 ? available : items;
    if (source.length === 0) return [];

    const picked: MenuItem[] = [];
    const seenIds = new Set<string>();
    const seenCategories = new Set<string>();

    // Prioritize items with uploaded imagery & category diversity across the bar
    const sorted = [...source].sort((a, b) => {
      const aHasImg = a.imageUrl ? 1 : 0;
      const bHasImg = b.imageUrl ? 1 : 0;
      return bHasImg - aHasImg;
    });

    for (const item of sorted) {
      const catKey = item.category.trim().toLowerCase();
      if (!seenCategories.has(catKey)) {
        seenCategories.add(catKey);
        seenIds.add(item.id);
        picked.push(item);
        if (picked.length >= 6) break;
      }
    }

    if (picked.length < 6) {
      for (const item of sorted) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          picked.push(item);
          if (picked.length >= 6) break;
        }
      }
    }

    return picked;
  }, [items]);

  const handleSelectCategoryAndScroll = (cat: string) => {
    const normalized = cat.trim().toLowerCase();
    const matched = categories.find((c) => c.toLowerCase() === normalized);
    updateFilters({ category: matched ?? 'All' });
    scrollToElement('palm-menu-catalog');
  };

  const announcementText =
    lang === 'ar'
      ? storeSettings?.announcementAr || storeSettings?.announcement
      : storeSettings?.announcement || storeSettings?.announcementAr;

  return (
    <div className="mx-auto max-w-7xl px-3.5 pt-4 pb-32 sm:px-6 space-y-10 sm:space-y-14">
      {storeSettings && !storeSettings.storeOpen && (
        <div
          role="status"
          className="rounded-2xl border border-[#F97066]/40 bg-[#4A1C1A] px-4 py-3 text-center text-xs sm:text-sm font-extrabold text-[#FEE4E2]"
        >
          {t.storeClosedBanner}
        </div>
      )}

      {announcementText && (
        <div className="rounded-2xl border border-[#C9A227]/40 bg-[#132D23] px-4 py-2.5 text-center text-xs sm:text-sm font-bold text-[#F5F0E6]">
          {announcementText}
        </div>
      )}

      {/* Storefront Hero + Customer Convenience Shortcuts */}
      <HeroSection
        lang={lang}
        storeSettings={storeSettings}
        mascotBounces={mascotBounces}
        onMascotTap={() => setMascotBounces((n) => n + 1)}
        onExploreCoffee={() => scrollToElement('palm-featured-coffee')}
        onExploreStory={() => scrollToElement('palm-brand-story')}
        onShortcutAllMenu={() => handleSelectCategoryAndScroll('All')}
        onShortcutV60={() => handleSelectCategoryAndScroll('V60')}
        onShortcutSeasonal={
          spotlightEntries.length > 0
            ? () => scrollToElement('palm-seasonal-spotlight')
            : undefined
        }
        onOpenInfo={onOpenInfo}
      />

      {/* Firestore Billboards Carousel + Seasonal Spotlight */}
      <BillboardCarousel
        lang={lang}
        billboards={billboards}
        loading={billboardsLoading}
        onSelectCategory={handleSelectCategoryAndScroll}
      />

      <SeasonalSpotlight
        lang={lang}
        entries={spotlightEntries}
        onQuickAdd={onQuickAdd}
        onSelectItem={onSelectItem}
        onExploreCategory={handleSelectCategoryAndScroll}
      />

      {/* Featured Coffee Showcase */}
      <FeaturedCoffeeSection
        lang={lang}
        featuredItems={featuredItems}
        loading={menuLoading}
        coffeeOptions={storeSettings?.coffeeOptions}
        getTempForItem={getTempForItem}
        onSetTemp={setTempForItem}
        getCartQuantity={getCartQuantity}
        onQuickAdd={onQuickAdd}
        onUpdateQty={onUpdateQty}
        onSelectItem={onSelectItem}
      />

      {/* Seven Palm Metric Categories Grid */}
      <CategoriesSection
        lang={lang}
        items={items}
        selectedCategory={filters.category}
        onSelectCategory={handleSelectCategoryAndScroll}
      />

      {/* Complete Interactive Menu Catalog */}
      <section id="palm-menu-catalog" aria-labelledby="palm-full-menu-heading" className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-[#C9A227]/20 pb-4">
          <div>
            <p className="text-xs font-bold tracking-wide text-[#C9A227]">{t.brandName}</p>
            <h2
              id="palm-full-menu-heading"
              className="font-editorial mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F0E6] [text-wrap:balance]"
            >
              {t.fullMenuTitle}
            </h2>
          </div>
          <p className="text-xs sm:text-sm font-medium text-[#F5F0E6]/78 max-w-md leading-relaxed">
            {t.fullMenuSubtitle}
          </p>
        </div>

      {/* Category Filter Tabs */}
      <div
        id="palm-menu-tabs"
        role="tablist"
        aria-label="Menu categories"
        className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
      >
        {categories.map((cat) => {
          const active = filters.category.toLowerCase() === cat.toLowerCase();
          const catLabel =
            cat === 'All'
              ? t.allCategories
              : cat === '__offers__'
                ? t.offersTab
                : getCategoryLabel(cat, lang, categoryArLookup.get(cat.toLowerCase()));
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => updateFilters({ category: cat })}
              className={`min-h-[44px] rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                active
                  ? 'palm-btn-gold'
                  : 'bg-[#132D23] text-[#F5F0E6] border border-[#C9A227]/25 hover:border-[#C9A227]/65'
              }`}
            >
              {catLabel}
            </button>
          );
        })}
      </div>

      {/* Smart Search, Attribute Filters & Sorting Bar */}
      {!menuLoading && items.length > 0 && (
        <MenuDiscoveryBar
          lang={lang}
          filters={filters}
          options={filterOptions}
          totalCount={items.length}
          filteredCount={filteredItems.length}
          filtersOpen={filtersOpen}
          onToggleFiltersOpen={() => setFiltersOpen((open) => !open)}
          onChange={updateFilters}
          onClearAll={clearAllFilters}
        />
      )}

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
      ) : filteredItems.length === 0 ? (
        <div className="palm-card rounded-3xl p-8 sm:p-12 text-center">
          <SearchX className="mx-auto h-9 w-9 text-[#9E7C16]" />
          <h3 className="mt-4 text-lg sm:text-xl font-extrabold text-[#1A3C2F]">
            {t.emptySearchTitle}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-xs sm:text-sm font-medium text-[#4A6457] leading-relaxed">
            {t.emptySearchDesc}
          </p>
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={clearAllFilters}
              className="palm-btn-gold inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-xs sm:text-sm font-extrabold cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              <span>{t.clearAllFiltersBtn}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-3">
          {filteredItems.map((item) => {
            const outOfStock = !item.inStock;
            const showsTemp = itemSupportsTemp(item);
            const currentTemp = showsTemp ? getTempForItem(item.id) : undefined;
            const { cartKey, qty } = getCartQuantity(item);
            const primaryName = getItemTitle(item, lang);
            const secondaryName = getItemSecondaryTitle(item, lang);
            const descriptionText = getItemDescription(item, lang);
            const originText = getMenuItemOrigin(item, lang);
            const processingText = getMenuItemProcessing(item, lang);
            const tastingNotes = getMenuItemTastingNotes(item, lang);

            const spotlightBillboard = spotlightItemMap.get(item.id);
            const isSpotlighted = Boolean(spotlightBillboard);
            const hasDiscount = Boolean(item.originalPrice && item.originalPrice > item.price);
            const isOffer = Boolean(item.isOffer || hasDiscount);

            return (
              <article
                key={item.id}
                className={`palm-list-card flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl p-3 sm:p-3.5 ${
                  isSpotlighted
                    ? '!border-2 !border-[#C9A227] !shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_0_#A6831B,0_12px_22px_-8px_rgba(201,162,39,0.28)]'
                    : ''
                } ${outOfStock ? 'opacity-65' : 'palm-list-card-interactive'}`}
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onSelectItem(item)}
                    aria-label={primaryName}
                    className="block h-[76px] w-[76px] sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-xl text-start cursor-pointer"
                  >
                    <StorageImage
                      src={item.imageUrl || getCategoryArtwork(item.category)}
                      alt={primaryName}
                      fallbackLabel={primaryName}
                      disabled={outOfStock}
                      className="h-full w-full"
                    />
                  </button>

                  <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-bold text-[#6E603A]">
                      {spotlightBillboard && (
                        <>
                          <span className="text-[#947210] font-extrabold shrink-0">
                            {t.seasonalKicker}
                          </span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      <span className="truncate">
                        {getCategoryLabel(item.category, lang, item.categoryAr)}
                      </span>
                      {originText && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#1A3C2F] shrink-0">{originText}</span>
                        </>
                      )}
                      {processingText && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#3B594B] shrink-0">{processingText}</span>
                        </>
                      )}
                      {isOffer && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#7D5E08] font-extrabold shrink-0">
                            {item.offerLabel || t.specialOfferBadge}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className={outOfStock ? 'text-[#912018] shrink-0' : 'text-[#2D6249] shrink-0'}>
                        {outOfStock ? t.outOfStockLabel : t.inStockLabel}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectItem(item)}
                      className="min-w-0 text-start cursor-pointer"
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

                    {tastingNotes.length > 0 ? (
                      <p className="line-clamp-1 text-[11px] font-semibold text-[#3B594B] leading-snug">
                        {tastingNotes.join(' · ')}
                      </p>
                    ) : descriptionText ? (
                      <p className="line-clamp-1 text-[11px] text-[#4A6457] leading-snug">
                        {descriptionText}
                      </p>
                    ) : null}

                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-baseline gap-1.5 text-xs sm:text-sm font-extrabold text-[#1A3C2F] tabular-nums">
                        <span>
                          {formatPrice(item.price)} {t.currency}
                        </span>
                        {hasDiscount && item.originalPrice !== undefined && (
                          <span className="text-[11px] font-bold text-[#756C59] line-through">
                            {formatPrice(item.originalPrice)} {t.currency}
                          </span>
                        )}
                      </span>

                      {showsTemp && !outOfStock && (
                        <div className="inline-flex items-center gap-1 rounded-lg bg-[#E6DEC8] p-0.5">
                          <button
                            type="button"
                            onClick={() => setTempForItem(item.id, 'hot')}
                            className={`min-h-[34px] rounded-md px-2.5 text-[11px] font-bold cursor-pointer transition-colors ${
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
                            className={`min-h-[34px] rounded-md px-2.5 text-[11px] font-bold cursor-pointer transition-colors ${
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
                </div>

                <div className="shrink-0 flex items-center justify-end gap-2 border-t border-[#1A3C2F]/10 pt-2.5 sm:border-t-0 sm:pt-0">
                  <button
                    type="button"
                    onClick={() => onSelectItem(item)}
                    aria-label={`${t.viewDetailsBtn}: ${primaryName}`}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#E6DEC8] px-3 text-xs font-bold text-[#1A3C2F] hover:bg-[#DBD1B6] whitespace-nowrap cursor-pointer shrink-0"
                  >
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    <span>{t.viewDetailsBtn}</span>
                  </button>

                  {outOfStock ? (
                    <span className="inline-flex min-h-[44px] items-center rounded-xl bg-[#DFD7C4] px-3 text-xs font-extrabold text-[#6E6758] whitespace-nowrap">
                      {t.unavailableBtn}
                    </span>
                  ) : qty === 0 ? (
                    <button
                      type="button"
                      onClick={() => onQuickAdd(item, currentTemp)}
                      className="palm-btn-gold h-11 rounded-xl px-3.5 text-xs font-extrabold flex items-center justify-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                      <span>{t.addBtn}</span>
                    </button>
                  ) : (
                    <div className="flex h-11 items-center gap-1 rounded-xl bg-[#1A3C2F] px-1 text-[#F5F0E6] shadow-[0_3px_0_#0D2119]">
                      <button
                        type="button"
                        onClick={() => onUpdateQty(cartKey, -1)}
                        aria-label="Decrease quantity"
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#254E3E] text-[#F5F0E6] hover:bg-[#2E614D] cursor-pointer"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-[20px] text-center font-en text-xs font-extrabold tabular-nums text-[#C9A227]">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQty(cartKey, 1)}
                        aria-label="Increase quantity"
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#C9A227] text-[#142A20] hover:bg-[#D4AE34] cursor-pointer"
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
      </section>

      {/* Editorial Brand Story Section */}
      <BrandStorySection lang={lang} onOpenInfo={onOpenInfo} />
    </div>
  );
}
