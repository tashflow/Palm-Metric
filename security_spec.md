# Palm Metric Stage 04E Security Specification

## 1. Core Data & Pricing Invariants
1. **Server-Authoritative Order Creation**: Customers (guest anonymous or Google-authenticated) NEVER create finalized `/orders/{orderId}` documents directly via client Firestore SDK. All orders must pass through the `createPalmMetricOrder` Cloud Function (`firebase-admin` transaction).
2. **Authoritative Catalog & Customization Pricing**: Server reads `/menu/{itemId}`, `/productCustomizations/{itemId}`, and `/settings/coffeeOptions` directly from Firestore inside the transaction, ignores any client-submitted `price`, `basePrice`, `customizationTotal`, `additionalPrice`, `subtotal`, or `totalBill`, and computes all amounts in integer halalas (`1 SAR = 100 halalas`).
3. **Pickup-Only & Currency Enforcement**: Only `orderType: 'pickup'` and `currency: 'SAR'` are accepted.
4. **Session & UID Isolation**: Caller must carry a valid Firebase Auth session (`request.auth.uid`). Customers may only `get` or `list` `/orders` where `customerUid == request.auth.uid`.
5. **Immutable Admin Status Transitions**: Direct client updates and deletes on `/orders/{orderId}` are denied. Only verified Admins (`isAdmin()`) may update `status` and `updatedAt`, while financial/item/identity fields remain immutable.
6. **Server-Only Idempotency Ledger**: `/idempotencyKeys/{keyId}` denies all client reads and writes (`allow read, write: if false;`).

## 2. Adversarial "Dirty Dozen" Payloads Blocked by Rules & Backend
1. Direct client `setDoc(doc(db, 'orders', 'forged'), { totalBill: 0.01, status: 'Completed' })` -> **DENIED** by `firestore.rules` (`allow create: if false;`).
2. Client `updateDoc` raising/lowering `totalBill` or mutating `items` on an existing order -> **DENIED** by `firestore.rules` (`allow update` requires `isAdmin()` and `affectedKeys().hasOnly(['status', 'updatedAt'])`).
3. Client `createPalmMetricOrder` with tampered `price: 0.01` -> Server ignores client price and computes authoritative catalog price in halalas.
4. Client `createPalmMetricOrder` with tampered customization `additionalPrice: 0` -> Server ignores client option surcharge and reads authoritative option price from `productCustomizations/{productId}`.
5. Client `createPalmMetricOrder` sending privileged fields (`adminApproved: true`, `paymentVerified: true`, `status: 'Completed'`) -> **REJECTED** (`permission-denied`).
6. Client `createPalmMetricOrder` spoofing another `customerUid` -> **REJECTED** (`permission-denied`).
7. Unauthenticated caller (`request.auth == null`) -> **REJECTED** (`unauthenticated`).
8. Anonymous session attempting `get('/orders/other_user_order')` or blanket `list('/orders')` -> **DENIED** by `firestore.rules`.
9. Anonymous session attempting admin role escalation via `/admins/{uid}` write -> **DENIED** (`allow create, update, delete: if false;` + `sign_in_provider != 'anonymous'`).
10. Direct read/write to `/idempotencyKeys/{keyId}` -> **DENIED** (`allow read, write: if false;`).
11. Out-of-stock item, disabled customization option/group, or missing required group selection -> **REJECTED** (`failed-precondition`).
12. Reusing same `idempotencyKey` with a different cart/customer payload -> **REJECTED** (`failed-precondition`), while exact retries return the existing order without duplication.
