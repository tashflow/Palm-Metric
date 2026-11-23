# PALM METRIC — STAGE 04J: FIREBASE SPARK MIGRATION ARCHITECTURE & SECURITY AUDIT

**Project Identity:**
- **Firebase Project ID:** `palm-metric-app`
- **Firestore Database:** `(default)`
- **Customer App:** `https://tashflow.github.io/Palm-Metric/`
- **Admin Dashboard:** `https://tashflow.github.io/palm-metric-admin-/`
- **Functions Region:** `us-central1`
- **Currency:** `SAR`
- **Order Type:** Pickup only (`pickup`)
- **Customer WhatsApp:** `966506439172`

---

## 1. Current Architecture Findings

Palm Metric is a specialty coffee ordering and menu web application built with React, Vite, Tailwind CSS, and Firebase. 
- **Client App (`src/`)**: Handles menu browsing, real-time stock/billboard subscriptions, customization options (milk choices, temperature, flavor/add-on options), guest authentication via Firebase Anonymous Auth, cart state management, and order tracking.
- **Backend Architecture (Stage 04E)**: Currently relies on a Firebase v2 Callable Cloud Function (`createPalmMetricOrder`) deployed in `us-central1` to validate cart payloads against live Firestore catalogs, enforce server-side integer halala pricing, manage idempotency, and commit verified orders directly into the `/orders` collection.
- **The Spark Plan Constraint**: The Firebase **Spark (Free) Plan** does not permit outbound network requests from Cloud Functions to external APIs, nor does it allow Cloud Functions at all if strict cost-free constraints are maintained (or requires upgrading to the Blaze pay-as-you-go plan). To keep Palm Metric 100% free on the Firebase Spark Plan without requiring a credit card or billing account, a **client-submitted Order Request & Admin-Verified fulfillment architecture** is required.

---

## 2. Cloud Functions Dependencies

In the existing architecture (`src/lib/firestoreSync.ts` and `functions/`), the client depends on `httpsCallable(functions, 'createPalmMetricOrder')`.
- **Dependencies to be abstracted/migrated**:
  1. `createVerifiedPalmMetricOrder` and `createOrder` currently invoke the callable function.
  2. The cloud function performs authoritative price lookup, item availability verification, option surcharge calculation, and writes to `/orders`.
- **Spark Migration Strategy**: Replace the callable function dependency with direct Spark-compatible client writes to a new `/orderRequests/{requestId}` collection. The Admin Dashboard (which runs with privileged Admin auth) listens to `/orderRequests`, reviews orders, computes authoritative prices, validates inventory/options, and atomically writes the verified order to `/orders`.

---

## 3. Customer App Audit

Inspection of `src/lib/firestoreSync.ts`, `src/components/CheckoutPage.tsx`, and `src/lib/firebase.ts` reveals:
- **Authentication**: Uses `ensureGuestFirebaseSession()` (Anonymous Auth) to ensure `auth.currentUser?.uid` is present.
- **Order Payload**: Captures customer name, phone number (`customerContact`), order type (`pickup`), items with quantities, temperature (`Hot`/`Cold`), milk options, selected customization items (`groupId`, `optionId`, `additionalPrice`), special instructions, and client-side notes.
- **Error Handling**: Uses `BackendOrderError`, `GuestFirebaseAuthUnavailableError`, and `handleFirestoreError` with `OperationType` telemetry.
- **Cart & Persistence**: Cart state is managed in React state / localStorage and cleared upon successful order placement. Order tracking (`subscribeOrder`, `subscribeCustomerOrders`) listens to `/orders/{orderId}` filtered by `customerUid`.

---

## 4. Admin App Audit

The separate Admin Dashboard (`https://tashflow.github.io/palm-metric-admin-`) manages inventory, menu items, product customizations, store settings (`/settings/coffeeOptions`), and live orders.
- **Admin Authorization**: Relies on Firebase Auth custom claims or Admin role allowlists (`isAdmin == true` or specific admin UIDs).
- **Required Admin Extension**: Introduce an **Order Requests Queue** view in the Admin Dashboard that:
  1. Subscribes to `/orderRequests` where `status == 'Pending'` (or `Reviewing`).
  2. Displays incoming customer requests with items, customizations, temperature, and contact info.
  3. Provides buttons to **Review**, **Approve**, or **Reject** the request.
  4. Upon approval, executes a Firestore batch / transaction that reads live catalog prices from `/menu`, applies valid option surcharges from `/productCustomizations` and `/settings/coffeeOptions`, generates an authoritative order number (e.g. `PM-XXXX`), creates the official verified document in `/orders`, and updates the request status to `'Approved'` with a reference to the created order ID.

---

## 5. Proposed Firestore Data Model

To support Spark-compatible order requests without trusting client prices, we introduce the `/orderRequests` collection.

### Collection: `/orderRequests/{requestId}`
- **`requestId`**: Unique auto-generated document ID (e.g. `req_abc123...`).
- **`customerUid`**: String (must match `request.auth.uid`).
- **`customerName`**: String (max 80 chars).
- **`customerContact`**: String (phone number, min 4 chars).
- **`orderType`**: `'pickup'` (strictly enforced).
- **`currency`**: `'SAR'`.
- **`status`**: `'Pending'` | `'Reviewing'` | `'Approved'` | `'Rejected'`.
- **`lang`**: `'ar'` | `'en'` (optional).
- **`orderNote`**: String (optional, max 220 chars).
- **`items`**: Array of request line items (client-submitted intent, un-trusted prices):
  - `itemId`: String (references `/menu/{productId}`).
  - `quantity`: Number (1 to 99).
  - `temperature`: `'Hot'` | `'Cold'` (optional).
  - `specialInstructions`: String (optional, max 160 chars).
  - `selectedCustomizations`: Array of `{ groupId: string, optionId: string }`.
- **`clientSubtotal`**: Number (client-estimated subtotal for display only — **never trusted by Admin**).
- **`createdAt`**: Server Timestamp.
- **`updatedAt`**: Server Timestamp.
- **`reviewedBy`**: String (Admin UID, set only upon approval/rejection).
- **`approvedOrderId`**: String (references the resulting `/orders/{orderId}` document upon approval).
- **`rejectionReason`**: String (optional, populated if rejected).

---

## 6. Firestore Security Rules Design

The following security rules enforce strict ownership, payload validation, and prevent client tampering on both `/orderRequests` and `/orders`:

```cel
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    function isAdmin() {
      return isAuthenticated() && 
        (request.auth.token.admin == true || 
         request.auth.token.role == 'admin' ||
         resource.data.adminUid == request.auth.uid);
    }

    // Menu, Billboards, Categories, Customizations (Public read, Admin write)
    match /menu/{itemId} {
      allow read: if true;
      allow write: if isAdmin();
    }
    match /productCustomizations/{id} {
      allow read: if true;
      allow write: if isAdmin();
    }
    match /billboards/{id} {
      allow read: if true;
      allow write: if isAdmin();
    }
    match /settings/{id} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // Order Requests (Client creates pending request; Admin reviews and approves)
    match /orderRequests/{requestId} {
      // Customer can read their own requests; Admin can read all
      allow read: if isAuthenticated() && (resource.data.customerUid == request.auth.uid || isAdmin());

      // Guest/Customer can create a request belonging to themselves
      allow create: if isAuthenticated()
        && request.resource.data.customerUid == request.auth.uid
        && request.resource.data.status == 'Pending'
        && request.resource.data.orderType == 'pickup'
        && request.resource.data.currency == 'SAR'
        && request.resource.data.customerName is string
        && request.resource.data.customerName.size() > 0
        && request.resource.data.customerName.size() <= 80
        && request.resource.data.customerContact is string
        && request.resource.data.customerContact.size() >= 4
        && request.resource.data.customerContact.size() <= 80
        && request.resource.data.items is list
        && request.resource.data.items.size() > 0
        && request.resource.data.items.size() <= 50
        && request.resource.data.createdAt == request.time;

      // Customers cannot update or delete submitted requests; only Admins can update status/approval
      allow update: if isAdmin() || (
        isAuthenticated() 
        && resource.data.customerUid == request.auth.uid 
        && resource.data.status == 'Pending'
        && request.resource.data.status == 'Cancelled' // Allow customer cancellation while pending
        && request.resource.data.customerUid == resource.data.customerUid
      );

      allow delete: if isAdmin();
    }

    // Final Verified Orders (Created ONLY by Admin upon approving a request)
    match /orders/{orderId} {
      // Customers read their own orders; Admins read all
      allow read: if isAuthenticated() && (resource.data.customerUid == request.auth.uid || isAdmin());

      // Client direct creation of final orders is strictly blocked on Spark plan
      // Final orders are created exclusively by Admin or trusted backend functions
      allow create: if isAdmin();

      // Admin can update status; customers cannot modify financial or status fields
      allow update: if isAdmin() || (
        isAuthenticated()
        && resource.data.customerUid == request.auth.uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['notes']) // Customer can only update personal order note if permitted
      );

      allow delete: if isAdmin();
    }
  }
}
```

### Limitations of Firestore Rules
- **No Arithmetic/Query Joins**: Firestore rules cannot query the `/menu` collection inside a rule to verify that `item.price` matches the database price. This is why **client-submitted prices are completely untrusted**, and authoritative pricing must be computed server-side or by the Admin Dashboard upon review.
- **No Complex Relational Constraints**: Cross-document consistency (e.g., verifying stock across 5 different menu documents in a single client write) cannot be fully enforced purely through rules without Cloud Functions transactions. Therefore, the Admin Dashboard review workflow acts as the authoritative gatekeeper.

---

## 7. Admin Price Verification Workflow

When an Admin reviews an incoming order request in `/orderRequests`:
1. **Catalog Resolution**: For each item in `request.items`, the Admin app reads the authoritative price from `/menu/{itemId}`.
2. **Option & Surcharge Resolution**: The Admin app reads `/productCustomizations/{itemId}` and `/settings/coffeeOptions` to verify whether selected milk options, temperature options, or custom options are enabled and computes valid surcharges (e.g., coconut milk extra charge, flavor add-on prices).
3. **Total Calculation**: The Admin app computes the exact subtotal and total in integer halalas (SAR) using secure rounding.
4. **Authoritative Order Creation**: Upon clicking **Approve**, the Admin app runs a Firestore transaction/batch that:
   - Creates the official verified document in `/orders/{orderId}` with `customerUid`, authoritative pricing, items, and status `'Pending'` (ready for kitchen preparation).
   - Updates `/orderRequests/{requestId}` setting `status = 'Approved'`, `approvedOrderId = orderId`, and `reviewedBy = adminUid`.
5. **Rejection**: If items are out of stock or pricing cannot be verified, the Admin clicks **Reject**, updating `/orderRequests/{requestId}` with `status = 'Rejected'` and a `rejectionReason`.

---

## 8. Duplicate Request Protection

On the Spark Plan without Cloud Functions transactional idempotency keys:
- **Client Mitigation**: The Customer App generates a deterministic idempotency / session fingerprint for the cart submission (`computeDeterministicIdempotencyKey`) and stores a local submission lock in `localStorage` with a 30-second window.
- **Firestore Guard**: The compound document ID of the order request can incorporate a client nonce or hash, or Firestore rules can check that no active `'Pending'` request with identical fingerprint exists for the user within the last 2 minutes.
- **Admin Deduplication**: The Admin queue highlights duplicate submissions if multiple requests arrive from the same phone number within a short timeframe, allowing staff to dismiss duplicates easily.

---

## 9. Existing Order Preservation

- **`/orders` Collection**: All existing historical orders in `/orders` remain untouched, fully preserved with their IDs, order numbers, customer UIDs, and tracking history.
- **Customer Tracking**: `subscribeCustomerOrders` and `subscribeOrder` continue to read from `/orders` using the customer's auth UID. Once an order request is approved by the Admin and written to `/orders`, it immediately appears in the customer's active order tracking view.

---

## 10. Migration Sequence

1. **Phase 1 (Audit & Design - Current Stage)**: Finalize Spark migration architecture and security rules design.
2. **Phase 2 (Admin Update)**: Update the Admin Dashboard to include the Order Requests review queue and authoritative pricing calculator.
3. **Phase 3 (Customer App Update)**: Update `src/lib/firestoreSync.ts` in the Customer App to write to `/orderRequests` instead of calling `createPalmMetricOrder`.
4. **Phase 4 (Rules Deployment)**: Deploy the hardened Firestore security rules for `/orderRequests` and `/orders`.
5. **Phase 5 (End-to-End Verification)**: Test placing a guest order request, reviewing/approving it in the Admin dashboard, and verifying that the order appears correctly in the customer tracker.

---

## 11. Rollback Strategy

If any issue arises during Spark migration:
- **Instant Revert**: Revert `src/lib/firestoreSync.ts` to call the existing `createPalmMetricOrder` Cloud Function (which remains deployed and undeleted in `us-central1`).
- **Rules Rollback**: Revert Firestore rules to previous versions via Firebase Console or CLI.
- **Zero Data Loss**: Because `/orders` schema and existing orders are never modified or deleted during migration, historical data and active orders remain 100% safe.

---

## 12. Risks and Limitations

1. **Admin Availability**: Unlike automated Cloud Functions, order requests require an active Admin in the dashboard to review and approve orders. If no Admin is online, orders remain in `'Pending'` request status until reviewed.
2. **Client Price Manipulation**: Client-submitted prices in `/orderRequests` are strictly ignored by the Admin approval workflow, mitigating financial tampering risks.
3. **Network Latency**: Two-step approval (Customer submits request $\rightarrow$ Admin approves $\rightarrow$ Order created) introduces slight latency compared to instant server execution.

---

## 13. Files That Would Need Changes in Future Stages

When ready to implement this Spark migration in future code-writing stages, the following files will be modified:
1. `src/lib/firestoreSync.ts`: Replace `createVerifiedPalmMetricOrder` callable invocation with `addDoc` to `/orderRequests`.
2. `firestore.rules`: Update rules to enforce `/orderRequests` creation by owners and `/orders` creation exclusively by Admins.
3. Admin Dashboard repository (`palm-metric-admin-`): Add Order Requests management view and server-side price calculation logic.

---

## 14. Final Recommendation & Verdict

The proposed architecture successfully eliminates reliance on paid Cloud Functions (enabling operation entirely within the free Firebase Spark plan tier) while preserving customer experience, guest auth, bilingual support, WhatsApp integration, and robust Admin security controls.

**Final Verdict:**
`ARCHITECTURE APPROVED FOR LOCAL IMPLEMENTATION`
