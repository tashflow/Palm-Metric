# PALM METRIC — STAGE 04L.1: SECURITY, INVENTORY & TRANSACTION INTEGRITY HARDENING REPORT

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

Stage 04L.1 audited and hardened the Stage 04L Admin Order Approval & Promotion System across Admin authorization, managed inventory concurrency, atomic promotion invariants, official `PM-XXXXXX` order-number uniqueness, and Spark-compatible Firestore Security Rules (`firestore.spark.rules`).

### Critical Gaps Identified & Remediated in Stage 04L.1
1. **Managed Inventory Concurrency & Rules Schema (`authoritativePricing.ts`, `adminOrderRequests.ts`, `firestore.spark.rules`, `firebase-blueprint.json`):**
   - Stage 04L validated numeric `stockQuantity`/`stockCount` per line item **but did not deduct managed stock during promotion**, **did not aggregate demand when multiple cart lines referenced the same SKU**, and **`isValidMenuItem` in `firestore.spark.rules` did not allow `stockQuantity`/`stockCount`**.
   - Remediated by reading all catalog items before any write inside `approveAndPromoteOrderRequest` `runTransaction`, aggregating total demand per `itemId`, atomically deducting managed inventory ONLY on products that track numeric `stockQuantity`/`stockCount` (leaving untracked boolean-only items untouched), flipping `inStock: false` / `outOfStock: true` upon reaching `0`, and permitting bounded `stockQuantity`/`stockCount` in `isValidMenuItem` and `firebase-blueprint.json`.
2. **Existing Order Relationship Invariants Before Idempotent Replay (`adminOrderRequests.ts`):**
   - Stage 04L previously returned `idempotentReplay: true` when `existingOrder !== null` before checking `rejected`/`cancelled` or validating `existingOrder.sourceRequestId == requestId` and `existingOrder.customerUid == mapped.customerUid`.
   - Remediated by executing terminal `rejected`/`cancelled` guards first, validating `targetOrder.sourceRequestId` and `targetOrder.customerUid` (while preserving legacy Stage 04K `approved` compatibility where `sourceRequestId` may be absent if matching `customerUid`), and failing closed on missing or mismatched target orders (`INCONSISTENT_EXISTING_ORDER` / `INCONSISTENT_PROMOTION_STATE`).
3. **FNV-1a `PM-XXXXXX` Order Number Collision Mitigation (`adminOrderRequests.ts`, `firestore.spark.rules`, `firebase-blueprint.json`):**
   - `PM-XXXXXX` has a 900,000-slot space (`~948` birthday bound). Without a collision check, two distinct `requestId`s hashing to the same 6 digits would generate duplicate `orderNumber` strings on `/orders`.
   - Remediated by introducing `/orderNumbers/{orderNumber}` immutable reservation documents read & claimed inside the promotion transaction (`deriveOfficialOrderNumberCandidate`), keeping `attempt=0` identical to `deriveOfficialOrderNumber(requestId)` for clean compatibility, probing deterministic alternate `PM-XXXXXX` slots (and 10-hex `PM-XXXXXXXXXX` fallback beyond 12 probes), and reading legacy `/orders` transparently without requiring `/orderNumbers` backfill.
4. **Atomic Cross-Document Security Rules & Identity Hardening (`firestore.spark.rules`, `adminAuth.ts`):**
   - Added `existsAfter`/`getAfter` cross-document invariants between `/orderRequests/{requestId}`, `/orders/{orderId}`, and `/orderNumbers/{orderNumber}`, locked customer `lang`/`orderNote`/`requestSource` against admin tampering, bound `approvedBy`/`rejectedBy` strictly to `request.auth.uid`, made email allowlist checks case-insensitive (`email.lower()`), and rejected path separators/whitespace in `adminAuth.ts` UIDs.

All changes remain strictly local: zero deployments, zero production Firestore reads/writes, zero GitHub pushes, and zero Cloud Functions additions were performed.

---

## 2. Admin Authorization Audit (`adminAuth.ts` & `firestore.spark.rules`)

| Check | Status | Evidence & Findings |
| --- | --- | --- |
| Customers cannot create `/admins/{uid}` | **VERIFIED** | `firestore.spark.rules` `/admins/{adminId}` enforces `allow create, update, delete: if false;`. No client can self-register or modify admin docs. |
| Customers cannot grant themselves admin privileges | **VERIFIED** | Admin authority in rules derives strictly from immutable server-verified token claims (`isVerifiedAdminToken()`) or server-provisioned `/admins/$(request.auth.uid)` (`isAdmin()`). `adminAuth.ts` only gates client UI/helper UX; Firestore Rules enforce every read/write independently. |
| Anonymous accounts blocked from admin operations | **VERIFIED** | Both `isVerifiedAdminToken()` and `isAdmin()` require `request.auth.token.firebase.sign_in_provider != 'anonymous'`. `isVerifiedAdminActor()` rejects `isAnonymous === true` or `providerId === 'anonymous'` even if email/UID is spoofed. |
| Verified email & malformed UID hardening | **HARDENED** | `firestore.spark.rules` now guards `'email' in request.auth.token && request.auth.token.email is string && request.auth.token.email.lower() in [...]` with `email_verified == true`. `adminAuth.ts` now rejects UIDs containing `/`, `\`, leading/trailing spaces, or whitespace. |
| Allowlist parity across files | **VERIFIED IDENTICAL** | `ADMIN_EMAILS` (`palmmetric1@gmail.com`, `palmmatric1@gmail.com`, `tashfilartwork@gmail.com`, `tashflow26@gmail.com`) and `ADMIN_UIDS` (`39H76y4E55g5yX2uY0lE5bQ3a393`) match identically across `src/lib/adminAuth.ts`, `firestore.rules`, and `firestore.spark.rules`. |

**Honest Spark / Rules Boundary:**
- In `firestore.spark.rules`, `allow list` rules on `/orderRequests`, `/orders`, `/orderNumbers`, and `/orderRequestAuditLogs` evaluate `isVerifiedAdminToken()` rather than `isAdmin()` because Firestore prohibits `exists(/admins/$(uid))` inside unrestricted collection queries. Thus an admin added solely via `/admins/{uid}` (without being in `ADMIN_EMAILS` or `ADMIN_UIDS`) can `get`/mutate single documents via `isAdmin()` but cannot run admin-wide `list` queries unless listed in `isVerifiedAdminToken()` or using a custom claim on a paid/Admin-SDK setup.

---

## 3. Inventory Concurrency Audit & Atomic Deduction (`authoritativePricing.ts`, `adminOrderRequests.ts`)

1. **Managed vs. Unmanaged Inventory Distinction (No Invented Stock Behavior):**
   - `extractManagedNumericStock(menuDoc)` inspects `typeof menuDoc.stockQuantity === 'number'` and `typeof menuDoc.stockCount === 'number'`.
   - Products WITHOUT numeric `stockQuantity` or `stockCount` (boolean-only availability via `inStock`/`isAvailable`/`available`/`outOfStock`) return `hasManagedStock: false` and receive **zero synthetic stock fields** during promotion.
2. **All Reads Before All Writes in Firestore `runTransaction`:**
   - Phase 1 reads `/orderRequests/{requestId}`, deterministic & mapped `/orders/{id}`, `/settings/coffeeOptions`, every unique `/menu/{itemId}`, every unique `/productCustomizations/{itemId}`, and `/orderNumbers/{candidate}` probes BEFORE any `tx.update` / `tx.set` executes.
3. **Cumulative Multi-Line SKU Aggregation & Oversell Prevention:**
   - `aggregateRequestedQuantitiesByItem` + `computeStockDeductionPlans` sum quantities per `itemId` across all lines in the request (blocking split-line overselling such as `2x Hot + 2x Cold > stock 3`) inside `calculateAuthoritativeOrderRequestPricing`, `inspectOrderRequestVerification`, and `approveAndPromoteOrderRequest`.
   - Firestore optimistic concurrency serializes conflicting transactions reading the same `/menu/{itemId}` doc so two concurrent approvals competing for scarce stock cannot oversell.
4. **Depletion & Partial-Failure Atomicity:**
   - If ANY item lacks stock, has an invalid/disabled customization, or hits a transaction abort, ZERO writes execute — valid items never experience partial stock deductions.
   - Reaching `remainingStock === 0` atomically sets `inStock: false` (and `outOfStock: true` / `isAvailable: false` / `available: false` if present on that `/menu` doc).
   - Duplicate/concurrent idempotent replays return early before Phase 3 writes, ensuring stock is **never deducted twice**.
5. **Menu Rules Synchronization:**
   - `isValidMenuItem(data)` and `firebase-blueprint.json` (`MenuItem`) were updated to explicitly accept bounded non-negative `stockQuantity` and `stockCount` (`0..1000000`) and ensure `buildUpdatedMenuStockPayload` strips any client helper `id` property before `tx.update`.

---

## 4. Atomic Order Promotion & Invariant Enforcement (`adminOrderRequests.ts`, `firestore.spark.rules`)

Verified and hardened end-to-end promotion invariants:
- **Single Atomic Commit Unit:** Order creation (`/orders/{orderId}`), order number uniqueness reservation (`/orderNumbers/{orderNumber}`), request state transition (`/orderRequests/{requestId}` -> `status: 'order_created'`), managed inventory deductions (`/menu/{itemId}`), and audit log entries (`/orderRequestAuditLogs/{auditId}`) all execute in one `runTransaction` write phase.
- **Strict Invariant Validation Before Idempotent Replay:**
  - Rejected (`rejected`) and cancelled (`cancelled`) requests are checked FIRST and blocked unconditionally (with `INCONSISTENT_PROMOTION_STATE` if an unexpected `/orders` doc exists alongside a rejected/cancelled request).
  - Requests already in `order_created` verify that the target `/orders/{approvedOrderId}` doc exists AND matches `sourceRequestId === requestId`, `customerUid === mapped.customerUid`, and `orderNumber === mapped.approvedOrderNumber`. Legacy `approved` requests validate `customerUid` consistency and forbid conflicting `sourceRequestId`.
  - Pre-promotion requests encountering an existing `/orders/{deterministicOrderId}` verify BOTH `existingOrder.sourceRequestId === requestId` AND `existingOrder.customerUid === mapped.customerUid`; mismatches throw `INCONSISTENT_EXISTING_ORDER` rather than replaying.
- **Bidirectional Atomic Rules (`existsAfter` / `getAfter` in `firestore.spark.rules`):**
  - Transitioning `/orderRequests/{requestId}` to `order_created` requires `existsAfter` + `getAfter` confirmation that `/orders/$(data.approvedOrderId)` exists post-commit with matching `sourceRequestId`, `customerUid`, `orderNumber`, `totalBill == verifiedTotalSar`, `approvedBy == request.auth.uid`, and `approvedAt == request.time`.
  - Creating `/orders/{orderId}` with `sourceRequestId` requires `existsAfter` + `getAfter` confirmation of BOTH `/orderRequests/$(data.sourceRequestId)` AND `/orderNumbers/$(data.orderNumber)`.

---

## 5. Official Order Number Integrity (`deriveOfficialOrderNumber`, `/orderNumbers`)

- **FNV-1a Collision Analysis:** `deriveOfficialOrderNumber(requestId)` maps `requestId` into `PM-100000..PM-999999` (`900,000` slots; ~1% collision risk around ~135 orders, ~50% around ~1,120 orders).
- **Collision-Free Deterministic Probing (`deriveOfficialOrderNumberCandidate` + `/orderNumbers/{orderNumber}`):**
  - `attempt = 0`: Uses `deriveOfficialOrderNumber(requestId)` (`PM-XXXXXX`), keeping 100% deterministic backward compatibility when uncontested.
  - `attempt = 1..12`: Probes alternative deterministic 6-digit `PM-XXXXXX` numbers salted by attempt index against `/orderNumbers/{candidate}` inside `runTransaction` before writes.
  - `attempt = 13..24`: Expands deterministically to 10-hex `PM-XXXXXXXXXX` (`<= 24` chars, matching `isValidAdminOrderCreate` `^[a-zA-Z0-9_\-]+$` regex).
  - `/orderNumbers/{orderNumber}` is protected in `firestore.spark.rules` with `allow create: if isValidId(orderNumber) && isAdmin() && isValidOrderNumberClaim(...)` and `allow update, delete: if false;`, guaranteeing atomic uniqueness across concurrent promotions while leaving all existing legacy `/orders` docs completely readable.

---

## 6. Security Rules Audit (`firestore.spark.rules` Match Blocks & Spark Limitations)

| Collection Block | Customer / Guest Access | Admin Access | Critical Guards Verified |
| --- | --- | --- | --- |
| Global Catch-All (`/{document=**}`) | Denied | Denied | Explicit default-deny safety net (`allow read, write: if false;`). |
| `/orderRequests/{requestId}` | Create own `pending_review` pickup doc with zero financial/admin fields; read/list own `customerUid` only; NO update/delete | Read/list; update non-terminal docs with invariant customer fields (`requestId`, `customerUid`, `items`, `lang`, `orderNote`, `requestSource`, `createdAt`) | `isValidOrderRequestCreate` + `isValidOrderRequestAdminUpdate(incoming(), requestId)` with terminal lock + `existsAfter`/`getAfter` promotion proof + mandatory `rejectionReason` (`>= 3` chars). |
| `/orders/{orderId}` | Read/list own `customerUid` only; **NO create, update, or delete** | Create `Pending` pickup order with `approvedBy == request.auth.uid`, `approvedAt == request.time`, and `existsAfter`/`getAfter` request + orderNumber proof; update strictly `['status', 'updatedAt']` | `isValidAdminOrderCreate(incoming(), orderId)` + `isValidOrderUpdate(incoming())` locking all financial totals, items, `sourceRequestId`, and `approvedBy`. |
| `/orderNumbers/{orderNumber}` | Denied | Read; create-only with `existsAfter`/`getAfter` `/orders` match | `allow update, delete: if false;` prevents claiming/overwriting an issued order number. |
| `/orderRequestAuditLogs/{auditId}` | Denied | Read; create-only with `adminUid == request.auth.uid` and `createdAt == request.time` | `allow update, delete: if false;` enforces append-only immutability. |
| `/menu/{itemId}` | Get single / list `inStock == true` | Full CRUD validated by `isValidMenuItem` | Added non-negative bounded `stockQuantity`/`stockCount` (`0..1000000`). |
| `/admins/{adminId}` | Self `get` only; **NO create, update, delete** | `get`/`list`; **NO create, update, delete** | Blocks client privilege escalation completely. |
| `/idempotencyKeys/{keyId}` | Denied | Denied | Preserved `allow read, write: if false;` for Stage 04E rollback compatibility. |

### Honest Guarantees That CANNOT Be Enforced Purely by Spark Firestore Security Rules
1. **No Cross-Document Line-Item Arithmetic Verification in Rules:** Firestore Security Rules (CEL) cannot iterate dynamically over `data.items` (`1..50` items) or cross-reference `/menu/{itemId}.price` and `/productCustomizations/{itemId}` options for arbitrary cart sizes to mathematically prove `totalBill` on `/orders` create. Integrity of promoted prices and stock deductions therefore relies on the authenticated Admin client session running `approveAndPromoteOrderRequest`.
2. **No Rule-Enforced Stock Delta Proof Across Multiple Items:** While `firestore.spark.rules` prevents `stockQuantity < 0`, Spark CEL rules cannot iterate variable-length `order.items` to verify that every SKU's `stockQuantity` decremented by the exact requested sum. That invariant is enforced transactionally in `approveAndPromoteOrderRequest` inside `adminOrderRequests.ts`.
3. **Rule-Enforced Non-Repudiation of Non-Admin `/admins` List Queries:** Admins stored solely in `/admins/{uid}` (not in `ADMIN_EMAILS`/`ADMIN_UIDS`) cannot run unfiltered `list` queries because Firestore forbids `exists()` checks inside collection `list` rules.
4. **Ad-Hoc Manual `/orders` Creation Not Blocked:** `isValidAdminOrderCreate` enforces `orderRequests`/`orderNumbers` links whenever `sourceRequestId` is present; if a compromised Admin account manually wrote an `/orders` doc *omitting* `sourceRequestId`, rules permit that `Pending` write (though transitioning any `/orderRequests` doc to `order_created` strictly requires `getAfter(...).sourceRequestId == reqId`).
5. **Local Firestore Emulator Rules Execution Unavailable in Container:** Java (`which java` -> `JAVA_NOT_INSTALLED`) is missing in this build environment, so CEL expressions in `firestore.spark.rules` were verified by static & harness analysis rather than live Emulator execution.

---

## 7. Files Modified / Created & Verification Results

### Files Changed in Stage 04L.1
| File | Change |
| --- | --- |
| `src/lib/adminAuth.ts` | Hardened `isVerifiedAdminActor` UID checks against path separators and whitespace while keeping allowlist parity. |
| `src/lib/authoritativePricing.ts` | Added `extractManagedNumericStock`, `aggregateRequestedQuantitiesByItem`, `computeStockDeductionPlans`, and aggregated SKU demand checks across `calculateAuthoritativeOrderRequestPricing` and `inspectOrderRequestVerification`. |
| `src/lib/adminOrderRequests.ts` | Added `/orderNumbers` uniqueness claim probing (`deriveOfficialOrderNumberCandidate`), atomic managed stock deduction (`updateMenuDoc`), strict terminal & existing-order `sourceRequestId`/`customerUid` invariant verification before idempotent replay, and `rejectOrderRequest` linked-order checks. |
| `firestore.spark.rules` | Added case-insensitive email match, `stockQuantity`/`stockCount` support in `isValidMenuItem`, immutable `lang`/`orderNote`/`requestSource` on request updates, strict `approvedBy`/`rejectedBy`, bidirectional `existsAfter`/`getAfter` promotion invariants, and immutable `/orderNumbers/{orderNumber}` rules. |
| `firebase-blueprint.json` | Added `stockQuantity`/`stockCount` to `MenuItem`, `OrderNumberClaim` entity, and `/orderNumbers/{orderNumber}` path. |
| `scripts/stage04k.test.ts` | Updated line 755 static rules string check to match parameterized `isValidAdminOrderCreate(incoming(), orderId)`. |
| `scripts/stage04l1.test.ts` | Created 12-scenario Stage 04L.1 security, inventory concurrency, rollback, collision, inconsistent existing order, and rules test suite. |
| `STAGE_04L1_SECURITY_INVENTORY_HARDENING_REPORT.md` | This Stage 04L.1 audit and hardening report. |

### Automated Checks Executed After Final Code Changes

| Check | Command | Actual Observed Result |
| --- | --- | --- |
| Stage 04D/04E Regression Suite | `./node_modules/.bin/tsx scripts/stage04d.test.ts` | **PASS (`12 passed, 0 failed`)** |
| Stage 04K Regression Suite | `./node_modules/.bin/tsx scripts/stage04k.test.ts` | **PASS (`17 passed, 0 failed`)** |
| Stage 04L Regression Suite | `./node_modules/.bin/tsx scripts/stage04l.test.ts` | **PASS (`20 passed, 0 failed`)** |
| Stage 04L.1 Hardening Suite | `./node_modules/.bin/tsx scripts/stage04l1.test.ts` | **PASS (`12 passed, 0 failed`)** |
| Production Rules & Blueprint Audit | `node scripts/audit-rules.mjs` | **PASS** |
| TypeScript Typecheck | `npm run lint` (`tsc --noEmit`) | **PASS (`0 errors`)** |
| Vite Production Bundle Build | `npm run build` (`vite build`) | **PASS** |
| Dependency Lockfile Audit | `bun audit` | **Completed** (`@grpc/grpc-js@1.9.16` transitive Node gRPC alert inside `firebase@13.3.0`; not shipped in Vite browser bundle, package pin preserved) |
| Firebase Emulator Security Tests | `which java` | **NOT RUN (`JAVA_NOT_INSTALLED` in container; must run in Java-equipped CI before Stage 04M/cutover)** |

---

## 8. Final Verdict & Deliverables

- **Verdict:** `STAGE 04L.1 — COMPLETE WITH LIMITATIONS`
  - **Rationale:** All code-level security, privilege escalation, atomic managed inventory deduction, inconsistent-order invariant validation, official `PM-XXXXXX` collision resolution, transactional rollback checks, and Spark rules/blueprint updates are implemented and pass all 61 automated tests (`12 + 17 + 20 + 12`), `audit-rules.mjs`, `tsc --noEmit`, and `vite build`. It is marked `COMPLETE WITH LIMITATIONS` strictly because (1) local Firebase Firestore Emulator CEL tests could not execute due to missing Java in the container, and (2) Spark-plan Firestore Security Rules inherently cannot perform cross-collection variable-length cart price/stock arithmetic proofs without server-side Cloud Functions.
- **Updated Runnable ZIP Deliverable:** `palm-metric-stage04l1-runnable.zip` (at workspace root, excluding `node_modules`, `dist`, `.git`, `.firebase`, and `.zip` archives).
