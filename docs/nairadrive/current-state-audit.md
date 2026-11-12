# NaijaDrive current-state audit

- **Repository:** `C:\Users\User\Documents\naijadeals.com`
- **Branch:** `naijashop-marketplace`
- **HEAD audited:** `ecd0e54cd22eb6f547e8646e7bd2ddde3e7e0547`
  (`Add protected ride pickup verification, receipts and participant ratings`)
- **Audit date:** 2026-11-11 (shell date and commit timestamps; repository evidence also carries
  2026-11-11 entries)
- **Method:** read-only inspection of the working tree at HEAD. No code, schema, payment, ledger or
  UI file was modified. No commit and no push were made. The pre-existing working-tree changes
  (`AGENTS.md`, `components/functional/admin-dashboard.tsx`, `scripts/marketplace-tests.ts`,
  `scripts/optimize-photography.mjs` and untracked research assets) were left untouched.
- **Runtime checks performed for this audit:** `npx tsc --noEmit` (see §9), a read-only OSRM
  availability probe, and a read-only wallet reconciliation against the database named in `.env`.
  Existing acceptance suites were **not** re-run because they create and delete fixtures and write
  wallet/ledger rows; their last recorded executions are cited instead.
- **Concurrent working-tree note:** while this audit was being written, an uncommitted
  earnings-breakdown change appeared in the working tree that was not authored by this pass:
  `components/drive/driver-workspace.tsx` modified, plus untracked
  `components/drive/earnings-breakdown.tsx` and `lib/services/core/driver-economics.ts`. A temporary
  app/e2e-earnings-preview route also appeared and was removed during the pass. None of this is part
  of HEAD `ecd0e54` and it is not treated as verified state below. The audit describes HEAD; the final
  `npx tsc --noEmit` run, after the temporary preview route was removed, exited 0.

Status vocabulary: **IMPLEMENTED**, **PARTIAL**, **BLOCKED**, **NOT IMPLEMENTED**, **NOT VERIFIED**.

---

## 1. Verdict by surface

| Surface | Status | One-line verdict |
| --- | --- | --- |
| Customer booking / trip workspace | PARTIAL | Real Lagos quotes, requests, wallet holds, tracking, pickup code, receipt, rating and safety report. No card, scheduling, cancellation fee or live push. |
| Landing page (`/naijadrive`) | IMPLEMENTED | Honest Lagos-only landing with server quotes, saved places, safety, airport, driver recruitment, service-area checker and FAQ. |
| Driver workspace (`/driver`) | PARTIAL | Real presence, open-queue acceptance, status transitions, verification, cash recording and earnings view. No push for new requests, no onboarding, no driver payouts. |
| Partner dashboard | PARTIAL | Driver workspace plus separate seller, Eats courier and Send transporter dashboards. No unified partner documents or payouts. |
| Onboarding / vehicle documents | BLOCKED | No real driver application, approval or document storage. Only a localStorage demo form exists, and a pending driver cannot be approved by any current API. |
| Earnings / payouts | PARTIAL | Gross fare, cash recorded and wallet balance are real. No driver payout request, commission, tips, incentives or statements. |
| Control Center | PARTIAL | Real trips, drivers, finance and audit views; cancel and suspend/reactivate actions. No safety, verification-support, rating, online-time or live-map screens. |
| Notifications / support | PARTIAL | In-app feed and durable outbox exist. No real email/SMS/push provider; rider notification links point to a route that does not exist. |
| GPS / navigation / tracking | PARTIAL | Browser geolocation, OSRM road routes and OSM tiles work locally; no background iOS tracking, no turn-by-turn guidance, no physical-device acceptance. |
| Online time | IMPLEMENTED | Presence events produce today's online seconds and a pickup/driving/available split. Caveats in §3.10. |
| Pickup verification | IMPLEMENTED | Protected 4-digit code, rider-only reveal, driver verification gate, expiry, lockout and support override. Recorded acceptance: 81/81. |
| Receipts / ratings | IMPLEMENTED | Itemised receipt, one rating per participant per completed trip, real-row aggregates. No moderation UI. |
| Safety | PARTIAL | Report capture, code verification and text trip sharing exist. No SOS, triage screen, response SLA, insurance or incident workflow. |

**Financial defects:** both known defects are still present in code and neither is fixed by this
audit. See §4.

---

## 2. Canonical routes and components

| Purpose | Route / component |
| --- | --- |
| Ride landing and booking | `app/naijadrive/page.tsx` → `components/drive/drive-landing.tsx` → `components/drive/booking-workspace.tsx` |
| Driver workspace | `app/driver/page.tsx` → `components/drive/driver-workspace.tsx` |
| Driver help | `app/naijadrive/help/page.tsx` |
| Map | `components/drive/trip-map.tsx` |
| Location hook | `components/drive/use-browser-location.ts` |
| Drive API client | `components/drive/api.ts`, plus `apiClient.drive*` in `lib/api-client.ts` |
| Quote | `GET /api/drive/quote` |
| Public route | `GET /api/drive/route` |
| Rider rides | `GET|POST /api/drive/rides`, `GET /api/drive/rides/[id]`, `POST .../cancel` |
| Tracking | `GET /api/drive/rides/[id]/tracking` |
| Pickup code | `GET /api/drive/rides/[id]/verification`, `POST /api/drive/rides/[id]/verification/support` |
| Receipt | `GET /api/drive/rides/[id]/receipt` |
| Ratings | `POST /api/drive/ratings`, `GET /api/drive/ratings/[rideId]` |
| Safety report | `POST|GET /api/drive/rides/[id]/safety-report` |
| Saved places | `/api/drive/places`, `/api/drive/places/[id]` |
| Driver board and actions | `/api/drive/driver/rides`, `.../[id]/accept`, `.../[id]/release`, `.../[id]/status`, `.../[id]/cash`, `.../[id]/verify` |
| Driver presence | `GET|POST /api/drive/driver/presence` |
| Control Center | `/admin?module=drive&tab=rides|drivers|payments|audit`; API `GET /api/admin/rides`, `POST /api/admin/rides/[id]/cancel`, `POST /api/admin/drivers/[userId]/status` |
| Cross-vertical partner surfaces | `/seller`, `/courier`, `/naijaeats/courier`, `/naijasend/transporter/dashboard`, `/naijasend/driver/jobs` |
| Legacy onboarding | `/onboarding/driver` → `components/functional/onboarding-form.tsx` → `lib/demo-store.ts` |

`/drive` permanently redirects to `/naijadrive` (`next.config.mjs:7-15`).

---

## 3. Surface audits

### 3.1 Customer booking and trip workspace

**Status: PARTIAL.**

Canonical implementation: `components/drive/booking-workspace.tsx` (1,186 lines), embedded by
`components/drive/drive-landing.tsx:453-461`.

Implemented:

- Server quote for every class (`getAllQuotes` → `/api/drive/quote?all=true`), with base, distance,
  time and rounding components; the selected class becomes the booked fare.
- Public road route preview (`/api/drive/route`) and map (`components/drive/trip-map.tsx`).
- Landmark picker with Lagos aliases, offline search and device-location snapping
  (`lib/config/drive.ts:242-323`).
- Saved places scoped to the signed-in account (`components/functional/saved-places.tsx`).
- Ride request with cash or NaijaPay wallet. Wallet requests hold the fare inside a transaction
  (`lib/services/core/drive.service.ts:188-226`); one active ride per rider is enforced with an
  advisory lock (`:151-163`).
- Active trip panel: driver name, vehicle, plate, call link, pickup-code states, live/stale tracking
  with 6-second polling, trip timeline, text-only trip sharing, cancellation (`booking-workspace.tsx:710-963`).
- Completed-trip receipt, rating and safety-report forms (`:667`, `:986+`).
- Ride history (last eight rides) on the same workspace.

Tested (recorded, not re-executed):

- `scripts/drive-tests.ts` covers quote validation, wallet hold, second-active rejection,
  cross-account denial, driver acceptance race, transition guards, completion release, duplicate
  completion, cancellation refund/idempotency, cash completion, admin cancellation, saved places and
  assignment expiry. Last recorded full pass: **28/28 on 2026-11-03**. The file was changed for the
  pickup-code gate on 2026-11-11 and **has not been executed since** (handoff §6).
- `scripts/nairadrive-e2e.ts` covers the browser journey including sign-in preserving route,
  booking, driver acceptance, tracking, verification, receipt and earnings. It was updated for the
  pickup code but **not executed** in the 2026-11-11 increment.
- `scripts/drive-verification-rating-acceptance.ts` covers verification, receipts, ratings and
  safety at service level: **81/81 on two consecutive runs** (2026-11-11, database
  `naijadeals_wallet_acceptance`, RUN_ID `drive-verify-20261112022322-01bb3e18`).

Blocked or missing:

- No card payment; cash and NaijaPay wallet only (`RidePaymentMethod` enum).
- No scheduled rides; the help centre states this (`app/naijadrive/help/page.tsx:117-129`, line 123).
- No cancellation fee: `feeKobo = 0` is deliberate because the policy is undefined
  (`drive.service.ts:359-366`).
- No multi-stop, no ride pooling, no surge, no airport surcharge.
- No push/websocket assignment event; the rider waits for a 10-second poll and the driver board polls
  every 12 seconds.
- No ride-detail route. The rider notification link `/naijadrive/rides/[id]` does not exist (see
  §3.8).
- Pickup code display depends on the rider opening the trip screen; a pre-existing active ride with
  no verification record is handled by support reset only.

### 3.2 Landing page

**Status: IMPLEMENTED** for the Lagos build; market coverage is deliberately narrow.

Canonical implementation: `app/naijadrive/page.tsx` (server component) and
`components/drive/drive-landing.tsx` (948 lines). Header/footer: `components/drive/drive-chrome.tsx`.

Implemented:

- Hero, live booking workspace, saved places, ride options, three-step explanation, safety section,
  airport section, driver-recruitment section, food/parcel partner cross-links, service-area checker,
  optional PWA install prompt and FAQ.
- City activation is read from `listCityActivations()`; if the table cannot be read the checker says
  so rather than inventing availability (`app/naijadrive/page.tsx:30-36`).
- Driver recruitment states "New driver applications are not open in this build"
  (`drive-landing.tsx:688-691`).
- Airport copy states no airport surcharge is added (`:624`).
- Brand photography is labelled "Brand illustration" (`:446-448`, `:581-583`).

Tested:

- `scripts/nairadrive-e2e.ts` has a landing-quote step (not executed after the latest edit).
- Visual artifacts from 2026-11-11 exist at 390/768/1440 in `qa-artifacts/nairadrive-redesign/` and
  `qa-artifacts/drive-{pickup,driver-verify,receipt}-{390,768,1440}.png`; the recorded Playwright
  check was **9/9 with no horizontal overflow and no page errors** (handoff §4).
- Older route QA (`npm run qa:drive-map`, `qa:drive-places`, `qa:deadline`) is recorded elsewhere; it
  predates the pickup-code increment.

Blocked or missing:

- Dispatch is Lagos-only. `DRIVE_CITY = "Lagos"` is hardcoded (`lib/config/drive.ts:13-15`).
- No city-specific SEO pages, no Abuja landmark set, no localised drive copy.
- The PWA install prompt and service-area checker are real, but no device install test is recorded
  for the drive flow specifically.

### 3.3 Driver workspace

**Status: PARTIAL.**

Canonical implementation: `app/driver/page.tsx` (auth + `isDriver` gate) →
`components/drive/driver-workspace.tsx` (1,594 lines).

Implemented:

- Tabs: `overview`, `trips`, `earnings`, `wallet`, `vehicle`, `support`, `settings`
  (`driver-workspace.tsx:65-73`).
- Online/offline toggle with a required browser location; heartbeat every 15 seconds while fixes are
  fresh, and a 30-second re-send while stationary (`:165-240`, `:291-339`).
- Board polling every 12 seconds (`:207`); open requests, active ride, recent trips.
- Accept, arrive, verify, start, complete, release and cash-record actions (`:341-395`).
- Live tracking with 5-second polling and out-of-order protection (`:242-273`).
- Pickup-code entry with server errors for wrong code, expiry, lockout and cooldown (`:371-391`).
- Earnings view and wallet view with honest copy: full fare released on wallet trips, cash recorded
  separately, no commission invented, no payout requests (`:1026-1069`).
- Vehicle and documents view shows make/model, plate, class, approval, service zone, licence last
  four digits, and explicitly says expiry dates and uploads are not stored (`:1071-1097`).

Tested (recorded):

- `scripts/drive-tests.ts` covers driver actions and authorization (28 steps; last pass 2026-11-03,
  not re-run after the pickup gate).
- `scripts/drive-verification-rating-acceptance.ts` covers driver verification authorization and
  concurrency (81/81, 2026-11-11).
- `scripts/nairadrive-e2e.ts` covers online presence, acceptance, tracking, verification,
  completion, earnings and online-time persistence; **not executed** after the latest edit.

Blocked or missing:

- No push notification for a new open request. The driver must keep the workspace open; the board
  polls.
- No driver application or onboarding (see §3.5).
- No driver payout request or settlement schedule.
- No shift scheduling, break handling, destination filter or heat map.
- No native background location in the web build. iOS home-screen web apps cannot receive location
  while not visible (`docs/mobile-foundation.md:54-58`); an Android shell exists but has no recorded
  physical-device acceptance.
- A driver who is offline while holding an active trip keeps tracking, but the UI has no separate
  "finish current trip then go offline" control beyond going offline and continuing.

### 3.4 Partner dashboard

**Status: PARTIAL.**

There is no single partner dashboard for NaijaDrive beyond the driver workspace. The repository has
separate partner surfaces:

| Partner type | Route | Implemented |
| --- | --- | --- |
| NaijaDrive driver | `/driver` | Presence, requests, active trip, earnings, wallet, vehicle, support, settings |
| Marketplace seller | `/seller` | Products, orders, stock, returns, profile, ledger earnings, notifications |
| Eats courier | `/naijaeats/courier` | Overview, deliveries, earnings, wallet/payouts, transport, support, settings (`components/eats/partner-dashboard.tsx`) |
| Send transporter | `/naijasend/transporter/dashboard` | Quote queue, active jobs, fleet, quotes; links to `/naijasend/driver/jobs` |
| NaijaSend driver | `/naijasend/driver/jobs`, `/naijasend/driver/navigation/[id]`, `/naijasend/driver/earnings` | Jobs, navigation and earnings from the Send marketplace |

Implemented for Eats partner earnings: real ledger credits with explicit copy that tips, incentives,
fees, adjustments and cash-on-delivery balances are not modelled
(`components/eats/partner-dashboard.tsx:2670`). Payout requests are explicitly absent (`:2717-2729`).

Tested (recorded, outside the drive slice): `scripts/partner-lifecycle-tests.mjs` 9/9 for seller and
courier application/suspension/notification; `scripts/naijaeats-delivery-e2e.cjs`,
`scripts/naijasend-e2e.cjs` 46/46 and `scripts/naijasend-transport-e2e.cjs` 37/37. These do not test
a NaijaDrive partner dashboard because none exists.

Blocked or missing:

- No shared partner profile, document wallet or payout account across verticals.
- Driver, courier and seller earnings are separate ledgers/wallets by design; there is no combined
  partner statement.
- `/business/[vertical]` (including `/business/drive`) renders fabricated KPI values such as
  "Revenue today NGN 8.4M", "Payout queue 418", "Open support 29" and "Risk score 92"
  (`app/business/[vertical]/page.tsx:33-38`). Those are not backed by a data source and contradict
  the project's no-fake-metrics rule. This page also links to the localStorage onboarding (§3.5).

### 3.5 Onboarding and vehicle documents

**Status: BLOCKED / NOT IMPLEMENTED.**

What exists:

- `DriverProfile` stores `licenseNumber`, `status`, `vehicleClass`, `vehicleMake`, `vehicleModel`,
  `vehiclePlate`, `active`, `serviceZone`, `online`, `foodDeliveryEnabled`, `foodVehicleType` and
  `insulatedBag` (`prisma/schema.prisma:781-806`). It stores **no document upload, document number
  beyond the licence, expiry date, insurance, roadworthiness, background check or KYC result**.
- `/onboarding/driver` is generated from `onboardingFlows` (`lib/data/ecosystem.ts:465-471`) and
  renders `OnboardingForm`, which writes to `lib/demo-store.ts` localStorage and claims "Admin and
  super admin now include this onboarding record"
  (`components/functional/onboarding-form.tsx:38-70`). The real Control Center does not read that
  store, so the success message is false.
- Admin suspension/reactivation is real and audited (`lib/services/core/admin.service.ts:223-266`),
  but `setDriverStatus` rejects a `pending` driver with `409 driver_pending`; no other API approves a
  pending profile. The only way a driver profile becomes `approved` today is a seed/fixture script
  (`scripts/nairadrive-fixtures.ts:100`, `scripts/drive-verification-rating-acceptance.ts:119`).
- The driver workspace correctly states that expiry dates and uploads are not stored
  (`driver-workspace.tsx:1092-1095`).

Tested: no driver-onboarding test exists. `scripts/partner-lifecycle-tests.mjs` covers seller and
courier onboarding, not driver.

Blocked or missing:

- No driver application route, no document upload, no review queue, no approval transition from
  `pending`, no rejection reason, no expiry reminders.
- No vehicle registration, insurance, roadworthiness, background check or right-to-work record.
- No link from the canonical `/naijadrive` driver-recruitment section to a real application. The
  section says applications are not open.
- The generic onboarding page is a placeholder that persists only in the user's browser.

### 3.6 Earnings and payouts

**Status: PARTIAL.**

Implemented:

- Driver summary (`lib/services/core/drive.service.ts:1580-1647`):
  - `todayCompletedTrips`
  - `todayFareReleasedKobo` (wallet rides with `paymentStatus = paid`)
  - `todayCashRecordedKobo` and `todayCashPendingKobo`
  - `todayPickupSeconds` (accepted → started) and `todayDrivingSeconds` (started → completed)
  - `walletAvailableKobo` / `walletHeldKobo` from the `DRIVER` wallet
- `listDriverRides` fills `todayAvailableSeconds = todayOnlineSeconds − pickup − driving`
  (`:964-969`).
- Driver earnings tab and wallet tab (`driver-workspace.tsx:1026-1069`).
- Wallet release on completion credits the **full fare** to the driver wallet
  (`drive.service.ts:539-578`). No commission is deducted anywhere in the drive path.
- Cash completion leaves `paymentStatus = pending` until the driver records collection
  (`drive.service.ts:666-675`, `markCashCollected` at `:768`).

Not implemented:

- **No driver payout request, schedule, fee or provider.** `Payout` is vendor-only
  (`prisma/schema.prisma:738-751`) and the only payout routes are admin vendor payouts
  (`app/api/admin/payouts`). The driver wallet page says payouts are not configured.
- No tips, incentives, bonuses, guarantees, commission, service fee, cancellation compensation or
  adjustment line.
- No earnings statement, export, tax withholding or receipt for the driver.
- No accounting of fuel, maintenance, insurance, rental or deadhead in the product; those are model
  inputs in `driver-economics.md`, not encoded features.

Tested: completion release is covered by `scripts/drive-tests.ts` (last pass 2026-11-03); earnings
and online-time persistence are covered by `scripts/nairadrive-e2e.ts` (not executed after the
latest edit). No payout test exists because no driver payout exists.

### 3.7 Control Center

**Status: PARTIAL** for NaijaDrive.

Canonical implementation: `/admin` and `/super-admin` both render `AdminDashboard`
(`components/functional/admin-dashboard.tsx`); the drive module is
`module=drive` with tabs Trips, Drivers, Finance and Audit log
(`lib/admin/admin-navigation.ts:83-89`).

Implemented:

- Overview KPIs for trips, active trips, drivers and completed trips
  (`admin-dashboard.tsx:199-202`).
- Active-trip board with rider, driver, route and fare (`:470-481`).
- Drivers panel with suspend/reactivate and required reason
  (`components/functional/admin-workspace-tabs.tsx:1656-1711`), audited as
  `driver.status_changed`, with partner notification (`admin.service.ts:248-264`).
- Trips table with search, status filter, detail dialog and cancel action
  (`admin-workspace-tabs.tsx:1045-1110`); `POST /api/admin/rides/[id]/cancel` is permission-gated by
  `rides:write`.
- Finance and Audit tabs read real payments/ledger/audit rows; region scope is enforced server-side
  (`lib/admin/region.ts`, `lib/auth/scope.ts`).

Tested (recorded): admin security suite **19/19** (2026-11-03); Control Center visual QA **29/29**
(2026-11-03); drive suite covers admin cancel and non-admin denial (last pass 2026-11-03).

Blocked or missing:

- No pickup-verification support screen. `POST /api/drive/rides/[id]/verification/support` exists and
  is permission-gated, but it is not wired into the Control Center (handoff §6).
- No safety-report queue, review status change or resolution note UI, although `RideSafetyReport`
  has `status`, `reviewedAt`, `reviewedByUserId` and `resolutionNote`.
- No rating moderation UI (ratings are aggregate-only and private by design).
- No driver online-time, presence history or live operations map. The Drivers panel description still
  says "Driver presence and vehicle telemetry are not recorded in this build"
  (`admin-workspace-tabs.tsx:1663`), which is stale: presence and `LocationPing` are recorded.
- No pending-driver approval action; a pending profile is rendered as "Pending" with no button
  (`admin-workspace-tabs.tsx:1680`).
- No driver payout screen; payouts are vendor-only.

### 3.8 Notifications and support

**Status: PARTIAL.**

Implemented:

- In-app partner feed: `PartnerNotification` rows written by `notifyUser` / `notifyVendorOwner`
  (`lib/services/core/notification.service.ts:1-38`), read by the driver workspace and seller
  dashboard.
- Durable outbox for vendor notifications: `NotificationIntent` written inside the payment
  transaction (`notification.service.ts:40-75`); worker delivery with leases and retries.
- Multi-channel scaffolding: `IN_APP` works; `EMAIL` writes a masked capture record to
  `logs/notifications`; `SMS` and `PUSH` are explicitly unconfigured and suppressed, never marked
  sent (`lib/notifications/transports.ts:145-167`).
- Ride events: `notifyRideAssigned` and `notifyRideExpired` write in-app notifications to the rider
  (`lib/notifications/domain-events.ts:103-133`).
- Help centre covers booking, payments, safety, driver requirements, support, privacy, location data
  and terms (`app/naijadrive/help/page.tsx`). It states that no telephone line or guaranteed response
  time exists (`:64-78`).

Blocked or missing:

- No real email/SMS/push provider. Email is a file capture, not delivery.
- No driver notification for a new open request. The assignment notification goes to the rider only.
- **Broken notification target and no rider feed:** both ride notifications write an in-app
  `PartnerNotification` row with `href: /naijadrive/rides/${ride.id}`
  (`domain-events.ts:114`, `:129`), but `app/naijadrive` contains only `page.tsx` and
  `help/page.tsx`; there is no `rides/[id]` page. The only feeds that read `PartnerNotification` are
  the seller, courier and driver screens, so the rider has no notification surface at all and the
  stored link would 404 if one were added without a route.
- No support ticket, chat, call log or SLA. Safety reports are captured but not triaged in the
  Control Center.
- No notification centre in the Control Center; the admin shell has no bell.

Tested: notification outbox acceptance (`scripts/wallet-notification-outbox-acceptance.ts`), funding
webhook notifications (24/24 mocked), and partner lifecycle notifications for seller/courier. No test
asserts the ride-notification link resolves.

### 3.9 GPS, navigation and tracking

**Status: PARTIAL** (functional locally, constrained by the web platform).

Implemented:

- Browser geolocation only, via `navigator.geolocation.getCurrentPosition` /
  `watchPosition` (`components/drive/use-browser-location.ts:83-124`).
- Presence requires a usable fix within 25 km of a Lagos landmark and accuracy ≤ 5,000 m
  (`drive.service.ts:1439-1466`).
- Location pings are stored in `LocationPing` with a session reference (`presence:<driverId>` or
  `drive:<rideId>`) and a device registration (`drive.service.ts:1468-1501`).
- Presence expires after 120 seconds without a heartbeat; tracking is marked stale after 90 seconds
  (`drive.service.ts:1022-1026`).
- Tracking is readable only by the rider, assigned driver or admin; completed/cancelled rides return
  no coordinates (`drive.service.ts:1781-1878`).
- Road routes use OSRM with geometry and steps; if OSRM is unavailable the UI reports
  `routing_unavailable` instead of drawing a straight line (`drive.service.ts:1653-1757`,
  `:1848-1877`). OSRM answered HTTP 200 during this audit.
- Map tiles are OpenStreetMap raster tiles; failure is surfaced and markers/route geometry still
  render (`components/drive/trip-map.tsx:34-36`, `:317-320`).
- Driver can open external Google Maps navigation, explicitly labelled external
  (`driver-workspace.tsx:1468-1480`).

Blocked or missing:

- No turn-by-turn voice guidance, no rerouting on deviation, no traffic-aware ETA.
- No background location in the browser build. Android APK builds exist but have no physical-device
  acceptance; iOS web apps cannot receive location while not visible
  (`docs/mobile-foundation.md:54-58`, `:119-126`).
- No live map provider beyond OSM tiles; OSM usage is subject to its tile policy and network
  availability.
- No GPS breadcrumb history UI for riders; only the latest fix and route.
- No geofence compliance report, no mileage odometer, no driver-declared distance reconciliation.
- Location retention is a script (`scripts/location-retention.cjs`, default 30 days) with a
  PowerShell scheduler helper, not a deployed job; retention execution is **NOT VERIFIED**.

### 3.10 Online time

**Status: IMPLEMENTED**, with reporting caveats.

Implemented:

- Presence is driven by server-written events (`driver.online`, `driver.offline`) in
  `SystemEvent`, not client-supplied minutes (`drive.service.ts:1384-1429`).
- `todayOnlineSeconds` is computed from presence events clipped to the Lagos day
  (`drive.service.ts:1257-1292`).
- `driverSummary` computes pickup seconds (accepted → started) and driving seconds
  (started → completed), and `listDriverRides` derives available seconds as
  `online − pickup − driving` (`:1580-1647`, `:959-969`).
- The workspace shows "Online today" and a three-way time split (`driver-workspace.tsx:711`,
  `:895-910`).

Caveats:

- `todayPickupSeconds` combines the approach drive and the wait at pickup. The schema has
  `acceptedAt`, `arrivedAt`, `startedAt` and `completedAt`, so the two can be separated, but the
  dashboard does not.
- `presenceForDriver` reads at most 500 presence events (`drive.service.ts:1388-1396`), so an
  extremely long history could truncate older same-day events.
- Online time is not exposed as a weekly/monthly report or as a driver statement.
- An expired presence is closed at the TTL boundary by `expireOneDriverPresence`; a device that goes
  offline without a heartbeat stops accruing at that boundary, which is intended.
- Online time is presence time, not "available for a request" time, and it includes pickup approach
  and waiting.

### 3.11 Pickup verification

**Status: IMPLEMENTED and tested.**

Implemented:

- `RideVerification` table with `rideId @unique`, salted scrypt hash, algorithm tag, 2-hour expiry,
  5-attempt cap, attempt count, last-attempt time, verifier and invalidation fields
  (`prisma/schema.prisma:872-892`; migration
  `prisma/migrations/20261111120000_drive_verification_ratings/migration.sql`).
- `acceptRide` issues or rotates the record inside the acceptance transaction
  (`drive.service.ts:440+`).
- `GET /api/drive/rides/[id]/verification` is the only endpoint returning the raw code, and only to
  the rider (`drive.service.ts:1891-1953`).
- `POST /api/drive/driver/rides/[id]/verify` validates assignment, expiry, attempt cap and cooldown,
  persists attempt increments and audits them (`:1954-2100`).
- `driverUpdateRideStatus(in_progress)` re-checks the record in the same transaction and refuses
  `verification_not_issued`, `verification_expired`, `verification_locked` or
  `passenger_verification_required` (`:581-626`).
- Release, expiry and cancellation invalidate the record; re-assignment rotates salt, expiry and
  attempts (`:1139-1155`).
- Support override API requires `rides:write`, a reason and never returns a code (`:2101-2168`).
- Rider and driver UI states cover verified, code, expired and locked
  (`booking-workspace.tsx:837-889`; `driver-workspace.tsx:371-391`).

Tested: `scripts/drive-verification-rating-acceptance.ts` **81/81 on two consecutive runs**
(2026-11-11): wrong, expired, locked and repeated codes; concurrent correct+wrong; concurrent starts;
unauthorized reads/actions; driver payload free of code/hash/salt; support reset/verify audits;
cleanup `leftovers: 0`; SYSTEM restored; reconciliation 0 issues.

Limitations (documented, not hidden):

- The raw code is derivable from the salt stored beside its hash if an attacker has both a full
  database dump and this source. The design protects against driver/API exposure and event-log
  leakage, not full DB+source compromise (handoff §5).
- Pre-existing active rides assigned before the migration have no record; support reset or the rider
  opening the trip screen issues one. This is safe but operationally relevant.
- The support reset/verify action has no Control Center screen.

### 3.12 Receipts and ratings

**Status: IMPLEMENTED; no moderation surface.**

Implemented:

- `GET /api/drive/rides/[id]/receipt` rebuilds `base + distance + time + rounding = fare`, payment
  method/status/reference, cancellation fee and refund adjustments, total charged and a receipt
  reference (`drive.service.ts:2219-2308`). Access is rider, assigned driver or admin.
- Receipt UI shows the itemised fare and payment state (`booking-workspace.tsx:986+`).
- `POST /api/drive/ratings` and `GET /api/drive/ratings/[rideId]`: one rating per
  `(rideId, raterUserId)`, role derived server-side, score 1–5 with a database CHECK, idempotent
  identical retries, 409 on a different rating, aggregates computed from real rating rows
  (`drive.service.ts:2309-2420`; schema `:894-917`).
- Driver and rider see only their own feedback text; aggregates are shown as counts/averages.

Tested: receipts, refund adjustment, rating bounds, duplicates, authorization and aggregate
real-row-only are part of the **81/81** acceptance suite.

Blocked or missing:

- No rating moderation UI and no public driver profile page.
- No rating-based dispatch, no low-rating suspension threshold.
- No PDF/email receipt; the receipt is an on-screen API view.
- Ratings do not affect earnings or incentives.

### 3.13 Safety

**Status: PARTIAL.**

Implemented:

- `RideSafetyReport` table with reporter role, category, details and status
  (`submitted | under_review | closed`), reviewed fields and resolution note
  (`prisma/schema.prisma:919-945`).
- `POST|GET /api/drive/rides/[id]/safety-report`; participant-only; reports are separate from ratings
  and reviews and are never public (`drive.service.ts:2421-2501`).
- Safety report form on the completed trip (`components/drive/ride-rating.tsx`).
- Pickup code verification before start (§3.11).
- "Share trip details" opens the user's messaging app with a text summary; it does not create a
  public live link (`booking-workspace.tsx:782-787`, `:930-938`).
- Help centre explains tracking, stale positions and support limits
  (`app/naijadrive/help/page.tsx:27-32`, `:64-78`, `:106-115`).

Tested: both participants can file, an unrelated account cannot, reports remain separate from
ratings and report text is not emitted as public feedback (81/81 suite).

Blocked or missing:

- No SOS/emergency button, no emergency contact flow, no call to emergency services.
- No Control Center triage queue, status transitions, reviewer assignment or resolution workflow.
- No response-time SLA or on-call process.
- No incident, insurance or claims workflow.
- No driver background checks, vehicle inspection records or document expiry enforcement (see §3.5).
- No live trip link for a trusted contact; only a text summary.
- The help centre correctly states that no telephone line or guaranteed response time is published.

---

## 4. Financial defects — verified status (read-only, not fixed)

Both defects were re-verified from the HEAD source. No fixture was created, no flow was enabled and
nothing was repaired.

**Scope note:** both defects are in the NaijaShop order/escrow path, not in the NaijaDrive ride path.
NaijaDrive wallet fares release through `releaseHoldToDriver`
(`lib/services/core/drive.service.ts:539-578`) and never call `completeOrder`. They are recorded here
because they are the known financial defects in scope and because the same wallet/escrow books would
underpin any future driver payout or cross-vertical settlement.

### 4.1 `completeOrder` releases the full escrow after a partial refund

**Status: PRESENT. The code path is reachable and untested for this case.**

Evidence:

- `lib/services/core/order.service.ts:106-212` — `completeOrder`.
  - `:116` takes `const escrow = order.escrowHolds[0];`
  - `:120` computes
    `const payable = order.subtotalKobo - order.commissionKobo + order.deliveryFeeKobo;`
    It never reads `order.refundedKobo`.
  - `:123` computes `const platformCut = escrow.amountKobo - payable;` from the original hold.
  - `:129-136` (wallet branch) requires and decrements buyer `heldKobo` by `escrow.amountKobo`.
  - `:140-144` (wallet branch) requires and decrements seller `heldKobo` by `escrow.amountKobo`.
  - `:154-162` (external branch) decrements platform `availableKobo` by `payable` and then
    decrements vendor `heldKobo` by `escrow.amountKobo` with **no `gte` guard**.
  - `:183-186` marks the hold `released`.
- `lib/payments/service.ts:685-733` — `refundPayment`.
  - `:715-718` (wallet, open escrow) reduces buyer and vendor `heldKobo` by `requested`.
  - It never updates `EscrowHold.amountKobo`; `recordEscrow` stored
    `amountKobo: order.totalKobo` at `:363-373`.
  - `:836-846` only updates the escrow when `isFullRefund` is true; a partial refund leaves the
    escrow row's `amountKobo` at the original total.
- Reconciliation already accounts for this by using `amountKobo - Order.refundedKobo` as the open
  exposure (`lib/services/core/reconciliation-correct.ts:27-32`, `:201-216`), which confirms the
  stored `EscrowHold.amountKobo` is intentionally not the live exposure.

Consequences:

- **Wallet-paid order, partial refund before release:** the buyer and seller holds are already
  reduced by the refunded amount. `completeOrder` still requires
  `heldKobo >= escrow.amountKobo` (the original total), so the conditional update returns 0 and the
  order is refused with `409 escrow_conflict`. The order cannot be completed; the remaining hold stays
  stuck.
- **External-paid order, partial refund before release:** the platform's stored balance is debited by
  the full `payable` (which ignores the refund), and the vendor's `heldKobo` is decremented by the
  full original escrow amount from an already-reduced hold. This drives the vendor's held balance
  negative and credits the vendor the full pre-refund payable. The platform debit may or may not
  pass depending on its balance and the 2× gap in §4.2; if it passes, the release is financially
  wrong.
- A partially refunded order can still reach `delivered`; nothing in the refund or delivery path
  prevents `completeOrder` from running later.

Test coverage:

- `scripts/wallet-post-release-refund-acceptance.ts` covers release **then** post-release partial
  refund, and separately partial refund before release **without** a following completion. It does
  not cover partial refund **then** `completeOrder`.
- `scripts/wallet-spend-concurrency-acceptance.ts` calls `completeOrder` but not after a partial
  refund.
- The only other scripts that call `completeOrder` are `scripts/naijapay-journey-test.ts` and
  `scripts/naijapay-release-conservation-test.ts`; neither performs a partial refund first.
- Therefore the defect is **not covered by any executed test**.

Owner decision required before a fix: whether a partial refund reduces the releasable escrow, the
vendor payable, the platform commission, or a combination, and in what order. That is a commercial
policy decision, not a mechanical patch.

### 4.2 External escrow 2× projection gap

**Status: PRESENT in the non-wallet branch. Not exercised by current acceptance data; a live-money
blocker.**

Evidence:

- `lib/payments/service.ts:305-374` — `recordEscrow`.
  - `:312` `const amount = input.order.totalKobo;`
  - `:341-344` (non-wallet branch):
    `availableKobo: { increment: amount }` on the SYSTEM wallet, then vendor `heldKobo` += amount.
  - `:345-359` posts a wallet transaction whose SYSTEM leg is a **DEBIT** for `amount`.
  - `:363-373` creates the `EscrowHold` with `amountKobo: amount`.
- Shared reconciliation convention (`lib/services/core/reconciliation-correct.ts:15-22`):
  `availableKobo == ledgerNet − open counterparty hold credits`.
- For the external branch, SYSTEM's journal net is `−amount` and SYSTEM has no counterparty hold
  credit (the open counterparty is the vendor wallet), so expected SYSTEM available is `−amount`.
  The stored SYSTEM available was incremented to `+amount`. The stored position is therefore
  `2 × amount` away from its journal.
- `scripts/payments-funding-webhook-acceptance.ts:1005-1018` explicitly asserts this known gap and
  labels it "reported, not fixed". It is a passing observation, not a correctness test.
- The branch is reachable outside real providers: `walletDebit` is
  `input.provider === "wallet"` (`lib/payments/service.ts:502-507`), so the local `test` adapter
  takes the same non-wallet branch (`:448-458`). It is not limited to Paystack/Flutterwave.

Consequences:

- Every external or `test`-provider escrow leaves SYSTEM's stored available at `+amount` where its
  journal implies `−amount`; the reconciliation-expected position is therefore overstated by
  `2 × amount`. Later releases, refunds and reconciliation operate on a balance that is wrong by
  twice the escrow amount.
- The handoff records the acceptance database as having no external `Payment` rows at the time of the
  last clean run (handoff §1.1b), so the clean projection there does not disprove the defect.
- This remains a blocker before live money and before any external provider is enabled.

Read-only check performed for this audit:

- The database named in `.env` is `naijadeals_core` (name only reported; no credentials printed).
- A read-only `scripts/wallet-reconcile.ts` run against it returned **REVIEW**: 204 wallets,
  0 open rides, 33 open escrows, 15 mismatched wallets, 13 duplicate identities, 0 unattributed
  holds. The SYSTEM row had stored `available = -1,776,097,200`, `held = 82,080,000`, ledger net
  `-1,715,336,200`, expected available `-1,715,336,200`, difference `-60,761,000`. This database
  contains legacy fixture drift and is **not** acceptance evidence. The last recorded clean run was
  on `naijadeals_wallet_acceptance` (17 wallets, 8 open rides, 0 open escrows, 0 mismatches; handoff
  §4).

---

## 5. Test evidence register

| Script | What it covers | Last recorded execution | Status at HEAD |
| --- | --- | --- | --- |
| `scripts/drive-verification-rating-acceptance.ts` | Verification, expiry, lockout, concurrency, support override, receipts, ratings, safety separation, cleanup, reconciliation | **81/81**, two consecutive runs, 2026-11-11, `naijadeals_wallet_acceptance`, RUN_ID `drive-verify-20261112022322-01bb3e18` | Current for the verification slice; not re-run in this read-only audit |
| `scripts/drive-tests.ts` | Quote, booking, hold, race, transitions, release, cancel, cash, release-to-queue, admin cancel, saved places, deadlines, expiry races | **28/28**, 2026-11-03 | Stale: file changed for the pickup gate on 2026-11-11 and **not executed since** |
| `scripts/nairadrive-e2e.ts` | Browser landing, sign-in route preservation, wallet booking, presence, acceptance, tracking, verification, completion, receipt, earnings, online-time persistence, cross-account denial | Not recorded after the 2026-11-11 edit; handoff explicitly says it was not executed | Not current |
| `scripts/drive-deadline-qa.mjs` | Assignment deadline UI/API | 9/9 (2026-11-03 era) | Historical |
| `scripts/drive-map-qa.mjs` | Map legend, route rendering, low-data fallback | 17/17 (2026-11-03 era) | Historical |
| `scripts/drive-saved-places-qa.mjs` | Saved-place search/add/rename/delete | 8/8 (2026-11-03 era) | Historical |
| `scripts/drive-idle-sweep.ts` | Idle assignment sweep | 3/3 (Phase 05 evidence, 2026-11-03) | Historical |
| Playwright preview checks (handoff §4) | Rider code instruction, 4-digit render, driver verification input, receipt/rating at 390/768/1440 | **9/9**, 2026-11-11 | Current visual evidence |
| `scripts/admin-security-tests.ts` | RBAC, region scope, admin boundary, payouts/roles | 19/19, 2026-11-03 | Historical for this slice |
| `scripts/control-center-visual-qa.mjs` | Control Center layout and interactions | 29/29, 2026-11-03 | Historical |
| `scripts/wallet-post-release-refund-acceptance.ts` | Release then partial refund; open-escrow partial refund; duplicates/concurrency | 20/20, 2026-11-11 | Does **not** cover partial refund then completion |
| `scripts/payments-funding-webhook-acceptance.ts` | Mocked provider funding/webhooks, top-ups, external-gap observation | 24/24, 2026-11-11 | Observes §4.2 but does not fix it |
| `scripts/wallet-reconcile.ts` | Read-only projection reconciliation | CLEAN on `naijadeals_wallet_acceptance` (2026-11-11); REVIEW on the local dev DB during this audit | Read-only; no writes |

Not executed for this audit: every suite above that writes fixtures, wallets, ledger rows or rides.
The absence of a re-run is deliberate; the audit is read-only.

---

## 6. Blocked and missing register

| Item | Class | Evidence |
| --- | --- | --- |
| Driver application and approval | BLOCKED | No API/route; `setDriverStatus` refuses `pending`; only seeds create approved profiles |
| Vehicle/document storage and expiry | NOT IMPLEMENTED | `DriverProfile` has licence number only; UI says so |
| Driver payout request/settlement | NOT IMPLEMENTED | `Payout` is vendor-only; no driver route |
| Commission, fees, tips, incentives | NOT IMPLEMENTED | Full fare credited; no fields/config; no rate approved |
| Live card payment / provider sandbox | BLOCKED | No provider credentials; `test` adapter only |
| Scheduled rides | NOT IMPLEMENTED | Help page states unavailable |
| Cancellation fee policy | BLOCKED | `feeKobo = 0`; policy comment at `drive.service.ts:359-366` |
| Surge / airport surcharge | NOT IMPLEMENTED | No code; landing says no airport surcharge |
| Real email/SMS/push | BLOCKED | Transports unconfigured or capture-only |
| Rider ride-detail notification target | BROKEN | Link points to `/naijadrive/rides/[id]`, which does not exist |
| Safety triage workflow | NOT IMPLEMENTED | Model exists; no admin route/UI |
| Verification support UI | NOT IMPLEMENTED | API exists; no Control Center screen |
| Rating moderation | NOT IMPLEMENTED | No admin route/UI |
| Background iOS tracking | BLOCKED BY PLATFORM | `docs/mobile-foundation.md:54-58` |
| Physical Android acceptance | NOT VERIFIED | APK builds recorded; no device run |
| Location retention job | NOT VERIFIED | Script exists; no deployed scheduler evidence |
| Abuja dispatch | NOT IMPLEMENTED | `DRIVE_CITY = "Lagos"`; no Abuja landmarks |
| Real legal/regulatory review | NOT ASSESSED | No counsel review recorded; help page disclaims compliance |

---

## 7. Contradictions between prior reports and the repository

These are documentation/reporting contradictions, not code changes made by this audit.

| Prior report | Actual repository at HEAD |
| --- | --- |
| `docs/architecture.md` (verified 2026-11-03, HEAD `7590af5`) reports 39 models, 19 enums, 25 pages, 70 API handlers, 5 migrations | 164 models, 61 enums, 162 `page.tsx` files, 239 `route.ts` handlers, 66 migrations |
| `docs/architecture.md` says NaijaDrive has "no live GPS/map" | Browser GPS presence/tracking, OSRM routing and OSM tiles are implemented; OSRM answered HTTP 200 during this audit |
| `docs/requirements-matrix.md` says "Live GPS/map telemetry — BLOCKED — No map provider" | OSRM + OpenStreetMap tiles + browser geolocation are implemented; the remaining limits are background iOS tracking, turn-by-turn and physical-device acceptance |
| `docs/requirements-matrix.md` says "Native Android/iOS — NOT STARTED — No mobile project" | `android/` and `capacitor/` exist; `docs/mobile-foundation.md:205-228` records debug and release APK builds. Physical-device acceptance is still missing |
| `docs/phase-tracker.md` says Phase 09 NaijaDrive "NOT STARTED" | A full Lagos ride slice is implemented and accepted in record (booking, dispatch, presence, tracking, verification, receipts, ratings, safety) |
| `docs/requirements-matrix.md` says "Payouts (admin) PASS" without a scope qualifier | Only vendor payouts exist; there is no driver payout model, route or UI |
| `scripts/drive-tests.ts` is carried as 28/28 in the handoff and architecture docs | The file changed for the pickup gate after that run and has not been executed since (handoff §6) |
| `docs/decisions.md` D-003 says "no GPS coordinates sent to client or used for booking" | Booking still uses landmarks, but tracking and route APIs return coordinates and the rider/driver maps consume them (`drive.service.ts:1795-1797`, `:1858-1877`) |
| `docs/ecosystem-delivery-tracker.md` lists "road-network routing" as missing | OSRM road routing with geometry/steps is implemented (`drive.service.ts:1681-1757`) |
| `docs/mobile-foundation.md` references a driver dashboard file at components/functional/driver-dashboard.tsx | That file does not exist; the real driver UI is `components/drive/driver-workspace.tsx` |
| `components/functional/admin-workspace-tabs.tsx:1663` says driver presence and telemetry are not recorded | `DriverProfile.online` and `LocationPing` are recorded; presence has a 120-second TTL |
| `app/business/[vertical]/page.tsx:33-38` presents "Revenue today NGN 8.4M", "Payout queue 418", "Open support 29", "Risk score 92" | No data source backs those figures; they contradict the no-fake-metrics rule |
| `components/functional/onboarding-form.tsx:69` says a saved submission appears in admin | It writes only to `lib/demo-store.ts` localStorage; the real Control Center does not read it |
| `docs/architecture.md` lists Eats/Fresh/Gigs/Stay/Stream as models that do not exist | Those verticals now have models, routes and migrations |

---

## 8. Unverified and not assessed

- **Actual income or market earnings.** No driver earnings ground truth exists; the worked example in
  `driver-economics.md` is an assumption set, not observed income.
- **Competitor terms in Nigeria.** The repository records public-page captures of Uber Nigeria/Kenya
  and Bolt Kenya (structure and homepage), but no verified Lagos fare schedule, commission,
  payout, onboarding, insurance or safety terms. Abuja has no research.
- **Real payment provider behaviour.** No Paystack/Flutterwave sandbox credential or live call is
  recorded; only the local `test` adapter and mocked integrations.
- **Physical device GPS.** Browser geolocation is simulated in the e2e suite; no physical Android or
  iOS acceptance is recorded for the drive flow.
- **OSRM/OSM production availability.** Local OSRM answered 200; deployment configuration,
  capacity, tile policy and failover are not verified.
- **Location retention execution.** The script and scheduler helper exist; no job-run evidence.
- **Legal/regulatory compliance.** No counsel review; the help page explicitly disclaims it.
- **Accessibility beyond automated checks.** Axe checks were recorded as clean on earlier routes;
  no NaijaDrive-specific manual NVDA/VoiceOver pass is recorded.
- **Load and scale.** Two-driver race and concurrency cases exist; no dispatch load, queue backlog or
  large-city capacity test.
- **Email/SMS/push delivery.** Email is capture-only; SMS and push are unconfigured.
- **Driver onboarding/document verification.** No implementation to verify.

---

## 9. Verification performed in this audit

| Check | Result |
| --- | --- |
| `git rev-parse HEAD` | `ecd0e54cd22eb6f547e8646e7bd2ddde3e7e0547` (matches the last reported HEAD) |
| Branch | `naijashop-marketplace` |
| Working tree | Pre-existing modifications and untracked research assets; none touched by this audit. A concurrent uncommitted earnings change remains in the tree (see the note at the top) and is outside the audited HEAD. |
| OSRM probe (read-only) | HTTP 200 for a Computer Village → Victoria Island driving route |
| Read-only wallet reconciliation on the `.env` database (`naijadeals_core`) | REVIEW: 204 wallets, 33 open escrows, 15 mismatched wallets, 13 duplicate identities; not acceptance evidence |
| `npx tsc --noEmit` | Exit 0; no code was changed |
| Code/schema/payment/ledger/UI changes | None |
| Commit / push | None |

The read-only reconciliation output is reported only in aggregate; no credentials, wallet owners or
personal data are included.

---

## 10. What this means for the next slice

The booking-to-completion Lagos ride path is real and has strong service-level verification coverage.
The largest gaps are not visual:

1. Driver onboarding, documents and approvals cannot be operated at all.
2. Driver payouts and any commercial deduction do not exist; the current encoded behaviour transfers
   the full fare.
3. Both financial defects in §4 remain live-money blockers; the partial-refund release case has no
   test.
4. Safety and verification support are captured in data but cannot be triaged in the Control Center.
5. The current 28/28 HTTP suite and the browser e2e are stale relative to HEAD; only the service-level
   81/81 acceptance and the 9/9 visual check are current for the verification slice.

No fix, policy choice or commercial rate is made by this audit.
