import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Coffee,
  ExternalLink,
  MapPin,
  MessageCircle,
  PackageCheck,
  Search,
  XCircle,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { LogIn } from 'lucide-react';
import { COPY } from '../data/i18n';
import { subscribeCustomerOrders, subscribeOrder } from '../lib/firestoreSync';
import type { Language, Order, OrderStatus } from '../types';
import { StorageImage } from './MediaAsset';

interface TrackedOrderMeta {
  id: string;
  orderNumber: string;
  whatsappUrl?: string;
}

interface OrderTrackerPageProps {
  lang: Language;
  firebaseUser: User | null;
  authError?: string | null;
  onSignInGoogle: () => Promise<User | null>;
  recentOrders: TrackedOrderMeta[];
  activeOrderId: string | null;
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
  onSelectOrderId,
  onBackToMenu,
}: OrderTrackerPageProps) {
  const t = COPY[lang];
  const [order, setOrder] = useState<Order | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(activeOrderId && firebaseUser));
  const [error, setError] = useState<string | null>(null);
  const [lookupInput, setLookupInput] = useState('');
  const [signingIn, setSigningIn] = useState(false);

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
    if (!activeOrderId || !firebaseUser) {
      setOrder(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = subscribeOrder(
      activeOrderId,
      (liveOrder) => {
        setOrder(liveOrder);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [activeOrderId, firebaseUser]);

  const steps: { status: OrderStatus; label: string; hint: string }[] = [
    { status: 'Pending', label: t.stepPending, hint: t.stepPendingHint },
    { status: 'Preparing', label: t.stepPreparing, hint: t.stepPreparingHint },
    { status: 'Ready', label: t.stepReady, hint: t.stepReadyHint },
    { status: 'Completed', label: t.stepCompleted, hint: t.stepCompletedHint },
  ];

  const currentStepIdx = order
    ? Math.max(
        0,
        steps.findIndex((s) => s.status === order.status),
      )
    : 0;

  const activeMeta = recentOrders.find((o) => o.id === activeOrderId);
  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = lookupInput.trim();
    if (!cleaned) return;
    onSelectOrderId(cleaned);
    setLookupInput('');
  };

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

      {!firebaseUser ? (
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
      ) : loading ? (
        <div className="palm-card rounded-3xl p-6 space-y-4">
          <div className="h-6 w-40 rounded bg-[#E4DAC4] animate-pulse" />
          <div className="h-20 w-full rounded-2xl bg-[#E4DAC4] animate-pulse" />
        </div>
      ) : error ? (
        <div className="palm-card rounded-3xl p-6 text-sm font-bold text-[#912018]">
          {error}
        </div>
      ) : !order ? (
        <div className="palm-card rounded-3xl p-8 text-center">
          <h2 className="text-xl font-extrabold text-[#1A3C2F]">{t.orderNotFoundTitle}</h2>
          <p className="mt-1.5 text-sm text-[#4A6457]">{t.orderNotFoundDesc}</p>
        </div>
      ) : (
        <div className="palm-card rounded-3xl overflow-hidden">
          <div className="border-b border-[#1A3C2F]/10 bg-[#EAE2D0] p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-[#4A6457]">
                  <span className="font-en text-sm font-extrabold text-[#1A3C2F]">
                    {order.orderNumber}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{order.customerName}</span>
                </div>
                <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-[#1A3C2F]">
                  {order.status === 'Pending' && t.statusPendingTitle}
                  {order.status === 'Preparing' && t.statusPreparingTitle}
                  {order.status === 'Ready' && t.statusReadyTitle}
                  {order.status === 'Completed' && t.statusCompletedTitle}
                  {order.status === 'Cancelled' && t.statusCancelledTitle}
                </h1>
              </div>

              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C9A227] shadow-[0_3px_0_#947210]">
                <StatusIcon status={order.status} />
              </div>
            </div>

            {order.status !== 'Cancelled' && (
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
          </div>

          <div className="p-5 sm:p-7 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#546E61]">
              <span>Firestore Order ID</span>
              <span className="font-en text-[#1A3C2F]">{order.id}</span>
            </div>

            {order.deliveryLocation && (
              <div className="rounded-xl bg-[#EAE2D0] px-4 py-3 text-xs sm:text-sm text-[#1A3C2F]">
                <span className="font-extrabold">{t.deliveryLocationLabel}:</span>{' '}
                {order.deliveryLocation}
              </div>
            )}

            {order.mapsLink && (
              <a
                href={order.mapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#1E6B38] underline"
              >
                <MapPin className="h-4 w-4" />
                <span>{t.openMapPreview}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}

            {order.orderNote && (
              <div className="rounded-xl bg-[#EAE2D0] px-4 py-3 text-xs sm:text-sm text-[#1A3C2F]">
                <span className="font-extrabold">{t.notesLabel}:</span> {order.orderNote}
              </div>
            )}

            <ul className="divide-y divide-[#1A3C2F]/10">
              {order.items.map((item, idx) => (
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
                {order.total} {t.currency}
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
      )}
    </div>
  );
}
