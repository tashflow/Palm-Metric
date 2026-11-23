# PALM METRIC — STAGE 04K: CUSTOMER ORDER REQUEST SYSTEM (FIREBASE SPARK-COMPATIBLE IMPLEMENTATION REPORT)

**Project Identity:**
- **Customer App:** `https://github.com/tashflow/Palm-Metric`
- **Admin App:** `https://github.com/tashflow/palm-metric-admin-` *(untouched in Stage 04K)*
- **Firebase Project ID:** `palm-metric-app`
- **Firestore Database:** `(default)`
- **Firebase Plan Target:** Spark (Free Plan — zero Cloud Functions runtime dependency for customer checkout)
- **Service Mode:** Pickup only (`pickup`)
- **Currency:** `SAR`
- **Customer Auth:** Guest checkout via Firebase Anonymous Authentication (`ensureGuestFirebaseSession`) or signed-in Firebase Auth user
- **Customer WhatsApp:** `966506439172`

---

## 1. Executive Summary

Stage 04K implements the Customer App side of the approved Firebase Spark Migration Architecture defined in `STAGE_04J_SPARK_MIGRATION_ARCHITECTURE_REPORT.md`.

Previously, the Customer App checkout flow depended on calling the Firebase v2 Callable Cloud Function `createPalmMetricOrder` via `httpsCallable` (`src/lib/firestoreSync.ts`). Because Cloud Functions deployment is blocked on the Spark plan, Stage 04K migrates customer submission to a two-phase architecture:

`Customer App → /orderRequests/{requestId} → (Stage 04L Admin Review & Verification) → Final /orders/{orderId}`

All implementation was executed **strictly locally**:
- Zero deployments were performed (Customer App, Firestore Rules, and Cloud Functions were not deployed).
- Zero production Firestore documents were modified or deleted.
- Existing `functions/` rollback code and `firestore.rules` (referenced by Stage 04E/04D checks) were preserved untouched.
- A separate local Spark Firestore Security Rules proposal artifact was created at `firestore.spark.rules`.

---

## 2. Modified and Created Files Inventory

| File | Action | Purpose |
| --- | --- | --- |
| `src/types.ts` | Modified | Added `OrderRequestStatus`, `OrderRequestCustomizationSelection`, `OrderRequestItem`, `OrderRequest`, and extended `TrackedOrderMeta` (`kind`, `requestSnapshot`). |
| `src/data/i18n.ts` | Modified | Added 35 bilingual Arabic (RTL) and English (LTR) copy keys for Request Checkout, estimated-price disclaimers, duplicate notices, request confirmation, 4-step request tracker, and validation/failure messages. |
| `src/lib/whatsapp.ts` | Modified | Added `OrderRequestWhatsAppLine` and `buildBilingualOrderRequestWhatsAppSummary` formatted explicitly as an unconfirmed Order Request awaiting Admin verification, while preserving `buildBilingualWhatsAppSummary` & `buildOrderLineItems`. |
| `src/lib/firestoreSync.ts` | Modified | Removed `firebase/functions` (`httpsCallable` / `createVerifiedPalmMetricOrder` / `createOrder`) runtime dependency. Added `OrderRequestError`, `computeStableOrderRequestId`, `formatOrderRequestNumber`, `buildCustomerOrderRequestPayload`, `normalizeOrderRequestStatus`, `mapOrderRequestSnapshot`, `submitCustomerOrderRequest`, `subscribeOrderRequest`, and `subscribeCustomerOrderRequests`. |
| `src/components/CheckoutPage.tsx` | Modified | Migrated checkout from callable function to `submitCustomerOrderRequest`, added `buildOrderRequestItemsFromCart`, synchronous `submittingLockRef`, estimated-price UI & disclaimers, cart preservation on error, and dedicated Request Confirmation card (`confirmedSubmission`). |
| `src/components/OrderTrackerPage.tsx` | Modified | Added dual subscription (`subscribeCustomerOrders` + `subscribeCustomerOrderRequests`), request vs. confirmed order tab badges, 4-step Request Lifecycle view (`Submitted` → `Admin Review` → `Verified` → `Order Created`), and handoff button to `approvedOrderId` once promoted to `/orders`. |
| `src/App.tsx` | Modified | Wired `onRequestSubmitted` and `onGoToTracker` callbacks on `CheckoutPage`, guarded `subscribeOrder` against `req_` / request IDs, and tagged request tabs in `OrderTrackerPage` `onSelectOrderId`. |
| `firebase-blueprint.json` | Modified | Added `OrderRequest` entity schema and `/orderRequests/{requestId}` collection path documentation. |
| `firestore.spark.rules` | Created | Separate local Firestore Security Rules proposal enforcing Spark-mode `/orderRequests/{requestId}` customer creation rules and blocking customer `/orders` creation. |
| `scripts/stage04k.test.ts` | Created | Automated 17-case verification suite testing auth fail-closed, schema/zero-price hygiene, validation, idempotency, cart preservation, WhatsApp wording, i18n, `/orders` compatibility, and static architecture constraints. |
| `STAGE_04K_CUSTOMER_ORDER_REQUEST_IMPLEMENTATION_REPORT.md` | Created | This implementation & verification report. |

**Explicitly Untouched:** `functions/**`, `firestore.rules` (rollback artifact preserved), `src/components/AccountPage.tsx` (`My Past Orders` remains `/orders`-backed), Admin App repository (`palm-metric-admin-`).

---

## 3. Removal of Runtime Cloud Function Dependency (`createPalmMetricOrder`)

Static inspection and automated test assertion 16 confirm:
- `src/lib/firestoreSync.ts` no longer imports `firebase/functions` or invokes `httpsCallable`.
- `createVerifiedPalmMetricOrder` and `createOrder` have been removed from runtime paths.
- `CheckoutPage.tsx` calls `submitCustomerOrderRequest` exclusively.
- Pure formatter functions (`buildCanonicalOrderPayload`, `buildCallableCreateOrderPayload`, `computeDeterministicIdempotencyKey`) remain exported in `src/lib/firestoreSync.ts` as non-network helpers to preserve backward test compatibility (`scripts/stage04d.test.ts`), and existing `functions/` source remains intact for emergency rollback.

---

## 4. `/orderRequests/{requestId}` Schema & Zero-Trust Price Hygiene

Customer writes target `/orderRequests/{requestId}` via `setDoc(doc(db, 'orderRequests', requestId), firestoreDoc)` inside `submitCustomerOrderRequest`.

**Strict Field Whitelist written on Create (`CustomerOrderRequestWritePayload` + timestamps):**
- `requestId`: deterministic ID (`req_<nonce>_<fnv1aHex>`)
- `customerUid`: authenticated Firebase UID (`session.user.uid`)
- `customerName`: trimmed non-empty string (`1..80` chars)
- `customerContact`: trimmed string (`4..80` chars)
- `orderType`: `'pickup'`
- `currency`: `'SAR'`
- `lang`: optional `'ar' | 'en'`
- `orderNote`: optional string (`<= 220` chars)
- `items`: `OrderRequestItem[]` (`1..50` items), where each item contains only:
  - `itemId` (canonicalized product ID matching `^[a-zA-Z0-9_-]{1,128}$`)
  - `quantity` (strict integer `1..99`)
  - optional `name`, `nameAr`, `selectedSizeId`, `temperature` (`'Hot' | 'Cold'`), `milkOption` (`'none' | 'regular' | 'coconut'`), `specialInstructions` (`<= 160` chars), `selectedCustomizations` (`[{ groupId, optionId }]`, max 30 entries)
- `status`: locked strictly to `'pending_review'`
- `requestSource`: locked to `'customer-app-spark'`
- `createdAt`, `updatedAt`: Firestore `serverTimestamp()`

**Strictly Excluded Fields (never serialized to `/orderRequests`):**
- All financial fields: `price`, `basePrice`, `customizationTotal`, `additionalPrice`, `milkExtraPrice`, `subtotal`, `total`, `totalBill`, `discount`, `tax`, `pricingVersion`.
- All privileged Admin fields: `approvedOrderId`, `approvedOrderNumber`, `rejectionReason`, `reviewedBy`.

Even if untrusted client payloads inject these keys dynamically, `buildCustomerOrderRequestPayload` strips them and tests assert their complete absence.

---

## 5. Guest Authentication & Fail-Closed Ownership

- Both `CheckoutPage.tsx` (`handlePlaceOrder`) and `submitCustomerOrderRequest` require a real authenticated Firebase UID (`auth.currentUser?.uid` or `await ensureGuestFirebaseSession()`).
- If Firebase Anonymous Auth fails or returns no UID, `GuestFirebaseAuthUnavailableError` is thrown and no Firestore write or simulated/WhatsApp-bypass request is created (`wa-` fallback does not exist).
- Any spoofed UID in caller input is ignored; `customerUid` is stamped strictly from `session.user.uid` and cross-checked by `firestore.spark.rules` (`data.customerUid == request.auth.uid`).

---

## 6. Checkout UX, Estimated Prices Disclaimer & Request Confirmation Flow

- **Checkout Form (`src/components/CheckoutPage.tsx`)**:
  - Uses bilingual "Pickup Order Request / إرسال طلب استلام مبدئي" headings and submit CTA ("Submit Order Request / إرسال طلب مبدئي عبر واتساب").
  - Labels cart totals clearly as `Estimated Subtotal (Unverified)` and `Estimated Total (Pending Admin Verification)` alongside `estimatedPriceDisclaimer` clarifying that displayed SAR totals are estimates only and not a confirmed invoice.
- **Error Handling & Cart Preservation**:
  - If validation or Firestore submission fails, `formError` displays the localized error, the cart state (`cart`) is preserved intact, form inputs remain filled, and `attemptNonce` is preserved so retrying reuses the exact same deterministic `requestId`.
  - `onClearCart()` executes strictly after `await submitCustomerOrderRequest(...)` resolves.
- **Request Confirmation Screen (`confirmedSubmission`)**:
  - Replaces immediate navigation to final order receipt with a dedicated confirmation view stating: *"Order Request Submitted — Awaiting Admin Confirmation"* / *"Your order is not confirmed or in preparation yet."*
  - Displays the Request Reference (`REQ-...` + full `requestId`), pickup mode, customer name/phone, item summary without confirmed invoice totals, the WhatsApp CTA, and a *"Track Request Status"* button (`onGoToTracker`).

---

## 7. WhatsApp Order Request Summary (`src/lib/whatsapp.ts`)

`buildBilingualOrderRequestWhatsAppSummary` generates the prefilled WhatsApp message targeting `966506439172` (or `storeSettings.whatsappNumber`):
- **Header:** `*ORDER REQUEST — AWAITING ADMIN CONFIRMATION*` and `*طلب مبدئي — بانتظار تأكيد الإدارة والسعر النهائي*`
- **Metadata:** Request Ref (`REQ-... (req_...)`), Service Mode (`Pickup | استلام من الفرع`), customer details, optional notes.
- **Items:** Quantity, item EN/AR name, temperature, size, milk option, customization labels, and special instructions—without unit or line prices.
- **Pricing Line:** `*Price & Confirmation / السعر والتأكيد:* Pending Admin Verification (SAR) | بانتظار مراجعة وتأكيد الإدارة بالريال السعودي`
- **Status Footer:** `⏳ Status: Awaiting Admin review — not confirmed for preparation yet`
- Does **not** include confirmed `Subtotal` or `Total` invoice lines.

---

## 8. Order Request Tracking & `/orders` Coexistence (`src/components/OrderTrackerPage.tsx`, `src/App.tsx`)

- **Dual Subscriptions:** `OrderTrackerPage` subscribes to both `subscribeCustomerOrders(uid)` (`/orders`) and `subscribeCustomerOrderRequests(uid)` (`/orderRequests`), displaying distinct tabs (`Request` / `طلب مبدئي` badge vs confirmed order number).
- **4-Step Request Lifecycle:** For requests, renders `Submitted` → `Admin Review` → `Verified` → `Order Created`, with distinct handling for `rejected` (showing `rejectionReason` if present) and `cancelled`. Confirmed receipts and print/price totals are suppressed for requests (`setShowReceipt(false)`).
- **Handoff to Final Confirmed Order:** When Stage 04L Admin sets `status: 'approved'` and populates `approvedOrderId`, `OrderTrackerPage` displays `"Track Final Confirmed Order"` (`onSelectOrderId(displayRequest.approvedOrderId)`), transitioning the user cleanly to live tracking on `/orders/{approvedOrderId}`.
- **App.tsx Subscription Guard:** `App.tsx` skips calling `subscribeOrder` when `activeOrderId` starts with `req_` or has `kind === 'request'`, avoiding spurious `/orders/req_*` permission errors.

---

## 9. Duplicate Request Prevention & Honest Limitations

Implemented protections in Stage 04K:
1. **UI Double-Click Guard:** `submittingLockRef.current` in `CheckoutPage.tsx` synchronously blocks rapid double clicks before React async state updates settle.
2. **Deterministic Document ID (`computeStableOrderRequestId`):** Derives `req_<nonce>_<fnv1aHex>` from `(customerUid, checkoutFingerprint, attemptNonce)`. Same failed submission retried by the user reuses the exact same Firestore document ID.
3. **Pre-Write & Race Recovery Check:** `submitCustomerOrderRequest` checks `getExistingRequest(requestId)` before `setDoc`, and if a `setDoc` race fails with `already-exists` or `permission-denied`, re-reads `getExistingRequest(requestId)` to recover cleanly with `duplicatePrevented: true` instead of creating a duplicate document.

**Honest Spark-Plan Limitation:**
- Because Firestore client writes operate without a server-side Cloud Function transaction over a separate UID/cart-digest ledger, deterministic duplicate prevention protects retries within the same checkout attempt (`attemptNonce`) and rapid double-clicks. If a customer intentionally refreshes the browser or clears state and submits a brand-new checkout session for identical items, a new `attemptNonce` produces a new `/orderRequests` document; staff deduplication in the Admin Review Queue (Stage 04L) handles separate intentional repeat submissions.

---

## 10. Local Spark Security Rules Proposal (`firestore.spark.rules`) & Schema Blueprint (`firebase-blueprint.json`)

Created `firestore.spark.rules` as a **separate local artifact** (not deployed; existing `firestore.rules` left untouched for production/rollback safety):
- **`/orderRequests/{requestId}`**:
  - `get`: valid ID + signed in + (`isAdmin()` or `existing().customerUid == request.auth.uid`).
  - `list`: signed in + (`isVerifiedAdminToken()` or `resource.data.customerUid == request.auth.uid`) with zero DB `get`/`exists` calls inside list expressions.
  - `create`: valid ID + signed in + `isValidOrderRequestCreate(incoming(), requestId)` enforcing `requestId == docId`, `customerUid == request.auth.uid`, `orderType == 'pickup'`, `currency == 'SAR'`, `status == 'pending_review'`, `requestSource == 'customer-app-spark'`, `items` size `1..50`, `item.quantity is int && item.quantity >= 1 && item.quantity <= 99`, `createdAt == request.time`, `updatedAt == request.time`, and strict `hasOnly` allowlists that reject ALL price, total, discount, tax, and admin approval keys.
  - `update` & `delete`: strictly `isAdmin()` (customers cannot alter, self-approve, spoof prices, or delete submitted requests).
- **`/orders/{orderId}`**:
  - `create`: `isValidId(orderId) && isAdmin() && isValidAdminOrderCreate(incoming())` — strictly blocks ALL customers and anonymous users while allowing verified Admin creation in Spark mode (Stage 04L).
  - `get`, `list`, `update`, `delete`: preserves strict PII isolation and Admin-only transitions.
- **`firebase-blueprint.json`**: Documented `OrderRequest` entity and `/orderRequests/{requestId}` collection path.

---

## 11. Security Guarantees & Remaining Limitations

- **Verified Guarantees:**
  - Customer App cannot write to `/orders`.
  - Customer App transmits zero prices, subtotals, discounts, taxes, or totals to Firestore.
  - Anonymous and non-admin callers remain isolated to their own `customerUid` records.
  - Default-deny catch-all and strict `isAdmin()` provider checks (`sign_in_provider != 'anonymous'`, `email_verified == true`) are preserved in `firestore.spark.rules`.
- **Inherited Honest Limitations (Spark Plan Without Cloud Functions):**
  - Firestore Security Rules cannot read `/menu` or `/productCustomizations` to reject an unknown `itemId` or out-of-stock item cross-collection inside a `create` rule without excessive fixed doc lookups; additionally, CEL validates `items[0]` deeply while list element rules do not iterate variable-length arrays without map/comprehension limits. Therefore, **Admin verification in Stage 04L remains the mandatory authoritative gatekeeper** before any `/orders` document is created.

---

## 12. Automated Tests & Build Verification Results

All checks listed below were executed in the local workspace after final code edits:

| Check | Command | Outcome | Notes |
| --- | --- | --- | --- |
| Stage 04D/04E Regression Tests | `./node_modules/.bin/tsx scripts/stage04d.test.ts` | **PASS (12/12 passed, 0 failed)** | Verified menu alignment, cart migration, UID fail-closed check, canonical builders, customization pricing math, bilingual WhatsApp & i18n keys. |
| Stage 04K Customer Order Request Suite | `./node_modules/.bin/tsx scripts/stage04k.test.ts` | **PASS (17/17 passed, 0 failed)** | Covered all 17 cases: auth fail-closed, mocked `/orderRequests` write via `OrderRequestPersistenceAdapter`, UID tampering override, name/contact validation, 0/51 item bounds, invalid quantities (`0, -1, 1.5, 100, NaN`), malformed `itemId` + alias canonicalization, normalized Firestore errors, retry/race duplicate prevention, cart preservation on error, confirmation wording, WhatsApp message wording, zero financial/admin fields, 35 bilingual i18n keys, `/orders` + status normalization compatibility, callable removal + `firestore.spark.rules` static audit, and `buildOrderRequestItemsFromCart` field hygiene. |
| Firestore Rules Static Audit | `node scripts/audit-rules.mjs` | **PASS** | Verified existing `firestore.rules` rollback rules and updated `firebase-blueprint.json`. |
| TypeScript Typecheck | `npm run lint` (`tsc --noEmit`) | **PASS (0 errors)** | Clean compilation across all components and modules. |
| Production Bundle Build | `npm run build` (`vite build`) | **PASS (built in 1.68s)** | Generated `dist/` bundle cleanly without errors. |
| Firebase Emulator Live Rules Test | N/A | **NOT EXECUTED (Java not installed)** | `which java` returned `JAVA_NOT_INSTALLED`; Firestore Local Emulator rules execution could not run in this container and must be executed before Stage 04L/production cutover. |
| Live Firebase / GitHub Checks | N/A | **NOT EXECUTED (Forbidden in Stage 04K)** | Strictly local implementation stage; zero deployments or live writes performed. |

---

## 13. Readiness & Prerequisites for Next Stage (Stage 04L — Admin Dashboard Integration)

1. Implement Stage 04L in `palm-metric-admin-`:
   - Subscribe to `/orderRequests` filtered/sorted by pending review queue (`pending_review`, `reviewing`).
   - Resolve authoritative prices in integer halalas from `/menu`, `/productCustomizations`, and `/settings/coffeeOptions` (ignoring client display estimates).
   - Validate item stock, options, and quantity bounds, then atomically write `/orders/{orderId}` (`status: 'Pending'`, `sourceRequestId: requestId`) and update `/orderRequests/{requestId}` (`status: 'approved'`, `approvedOrderId`, `approvedOrderNumber`, `reviewedBy`).
2. Run Firebase Local Emulator Suite tests against `firestore.spark.rules` in a Java-equipped CI environment to confirm CEL rules accept legitimate customer `/orderRequests` creates and reject tampered price/status/UID payloads and customer `/orders` writes.
3. Coordinate deployment of `firestore.spark.rules` + Stage 04L Admin App + Stage 04K Customer App together (and retain `firestore.rules` + `functions/` until cutover verification completes).

---

## 14. Verdict

`STAGE 04K — IMPLEMENTATION COMPLETE`
