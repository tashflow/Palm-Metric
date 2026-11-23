# PALM METRIC — STAGE 04M: CHANGELOG

## Summary of Changes

### 1. Firestore Rules Enhancements (`firestore.spark.rules`)
- **Category Validation Update**: Updated `isValidCategory` rule to allow Admin management fields (`'key'`, `'allowMilkOption'`, `'allowTemperature'`) and increased max keys to 15, ensuring complete cross-app category write compatibility with the Admin App `CategoryManagerModal`.

### 2. Regression & Integration Test Suite (`scripts/stage04m.test.ts`)
- Added comprehensive Stage 04M test suite covering:
  - Admin allowlist and UID authorization.
  - Unpriced customer order request submission (`/orderRequests`).
  - Admin review, pricing verification, and atomic promotion (`/orders`).
  - Idempotent re-promotion handling.
  - Stock depletion and out-of-stock enforcement.
  - Legacy order reader compatibility (`mapOrderSnapshot`).

### 3. Stage 04M Documentation Reports
- Created 5 required Markdown verification reports:
  - `STAGE_04M_INTEGRATION_AUDIT_REPORT.md`
  - `STAGE_04M_SHARED_DATA_CONTRACT.md`
  - `STAGE_04M_TEST_REPORT.md`
  - `STAGE_04M_ADMIN_INTEGRATION_GAP_REPORT.md`
  - `STAGE_04M_CHANGELOG.md`

### 4. Files Intentionally Untouched
- `src/lib/firebase.ts`: Preserved project identity (`palm-metric-app` / `(default)`).
- `src/components/CheckoutPage.tsx`, `src/components/OrderTrackerPage.tsx`, `src/components/AdminOrderRequestsPage.tsx`: Preserved all working Stage 04K/04L UI flows.
