import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Clock,
  MessageCircle,
  Minus,
  Plus,
  RefreshCw,
  ShoppingBag,
  Store,
  Trash2,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { COPY } from '../data/i18n';
import { auth, ensureGuestFirebaseSession } from '../lib/firebase';
import {
  BackendOrderError,
  computeDeterministicIdempotencyKey,
  createVerifiedPalmMetricOrder,
  GuestFirebaseAuthUnavailableError,
} from '../lib/firestoreSync';
import {
  auditCartItemAgainstLiveCatalog,
  formatSelectedCustomizationsForDisplay,
  getLocalizedLabel,
} from '../lib/customization';
import {
  subscribeProductCustomization,
  type CustomizationCacheEntry,
} from '../lib/customizationSync';
import { formatPrice, getItemTitle, roundCurrency } from '../lib/format';
import { unlockOrderAlarmAudio } from '../lib/readyAlarm';
import { buildBilingualWhatsAppSummary, buildOrderLineItems } from '../lib/whatsapp';
import type {
  CartItem,
  Language,
  MenuItem,
  Order,
  OrderType,
  StoreSettings,
  UserAccount,
} from '../types';
import { motion } from 'motion/react';

export { buildBilingualWhatsAppSummary };

interface CheckoutPageProps {
  lang: Language;
  cart: CartItem[];
  menuItems?: MenuItem[];
  currentUser: UserAccount | null;
  firebaseUser: User | null;
  authError?: string | null;
  storeSettings?: StoreSettings;
  onUpdateQty: (cartKey: string, delta: number) => void;
  onUpdateNote: (cartKey: string, note: string) => void;
  onRefreshCartItemPrice?: (
    cartKey: string,
    newUnitPrice: number,
    newBasePrice?: number,
  ) => void;
  onClearCart: () => void;
  onBackToMenu: () => void;
  onOpenAccount: () => void;
  onOrderPlaced: (
    orderId: string,
    orderNumber: string,
    whatsappUrl: string,
    receiptOrder: Order,
  ) => void;
}

export function CheckoutPage({
  lang,
  cart,
  menuItems = [],
  currentUser,
  firebaseUser,
  authError,
  storeSettings,
  onUpdateQty,
  onUpdateNote,
  onRefreshCartItemPrice,
  onClearCart,
  onBackToMenu,
  onOpenAccount,
  onOrderPlaced,
}: CheckoutPageProps) {
  const t = COPY[lang];
  const orderType: OrderType = 'pickup';
  const [liveConfigs, setLiveConfigs] = useState<Record<string, CustomizationCacheEntry>>({});
  const [customerName, setCustomerName] = useState(
    currentUser?.name ?? firebaseUser?.displayName ?? '',
  );
  const [customerPhone, setCustomerPhone] = useState(currentUser?.phone ?? '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [attemptNonce, setAttemptNonce] = useState(() =>
    `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  );

  useEffect(() => {
    if (!customerName && firebaseUser?.displayName && !currentUser) {
      setCustomerName(firebaseUser.displayName);
    }
  }, [firebaseUser?.displayName, customerName, currentUser]);

  const cartProductIdsKey = useMemo(() => {
    const ids = Array.from(new Set(cart.map((item) => item.itemId).filter(Boolean))).sort();
    return ids.join('|');
  }, [cart]);

  useEffect(() => {
    if (!cartProductIdsKey) {
      setLiveConfigs({});
      return;
    }
    const ids = cartProductIdsKey.split('|').filter(Boolean);
    const unsubs = ids.map((productId) =>
      subscribeProductCustomization(productId, (entry) => {
        setLiveConfigs((prev) => ({ ...prev, [productId]: entry }));
      }),
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [cartProductIdsKey]);

  const menuLookup = useMemo(() => {
    const map = new Map<string, MenuItem>();
    menuItems.forEach((m) => map.set(m.id, m));
    return map;
  }, [menuItems]);

  const cartAuditMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof auditCartItemAgainstLiveCatalog>>();
    cart.forEach((item) => {
      const liveMenuItem = menuLookup.get(item.itemId);
      const liveConfigEntry = liveConfigs[item.itemId];
      const configLoaded = Boolean(
        liveConfigEntry && liveConfigEntry.status !== 'unavailable',
      );
      map.set(
        item.cartKey,
        auditCartItemAgainstLiveCatalog(
          item,
          liveMenuItem,
          liveConfigEntry?.config,
          configLoaded,
          storeSettings?.coffeeOptions,
        ),
      );
    });
    return map;
  }, [cart, menuLookup, liveConfigs, storeSettings?.coffeeOptions]);

  const hasBlockingReview = useMemo(
    () => Array.from(cartAuditMap.values()).some((audit) => audit.status === 'review_required'),
    [cartAuditMap],
  );

  const subtotal = useMemo(
    () => roundCurrency(cart.reduce((sum, item) => sum + item.price * item.quantity, 0)),
    [cart],
  );

  const effectiveName = (currentUser ? currentUser.name : customerName).trim();
  const effectivePhone = (currentUser ? currentUser.phone : customerPhone).trim();

  const checkoutFingerprint = useMemo(() => {
    const cartSig = cart
      .map((item) => `${item.cartKey}:${item.quantity}:${item.note.trim()}`)
      .join('|');
    return `${cartSig}::${effectiveName}::${effectivePhone}::${notes.trim()}`;
  }, [cart, effectiveName, effectivePhone, notes]);

  const idempotencyKey = useMemo(
    () => computeDeterministicIdempotencyKey(checkoutFingerprint, attemptNonce),
    [checkoutFingerprint, attemptNonce],
  );

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (cart.length === 0) {
      setFormError(t.errEmptyCart);
      return;
    }
    if (hasBlockingReview) {
      setFormError(t.cartReviewSubmitBlocked);
      return;
    }
    if (!effectiveName) {
      setFormError(t.errNameRequired);
      return;
    }
    if (effectivePhone.length < 4) {
      setFormError(t.errPhoneRequired);
      return;
    }

    void unlockOrderAlarmAudio();
    setSubmitting(true);
    try {
      if (!auth.currentUser) {
        const session = await ensureGuestFirebaseSession();
        if (!session.user?.uid) {
          throw new GuestFirebaseAuthUnavailableError(session.errorCode);
        }
      }

      const orderItems = buildOrderLineItems(cart);
      const orderNoteClean = notes.trim() || undefined;

      const verifiedOrder = await createVerifiedPalmMetricOrder({
        idempotencyKey,
        orderType,
        customerName: effectiveName,
        customerPhone: effectivePhone,
        orderNote: orderNoteClean,
        items: orderItems,
        total: subtotal,
        lang,
      });

      const whatsappUrl = buildBilingualWhatsAppSummary({
        orderNumber: verifiedOrder.orderNumber,
        orderId: verifiedOrder.id,
        orderType: verifiedOrder.orderType,
        items: verifiedOrder.items,
        total: verifiedOrder.totalBill,
        customerName: verifiedOrder.customerName,
        customerPhone: verifiedOrder.customerContact,
        orderNote: orderNoteClean,
        whatsappNumber: storeSettings?.whatsappNumber,
      });

      const nowMs = Date.now();
      const receiptOrder: Order = {
        id: verifiedOrder.id,
        orderNumber: verifiedOrder.orderNumber,
        customerUid: verifiedOrder.customerUid,
        orderType: verifiedOrder.orderType,
        customerName: verifiedOrder.customerName,
        customerPhone: verifiedOrder.customerContact,
        orderNote: orderNoteClean,
        items: verifiedOrder.items,
        subtotal: verifiedOrder.subtotal,
        total: verifiedOrder.totalBill,
        currency: verifiedOrder.currency,
        pricingVersion: verifiedOrder.pricingVersion,
        idempotentReplay: verifiedOrder.idempotentReplay,
        status: verifiedOrder.status,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      };

      // Rotate nonce cleanly so any future order gets a distinct idempotency key
      setAttemptNonce(
        `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      );
      onClearCart();
      onOrderPlaced(verifiedOrder.id, verifiedOrder.orderNumber, whatsappUrl, receiptOrder);

      const isMobileDevice =
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isMobileDevice) {
        window.location.assign(whatsappUrl);
      } else {
        const anchor = document.createElement('a');
        anchor.href = whatsappUrl;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      }
    } catch (err) {
      if (err instanceof GuestFirebaseAuthUnavailableError) {
        setFormError(t.errSessionRequired);
      } else if (err instanceof BackendOrderError) {
        if (err.code === 'unauthenticated') {
          setFormError(t.errSessionRequired);
        } else if (err.code === 'unavailable' || err.code === 'internal') {
          setFormError(t.errBackendUnavailable);
        } else if (
          err.reasonCode === 'OUT_OF_STOCK' ||
          err.reasonCode === 'UNKNOWN_PRODUCT' ||
          err.reasonCode === 'INVALID_OR_DISABLED_OPTION' ||
          err.reasonCode === 'INVALID_OR_DISABLED_GROUP' ||
          err.reasonCode === 'CUSTOMIZATIONS_DISABLED' ||
          err.reasonCode === 'REQUIRED_GROUP_MISSING' ||
          err.reasonCode === 'BROKEN_REQUIRED_GROUP'
        ) {
          setFormError(t.errOutOfStockCheckout);
        } else {
          setFormError(
            err.message && !err.message.startsWith('{')
              ? err.message
              : t.errBackendValidationFailed,
          );
        }
      } else {
        const msg =
          err instanceof Error && !err.message.startsWith('{')
            ? err.message
            : t.errBackendValidationFailed;
        setFormError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-20 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBackToMenu}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#234A3B] px-4 py-2 text-sm font-bold text-[#F5F0E6] hover:bg-[#2B5947] cursor-pointer"
        >
          <BackIcon className="h-4 w-4 text-[#C9A227]" />
          <span>{t.backToMenu}</span>
        </button>

        <h1 className="text-xl sm:text-2xl font-extrabold text-[#F5F0E6]">
          {t.checkoutTitle}
        </h1>
      </div>

      {cart.length === 0 ? (
        <div className="palm-card mt-6 rounded-3xl p-8 sm:p-12 text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-[#C9A227]" />
          <h2 className="mt-4 text-xl font-extrabold text-[#1A3C2F]">{t.emptyCartTitle}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[#4A6457]">{t.emptyCartDesc}</p>
          <button
            type="button"
            onClick={onBackToMenu}
            className="palm-btn-gold mt-6 min-h-[46px] rounded-xl px-6 py-3 text-sm font-extrabold cursor-pointer"
          >
            {t.browseMenuBtn}
          </button>
        </div>
      ) : (
        <form onSubmit={handlePlaceOrder} className="mt-6 space-y-5">
          {/* Estimated Prep Time & Branch Pickup Banner */}
          <div className="palm-card rounded-3xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#1A3C2F]/10">
              <div className="flex items-center gap-2.5">
                <Clock className="h-5 w-5 text-[#9E7C16]" />
                <span className="text-sm font-bold text-[#1A3C2F]">{t.estimatedTimeTitle}</span>
              </div>
              <span className="rounded-xl bg-[#1A3C2F] px-3 py-1.5 text-xs font-extrabold text-[#C9A227]">
                {storeSettings?.prepTime || t.estimatedTimeVal}
              </span>
            </div>

            <div className="rounded-2xl bg-[#EAE2D0] p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-extrabold text-[#1A3C2F]">
                  <Store className="h-5 w-5 text-[#9E7C16]" />
                  <span>{t.pickupNoticeTitle}</span>
                </div>
                <span className="rounded-lg bg-[#1A3C2F] px-2.5 py-1 text-[11px] font-bold text-[#C9A227]">
                  {t.pickupLabel}
                </span>
              </div>
              <p className="mt-1.5 text-xs sm:text-sm text-[#3B594B]">{t.pickupNoticeDesc}</p>
            </div>
          </div>

          {/* Items List */}
          <div className="palm-card rounded-3xl p-5">
            <h2 className="text-base font-extrabold text-[#1A3C2F] mb-4">{t.itemsInOrder}</h2>
            <ul className="divide-y divide-[#1A3C2F]/10">
              {cart.map((item, index) => {
                const title = getItemTitle(item, lang);
                const customSummaryText = formatSelectedCustomizationsForDisplay(
                  item.customizations,
                  lang,
                );
                const liveMenuItem = menuLookup.get(item.itemId);
                const audit = cartAuditMap.get(item.cartKey) ?? {
                  status: 'ok' as const,
                  reasons: [],
                  expectedUnitPrice: item.price,
                };
                const canAutoRefreshPrice =
                  audit.status === 'review_required' &&
                  audit.reasons.length > 0 &&
                  audit.reasons.every((r) => r.code === 'price_changed') &&
                  Boolean(onRefreshCartItemPrice);

                return (
                  <motion.li
                    key={item.cartKey}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.04 }}
                    className="py-3.5 first:pt-0 last:pb-0 space-y-2.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm sm:text-base font-extrabold text-[#1A3C2F]">
                          {title}
                          {item.temp && (
                            <span className="mx-1.5 text-xs font-bold text-[#9E7C16]">
                              ({item.temp === 'hot' ? t.hotLabel : t.coldLabel})
                            </span>
                          )}
                        </p>
                        {customSummaryText && (
                          <p className="mt-0.5 text-xs font-semibold text-[#3B594B] leading-snug">
                            {customSummaryText}
                          </p>
                        )}
                        <p className="text-xs font-semibold text-[#546E61] tabular-nums">
                          {formatPrice(item.price)} {t.currency}
                          {item.basePrice !== undefined &&
                            item.customizationTotal !== undefined &&
                            item.customizationTotal > 0 && (
                              <span className="ms-1.5 text-[11px] text-[#8C6E10]">
                                ({formatPrice(item.basePrice)} + {formatPrice(item.customizationTotal)}{' '}
                                {t.currency})
                              </span>
                            )}
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="flex items-center rounded-xl bg-[#1A3C2F] p-1 text-[#F5F0E6]">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.cartKey, -1)}
                            aria-label="Decrease item quantity"
                            className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[#275544] cursor-pointer"
                          >
                            {item.quantity === 1 ? (
                              <Trash2 className="h-4 w-4 text-[#E88D72]" />
                            ) : (
                              <Minus className="h-4 w-4" />
                            )}
                          </button>
                          <span className="w-8 text-center font-en text-xs font-extrabold text-[#C9A227] tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.cartKey, 1)}
                            aria-label="Increase item quantity"
                            className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[#275544] cursor-pointer"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>

                        <span className="min-w-[60px] text-end font-en text-sm font-extrabold text-[#1A3C2F] tabular-nums">
                          {formatPrice(item.price * item.quantity)} {t.currency}
                        </span>
                      </div>
                    </div>

                    {audit.status === 'review_required' && (
                      <div
                        role="alert"
                        className="rounded-xl border border-[#C9A227]/60 bg-[#FFF8E1] px-3 py-2.5 text-[11px] font-bold text-[#7A5B06] space-y-1.5"
                      >
                        <p className="flex items-center gap-1.5 font-extrabold">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#9E7C16]" />
                          <span>{t.cartReviewRequiredTitle}</span>
                        </p>
                        {audit.reasons.map((reason, rIdx) => (
                          <p key={rIdx}>
                            {reason.code === 'item_unavailable'
                              ? t.cartReviewItemUnavailable
                              : reason.code === 'config_disabled'
                                ? t.cartReviewConfigDisabled
                                : reason.code === 'option_disabled'
                                  ? `${t.cartReviewOptionDisabled} (${getLocalizedLabel(reason.optionName, reason.optionNameAr, lang)})`
                                  : t.cartReviewPriceChanged
                                      .replace('{old}', formatPrice(reason.oldPrice))
                                      .replace('{new}', formatPrice(reason.newPrice))}
                          </p>
                        ))}
                        {canAutoRefreshPrice && onRefreshCartItemPrice && (
                          <button
                            type="button"
                            onClick={() =>
                              onRefreshCartItemPrice(
                                item.cartKey,
                                audit.expectedUnitPrice,
                                liveMenuItem?.price,
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A3C2F] px-3 py-1.5 text-[11px] font-extrabold text-[#C9A227] hover:bg-[#234A3B] cursor-pointer"
                          >
                            <RefreshCw className="h-3 w-3" />
                            <span>{t.cartReviewRefreshBtn}</span>
                          </button>
                        )}
                      </div>
                    )}

                    <input
                      type="text"
                      maxLength={160}
                      value={item.note}
                      onChange={(e) => onUpdateNote(item.cartKey, e.target.value)}
                      placeholder={t.notesPlaceholder}
                      className="h-10 w-full rounded-lg border border-[#1A3C2F]/15 bg-white px-3 text-xs text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
                    />
                  </motion.li>
                );
              })}
            </ul>
          </div>

          {/* Customer Details (Pickup Only) */}
          <div className="palm-card rounded-3xl p-5 space-y-4">
            {currentUser ? (
              <div className="rounded-2xl bg-[#EAE2D0] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-extrabold text-[#1A3C2F]">
                    {t.savedDeliveryTitle}
                  </span>
                  <button
                    type="button"
                    onClick={onOpenAccount}
                    className="text-xs font-bold text-[#8C6E10] underline cursor-pointer"
                  >
                    {t.editInAccount}
                  </button>
                </div>
                <div className="mt-2.5 space-y-1 text-sm text-[#2B483B]">
                  <p>
                    <span className="font-bold">{t.nameLabel}:</span> {currentUser.name}
                  </p>
                  <p>
                    <span className="font-bold">{t.phoneLabel}:</span>{' '}
                    <span className="font-en" dir="ltr">
                      {currentUser.phone}
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <h2 className="text-base font-extrabold text-[#1A3C2F]">
                  {t.customerDetailsTitle}
                </h2>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="chk-name" className="block text-xs font-bold text-[#3B594B]">
                      {t.nameLabel}
                    </label>
                    <input
                      id="chk-name"
                      type="text"
                      autoComplete="name"
                      maxLength={80}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder={t.namePlaceholder}
                      className="mt-1.5 h-12 w-full rounded-xl border border-[#1A3C2F]/20 bg-white px-3.5 text-sm font-medium text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="chk-phone" className="block text-xs font-bold text-[#3B594B]">
                      {t.phoneLabel}
                    </label>
                    <input
                      id="chk-phone"
                      type="tel"
                      dir="ltr"
                      autoComplete="tel"
                      maxLength={80}
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder={t.phonePlaceholder}
                      className="mt-1.5 h-12 w-full rounded-xl border border-[#1A3C2F]/20 bg-white px-3.5 text-sm font-medium text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="chk-notes" className="block text-xs font-bold text-[#3B594B]">
                {t.notesLabel}
              </label>
              <textarea
                id="chk-notes"
                rows={2}
                maxLength={220}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.notesPlaceholder}
                className="mt-1.5 w-full rounded-xl border border-[#1A3C2F]/20 bg-white p-3 text-sm font-medium text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
              />
            </div>
          </div>

          {/* Totals & Submit to Firestore + WhatsApp */}
          <div className="palm-card rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between text-sm font-semibold text-[#4A6457]">
              <span>{t.subtotalLabel}</span>
              <span className="font-en tabular-nums">
                {formatPrice(subtotal)} {t.currency}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-[#1A3C2F]/10 pt-3 text-lg font-extrabold text-[#1A3C2F]">
              <span>{t.totalLabel}</span>
              <span className="font-en tabular-nums">
                {formatPrice(subtotal)} {t.currency}
              </span>
            </div>

            <div className="rounded-xl bg-[#EAE2D0] px-3.5 py-2 text-xs font-bold text-[#1A3C2F]">
              {t.payAtBranchBadge}
            </div>

            {authError && (
              <p role="alert" className="rounded-xl bg-[#FEE4E2] px-3.5 py-2.5 text-xs font-bold text-[#912018]">
                {authError}
              </p>
            )}

            {hasBlockingReview && !formError && (
              <p role="alert" className="rounded-xl border border-[#C9A227]/60 bg-[#FFF8E1] px-3.5 py-2.5 text-xs font-bold text-[#7A5B06]">
                {t.cartReviewSubmitBlocked}
              </p>
            )}

            {formError && (
              <p role="alert" className="rounded-xl bg-[#FEE4E2] px-3.5 py-2.5 text-xs font-bold text-[#912018]">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || hasBlockingReview}
              className="palm-btn-gold mt-2 flex w-full min-h-[54px] items-center justify-center gap-2.5 rounded-2xl px-5 py-3.5 text-base font-extrabold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <MessageCircle className="h-5 w-5 stroke-[2.2]" />
              <span>{submitting ? t.submittingOrderBtn : t.placeOrderWhatsappBtn}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

