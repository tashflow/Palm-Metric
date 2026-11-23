# PALM METRIC — STAGE 04L: ADMIN ORDER APPROVAL & PROMOTION SYSTEM (IMPLEMENTATION REPORT)

**Project Identity:**
- **Customer App:** `https://tashflow.github.io/Palm-Metric/`
- **External Admin Repository:** `https://github.com/tashflow/palm-metric-admin-` *(external repo; not present locally in this workspace)*
- **Firebase Project ID:** `palm-metric-app`
- **Firestore Database:** `(default)`
- **Firebase Plan Target:** Spark (Free Plan — zero runtime Cloud Functions / `httpsCallable` / `firebase/functions` dependencies)
- **Service Mode:** Pickup only (`pickup`)
- **Currency:** `SAR`
- **Customer WhatsApp:** `966506439172`

---

## 1. Executive Summary

Stage 04L implements the Spark-compatible **Admin Order Approval & Promotion System** directly inside the local Palm Metric codebase, completing the two-phase Spark architecture started in Stage 04K (`Customer App → /orderRequests/{requestId} → Admin Verification & Atomic Promotion → Final /orders/{orderId}`).

Key outcomes:
- Delivered a fail-closed, bilingual (AR RTL / EN LTR) **Admin Order Requests Dashboard** gated by `isVerifiedAdminActor`, completely hidden from guest and regular customer views.
- Built an integer-halala (`100 halalas = 1 SAR`) authoritative pricing and live catalog verification engine (`src/lib/authoritativePricing.ts`) reading `/menu`, `/productCustomizations`, and `/settings/coffeeOptions` with zero invented discounts or taxes (`discountSar: 0`, `taxSar: 0`).
- Implemented atomic Firestore transaction lifecycle operations (`startOrderRequestReview`, `verifyOrderRequestPricing`, `approveAndPromoteOrderRequest`, `rejectOrderRequest`) in `src/lib/adminOrderRequests.ts` with deterministic duplicate-order prevention (`ord_req_...` + `PM-XXXXXX`) and immutable `/orderRequestAuditLogs` creation.
- Updated `OrderTrackerPage.tsx`, `firestoreSync.ts`, `firestore.spark.rules`, and `firebase-blueprint.json` while keeping production `firestore.rules` and `functions/` untouched.
- Authored and verified a 20-scenario QA test suite (`scripts/stage04l.test.ts`), alongside passing all prior Stage 04D (12/12) and Stage 04K (17/17) regression suites, `audit-rules.mjs`, TypeScript lint, and Vite production build.

All work was performed strictly locally: zero deployments and zero production Firestore writes were executed.

---

## 2. Pre-Implementation Inspection Report

Before modifying any files in Stage 04L, a full workspace inspection verified:
1. **Application Scope & Admin Repo Separation:** The local workspace contains the full React/Vite Customer App (`Palm-Metric`) plus the local `functions/` directory and root configs. The separate Admin repository (`https://github.com/tashflow/palm-metric-admin-`) is NOT cloned inside this workspace; therefore, Stage 04L decoupled its core Admin auth, pricing, and transaction services cleanly under `src/lib/` while integrating the Admin dashboard page inside `App.tsx` gated strictly to verified Admin accounts.
2. **Stage 04K Baseline (`STAGE_04K_CUSTOMER_ORDER_REQUEST_IMPLEMENTATION_REPORT.md`):** Customer checkout writes strictly zero-price `/orderRequests/{requestId}` docs (`status: 'pending_review'`, `requestSource: 'customer-app-spark'`) via `submitCustomerOrderRequest` without invoking `httpsCallable`.
3. **Blueprint (`firebase-blueprint.json`):** Documented `Billboard`, `MenuItem`, `Category`, `CoffeeOptionsSettings`, `Order`, `OrderRequest`, `IdempotencyKey`, `ProductCustomization`, `AppReport`, `FcmToken`, and `Admin` collections prior to Stage 04L extensions.
4. **Rules Baseline (`firestore.rules` vs `firestore.spark.rules`):** Production `firestore.rules` was locked to Cloud Function order creation (`allow create: if false;` on `/orders`), whereas Stage 04K's local `firestore.spark.rules` introduced `/orderRequests/{requestId}` and `isAdmin() && isValidAdminOrderCreate(incoming())` on `/orders/{orderId}`.
5. **Authentication & Admin Authorization:** Guest checkout uses Firebase Anonymous Auth (`ensureGuestFirebaseSession`), while admin verification combines verified non-anonymous allowlisted emails (`ADMIN_EMAILS`), UID allowlist (`ADMIN_UIDS`), and `/admins/{uid}` document presence.
6. **Canonical `/orders` Data Structure:** `Order` expects `orderNumber` (`PM-XXXXXX`), `customerUid`, `customerName`, `customerContact`, `items` (`itemId`, `name`, `price`, `basePrice`, `customizationTotal`, `quantity`, etc.), `subtotal`, `totalBill`, `currency: 'SAR'`, `orderType: 'pickup'`, `status` (`Pending | Preparing | Ready | Completed | Cancelled`), `sourceRequestId`, and timestamps.
7. **Catalog, Customization & Inventory Collections:** Authoritative item data resides in `/menu/{itemId}` (`price`, `inStock`, `isAvailable`, `available`, `outOfStock`, `stockQuantity`, `stockCount`, `allowMilkOption`, `coconutMilkPrice`), `/productCustomizations/{productId}` (normalized via `normalizeCustomizationConfig`), and `/settings/coffeeOptions`.
8. **Existing Test Harness:** `scripts/stage04d.test.ts` (12 checks), `scripts/stage04k.test.ts` (17 checks), and `scripts/audit-rules.mjs` existed and ran via local `tsx` and `node`. Java was not installed (`JAVA_NOT_INSTALLED`), preventing local Firebase Emulator Suite execution.

---

## 3. Created and Modified Files Inventory

| File | Action | Purpose |
| --- | --- | --- |
| `src/lib/adminAuth.ts` | **Created** | Verified Admin actor normalization (`firebaseUserToAdminActor`), allowlists (`ADMIN_EMAILS`, `ADMIN_UIDS`), fail-closed guards (`isVerifiedAdminActor`, `assertVerifiedAdminActor`), and `AdminApprovalError`. |
| `src/lib/authoritativePricing.ts` | **Created** | Integer halala math (`sarToHalalas`, `halalasToSar`), catalog availability/stock validation (`isAuthoritativeMenuItemAvailable`), customization resolution (`resolveAuthoritativeCustomizationConfig`), per-line validation (`validateAndPriceOrderRequestItem`), transactional calculation (`calculateAuthoritativeOrderRequestPricing`), and non-mutating UI pre-check (`inspectOrderRequestVerification`). |
| `src/lib/adminOrderRequests.ts` | **Created** | Deterministic order ID/number generators (`deriveDeterministicOrderId`, `deriveOfficialOrderNumber`), transactional Firestore store adapter (`defaultAdminOrderRequestStore`), lifecycle functions (`startOrderRequestReview`, `verifyOrderRequestPricing`, `approveAndPromoteOrderRequest`, `rejectOrderRequest`), catalog preloader (`fetchAuthoritativeCatalogForRequest`), and live subscriptions (`subscribeAllOrderRequestsForAdmin`, `subscribeOrderRequestAuditLogs`). |
| `src/components/AdminOrderRequestsPage.tsx` | **Created** | Bilingual AR/EN Admin Order Requests Dashboard: verified Admin gate, KPIs, filter tabs, search/sort, split queue/detail view, live catalog inspection breakdown, confirmation modal/box, rejection reason form, official order jump button, and audit trail log panel. |
| `scripts/stage04l.test.ts` | **Created** | 20-scenario automated QA verification suite with serialized in-memory Spark Firestore transaction harness. |
| `STAGE_04L_ADMIN_ORDER_APPROVAL_IMPLEMENTATION_REPORT.md` | **Created** | This complete Stage 04L engineering & QA verification report. |
| `src/types.ts` | **Modified** | Added `'admin'` to `PageView`; `'verified' \| 'order_created'` to `OrderRequestStatus`; `VerifiedPricingLineItem`, `VerifiedPricingBreakdown`, `AdminOrderRequestAuditAction`, `OrderRequestAuditEntry`; Stage 04L fields on `OrderRequest` & `Order`; numeric stock fields on `MenuItem`. |
| `src/lib/firestoreSync.ts` | **Modified** | Updated `normalizeOrderRequestStatus` so `'verified'` maps cleanly to `'verified'` (preserving `'order_created'` and legacy `'approved'`), plus expanded `mapOrderRequestSnapshot` and `mapOrderSnapshot` for Stage 04L fields (`verifiedPricing`, `verifiedTotalSar`, `discountTotal`, `taxTotal`, `paymentMethod`, `paymentStatus`, `approvedBy`, `approvedAtMs`, `sourceRequestId`). |
| `src/data/i18n.ts` | **Modified** | Added 35 bilingual Arabic and English copy keys covering the Admin dashboard, catalog verification alerts, confirmation & rejection dialogs, audit trail headings, and verified tracker labels. |
| `src/components/OrderTrackerPage.tsx` | **Modified** | Added 4-step request lifecycle handling (`pending_review`, `reviewing`, `verified`, `order_created` / `approved`), `VerifiedPricingBreakdown` card (`subtotalSar`, `discountSar`, `taxSar`, `totalBillSar`), `approvedOrderNumber` badge, official order navigation button, and rejection alert. |
| `src/components/Header.tsx` | **Modified** | Added conditional `showAdminNav` tab (`navAdmin`) shown exclusively when `isVerifiedAdminActor` is true; completely hidden from guest and customer sessions. |
| `src/App.tsx` | **Modified** | Added `/admins/{uid}` lookup alongside `onAuthStateChanged`, computed `isVerifiedAdmin` for nav gating, and mounted `<AdminOrderRequestsPage />` on `view === 'admin'` with live inspection transition to `'tracker'`. |
| `firestore.spark.rules` | **Modified** | Tightened `isValidOrderRequestAdminUpdate` (terminal-state lock, verified pricing & promotion metadata validation), extended `isValidAdminOrderCreate` and `isValidOrderUpdate`, and added immutable `/orderRequestAuditLogs/{auditId}` (`allow update, delete: if false;`). |
| `firebase-blueprint.json` | **Modified** | Updated `Order` & `OrderRequest` schemas and added `OrderRequestAuditLog` entity + `/orderRequestAuditLogs/{auditId}` collection spec. |
| `scripts/stage04k.test.ts` | **Modified** | Updated Case 15 assertion (`normalizeOrderRequestStatus('verified') === 'verified'`) to reflect Stage 04L's distinct `verified` status while preserving legacy `'approved'`. |

**Explicitly Untouched:** Production `firestore.rules`, `functions/**`, `CheckoutPage.tsx` checkout request submission semantics, and `AccountPage.tsx`.

---

## 4. Architecture Overview & External Admin Repo Boundary

In the Spark-plan model, there is no backend Cloud Function (`createPalmMetricOrder`). Instead:
1. **Customer App (`Stage 04K`)** writes an unpriced `/orderRequests/{requestId}` document in `'pending_review'` status bound strictly to the authenticated customer's `request.auth.uid`.
2. **Admin Approval & Promotion System (`Stage 04L`)** runs inside an authenticated Admin session (`AdminOrderRequestsPage.tsx` -> `src/lib/adminOrderRequests.ts`). Inside a Firestore `runTransaction`:
   - Reads the target `/orderRequests/{requestId}`, deterministic target `/orders/{ord_<requestId>}`, `/settings/coffeeOptions`, and every referenced `/menu/{itemId}` + `/productCustomizations/{itemId}` document.
   - Recomputes exact halala pricing, checks availability/stock/customization constraints, and atomically writes `/orders/{orderId}`, updates `/orderRequests/{requestId}` (`status: 'order_created'`), and appends immutable `/orderRequestAuditLogs/{auditId}` records.
3. **External Admin App Notice:** Because `https://github.com/tashflow/palm-metric-admin-` is a separate repository not present in this container, `src/lib/adminAuth.ts`, `src/lib/authoritativePricing.ts`, and `src/lib/adminOrderRequests.ts` are cleanly decoupled from React UI state so the exact same TypeScript modules and Firestore contracts can be dropped into `palm-metric-admin-` without rewriting logic.

---

## 5. Admin Authentication & Fail-Closed Authorization (`src/lib/adminAuth.ts`)

Every Admin UI gate, subscription, and transactional mutation enforces `isVerifiedAdminActor` / `assertVerifiedAdminActor`:
- **Rejects Anonymous & Unauthenticated Callers:** Explicitly returns `false` if `!actor`, `!actor.uid`, `actor.isAnonymous === true`, or `actor.providerId === 'anonymous'`.
- **Verified Admin Criteria (matching `firestore.spark.rules` `isAdmin()`):**
  1. `ADMIN_UIDS.has(uid)` (`39H76y4E55g5yX2uY0lE5bQ3a393`), OR
  2. `actor.emailVerified === true && ADMIN_EMAILS.has(email.toLowerCase())` (`palmmetric1@gmail.com`, `palmmatric1@gmail.com`, `tashfilartwork@gmail.com`, `tashflow26@gmail.com`), OR
  3. `actor.emailVerified === true && actor.isAdminDocPresent === true` (`/admins/{uid}` exists).
- **UI Isolation:** `Header.tsx` only renders the Admin tab when `showAdminNav === true`; navigating to `AdminOrderRequestsPage` without verified Admin status renders a fail-closed lock screen prompting verified Google Admin Sign-In (`onSignInAdmin`) and displays zero order requests or customer PII.

---

## 6. Admin Order Requests Dashboard (`src/components/AdminOrderRequestsPage.tsx`)

The Admin Dashboard preserves the Palm Metric visual design system (`#1A3C2F`, `#C9A227`, `#FAF7F2`, `#2A4D3E`) with full bilingual AR (RTL) / EN (LTR) support:
- **Live Queue Subscriptions:** Subscribes to `subscribeAllOrderRequestsForAdmin` (`/orderRequests`) and `subscribeOrderRequestAuditLogs` (`/orderRequestAuditLogs`).
- **Filtering, Search & Sorting:**
  - Filter tabs with live counters: `All`, `Pending Review`, `Under Review`, `Verified`, `Order Created`, `Rejected`.
  - Search input matching `requestId` / `REQ-...`, `customerName`, `customerContact`, or `approvedOrderNumber`.
  - Sort toggle between newest-first (`createdAtMs` descending) and oldest-first.
- **Split Master-Detail Workspace:**
  - Displays full request metadata (customer name, phone, pickup badge, currency `SAR`, `lang`, optional `orderNote`, requested items, sizes, temperature, milk choice, custom options, special instructions).
  - Runs live `fetchAuthoritativeCatalogForRequest` + `inspectOrderRequestVerification` for the selected request to show Admin whether catalog availability/options pass (`adminCatalogCheckPassed`) or fail (`adminCatalogCheckBlocked` with itemized issue codes/messages) alongside line-by-line SAR verification totals (`basePriceSar`, `customizationTotalSar`, `unitPriceSar`, `lineTotalSar`, `subtotalSar`, `discountSar`, `taxSar`, `totalBillSar`).
- **Action Controls:**
  - `Start Review` (`startOrderRequestReview`)
  - `Verify Catalog & Prices` (`verifyOrderRequestPricing`)
  - `Approve & Create Order` (`approveAndPromoteOrderRequest` — guarded by explicit in-UI confirmation dialog `adminConfirmApproveTitle` and double-click `submitting` lock)
  - `Reject Request` (`rejectOrderRequest` — expands mandatory rejection reason textarea requiring >= 3 non-whitespace chars)
  - Direct link to view/inspect created `/orders/{approvedOrderId}` (`onInspectOrder`)
  - Chronological Audit Trail panel showing actions, actor UID/email, totals, order numbers, and rejection reasons.

---

## 7. Authoritative Pricing & Live Catalog Validation Engine (`src/lib/authoritativePricing.ts`)

All financial math executes strictly in **integer halalas (`HALALAS_PER_SAR = 100`)** via `sarToHalalas` and `halalasToSar`, immune to IEEE-754 floating-point drift and completely ignoring any client price, subtotal, discount, tax, or total fields:
- **Inventory & Availability Checks (`isAuthoritativeMenuItemAvailable`):**
  - Blocks if `outOfStock === true`, `inStock === false`, `isAvailable === false`, or `available === false`.
  - When numeric `stockQuantity` or `stockCount` is present on `/menu/{itemId}`, blocks `<= 0` (`OUT_OF_STOCK`) or `numericStock < requestedQuantity` (`INSUFFICIENT_STOCK`).
- **Live Price Bounds & Validation (`sarToHalalas`):**
  - Rejects `NaN`, non-number, `Infinity`, `< 0` (`NEGATIVE_CATALOG_PRICE`), or `> MAX_AMOUNT_SAR` (`100000` SAR) / `> MAX_CUSTOMIZATION_OPTION_PRICE_SAR` (`5000` SAR).
- **Customization & Milk/Size Reconciliation:**
  - Reads `/productCustomizations/{itemId}` (normalized) or falls back to `legacy-milk` from `/settings/coffeeOptions` when applicable (`coconutMilkPrice` or `coconutMilkExtraPrice`).
  - Reconciles legacy `milkOption` and `selectedSizeId` into authoritative groups cleanly.
  - Rejects disabled customization schemas (`CUSTOMIZATIONS_DISABLED`), disabled/missing groups (`INVALID_OR_DISABLED_GROUP`), disabled/missing options (`INVALID_OR_DISABLED_OPTION`), duplicate pairs (`DUPLICATE_CUSTOMIZATION`), missing required groups (`REQUIRED_GROUP_MISSING`), broken required groups with 0 enabled options (`BROKEN_REQUIRED_GROUP`), and violated `minSelections`/`maxSelections` bounds.
  - Rejects `specialInstructions` if `allowSpecialInstructions === false`.
- **Zero Invented Discounts or Taxes:**
  - Line total: `(basePriceHalalas + customizationHalalas) * item.quantity`.
  - Order total: `subtotalHalalas - 0 (discountHalalas) + 0 (taxHalalas)`. Never fabricates promotional discounts or VAT unless configured in store catalog/settings.

---

## 8. Order Request Lifecycle & State Transitions

Stage 04L manages a deterministic state machine over `/orderRequests/{requestId}`:

| State | Meaning | Allowed Next States |
| --- | --- | --- |
| `pending_review` | Submitted by Customer App (Stage 04K) with zero prices | `reviewing`, `verified`, `order_created`, `rejected` |
| `reviewing` | Claimed/opened for review by verified Admin | `verified`, `order_created`, `rejected` |
| `verified` | Authoritative catalog & SAR breakdown verified & stamped | `verified` (re-verify), `order_created`, `rejected` |
| `order_created` | **Terminal.** Atomically promoted to `/orders/{approvedOrderId}` | *Immutable (returns idempotent replay on retry)* |
| `approved` | **Legacy Stage 04K terminal alias.** Normalized & preserved read-only | *Immutable (returns idempotent replay on retry)* |
| `rejected` | **Terminal.** Declined with mandatory `rejectionReason` | *Immutable (blocked from approval/re-verification)* |
| `cancelled` | **Terminal.** Cancelled request | *Immutable* |

All core customer-submitted fields (`requestId`, `customerUid`, `customerName`, `customerContact`, `orderType`, `currency`, `items`, `createdAt`) are preserved unchanged across transitions via `preserveExistingRequestCore` and enforced invariant by `firestore.spark.rules`.

---

## 9. Atomic Promotion to `/orders/{orderId}` & Payment Defaults

When `approveAndPromoteOrderRequest` runs inside `runTransaction`:
1. Re-reads live `/orderRequests/{requestId}`, target `/orders/{ord_<requestId>}`, `/settings/coffeeOptions`, `/menu/*`, and `/productCustomizations/*` inside the same Firestore transaction (so any catalog price or stock change occurring between `Verify` and `Approve` is caught before committing).
2. Computes `VerifiedPricingBreakdown` (`STAGE_04L_PRICING_VERSION = 2`) with integer halalas.
3. Writes canonical `/orders/{orderId}` document:
   - `orderNumber`: deterministic `PM-XXXXXX` via FNV-1a (`deriveOfficialOrderNumber(requestId)`)
   - `customerUid`, `customerName`, `customerContact`, `lang` preserved from `/orderRequests/{requestId}`
   - `items`: authoritative unit prices (`price`, `basePrice`, `customizationTotal`), bilingual names, normalized `note`, safe `imageUrl` (non-`data:`), `temperature`, `milkOption`, `milkExtraPrice`
   - `subtotal`, `discountTotal: 0`, `taxTotal: 0`, `totalBill`
   - `currency: 'SAR'`, `orderType: 'pickup'`, `status: 'Pending'`
   - `sourceApp: 'palm-metric-admin-spark'`, `sourceRequestId: requestId`, `idempotencyKey: requestId`, `pricingVersion: 2`
   - `paymentMethod: 'pay_on_pickup'`, `paymentStatus: 'unpaid'`
   - `approvedBy: admin.uid`, `approvedAt`, `createdAt`, `updatedAt` (`serverTimestamp()`)
4. Atomically updates `/orderRequests/{requestId}` with `status: 'order_created'`, `verifiedTotalSar`, `verifiedPricing`, `approvedBy`, `approvedAt`, `approvedOrderId`, `approvedOrderNumber`, `updatedAt`.
5. Atomically writes two audit entries (`approve_and_promote` and `order_promotion`) to `/orderRequestAuditLogs`.

---

## 10. Duplicate Prevention, Idempotency & Concurrency Safety

- **Deterministic Target IDs:** `deriveDeterministicOrderId(requestId)` maps `req_...` deterministically to `ord_req_...` (bounded to `<= 128` chars), while `deriveOfficialOrderNumber(requestId)` deterministically computes `PM-XXXXXX`.
- **Transactional Read-Before-Write Lock:** `approveAndPromoteOrderRequest` reads BOTH `/orderRequests/{requestId}` and `/orders/{deterministicOrderId}` inside Firestore's optimistic-concurrency `runTransaction`.
- **Safe Idempotent Replay:** If `currentStatus` is already `'order_created'` or `'approved'`, OR if `/orders/{deterministicOrderId}` already exists (`existingOrder !== null`), the transaction performs zero writes and returns `{ idempotentReplay: true, orderId, orderNumber, totalBillSar, ... }`.
- **UI Double-Click Lock:** `AdminOrderRequestsPage.tsx` uses a synchronous ref (`actionLockRef`) plus React `busyAction` state to disable action buttons immediately on click.
- **Rules Reinforcement:** `firestore.spark.rules` blocks any update to `/orderRequests/{requestId}` once `existing().status in ['order_created', 'approved', 'rejected', 'cancelled']`.

---

## 11. Rejection Workflow & Terminal Guards

- `rejectOrderRequest` validates `cleanReason = params.reason.trim().slice(0, 300)` and throws `AdminApprovalError('invalid-argument', ..., 'REJECTION_REASON_REQUIRED')` if `< 3` characters.
- Explicitly checks inside the transaction that neither `order_created` / `approved` status nor an existing `/orders/{ord_<requestId>}` document exists (`ALREADY_PROMOTED`), and prevents re-rejecting an already `rejected` or `cancelled` request (`TERMINAL_REQUEST_STATUS`).
- Sets `status: 'rejected'`, `rejectedBy: admin.uid`, `rejectedAt`, `rejectionReason`, `updatedAt`, and writes a `'reject_request'` entry to `/orderRequestAuditLogs`.
- `firestore.spark.rules` enforces `data.status != 'rejected' || ('rejectionReason' in data && data.rejectionReason is string && data.rejectionReason.size() >= 3)`.

---

## 12. Immutable Admin Audit Trail (`/orderRequestAuditLogs/{auditId}`)

All administrative lifecycle mutations append entries to `/orderRequestAuditLogs`:
- **Supported Actions (`AdminOrderRequestAuditAction`):** `start_review`, `verify_request`, `price_verification`, `approve_and_promote`, `reject_request`, `order_promotion`, `duplicate_approval_blocked`, `verification_blocked`.
- **Fields Captured:** `requestId`, `action`, `adminUid`, `adminEmail`, `previousStatus`, `newStatus`, `approvedOrderId`, `approvedOrderNumber`, `verifiedTotalSar`, `reason`, `details`, `createdAt`.
- **Rule Enforcement (`firestore.spark.rules`):**
  - `get`: `isValidId(auditId) && isAdmin()`
  - `list`: `isVerifiedAdminToken()`
  - `create`: `isValidId(auditId) && isAdmin() && isValidOrderRequestAuditLog(incoming())` requiring `data.adminUid == request.auth.uid` and `data.createdAt == request.time`.
  - `update, delete`: **`if false;`** — strictly append-only and tamper-proof; customers have zero read or write access.

---

## 13. Customer Tracking Integration & Stage 04K -> 04L Status Migration

**Customer Tracker Updates (`src/components/OrderTrackerPage.tsx`, `src/lib/firestoreSync.ts`):**
- **Status Normalization Refinement (Stage 04K -> 04L Migration Note):**
  - In Stage 04K, `normalizeOrderRequestStatus('verified')` mapped to `'approved'` because Admin promotion had not yet been built.
  - In Stage 04L, `normalizeOrderRequestStatus('verified')` now returns **`'verified'`** (Step 3 of the 4-step tracker), distinct from **`'order_created'`** (Step 4 — official `/orders/{approvedOrderId}` created), while legacy **`'approved'`** remains mapped to Step 4 (`'approved'`) for full backward compatibility.
  - `scripts/stage04k.test.ts` (Case 15) was updated from asserting `'verified' -> 'approved'` to asserting `'verified' -> 'verified'` and `'order_created' -> 'order_created'`.
- **Verified Pricing & Promotion Display:** When `verifiedPricing` or `verifiedTotalSar` is present on a customer's tracked `/orderRequests` doc, `OrderTrackerPage.tsx` displays the Verified Total SAR summary card (`Subtotal`, `Discount`, `Tax`, `Verified Total`), the official `approvedOrderNumber` badge (`PM-XXXXXX`), a direct `"Track Final Confirmed Order"` button (`onSelectOrderId(approvedOrderId)`), and a localized rejection reason alert if rejected.
- **No Unintended Customer Side Effects:** Customer checkout (`CheckoutPage.tsx`) remains 100% Stage 04K compliant (zero prices written by customers).

---

## 14. Spark Security Rules Updates (`firestore.spark.rules`)

`firestore.spark.rules` remains a **local Spark rules artifact** (existing production `firestore.rules` untouched):
- **`/orderRequests/{requestId}` (`isValidOrderRequestAdminUpdate`):**
  - Locks terminal statuses (`!(existing().status in ['order_created', 'approved', 'rejected', 'cancelled'])`).
  - Enforces immutable customer & order core fields (`requestId`, `customerUid`, `customerName`, `customerContact`, `orderType`, `currency`, `items`, `createdAt`).
  - Validates `verifiedTotalSar`, `verifiedPricing`, `approvedBy`, `approvedOrderId`, `approvedOrderNumber`, `rejectionReason`.
  - Requires `approvedOrderId`, `approvedOrderNumber`, and `verifiedTotalSar` whenever setting status to `'order_created'` or `'approved'`.
  - Requires `rejectionReason.size() >= 3` when setting `'rejected'`.
- **`/orders/{orderId}` (`isValidAdminOrderCreate` & `isValidOrderUpdate`):**
  - Blocks ALL non-admin users from creating `/orders`.
  - Allows verified Admins (`isAdmin()`) to create `'Pending'` pickup orders binding `approvedBy == request.auth.uid`, `approvedAt == request.time`, `createdAt == request.time`, `updatedAt == request.time`, `currency == 'SAR'`, `orderType == 'pickup'`, `paymentMethod == 'pay_on_pickup'`, `paymentStatus in ['unpaid', 'paid']`, `subtotal`, `discountTotal`, `taxTotal`, `totalBill`.
  - Preserves Admin-only status progression updates (`['status', 'updatedAt']`) while freezing financial fields (`totalBill`, `subtotal`, `discountTotal`, `taxTotal`, `items`, `sourceRequestId`, `approvedBy`).
- **`/orderRequestAuditLogs/{auditId}`:** Immutable append-only Admin audit trail.

---

## 15. Blueprint Schema Updates (`firebase-blueprint.json`)

Updated `firebase-blueprint.json` cleanly:
- **`Order` entity:** Added `discountTotal`, `taxTotal`, `sourceRequestId`, `paymentMethod` (`pay_on_pickup`), `paymentStatus` (`unpaid | paid`), `approvedBy`, `approvedAt`.
- **`OrderRequest` entity:** Updated `status` enum to include `verified` and `order_created`, and documented `reviewedBy`, `reviewedAt`, `verifiedBy`, `verifiedAt`, `verifiedTotalSar`, `verifiedPricing`, `approvedBy`, `approvedAt`, `approvedOrderId`, `approvedOrderNumber`, `rejectedBy`, `rejectedAt`, `rejectionReason`.
- **`OrderRequestAuditLog` entity & `/orderRequestAuditLogs/{auditId}` path:** Documented full audit record schema and collection binding.

---

## 16. Bilingual Support (Arabic RTL & English LTR)

Added and verified 35 Stage 04L translation keys in `src/data/i18n.ts` (`COPY.ar` and `COPY.en`), including:
- `navAdmin`, `adminDashboardTitle`, `adminDashboardSubtitle`
- Filter, search, sort keys (`adminFilterAll`, `adminFilterPending`, `adminFilterReviewing`, `adminFilterVerified`, `adminFilterRejected`, `adminFilterCreated`, `adminSearchPlaceholder`, `adminSortNewest`, `adminSortOldest`)
- Lifecycle CTAs & confirmation dialogs (`adminStartReviewBtn`, `adminVerifyRequestBtn`, `adminApprovePromoteBtn`, `adminRejectBtn`, `adminConfirmApproveTitle`, `adminConfirmApproveDesc`, `adminConfirmApproveBtn`, `adminCancelBtn`)
- Mandatory rejection copy (`adminRejectReasonLabel`, `adminRejectReasonPlaceholder`, `adminRejectReasonRequiredErr`)
- Live catalog verification & tracker labels (`adminCatalogCheckPassed`, `adminCatalogCheckBlocked`, `adminVerificationBreakdownHeading`, `adminAuditTrailHeading`, `requestStatusVerifiedTitle`, `requestVerifiedTotalLabel`, `requestVerifiedBreakdownTitle`, `requestDiscountLabel`, `requestTaxLabel`)

Tested across `scripts/stage04d.test.ts`, `scripts/stage04k.test.ts`, and `scripts/stage04l.test.ts` (Case 19).

---

## 17. Automated QA Test Suite (`scripts/stage04l.test.ts` — 20 Scenarios)

All 20 Stage 04L QA tests executed against real production pricing, auth, mapping, static rules, and serialized transactional in-memory Spark Firestore state (`InMemorySparkFirestoreHarness`):

| # | Test Scenario | Result |
| --- | --- | --- |
| 1 | Enforces verified Admin authentication and blocks anonymous/customer accounts | **PASS** |
| 2 | Calculates authoritative halala-exact SAR pricing across base prices, sizes, and add-ons | **PASS** |
| 3 | Out-of-stock product blocks both catalog inspection and order promotion | **PASS** |
| 4 | Numeric `stockQuantity` lower than requested quantity blocks promotion | **PASS** |
| 5 | Deleted or unknown product in request blocks verification and promotion | **PASS** |
| 6 | Disabled or unavailable customization option blocks verification and approval | **PASS** |
| 7 | Missing required customization group blocks verification and promotion | **PASS** |
| 8 | Invalid/negative catalog prices fail closed and tampered client fields cannot affect verified total | **PASS** |
| 9 | `startOrderRequestReview` moves `pending_review` to `reviewing` and creates `start_review` audit log | **PASS** |
| 10 | `verifyOrderRequestPricing` transitions to `verified` and logs `verify_request` + `price_verification` | **PASS** |
| 11 | `approveAndPromoteOrderRequest` creates canonical `/orders` doc, links request, and records audit trail | **PASS** |
| 12 | Concurrent / double-click approvals create strictly one `/orders` document (zero duplicates) | **PASS** |
| 13 | Re-promotion on legacy `approved` status or existing `/orders` doc returns existing order safely | **PASS** |
| 14 | `rejectOrderRequest` requires non-empty reason, updates status `rejected`, and writes `reject_request` audit | **PASS** |
| 15 | Prevents invalid state transitions between terminal states (`promoted <-> rejected`) | **PASS** |
| 16 | Final atomic promotion re-validates live catalog prices & stock changes after initial verify | **PASS** |
| 17 | Customer tracker maps verified breakdown, `order_created` link, rejection reason, and audit snapshot | **PASS** |
| 18 | Spark security rules, blueprint, and Admin/Customer UI preserve Spark isolation and tamper resistance | **PASS** |
| 19 | `COPY.ar` and `COPY.en` contain all Stage 04L Admin & Tracker i18n keys | **PASS** |
| 20 | Full End-to-End Flow: Customer Request (04K) -> Review -> Verify -> Approve & Promote -> Order Read (04L) | **PASS** |

---

## 18. Build, Lint & Regression Verification Results

All checks listed below were executed in `/app/applet` after final code changes:

| Check | Command | Actual Observed Outcome | Notes |
| --- | --- | --- | --- |
| Stage 04D/04E Regression Tests | `npx tsx scripts/stage04d.test.ts` | **PASS (12/12 passed, 0 failed)** | Existing menu alignment, cart, UID auth, canonical payloads, WhatsApp & i18n checks intact. |
| Stage 04K Regression Tests | `npx tsx scripts/stage04k.test.ts` | **PASS (17/17 passed, 0 failed)** | Zero-price request creation, auth fail-closed, idempotency, cart preservation, and i18n intact. |
| Stage 04L Admin Approval Suite | `npx tsx scripts/stage04l.test.ts` | **PASS (20/20 passed, 0 failed)** | All 20 auth, pricing, stock, customization, promotion, concurrency, rejection, tracker & rules scenarios pass. |
| Firestore Rules Static Audit | `node scripts/audit-rules.mjs` | **PASS** | Confirms untouched production `firestore.rules` rollback safety and valid `firebase-blueprint.json`. |
| TypeScript Typecheck | `npm run lint` (`tsc --noEmit`) | **PASS (0 errors)** | Clean TypeScript verification across all source and script files. |
| Production Bundle Build | `npm run build` (`vite build`) | **PASS** | Clean Vite production build. |
| Firebase Emulator Live Rules Suite | `which java` -> `JAVA_NOT_INSTALLED` | **NOT RUN (Environment Limitation)** | Java runtime is unavailable in this container; CEL rules in `firestore.spark.rules` were statically verified but NOT executed against the local Firestore Emulator. |
| Live Firebase / GitHub Production | N/A | **NOT EXECUTED (Forbidden in Stage 04L)** | Strictly local implementation stage; zero deployments or live Firestore writes executed. |

---

## 19. Honest Security Boundaries, Spark Limitations & Unresolved Items

To maintain strict transparency prior to production cutover:
1. **Spark-Plan Cross-Document Arithmetic Limitation:** Without Cloud Functions on the Spark plan, Firestore Security Rules (`firestore.spark.rules`) enforce admin-only `/orders` creation (`isAdmin()`), bound `approvedBy == request.auth.uid`, lock terminal `/orderRequests` statuses, and protect `/orderRequestAuditLogs` as append-only (`update, delete: if false;`), **but CEL rules cannot re-verify total arithmetic across variable-length `items` arrays against `/menu` + `/productCustomizations`**. Integrity of promoted totals relies on **authenticated Admin client transaction execution (`approveAndPromoteOrderRequest`)** inside a trusted verified Admin session.
2. **Firestore Stock Deduction Not Automatic on Approval:** In `authoritativePricing.ts`, numeric `stockQuantity`/`stockCount` and boolean stock flags are validated inside the transaction before promotion, **but Stage 04L does not automatically decrement `/menu/{itemId}.stockQuantity`** to avoid mutating `/menu` catalog docs unexpectedly under differing Admin inventory conventions.
3. **Firebase Emulator Suite Not Executed:** Because `java` is missing in the container (`JAVA_NOT_INSTALLED`), live emulator execution of `firestore.spark.rules` CEL expressions could not run locally.
4. **Separate Admin Repo (`palm-metric-admin-`) Not in Workspace:** The external repository `https://github.com/tashflow/palm-metric-admin-` is not present locally. The standalone modules (`src/lib/adminAuth.ts`, `src/lib/authoritativePricing.ts`, `src/lib/adminOrderRequests.ts`) and UI component (`src/components/AdminOrderRequestsPage.tsx`) should be synced into `palm-metric-admin-` during unified release preparation if the separate Admin site will also operate Stage 04L independently.

---

## 20. Final Verdict & Updated Runnable Deliverable

- **Status Verdict:** `STAGE 04L — IMPLEMENTATION COMPLETE WITH ENVIRONMENT LIMITATIONS`
  - **Code, Security Proposals, Tests, Typecheck & Build:** Complete and verified (`12/12` Stage 04D + `17/17` Stage 04K + `20/20` Stage 04L + `audit-rules.mjs` + `tsc --noEmit` + `vite build`).
  - **Remaining Pre-Cutover Tasks:**
    1. Run `firebase emulators:exec` unit tests against `firestore.spark.rules` in a Java-equipped CI environment.
    2. Port `src/lib/adminAuth.ts`, `src/lib/authoritativePricing.ts`, `src/lib/adminOrderRequests.ts` (and dashboard UI) to the external `palm-metric-admin-` repository if hosted separately.
    3. Deploy `firestore.spark.rules` + updated Customer App + Admin App together in a dedicated release stage while retaining `firestore.rules` & `functions/` as rollback fallback.
- **Runnable Project Archive:** `palm-metric-stage04l-runnable.zip` (located at the workspace root, containing the complete local codebase, Spark rules, blueprint, test suites, Stage 04K report, and this Stage 04L report; excludes `node_modules`, `dist`, `.git`, and existing `.zip` archives).
