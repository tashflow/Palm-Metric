# Palm Metric — Stage 04E Technical & Deployment Guide

## 1. Architecture Overview
Stage 04E replaces direct client Firestore order creation with a server-authoritative Firebase Callable Cloud Function (`createPalmMetricOrder` in `us-central1`) targeting Firebase project `palm-metric-app` and Firestore `(default)` database:

1. Customer signs in automatically as a Firebase Anonymous Guest (or signed-in Google user).
2. `CheckoutPage` sends ONLY trusted customer selections (`idempotencyKey`, `orderType: 'pickup'`, `currency: 'SAR'`, `lang`, `customerName`, `customerContact`, `orderNote`, `items: [{ itemId, quantity, temperature, specialInstructions, selectedCustomizations: [{ groupId, optionId }] }]`) — never client unit prices or totals.
3. `createPalmMetricOrder` runs a strict Firestore transaction (`read-all -> validate & price -> write-all`):
   - Checks `idempotencyKeys/{uid}_{hash}` for replay vs payload conflict.
   - Reads `/menu/{itemId}`, `/productCustomizations/{itemId}`, and `/settings/coffeeOptions` directly from Firestore.
   - Validates product existence, active stock (`inStock`), active customization groups/options, required/min/max constraints, and legacy coffee milk fallback (only when `productCustomizations/{itemId}` does not exist).
   - Computes authoritative prices and `totalBill` in integer **halalas** (`1 SAR = 100 halalas`) with zero floating-point drift.
   - Atomically writes `/orders/{orderId}` (canonical Admin-compatible fields + `subtotal`, `currency`, `orderType`, `sourceApp`, `idempotencyKey`, `pricingVersion`) and `/idempotencyKeys/{uid}_{hash}`.
4. Customer App fails closed on errors (cart preserved, no `wa-` bypass, no WhatsApp trigger) and generates the receipt & WhatsApp pickup summary strictly from the server-verified order response.

## 2. Manual Deployment Instructions (Not Auto-Deployed)
Run these commands manually when ready to deploy Stage 04E to `palm-metric-app`:

```bash
# 1. Authenticate & select palm-metric-app
firebase login
firebase use palm-metric-app

# 2. Build & test Cloud Functions locally
npm --prefix functions run lint
npm --prefix functions run build
npm --prefix functions test

# 3. Deploy Cloud Functions and updated Firestore rules together
firebase deploy --only functions:createPalmMetricOrder,firestore:rules
```

> **Important Co-Deployment Notice**: Deploy `createPalmMetricOrder` and the updated `firestore.rules` (`allow create: if false;` on `/orders/{orderId}`) **together**. Deploying the tightened `firestore.rules` before `createPalmMetricOrder` is live will prevent customers from placing orders. Deploying the updated `firestore.rules` also updates `isValidOrderUpdate` so Palm Metric Admin can continue transitioning `status` (`Pending -> Preparing -> Ready -> Completed / Cancelled`) cleanly on Stage 04E orders.

## 3. Environment Variables & Optional Hardening
- **Frontend Region Override** (optional `.env` / Vite build var):
  - `VITE_FIREBASE_FUNCTIONS_REGION=us-central1` (defaults to `us-central1`).
- **App Check Enforcement** (optional Cloud Functions env var):
  - `PALM_METRIC_ENFORCE_APP_CHECK=true` enables strict Firebase App Check enforcement inside `createPalmMetricOrder` once reCAPTCHA v3 / App Check is registered for both the Customer Web App and Admin App in Firebase Console. Defaults to `false` so existing guest sessions remain functional immediately upon deployment.

## 4. Known Limitations & Recommended Next Steps
- **Firebase Emulator Live Verification**: Sandbox lacks a JVM (`java` binary absent), so Firebase Local Emulator Suite tests could not be executed in this container; all 20 backend tests ran against an isolated transactional adapter simulating Firestore read-before-write locks. Run `firebase emulators:exec` in a Java-equipped CI environment before production cutover.
- **Per-UID / IP Abuse Rate Limiting**: Transactional idempotency prevents duplicate order submission on retries, and `MAX_ORDER_ITEMS` / `MAX_ITEM_QUANTITY` bound payload sizes. Per-UID sliding-window rate limiting (e.g., Cloud Armor / Firebase App Check + sliding window counter in Firestore/Redis) is recommended as a follow-up layer prior to high-volume traffic.
- **Unseeded `/menu` Behavior**: `createPalmMetricOrder` validates strictly against authoritative Firestore `/menu/{productId}` documents. Ensure all active menu products exist in `/menu` on `palm-metric-app` before directing live checkout traffic to Stage 04E.
