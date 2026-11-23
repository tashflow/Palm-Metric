# PALM METRIC — STAGE 04M: ADMIN INTEGRATION GAP REPORT

**External Admin Repository**: `https://github.com/tashflow/palm-metric-admin-` (Inspected commit `f432f1a` at `/tmp/palm-metric-admin-`).

## 1. Executive Summary of Admin Integration Gaps

While the Palm Metric Customer App (`/app/applet`) fully implements the Firebase Spark-compatible order request system (`/orderRequests`, `AdminOrderRequestsPage`, authoritative pricing, stock deduction, and audit logging), the external Admin repository (`tashflow/palm-metric-admin-`) currently targets the legacy Stage 04C/04G Cloud Functions / direct `/orders` architecture.

This gap report details exact integration discrepancies and the required updates for complete synchronization when the external admin repository is updated.

---

## 2. Detailed Discrepancies & Gaps

1. **Missing `/orderRequests` Collection & UI Dashboard**:
   - **External Admin App**: Listens only to `/orders`, `/menu`, `/billboards`, `/categories`, `/settings/coffeeOptions`, and `/productCustomizations`. It has zero knowledge of `/orderRequests`, `/orderNumbers`, or `/orderRequestAuditLogs`.
   - **Impact**: Customer order requests submitted from the Customer App will not appear in the external Admin dashboard (`https://tashflow.github.io/palm-metric-admin-/`) until `AdminOrderRequestsPage.tsx` and `adminOrderRequests.ts` are ported to the Admin repo.
   - **Mitigation**: The Customer App includes an integrated `AdminOrderRequestsPage` view accessible directly in the development preview for verified admins.

2. **Order Status Enum Divergence**:
   - **External Admin App (`LiveOrdersView.tsx`)**: `OrderStatus` is strictly `'Pending' | 'Preparing' | 'Ready' | 'Completed'`. It lacks `'Cancelled'`.
   - **Impact**: When displaying promoted Stage 04L orders that have been cancelled, `LiveOrdersView` computes invalid array indices (`-1 + 1 = 0`), offering buttons to revert cancelled orders to pending.

3. **External Admin `firestore.rules` vs Stage 04L Promoted Orders**:
   - **External Admin App rules**: `isValidOrder` uses strict `hasOnly(['orderNumber', 'customerUid', 'customerName', 'customerContact', 'items', 'totalBill', 'status', 'notes', 'createdAt', 'updatedAt'])`.
   - **Impact**: Promoted orders created by Stage 04L contain extra metadata (`subtotal`, `discountTotal`, `taxTotal`, `currency`, `orderType`, `sourceApp`, `idempotencyKey`, `pricingVersion`, `sourceRequestId`, `paymentMethod`, `paymentStatus`, `approvedBy`, `approvedAt`, `lang`), causing direct status updates in the external Admin `LiveOrdersView` to fail `isValidOrder` unless `firestore.spark.rules` is deployed.

4. **Allowlist & Bootstrap UIDs Divergence**:
   - **External Admin (`src/lib/firebase.ts`)**: Authorizes `['tashflow26@gmail.com', 'palmmetric1@gmail.com']` + UID `'jPgFPc8KbsXaPrdkyrbCQSFDMOP2'`.
   - **Local Spark App (`src/lib/adminAuth.ts`)**: Authorizes `['palmmetric1@gmail.com', 'palmmatric1@gmail.com', 'tashfilartwork@gmail.com', 'tashflow26@gmail.com']` + UID `'39H76y4E55g5yX2uY0lE5bQ3a393'`.

5. **Default Menu Catalog Divergence**:
   - `src/data/menu.ts` includes Coffee of the Day items (`cotd-small`, `cotd-large`), whereas External Admin `src/lib/defaultMenu.ts` defines 18 core items without COTD.

---

## 3. Recommended Action Plan for Admin Repo Update
1. Port `src/lib/adminOrderRequests.ts`, `src/lib/authoritativePricing.ts`, and `src/components/AdminOrderRequestsPage.tsx` into `tashflow/palm-metric-admin-`.
2. Update External Admin `OrderStatus` type to include `'Cancelled'`.
3. Synchronize `firestore.rules` in the Admin repo with `firestore.spark.rules`.
4. Unify admin allowlist emails and bootstrap UIDs across both repositories.
