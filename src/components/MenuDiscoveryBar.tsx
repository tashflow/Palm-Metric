import { ArrowUpDown, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { COPY } from '../data/i18n';
import {
  countActiveAttributeFilters,
  hasAnyActiveDiscoveryFilter,
  type AvailableFilterOptions,
  type MenuFilterState,
} from '../lib/menuFilter';
import type { AvailabilityFilter, Language, MenuSortOption } from '../types';

interface MenuDiscoveryBarProps {
  lang: Language;
  filters: MenuFilterState;
  options: AvailableFilterOptions;
  totalCount: number;
  filteredCount: number;
  filtersOpen: boolean;
  onToggleFiltersOpen: () => void;
  onChange: (patch: Partial<MenuFilterState>) => void;
  onClearAll: () => void;
}

export function MenuDiscoveryBar({
  lang,
  filters,
  options,
  totalCount,
  filteredCount,
  filtersOpen,
  onToggleFiltersOpen,
  onChange,
  onClearAll,
}: MenuDiscoveryBarProps) {
  const t = COPY[lang];
  const activeAttrCount = countActiveAttributeFilters(filters);
  const anyActive = hasAnyActiveDiscoveryFilter(filters);

  const availabilityChoices: Array<{ value: AvailabilityFilter; label: string }> = [
    { value: 'all', label: t.availabilityAll },
  ];
  if (options.inStockCount > 0) {
    availabilityChoices.push({ value: 'in-stock', label: t.availabilityInStock });
  }
  if (options.outOfStockCount > 0) {
    availabilityChoices.push({ value: 'out-of-stock', label: t.availabilityOutOfStock });
  }

  return (
    <div className="space-y-3">
      {/* Primary Search, Filters Toggle, and Sort Row */}
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        {/* Smart Search Bar */}
        <div className="relative flex-1 min-w-0">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 start-3.5 h-4 w-4 -translate-y-1/2 text-[#C9A227]"
          />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder={t.menuSearchPlaceholder}
            aria-label={t.menuSearchPlaceholder}
            className="w-full min-h-[46px] rounded-xl border border-[#C9A227]/30 bg-[#132D23] ps-10 pe-11 py-2.5 text-xs sm:text-sm font-medium text-[#F5F0E6] placeholder:text-[#F5F0E6]/48 focus:border-[#C9A227] focus:outline-none"
          />
          {filters.search.trim() !== '' && (
            <button
              type="button"
              onClick={() => onChange({ search: '' })}
              aria-label={t.clearSearchLabel}
              className="absolute top-1/2 end-1.5 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#F5F0E6]/75 hover:bg-[#1D4032] hover:text-[#C9A227] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sort & Filter Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleFiltersOpen}
            aria-expanded={filtersOpen}
            aria-controls="palm-menu-filter-panel"
            className={`min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold whitespace-nowrap cursor-pointer transition-colors ${
              filtersOpen || activeAttrCount > 0
                ? 'palm-btn-gold'
                : 'bg-[#132D23] text-[#F5F0E6] border border-[#C9A227]/30 hover:border-[#C9A227]/65'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" />
            <span>{t.filtersBtn}</span>
            {activeAttrCount > 0 && (
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-[#132D23] px-1.5 font-en text-[11px] font-extrabold text-[#C9A227] tabular-nums">
                {activeAttrCount}
              </span>
            )}
          </button>

          <label className="relative flex-1 sm:flex-initial inline-flex items-center">
            <span className="sr-only">{t.sortLabel}</span>
            <ArrowUpDown
              aria-hidden="true"
              className="pointer-events-none absolute start-3 h-4 w-4 text-[#C9A227]"
            />
            <select
              value={filters.sortBy}
              onChange={(e) => onChange({ sortBy: e.target.value as MenuSortOption })}
              aria-label={t.sortLabel}
              className="w-full sm:w-auto min-h-[46px] appearance-none rounded-xl border border-[#C9A227]/30 bg-[#132D23] ps-9 pe-8 py-2 text-xs sm:text-sm font-bold text-[#F5F0E6] focus:border-[#C9A227] focus:outline-none cursor-pointer"
            >
              <option value="default">{t.sortDefault}</option>
              <option value="price-asc">{t.sortPriceAsc}</option>
              <option value="price-desc">{t.sortPriceDesc}</option>
              <option value="name-asc">{t.sortNameAsc}</option>
              <option value="name-desc">{t.sortNameDesc}</option>
            </select>
          </label>
        </div>
      </div>

      {/* Collapsible Attribute Filter Panel */}
      {filtersOpen && (
        <div
          id="palm-menu-filter-panel"
          className="rounded-2xl border border-[#C9A227]/30 bg-[#132D23] p-4 sm:p-5 space-y-4 shadow-[0_14px_32px_-12px_rgba(4,14,10,0.6)]"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Origin Filter (only rendered when items contain verified origins) */}
            {options.origins.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-extrabold text-[#C9A227]">{t.filterOriginLabel}</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChange({ origin: 'all' })}
                    className={`min-h-[44px] rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                      filters.origin === 'all'
                        ? 'palm-btn-gold'
                        : 'bg-[#1A3C2F] text-[#F5F0E6] border border-[#C9A227]/25 hover:border-[#C9A227]/60'
                    }`}
                  >
                    {t.availabilityAll}
                  </button>
                  {options.origins.map((opt) => {
                    const active = filters.origin === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          onChange({ origin: active ? 'all' : opt.value })
                        }
                        className={`min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                          active
                            ? 'palm-btn-gold'
                            : 'bg-[#1A3C2F] text-[#F5F0E6] border border-[#C9A227]/25 hover:border-[#C9A227]/60'
                        }`}
                      >
                        <span>{opt.label}</span>
                        <span
                          className={`font-en text-[11px] tabular-nums ${
                            active ? 'text-[#142A20]/80' : 'text-[#F5F0E6]/65'
                          }`}
                        >
                          ({opt.count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Processing Method Filter (only rendered when items contain processingMethod) */}
            {options.processingMethods.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-extrabold text-[#C9A227]">{t.filterProcessLabel}</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChange({ processingMethod: 'all' })}
                    className={`min-h-[44px] rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                      filters.processingMethod === 'all'
                        ? 'palm-btn-gold'
                        : 'bg-[#1A3C2F] text-[#F5F0E6] border border-[#C9A227]/25 hover:border-[#C9A227]/60'
                    }`}
                  >
                    {t.availabilityAll}
                  </button>
                  {options.processingMethods.map((opt) => {
                    const active = filters.processingMethod === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          onChange({ processingMethod: active ? 'all' : opt.value })
                        }
                        className={`min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                          active
                            ? 'palm-btn-gold'
                            : 'bg-[#1A3C2F] text-[#F5F0E6] border border-[#C9A227]/25 hover:border-[#C9A227]/60'
                        }`}
                      >
                        <span>{opt.label}</span>
                        <span
                          className={`font-en text-[11px] tabular-nums ${
                            active ? 'text-[#142A20]/80' : 'text-[#F5F0E6]/65'
                          }`}
                        >
                          ({opt.count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Roast Level Filter (only rendered when items contain roastLevel) */}
            {options.roastLevels.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-extrabold text-[#C9A227]">{t.filterRoastLabel}</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChange({ roastLevel: 'all' })}
                    className={`min-h-[44px] rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                      filters.roastLevel === 'all'
                        ? 'palm-btn-gold'
                        : 'bg-[#1A3C2F] text-[#F5F0E6] border border-[#C9A227]/25 hover:border-[#C9A227]/60'
                    }`}
                  >
                    {t.availabilityAll}
                  </button>
                  {options.roastLevels.map((opt) => {
                    const active = filters.roastLevel === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          onChange({ roastLevel: active ? 'all' : opt.value })
                        }
                        className={`min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                          active
                            ? 'palm-btn-gold'
                            : 'bg-[#1A3C2F] text-[#F5F0E6] border border-[#C9A227]/25 hover:border-[#C9A227]/60'
                        }`}
                      >
                        <span>{opt.label}</span>
                        <span
                          className={`font-en text-[11px] tabular-nums ${
                            active ? 'text-[#142A20]/80' : 'text-[#F5F0E6]/65'
                          }`}
                        >
                          ({opt.count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Price Range Filter */}
            <div className="space-y-2">
              <p className="text-xs font-extrabold text-[#C9A227]">{t.filterPriceLabel}</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="1"
                  value={filters.minPrice}
                  onChange={(e) => onChange({ minPrice: e.target.value })}
                  placeholder={
                    options.minCatalogPrice !== null
                      ? `${t.filterMinPricePlaceholder} (${options.minCatalogPrice})`
                      : t.filterMinPricePlaceholder
                  }
                  aria-label={t.filterMinPricePlaceholder}
                  className="w-full min-h-[44px] rounded-xl border border-[#C9A227]/25 bg-[#1A3C2F] px-3 py-2 font-en text-xs sm:text-sm font-bold text-[#F5F0E6] placeholder:text-[#F5F0E6]/45 focus:border-[#C9A227] focus:outline-none tabular-nums"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="1"
                  value={filters.maxPrice}
                  onChange={(e) => onChange({ maxPrice: e.target.value })}
                  placeholder={
                    options.maxCatalogPrice !== null
                      ? `${t.filterMaxPricePlaceholder} (${options.maxCatalogPrice})`
                      : t.filterMaxPricePlaceholder
                  }
                  aria-label={t.filterMaxPricePlaceholder}
                  className="w-full min-h-[44px] rounded-xl border border-[#C9A227]/25 bg-[#1A3C2F] px-3 py-2 font-en text-xs sm:text-sm font-bold text-[#F5F0E6] placeholder:text-[#F5F0E6]/45 focus:border-[#C9A227] focus:outline-none tabular-nums"
                />
              </div>
            </div>

            {/* Availability Filter */}
            {availabilityChoices.length > 1 && (
              <div className="space-y-2">
                <p className="text-xs font-extrabold text-[#C9A227]">
                  {t.filterAvailabilityLabel}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {availabilityChoices.map((choice) => {
                    const active = filters.availability === choice.value;
                    return (
                      <button
                        key={choice.value}
                        type="button"
                        onClick={() => onChange({ availability: choice.value })}
                        className={`min-h-[44px] rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                          active
                            ? 'palm-btn-gold'
                            : 'bg-[#1A3C2F] text-[#F5F0E6] border border-[#C9A227]/25 hover:border-[#C9A227]/60'
                        }`}
                      >
                        {choice.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results Count + Clear Filters Summary Bar */}
      {totalCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#F5F0E6]/80">
          <p className="tabular-nums">
            {filteredCount} / {totalCount} {t.resultsCountLabel}
          </p>

          {anyActive && (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#C9A227]/35 bg-[#132D23] px-3.5 py-2 text-xs font-bold text-[#C9A227] hover:bg-[#1D4032] cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t.clearAllFiltersBtn}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
