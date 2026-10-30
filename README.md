# NaijaDeals Marketplace

NaijaDeals is a Next.js 14 + TypeScript + Prisma/PostgreSQL marketplace for Nigerian
buyers, sellers, couriers and administrators. It is built inside the existing
NaijaDeals ecosystem and keeps the original NaijaDeals branding and content.

The marketplace is API-driven: catalog, cart, checkout, payments, orders, escrow,
delivery, seller tools and admin tools all read and write real database records.
There are no sample orders, fabricated reviews, invented revenue figures or fake
tracking events in the seed data.

## What is implemented

- Credential authentication with scrypt password hashing and database-backed sessions.
- Server-enforced RBAC for customer, seller, courier and admin routes.
- Catalog with categories, variants, stock, real review aggregates and search.
- Cart with saved-for-later, stock validation and variant selection.
- Multi-vendor checkout with server-calculated totals and atomic stock reservation
  (`UPDATE ... WHERE quantity - reserved >= requested`), so concurrent buyers cannot
  oversell limited stock.
- Order lifecycle, customer cancellation, returns, review submission and completion.
- Payment service with server-side verification, idempotent duplicate callbacks,
  failed-payment handling, refunds, escrow holds and wallet ledger entries.
- Payment methods are only listed when actually configured: Paystack, Flutterwave,
  and the NaijaPay wallet. A clearly-labelled local test provider is available only
  when `ENABLE_TEST_PAYMENTS=true` and `NODE_ENV !== "production"`.
- Seller dashboard: products, stock, orders, fulfilment states, returns, payouts.
- Courier dashboard: assigned deliveries, pickup, transit, delivered and failed states.
- Admin dashboard: orders, seller applications, vendors, products, payments, couriers,
  delivery assignment, payouts and audit trail.
- Honest configuration states for NaijaEats, NaijaSend and other ecosystem verticals:
  unconfigured services say so instead of showing dead buttons or invented activity.
- Ecosystem homepage and `/products` grid with original generated artwork for every
  module card, whole-card links, mobile bottom navigation and honest live/setup labels.
  See `docs/ecosystem-delivery-tracker.md` for module-by-module status.

## Ecosystem artwork

All public module and catalogue artwork is generated from source in this repository:

```powershell
npm run art:generate
```

The scripts write `public/generated/*.svg` and `public/products/*.svg` and use no
network access or third-party assets.

## Languages, country and currency

The header carries an accessible language/country/city switcher. The shared shell,
homepage and products experience are translated into:

- English (`en`)
- Swahili (`sw`) — Kiswahili
- Arabic (`ar`) — العربية, rendered right-to-left

Selection is stored in `nd_lang`, `nd_country` and `nd_city` cookies, validated on the
server and applied to `<html lang dir>`. Only languages with a complete shared-string
set are offered; commerce pages, checkout and admin copy remain English until they are
translated. Prices are always charged in NGN kobo today, and the switcher says so
instead of showing a converted figure without an FX source.

Verify with:

```powershell
$env:QA_BASE_URL="http://localhost:3100"
npm run qa:locale
```

## Local setup

Requirements: Node.js 20+, PostgreSQL 14+.

```powershell
npm install
Copy-Item .env.example .env
```

Set `DATABASE_URL` in `.env`, then create the database and apply migrations:

```powershell
npx prisma migrate deploy
npx prisma generate
npm run prisma:seed
```

Start the app:

```powershell
npm run dev
```

The default URL is `http://localhost:3000`. If another service already uses that
port, use a different one:

```powershell
npm run dev -- -p 3100
```

Production preview:

```powershell
npm run build
npm run start -- -p 3100
```

## Development fixtures

`npm run prisma:seed` resets marketplace transaction data and recreates development
fixtures. It creates **no** orders, payments, reviews or revenue.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@naijadeals.local` | `AdminPass123!` |
| Seller (Ikeja Mobile Hub) | `seller@naijadeals.local` | `SellerPass123!` |
| Seller (Yaba Home & Living) | `seller2@naijadeals.local` | `SellerPass123!` |
| Courier | `courier@naijadeals.local` | `CourierPass123!` |
| Customer | `customer@naijadeals.local` | `CustomerPass123!` |

The customer account has a **₦25,000 local test wallet balance** (2,500,000 kobo)
so the wallet payment path can be exercised locally. This is a development fixture,
not real money and not a claim of live wallet funding.

Seeded products use original SVG artwork in `public/products/`.

## Configuration states

The UI reports providers as configured only when their server-side credentials are
present. Unconfigured providers are hidden or explicitly labelled as not configured.

| Capability | Environment variables | Behaviour when missing |
| --- | --- | --- |
| Paystack | `PAYSTACK_SECRET_KEY` | Method not offered; webhook returns not configured |
| Flutterwave | `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH` | Method not offered; webhook rejected |
| NaijaPay wallet | Database wallet/ledger (no external key) | Available to signed-in customers |
| Local test payments | `ENABLE_TEST_PAYMENTS=true`, non-production | Disabled; never available in production |
| Session cookie | `SESSION_COOKIE_NAME` (default `naijadeals.session`) | Default name used |
| App URL / Origin checks | `NEXT_PUBLIC_APP_URL` | Same-origin checks use request origin in development |

Payments are only marked paid after the server verifies the provider response or a
signed webhook. Duplicate callbacks are recorded in `WebhookEvent` and do not
double-credit orders.

## Verification

Type and build checks:

```powershell
npm run type-check
npm run build
npm run lint
```

End-to-end marketplace tests (requires a running local server):

```powershell
npx prisma db seed
$env:ENABLE_TEST_PAYMENTS="true"
npm run dev -- -p 3100
```

In a second terminal:

```powershell
$env:TEST_BASE_URL="http://localhost:3100"
npm run test:marketplace
```

The suite covers:

1. Public catalog, categories and storefront pages.
2. Authentication, roles and server-side RBAC.
3. Variant products requiring an explicit option (no double stock pool).
4. Full customer purchase, server-verified payment and idempotent duplicate callback.
5. Seller product creation, fulfilment, courier delivery and escrow release.
6. Seller onboarding, admin approval and vendor access.
7. Failed wallet payment, unpaid order state and stock release on cancellation.
8. Concurrent checkout against a one-unit product (one success, one 409).
9. Paid cancellation, refund and exactly-once restock.
10. Delivery failure and retry through to delivered.
11. Cross-tenant and unauthorized access rejection.
12. Webhook signature rejection when invalid or unconfigured.
13. Mobile and accessibility shell markers.

Visual QA:

```powershell
$env:QA_BASE_URL="http://localhost:3100"
npm run qa:visual
```

Ecosystem shell smoke test (routes, artwork, card navigation, login return):

```powershell
$env:QA_BASE_URL="http://localhost:3100"
npm run qa:ecosystem
```

Visual QA uses local Chrome through `playwright-core` and runs seven passes: public pages
anonymously, customer pages while signed in, seller/courier/admin dashboards while signed
in, and the role dashboards again anonymously to prove they redirect to `/login`. It checks
mobile, tablet and desktop widths for HTTP status, empty rendering, horizontal overflow,
broken images, console errors and broken internal links, and writes screenshots plus a
report to `qa-artifacts/`.

Persistence after restart:

```powershell
node scripts/verify-persistence.mjs --out qa-artifacts/persistence-before.json
# stop and restart the app
node scripts/verify-persistence.mjs --out qa-artifacts/persistence-after.json
node scripts/verify-persistence.mjs --compare qa-artifacts/persistence-before.json qa-artifacts/persistence-after.json
```

The comparison fails if any admin count or recorded order ID changes across the restart.

## Local vs live verification

- **Verified locally:** migrations, seed, type-check, production build, marketplace
  test suite, authenticated visual QA, persistence across a server restart, and the
  running preview server.
- **Not verified live:** no production deployment was performed. Real Paystack,
  Flutterwave, SMS/email, maps, storage and delivery-provider integrations require
  credentials and provider-side webhook configuration that are not present in this
  environment. They remain honest "not configured" states.

The verification suite creates real rows in the local database while it runs. Run
`npm run prisma:seed` afterwards to return the preview to fixture-only state.

## Security notes

- Secrets belong in `.env` or platform secret storage only. `.env` is not committed.
- Session cookies are HTTP-only, same-site `lax`, and secure in production.
- State-changing API routes require a matching `Origin`.
- Admin and seller pages are gated server-side as well as in the UI.
- Prices are stored as integer kobo for NGN; other currencies use their correct minor
  units. The server recalculates every total and never trusts client amounts.
- `npm audit fix --force` is intentionally not run because it proposes semver-major
  framework upgrades.
