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
- NaijaDrive: Lagos ride booking with a fare quote locked at request, cash or NaijaPay
  wallet payment, one active ride per rider, single-driver acceptance, real trip events,
  driver release, cancellation with hold refund, and a driver board at `/driver`.
  Booking uses a live OpenStreetMap map plus an offline landmark search with Lagos
  aliases, and the fare is itemised before you book. See "NaijaDrive specifics" below.
- Admin dashboard: orders, seller applications, vendors, products, payments, couriers,
  rides, delivery assignment, payouts and audit trail.
- Honest configuration states for NaijaEats, NaijaSend and other ecosystem verticals:
  unconfigured services say so instead of showing dead buttons or invented activity.
- Ecosystem homepage and `/products` grid with the owner's real Nigerian photography on
  every module card, whole-card links, mobile bottom navigation and honest live/setup
  labels. See `docs/ecosystem-delivery-tracker.md` for module-by-module status.

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
| Driver (Comfort) | `driver@naijadeals.local` | `DriverPass123!` |
| Driver (Economy) | `driver2@naijadeals.local` | `DriverPass123!` |
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
npm run test:drive
```

The marketplace suite covers:

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

The NaijaDrive suite covers:

1. Public fare quotes in integer NGN kobo and rejection of invalid routes/classes.
2. An anonymous rider cannot request a ride.
3. A wallet ride holds the fare; a duplicate active request is rejected.
4. Cross-account read/cancel is refused and non-drivers cannot use driver endpoints.
5. Two drivers racing for one ride produce exactly one winner.
6. Invalid trip transitions are rejected.
7. Trip completion releases the wallet hold exactly once; duplicate completion does not double-pay.
8. Cancellation restores the hold; duplicate cancel is safe.
9. Cash stays due until the driver records collection; recording twice is safe.
10. A driver can release an accepted ride back to the queue.
11. Non-admins cannot use admin ride endpoints; an administrator can cancel a live ride with refund.

### NaijaDrive specifics

These are deliberate choices, not gaps to be discovered later:

- **The map is real but never load-bearing.** Tiles come from OpenStreetMap via Leaflet.
  If four tiles fail, the map replaces itself with a vector diagram of the same two
  landmarks, says so, and offers Retry. "Low data" mode skips tiles entirely and is
  remembered per device. Booking and pricing never depend on the map.
- **The line between the pins is not a route.** It joins the two landmarks in a straight
  dashed line and the caption says exactly that. There is no turn-by-turn navigation,
  because no routing engine is configured.
- **Search is local.** Every Lagos landmark ships with the app along with the names people
  actually type (`CV`, `VI`, `Tejuosho`, `Mile 2`). No geocoding call, no invented street
  address, and it works offline.
- **Location snaps, it does not pretend.** "Use my location" takes real device coordinates
  and selects the nearest bookable landmark, stating the real distance. Outside Lagos it
  refuses and changes nothing.
- **Fares are itemised before booking.** Base, distance, time and the ₦50 rounding
  adjustment always sum to the quoted total, and the server recomputes the fare when the
  ride is requested.
- **No fabricated ride state.** There is no fake driver movement, no invented PIN and no
  simulated tracking. The rider sees server events, the driver's real plate and a `tel:`
  link, and the page says when a driver released the ride back to the queue.

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

NaijaDrive map and landmark picker (browser behaviour that server HTML cannot prove):

```powershell
$env:QA_BASE_URL="http://localhost:3100"
npm run qa:drive-map
```

Visual QA uses local Chrome through `playwright-core` and runs eight passes: public pages
anonymously, customer pages while signed in, seller/courier/driver/admin dashboards while
signed in, and the role dashboards again anonymously to prove they redirect to `/login`. It checks
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

- **Verified locally:** migrations, seed, type-check, production build, the marketplace
  suite (13/13), the NaijaDrive API suite (20/20), the NaijaDrive map and picker browser
  suite (17/17), the ecosystem smoke test (37/37), the locale suite (27/27),
  authenticated visual QA, persistence across a server restart, and the running preview
  server at `http://localhost:3100`.
- **Verified against real map tiles but not deployed:** the Leaflet map fetched live
  OpenStreetMap tiles while the browser suite ran. Nothing was deployed, so no
  production tile-origin, rate-limit or offline behaviour has been observed.
- **Not verified live:** no production deployment was performed. Real Paystack,
  Flutterwave, SMS/email, storage and delivery-provider integrations require credentials
  and provider-side webhook configuration that are not present in this environment. They
  remain honest "not configured" states. NaijaDrive dispatch is real server state, but
  no live driver fleet exists here: drivers sign in with the fixture accounts above.

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
