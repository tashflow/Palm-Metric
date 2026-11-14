import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  MessageCircle,
  Minus,
  Navigation,
  Plus,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { BUSINESS } from '../data/menu';
import { COPY } from '../data/i18n';
import { useGeolocation } from '../hooks/useGeolocation';
import { auth, signInAsGuest } from '../lib/firebase';
import { createOrder } from '../lib/firestoreSync';
import { unlockOrderAlarmAudio } from '../lib/readyAlarm';
import type {
  CartItem,
  GeoLocation,
  Language,
  Order,
  OrderType,
  StoreSettings,
  UserAccount,
} from '../types';
import { DeliveryMapPicker } from './GoogleMapsLocation';

interface CheckoutPageProps {
  lang: Language;
  cart: CartItem[];
  currentUser: UserAccount | null;
  firebaseUser: User | null;
  authError?: string | null;
  storeSettings?: StoreSettings;
  onUpdateQty: (cartKey: string, delta: number) => void;
  onUpdateNote: (cartKey: string, note: string) => void;
  onClearCart: () => void;
  onBackToMenu: () => void;
  onOpenAccount: () => void;
  onUpdateSavedLocation?: (loc: GeoLocation) => void;
  onOrderPlaced: (
    orderId: string,
    orderNumber: string,
    whatsappUrl: string,
    receiptOrder: Order,
  ) => void;
}

function parseCoordsFromLink(url: string): GeoLocation | undefined {
  const match = url.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!match) return undefined;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return undefined;
  }
  return { lat, lng };
}

export function buildBilingualWhatsAppSummary(params: {
  orderNumber: string;
  orderId: string;
  orderType: OrderType;
  items: CartItem[];
  total: number;
  customerName: string;
  customerPhone: string;
  deliveryLocation?: string;
  mapsLink?: string;
  orderNote?: string;
  whatsappNumber?: string;
}): string {
  const lines: string[] = [];
  lines.push('🌴 *Palm Metric | بالم مترك*');
  lines.push(`*Order ID / رقم الطلب:* ${params.orderNumber} (${params.orderId})`);
  lines.push(
    params.orderType === 'delivery'
      ? '*Order Type / نوع الطلب:* Delivery | توصيل'
      : '*Order Type / نوع الطلب:* Pickup | استلام من الفرع',
  );
  lines.push('---------------------------');
  lines.push('*Items / الطلبات:*');

  params.items.forEach((item) => {
    const tempSuffix = item.temp
      ? item.temp === 'hot'
        ? ' (Hot / حار)'
        : ' (Cold / بارد)'
      : '';
    const noteSuffix = item.note ? ` [${item.note}]` : '';
    const displayTitle =
      item.nameAr && item.nameEn && item.nameAr !== item.nameEn
        ? `${item.nameEn} / ${item.nameAr}`
        : item.name;
    lines.push(
      `• ${item.quantity}x ${displayTitle}${tempSuffix}${noteSuffix} — ${item.price * item.quantity} ﷼`,
    );
  });

  lines.push('---------------------------');
  lines.push(`*Total / الإجمالي:* ${params.total} ﷼`);
  lines.push(`*Customer / العميل:* ${params.customerName}`);
  lines.push(`*Mobile / الجوال:* ${params.customerPhone}`);

  if (params.deliveryLocation) {
    lines.push(`*Delivery Location / موقع التوصيل:* ${params.deliveryLocation}`);
  }
  if (params.mapsLink) {
    lines.push(`*Google Maps / رابط الخريطة:* ${params.mapsLink}`);
  }
  if (params.orderNote) {
    lines.push(`*Notes / ملاحظات:* ${params.orderNote}`);
  }
  if (params.orderType === 'delivery') {
    lines.push('💵 Cash on delivery / الدفع عند الاستلام');
  }

  const targetWhatsapp =
    params.whatsappNumber?.replace(/[^\d]/g, '') || BUSINESS.whatsappNumber;
  return `https://wa.me/${targetWhatsapp}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export function CheckoutPage({
  lang,
  cart,
  currentUser,
  firebaseUser,
  authError,
  storeSettings,
  onUpdateQty,
  onUpdateNote,
  onClearCart,
  onBackToMenu,
  onOpenAccount,
  onUpdateSavedLocation,
  onOrderPlaced,
}: CheckoutPageProps) {
  const t = COPY[lang];
  const [orderType, setOrderType] = useState<OrderType>('delivery');
  const [customerName, setCustomerName] = useState(
    currentUser?.name ?? firebaseUser?.displayName ?? '',
  );
  const [customerPhone, setCustomerPhone] = useState(currentUser?.phone ?? '');
  const [deliveryLocation, setDeliveryLocation] = useState(currentUser?.address ?? '');
  const [pinnedLocation, setPinnedLocation] = useState<GeoLocation | undefined>(
    currentUser?.location,
  );
  const [manualMapsLink, setManualMapsLink] = useState(
    currentUser?.location
      ? `https://maps.google.com/?q=${currentUser.location.lat},${currentUser.location.lng}`
      : '',
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    loading: locating,
    error: geoError,
    getCurrentLocation,
    clearError: clearGeoError,
  } = useGeolocation();

  useEffect(() => {
    if (!customerName && firebaseUser?.displayName && !currentUser) {
      setCustomerName(firebaseUser.displayName);
    }
  }, [firebaseUser?.displayName, customerName, currentUser]);

  useEffect(() => {
    if (currentUser?.location) {
      setPinnedLocation(currentUser.location);
      setManualMapsLink(
        `https://maps.google.com/?q=${currentUser.location.lat},${currentUser.location.lng}`,
      );
    } else if (!currentUser) {
      setPinnedLocation(undefined);
      setManualMapsLink('');
    }
  }, [currentUser]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  );

  const effectiveName = (currentUser ? currentUser.name : customerName).trim();
  const effectivePhone = (currentUser ? currentUser.phone : customerPhone).trim();
  const effectiveLocation = (deliveryLocation.trim() || currentUser?.address || '').trim();
  const cleanMapsLink = manualMapsLink.trim();

  const handleFetchCurrentLocation = async () => {
    const loc = await getCurrentLocation();
    if (loc) {
      const formattedAddress = `GPS (${loc.lat}, ${loc.lng})`;
      setPinnedLocation(loc);
      setManualMapsLink(`https://maps.google.com/?q=${loc.lat},${loc.lng}`);
      setDeliveryLocation(formattedAddress);
      if (currentUser && onUpdateSavedLocation) {
        onUpdateSavedLocation(loc);
      }
    }
  };

  const geoErrorMessage = useMemo(() => {
    if (!geoError) return null;
    if (geoError === 'unsupported') return t.locationErrorUnsupported;
    if (geoError === 'denied') return t.locationErrorDenied;
    if (geoError === 'timeout') {
      return lang === 'ar'
        ? 'انتهت مهلة تحديد الموقع. يمكنك المحاولة مرة أخرى أو اختيار الموقع من الخريطة.'
        : 'Location request timed out. Try again or pick your point directly on the map.';
    }
    return lang === 'ar'
      ? 'تعذر تحديد الموقع الحالي. يمكنك النقر على الخريطة أو لصق الرابط يدوياً.'
      : 'Could not retrieve current location. Tap on the map or paste a Maps link manually.';
  }, [geoError, lang, t.locationErrorDenied, t.locationErrorUnsupported]);

  const handleMapLocationChange = (loc: GeoLocation, suggestedAddress?: string) => {
    clearGeoError();
    setPinnedLocation(loc);
    const link = `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
    setManualMapsLink(link);
    if (currentUser && onUpdateSavedLocation) {
      onUpdateSavedLocation(loc);
    } else if (suggestedAddress) {
      setDeliveryLocation(suggestedAddress);
    } else if (!deliveryLocation.trim()) {
      setDeliveryLocation(`GPS (${loc.lat}, ${loc.lng})`);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (cart.length === 0) {
      setFormError(t.errEmptyCart);
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
    if (orderType === 'delivery' && !effectiveLocation && !cleanMapsLink) {
      setFormError(t.errDeliveryLocationRequired);
      return;
    }

    void unlockOrderAlarmAudio();
    setSubmitting(true);
    try {
      if (!auth.currentUser) {
        await signInAsGuest();
      }

      const orderItems = cart.map((item) => {
        const tempLabel = item.temp ? (item.temp === 'hot' ? 'Hot' : 'Cold') : '';
        const mergedNote = [tempLabel, item.note].filter(Boolean).join(' · ');
        return {
          itemId: item.itemId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          note: mergedNote,
          imageUrl: item.imageUrl,
        };
      });

      const deliveryAddressToSend =
        orderType === 'delivery' ? effectiveLocation || undefined : undefined;
      const mapsLinkToSend =
        orderType === 'delivery' ? cleanMapsLink || undefined : undefined;

      const orderPayload = {
        orderType,
        customerName: effectiveName,
        customerPhone: effectivePhone,
        deliveryLocation: deliveryAddressToSend,
        mapsLink: mapsLinkToSend,
        orderNote: notes.trim() || undefined,
        items: orderItems,
        total: subtotal,
        lang,
      };

      let created: { id: string; orderNumber: string } | null = null;
      try {
        created = await createOrder(orderPayload);
      } catch (cloudErr) {
        console.warn('Cloud order sync unavailable for guest, continuing directly to WhatsApp:', cloudErr);
      }

      if (!created) {
        created = {
          id: `wa-${Date.now()}`,
          orderNumber: `PM-${Math.floor(1000 + Math.random() * 9000)}`,
        };
      }

      const whatsappUrl = buildBilingualWhatsAppSummary({
        orderNumber: created.orderNumber,
        orderId: created.id,
        orderType,
        items: cart,
        total: subtotal,
        customerName: effectiveName,
        customerPhone: effectivePhone,
        deliveryLocation: deliveryAddressToSend,
        mapsLink: mapsLinkToSend,
        orderNote: notes.trim() || undefined,
        whatsappNumber: storeSettings?.whatsappNumber,
      });

      const nowMs = Date.now();
      const receiptOrder: Order = {
        id: created.id,
        orderNumber: created.orderNumber,
        orderType,
        customerName: effectiveName,
        customerPhone: effectivePhone,
        deliveryLocation: deliveryAddressToSend,
        mapsLink: mapsLinkToSend,
        orderNote: notes.trim() || undefined,
        items: orderItems,
        total: subtotal,
        status: 'Pending',
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      };

      onClearCart();
      onOrderPlaced(created.id, created.orderNumber, whatsappUrl, receiptOrder);

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
      const msg =
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Could not place order. Please try again.';
      setFormError(msg);
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
          {/* Estimated Time + Order Type Toggle */}
          <div className="palm-card rounded-3xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#1A3C2F]/10">
              <div className="flex items-center gap-2.5">
                <Clock className="h-5 w-5 text-[#9E7C16]" />
                <span className="text-sm font-bold text-[#1A3C2F]">{t.estimatedTimeTitle}</span>
              </div>
              <span className="rounded-xl bg-[#1A3C2F] px-3 py-1.5 text-xs font-extrabold text-[#C9A227]">
                {t.estimatedTimeVal}
              </span>
            </div>

            <div className="mt-4">
              <p className="text-xs font-bold text-[#4A6457] mb-2.5">{t.orderTypeTitle}</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setOrderType('delivery');
                    setFormError(null);
                  }}
                  className={`flex min-h-[50px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold cursor-pointer transition-all ${
                    orderType === 'delivery'
                      ? 'palm-btn-gold'
                      : 'bg-[#E6DEC8] text-[#2F4D3F] hover:bg-[#DDD3B8]'
                  }`}
                >
                  <Truck className="h-4 w-4" />
                  <span>{t.deliveryLabel}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOrderType('pickup');
                    setFormError(null);
                  }}
                  className={`flex min-h-[50px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold cursor-pointer transition-all ${
                    orderType === 'pickup'
                      ? 'palm-btn-gold'
                      : 'bg-[#E6DEC8] text-[#2F4D3F] hover:bg-[#DDD3B8]'
                  }`}
                >
                  <Store className="h-4 w-4" />
                  <span>{t.pickupLabel}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Items List */}
          <div className="palm-card rounded-3xl p-5">
            <h2 className="text-base font-extrabold text-[#1A3C2F] mb-4">{t.itemsInOrder}</h2>
            <ul className="divide-y divide-[#1A3C2F]/10">
              {cart.map((item) => {
                const title =
                  lang === 'ar'
                    ? item.nameAr || item.name
                    : item.nameEn || item.name;
                return (
                  <li key={item.cartKey} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm sm:text-base font-extrabold text-[#1A3C2F]">
                          {title}
                          {item.temp && (
                            <span className="mx-1.5 text-xs font-bold text-[#9E7C16]">
                              ({item.temp === 'hot' ? t.hotLabel : t.coldLabel})
                            </span>
                          )}
                        </p>
                        <p className="text-xs font-semibold text-[#546E61]">
                          {item.price} {t.currency}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center rounded-xl bg-[#1A3C2F] p-1 text-[#F5F0E6]">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.cartKey, -1)}
                            aria-label="Decrease item quantity"
                            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#275544] cursor-pointer"
                          >
                            {item.quantity === 1 ? (
                              <Trash2 className="h-3.5 w-3.5 text-[#E88D72]" />
                            ) : (
                              <Minus className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <span className="w-7 text-center font-en text-xs font-extrabold text-[#C9A227] tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.cartKey, 1)}
                            aria-label="Increase item quantity"
                            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#275544] cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <span className="min-w-[54px] text-end font-en text-sm font-extrabold text-[#1A3C2F] tabular-nums">
                          {item.price * item.quantity} {t.currency}
                        </span>
                      </div>
                    </div>

                    <input
                      type="text"
                      maxLength={200}
                      value={item.note}
                      onChange={(e) => onUpdateNote(item.cartKey, e.target.value)}
                      placeholder={t.notesPlaceholder}
                      className="h-9 w-full rounded-lg border border-[#1A3C2F]/15 bg-white px-3 text-xs text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
                    />
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Customer Details, GPS Location, & Manual Maps Link */}
          <div className="palm-card rounded-3xl p-5 space-y-4">
            {orderType === 'pickup' && (
              <div className="rounded-2xl bg-[#EAE2D0] p-4">
                <div className="flex items-center gap-2 text-sm font-extrabold text-[#1A3C2F]">
                  <Store className="h-5 w-5 text-[#9E7C16]" />
                  <span>{t.pickupNoticeTitle}</span>
                </div>
                <p className="mt-1.5 text-xs sm:text-sm text-[#3B594B]">{t.pickupNoticeDesc}</p>
              </div>
            )}

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
                  {orderType === 'delivery' && (
                    <p>
                      <span className="font-bold">{t.deliveryLocationLabel}:</span>{' '}
                      {deliveryLocation || currentUser.address}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <h2 className="text-base font-extrabold text-[#1A3C2F]">
                  {orderType === 'pickup'
                    ? lang === 'ar'
                      ? 'بيانات العميل'
                      : 'Customer Details'
                    : t.customerDetailsTitle}
                </h2>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="chk-name" className="block text-xs font-bold text-[#3B594B]">
                      {t.nameLabel}
                    </label>
                    <input
                      id="chk-name"
                      type="text"
                      maxLength={100}
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
                      maxLength={40}
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder={t.phonePlaceholder}
                      className="mt-1.5 h-12 w-full rounded-xl border border-[#1A3C2F]/20 bg-white px-3.5 text-sm font-medium text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
                    />
                  </div>
                </div>

                {orderType === 'delivery' && (
                  <div>
                    <label htmlFor="chk-location" className="block text-xs font-bold text-[#3B594B]">
                      {t.deliveryLocationLabel}
                    </label>
                    <input
                      id="chk-location"
                      type="text"
                      maxLength={300}
                      value={deliveryLocation}
                      onChange={(e) => setDeliveryLocation(e.target.value)}
                      placeholder={t.deliveryLocationPlaceholder}
                      className="mt-1.5 h-12 w-full rounded-xl border border-[#1A3C2F]/20 bg-white px-3.5 text-sm font-medium text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Geolocation Button + Interactive Google Map + Manual Maps Link (Delivery only) */}
            {orderType === 'delivery' && (
              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  onClick={() => void handleFetchCurrentLocation()}
                  disabled={locating}
                  aria-busy={locating}
                  className="palm-btn-forest flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold cursor-pointer disabled:opacity-75 disabled:cursor-wait"
                >
                  {locating ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#C9A227]" />
                  ) : (
                    <Navigation className="h-4 w-4 text-[#C9A227]" />
                  )}
                  <span>{locating ? t.locatingBtn : t.getCurrentLocationBtn}</span>
                </button>

                {geoErrorMessage && (
                  <p
                    role="alert"
                    className="rounded-xl border border-[#C9A227]/50 bg-[#FFF8E1] px-3.5 py-2.5 text-xs font-bold text-[#7A5B06] leading-relaxed"
                  >
                    {geoErrorMessage}
                  </p>
                )}

                <DeliveryMapPicker
                  lang={lang}
                  location={pinnedLocation}
                  onLocationChange={handleMapLocationChange}
                  showGpsButton={false}
                />

                <div>
                  <label htmlFor="chk-maps-url" className="block text-xs font-bold text-[#3B594B]">
                    {t.manualMapsLabel}
                  </label>
                  <input
                    id="chk-maps-url"
                    type="url"
                    dir="ltr"
                    maxLength={500}
                    value={manualMapsLink}
                    onChange={(e) => {
                      const nextVal = e.target.value;
                      setManualMapsLink(nextVal);
                      const parsed = parseCoordsFromLink(nextVal);
                      if (parsed) setPinnedLocation(parsed);
                    }}
                    placeholder={t.manualMapsPlaceholder}
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#1A3C2F]/20 bg-white px-3.5 font-en text-xs sm:text-sm text-[#1A3C2F] focus:border-[#C9A227] focus:outline-none"
                  />
                </div>

                {cleanMapsLink && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#DCE8DE] px-3.5 py-2.5 text-xs font-bold text-[#1A3C2F]">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-[#1E6B38]" />
                      <span>{t.locationCaptured}</span>
                    </div>
                    <a
                      href={cleanMapsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#1A3C2F] underline"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{t.openMapPreview}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            )}

            <div>
              <label htmlFor="chk-notes" className="block text-xs font-bold text-[#3B594B]">
                {t.notesLabel}
              </label>
              <textarea
                id="chk-notes"
                rows={2}
                maxLength={400}
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
                {subtotal} {t.currency}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-[#1A3C2F]/10 pt-3 text-lg font-extrabold text-[#1A3C2F]">
              <span>{t.totalLabel}</span>
              <span className="font-en tabular-nums">
                {subtotal} {t.currency}
              </span>
            </div>

            {orderType === 'delivery' && (
              <div className="rounded-xl bg-[#EAE2D0] px-3.5 py-2 text-xs font-bold text-[#1A3C2F]">
                {t.cashOnDeliveryBadge}
              </div>
            )}

            {authError && (
              <p role="alert" className="rounded-xl bg-[#FEE4E2] px-3.5 py-2.5 text-xs font-bold text-[#912018]">
                {authError}
              </p>
            )}

            {formError && (
              <p role="alert" className="rounded-xl bg-[#FEE4E2] px-3.5 py-2.5 text-xs font-bold text-[#912018]">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="palm-btn-gold mt-2 flex w-full min-h-[54px] items-center justify-center gap-2.5 rounded-2xl px-5 py-3.5 text-base font-extrabold cursor-pointer disabled:opacity-60"
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
