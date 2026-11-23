# PALM METRIC — STAGE 04M.1: ARCHIVE MANIFEST

**Package Filename:** `palm-metric-stage04m1-runnable.zip` (generated at workspace root `/app/applet/palm-metric-stage04m1-runnable.zip`)  
**Packaging Script:** `scripts/make-zip.mjs`  
**Package Scope:** Complete runnable `/app/applet` Firebase Spark workspace (Customer App Stage 04K/04M checkout & tracker + local integrated `AdminOrderRequestsPage` review/approval/inventory module, Spark security rules, blueprint, test suites, and Stage 04E–04M.1 verification reports).  
**Important External Scope Note:** Because `tashflow/Palm-Metric` (`c8ed343`) and `tashflow/palm-metric-admin-` (`f432f1a`) on GitHub remain at Stage 04I and Stage 04G respectively (unintegrated), this archive packages the local `/app/applet` Spark implementation rather than claiming cross-repository production integration.

---

## 1. Exclusion Rules Enforced (`scripts/make-zip.mjs`)

Excluded from archive to keep package clean, portable, and free of secrets or build artifacts:
- Directories: `node_modules/`, `dist/`, `.git/`, `.firebase/`, `tmp/`, `.agents/`, `.aistudio/`, `.github/`, and any other dot-directory.
- Files/Extensions: `*.zip`, `.env*`, and any filename containing `private`.

---

## 2. Reconciled Archive Composition (**106 Files Total**)

Breakdown across categories (exact counts verified before packaging):
- **Core Config & Project Files (13):** `.gitignore`, `bun.lock`, `firebase-applet-config.json`, `firebase-blueprint.json`, `firebase.json`, `firestore.rules`, `firestore.spark.rules`, `index.html`, `metadata.json`, `package.json`, `security_spec.md`, `tsconfig.json`, `vite.config.ts`
- **Legacy Functions Reference Source (9):** `functions/package-lock.json`, `functions/package.json`, `functions/tsconfig.json`, `functions/src/index.ts`, `functions/src/orderCreation.ts`, `functions/src/orderPricing.ts`, `functions/src/orderValidation.ts`, `functions/src/types.ts`, `functions/src/__tests__/orderEngine.test.ts` *(preserved untouched per Spark migration requirements)*
- **Verification & Build Scripts (7):** `scripts/audit-rules.mjs`, `scripts/make-zip.mjs`, `scripts/stage04d.test.ts`, `scripts/stage04k.test.ts`, `scripts/stage04l.test.ts`, `scripts/stage04l1.test.ts`, `scripts/stage04m.test.ts`
- **Public & Branded Static Assets (12):** `public/firebase-messaging-sw.js`, `public/palm-metric.html`, plus 10 files in `public/assets/aistudio/` (`file_00000000feb482109f398277360d668c_b4ac5f5f.png`, `IMG-20261021-WA0006_53f18f59.jpg`, and 8 additional stored `IMG*` / `Screenshot*` files)
- **Bundled Vite Image Assets (9):** 9 JPG assets inside `src/assets/images/` (`coffee_*`, `drink_*`, `food_*`, `hero_*`, `story_*`)
- **Application TypeScript/CSS Source (`src/`, 37):** `src/App.tsx`, `src/index.css`, `src/main.tsx`, `src/types.ts`, `src/hooks/useGeolocation.ts`, `src/data/i18n.ts`, `src/data/menu.ts`, 16 components (`src/components/*.tsx` including `AdminOrderRequestsPage.tsx`, `CheckoutPage.tsx`, `OrderTrackerPage.tsx`, etc.), and 14 library modules (`src/lib/*.ts` including `adminAuth.ts`, `adminOrderRequests.ts`, `authoritativePricing.ts`, `firestoreSync.ts`, `whatsapp.ts`, etc.)
- **Stage Reports (19):** `STAGE_04E_REPORT.md` through `STAGE_04M_TEST_REPORT.md` (15 prior reports) + 4 Stage 04M.1 authoritative reports (`STAGE_04M1_FINAL_RECONCILIATION_REPORT.md`, `STAGE_04M1_REPOSITORY_COMPATIBILITY_REPORT.md`, `STAGE_04M1_TEST_VERIFICATION_REPORT.md`, `STAGE_04M1_ARCHIVE_MANIFEST.md`)

`13 + 9 + 7 + 12 + 9 + 37 + 19 = 106 files` total (exact match to workspace non-excluded file tree).

---

## 3. Verification Procedure & External SHA-256 Digest Note

- Because `STAGE_04M1_ARCHIVE_MANIFEST.md` is itself packaged inside `palm-metric-stage04m1-runnable.zip`, the final outer archive SHA-256 digest is written immediately after zip creation to sibling checksum file `palm-metric-stage04m1-runnable.zip.sha256` and verified with `sha256sum -c` without mutating the verified archive.
- Post-creation validation steps executed:
  1. Generate archive via `node scripts/make-zip.mjs` -> confirm **106 files** inside `palm-metric-stage04m1-runnable.zip`.
  2. Write `palm-metric-stage04m1-runnable.zip.sha256` and confirm `sha256sum -c` passes.
  3. Extract archive to an isolated `/tmp` verification directory, verify entry count and zero excluded folders/secrets (`node_modules`, `dist`, `.git`, `.env*`, `*.zip`).
  4. Verify dependency resolution (`npm ci` / `npm install` or offline workspace package check), `npm run lint` (`tsc --noEmit`), `npm run build` (`vite build`), `node scripts/audit-rules.mjs`, and all 69 tests across `scripts/stage04{d,k,l,l1,m}.test.ts` inside the extracted copy.
