import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileSearch,
  History,
  Lock,
  LogIn,
  PackageCheck,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  User as UserIcon,
  XCircle,
} from 'lucide-react';
import { COPY } from '../data/i18n';
import {
  firebaseUserToAdminActor,
  isVerifiedAdminActor,
} from '../lib/adminAuth';
import {
  approveAndPromoteOrderRequest,
  fetchAuthoritativeCatalogForRequest,
  rejectOrderRequest,
  startOrderRequestReview,
  subscribeAllOrderRequestsForAdmin,
  subscribeOrderRequestAuditLogs,
  verifyOrderRequestPricing,
} from '../lib/adminOrderRequests';
import {
  inspectOrderRequestVerification,
  type RequestPricingInspectionResult,
} from '../lib/authoritativePricing';
import { formatPrice } from '../lib/format';
import type {
  Language,
  OrderRequest,
  OrderRequestAuditEntry,
  OrderRequestStatus,
} from '../types';

type FilterTab =
  | 'all'
  | 'pending_review'
  | 'reviewing'
  | 'verified'
  | 'rejected'
  | 'order_created';

interface AdminOrderRequestsPageProps {
  lang: Language;
  firebaseUser: User | null;
  isAdminDocPresent: boolean;
  onSignInAdmin: () => Promise<User | null>;
  onBackToMenu: () => void;
  onInspectOrder: (orderId: string) => void;
}

function formatDateTime(ms: number | undefined, lang: Language): string {
  if (!ms) return '—';
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

function getStatusBadgeStyle(status: OrderRequestStatus): {
  bg: string;
  text: string;
  labelEn: string;
  labelAr: string;
} {
  switch (status) {
    case 'pending_review':
      return {
        bg: 'bg-[#FFF8E1] border border-[#C9A227]/60',
        text: 'text-[#7A5B06]',
        labelEn: 'Pending Review',
        labelAr: 'قيد الانتظار',
      };
    case 'reviewing':
      return {
        bg: 'bg-[#E3EEF8] border border-[#2C649B]/35',
        text: 'text-[#184673]',
        labelEn: 'Under Review',
        labelAr: 'قيد المراجعة',
      };
    case 'verified':
      return {
        bg: 'bg-[#E3F1E8] border border-[#1E6B38]/40',
        text: 'text-[#1E6B38]',
        labelEn: 'Verified',
        labelAr: 'تم التحقق',
      };
    case 'order_created':
    case 'approved':
      return {
        bg: 'bg-[#1A3C2F] border border-[#C9A227]/70',
        text: 'text-[#C9A227]',
        labelEn: 'Order Created',
        labelAr: 'تم إنشاء الطلب',
      };
    case 'rejected':
      return {
        bg: 'bg-[#FEE4E2] border border-[#912018]/30',
        text: 'text-[#912018]',
        labelEn: 'Rejected',
        labelAr: 'مرفوض',
      };
    case 'cancelled':
    default:
      return {
        bg: 'bg-[#E5E0D5] border border-[#546E61]/30',
        text: 'text-[#546E61]',
        labelEn: 'Cancelled',
        labelAr: 'ملغي',
      };
  }
}

export function AdminOrderRequestsPage({
  lang,
  firebaseUser,
  isAdminDocPresent,
  onSignInAdmin,
  onBackToMenu,
  onInspectOrder,
}: AdminOrderRequestsPageProps) {
  const t = COPY[lang];
  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;

  const adminActor = useMemo(
    () => firebaseUserToAdminActor(firebaseUser, isAdminDocPresent),
    [firebaseUser, isAdminDocPresent],
  );
  const authorized = isVerifiedAdminActor(adminActor);

  const [requests, setRequests] = useState<OrderRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<OrderRequestAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const [inspection, setInspection] = useState<RequestPricingInspectionResult | null>(null);
  const [inspectingCatalog, setInspectingCatalog] = useState(false);

  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const actionLockRef = useRef(false);

  useEffect(() => {
    if (!authorized) {
      setRequests([]);
      setAuditLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setSubscriptionError(null);

    const unsubRequests = subscribeAllOrderRequestsForAdmin(
      (list) => {
        setRequests(list);
        setLoading(false);
        setSelectedRequestId((prev) => {
          if (prev && list.some((r) => r.requestId === prev)) return prev;
          return list[0]?.requestId ?? null;
        });
      },
      (err) => {
        setSubscriptionError(err.message);
        setLoading(false);
      },
    );

    const unsubAudit = subscribeOrderRequestAuditLogs(
      (entries) => {
        setAuditLogs(entries);
      },
      () => {
        // Non-blocking audit listener warning handled quietly if permissions lag
      },
      120,
    );

    return () => {
      unsubRequests();
      unsubAudit();
    };
  }, [authorized]);

  const counts = useMemo(() => {
    const out: Record<FilterTab, number> = {
      all: requests.length,
      pending_review: 0,
      reviewing: 0,
      verified: 0,
      rejected: 0,
      order_created: 0,
    };
    for (const req of requests) {
      if (req.status === 'pending_review') out.pending_review += 1;
      else if (req.status === 'reviewing') out.reviewing += 1;
      else if (req.status === 'verified') out.verified += 1;
      else if (req.status === 'rejected') out.rejected += 1;
      else if (req.status === 'order_created' || req.status === 'approved') {
        out.order_created += 1;
      }
    }
    return out;
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const cleanQ = searchQuery.trim().toLowerCase();
    const list = requests.filter((req) => {
      if (activeTab === 'order_created') {
        if (req.status !== 'order_created' && req.status !== 'approved') return false;
      } else if (activeTab !== 'all' && req.status !== activeTab) {
        return false;
      }

      if (!cleanQ) return true;
      const haystack = [
        req.requestNumber,
        req.requestId,
        req.customerName,
        req.customerContact,
        req.approvedOrderNumber ?? '',
        req.approvedOrderId ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(cleanQ);
    });

    list.sort((a, b) => {
      const timeA = a.createdAtMs ?? 0;
      const timeB = b.createdAtMs ?? 0;
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

    return list;
  }, [requests, activeTab, searchQuery, sortOrder]);

  const selectedRequest = useMemo(
    () =>
      requests.find((r) => r.requestId === selectedRequestId) ??
      filteredRequests[0] ??
      null,
    [requests, selectedRequestId, filteredRequests],
  );

  const refreshLiveVerification = async (target: OrderRequest) => {
    setInspectingCatalog(true);
    try {
      const catalog = await fetchAuthoritativeCatalogForRequest(target);
      const result = inspectOrderRequestVerification(target, catalog, adminActor);
      setInspection(result);
    } catch (err) {
      setInspection({
        canApprove: false,
        issues: [
          {
            itemIndex: -1,
            itemId: '',
            code: 'CATALOG_FETCH_FAILED',
            message:
              err instanceof Error
                ? err.message
                : 'Unable to fetch authoritative catalog records from Firestore.',
          },
        ],
        breakdown: null,
      });
    } finally {
      setInspectingCatalog(false);
    }
  };

  useEffect(() => {
    setActionError(null);
    setActionSuccess(null);
    setConfirmApproveOpen(false);
    setRejectOpen(false);
    setRejectReason('');

    if (!authorized || !selectedRequest) {
      setInspection(null);
      return;
    }

    void refreshLiveVerification(selectedRequest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, selectedRequest?.requestId, selectedRequest?.updatedAtMs]);

  const selectedRequestAudit = useMemo(() => {
    if (!selectedRequest) return [];
    return auditLogs.filter((entry) => entry.requestId === selectedRequest.requestId);
  }, [auditLogs, selectedRequest]);

  const runAdminAction = async (fn: () => Promise<void>) => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setActionBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await fn();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to execute admin action.',
      );
    } finally {
      actionLockRef.current = false;
      setActionBusy(false);
    }
  };

  const handleStartReview = async () => {
    if (!selectedRequest) return;
    await runAdminAction(async () => {
      await startOrderRequestReview({
        requestId: selectedRequest.requestId,
        admin: adminActor,
      });
      setActionSuccess(
        lang === 'ar'
          ? 'تم نقل الطلب إلى مرحلة المراجعة.'
          : 'Order request moved to Under Review.',
      );
    });
  };

  const handleVerifyRequest = async () => {
    if (!selectedRequest) return;
    await runAdminAction(async () => {
      const res = await verifyOrderRequestPricing({
        requestId: selectedRequest.requestId,
        admin: adminActor,
      });
      setActionSuccess(
        lang === 'ar'
          ? `تم التحقق من السعر النهائي (${formatPrice(res.breakdown.totalBillSar)} ﷼).`
          : `Catalog items & price verified (${formatPrice(res.breakdown.totalBillSar)} SAR).`,
      );
    });
  };

  const handleApproveAndPromote = async () => {
    if (!selectedRequest) return;
    await runAdminAction(async () => {
      const res = await approveAndPromoteOrderRequest({
        requestId: selectedRequest.requestId,
        admin: adminActor,
      });
      setConfirmApproveOpen(false);
      setActionSuccess(
        lang === 'ar'
          ? `${t.adminOrderCreatedBanner}: ${res.orderNumber} (${formatPrice(res.totalBillSar)} ﷼)`
          : `${t.adminOrderCreatedBanner}: ${res.orderNumber} (${formatPrice(res.totalBillSar)} SAR)`,
      );
    });
  };

  const handleRejectRequest = async () => {
    if (!selectedRequest) return;
    const trimmed = rejectReason.trim();
    if (trimmed.length < 3) {
      setActionError(t.adminRejectReasonRequiredErr);
      return;
    }
    await runAdminAction(async () => {
      await rejectOrderRequest({
        requestId: selectedRequest.requestId,
        admin: adminActor,
        reason: trimmed,
      });
      setRejectOpen(false);
      setRejectReason('');
      setActionSuccess(
        lang === 'ar'
          ? 'تم رفض الطلب وحفظ السبب في سجل التدقيق.'
          : 'Order request rejected and logged.',
      );
    });
  };

  if (!authorized) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <button
          type="button"
          onClick={onBackToMenu}
          className="mb-6 inline-flex items-center gap-2 rounded-xl bg-[#132D23] px-3.5 py-2 text-xs font-bold text-[#F5F0E6] border border-[#C9A227]/30 hover:border-[#C9A227] cursor-pointer"
        >
          <BackIcon className="h-4 w-4 text-[#C9A227]" />
          <span>{t.backToMenu}</span>
        </button>

        <div className="palm-card rounded-3xl p-8 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1A3C2F] text-[#C9A227]">
            <Lock className="h-7 w-7" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#1A3C2F]">
            {lang === 'ar'
              ? 'الوصول مقصور على مسؤولي بالم مترك المعتمدين'
              : 'Verified Palm Metric Admin Access Required'}
          </h1>
          <p className="mx-auto max-w-md text-xs sm:text-sm text-[#4A6457]">
            {lang === 'ar'
              ? 'تتطلب مراجعة الطلبات واعتماد الأسعار تسجيل دخول موثّق بحساب إدارة معتمد (غير مسموح للضيوف أو الحسابات المجهولة).'
              : 'Reviewing customer order requests and promoting approved orders to /orders requires a verified admin Google account.'}
          </p>
          <button
            type="button"
            disabled={signingIn}
            onClick={async () => {
              setSigningIn(true);
              await onSignInAdmin();
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
                  ? 'تسجيل دخول الإدارة عبر Google'
                  : 'Sign In as Admin via Google'}
            </span>
          </button>
        </div>
      </div>
    );
  }

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: t.adminFilterAll },
    { id: 'pending_review', label: t.adminFilterPending },
    { id: 'reviewing', label: t.adminFilterReviewing },
    { id: 'verified', label: t.adminFilterVerified },
    { id: 'order_created', label: t.adminFilterCreated },
    { id: 'rejected', label: t.adminFilterRejected },
  ];

  const isSelectedPromoted = Boolean(
    selectedRequest &&
      (selectedRequest.status === 'order_created' || selectedRequest.status === 'approved'),
  );
  const isSelectedTerminal = Boolean(
    selectedRequest &&
      (isSelectedPromoted ||
        selectedRequest.status === 'rejected' ||
        selectedRequest.status === 'cancelled'),
  );

  const displayBreakdown =
    (isSelectedPromoted && selectedRequest?.verifiedPricing) ||
    inspection?.breakdown ||
    selectedRequest?.verifiedPricing ||
    null;

  return (
    <div className="mx-auto max-w-7xl px-3.5 sm:px-6 pt-5 pb-20 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBackToMenu}
            className="mb-3 inline-flex items-center gap-2 rounded-xl bg-[#132D23] px-3.5 py-2 text-xs font-bold text-[#F5F0E6] border border-[#C9A227]/30 hover:border-[#C9A227] cursor-pointer"
          >
            <BackIcon className="h-4 w-4 text-[#C9A227]" />
            <span>{t.backToMenu}</span>
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F5F0E6]">
            {t.adminDashboardTitle}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#F5F0E6]/78 max-w-2xl">
            {t.adminDashboardSubtitle}
          </p>
        </div>

        <div className="rounded-2xl border border-[#C9A227]/40 bg-[#132D23] px-4 py-2.5 text-xs text-[#F5F0E6]">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-[#C9A227]">
            {lang === 'ar' ? 'جلسة الإدارة الموثقة' : 'Verified Admin Session'}
          </span>
          <span className="font-en font-extrabold">{adminActor?.email || adminActor?.uid}</span>
        </div>
      </div>

      {/* Filters, Search, and Sort Controls */}
      <div className="palm-card rounded-3xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {filterTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-extrabold cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#1A3C2F] text-[#C9A227] shadow-[0_2px_0_#0D2119]'
                    : 'bg-[#EAE2D0] text-[#1A3C2F] hover:bg-[#DFD5BE]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`font-en rounded-lg px-1.5 py-0.5 text-[11px] tabular-nums ${
                    active ? 'bg-[#C9A227] text-[#142A20]' : 'bg-[#F5F0E6] text-[#1A3C2F]'
                  }`}
                >
                  {counts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 start-3.5 h-4 w-4 -translate-y-1/2 text-[#546E61]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.adminSearchPlaceholder}
              className="w-full rounded-xl border border-[#1A3C2F]/20 bg-[#F5F0E6] py-2.5 ps-10 pe-4 text-xs sm:text-sm font-bold text-[#1A3C2F] placeholder:text-[#756C59] focus:border-[#1A3C2F] focus:outline-none"
            />
          </div>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value === 'oldest' ? 'oldest' : 'newest')}
            aria-label={t.sortLabel}
            className="rounded-xl border border-[#1A3C2F]/20 bg-[#EAE2D0] px-3.5 py-2.5 text-xs sm:text-sm font-extrabold text-[#1A3C2F] focus:outline-none cursor-pointer"
          >
            <option value="newest">{t.adminSortNewest}</option>
            <option value="oldest">{t.adminSortOldest}</option>
          </select>
        </div>
      </div>

      {subscriptionError && (
        <div
          role="alert"
          className="rounded-2xl border border-[#F97066]/40 bg-[#4A1C1A] p-4 text-xs sm:text-sm font-bold text-[#FEE4E2]"
        >
          {subscriptionError}
        </div>
      )}

      {/* Split Master-Detail Dashboard */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
          <div className="palm-card rounded-3xl p-5 space-y-3">
            {[1, 2, 3].map((k) => (
              <div key={k} className="h-20 rounded-2xl bg-[#E4DAC4] animate-pulse" />
            ))}
          </div>
          <div className="palm-card rounded-3xl p-6 space-y-4">
            <div className="h-8 w-56 rounded bg-[#E4DAC4] animate-pulse" />
            <div className="h-36 rounded-2xl bg-[#E4DAC4] animate-pulse" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5 items-start">
          {/* Request List */}
          <div className="palm-card rounded-3xl p-3 sm:p-4 space-y-2.5 max-h-[75vh] overflow-y-auto">
            {filteredRequests.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <FileSearch className="mx-auto h-8 w-8 text-[#9E7C16]" />
                <h2 className="text-base font-extrabold text-[#1A3C2F]">
                  {t.adminNoRequestsTitle}
                </h2>
                <p className="text-xs text-[#4A6457]">{t.adminNoRequestsDesc}</p>
              </div>
            ) : (
              filteredRequests.map((req) => {
                const badge = getStatusBadgeStyle(req.status);
                const selected = selectedRequest?.requestId === req.requestId;
                const totalItems = req.items.reduce((s, it) => s + it.quantity, 0);

                return (
                  <button
                    key={req.requestId}
                    type="button"
                    onClick={() => setSelectedRequestId(req.requestId)}
                    className={`w-full rounded-2xl p-3.5 text-start transition-all cursor-pointer border ${
                      selected
                        ? 'border-[#1A3C2F] bg-[#EAE2D0] shadow-[0_3px_0_#CDBE9F]'
                        : 'border-[#1A3C2F]/12 bg-[#F5F0E6] hover:bg-[#EFE8D6]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-en text-xs font-extrabold text-[#1A3C2F]">
                        {req.requestNumber}
                      </span>
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-extrabold ${badge.bg} ${badge.text}`}
                      >
                        {lang === 'ar' ? badge.labelAr : badge.labelEn}
                      </span>
                    </div>

                    <p className="mt-1.5 text-sm font-extrabold text-[#1A3C2F] truncate">
                      {req.customerName}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-[#546E61]">
                      <span className="font-en" dir="ltr">
                        {req.customerContact}
                      </span>
                      <span>
                        {totalItems} {totalItems === 1 ? t.itemSingular : t.itemPlural}
                      </span>
                    </div>

                    {req.verifiedTotalSar !== undefined && (
                      <p className="mt-1.5 font-en text-xs font-extrabold text-[#1E6B38]">
                        {formatPrice(req.verifiedTotalSar)} SAR
                        {req.approvedOrderNumber ? ` · ${req.approvedOrderNumber}` : ''}
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Request Verification & Approval Panel */}
          {selectedRequest ? (
            <div className="space-y-5">
              <div className="palm-card rounded-3xl overflow-hidden">
                <div className="border-b border-[#1A3C2F]/12 bg-[#EAE2D0] p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#4A6457]">
                        <span className="font-en text-base font-extrabold text-[#1A3C2F]">
                          {selectedRequest.requestNumber}
                        </span>
                        <span className="rounded-lg bg-[#1A3C2F] px-2 py-0.5 text-[11px] font-bold text-[#C9A227]">
                          {t.pickupLabel}
                        </span>
                        <span className="rounded-lg bg-[#F5F0E6] px-2 py-0.5 font-en text-[11px] font-bold text-[#1A3C2F]">
                          SAR
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs sm:text-sm font-bold text-[#1A3C2F]">
                        <span className="inline-flex items-center gap-1.5">
                          <UserIcon className="h-4 w-4 text-[#9E7C16]" />
                          {selectedRequest.customerName}
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-en" dir="ltr">
                          <Phone className="h-4 w-4 text-[#9E7C16]" />
                          {selectedRequest.customerContact}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-[#546E61]">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDateTime(selectedRequest.createdAtMs, lang)}
                        </span>
                      </div>
                    </div>

                    {(() => {
                      const badge = getStatusBadgeStyle(selectedRequest.status);
                      return (
                        <span
                          className={`rounded-xl px-3 py-1.5 text-xs font-extrabold ${badge.bg} ${badge.text}`}
                        >
                          {lang === 'ar' ? badge.labelAr : badge.labelEn}
                        </span>
                      );
                    })()}
                  </div>

                  {selectedRequest.orderNote && (
                    <div className="mt-3 rounded-xl bg-[#F5F0E6] px-3.5 py-2.5 text-xs font-bold text-[#1A3C2F]">
                      <span className="text-[#9E7C16]">{t.notesLabel}:</span>{' '}
                      {selectedRequest.orderNote}
                    </div>
                  )}

                  {selectedRequest.status === 'rejected' && selectedRequest.rejectionReason && (
                    <div className="mt-3 rounded-xl bg-[#FEE4E2] px-3.5 py-2.5 text-xs font-bold text-[#912018]">
                      {selectedRequest.rejectionReason}
                    </div>
                  )}

                  {isSelectedPromoted && selectedRequest.approvedOrderId && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#1A3C2F] px-4 py-3 text-xs text-[#F5F0E6]">
                      <div>
                        <span className="block text-[10px] font-bold text-[#C9A227]">
                          {t.adminOrderCreatedBanner}
                        </span>
                        <span className="font-en font-extrabold text-sm">
                          {selectedRequest.approvedOrderNumber} · /orders/
                          {selectedRequest.approvedOrderId}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onInspectOrder(selectedRequest.approvedOrderId!)}
                        className="palm-btn-gold inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold cursor-pointer"
                      >
                        <PackageCheck className="h-3.5 w-3.5" />
                        <span>{t.requestViewFinalOrderBtn}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Live Verification Status Banner */}
                <div className="p-5 sm:p-6 space-y-5">
                  {actionError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2.5 rounded-2xl bg-[#FEE4E2] p-3.5 text-xs sm:text-sm font-bold text-[#912018]"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{actionError}</span>
                    </div>
                  )}

                  {actionSuccess && (
                    <div
                      role="status"
                      className="flex items-start gap-2.5 rounded-2xl bg-[#DCE8DE] p-3.5 text-xs sm:text-sm font-bold text-[#1E6B38]"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{actionSuccess}</span>
                    </div>
                  )}

                  {!isSelectedTerminal && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#1A3C2F]/12 bg-[#EAE2D0] p-4">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        {inspectingCatalog ? (
                          <RefreshCw className="h-4 w-4 shrink-0 text-[#9E7C16] animate-spin mt-0.5" />
                        ) : inspection?.canApprove ? (
                          <BadgeCheck className="h-5 w-5 shrink-0 text-[#1E6B38] mt-0.5" />
                        ) : (
                          <ShieldAlert className="h-5 w-5 shrink-0 text-[#912018] mt-0.5" />
                        )}
                        <div className="text-xs font-bold">
                          <p
                            className={
                              inspection?.canApprove ? 'text-[#1E6B38]' : 'text-[#912018]'
                            }
                          >
                            {inspectingCatalog
                              ? lang === 'ar'
                                ? 'جاري التحقق من الأسعار وتوفر الأصناف في Firestore...'
                                : 'Checking live Firestore catalog & pricing...'
                              : inspection?.canApprove
                                ? t.adminCatalogCheckPassed
                                : t.adminCatalogCheckBlocked}
                          </p>
                          {inspection && inspection.issues.length > 0 && (
                            <ul className="mt-1.5 space-y-1 text-[11px] font-semibold text-[#912018]">
                              {inspection.issues.map((issue, i) => (
                                <li key={`${issue.itemId}-${i}`}>
                                  • [{issue.code}] {issue.message}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={inspectingCatalog}
                        onClick={() => void refreshLiveVerification(selectedRequest)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#F5F0E6] px-3 py-1.5 text-xs font-extrabold text-[#1A3C2F] border border-[#1A3C2F]/15 hover:bg-[#E4DAC4] cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span>{lang === 'ar' ? 'تحديث الفحص' : 'Re-Check Catalog'}</span>
                      </button>
                    </div>
                  )}

                  {/* Requested Line Items + Authoritative Pricing Breakdown */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm sm:text-base font-extrabold text-[#1A3C2F]">
                        {t.adminVerificationBreakdownHeading}
                      </h2>
                      <span className="font-en text-xs font-bold text-[#546E61]">
                        {selectedRequest.requestId}
                      </span>
                    </div>

                    <div className="divide-y divide-[#1A3C2F]/10 rounded-2xl border border-[#1A3C2F]/12 bg-[#F5F0E6]">
                      {displayBreakdown
                        ? displayBreakdown.items.map((line, idx) => (
                            <div
                              key={`${line.itemId}-${idx}`}
                              className="flex flex-wrap items-start justify-between gap-3 p-3.5 sm:p-4"
                            >
                              <div className="min-w-0 flex-1 space-y-1">
                                <p className="text-sm font-extrabold text-[#1A3C2F]">
                                  <span className="font-en text-[#9E7C16] me-1.5">
                                    {line.quantity}x
                                  </span>
                                  {lang === 'ar'
                                    ? line.nameAr || line.name
                                    : line.name}
                                </p>
                                <p className="font-en text-[11px] font-bold text-[#546E61]">
                                  SKU: {line.itemId} · Base: {formatPrice(line.basePriceSar)} SAR ·
                                  Add-ons: +{formatPrice(line.customizationTotalSar)} SAR
                                </p>
                                {line.note && (
                                  <p className="text-xs font-semibold text-[#3B594B]">{line.note}</p>
                                )}
                              </div>
                              <div className="text-end shrink-0">
                                <p className="font-en text-sm font-extrabold text-[#1A3C2F] tabular-nums">
                                  {formatPrice(line.lineTotalSar)} SAR
                                </p>
                                <p className="font-en text-[11px] text-[#546E61] tabular-nums">
                                  ({formatPrice(line.unitPriceSar)} / unit)
                                </p>
                              </div>
                            </div>
                          ))
                        : selectedRequest.items.map((rawItem, idx) => (
                            <div
                              key={`${rawItem.itemId}-${idx}`}
                              className="flex flex-wrap items-start justify-between gap-3 p-3.5 sm:p-4"
                            >
                              <div className="space-y-1">
                                <p className="text-sm font-extrabold text-[#1A3C2F]">
                                  <span className="font-en text-[#9E7C16] me-1.5">
                                    {rawItem.quantity}x
                                  </span>
                                  {lang === 'ar'
                                    ? rawItem.nameAr || rawItem.name || rawItem.itemId
                                    : rawItem.name || rawItem.itemId}
                                </p>
                                <p className="font-en text-[11px] font-bold text-[#546E61]">
                                  SKU: {rawItem.itemId}
                                  {rawItem.selectedSizeId ? ` · Size: ${rawItem.selectedSizeId}` : ''}
                                  {rawItem.temperature ? ` · ${rawItem.temperature}` : ''}
                                  {rawItem.milkOption ? ` · Milk: ${rawItem.milkOption}` : ''}
                                </p>
                                {rawItem.specialInstructions && (
                                  <p className="text-xs text-[#4A6457]">
                                    {rawItem.specialInstructions}
                                  </p>
                                )}
                              </div>
                              <span className="rounded-lg bg-[#FEE4E2] px-2.5 py-1 text-[11px] font-bold text-[#912018]">
                                {lang === 'ar' ? 'بانتظار التحقق' : 'Unverified'}
                              </span>
                            </div>
                          ))}
                    </div>

                    {displayBreakdown && (
                      <div className="rounded-2xl bg-[#EAE2D0] p-4 space-y-2 text-xs sm:text-sm">
                        <div className="flex items-center justify-between font-bold text-[#4A6457]">
                          <span>{t.subtotalLabel}</span>
                          <span className="font-en tabular-nums">
                            {formatPrice(displayBreakdown.subtotalSar)} SAR
                          </span>
                        </div>
                        <div className="flex items-center justify-between font-bold text-[#4A6457]">
                          <span>{t.requestDiscountLabel}</span>
                          <span className="font-en tabular-nums">
                            {formatPrice(displayBreakdown.discountSar)} SAR
                          </span>
                        </div>
                        <div className="flex items-center justify-between font-bold text-[#4A6457]">
                          <span>{t.requestTaxLabel}</span>
                          <span className="font-en tabular-nums">
                            {formatPrice(displayBreakdown.taxSar)} SAR
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-[#1A3C2F]/15 pt-2.5 text-base font-extrabold text-[#1A3C2F]">
                          <span>{t.requestVerifiedTotalLabel}</span>
                          <span className="font-en tabular-nums text-lg text-[#1E6B38]">
                            {formatPrice(displayBreakdown.totalBillSar)} SAR
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Admin Workflow Action Controls */}
                  {!isSelectedTerminal && (
                    <div className="space-y-4 border-t border-[#1A3C2F]/12 pt-4">
                      <div className="flex flex-wrap items-center gap-3">
                        {selectedRequest.status === 'pending_review' && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleStartReview()}
                            className="palm-btn-forest inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-extrabold cursor-pointer disabled:opacity-50"
                          >
                            <Clock className="h-4 w-4 text-[#C9A227]" />
                            <span>{t.adminStartReviewBtn}</span>
                          </button>
                        )}

                        {(selectedRequest.status === 'pending_review' ||
                          selectedRequest.status === 'reviewing') && (
                          <button
                            type="button"
                            disabled={actionBusy || inspectingCatalog || !inspection?.canApprove}
                            onClick={() => void handleVerifyRequest()}
                            className="palm-btn-forest inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-extrabold cursor-pointer disabled:opacity-50"
                          >
                            <ClipboardCheck className="h-4 w-4 text-[#C9A227]" />
                            <span>{t.adminVerifyRequestBtn}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={actionBusy || inspectingCatalog || !inspection?.canApprove}
                          onClick={() => {
                            setRejectOpen(false);
                            setConfirmApproveOpen((v) => !v);
                          }}
                          className="palm-btn-gold inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2 text-xs sm:text-sm font-extrabold cursor-pointer disabled:opacity-50"
                        >
                          <PackageCheck className="h-4 w-4" />
                          <span>{t.adminApprovePromoteBtn}</span>
                        </button>

                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => {
                            setConfirmApproveOpen(false);
                            setRejectOpen((v) => !v);
                          }}
                          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#912018]/35 bg-[#FEE4E2] px-4 py-2 text-xs sm:text-sm font-extrabold text-[#912018] hover:bg-[#FDD5D2] cursor-pointer disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          <span>{t.adminRejectBtn}</span>
                        </button>
                      </div>

                      {/* Confirmation Panel Before Atomic Order Promotion */}
                      {confirmApproveOpen && displayBreakdown && (
                        <div className="rounded-2xl border-2 border-[#C9A227] bg-[#FFF8E1] p-4 sm:p-5 space-y-3">
                          <h3 className="text-sm sm:text-base font-extrabold text-[#1A3C2F]">
                            {t.adminConfirmApproveTitle}
                          </h3>
                          <p className="text-xs font-semibold text-[#4A6457]">
                            {t.adminConfirmApproveDesc}
                          </p>
                          <div className="rounded-xl bg-[#F5F0E6] p-3 text-xs font-extrabold text-[#1A3C2F] flex items-center justify-between">
                            <span>{selectedRequest.customerName} · {selectedRequest.requestNumber}</span>
                            <span className="font-en text-sm text-[#1E6B38]">
                              {formatPrice(displayBreakdown.totalBillSar)} SAR
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2.5">
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void handleApproveAndPromote()}
                              className="palm-btn-gold inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-extrabold cursor-pointer disabled:opacity-60"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              <span>{t.adminConfirmApproveBtn}</span>
                            </button>
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => setConfirmApproveOpen(false)}
                              className="inline-flex min-h-[42px] items-center rounded-xl bg-[#EAE2D0] px-4 py-2 text-xs sm:text-sm font-bold text-[#1A3C2F] cursor-pointer"
                            >
                              {t.adminCancelBtn}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Mandatory Rejection Reason Form */}
                      {rejectOpen && (
                        <div className="rounded-2xl border border-[#912018]/35 bg-[#FEE4E2]/70 p-4 sm:p-5 space-y-3">
                          <label
                            htmlFor="admin-reject-reason"
                            className="block text-xs sm:text-sm font-extrabold text-[#912018]"
                          >
                            {t.adminRejectReasonLabel}
                          </label>
                          <textarea
                            id="admin-reject-reason"
                            rows={2}
                            maxLength={300}
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder={t.adminRejectReasonPlaceholder}
                            className="w-full rounded-xl border border-[#912018]/30 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-[#1A3C2F] focus:outline-none"
                          />
                          <div className="flex flex-wrap items-center gap-2.5">
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void handleRejectRequest()}
                              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#912018] px-4 py-2 text-xs sm:text-sm font-extrabold text-white hover:bg-[#7A1B14] cursor-pointer disabled:opacity-60"
                            >
                              <XCircle className="h-4 w-4" />
                              <span>{t.adminRejectBtn}</span>
                            </button>
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => setRejectOpen(false)}
                              className="inline-flex min-h-[42px] items-center rounded-xl bg-[#F5F0E6] px-4 py-2 text-xs sm:text-sm font-bold text-[#1A3C2F] cursor-pointer"
                            >
                              {t.adminCancelBtn}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Request Audit Trail */}
              <div className="palm-card rounded-3xl p-5 sm:p-6 space-y-3">
                <div className="flex items-center gap-2 text-sm font-extrabold text-[#1A3C2F]">
                  <History className="h-4 w-4 text-[#9E7C16]" />
                  <span>{t.adminAuditTrailHeading}</span>
                </div>

                {selectedRequestAudit.length === 0 ? (
                  <p className="text-xs font-semibold text-[#546E61]">
                    {lang === 'ar'
                      ? 'لا توجد إجراءات إدارية مسجلة لهذا الطلب بعد.'
                      : 'No admin audit actions recorded for this request yet.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-[#1A3C2F]/10">
                    {selectedRequestAudit.map((log) => (
                      <li
                        key={log.id}
                        className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-en font-extrabold text-[#1A3C2F]">
                            {log.action}
                          </span>
                          {log.details && (
                            <p className="text-[11px] font-semibold text-[#4A6457]">
                              {log.details}
                            </p>
                          )}
                          <p className="font-en text-[10px] text-[#756C59]">
                            {log.adminEmail || log.adminUid}
                          </p>
                        </div>
                        <span className="text-[11px] font-semibold text-[#546E61]">
                          {formatDateTime(log.createdAtMs, lang)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="palm-card rounded-3xl p-8 text-center">
              <FileSearch className="mx-auto h-10 w-10 text-[#9E7C16]" />
              <h2 className="mt-3 text-lg font-extrabold text-[#1A3C2F]">
                {t.adminNoRequestsTitle}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-[#4A6457]">
                {t.adminNoRequestsDesc}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
