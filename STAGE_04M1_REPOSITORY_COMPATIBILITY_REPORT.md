# PALM METRIC — STAGE 04M.1: REPOSITORY COMPATIBILITY REPORT

**Date:** 2026-11-23  
**Safety Compliance:** 100% local read-only repository audit. Zero Firebase deployments, zero production Firestore mutations, zero GitHub pushes, zero Blaze upgrades.

---

## 1. Repository State Verification

Both external GitHub repositories were cloned read-only into `/tmp/pm_audit/` and diffed directly against `/app/applet`.

| Codebase / Repo | URL / Path | Branch | Commit | Current Stage | Files / Size (excl. build/git) | Checkout Mechanism | Admin Approval / `/orderRequests` |
|---|---|---|---|---|---|---|---|
| **Actual Customer App (GitHub)** | `https://github.com/tashflow/Palm-Metric` | `main` | `c8ed343` (`feat: enhance branding and modernize app architecture`) | **Stage 04I** | 83 files / 27.854 MiB | `httpsCallable(..., 'createPalmMetricOrder')` in `src/lib/firestoreSync.ts:705-707` | **NONE** — Lacks Stage 04J–04M completely (`firestore.spark.rules`, `/orderRequests`, `adminAuth.ts`, `authoritativePricing.ts`, `adminOrderRequests.ts`, `AdminOrderRequestsPage.tsx`, `scripts/stage04{k,l,l1,m}.test.ts`) |
| **Actual Admin App (GitHub)** | `https://github.com/tashflow/palm-metric-admin-` | `main` | `f432f1a` (`feat: add product customization data structures`) | **Stage 04G** | 46 files / 2.329 MiB | N/A (Preview tab `CustomerStorefrontPreview.tsx` calls `addDoc(collection(db, 'orders'), ...)` directly) | **NONE** — Listens only to `/orders`, `/menu`, `/billboards`, `/categories`, `/settings/coffeeOptions`, `/productCustomizations` |
| **Local Spark Workspace (`/app/applet`)** | `/app/applet` (local unpublished Stage 04J–04M.1) | N/A | Local working tree | **Stage 04M.1** | 106 files (with 04M.1 reports) / ~28.3 MiB | `submitCustomerOrderRequest` writes unpriced payload to `/orderRequests/{requestId}` | **PRESENT LOCALLY** (`AdminOrderRequestsPage.tsx`, `adminOrderRequests.ts`, `authoritativePricing.ts`, `adminAuth.ts`, `firestore.spark.rules`) |

### Clarification on `CustomerStorefrontPreview.tsx`
- Inside `tashflow/palm-metric-admin-` (`f432f1a`), `src/components/CustomerStorefrontPreview.tsx` is a local preview component rendered under the `'customer'` tab of `AdminApp` (`src/App.tsx:671`).
- At line 400, it calls `addDoc(collection(db, 'orders'), ...)` directly using legacy Stage 04G structure — incompatible with both Stage 04E (`allow create: if false` on `/orders`) and Stage 04K/04L (`/orderRequests`).
- It is **not** a substitute for real Customer App integration (`tashflow/Palm-Metric`).

---

## 2. Specific Technical Incompatibilities Between Actual Repos & Spark Design

1. **Checkout vs. Request Collection Break:**
   - GitHub Customer (`c8ed343`) invokes `createPalmMetricOrder` Cloud Function. Under Spark (no Blaze Cloud Functions), checkout fails.
   - GitHub Admin (`f432f1a`) never queries or subscribes to `/orderRequests`, `/orderNumbers`, or `/orderRequestAuditLogs`. Requests submitted by `/app/applet` Spark checkout are invisible in the deployed Admin Dashboard (`https://tashflow.github.io/palm-metric-admin-/`).

2. **`/orders` Schema & Security Rules Conflict:**
   - GitHub Admin `firestore.rules` (`isValidOrder`, lines 107–121) strictly checks `hasOnly(['orderNumber', 'customerUid', 'customerName', 'customerContact', 'items', 'totalBill', 'status', 'notes', 'createdAt', 'updatedAt'])` and `data.status in ['Pending', 'Preparing', 'Ready', 'Completed']`.
   - Stage 04L promoted `/orders` documents include additional fields (`subtotal`, `discountTotal`, `taxTotal`, `currency`, `orderType`, `sourceApp`, `lang`, `idempotencyKey`, `pricingVersion`, `sourceRequestId`, `paymentMethod`, `paymentStatus`, `approvedBy`, `approvedAt`) and allow `'Cancelled'`.
   - Attempting to update a Spark-promoted `/orders` document under GitHub Admin `firestore.rules` fails `isValidOrder` validation.

3. **`OrderStatus` Enum Mismatch (`LiveOrdersView.tsx`):**
   - GitHub Admin `src/types/index.ts:51` defines `OrderStatus = 'Pending' | 'Preparing' | 'Ready' | 'Completed'`. It omits `'Cancelled'`.
   - `LiveOrdersView.tsx` computes status progression buttons from `ORDER_STATUSES.indexOf(order.status)`. A `'Cancelled'` order resolves to `-1`, computing next index `0` (`'Pending'`).

4. **Admin Allowlist & Bootstrap UID Divergence:**
   - GitHub Admin (`src/lib/firebase.ts` & `firestore.rules`): emails `['tashflow26@gmail.com', 'palmmetric1@gmail.com']`, UID `'jPgFPc8KbsXaPrdkyrbCQSFDMOP2'`.
   - Local `/app/applet` (`src/lib/adminAuth.ts`, `firestore.rules`, `firestore.spark.rules`): emails `['palmmetric1@gmail.com', 'palmmatric1@gmail.com', 'tashfilartwork@gmail.com', 'tashflow26@gmail.com']`, UID `'39H76y4E55g5yX2uY0lE5bQ3a393'`.

5. **`/admins/{uid}` Rule vs. `AdminAccessModal.tsx` Conflict:**
   - GitHub Admin `src/components/AdminAccessModal.tsx:104,131` calls `setDoc` and `deleteDoc` on `/admins/{uid}`.
   - `/app/applet/firestore.spark.rules:751` locks `/admins/{adminId}` with `allow create, update, delete: if false;` to eliminate client-side admin privilege escalation (whereas GitHub Admin `firestore.rules` allows `isBootstrappedAdmin()` to write `/admins/{adminId}`).

6. **Category & Menu Catalog Alignment:**
   - `firestore.spark.rules` `isValidCategory` was updated in Stage 04M to accept GitHub Admin `CategoryManagerModal` fields (`key`, `allowMilkOption`, `allowTemperature`, max 15 keys), and `isValidMenuItem` accepts Admin menu fields (`allowMilkOption`, `coconutMilkPrice`, `allowTemperature`, `storagePath`, `stockQuantity`, `stockCount`).
   - Catalog defaults diverge slightly: `/app/applet/src/data/menu.ts` contains Coffee of the Day (`cotd-small`, `cotd-large`, 20 items total) while GitHub Admin `src/lib/defaultMenu.ts` seeds 18 core items without COTD.

---

## 3. Eight-Step End-to-End Compatibility Verification Matrix

| E2E Step | Workflow Expectation | Status in Actual GitHub Repos (`Palm-Metric` `c8ed343` + `palm-metric-admin-` `f432f1a`) | Status in Local `/app/applet` (Unit/Mock Harness Only; No Emulator) |
|---|---|---|---|
| **1. Customer submits order using actual Customer App** | Guest auth (`anonymous`) submits pickup order request | **FAIL / NOT INTEGRATED** — `c8ed343` calls Cloud Function `createPalmMetricOrder` | **PASS (Mock/Unit)** — `CheckoutPage.tsx` calls `submitCustomerOrderRequest` |
| **2. Request created in `/orderRequests`** | Unpriced doc written with `pending_review`, no totals | **FAIL / NOT IMPLEMENTED** — `c8ed343` has no `/orderRequests` writer | **PASS (Mock/Unit)** — Verified by `stage04k.test.ts` (17/17) |
| **3. Actual Admin App receives request** | Real-time subscription on `/orderRequests` | **FAIL / NOT IMPLEMENTED** — `f432f1a` subscribes only to `/orders` | **PASS (Mock/UI)** — `AdminOrderRequestsPage.tsx` & `subscribeAdminOrderRequests` in `/app/applet` |
| **4. Admin reviews & recalculates pricing** | Reads `/menu`, `/productCustomizations`, `/settings/coffeeOptions` | **FAIL / NOT IMPLEMENTED** — Absent from `f432f1a` | **PASS (Mock/Unit)** — `authoritativePricing.ts` verified in `stage04l/l1/m` |
| **5. Admin approves or rejects** | Atomic state machine + mandatory rejection reason + audit log | **FAIL / NOT IMPLEMENTED** — Absent from `f432f1a` | **PASS (Mock/Unit)** — `approveAndPromoteOrderRequest` / `rejectOrderRequest` |
| **6. Inventory handled correctly** | Atomic stock deduction for tracked SKUs, zero double-deduct | **FAIL / NOT IMPLEMENTED** — `f432f1a` does not deduct or validate stock on `/orders` | **PASS (Mock/Unit)** — Concurrency, rollback & SKU aggregation tested in `stage04l1.test.ts` |
| **7. Official order created** | `/orders/{orderId}` + `/orderNumbers/{PM-XXXXXX}` atomically claimed | **INCOMPATIBLE** — `f432f1a` `firestore.rules` rejects Spark order schema | **PASS (Mock/Unit)** — Rules `existsAfter`/`getAfter` unexecuted in Emulator (`NO_JAVA`) |
| **8. Customer App displays actual result** | Live tracker reflects verified pricing, `PM-` order #, or rejection reason | **FAIL / NOT IMPLEMENTED** — `c8ed343` tracks `/orders` only | **PASS (Mock/UI)** — `OrderTrackerPage.tsx` & `mapOrderRequestSnapshot` verified in unit tests |

---

## 4. Required Actions to Unblock Real Integration (Outside Stage 04M.1 Read-Only Scope)

1. Sync Stage 04K/04M Spark Customer checkout, tracker, WhatsApp request builder, and `firestoreSync.ts` into `tashflow/Palm-Metric`.
2. Port `src/lib/adminAuth.ts`, `src/lib/authoritativePricing.ts`, `src/lib/adminOrderRequests.ts`, `src/components/AdminOrderRequestsPage.tsx`, and Stage 04L/04M i18n keys into `tashflow/palm-metric-admin-`.
3. Update `tashflow/palm-metric-admin-` `OrderStatus` to support `'Cancelled'` cleanly in `LiveOrdersView.tsx`.
4. Unify `ADMIN_EMAILS`, `ADMIN_UIDS` (`jPgFPc8KbsXaPrdkyrbCQSFDMOP2` + `39H76y4E55g5yX2uY0lE5bQ3a393`), and decide `/admins/{uid}` write policy (`firestore.spark.rules` strict lock vs bootstrapped-admin `AdminAccessModal`).
5. Execute live Firebase Firestore Emulator tests against `firestore.spark.rules` in a Java-equipped environment before any staging or production deployment.
