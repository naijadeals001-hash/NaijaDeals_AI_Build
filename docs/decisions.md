# NaijaDeals Decision Log

## D-001: Money Representation (2026-11-01)
- **Decision:** All monetary amounts use integer kobo (NGN minor units), no floating point.
- **Rationale:** Prevents floating-point precision errors in financial calculations; enables server-side ledger conservation checks.
- **Impact:** `priceKobo`, `totalKobo`, `escrowFeeKobo`, `commissionKobo`, `refundedKobo`, `availableKobo`, `heldKobo` all `BigInt` in Prisma; `koboToNaira()` converter in `api-client.ts`.
- **Related:** No cross-currency balancing; all amounts denominated in NGN.

## D-002: Honest UI / No Simulated Live Data (2026-11-01)
- **Decision:** Every "setup required" status page must explicitly name the missing provider, approval, or operational data needed to go live. No fake/mocked live data anywhere in the UI.
- **Rationale:** Maintains trust; users understand exactly what is vs. not connected.
- **Impact:** `ecosystem.ts` `Vertical.status` ("live" | "setup"); `ModuleCard` badge color differs; `ProductsPage` StatusNote components; all verticals in `ecosystem-home.tsx` `ModuleCard` show accurate status.
- **Verification:** Inspect `components/sections/ecosystem-home.tsx` `ModuleCard` and `StatusNote`; inspect `lib/data/ecosystem.ts` vertical definitions.

## D-003: Landmark-Based Routing (NaijaDrive) (2026-11-01)
- **Decision:** NaijaDrive uses predefined Lagos landmarks/placeIds for pickup/dropoff; no GPS coordinates sent to client or used for booking. Fare quotes use server-computed road-distance from landmark map.
- **Rationale:** Nigerian addressing is unreliable; landmarks are memorable and bookable; prevents invented addresses.
- **Impact:** `lib/config/drive.ts` with `DRIVE_CITY`, `VEHICLE_CLASSES`, `findPlace()`, `nearestPlace()`; `components/functional/drive-page.tsx` `PlacePicker`; `ApiRide` has `pickupLabel`, `dropoffLabel` (not raw lat/lng); `RideTimeline` shows route labels not coordinates.
- **Verification:** Inspect `lib/config/drive.ts` and `components/functional/drive-place-picker.tsx` if it exists.

## D-004: Single Account / Unified Identity (2026-11-01)
- **Decision:** One `User` model serves all ecosystem verticals. `actorType` (CUSTOMER|VENDOR|COURIER|DRIVER|ADMIN|SYSTEM) and `roles` determine access. No separate user stores per vertical.
- **Rationale:** Single sign-on; shared wallet; consistent identity across shop/rides/send; simpler RBAC.
- **Impact:** `User` model has `actorType`, `roles`, `vendors`, `carts`, `orders`, `wallets`, `rides`, `driverProfile`, `courier`, etc.; `primaryRole()` in `lib/auth/session.ts` derives from actorType + roles; all pages use `getSessionUser()` → `toPublicSessionUser()`.
- **Verification:** Inspect `prisma/schema.prisma` `User` model and `lib/auth/session.ts`.

## D-005: Escrow 1% Fee (2026-11-01)
- **Decision:** Checkout charges a 1% escrow fee on order total. Funds held until delivery confirmation. Fee disclosed at checkout.
- **Rationale:** Buyer protection; seller guarantees; platform revenue.
- **Impact:** `Order` model has `escrowFeeKobo BigInt @default(0)`; `CheckoutResult` includes `escrowFeeKobo`; `EscrowHold` model with `status` enum; `TrustSection` in homepage mentions escrow; `koboToNaira(order.escrowFeeKobo)` in checkout.
- **Note:** Reported as "existing unverified policy" in Phase 07 playbook; do not silently change or treat as approved without documentation.

## D-006: Admin Control Center Unification (2026-11-01)
- **Decision:** Single `/admin` and `/super-admin` both render `AdminDashboard` component. Super-admin has full access; admin has scoped permissions via RBAC.
- **Rationale:** Avoids duplicate systems; centralized operational control; shared UI reduces maintenance.
- **Impact:** `app/admin/page.tsx` and `app/super-admin/page.tsx` both import `AdminDashboard`; `isAdmin(user)` check on `super-admin`; `Control Center` header text differs contextually.
- **Verification:** Inspect `app/admin/page.tsx` → redirects if `!isAdmin`; `app/super-admin/page.tsx` → redirects if `!user` or `!isAdmin`.

## D-007: Swahili + Arabic i18n First (2026-11-01)
- **Decision:** Ship three languages from day one: English (en), Swahili (sw), Arabic (ar) with full dictionary coverage. RTL support for Arabic.
- **Rationale:** African market reach; Arabic-speaking users; baseline multilingualism.
- **Impact:** `lib/i18n/dictionary.ts` with `LANGUAGES` const + `en`, `sw`, `ar` dictionaries; `DICTIONARIES` export; `LocaleProvider`; `isLanguageCode()`, `isRtl()` utils; all pages use `useLocale()` and `t()`.
- **Verification:** Inspect `lib/i18n/dictionary.ts` full dictionary coverage and `LANGUAGES` array.

## D-008: Prisma Over Raw SQL (2026-11-01)
- **Decision:** All database access through Prisma Client; no raw SQL queries in application code.
- **Rationale:** Type safety, migrations, schema versioning, avoid SQL injection.
- **Impact:** `prisma/` directory with `schema.prisma`; `@prisma/client` generated; `lib/prisma.ts` exports `prisma` instance; all CRUD operations through Prisma (service layers, dashboards, API routes).
- **Verification:** Inspect `lib/prisma.ts` and import patterns across codebase.

## D-009: Session Cookie Security (2026-11-01)
- **Decision:** Session cookie: `httpOnly`, `sameSite: lax`, `secure: production only`, `path: /`, `maxAge: 30 days`. Token hashed with SHA-256 before DB comparison.
- **Rationale:** XSS protection (httpOnly), CSRF reduction (sameSite/lax), HTTPS-only in prod, short enough to limit hijack window.
- **Impact:** `lib/auth/session.ts` `sessionCookieOptions()`, `hashToken()`, `createSession()`, `getSessionUser()`.
- **Verification:** Inspect `lib/auth/session.ts` lines 18-26.

## D-010: Client-Side API Abstraction (2026-11-01)
- **Decision:** All server communication through `lib/api-client.ts` with typed responses; no direct fetch or Next.js `rewrite`/`redirect` logic in components beyond navigation.
- **Rationale:** Single point of error handling, authentication injection, request formatting, consistent types.
- **Impact:** `lib/api-client.ts` with `apiClient` object exposing all endpoints; `ApiRequestError` class with `status`, `code`; `requestJson()` with credentials: "same-origin"; `withParams()` for query strings.
- **Verification:** Inspect `lib/api-client.ts` full content.

# Decision Gates

| Gate | Status | Date |
|------|--------|------|
| D-001 | ✅ Verified | 2026-11-01 |
| D-002 | ✅ Verified | 2026-11-01 |
| D-003 | ✅ Verified | 2026-11-01 |
| D-004 | ✅ Verified | 2026-11-01 |
| D-005 | ⚠️ Unverified policy | 2026-11-01 |
| D-006 | ✅ Verified | 2026-11-01 |
| D-007 | ✅ Verified | 2026-11-01 |
| D-008 | ✅ Verified | 2026-11-01 |
| D-009 | ✅ Verified | 2026-11-01 |
| D-010 | ✅ Verified | 2026-11-01 |

## Open decision — refund fee treatment (2026-11-03)

The reported 1% escrow fee is an existing but unverified policy. The following is unresolved and must
not be implemented by assumption:

- whether the 1% fee is returned proportionally on a partial refund, retained, or varied by refund
  reason (customer cancellation, seller fault, dispute, failed delivery);
- how provider processing fees are treated separately from the platform fee;
- whether repeated partial refunds recalculate the fee per attempt or once for the order.

Current implementation reverses the platform commission proportionally with each refunded kobo; this
is ledger mechanics, not an approved fee policy. A business decision is required before changing it.

## NaijaPay production-readiness decisions (2026-11-05, owner-directed)

- **SYSTEM-wallet −₦25,000 delta — RESOLVED with audited correction.** Forensics
  (scripts/system-wallet-forensics.cjs): the seed posted the fixture-funding
  DEBIT (SEED-WALLET-FIXTURE, ₦25,000) to the SYSTEM wallet ledger but stored a
  cached balance that never reflected it; every subsequent entry balances. The
  PREPARED Phase-07 adjustment PHASE07-FIXTURE-FUNDING-20261103 was applied
  under the owner's explicit authorization via the audited, idempotent
  ledger-adjustment service (wallet CREDIT ₦25,000 + FIXTURE_EQUITY contra
  DEBIT; scripts/phase07-apply-adjustment.ts). Reconciliation now reports 0
  mismatched wallets, 0 unbalanced transactions (the check now balances wallet
  LedgerEntry lines together with AccountPosting lines across the two books).
- **Transaction PIN — decision:** PIN is NOT required while transfers run on a
  TEST-classified database. A PIN challenge becomes REQUIRED before any
  LIVE money movement (LIVE database classification + live flags), with
  hashed-at-rest storage and rate-limited verification. Rationale: the
  test-funds boundary already makes live money impossible; adding a PIN to
  test-only flows adds friction without safety until live activation.
- **NaijaGigs WIP — ISOLATED, not finished:** all uncommitted gigs work
  (tracked modifications + untracked directories) moved to
  stash@{0} ("naijagigs WIP isolated for clean production build"); restore with
  `git stash pop stash@{0}`. Verified after isolation: full `tsc --noEmit`
  clean and `npm run build` clean (qa-artifacts/pay-build-clean.log).

## Decision: Aura AI uses a single provider abstraction with declared capabilities

- **Context:** Aura must be useful without claiming abilities it lacks. Different
  models differ on streaming, tool calling, image and audio support.
- **Decision:** `lib/aura/provider.ts` is the only place a model is called. It
  exposes streaming, tool calls, cancellation, timeouts and bounded retries, and
  publishes a `capabilities` object that the UI and admin panel read. Anything
  false there is never advertised. Tools are server-validated and derive identity
  from the session, never from model output.
- **Impact:** Adding a provider means implementing one function. The product
  cannot advertise a capability that was not implemented and tested.
- **Verification:** `scripts/aura-orchestration-test.ts` asserts `webAccess`,
  `imageInput` and `streaming` flags, and exercises the live model.

## Decision: order-first locking and refund-derived order closure (2026-11-12)

- **Context:** Admin closures handled only `paymentStatus: "paid"`; a partially refunded
  order could be moved to `refunded` by a status edit without refunding the balance,
  restoring stock twice, or cancelling a collected parcel. Courier, assignment and
  refund paths also locked Payment/Delivery and Order in different orders.
- **Decision:** `Order -> Payment -> Delivery -> wallet rows` is the only lock order.
  Every paid closure calls `refundPayment` for `totalKobo - refundedKobo`; pending or
  contradicted claims fail closed. Delivery/order transitions are compare-and-set.
  Full refunds cancel only uncollected deliveries; collected parcels retain status,
  courier and custody events. Seller return receipt uses a persisted refund intent with
  deterministic attempts (no new migration; `SystemEvent` is the durable record).
- **Impact:** `Order.refundedKobo` remains a reservation cap; settled refunds are still
  the `COMPLETED` `Refund` rows. No fee, recovery-charge or return-fee policy is added.
- **Verification:** `scripts/closure-lock-custody-acceptance.ts` on
  `naijadeals_closure_lock_test` (13 checks, 0 failures, reconciliation CLEAN) and
  `scripts/checkout-refund-delivery-acceptance.ts` (10 checks, 0 failures).

## Open decision (owner approval required) — refund/recovery and reverse custody

Implemented behaviour is safe but not a final business policy. The following are
concrete recommendations; none is approved by existing code:

1. **Custody record.** Uncollected deliveries are cancelled and restocked; collected
   (`picked_up`/`in_transit`/`delivery_attempted`/`failed`) deliveries remain open with a
   refund custody event and no stock restoration. Recommended: operations owns a
   recovery queue keyed by the existing delivery and tracking history. Do not delete or
   rewrite the delivery to close the refund.
2. **Return statuses.** Recommended: if the owner wants first-class reverse logistics,
   add `return_requested` and `return_in_progress` delivery states in a versioned
   migration, with `picked_up/in_transit -> return_requested -> return_in_progress ->
   returned`. Until then, `returned` plus the existing tracking/custody events is the
   recovery trail. No backfill is proposed for historical rows.
3. **Who pays the return leg.** The current code invents no fee and charges no one.
   Recommended owner decision: the platform absorbs the return leg for a full refund
   caused by seller/platform fault, and the existing delivery fee treatment is not
   changed. This needs an approved policy before any deduction or surcharge.
4. **Non-recoverable parcel.** Recommended: no automatic stock restoration. Operations
   records the loss and a finance-approved inventory adjustment is proposed separately;
   the refund must not be reversed to compensate.
5. **Return receipt evidence.** Recommended: seller/warehouse receipt is the only event
   that restocks (already implemented as one conditional restock). Courier `returned`
   alone should not restock until a future receipt policy is approved.
6. **Return window and refund timing.** The existing 14-day window and refund-at-receipt
   behaviour are retained; changing either is a business decision.
7. **Legacy audit (not executed).** Before any future migration, operations should
   review deliveries that are `cancelled` but have `picked_up`/`in_transit` tracking
   events, and any fully refunded order whose stock was restored after collection. This
   agent did not query `naijadeals_core` or mutate historical records.

## Decision: consequential Aura actions are bound to a reviewed proposal hash

- **Context:** An assistant that can prepare payments is a prompt-injection target;
  a conversational "yes" must not authorise money.
- **Decision:** `prepare_transfer` stores the proposal and an input hash. The
  review card carries that hash; `/api/aura/confirm` requires it back. Mismatch,
  expiry or a different user is refused, and the underlying transfer uses one
  idempotency key for the proposal's lifetime.
- **Impact:** The model cannot approve its own action, and a proposal cannot be
  silently altered between review and execution.
- **Verification:** orchestration suite — wrong hash, wrong user, correct hash,
  repeat confirm.
