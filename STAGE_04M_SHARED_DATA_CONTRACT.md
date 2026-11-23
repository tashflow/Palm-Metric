# PALM METRIC — STAGE 04M: SHARED DATA CONTRACT

This document defines the exact integration schema contracts between the Palm Metric Customer App and the Admin Dashboard under the Firebase Spark-compatible architecture.

## Contract Summary Table

| Entity / Field Name | Data Type | Required / Optional | Responsible App | Trusted Source | Validation Rules | Backward Compatibility |
|---|---|---|---|---|---|---|
| **Order Request (`/orderRequests/{requestId}`)** | Document | Required | Customer App (Create), Admin App (Update/Promote) | Server-Validated / Admin Transaction | `requestId == docRequestId`, `customerUid == request.auth.uid`, `status == 'pending_review'`, `orderType == 'pickup'`, `currency == 'SAR'`, items size 1–50. | Preserves legacy request structure and adds Spark promotion fields (`verifiedPricing`, `approvedOrderId`, `approvedOrderNumber`). |
| **Official Order (`/orders/{orderId}`)** | Document | Required | Admin App (Transaction) | Admin-Verified Transaction | `orderNumber` matches `PM-XXXXXX`, `customerUid` matches request, `totalBill >= 0`, `status` in `['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled']`. | Fully compatible with legacy `/orders` readers and external Admin App LiveOrdersView. |
| **Order Number (`/orderNumbers/{orderNumber}`)** | Document | Required | Admin App (Transaction) | Unique Registry | `orderNumber` format `PM-XXXXXX`, links `orderId` and `requestId`, immutable once created. | Prevents duplicate official order numbers across concurrent promotions. |
| **Customer Identity (`customerUid`)** | String | Required | Customer App / Auth | Firebase Auth (`request.auth.uid`) | 1–128 alphanumeric characters, strictly bound to owner session or admin actor. | Enforced in all Firestore security rules. |
| **Product Item (`/menu/{itemId}`)** | Document | Required | Admin App (Management), Customer App (Read) | Firestore Menu Catalog | `price >= 0`, `inStock` boolean, managed numeric stock (`stockQuantity` / `stockCount`) >= 0. | Backward compatible with boolean-only items and fallback local catalog. |
| **Product Customization (`/productCustomizations/{productId}`)** | Document | Optional | Admin App (Management), Customer App (Read) | Firestore Customization Config | Schema version 1, group and option validation, additional price >= 0. | Optional per product; defaults to coffee options settings. |
| **Pricing Breakdown (`verifiedPricing`)** | Map | Required (on verified/approved) | Admin App | Authoritative Catalog Engine (`authoritativePricing.ts`) | Halala-exact arithmetic, `subtotalSar - discountSar + taxSar == totalBillSar`. | Optional for unverified pending requests. |
| **Inventory Fields (`stockQuantity`, `stockCount`)** | Number | Optional | Admin App | Firestore Catalog | Non-negative integers; atomic decrement on approval; clamps at 0 and sets `inStock: false`. | Non-tracked products keep boolean-only `inStock` behavior. |
| **Admin Identity (`request.auth.uid`)** | UID / Token | Required | Firebase Auth | Verified Admin Allowlist / `/admins/{uid}` | Non-anonymous provider, `email_verified == true`, email in allowlist or valid admin doc. | Supports both allowlist emails/UIDs and `/admins/{uid}` documents. |
| **Audit Log (`/orderRequestAuditLogs/{auditId}`)** | Document | Required | Admin App | Admin Transaction | Immutable append-only audit entry containing `requestId`, `action`, `adminUid`, `createdAt`. | New collection; does not affect existing collections. |
| **Status Transitions** | String | Required | Customer App / Admin App | State Machine | `pending_review` → `reviewing` → `verified` → `order_created` / `rejected`. | Terminal statuses (`order_created`, `rejected`, `cancelled`) cannot be modified. |

---

## Validation & Backward Compatibility Guarantees
1. **No Client Pricing Trust**: Customer App requests (`/orderRequests`) contain zero prices, totals, taxes, or discounts. All pricing is computed inside trusted Admin transactions using live Firestore catalogs.
2. **Legacy Order Read Safety**: `mapOrderSnapshot` in `firestore.spark.rules` and `firestoreSync.ts` handles both legacy delivery/cash orders and new Spark pickup orders seamlessly.
3. **Admin Category & Menu Schema Alignment**: `firestore.spark.rules` supports Admin's `'key'`, `'allowMilkOption'`, and `'allowTemperature'` fields on categories and menu items.
