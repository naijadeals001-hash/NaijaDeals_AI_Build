# NaijaDeals Architecture Overview

Last verified against the repository: **2026-11-03** (HEAD `7590af5`). This document replaces the
earlier version that referenced commit `61b066ee` and a stash that no longer exists.

## Stack (verified from manifests and code)

| Layer | Technology |
| --- | --- |
| Framework | Next.js 14.2 (App Router) + React 18.3 + TypeScript |
| Styling | Tailwind CSS 3, custom tokens in `tailwind.config.ts`, `clsx`, lucide-react |
| Data | PostgreSQL + Prisma 6.19 (`prisma/schema.prisma`, 39 models, 19 enums, 5 migrations) |
| Auth | Custom cookie sessions; scrypt password hashing; SHA-256 token hash; `Session` table |
| Payments | `lib/payments/service.ts` with wallet, Paystack, Flutterwave and a test adapter gated by `isTestPaymentsEnabled` |
| Maps | Leaflet dependency + `drive-map.tsx`; no live map provider configured (UI says so) |
| Media | `sharp`, 43 public images |
| Tests | `tsx` suites (`scripts/*-tests.ts`) + Playwright/Chrome for browser QA |
| CI | `.github/workflows/ci.yml`: type-check, lint, build, PostgreSQL-service test suites, Docker build — **no deploy job** |

There is no `middleware.ts`; authorization is enforced per route and per page.

## Request flow

1. Client components call the typed `apiClient` (`lib/api-client.ts`).
2. Route handlers (`app/api/**/route.ts`) resolve the session cookie, hash the token and read the
   `Session` row, then call `requireUser` / `requireAdmin` / `requireAdminPermission` /
   `requireSuperAdmin` from `lib/auth/guard.ts`.
3. Services in `lib/services/core/` own transactions, state machines and ledger writes.
4. Sensitive mutations write `AdminAction` / `AuditLog` rows.

### Authorization model (2026-11-03)

- `isAdmin()` = actor `ADMIN` or role `admin`/`super_admin`.
- `hasAdminConsoleAccess()` = `isAdmin()` **or** any staff role (ops, finance, support, moderator).
- `requireAdminPermission(permission)` gates each admin capability via
  `lib/auth/permissions.ts`; `lib/auth/scope.ts` enforces country/city scope with
  `region_forbidden` errors.
- Role administration is super-admin only (`requireSuperAdmin`, `roles:write`).

## Data model

39 models across identity (User, Role, UserRole, Session), commerce (Vendor, Category, Product,
Variant, InventoryStock, Cart, Order, OrderItem, OrderStatusEvent), money (Wallet,
WalletTransaction, LedgerEntry, EscrowHold, EscrowEvent, Payment, WebhookEvent, Payout,
ReturnRequest), mobility/logistics (DriverProfile, Ride, RideEvent, Courier, Delivery,
TrackingEvent, SavedPlace), reputation/support (Review, Dispute, SellerApplication), governance
(AdminAction, AuditLog, SystemEvent) and addresses (Address, SavedItem).

Migrations: `20260605163319_core_commerce_engine` → `20261102173000_admin_region_scope`.

**No models exist yet for** restaurants/menus (NaijaEats), grocery (NaijaFresh), gigs, stays/
property, streaming media or AI conversations — those verticals are not functional.

## Routes

- 25 page routes: `/`, `/products`, `/product/[id]`, `/search`, `/cart`, `/checkout`,
  `/orders`, `/account`, `/wallet`, `/naijashop`, `/naijadrive`, `/naijaeats`, `/naijasend`,
  `/seller`, `/driver`, `/courier`, `/admin`, `/super-admin`, `/sell`, `/login`, `/register`,
  `/tracking/[id]`, `/business/[vertical]`, `/onboarding/[type]`, `/[slug]` (generic fallback).
- 70 API route handlers: auth, catalog/cart/checkout/orders, payments + webhooks, wallet/ledger,
  drive (quotes, rides, driver actions, places), deliveries/courier, seller, admin and
  super-admin.

## Module status (see `docs/audits/deepseek-module-capability-matrix.md`)

| Module | Status |
| --- | --- |
| NaijaShop | PARTIAL — catalog, cart, checkout, escrow, orders, seller tools; live payment providers unconfigured |
| NaijaDrive | PARTIAL — quotes, booking, dispatch, driver lifecycle, saved places, expiry sweeper; no live GPS/map |
| NaijaSend | PARTIAL — courier workflow for marketplace deliveries; parcel booking is a status page |
| NaijaPay | PARTIAL — wallet balance/ledger/holds read; admin payouts; no customer deposit/withdraw |
| NaijaEats / Fresh / Gigs / Stay / Stream / Aura AI | NOT STARTED — status/generic pages only |
| NaijaProperty | NOT STARTED — no model or route |

## Verification

- Isolated database `naijadeals_test` migrated + seeded; suites pass:
  marketplace **13/13**, admin security **19/19**, drive **28/28**; `tsc --noEmit` clean.
- Browser captures and tooling evidence: `docs/reference-and-tooling-evidence.md`,
  `docs/audits/`.

## Known technical debt

1. Ten `lib/services/*-service.ts` stub files (TODO-only) are exported by an unused index —
   dead surface that should be removed or wired.
2. No background queue/outbox; `startDriveSweeper` is an in-process timer.
3. No email/SMS provider, no live map provider, no image-generation endpoint wired.
4. Admin tables lack pagination, bulk actions and record-detail views (Phase 05 open).
5. No observability (metrics/traces/health endpoint) and no rate limiting.
6. Documentation drift is being corrected in this pass; four older documents were stale.
