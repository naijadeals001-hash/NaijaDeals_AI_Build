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
| Background jobs | BullMQ 6.7.3 over Valkey 9.1.3 (`lib/infra/queue.ts`); consumer `scripts/infra-worker.ts` |
| Cache | Valkey 9.1.3 (`lib/infra/cache.ts`) |
| Search | Meilisearch 1.56.2 (`lib/infra/search.ts`, `lib/infra/catalogue-index.ts`); Postgres remains authoritative |
| Object storage | S3-compatible SeaweedFS 4.53 (`lib/infra/storage.ts`) |
| Vectors | pgvector 0.8.7 on an isolated PostgreSQL 18 instance (`lib/infra/vectors.ts`) |
| Routing | OSRM 26.11.0 (`lib/infra/routing.ts`) |
| Observability | Prometheus 3.16.0 + Grafana 13.3.0; `app/api/health`, `app/api/metrics` |
| Tests | `tsx` suites (`scripts/*-tests.ts`) + Playwright/Chrome for browser QA |
| CI | `.github/workflows/ci.yml`: type-check, lint, build, PostgreSQL-service test suites, Docker build — **no deploy job** |

Infrastructure is optional at runtime: each `lib/infra/*` module reports itself unavailable when its
environment variable is absent, and the application falls back to its previous behaviour. That is why
CI and the preview build work without the Docker stack. Pinned versions and local operations:
`docs/infra/local-development-stack.md`; selection rationale: `docs/infra/open-source-and-mcp-audit.md`.

`middleware.ts` exists but does **not** authorise anything: it only issues the opaque `nd_visitor`
cookie that pins the homepage design assignment. Authorization is enforced per route and per page.

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

## Order closure, locking and physical custody (2026-11-12, commit `315f273`)

**One closure workflow.** Every paid or partially refunded order is closed through
`refundPayment` (`lib/payments/service.ts`). Admin `refunded`/`cancelled` actions
(`lib/services/core/admin.service.ts`) compute the remaining refundable amount from
`Order.totalKobo - Order.refundedKobo`, refund that amount, and never write a closing
status directly. A pending, lost or contradicted refund claim returns 409 instead of
closing around it. Unpaid admin cancellation shares the customer path
(`cancelUnpaidOrderTx`) so reservations, pending payments and uncollected deliveries
are handled together. Both admin order routes enforce `orders:write` and order region
scope; the service repeats the check when a session actor is supplied.

**Canonical lock order.** `Order -> Payment -> Delivery -> wallet rows`. Refunds,
completion, dispute resolution, courier updates, assignment, cancellation and seller
return receipt all take the order row lock first, then re-read what they validated.
Delivery and order status writes are compare-and-set, so a stale pre-lock read cannot
authorise a write. Checkout still locks the ACTIVE cart first; the checkout expiry
sweep locks the order before its payments.

**Physical custody on refund.** A full refund is a financial fact, not proof that goods
came back:

| Delivery state | Refund handling | Stock |
| --- | --- | --- |
| none / pending_assignment / assigned / pickup_started | cancel delivery, release courier | restored once |
| picked_up / in_transit / delivery_attempted / failed | keep status + courier, append custody tracking and audit | never restored by the refund |
| delivered | keep delivered history | never restored; seller return receipt handles it |
| returned | keep returned history | restorable when the caller requests it |
| cancelled (legacy) | unchanged | not treated as proof of custody |

A refunded order blocks further forward delivery transitions with `409 order_refunded`;
`returned`/`failed` remain allowed so operations can record recovery. Collected parcels
stay visible in the courier/operations queues.

**Seller return receipt.** Physical receipt and a durable `SystemEvent` refund intent
commit together; the refund itself runs outside that transaction. The intent carries a
deterministic attempt key (`return:<returnId>:<attempt>`), reuses PENDING/COMPLETED
attempts, and allocates a new attempt only after a definitive FAILED attempt released
its reservation. Restock is conditional (`ReturnRequest.restocked`), so retries cannot
double-restock, and a crash after the refund but before the return status update settles
from stored evidence without calling the provider again.

**Duplicate confirmations.** `confirmPayment` derives `duplicate` from whether its locked
transaction actually moved the payment row; the losing concurrent confirmation returns
`duplicate: true` and sends no second paid notification or affiliate conversion.

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
2. The drive sweeper is still an in-process timer. BullMQ is installed and verified, but the sweeper
   has not been migrated onto it, so two app instances would both still run it.
3. No email/SMS provider, no live map provider, no image-generation endpoint wired.
4. Admin tables lack pagination, bulk actions and record-detail views (Phase 05 open).
5. Metrics and a health endpoint now exist, but there is no rate limiting and no distributed tracing.
6. Documentation drift is being corrected in this pass; four older documents were stale.
7. `npm audit` reports 23 advisories in pre-existing tooling (eslint plugins, prisma config,
   browserslist, esbuild, `next`); the six packages added for infrastructure introduced none, and one
   advisory is critical.

## Corporate contact directory (2026-11-15)

`lib/data/contact-directory.ts` is the single typed source of the twelve
published contact addresses. Components import `contactAddress(key)` /
`mailtoFor(key, {subject, body})`; no page writes an address literal, and
`scripts/contact-directory-tests.ts` fails if one appears outside the module.
The service-registration address lives in `lib/data/internal-contacts.ts`
instead, so it cannot reach a browser bundle; the same suite asserts that no
client component imports it and that no built chunk contains it.

All thirteen addresses are delivery aliases of the main mailbox
`office@naijadeals.com`. They are contact addresses only — not separate
mailboxes, employee accounts, administrator identities or application
permissions — and none is used for authentication or as a recipient identity
for a user.

| Key | Address | Use |
| --- | --- | --- |
| office | office@naijadeals.com | Main office and corporate correspondence |
| hello | hello@naijadeals.com | General enquiries |
| support | support@naijadeals.com | Customer support, orders and help |
| accounts | accounts@naijadeals.com | **Internal only, separate module** (`lib/data/internal-contacts.ts`): hosting, Cloudflare R2, Backblaze B2 and other service registrations |
| billing | billing@naijadeals.com | Invoices and subscription billing |
| payments | payments@naijadeals.com | Payment enquiries, refunds and payouts |
| partners | partners@naijadeals.com | Vendors, restaurants, artists and business partners |
| drivers | drivers@naijadeals.com | Driver and courier enquiries |
| legal | legal@naijadeals.com | Legal correspondence and the "Terms of Service" links where no terms page exists |
| privacy | privacy@naijadeals.com | Privacy and personal-data requests |
| security | security@naijadeals.com | Security reports |
| abuse | abuse@naijadeals.com | Fraud, scams and prohibited content |
| careers | careers@naijadeals.com | Recruitment |

`accounts` is not part of the public `ContactKey` union at all. It belongs in
infrastructure documentation and service-registration forms only, never in the
public footer; `ACCOUNTS_CONTACT` and `BILLING_CONTACT` are the exports for
those fields.

### Outbound email state

The only email transport in this build is `EmailCaptureTransport`
(`lib/notifications/transports.ts`): it writes a privacy-minimised local record
and never contacts a provider. There is **no verified outbound sender**, so no
`From` address is asserted anywhere. `deliverNotification` attaches
`replyTo: support@naijadeals.com` to EMAIL messages, which the capture record
stores; a real provider must be configured and the domain/sender verified
before any address is used as a sender. `lib/data/contact-directory.ts` is the
one place to change if the owner later designates a different Reply-To.
