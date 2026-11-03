# NaijaDeals ecosystem delivery tracker

Last updated: 2026-11-02
Branch: `naijashop-marketplace`
Baseline commit: `d996d224` (Correct stale verification claims in Amazon behaviour record)
Latest increment: Control Center runtime integration and permissions (committed and pushed as `90a7f20`, on top of `dc47a4d`; see Increment 6)

This tracker separates three states so a screen existing is never confused with a
service working:

- **Implemented** — code exists in this repository and runs.
- **Test-verified** — exercised by an automated test or a recorded manual run against
  this branch on the local preview.
- **Live-verified** — exercised against real provider credentials, real money or real
  operational partners. Nothing in this repository is live-verified yet.

---

## Increment 1 — ecosystem shell, products and original artwork

| Requirement | Reference evidence | Implementation | Acceptance test / result | Remaining work |
| --- | --- | --- | --- | --- |
| Bolt/Uber-like homepage: clear hero, search, quick actions, product discovery | Reference screenshots in `C:\Users\User\Documents\Uber and Bolt` (`home page`, ride-flow sets); publicly documented Bolt/Uber homepage structure | `components/sections/ecosystem-home.tsx`; `app/page.tsx` | `scripts/ecosystem-smoke.mjs` — `/` renders heading, 25/25 checks passed | Real device testing; content localisation |
| Products section with large, accessible cards that open module routes | Screenshots of Uber/Bolt service grids | `ModuleCard` in `ecosystem-home.tsx`; `/products` page in `components/sections/products-page.tsx`, `app/products/page.tsx` | Whole-card links verified: home → NaijaShop card → `/naijashop`; browser Back returns `/`; 0 px horizontal overflow at 390 px and 1440 px | Replace “Setup required” modules with real flows (see matrix) |
| Every card has real photography, including product cards | Market-specific photography of Nigerian commerce; abstract SVG art retired from module cards | Photographs in `public/real-photography/` referenced from `lib/data/ecosystem.ts`; legacy generator kept in `scripts/generate-ecosystem-art.mjs` for `public/generated/` product art only | `npm run qa:ecosystem` 37/37 — all 11 module photographs return 200 `image/png`, homepage HTML references every `/real-photography/module-*.png`, no `/generated/module-` left in home markup; screenshots `qa-artifacts/home-desktop.png`, `home-mobile.png` | Photographs still needed for NaijaStay, NaijaStream and Aura AI (currently approximated); compress ~2.5 MB PNGs and serve responsive sizes |
| Mobile-first app-like navigation with bottom bar | Bolt/Uber mobile screenshots | `components/shell/app-shell.tsx` — Home / Products / Cart / Orders / Account; 56 px targets; `aria-current` | Mobile screenshot at 390×844, no overflow, nav reachable; keyboard focus styles present | PWA install prompt, offline shell |
| Keep NaijaDrive name, remove Ruki branding | Prompt requirement | No `Ruki` occurrences remain in `app/`, `components/`, `lib/`, `prisma/`, `public/`; NaijaDrive card and route use the mobility name | Source scan returned no matches | Dedicated NaijaDrive experience |
| Honest module states | Prompt requirement | `lib/data/ecosystem.ts` status + `components/sections/generic-page.tsx` status pages | `/naijaeats`, `/naijafresh`, `/naijadrive`, `/naijagigs`, `/naijastay`, `/naijastream`, `/aura-ai` return 200 and name the missing dependency | Build the services or keep status until contracted |

Test evidence: `npm run qa:ecosystem` against `http://localhost:3100` → **25/25 checks passed**.

---

## Increment 2 — country, city, language and currency context

| Requirement | Implementation | Acceptance test / result | Remaining work |
| --- | --- | --- | --- |
| Shared country/city selection, persisted and validated | `lib/config/regions.ts` (cities per country), `lib/i18n/server.ts` (cookie reading + validation), `lib/i18n/locale-provider.tsx` | Cookie-driven render verified by `npm run qa:locale`; invalid values fall back to `NG` / `Lagos` | Real geolocation and per-country catalogues |
| Language switcher in the shell, reachable on mobile | `components/shell/locale-switcher.tsx`; wired into `app-shell.tsx` header | Playwright opens the panel and switches to Arabic; cookie persists; heading translates — 27/27 checks | Translate checkout, orders, seller and admin copy |
| Swahili added | Full dictionary in `lib/i18n/dictionary.ts` | `qa:locale`: `lang="sw"`, Swahili hero/nav labels at 390 px and 1440 px, 0 px overflow | Native-speaker review |
| Arabic added with RTL | Full dictionary; `<html lang="ar" dir="rtl">`; `rtl:` layout classes for sidebar, main, footer, switcher, arrows | `qa:locale`: RTL document, Arabic hero/nav, sidebar right-aligned on desktop, 0 px overflow, no console errors | Native-speaker review; RTL polish on commerce pages |
| Currency context honest about what is charged | Selector shows country currency but states “Prices are charged in NGN”; checkout continues to charge NGN kobo | Locale panel copy; no converted price is displayed anywhere | Enable additional selling currencies with real FX/settlement |
| Service availability by country | Delivery availability shown from `lib/config/commerce.ts` (`deliveryEnabled`) | Nigeria shows available; other countries show not configured | Country-by-country provider onboarding |

Test evidence: `npm run qa:locale` against `http://localhost:3100` → **27/27 checks passed** (English, Swahili, Arabic × mobile 390×844 and desktop 1440×1000, plus live switcher). Screenshots: `qa-artifacts/locale/`.

---

## Increment 3 — NaijaDrive rides, driver board and Control Center rides

| Requirement | Implementation | Acceptance test / result | Remaining work |
| --- | --- | --- | --- |
| Ride models, driver onboarding state and audit trail | `prisma/schema.prisma` (`DriverProfile`, `Ride`, `RideEvent`, `RideStatus`, `RidePaymentMethod`, `RidePaymentStatus`, `ActorType.DRIVER`); migration `20261030141916_naijadrive_rides` | Migration applied to `naijadeals_core`; seed creates two approved drivers with vehicle classes and DRIVER wallets; mobile overflow fixed with `min-w-0` classes in `components/functional/drive-page.tsx` | Document upload, licence expiry and background checks |
| Deterministic Lagos fare quote, locked at request | `lib/config/drive.ts` (14 named Lagos places with coordinates, 4 vehicle classes, haversine × 1.35 road factor, 22 km/h estimate, integer kobo rounded to ₦50); `GET /api/drive/quote`; server recomputes on request | `test:drive`: public quote returns integer positive kobo on NGN; the ride stores the same fare the quote showed; invalid route/class rejected 400 | Live road distance/traffic provider and surge policy |
| Rider booking with cash or NaijaPay wallet | `lib/services/core/drive.service.ts` (`requestRide`), `POST /api/drive/rides`, `components/functional/drive-page.tsx` | `test:drive`: wallet request moves fare from available to held; cash request starts `pending`; a second active request is rejected 409 | Saved places, scheduled rides, receipt email |
| One active ride per rider | `pg_advisory_xact_lock(hashtext(riderId))` plus an active-ride query inside the same transaction | `test:drive`: concurrent duplicate request rejected 409 (`active_ride_exists`) | — |
| Single-driver acceptance under concurrency | Conditional `updateMany` on `{ status: "requested", driverId: null }` | `test:drive`: two drivers accepting simultaneously produce exactly one 200 and one 409 | Driver dispatch radius and offers |
| Trip lifecycle and idempotent completion | `driverUpdateRideStatus` with an explicit transition table and conditional updates; duplicate completion returns the ride without re-releasing | `test:drive`: completing before starting is 409; arriving → in progress → completed releases the hold exactly once; a repeated completion does not double-pay | In-trip support, safety tooling |
| Cancellation refunds the NaijaPay hold | `cancelRide` + `refundRideHold` with a conditional balance release and a balanced ledger transaction | `test:drive`: rider cancellation restores available and held balances and marks `refunded`; a second cancel is idempotent; a ride in progress cannot be cancelled from the page | Cancellation fee policy |
| Cash fare recording is explicit | `markCashCollected`, driver board button, receipt text | `test:drive`: completed cash ride stays `pending` until the driver records collection, then `paid`; repeating the action is safe | Cash reconciliation with driver settlements |
| Driver board restricted to approved drivers | `requireDriver`, `getDriverForUser` (`status = approved`, `active = true`), `/driver` page + `POST /api/drive/driver/rides/[id]/*` | `test:drive`: a customer gets 403 from the driver board and acceptance; the losing driver cannot advance the ride (403) | Driver earnings, ratings, documents |
| Control Center rides tab | `components/functional/admin-dashboard.tsx` Rides tab; `GET /api/admin/rides`, `POST /api/admin/rides/[id]/cancel`; `requireAdmin` | `test:drive`: a customer gets 403 from admin rides; an administrator can list rides and cancel a live ride, which refunds the hold | Ride disputes, fare adjustments |
| Cross-account ride isolation | `getRideForUser` and `cancelRide` compare the rider/driver to the session user (admins excepted) | `test:drive`: another rider cannot read (403) or cancel (403) the ride | — |
| Honest ride status | No simulated GPS movement, no invented driver, quote labelled an estimate, driver details appear only after acceptance; page states no card is charged | `test:drive`: payment and status labels match server state after every transition | Live map when a map provider exists |

Test evidence: `npm run test:drive` against `http://localhost:3001` → **20/20 checks passed**. Marketplace regression re-run on the same server → **13/13 checks passed**.

---

## Increment 4 — NaijaDrive map, landmark search and itemised fares

This increment closes the specific defects the competitor UX study identified in Uber and Bolt,
rather than copying their screens.

| Requirement | Implementation | Acceptance test / result | Remaining work |
| --- | --- | --- | --- |
| A real map at booking time (the structural gap: no map library existed) | `components/functional/drive-map.tsx` — Leaflet 1.9.4 + OpenStreetMap raster tiles, runtime dynamic import so `window` never runs on the server, `scrollWheelZoom` disabled so a mobile page scroll is never hijacked, `ResizeObserver` resizing guarded by a liveness flag | `npm run qa:drive-map`: Leaflet canvas mounts at 534×320 on desktop with live tiles; **17/17 checks passed**; no console errors on desktop or mobile | Road-network routing (the drawn line is explicitly labelled as not turn-by-turn) |
| Map must not be a single point of failure on Nigerian connectivity | Tile errors counted; after 4 failures the map swaps to a vector schematic with an amber explanation and a Retry button. `lowData` mode is a deliberate toggle that persists in `localStorage` | `qa:drive-map`: low-data toggle swaps tiles for the schematic, is exposed as `aria-pressed="true"`, and survives a reload | Offline tile caching (PMTiles), tile mirror |
| Landmark-first place search instead of street addresses | `lib/config/drive.ts` — every place gains a `zone` and Lagos aliases (`CV`, `VI`, `Tejuosho`, `Mile 2`); `searchPlaces()` ranks label → alias → zone → address and runs entirely on bundled data; `components/functional/place-picker.tsx` is a real ARIA combobox (Arrow/Enter/Escape/Tab, `aria-activedescendant`, outside-click close) | `qa:drive-map`: typing `lekki` filters to 2 matches; Enter commits the top match; `CV` resolves to Computer Village; 48px touch target on mobile | Rider-authored nicknames ("Mum's place") persisted to the account |
| Device location without inventing an address | `nearestPlace()` haversine-snaps the browser position to the closest bookable landmark and reports the real distance; refuses to book when >25 km outside Lagos | `qa:drive-map`: denied geolocation produces an honest message and changes nothing | Saved addresses reused as suggested landmarks |
| Colour-blind-safe trip encoding (Bolt's documented defect) | Every route is encoded by shape **and** colour **and** text: filled circle + "Pick-up", square + "Drop-off", in the map, legend, quote panel and active ride card (`RouteChips`) | Visual: `qa-artifacts/drive/drive-map-desktop.png`; `qa:drive-map` asserts the legend and both labels render | — |
| Fare shown itemised **before** booking, not only in the receipt | `quoteDrive()` now returns `breakdown { baseKobo, distanceKobo, timeKobo, adjustmentKobo }`; base + distance + time + rounding reconstruct `fareKobo` exactly; rendered by `FareBreakdown` | `test:drive`: the four parts are asserted to sum to the quoted fare, and the rounding adjustment must be integer kobo — **20/20 passed** | Surge/toll line items, driver commission split |
| Automatic reassignment is visible to the rider (Bolt's other documented defect) | `releaseRide()` already returns the ride to `requested`; the rider card now detects the release event and states that the ride went back to approved drivers automatically and will not be charged twice | Covered by `test:drive` "A driver can release an accepted ride back to the queue"; UI copy asserted in the rendered page | Timeout-driven reassignment when a driver accepts and goes silent |
| Safety affordances that are real, not decorative | Plate rendered as a large high-contrast chip with "match this plate before you get in"; one-tap `tel:` call to the driver's number from the server payload; trip share via WhatsApp deep link containing ride number, route, status and fare | Rendered page assertions in `qa:drive-map`; no fake PIN, no fake tracking, no invented driver position | RideCheck, trusted contacts, in-trip support channel |
| Module hero must use real Nigerian photography | `components/functional/drive-page.tsx` hero repointed from `/generated/module-drive.svg` to `/real-photography/module-drive.jpg` | `qa:drive-map` asserts the real photograph is present and the legacy SVG is gone | Correct photographs for NaijaStay, NaijaStream and Aura AI |

Test evidence: `npm run qa:drive-map` → **17/17**; `npm run test:drive` → **24/24** (current, after Increment 5); `npm run qa:deadline` → **9/9**; `npm run qa:drive-places` → **8/8**; `npm run qa:ecosystem` → **37/37**; `npm run qa:locale` → **27/27**; `NEXT_DIST_DIR=.next-prod npx next build` → compiled successfully.

One real defect was found and fixed by this suite rather than shipped: a queued `ResizeObserver` callback called `map.invalidateSize()` after the Leaflet instance had been removed, throwing `Cannot read properties of undefined (reading '_leaflet_pos')`. It is now guarded by an `aliveRef` flag plus an `isConnected` check.

---

## Increment 5 — assignment deadlines, saved places and an honest cancellation policy

| Requirement | Implementation | Acceptance test / result | Remaining work |
| --- | --- | --- | --- |
| A silent driver must not strand a rider | `Ride.assignmentExpiresAt`, set on acceptance and reset on `driver_arriving`, cleared when the trip starts. `releaseExpiredAssignments()` is the single authority and runs on every driver-board and ride read; the ride returns to `requested` with no rider charge | `test:drive`: acceptance sets a ~10-minute deadline, arrival resets it, `in_progress` clears it — **24/24 passed** | Push/SMS notification when a ride is released |
| The deadline must be visible on both sides, not hidden in the database | `components/functional/driver-dashboard.tsx` runs a one-second clock and a one-shot refresh on expiry; `components/functional/drive-page.tsx` renders `AssignmentDeadline` for the rider. Both state that the ride returns to the queue automatically and nothing extra is charged | `npm run qa:deadline`: driver board shows `600 s left to update this ride` and the value ticks down between refreshes; the rider sees `Your driver has 9 min 56 s to arrive` — **9/9 passed** | Product copy sign-off for the wording |
| Saved, nicknamed landmarks per account | `SavedPlace` model + migration `20261031072737_drive_assignment_timeouts_saved_places`; `listSavedPlaces` / `savePlace` / `updateSavedPlace` / `deleteSavedPlace`; `GET`/`POST /api/drive/places`, `PATCH`/`DELETE /api/drive/places/[id]`. Every nickname still resolves to a bookable landmark, so no address is invented. 20-place cap, duplicate nickname 409, unknown landmark 400, all lookups scoped by `userId` | `test:drive`: create/list/rename/delete, cross-account list and delete blocked, unknown landmark and duplicate nickname rejected. `npm run qa:drive-places`: add, rename, search and delete in a real browser, 44×44 icon targets, 0 px overflow at 390 px — **8/8 passed** | Suggest a saved place as the default pick-up |
| Cancellation fee must not be invented | `cancelRide` sets `feeKobo = 0` with an explicit "policy not yet defined" comment. The schema fields and the ledger `fee` type remain so a defined policy can be enabled later without another migration. The cash-free policy is preserved | `test:drive` "Cancelling after the driver sets off charges no invented fee": `cancellationFeeKobo` is 0, payment status is `refunded`, and available **and** held balances are fully restored | The actual amount and qualifying trip state are still an open business rule — do not enable charging until defined |
| Module cards must not show another module's photograph | `module-stay.jpg`, `module-stream.jpg` and `module-aura.jpg` restored to their own dedicated files instead of being cross-wired to unrelated modules. Each carries an explicit `TODO(blocked)` in `lib/data/ecosystem.ts` and `scripts/optimize-photography.mjs` naming the mismatch | `npm run qa:ecosystem`: homepage references all ten module images — **37/37 passed** | Genuine NaijaStay (accommodation), NaijaStream (music/creators) and Aura AI (concierge) photography — none exists on disk |

Test evidence for this increment: `npx tsc --noEmit` clean; `NEXT_DIST_DIR=.next-prod npx next build` compiled successfully; `test:drive` **24/24**; `qa:deadline` **9/9**; `qa:drive-places` **8/8**; `qa:ecosystem` **37/37**; `qa:locale` **27/27**; `qa:drive-map` **17/17** — all against `http://localhost:3100`.

This increment is runtime-verified locally only. It does not claim live dispatch, live payments or production readiness. The three mismatched photographs and the undefined cancellation fee are recorded as blocked, not faked.

---

## Increment 6 — unified Control Center runtime integration and server-enforced permissions

The existing Control Center shell (`/admin`, `/super-admin`) was wired to real server data and real URL-driven navigation instead of static demo panels. The supplied reference `design-references/admin/naijadeals-control-center-master.png` remains the visual target.

| Requirement | Implementation | Acceptance test / result | Remaining work |
| --- | --- | --- | --- |
| One Control Center, not two disconnected shells | `lib/admin/admin-navigation.ts` defines ecosystem modules, tabs and href builders; `app/admin/page.tsx` and `app/super-admin/page.tsx` render the same `AdminDashboard` from `searchParams`; `/super-admin` additionally requires the `super_admin` role | Browser QA: anonymous `/admin` → `/login?next=/admin`; admin sign-in lands on `/admin`; module card click → `/admin?module=shop`; Orders tab click → `tab=orders`; header search → `?tab=users&q=superadmin`; super admin settings reachable | Separate operations/finance/support role scopes are not yet modelled |
| Real data only, with honest empty states | `lib/admin/load-page-data.ts` loads users, orders, deliveries, rides, payouts, products, applications, payments, vendors, couriers and audit records from PostgreSQL; KPIs are aggregates from those rows; unavailable modules render “not available in this build” | Browser QA asserts the previously fabricated demo strings are absent, the local PostgreSQL load timestamp is shown, `All admin endpoints responded.` is shown, Users renders 11 real rows, NaijaDrive shows 28 trips / ₦12,300 recorded value, and Orders shows “No orders exist yet.” | Pagination, bulk actions and record-detail drawers are not implemented |
| Standard admin and super admin are distinct server-enforced roles | `requireSuperAdmin()` in `lib/auth/guard.ts`; `GET /api/super-admin/system` returns a platform snapshot without secrets; super-admin navigation is role-gated in `admin-shell.tsx` | Browser/API QA: standard admin receives **HTTP 403** from `/api/super-admin/system`; super admin receives **HTTP 200** and sees roles, provider configuration presence and `Secrets are never returned by this endpoint.` | Cross-region and privilege-escalation test matrix still required for a full Phase 05 pass |
| Real operational tables, filters and refresh | `components/functional/admin-workspace-tabs.tsx` implements Orders, Deliveries, Trips, Payouts, Products, Seller applications, Payments, Users, Vendors, Couriers, Drivers, Audit and Settings with search, actor/status filters, refresh and explicit empty states | Browser QA: actor filter narrows 11 users to 2 admins; in-table search narrows to 1; header search drives the workspace query; Refresh preserves the selected tab and query; sign-out returns to `/login` | Server-side pagination, safe bulk actions and audit events for sensitive mutations |
| Reference-faithful, responsive Control Center | Dark `#0B0E14` canvas, `#161B22` panels and `#00E676` accent; sidebar, ecosystem switcher, workspace header, KPI cards, service performance, revenue, driver coverage, activity/alerts and right-hand health rail; KPI cards restacked so real values are readable at 1440 px | Playwright screenshots at 1440×1000 and 390×844; desktop sidebar 256 px on-screen; mobile `scrollWidth === clientWidth === 390`; mobile menu opens, closes after navigation and the Orders workspace is usable | Not yet a pixel match for every reference component; map/geography and live-operations controls remain honestly unavailable |

Test evidence for this increment (all against `http://localhost:3100`, production build served from `.next-prod`):

- `npx tsc --noEmit` — clean
- `NEXT_DIST_DIR=.next-prod npx next build` — compiled successfully
- `node scripts/control-center-visual-qa.mjs` — **29/29 checks passed**, no console errors or failed requests
- `npm run test:drive` — **28/28 checks passed**
- `npm run qa:idle-sweep` — **3/3 checks passed**
- Screenshots and machine report: `.qa/control-center/` (`01-overview-desktop.png` … `09-orders-mobile.png`, `report.json`)

This increment is local runtime-verified only. No production deployment, live payment or live dispatch occurred. Phase 05 is **IN PROGRESS**, not PASS, because pagination, bulk actions, record details, cross-region scopes and sensitive-action audit events are still open.

---

## Module matrix

| Module | Route | Implemented | Test-verified | Live-verified | What is real today | What is missing |
| --- | --- | --- | --- | --- | --- | --- |
| NaijaShop | `/naijashop` | Yes | Marketplace suite 13/13 + shell smoke | No | Catalogue, variants, stock reservation, cart, checkout, orders, reviews, seller tools | — (provider payments still test/mock only) |
| NaijaPay | `/wallet` | Yes | Marketplace suite (wallet failure/refund paths) + login-return journey | No | Ledger-backed wallet balance, transactions, escrow holds | Funding via real provider keys |
| NaijaSend | `/naijasend` | Partial | Marketplace suite (courier delivery, failure/retry) + shell smoke | No | Manual courier delivery states tied to marketplace orders | Standalone quote/booking, third-party courier API |
| NaijaEats | `/naijaeats` | Route + status page | Route smoke | No | Honest status | Restaurants, menus, dispatch |
| NaijaFresh | `/naijafresh` | Route + status page | Route smoke | No | Honest status | Grocery inventory, picking, substitutions |
| NaijaDrive | `/naijadrive`, `/driver` | Yes (Lagos cash/wallet rides) | `test:drive` 24/24; `qa:drive-map` 17/17; `qa:deadline` 9/9; `qa:drive-places` 8/8; marketplace regression 13/13 | No | Named-place quotes locked in kobo, live OSM map with tile-free low-data fallback, offline landmark search with Lagos aliases, device-location snapping, itemised fare, colour-blind-safe trip encoding, one active ride per rider, single-driver acceptance, server-authoritative assignment deadline with live countdown on both sides, per-account saved places (add/rename/search/delete), wallet hold/refund/release, cash recording, driver board, Control Center rides | Live driver dispatch/matchmaking, road-network routing, driver documents, scheduled rides, push notification on release; cancellation-fee amount and qualifying state still undefined, so charging stays disabled |
| NaijaGigs | `/naijagigs` | Route + status page | Route smoke | No | Honest status | Gig catalogue, milestones, double-booking protection |
| NaijaStay | `/naijastay` | Route + status page | Route smoke | No | Honest status | Property inventory, availability, double-booking protection |
| NaijaStream | `/naijastream` | Route + status page | Route smoke | No | Honest status | Licensed media, rights, royalties |
| Aura AI | `/aura-ai` | Route + status page | Route smoke | No | Honest status | Model provider, tool permissions |
| Control Center | `/admin` | Existing admin dashboard + Rides tab | `test:drive` admin rides/RBAC checks; marketplace RBAC checks | No | Orders, vendors, products, payments, couriers, rides, payouts, audit | Countries/cities, unified finance, RBAC matrix expansion |
| Business accounts | `/business/[vertical]` | Existing informational route | Build-time static generation | No | Service descriptions | Company accounts, groups, limits, consolidated billing |

---

## Verification checklist (prompt acceptance list)

| # | Check | Status | Evidence / gap |
| --- | --- | --- | --- |
| 1 | Homepage → Products → every module | Test-verified | `npm run qa:ecosystem`: all 10 module routes 200 (wallet 307 → login); homepage card opens NaijaShop; browser Back returns home |
| 2 | Login and return to intended journey | Test-verified | `?next=/wallet` login lands on wallet with customer fixture |
| 3 | Core customer and partner workflows | Test-verified | `npm run test:marketplace` (13/13) and `npm run test:drive` (24/24) against `localhost:3100`: catalogue, purchase, seller fulfilment, courier delivery, escrow release, ride booking, driver trip and receipt |
| 4 | Control Center actions and permissions | Test-verified | Marketplace suite plus `test:drive`: auth/RBAC enforced, seller onboarding + admin approval, cross-tenant and cross-account access rejected, admin ride cancellation refunds the hold |
| 5 | Persistence after refresh/restart | Test-verified | The suites write orders/products/deliveries/rides/saved places to PostgreSQL and read them back; DB has 4 migrations applied and is up to date |
| 6 | Mobile usability, accessibility, performance | Fixed | 390 px and 1440 px screenshots for English, Swahili and Arabic; 0 px overflow; whole-card links, skip link, focus styles, RTL shell; Lighthouse/axe not yet run | Mobile overflow in NaijaDrive active ride state diagnosed and fixed with `min-w-0` classes on booking card, selects, vehicle grid and active-ride card; re-verified with Playwright probe at 390×844; scrollWidth stays at 390 px across anonymous, requested, assigned and driver states. All 22/22 visual checks pass. |
| 7 | Failed payments, duplicate callbacks, retries | Test-verified | Marketplace suite: failed wallet payment rejected and order stays unpaid; duplicate callback idempotent; invalid/unconfigured webhook signatures rejected |
| 8 | Concurrent stock requests | Test-verified | Marketplace suite: concurrent checkout cannot oversell a one-unit product. `test:drive`: duplicate ride request returns 409; two drivers racing to accept produce exactly one winner |
| 9 | Cancellation, refund, inventory restoration | Test-verified | Marketplace suite: paid cancellation refunds and restocks exactly once. `test:drive`: rider cancellation restores the NaijaPay hold; duplicate cancel and duplicate completion do not double-refund or double-pay; late cancellation charges no fee because the fee policy is undefined |
| 10 | Delivery/dispatch failures and recovery | Test-verified | Marketplace suite: delivery failure and retry reach delivered. Rides: a driver can release an accepted ride back to the queue; no fake dispatch is shown |
| 11 | Unauthorized cross-account access | Test-verified | Marketplace suite: cross-tenant and unauthorized access rejected. `test:drive`: another rider cannot read or cancel the ride, non-drivers cannot use driver endpoints, non-admins cannot use admin rides |

### Recorded runs

```
$ npm run test:marketplace          # TEST_BASE_URL=http://localhost:3100
Marketplace verification: 13/13 passed

$ npm run test:drive                # TEST_BASE_URL=http://localhost:3100
24/24 checks passed

$ npm run qa:deadline               # QA_BASE_URL=http://localhost:3100
9/9 checks passed

$ npm run qa:drive-places           # QA_BASE_URL=http://localhost:3100
8/8 checks passed

$ npm run qa:ecosystem              # QA_BASE_URL=http://localhost:3100
37/37 checks passed

$ npm run qa:locale                 # QA_BASE_URL=http://localhost:3100
27/27 checks passed

$ npm run qa:drive-map              # QA_BASE_URL=http://localhost:3100
17/17 checks passed
```

Artifacts: `qa-artifacts/ecosystem/*.png` (mobile 390×844 and desktop 1440×1000 for
`/`, `/products`, `/naijashop`, `/naijadrive`, `/naijafresh`) and
`qa-artifacts/locale/*.png` (English, Swahili, Arabic at 390×844 and 1440×1000).
`npm run qa:visual` writes 108 screenshots across mobile/tablet/desktop for public,
customer, seller, courier, driver and admin passes (`qa-artifacts/visual-qa-report.md`,
0 failures, 0 broken links, 0 auth failures).

Not yet verified: Lighthouse performance budget, axe audit, offline behaviour, and any
run against real provider credentials.

---

## Artwork provenance

Every image is generated from source in `scripts/generate-ecosystem-art.mjs` and
`scripts/generate-product-art.mjs`. The scripts compose gradients, geometry and labels
with no network access. Reference screenshots were used only to study layout and
journey structure; no competitor branding, screenshots, icons or assets are included.

Regenerate with:

```powershell
npm run art:generate
```

---

## External dependencies and blockers

| Dependency | Needed for | State |
| --- | --- | --- |
| `PAYSTACK_SECRET_KEY` | Live card/bank/USSD payments | Not configured |
| `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH` | Live Flutterwave payments/webhooks | Not configured |
| Merchant approval + settlement account | Live provider onboarding | Not started |
| Maps/geocoding + dispatch partner | Live NaijaDrive tracking and NaijaSend third-party dispatch | Not configured; NaijaDrive quotes use named Lagos places and a road factor instead |
| Restaurant and grocery partner data | NaijaEats, NaijaFresh | Not supplied |
| Licensed audio/artwork + rights metadata | NaijaStream | Not supplied |
| Model provider key + permission policy | Aura AI actions | Not configured |
| Email/SMS provider | Outbound notifications and support | Not configured |
| PWA icons/manifest review | Installable web app | Not started |

Tooling (verified 2026-11-03): REA 6.8.0 is registered and connected, with Ghidra 12.1.4,
JADX 0.7.1, apktool 3.0.3 and adb 37.0.1 available and exercised; browser CDP capture works
against public references and the local preview. ECC 2.2.3 is installed and Soup is
running as a registered MCP skill router. No genuine Uber/Bolt APK exists locally and no
Android device is attached. See `docs/reference-and-tooling-evidence.md`.

---

## Next increments (ordered)

1. ~~Countries, cities, language and currency context shared by shell and modules.~~ Done in Increment 2.
2. ~~NaijaDrive: quote → request → driver accept → trip states → receipt, with DB models,
    RBAC, cancellation and concurrency tests.~~ Done in Increment 3.
3. Translate checkout, orders, seller and admin flows into Swahili and Arabic.
4. NaijaGigs and NaijaStay with real inventory and double-booking protection.
5. NaijaEats and NaijaFresh with partner-supplied catalogues only.
6. Unified Control Center expansion: geography, provider connection status, finance,
    disputes, reconciliation, audit. **Partially delivered in Increment 6** — URL-driven
    workspaces, real data, operational tables and the super-admin boundary are verified;
    pagination, bulk actions, record details, cross-region scopes and sensitive-action
    audit events remain.
7. NaijaStream and Aura only when licensed media and a model provider exist.
8. PWA manifest, offline states, Lighthouse/axe audits, full marketplace regression.

**No deployment to production performed**. Production approval gate untouched. Commit `a5ae661b` is committed locally on branch `naijashop-marketplace`; not pushed without explicit authorization.