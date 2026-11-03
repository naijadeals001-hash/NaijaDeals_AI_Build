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
