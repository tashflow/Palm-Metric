import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');

const rules = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

// Static security audit of firestore.rules
assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/, 'Global default-deny catch-all present');
assert.ok(!rules.includes('sign_in_provider is string'), 'Must NOT contain anonymous sign_in_provider admin bypass');
assert.ok(rules.includes("sign_in_provider != 'anonymous'"), 'Admin helpers must reject anonymous providers');
assert.ok(rules.includes('request.auth.token.email_verified == true'), 'Admin checks must require email_verified == true');

// Orders PII isolation audit
const ordersMatch = rules.match(/match \/orders\/\{orderId\} \{[\s\S]*?\n    \}/);
assert.ok(ordersMatch, '/orders/{orderId} block exists');
const ordersBlock = ordersMatch[0];
assert.ok(!ordersBlock.includes('allow get: if isValidId(orderId);'), 'Orders get must NOT be open by orderId alone');
assert.ok(!ordersBlock.includes('allow list: if true;'), 'Orders list must NOT be open');
assert.ok(
  ordersBlock.includes('existing().customerUid == request.auth.uid'),
  'Orders get restricts customer access to owner UID',
);
assert.ok(
  ordersBlock.includes('resource.data.customerUid == request.auth.uid'),
  'Orders list restricts query access to owner UID',
);
assert.ok(
  !ordersBlock.includes('exists(') && !ordersBlock.includes('get('),
  'Orders block must not invoke get/exists directly inside list path',
);

// Canonical order validation & Stage 04E server-only creation audit
assert.ok(
  ordersBlock.includes('allow create: if false;'),
  'Stage 04E blocks direct client order writes (must use createPalmMetricOrder Cloud Function)',
);
assert.ok(
  rules.includes('match /idempotencyKeys/{keyId}'),
  'idempotencyKeys collection block exists',
);
assert.ok(
  rules.includes('allow read, write: if false;'),
  'idempotencyKeys denies all direct client reads and writes',
);
assert.ok(
  rules.includes("'subtotal', 'totalBill', 'currency', 'orderType'") &&
    rules.includes("'pricingVersion', 'createdAt', 'updatedAt'"),
  'isValidOrderUpdate preserves immutable Stage 04E financial & pickup metadata fields',
);
assert.ok(
  rules.includes("data.status in ['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled']"),
  'isValidOrderUpdate restricts status enum cleanly',
);

// All active collections covered in rules & blueprint
for (const col of [
  'billboards',
  'menu',
  'categories',
  'productCustomizations',
  'settings',
  'mediaAssets',
  'orders',
  'idempotencyKeys',
  'reports',
  'fcmTokens',
  'admins',
]) {
  assert.ok(rules.includes(`match /${col}/`), `Collection /${col} covered in firestore.rules`);
}

for (const bpPath of [
  '/billboards/{billboardId}',
  '/menu/{itemId}',
  '/categories/{categoryId}',
  '/settings/{settingId}',
  '/productCustomizations/{productId}',
  '/orders/{orderId}',
  '/idempotencyKeys/{keyId}',
  '/reports/{reportId}',
  '/fcmTokens/{tokenId}',
  '/admins/{adminId}',
]) {
  assert.ok(bpPath in blueprint.firestore, `Path ${bpPath} documented in firebase-blueprint.json`);
}

console.log('PASS: Static security & schema audit passed for firestore.rules and firebase-blueprint.json.');

