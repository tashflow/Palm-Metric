import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Clock,
  Coffee,
  ExternalLink,
  LogIn,
  MapPin,
  MessageCircle,
  PackageCheck,
  Printer,
  Receipt,
  Search,
  XCircle,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { BUSINESS } from '../data/menu';
import { COPY } from '../data/i18n';
import { subscribeCustomerOrders, subscribeOrder } from '../lib/firestoreSync';
import { initFCM } from '../lib/fcm';
import type { Language, Order, OrderStatus, TrackedOrderMeta } from '../types';
import { StorageImage } from './MediaAsset';

interface OrderTrackerPageProps {
  lang: Language;
  firebaseUser: User | null;
  authError?: string | null;
  onSignInGoogle: () => Promise<User | null>;
  recentOrders: TrackedOrderMeta[];
  activeOrderId: string | null;
  activeLiveOrder?: Order | null;
  isAlarmRinging: boolean;
  alarmStoppedForOrder: boolean;
  onStopAlarm: () => void;
  justPlacedOrderId: string | null;
  onSelectOrderId: (orderId: string) => void;
  onBackToMenu: () => void;
}

function StatusIcon({ status }: { status: OrderStatus }) {
  switch (status) {
    case 'Pending':
      return <Clock className="h-6 w-6 text-[#1A3C2F]" />;
    case 'Preparing':
      return <Coffee className="h-6 w-6 text-[#1A3C2F]" />;
    case 'Ready':
      return <PackageCheck className="h-6 w-6 text-[#1A3C2F]" />;
    case 'Completed':
      return <CheckCircle2 className="h-6 w-6 text-[#1A3C2F]" />;
    case 'Cancelled':
      return <XCircle className="h-6 w-6 text-[#912018]" />;
  }
}

export function OrderTrackerPage({
  lang,
  firebaseUser,
  authError,
  onSignInGoogle,
  recentOrders,
  activeOrderId,
  activeLiveOrder,
  isAlarmRinging,
  alarmStoppedForOrder,
  onStopAlarm,
  justPlacedOrderId,
  onSelectOrderId,
  onBackToMenu,
}: OrderTrackerPageProps) {
  const t = COPY[lang];
  const [lookedUpOrder, setLookedUpOrder] = useState<Order | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(
    Boolean(
      activeOrderId &&
        firebaseUser &&
        !activeLiveOrder &&
        !activeOrderId.startsWith('wa-'),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [lookupInput, setLookupInput] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [showReceipt, setShowReceipt] = useState<boolean>(() =>
    Boolean(justPlacedOrderId && justPlacedOrderId === activeOrderId),
  );

  useEffect(() => {
    if (justPlacedOrderId && justPlacedOrderId === activeOrderId) {
      setShowReceipt(true);
    }
  }, [justPlacedOrderId, activeOrderId]);

  useEffect(() => {
    if (!firebaseUser?.uid) {
      setCustomerOrders([]);
      return;
    }

    const unsubList = subscribeCustomerOrders(
      firebaseUser.uid,
      (orders) => {
        setCustomerOrders(orders);
        if (!activeOrderId && orders.length > 0) {
          onSelectOrderId(orders[0].id);
        }
      },
      () => {
        // ignore secondary list errors if single order lookup works
      },
    );

    return () => unsubList();
  }, [firebaseUser?.uid, activeOrderId, onSelectOrderId]);

  useEffect(() => {
    if (!activeOrderId || !firebaseUser || activeOrderId.startsWith('wa-')) {
      setLookedUpOrder(null);
      setLoading(false);
      setError(null);
      return;
    }

    if (activeLiveOrder && activeLiveOrder.id === activeOrderId) {
      setLookedUpOrder(activeLiveOrder);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = subscribeOrder(
      activeOrderId,
      (liveOrder) => {
        setLookedUpOrder(liveOrder);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [activeOrderId, firebaseUser, activeLiveOrder]);

  const activeMeta = recentOrders.find((o) => o.id === activeOrderId);
  const displayOrder: Order | null =
    (activeLiveOrder && activeLiveOrder.id === activeOrderId ? activeLiveOrder : null) ??
    lookedUpOrder ??
    activeMeta?.receiptSnapshot ??
    null;

  const [pushEnabled, setPushEnabled] = useState<boolean>(
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted',
  );
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    if (displayOrder?.status === 'Ready' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(lang === 'ar' ? 'طلبك جاهز في بالم مترك!' : 'Palm Metric: Order Ready!', {
          body: lang === 'ar' ? `طلبك ${displayOrder.orderNumber} أصبح جاهزاً.` : `Order ${displayOrder.orderNumber} is now ready!`,
          icon: '/favicon.ico',
        });
      } catch (err) {
        console.warn('Failed to trigger background ready notification:', err);
      }
    }
  }, [displayOrder?.status, displayOrder?.orderNumber, lang]);

  const handleEnablePush = async () => {
    setPushing(true);
    const token = await initFCM();
    if (token || (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted')) {
      setPushEnabled(true);
    }
    setPushing(false);
  };

  const steps: { status: OrderStatus; label: string; hint: string }[] = [
    { status: 'Pending', label: t.stepPending, hint: t.stepPendingHint },
    { status: 'Preparing', label: t.stepPreparing, hint: t.stepPreparingHint },
    { status: 'Ready', label: t.stepReady, hint: t.stepReadyHint },
    { status: 'Completed', label: t.stepCompleted, hint: t.stepCompletedHint },
  ];

  const currentStepIdx = displayOrder
    ? Math.max(
        0,
        steps.findIndex((s) => s.status === displayOrder.status),
      )
    : 0;

  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = lookupInput.trim();
    if (!cleaned) return;
    onSelectOrderId(cleaned);
    setLookupInput('');
  };

  const formattedDateTime = displayOrder?.createdAtMs
    ? new Date(displayOrder.createdAtMs).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : new Date().toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

  const isPickupOrder = displayOrder?.orderType === 'pickup';
  const isWhatsappOnlyOrder = Boolean(displayOrder?.id.startsWith('wa-'));

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-20 sm:px-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToMenu}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#234A3B] px-4 py-2 text-sm font-bold text-[#F5F0E6] hover:bg-[#2B5947] cursor-pointer"
        >
          <BackIcon className="h-4 w-4 text-[#C9A227]" />
          <span>{t.backToMenu}</span>
        </button>

        <form onSubmit={handleLookup} className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C9A227]" />
            <input
              type="text"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              placeholder={t.trackLookupPlaceholder}
              className="h-11 w-44 sm:w-56 rounded-xl border border-[#C9A227]/35 bg-[#132D23] ps-9 pe-3 text-xs sm:text-sm text-[#F5F0E6] placeholder:text-[#F5F0E6]/50 focus:border-[#C9A227] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="palm-btn-gold min-h-[44px] rounded-xl px-4 text-xs sm:text-sm font-extrabold cursor-pointer"
          >
            {t.trackLookupBtn}
          </button>
        </form>
      </div>

      {(() => {
        const mergedTabs = new Map<string, { id: string; orderNumber: string }>();
        customerOrders.forEach((o) =>
          mergedTabs.set(o.id, { id: o.id, orderNumber: o.orderNumber }),
        );
        recentOrders.forEach((m) => {
          if (!mergedTabs.has(m.id)) mergedTabs.set(m.id, { id: m.id, orderNumber: m.orderNumber });
        });
        const tabs = Array.from(mergedTabs.values());
        if (tabs.length <= 1) return null;
        return (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {tabs.map((meta) => {
              const selected = meta.id === activeOrderId;
              return (
                <button
                  key={meta.id}
                  type="button"
                  onClick={() => onSelectOrderId(meta.id)}
                  className={`min-h-[40px] rounded-xl px-3.5 py-1.5 font-en text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer ${
                    selected
                      ? 'palm-btn-gold'
                      : 'bg-[#132D23] border border-[#C9A227]/30 text-[#F5F0E6]'
                  }`}
                >
                  {meta.orderNumber}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Order Ready Ringing Alarm Banner with Stop Alarm Button */}
      {isAlarmRinging && displayOrder?.status === 'Ready' && (
        <div
          role="alert"
          className="rounded-3xl border-2 border-[#C9A227] bg-gradient-to-r from-[#C9A227] to-[#E2BE46] p-5 text-[#142A20] shadow-[0_12px_30px_rgba(201,162,39,0.38)]"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1A3C2F] text-[#C9A227] animate-bounce">
                <BellRing className="h-6 w-6" />
              </div>
              <div>
                <p className="text-base sm:text-lg font-extrabold">
                  {isPickupOrder
                    ? lang === 'ar'
                      ? 'طلبك جاهز للاستلام الآن!'
                      : 'Your order is ready for pickup!'
                    : lang === 'ar'
                      ? 'تم تجهيز طلبك وجاهز للتوصيل!'
                      : 'Your order is prepared and ready for delivery!'}
                </p>
                <p className="mt-0.5 text-xs sm:text-sm font-bold text-[#142A20]/85">
                  {lang === 'ar'
                    ? `رقم الطلب ${displayOrder.orderNumber} — اضغط لإيقاف صوت التنبيه`
                    : `Order ${displayOrder.orderNumber} — Tap the button to stop the alarm`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onStopAlarm}
              className="palm-btn-forest inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-extrabold shrink-0 cursor-pointer"
            >
              <BellOff className="h-5 w-5 text-[#C9A227]" />
              <span>{lang === 'ar' ? 'إيقاف التنبيه' : 'Stop Alarm'}</span>
            </button>
          </div>
        </div>
      )}

      {!firebaseUser && !displayOrder ? (
        <div className="palm-card rounded-3xl p-8 sm:p-10 text-center space-y-4">
          <Clock className="mx-auto h-10 w-10 text-[#9E7C16]" />
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#1A3C2F]">
            {lang === 'ar' ? 'سجّل الدخول لمتابعة طلباتك مباشرة' : 'Sign in to track your live orders'}
          </h1>
          <p className="mx-auto max-w-md text-sm text-[#4A6457]">
            {lang === 'ar'
              ? 'سجّل الدخول بحساب Google لعرض طلباتك السابقة ومتابعة حالة التحضير لحظة بلحظة.'
              : 'Sign in with your Google account to view your recent orders and follow live preparation updates.'}
          </p>
          {authError && (
            <p className="mx-auto max-w-md rounded-xl bg-[#FEE4E2] px-3.5 py-2.5 text-xs font-bold text-[#912018]">
              {authError}
            </p>
          )}
          <button
            type="button"
            disabled={signingIn}
            onClick={async () => {
              setSigningIn(true);
              await onSignInGoogle();
              setSigningIn(false);
            }}
            className="palm-btn-gold inline-flex min-h-[46px] items-center gap-2 rounded-xl px-6 py-3 text-sm font-extrabold cursor-pointer disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />
            <span>
              {signingIn
                ? lang === 'ar'
                  ? 'جاري تسجيل الدخول...'
                  : 'Signing in...'
                : lang === 'ar'
                  ? 'تسجيل الدخول عبر Google'
                  : 'Sign in with Google'}
            </span>
          </button>
        </div>
      ) : !activeOrderId ? (
        <div className="palm-card rounded-3xl p-8 sm:p-12 text-center">
          <Coffee className="mx-auto h-10 w-10 text-[#9E7C16]" />
          <h1 className="mt-4 text-2xl font-extrabold text-[#1A3C2F]">{t.noActiveOrderTitle}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#4A6457]">{t.noActiveOrderDesc}</p>
          <button
            type="button"
            onClick={onBackToMenu}
            className="palm-btn-gold mt-6 min-h-[46px] rounded-xl px-6 py-3 text-sm font-extrabold cursor-pointer"
          >
            {t.startOrderBtn}
          </button>
        </div>
      ) : loading && !displayOrder ? (
        <div className="palm-card rounded-3xl p-6 space-y-4">
          <div className="h-6 w-40 rounded bg-[#E4DAC4] animate-pulse" />
          <div className="h-20 w-full rounded-2xl bg-[#E4DAC4] animate-pulse" />
        </div>
      ) : error && !displayOrder ? (
        <div className="palm-card rounded-3xl p-6 text-sm font-bold text-[#912018]">{error}</div>
      ) : !displayOrder ? (
        <div className="palm-card rounded-3xl p-8 text-center">
          <h2 className="text-xl font-extrabold text-[#1A3C2F]">{t.orderNotFoundTitle}</h2>
          <p className="mt-1.5 text-sm text-[#4A6457]">{t.orderNotFoundDesc}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {typeof window !== 'undefined' && 'Notification' in window && !pushEnabled && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#EAE2D0] border border-[#C9A227]/40 p-4 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1A3C2F] text-[#C9A227]">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-extrabold text-[#1A3C2F]">
                    {lang === 'ar' ? 'تفعيل إشعارات الفورية لتنبيهك عند جاهزية الطلب' : 'Enable push notifications to get alerted when your order is ready'}
                  </p>
                  <p className="text-[11px] text-[#546E61]">
                    {lang === 'ar' ? 'يضمن تنبيهك حتى لو كان التطبيق في الخلفية' : 'Ensures you get notified even in the background'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={pushing}
                onClick={handleEnablePush}
                className="palm-btn-gold min-h-[40px] rounded-xl px-4 py-2 text-xs font-extrabold shrink-0 cursor-pointer disabled:opacity-60"
              >
                {pushing ? '...' : t.enablePushBtn}
              </button>
            </div>
          )}

          {/* Live Order Status Card */}
          <div className="palm-card rounded-3xl overflow-hidden">
            <div className="border-b border-[#1A3C2F]/10 bg-[#EAE2D0] p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#4A6457]">
                    <span className="font-en text-sm font-extrabold text-[#1A3C2F]">
                      {displayOrder.orderNumber}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{displayOrder.customerName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="rounded-lg bg-[#1A3C2F] px-2 py-0.5 text-[11px] font-bold text-[#C9A227]">
                      {isPickupOrder ? t.pickupLabel : t.deliveryLabel}
                    </span>
                  </div>
                  <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-[#1A3C2F]">
                    {isWhatsappOnlyOrder
                      ? lang === 'ar'
                        ? 'تم تجهيز طلبك عبر واتساب!'
                        : 'Your order is ready on WhatsApp!'
                      : (
                        <>
                          {displayOrder.status === 'Pending' && t.statusPendingTitle}
                          {displayOrder.status === 'Preparing' && t.statusPreparingTitle}
                          {displayOrder.status === 'Ready' &&
                            (isPickupOrder
                              ? lang === 'ar'
                                ? 'طلبك جاهز للاستلام!'
                                : 'Your order is ready for pickup!'
                              : lang === 'ar'
                                ? 'طلبك جاهز للتوصيل!'
                                : 'Your order is ready for delivery!')}
                          {displayOrder.status === 'Completed' && t.statusCompletedTitle}
                          {displayOrder.status === 'Cancelled' && t.statusCancelledTitle}
                        </>
                      )}
                  </h1>

                  {displayOrder.status === 'Ready' && alarmStoppedForOrder && !isAlarmRinging && (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#DCE8DE] px-2.5 py-1 text-xs font-bold text-[#1E6B38]">
                      <BellOff className="h-3.5 w-3.5" />
                      <span>{lang === 'ar' ? 'تم إيقاف منبه الجاهزية' : 'Ready alarm stopped'}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowReceipt((prev) => !prev)}
                    className="palm-btn-forest inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold cursor-pointer"
                  >
                    <Receipt className="h-4 w-4 text-[#C9A227]" />
                    <span>
                      {showReceipt
                        ? lang === 'ar'
                          ? 'إخفاء الفاتورة'
                          : 'Hide Receipt'
                        : lang === 'ar'
                          ? 'عرض الفاتورة'
                          : 'View Receipt'}
                    </span>
                  </button>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C9A227] shadow-[0_3px_0_#947210]">
                    <StatusIcon status={displayOrder.status} />
                  </div>
                </div>
              </div>

              {displayOrder.status !== 'Cancelled' && !isWhatsappOnlyOrder && (
                <div className="mt-7 grid grid-cols-4 gap-2">
                  {steps.map((step, idx) => {
                    const reached = idx <= currentStepIdx;
                    const current = idx === currentStepIdx;
                    return (
                      <div key={step.status} className="flex flex-col">
                        <div
                          className={`h-2.5 w-full rounded-full transition-colors duration-300 ${
                            reached ? 'bg-[#1A3C2F]' : 'bg-[#D3C7AE]'
                          }`}
                        />
                        <span
                          className={`mt-2 text-xs sm:text-sm font-extrabold ${
                            current
                              ? 'text-[#1A3C2F]'
                              : reached
                                ? 'text-[#2B5947]'
                                : 'text-[#756C59]'
                          }`}
                        >
                          {step.label}
                        </span>
                        <span className="hidden sm:block text-[11px] font-semibold text-[#546E61]">
                          {step.hint}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {isWhatsappOnlyOrder && (
                <div className="mt-4 rounded-2xl bg-[#DCE8DE] px-4 py-3 text-xs sm:text-sm font-bold text-[#1A3C2F]">
                  {lang === 'ar'
                    ? 'إيصالك محفوظ أدناه. إذا لم يُفتح تطبيق واتساب تلقائياً، اضغط على زر «إرسال ملخص الطلب عبر واتساب».'
                    : 'Your receipt is saved below. If WhatsApp did not open automatically, tap "Open Order Summary in WhatsApp".'}
                </div>
              )}
            </div>

            <div className="p-5 sm:p-7 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#546E61]">
                <span>{lang === 'ar' ? 'مرجع الطلب' : 'Order Reference'}</span>
                <span className="font-en text-[#1A3C2F]">{displayOrder.id}</span>
              </div>

              {!isPickupOrder && displayOrder.deliveryLocation && (
                <div className="rounded-xl bg-[#EAE2D0] px-4 py-3 text-xs sm:text-sm text-[#1A3C2F]">
                  <span className="font-extrabold">{t.deliveryLocationLabel}:</span>{' '}
                  {displayOrder.deliveryLocation}
                </div>
              )}

              {!isPickupOrder && displayOrder.mapsLink && (
                <a
                  href={displayOrder.mapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#1E6B38] underline"
                >
                  <MapPin className="h-4 w-4" />
                  <span>{t.openMapPreview}</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}

              {displayOrder.orderNote && (
                <div className="rounded-xl bg-[#EAE2D0] px-4 py-3 text-xs sm:text-sm text-[#1A3C2F]">
                  <span className="font-extrabold">{t.notesLabel}:</span> {displayOrder.orderNote}
                </div>
              )}

              <ul className="divide-y divide-[#1A3C2F]/10">
                {displayOrder.items.map((item, idx) => (
                  <li
                    key={`${item.itemId}-${idx}`}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <StorageImage
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-12 w-12 shrink-0 rounded-xl"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-[#1A3C2F] truncate">
                          <span className="font-en text-[#9E7C16] me-1.5">{item.quantity}x</span>
                          {item.name}
                        </p>
                        {item.note && (
                          <p className="text-xs text-[#546E61] truncate">{item.note}</p>
                        )}
                      </div>
                    </div>
                    <span className="font-en text-sm font-extrabold text-[#1A3C2F] tabular-nums shrink-0">
                      {item.price * item.quantity} {t.currency}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between border-t border-[#1A3C2F]/10 pt-4">
                <span className="text-sm font-bold text-[#4A6457]">{t.totalLabel}</span>
                <span className="font-en text-xl font-extrabold text-[#1A3C2F] tabular-nums">
                  {displayOrder.total} {t.currency}
                </span>
              </div>

              {activeMeta?.whatsappUrl && (
                <a
                  href={activeMeta.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="palm-btn-gold flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>{t.openWhatsappSummaryBtn}</span>
                </a>
              )}
            </div>
          </div>

          {/* Customer Digital Receipt Card */}
          {showReceipt && (
            <div className="palm-card rounded-3xl p-5 sm:p-7 space-y-4 border-2 border-dashed border-[#C9A227]/70">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-[#1A3C2F]/20 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1A3C2F] text-[#C9A227]">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-[#1A3C2F]">
                      {lang === 'ar'
                        ? `إيصال الطلب — ${BUSINESS.nameAr}`
                        : `Order Receipt — ${BUSINESS.nameEn}`}
                    </h2>
                    <p className="text-xs font-semibold text-[#546E61]">{formattedDateTime}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="palm-btn-forest inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold cursor-pointer print:hidden"
                >
                  <Printer className="h-3.5 w-3.5 text-[#C9A227]" />
                  <span>{lang === 'ar' ? 'طباعة / حفظ الإيصال' : 'Print / Save Receipt'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-[#EAE2D0] p-4 text-xs sm:text-sm text-[#1A3C2F]">
                <div>
                  <span className="block text-[11px] font-bold text-[#546E61]">
                    {lang === 'ar' ? 'رقم الطلب' : 'Order No.'}
                  </span>
                  <span className="font-en font-extrabold">{displayOrder.orderNumber}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-[#546E61]">
                    {lang === 'ar' ? 'نوع الطلب' : 'Order Type'}
                  </span>
                  <span className="font-extrabold">
                    {isPickupOrder ? t.pickupLabel : t.deliveryLabel}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-[#546E61]">
                    {t.nameLabel}
                  </span>
                  <span className="font-bold">{displayOrder.customerName}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-[#546E61]">
                    {t.phoneLabel}
                  </span>
                  <span className="font-en font-bold" dir="ltr">
                    {displayOrder.customerPhone}
                  </span>
                </div>
                {!isPickupOrder && displayOrder.deliveryLocation && (
                  <div className="col-span-2">
                    <span className="block text-[11px] font-bold text-[#546E61]">
                      {t.deliveryLocationLabel}
                    </span>
                    <span className="font-bold">{displayOrder.deliveryLocation}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2 border-t border-b border-dashed border-[#1A3C2F]/20 py-3">
                {displayOrder.items.map((item, idx) => (
                  <div
                    key={`receipt-${item.itemId}-${idx}`}
                    className="flex items-start justify-between gap-3 text-xs sm:text-sm text-[#1A3C2F]"
                  >
                    <div className="min-w-0">
                      <p className="font-bold">
                        <span className="font-en me-1.5 text-[#9E7C16]">{item.quantity}x</span>
                        {item.name}
                      </p>
                      {item.note && <p className="text-[11px] text-[#546E61]">{item.note}</p>}
                    </div>
                    <span className="font-en font-extrabold tabular-nums shrink-0">
                      {item.price * item.quantity} {t.currency}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-base sm:text-lg font-extrabold text-[#1A3C2F]">
                <span>{t.totalLabel}</span>
                <span className="font-en tabular-nums">
                  {displayOrder.total} {t.currency}
                </span>
              </div>

              <p className="text-center text-xs font-bold text-[#4A6457]">
                {isPickupOrder
                  ? lang === 'ar'
                    ? 'شكراً لطلبك من بالم مترك — الدفع عند الاستلام من الفرع'
                    : 'Thank you for ordering from Palm Metric — Pay upon pickup'
                  : lang === 'ar'
                    ? 'شكراً لطلبك من بالم مترك — الدفع عند الاستلام'
                    : 'Thank you for ordering from Palm Metric — Cash on delivery'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
