import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2, Minus, Plus, X } from 'lucide-react';
import { COPY } from '../data/i18n';
import { getCategoryArtwork } from '../lib/brandMedia';
import {
  buildInitialCustomizationSelections,
  calculateCustomizationPricing,
  DEFAULT_COFFEE_OPTIONS,
  getActiveCustomizationGroups,
  getLocalizedLabel,
  resolveEffectiveCustomizationConfig,
  resolveItemSupportsTemperature,
  toggleCustomizationOption,
  validateCustomizationSelections,
} from '../lib/customization';
import {
  subscribeProductCustomization,
  type CustomizationLoadStatus,
} from '../lib/customizationSync';
import {
  formatPrice,
  getCategoryLabel,
  getItemDescription,
  getItemSecondaryTitle,
  getItemTitle,
  roundCurrency,
} from '../lib/format';
import {
  getMenuItemBrewMethods,
  getMenuItemOrigin,
  getMenuItemProcessing,
  getMenuItemRegion,
  getMenuItemRoastLabel,
  getMenuItemTastingNotes,
} from '../lib/menuFilter';
import type {
  CoffeeOptionsSettings,
  CustomizationGroup,
  Language,
  MenuItem,
  ProductCustomizationConfig,
  SelectedCustomizationItem,
  TempChoice,
} from '../types';
import { StorageImage } from './MediaAsset';

export interface AddToCartCustomizationPayload {
  basePrice: number;
  optionsTotal: number;
  unitPrice: number;
  selectedItems: SelectedCustomizationItem[];
  configUpdatedAtMs?: number;
}

interface MenuItemModalProps {
  lang: Language;
  item: MenuItem | null;
  coffeeOptions?: CoffeeOptionsSettings;
  onClose: () => void;
  onAddToCart: (
    item: MenuItem,
    quantity: number,
    note: string,
    temp?: TempChoice,
    customizationPayload?: AddToCartCustomizationPayload,
  ) => void;
}

function getGroupRuleText(group: CustomizationGroup, lang: Language): string {
  const t = COPY[lang];
  if (group.type === 'single') {
    return t.customizationSelectOne;
  }
  const min = group.required ? Math.max(1, group.minSelections) : group.minSelections;
  const max = group.maxSelections;
  if (min > 0 && max > 0 && max < 99) {
    return t.customizationSelectRange
      .replace('{min}', String(min))
      .replace('{max}', String(max));
  }
  if (min > 0) {
    return `${t.customizationSelectMin} ${min}`;
  }
  if (max > 0 && max < 99) {
    return `${t.customizationSelectMax} ${max}`;
  }
  return '';
}

export function MenuItemModal({
  lang,
  item,
  coffeeOptions = DEFAULT_COFFEE_OPTIONS,
  onClose,
  onAddToCart,
}: MenuItemModalProps) {
  const t = COPY[lang];
  const [quantity, setQuantity] = useState(1);
  const [temp, setTemp] = useState<TempChoice>('hot');
  const [note, setNote] = useState('');
  const [firestoreConfig, setFirestoreConfig] = useState<ProductCustomizationConfig | null>(null);
  const [hasFirestoreDoc, setHasFirestoreDoc] = useState(false);
  const [configStatus, setConfigStatus] = useState<CustomizationLoadStatus>('loading');
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [limitFeedbackGroupId, setLimitFeedbackGroupId] = useState<string | null>(null);
  const initializedForItemRef = useRef<string | null>(null);

  useEffect(() => {
    if (!item) {
      initializedForItemRef.current = null;
      return;
    }

    setQuantity(1);
    setTemp('hot');
    setNote('');
    setFirestoreConfig(null);
    setHasFirestoreDoc(false);
    setConfigStatus('loading');
    setSelections({});
    setShowValidationErrors(false);
    setLimitFeedbackGroupId(null);
    initializedForItemRef.current = null;

    const unsub = subscribeProductCustomization(item.id, (entry) => {
      const hasDoc = entry.status === 'ready' && entry.config !== null;
      setFirestoreConfig(entry.config);
      setHasFirestoreDoc(hasDoc);
      setConfigStatus(entry.status);
    });

    return () => unsub();
  }, [item]);

  useEffect(() => {
    if (!item) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, onClose]);

  const effectiveConfig = useMemo(
    () =>
      resolveEffectiveCustomizationConfig(
        item,
        firestoreConfig,
        hasFirestoreDoc,
        coffeeOptions,
      ),
    [item, firestoreConfig, hasFirestoreDoc, coffeeOptions],
  );

  const activeGroups = useMemo(
    () => getActiveCustomizationGroups(effectiveConfig),
    [effectiveConfig],
  );

  useEffect(() => {
    if (!item || configStatus === 'loading') return;
    if (initializedForItemRef.current !== item.id) {
      initializedForItemRef.current = item.id;
      setSelections(buildInitialCustomizationSelections(activeGroups));
    } else {
      setSelections((prev) => {
        const reconciled: Record<string, string[]> = {};
        activeGroups.forEach((group) => {
          const enabledSet = new Set(group.options.map((o) => o.id));
          const kept = (prev[group.id] ?? []).filter((id) => enabledSet.has(id));
          reconciled[group.id] = kept;
        });
        return reconciled;
      });
    }
  }, [item, configStatus, activeGroups]);

  const pricing = useMemo(
    () => calculateCustomizationPricing(item?.price ?? 0, effectiveConfig, selections),
    [item?.price, effectiveConfig, selections],
  );

  const validation = useMemo(
    () => validateCustomizationSelections(effectiveConfig, selections),
    [effectiveConfig, selections],
  );

  const showTempSelector = useMemo(
    () => resolveItemSupportsTemperature(item, activeGroups, coffeeOptions),
    [item, activeGroups, coffeeOptions],
  );

  if (!item) return null;

  const hasCustomizations = activeGroups.length > 0;
  const allowSpecialInstructions = effectiveConfig?.allowSpecialInstructions !== false;
  const estimatedLineTotal = roundCurrency(pricing.unitPrice * quantity);

  const handleToggleOption = (groupId: string, optionId: string) => {
    const result = toggleCustomizationOption(
      activeGroups,
      selections,
      groupId,
      optionId,
    );
    setSelections(result.next);
    if (result.maxReached) {
      setLimitFeedbackGroupId(groupId);
    } else if (limitFeedbackGroupId === groupId) {
      setLimitFeedbackGroupId(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item.inStock) return;

    if (!validation.valid) {
      setShowValidationErrors(true);
      return;
    }

    onAddToCart(
      item,
      quantity,
      note.trim(),
      showTempSelector ? temp : undefined,
      pricing.selectedItems.length > 0
        ? {
            basePrice: pricing.basePrice,
            optionsTotal: pricing.optionsTotal,
            unitPrice: pricing.unitPrice,
            selectedItems: pricing.selectedItems,
            configUpdatedAtMs: effectiveConfig?.updatedAtMs,
          }
        : undefined,
    );
    onClose();
  };

  const primaryName = getItemTitle(item, lang);
  const secondaryName = getItemSecondaryTitle(item, lang);
  const descriptionText = getItemDescription(item, lang);
  const categoryText = getCategoryLabel(item.category, lang, item.categoryAr);
  const hasDiscount = Boolean(item.originalPrice && item.originalPrice > item.price);

  const originText = getMenuItemOrigin(item, lang);
  const regionText = getMenuItemRegion(item, lang);
  const processText = getMenuItemProcessing(item, lang);
  const roastText = getMenuItemRoastLabel(item.roastLevel, lang);
  const tastingNotes = getMenuItemTastingNotes(item, lang);
  const brewMethods = getMenuItemBrewMethods(item);
  const altitudeText = (item.altitude || '').trim();
  const varietyText = (item.variety || '').trim();
  const producerText = (item.producer || '').trim();

  const profileRows: Array<{ label: string; value: string; fullWidth?: boolean }> = [];
  if (originText) profileRows.push({ label: t.originLabel, value: originText });
  if (regionText) profileRows.push({ label: t.regionLabel, value: regionText });
  if (processText) profileRows.push({ label: t.processLabel, value: processText });
  if (roastText) profileRows.push({ label: t.roastLabel, value: roastText });
  if (varietyText) profileRows.push({ label: t.varietyLabel, value: varietyText });
  if (altitudeText) profileRows.push({ label: t.altitudeLabel, value: altitudeText });
  if (tastingNotes.length > 0) {
    profileRows.push({
      label: t.tastingNotesLabel,
      value: tastingNotes.join(' · '),
      fullWidth: true,
    });
  }
  if (brewMethods.length > 0) {
    profileRows.push({
      label: t.brewMethodsLabel,
      value: brewMethods.join(' · '),
      fullWidth: true,
    });
  }
  if (producerText) {
    profileRows.push({
      label: t.producerLabel,
      value: producerText,
      fullWidth: true,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={primaryName}
      onClick={onClose}
    >
      <div
        className="palm-card w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-3xl">
          <StorageImage
            src={item.imageUrl || getCategoryArtwork(item.category)}
            alt={primaryName}
            fallbackLabel={primaryName}
            disabled={!item.inStock}
            className="h-full w-full"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 end-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#132D23]/85 text-[#F5F0E6] border border-[#C9A227]/40 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-bold text-[#8C6E10]">
                <span>{categoryText}</span>
                <span aria-hidden="true">·</span>
                <span className={item.inStock ? 'text-[#2D6249]' : 'text-[#912018]'}>
                  {item.inStock ? t.inStockLabel : t.outOfStockLabel}
                </span>
              </div>
              <h2 className="mt-1 text-xl sm:text-2xl font-extrabold text-[#1A3C2F]">
                {primaryName}
              </h2>
              {secondaryName && (
                <p className="text-xs font-semibold text-[#546E61]">{secondaryName}</p>
              )}
            </div>

            <div className="shrink-0 flex flex-col items-end">
              <span className="rounded-xl bg-[#1A3C2F] px-3 py-1.5 font-en text-base font-extrabold text-[#F5F0E6] tabular-nums">
                {formatPrice(item.price)} {t.currency}
              </span>
              {hasDiscount && item.originalPrice !== undefined && (
                <span className="mt-1 font-en text-xs font-bold text-[#756C59] line-through tabular-nums">
                  {formatPrice(item.originalPrice)} {t.currency}
                </span>
              )}
            </div>
          </div>

          {descriptionText ? (
            <p className="text-sm text-[#3B594B] leading-relaxed">{descriptionText}</p>
          ) : profileRows.length === 0 ? (
            <p className="text-sm font-medium text-[#546E61] leading-relaxed">
              {t.infoComingSoon}
            </p>
          ) : null}

          {profileRows.length > 0 && (
            <section
              aria-label={t.coffeeProfileHeading}
              className="rounded-2xl border border-[#1A3C2F]/12 bg-[#EFE8D7] p-4 space-y-3"
            >
              <h3 className="text-xs font-extrabold tracking-wide text-[#8C6E10]">
                {t.coffeeProfileHeading}
              </h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                {profileRows.map((row) => (
                  <div
                    key={row.label}
                    className={row.fullWidth ? 'sm:col-span-2' : ''}
                  >
                    <dt className="text-[11px] font-bold text-[#546E61]">{row.label}</dt>
                    <dd className="mt-0.5 text-xs sm:text-sm font-extrabold text-[#1A3C2F]">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {showTempSelector && item.inStock && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTemp('hot')}
                className={`flex-1 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold cursor-pointer transition-colors ${
                  temp === 'hot' ? 'bg-[#1A3C2F] text-[#C9A227]' : 'bg-[#E6DEC8] text-[#3B594B]'
                }`}
              >
                {t.hotLabel}
              </button>
              <button
                type="button"
                onClick={() => setTemp('cold')}
                className={`flex-1 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold cursor-pointer transition-colors ${
                  temp === 'cold' ? 'bg-[#1A3C2F] text-[#C9A227]' : 'bg-[#E6DEC8] text-[#3B594B]'
                }`}
              >
                {t.coldLabel}
              </button>
            </div>
          )}

          {/* Admin-Configured Product Customizations */}
          {configStatus === 'loading' && (
            <div className="flex items-center gap-2 rounded-2xl border border-[#1A3C2F]/10 bg-[#EFE8D7] px-3.5 py-2.5 text-xs font-bold text-[#4A6457]">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#8C6E10]" />
              <span>{t.customizationLoading}</span>
            </div>
          )}

          {configStatus === 'unavailable' && !hasCustomizations && (
            <p className="rounded-2xl border border-[#C9A227]/35 bg-[#EFE8D7] px-3.5 py-2.5 text-xs font-semibold text-[#546E61] leading-relaxed">
              {t.customizationUnavailableNotice}
            </p>
          )}

          {validation.hasBrokenRequiredGroup && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-2xl border border-[#912018]/25 bg-[#FEE4E2] px-3.5 py-2.5 text-xs font-bold text-[#912018]"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{t.customizationErrUnavailable}</span>
            </div>
          )}

          {hasCustomizations && (
            <section
              aria-label={t.customizationsHeading}
              className="space-y-4 pt-1"
            >
              <div className="flex items-center justify-between border-b border-[#1A3C2F]/10 pb-2">
                <h3 className="text-xs sm:text-sm font-extrabold text-[#1A3C2F]">
                  {t.customizationsHeading}
                </h3>
                {pricing.optionsTotal > 0 && (
                  <span className="font-en text-xs font-extrabold text-[#8C6E10] tabular-nums">
                    +{formatPrice(pricing.optionsTotal)} {t.currency}
                  </span>
                )}
              </div>

              <div className="space-y-4">
                {activeGroups.map((group) => {
                  const groupTitle = getLocalizedLabel(group.name, group.nameAr, lang);
                  const ruleText = getGroupRuleText(group, lang);
                  const selectedSet = new Set(selections[group.id] ?? []);
                  const groupError = showValidationErrors
                    ? validation.groupErrors[group.id]
                    : undefined;
                  const showLimitWarn = limitFeedbackGroupId === group.id;

                  return (
                    <fieldset
                      key={group.id}
                      className="rounded-2xl border border-[#1A3C2F]/12 bg-[#EFE8D7] p-3.5 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <legend className="text-xs sm:text-sm font-extrabold text-[#1A3C2F]">
                          {groupTitle}
                        </legend>
                        <div className="flex items-center gap-1.5 text-[11px] font-bold">
                          {ruleText && (
                            <span className="text-[#546E61]">{ruleText}</span>
                          )}
                          {ruleText && <span aria-hidden="true">·</span>}
                          <span
                            className={
                              group.required ? 'text-[#8C6E10] font-extrabold' : 'text-[#546E61]'
                            }
                          >
                            {group.required
                              ? t.customizationRequiredBadge
                              : t.customizationOptionalBadge}
                          </span>
                        </div>
                      </div>

                      <div
                        role={group.type === 'single' ? 'radiogroup' : 'group'}
                        aria-label={groupTitle}
                        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                      >
                        {group.options.map((opt) => {
                          const isSelected = selectedSet.has(opt.id);
                          const optLabel = getLocalizedLabel(opt.name, opt.nameAr, lang);
                          const disabledOpt = !item.inStock || !opt.enabled;

                          return (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={disabledOpt}
                              role={group.type === 'single' ? 'radio' : 'checkbox'}
                              aria-checked={isSelected}
                              onClick={() => handleToggleOption(group.id, opt.id)}
                              className={`min-h-[44px] flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-start text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                                isSelected
                                  ? 'bg-[#1A3C2F] text-[#F5F0E6] border border-[#C9A227]'
                                  : 'bg-[#FAF6EE] text-[#1A3C2F] border border-[#1A3C2F]/15 hover:border-[#C9A227]/70'
                              }`}
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                <span
                                  aria-hidden="true"
                                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-${
                                    group.type === 'single' ? 'full' : 'md'
                                  } border ${
                                    isSelected
                                      ? 'border-[#C9A227] bg-[#C9A227] text-[#142A20]'
                                      : 'border-[#1A3C2F]/35 bg-white'
                                  }`}
                                >
                                  {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                                </span>
                                <span className="truncate">{optLabel}</span>
                              </span>

                              <span
                                className={`shrink-0 font-en text-[11px] font-extrabold tabular-nums ${
                                  isSelected ? 'text-[#C9A227]' : 'text-[#546E61]'
                                }`}
                              >
                                {opt.additionalPrice > 0
                                  ? `+${formatPrice(opt.additionalPrice)} ${t.currency}`
                                  : t.freeOptionLabel}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {showLimitWarn && (
                        <p className="text-[11px] font-bold text-[#8C6E10]">
                          {t.customizationErrMax.replace('{max}', String(group.maxSelections))}
                        </p>
                      )}

                      {groupError && (
                        <p
                          role="alert"
                          className="flex items-center gap-1.5 text-[11px] font-bold text-[#912018]"
                        >
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {groupError.code === 'required'
                              ? t.customizationErrRequired
                              : groupError.code === 'min'
                                ? t.customizationErrMin.replace('{min}', String(groupError.min))
                                : groupError.code === 'max'
                                  ? t.customizationErrMax.replace('{max}', String(groupError.max))
                                  : t.customizationErrUnavailable}
                          </span>
                        </p>
                      )}
                    </fieldset>
                  );
                })}
              </div>
            </section>
          )}

          {allowSpecialInstructions && item.inStock && (
            <div className="space-y-1.5">
              <label
                htmlFor="modal-item-note"
                className="block text-xs font-bold text-[#4A6457]"
              >
                {t.specialInstructionsLabel}
              </label>
              <input
                id="modal-item-note"
                type="text"
                maxLength={160}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t.notesPlaceholder}
                className="min-h-[44px] w-full rounded-xl border border-[#1A3C2F]/18 bg-white px-3.5 text-xs sm:text-sm font-medium text-[#1A3C2F] placeholder:text-[#546E61]/65 focus:border-[#C9A227] focus:outline-none"
              />
            </div>
          )}

          {/* Live Price Breakdown */}
          {(pricing.optionsTotal > 0 || quantity > 1) && (
            <div className="rounded-2xl border border-[#1A3C2F]/10 bg-[#EFE8D7] px-3.5 py-2.5 space-y-1 text-xs font-bold">
              <div className="flex items-center justify-between text-[#4A6457]">
                <span>{t.basePriceLabel}</span>
                <span className="font-en tabular-nums">
                  {formatPrice(pricing.basePrice)} {t.currency}
                </span>
              </div>
              {pricing.optionsTotal > 0 && (
                <div className="flex items-center justify-between text-[#8C6E10]">
                  <span>{t.addonsPriceLabel}</span>
                  <span className="font-en tabular-nums">
                    +{formatPrice(pricing.optionsTotal)} {t.currency}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-[#1A3C2F]/10 pt-1 text-sm font-extrabold text-[#1A3C2F]">
                <span>{t.estimatedTotalLabel}</span>
                <span className="font-en tabular-nums">
                  {formatPrice(estimatedLineTotal)} {t.currency}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-3 border-t border-[#1A3C2F]/10">
            <div className="flex items-center rounded-xl bg-[#1A3C2F] p-1 text-[#F5F0E6]">
              <button
                type="button"
                disabled={!item.inStock}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[#254E3E] cursor-pointer disabled:opacity-50"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-en text-sm font-extrabold text-[#C9A227] tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                disabled={!item.inStock}
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                aria-label="Increase quantity"
                className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[#254E3E] cursor-pointer disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              type="submit"
              disabled={!item.inStock || validation.hasBrokenRequiredGroup}
              className="palm-btn-gold flex-1 min-h-[48px] rounded-xl px-4 py-3 text-sm font-extrabold cursor-pointer disabled:opacity-50"
            >
              {item.inStock
                ? `${t.addBtn} · ${formatPrice(estimatedLineTotal)} ${t.currency}`
                : t.unavailableBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
