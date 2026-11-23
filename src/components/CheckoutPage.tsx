import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
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
  computeStableOrderRequestId,
  GuestFirebaseAuthUnavailableError,
  OrderRequestError,
  submitCustomerOrderRequest,
  type CreateOrderRequestItemInput,
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
import {
  buildBilingualOrderRequestWhatsAppSummary,
  buildBilingualWhatsAppSummary,
  type OrderRequestWhatsAppLine,
} from '../lib/whatsapp';
import type {
  CartItem,
  Language,
  MenuItem,
  OrderRequest,
  OrderType,
  StoreSettings,
  UserAccount,
} from '../types';
import { motion } from 'motion/react';

export { buildBilingualOrderRequestWhatsAppSummary, buildBilingualWhatsAppSummary };

export function buildOrderRequestItemsFromCart(
  cart: CartItem[],
): CreateOrderRequestItemInput[] {
  return cart.map((item) => {
    const temperature = item.temp
      ? item.temp === 'hot'
        ? ('Hot' as const)
        : ('Cold' as const)
      : undefined;
    const specialInstructions = item.note.trim() ? item.note.trim().slice(0, 160) : undefined;
    const selectedCustomizations =
      Array.isArray(item.customizations) && item.customizations.length > 0
        ? item.customizations.map((sel) => ({
            groupId: sel.groupId,
            groupName: sel.groupName,
            optionId: sel.optionId,
            optionName: sel.optionName,
          }))
        : undefined;

    return {
      itemId: item.itemId,
      name: item.name,
      ...(item.nameAr ? { nameAr: item.nameAr } : {}),
      quantity: item.quantity,
      ...(temperature ? { temperature } : {}),
      ...(specialInstructions ? { specialInstructions } : {}),
      ...(selectedCustomizations ? { selectedCustomizations } : {}),
    };
  });
}

function buildWhatsAppRequestLinesFromCart(cart: CartItem[]): OrderRequestWhatsAppLine[] {
  return cart.map((item) => {
    const temperature = item.temp
      ? item.temp === 'hot'
        ? ('Hot' as const)
        : ('Cold' as const)
      : undefined;
    const milkSel = item.customizations?.find(
      (sel) =>
        sel.groupId === 'legacy-milk' ||
        /milk|حليب/i.test(`${sel.groupId} ${sel.groupName} ${sel.optionName}`),
    );
    const milkOption = milkSel
      ? /coconut|جوز\s*الهند/i.test(`${milkSel.optionId} ${milkSel.optionName} ${milkSel.optionNameAr || ''}`)
        ? ('coconut' as const)
        : ('regular' as const)
      : undefined;
    const sizeSel = item.customizations?.find(
      (sel) =>
        /^(size|cup[-_]?size)$/i.test(sel.groupId.trim()) ||
        /size|حجم/i.test(`${sel.groupId} ${sel.groupName}`),
    );

    return {
      itemId: item.itemId,
      name: item.name,
      nameEn: item.nameEn,
      nameAr: item.nameAr,
      quantity: item.quantity,
      ...(temperature ? { temperature } : {}),
      ...(milkOption ? { milkOption } : {}),
      ...(sizeSel ? { selectedSizeId: sizeSel.optionId } : {}),
      ...(item.note.trim() ? { specialInstructions: item.note.trim().slice(0, 160) } : {}),
      ...(item.customizations && item.customizations.length > 0
        ? {
            selectedCustomizations: item.customizations.map((sel) => ({
              groupId: sel.groupId,
              optionId: sel.optionId,
              groupName: sel.groupName,
              groupNameAr: sel.groupNameAr,
              optionName: sel.optionName,
              optionNameAr: sel.optionNameAr,
            })),
          }
        : {}),
    };
  });
}

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
  onRequestSubmitted: (request: OrderRequest, whatsappUrl: string) => void;
  onGoToTracker: (requestId: string) => void;
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
  onRequestSubmitted,
  onGoToTracker,
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
  const submittingLockRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [attemptNonce, setAttemptNonce] = useState(() =>
    `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  );
  const [confirmedSubmission, setConfirmedSubmission] = useState<{
    request: OrderRequest;
    whatsappUrl: string;
    whatsappLines: OrderRequestWhatsAppLine[];
  } | null>(null);

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

  const estimatedSubtotal = useMemo(
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

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingLockRef.current || submitting) {
      return;
    }
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

    submittingLockRef.current = true;
    setSubmitting(true);
    void unlockOrderAlarmAudio();

    try {
      let realUid = auth.currentUser?.uid;
      if (!realUid) {
        const session = await ensureGuestFirebaseSession();
        realUid = session.user?.uid;
        if (!realUid) {
          throw new GuestFirebaseAuthUnavailableError(session.errorCode);
        }
      }

      const stableRequestId = computeStableOrderRequestId(
        realUid,
        checkoutFingerprint,
        attemptNonce,
      );
      const requestItems = buildOrderRequestItemsFromCart(cart);
      const whatsappLines = buildWhatsAppRequestLinesFromCart(cart);
      const orderNoteClean = notes.trim() || undefined;

      const submittedRequest = await submitCustomerOrderRequest({
        requestId: stableRequestId,
        attemptNonce,
        orderType,
        customerName: effectiveName,
        customerPhone: effectivePhone,
        orderNote: orderNoteClean,
        items: requestItems,
        lang,
      });

      const whatsappUrl = buildBilingualOrderRequestWhatsAppSummary({
        requestNumber: submittedRequest.requestNumber,
        requestId: submittedRequest.requestId,
        items: whatsappLines,
        customerName: submittedRequest.customerName,
        customerPhone: submittedRequest.customerContact,
        orderNote: orderNoteClean,
        whatsappNumber: storeSettings?.whatsappNumber,
      });

      // Rotate nonce & clear cart ONLY after Firestore confirms request creation
      setAttemptNonce(
        `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      );
      onClearCart();
      onRequestSubmitted(submittedRequest, whatsappUrl);
      setConfirmedSubmission({
        request: submittedRequest,
        whatsappUrl,
        whatsappLines,
      });
    } catch (err) {
      // Preserve cart, form inputs, and attemptNonce cleanly on failure
      if (err instanceof GuestFirebaseAuthUnavailableError) {
        setFormError(t.errSessionRequired);
      } else if (err instanceof OrderRequestError) {
        if (err.code === 'unauthenticated') {
          setFormError(t.errSessionRequired);
        } else if (err.reasonCode === 'INVALID_ITEM_ID') {
          setFormError(t.errInvalidItem);
        } else if (err.reasonCode === 'INVALID_QUANTITY') {
          setFormError(t.errInvalidQuantity);
        } else if (err.reasonCode === 'INVALID_CUSTOMER_NAME') {
          setFormError(t.errNameRequired);
        } else if (err.reasonCode === 'INVALID_CUSTOMER_CONTACT') {
          setFormError(t.errPhoneRequired);
        } else {
          setFormError(
            err.message && !err.message.startsWith('{')
              ? err.message
              : t.errRequestSubmitFailed,
          );
        }
      } else {
        const msg =
          err instanceof Error && !err.message.startsWith('{')
            ? err.message
            : t.errRequestSubmitFailed;
        setFormError(msg);
      }
    } finally {
      submittingLockRef.current = false;
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
          {t.requestCheckoutTitle}
        </h1>
      </div>

      {confirmedSubmission ? (
        <div className="palm-card mt-6 rounded-3xl p-6 sm:p-8 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1A3C2F]/10 pb-5">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFF8E1] border border-[#C9A227]/60 px-3 py-1 text-xs font-extrabold text-[#7A5B06]">
                <Clock className="h-3.5 w-3.5" />
                <span>{t.requestAwaitingAdminBadge}</span>
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#1A3C2F]">
                {t.requestSubmittedTitle}
              </h2>
              <p className="text-xs sm:text-sm text-[#3B594B] leading-relaxed">
                {t.requestSubmittedSubtitle}
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1A3C2F] text-[#C9A227]">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          </div>

          {confirmedSubmission.request.duplicatePrevented && (
            <p className="rounded-xl border border-[#C9A227]/50 bg-[#FFF8E1] px-3.5 py-2.5 text-xs font-bold text-[#7A5B06]">
              {t.requestDuplicateNotice}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl bg-[#EAE2D0] p-4 text-xs sm:text-sm text-[#1A3C2F]">
            <div>
              <span className="block text-[11px] font-bold text-[#546E61]">
                {t.requestReferenceLabel}
              </span>
              <span className="font-en text-base font-extrabold">
                {confirmedSubmission.request.requestNumber}
              </span>
              <span className="block font-en text-[11px] text-[#546E61] break-all">
                {confirmedSubmission.request.requestId}
              </span>
            </div>
            <div>
              <span className="block text-[11px] font-bold text-[#546E61]">
                {t.orderTypeTitle}
              </span>
              <span className="font-extrabold">{t.pickupLabel}</span>
            </div>
            <div>
              <span className="block text-[11px] font-bold text-[#546E61]">
                {t.nameLabel}
              </span>
              <span className="font-bold">{confirmedSubmission.request.customerName}</span>
            </div>
            <div>
              <span className="block text-[11px] font-bold text-[#546E61]">
                {t.phoneLabel}
              </span>
              <span className="font-en font-bold" dir="ltr">
                {confirmedSubmission.request.customerContact}
              </span>
            </div>
          </div>

          <ul className="divide-y divide-[#1A3C2F]/10 rounded-2xl border border-[#1A3C2F]/10 bg-white/70 px-4">
            {confirmedSubmission.whatsappLines.map((line, idx) => (
              <li key={`${line.itemId}-${idx}`} className="py-3 text-xs sm:text-sm text-[#1A3C2F]">
                <p className="font-extrabold">
                  <span className="font-en text-[#9E7C16] me-1.5">{line.quantity}x</span>
                  {lang === 'ar' ? line.nameAr || line.name || line.itemId : line.nameEn || line.name || line.itemId}
                  {line.temperature && (
                    <span className="mx-1.5 text-xs font-bold text-[#8C6E10]">
                      ({line.temperature === 'Hot' ? t.hotLabel : t.coldLabel})
                    </span>
                  )}
                </p>
                {line.selectedCustomizations && line.selectedCustomizations.length > 0 && (
                  <p className="mt-0.5 text-xs text-[#4A6457]">
                    {line.selectedCustomizations
                      .map((s) =>
                        lang === 'ar'
                          ? s.optionNameAr || s.optionName || s.optionId
                          : s.optionName || s.optionId,
                      )
                      .join(' · ')}
                  </p>
                )}
                {line.specialInstructions && (
                  <p className="mt-0.5 text-xs text-[#546E61]">{line.specialInstructions}</p>
                )}
              </li>
            ))}
          </ul>

          <div className="rounded-xl bg-[#EAE2D0] px-4 py-3 text-xs font-bold text-[#1A3C2F]">
            {t.requestPendingPriceNotice}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <a
              href={confirmedSubmission.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="palm-btn-gold flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold"
            >
              <MessageCircle className="h-4 w-4" />
              <span>{t.requestSendWhatsappBtn}</span>
            </a>

            <button
              type="button"
              onClick={() => onGoToTracker(confirmedSubmission.request.id)}
              className="palm-btn-forest flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold cursor-pointer"
            >
              <Clock className="h-4 w-4 text-[#C9A227]" />
              <span>{t.requestTrackStatusBtn}</span>
            </button>
          </div>
        </div>
      ) : cart.length === 0 ? (
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
              <p className="mt-1.5 text-xs sm:text-sm text-[#3B594B]">{t.requestPickupNoticeDesc}</p>
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

          {/* Estimated Totals & Submit Order Request */}
          <div className="palm-card rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between text-sm font-semibold text-[#4A6457]">
              <span>{t.estimatedSubtotalLabel}</span>
              <span className="font-en tabular-nums">
                {formatPrice(estimatedSubtotal)} {t.currency}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-[#1A3C2F]/10 pt-3 text-base sm:text-lg font-extrabold text-[#1A3C2F]">
              <span>{t.estimatedCheckoutTotalLabel}</span>
              <span className="font-en tabular-nums">
                {formatPrice(estimatedSubtotal)} {t.currency}
              </span>
            </div>

            <div className="rounded-xl border border-[#C9A227]/45 bg-[#FFF8E1] px-3.5 py-2.5 text-xs font-bold text-[#7A5B06]">
              {t.estimatedPriceDisclaimer}
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
              <span>
                {submitting ? t.submittingOrderRequestBtn : t.submitOrderRequestBtn}
              </span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

