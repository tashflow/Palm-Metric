# PALM METRIC — STAGE 04M: INTEGRATION AUDIT REPORT

**Project Identity**:
- **Firebase Project ID**: `palm-metric-app`
- **Firestore Database**: `(default)`
- **Cloud Functions Region**: `us-central1`
- **Customer App URL**: `https://tashflow.github.io/Palm-Metric/`
- **Admin App URL / Repo**: `https://tashflow.github.io/palm-metric-admin-/` / `https://github.com/tashflow/palm-metric-admin-`
- **Currency**: SAR
- **Service Mode**: Pickup only
- **WhatsApp Support**: `966506439172`

---

## 1. Executive Summary & Audit Objectives

Stage 04M performed a rigorous, read-only end-to-end integration and compatibility audit across the Palm Metric Customer App (`/app/applet`, incorporating Stage 04K, 04L, and 04L.1) and the external Admin App (`tashflow/palm-metric-admin-`, commit `f432f1a`).

The primary objective was to verify how guest customer checkout requests submitted to `/orderRequests` under the Firebase Spark plan are reviewed, priced authoritatively, inventory-deducted, and promoted by administrators to canonical `/orders` without requiring the paid Cloud Function `createPalmMetricOrder`.

### Verdict: PASS WITH LIMITATIONS
- **Local Integration & Rules**: Fully operational and passing all 61+ new and baseline unit tests.
- **Limitation**: The external Admin App (`tashflow/palm-metric-admin-`) currently targets legacy Stage 04C/04G `/orders` management and lacks the Spark-specific `/orderRequests` view and promotion workflow until updated. Furthermore, live container constraints prevent Firebase Local Emulator Suite execution (Java runtime not installed), so static rules and robust unit harness tests verify transaction and rule invariants.

---

## 2. Customer-to-Admin Order Lifecycle Audit

1. **Step 1 — Customer Order Request (`/orderRequests`)**:
   - Guest customers authenticate securely using Firebase Anonymous Authentication (`ensureGuestFirebaseSession`).
   - Cart items, customizations, temperatures, and notes are validated and serialized into an unpriced `/orderRequests/{requestId}` document with status `pending_review` and `requestSource: 'customer-app-spark'`.
   - Client price overrides, subtotals, and totals are stripped entirely.

2. **Step 2 — Admin Dashboard Review (`AdminOrderRequestsPage`)**:
   - Authorized admins inspect pending requests in real time, view customer contact details, items, customizations, and audit trails.
   - Filtering, searching, and sorting operate seamlessly.

3. **Step 3 — Admin Pricing & Stock Verification (`authoritativePricing.ts`)**:
   - The Admin re-reads live catalog and customization records from Firestore (`/menu/{itemId}`, `/productCustomizations/{itemId}`, `/settings/coffeeOptions`).
   - Authoritative halala-exact unit and line prices are computed.
   - Out-of-stock items, insufficient managed inventory, or disabled customization options block promotion instantly.

4. **Step 4 — Atomic Promotion & Inventory Deduction (`adminOrderRequests.ts`)**:
   - Executed within a transactional batch: validates request status, re-reads catalog state, deducts managed numeric stock (`stockQuantity` / `stockCount`) atomically (setting `inStock: false` when stock reaches 0 without negative overflow), generates a unique official order number (`PM-XXXXXX`), claims it in `/orderNumbers/{orderNumber}` to prevent collision, creates `/orders/{orderId}` with `sourceRequestId`, and updates request status to `order_created`.

5. **Step 5 — Customer Order Tracker (`OrderTrackerPage`)**:
   - Reflects live state transitions (`pending_review` → `reviewing` → `verified` → `order_created` → `rejected`).
   - Promoted orders link directly to active `/orders/{orderId}` status tracking and digital receipt views.

6. **Step 6 — WhatsApp Integration (`whatsapp.ts`)**:
   - Preserves bilingual Arabic/English WhatsApp order request summary generation targeting `966506439172` without exposing unverified client totals.
