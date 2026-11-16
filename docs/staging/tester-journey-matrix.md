# Staging tester journey matrix

Companion to `docs/staging/tester-guide.md`.

This matrix records what a local staging tester can actually exercise on the
current build, what is blocked by missing staging data or configuration, and
what is deliberately outside this test round. It is a readiness matrix, not a
claim that every PASS row has already been executed by a tester. Where a row
cites local automation or recorded evidence, that evidence is named.

## Verified baseline

| Item | Value |
| --- | --- |
| Repository | `C:\Users\User\Documents\naijadeals.com` |
| Branch / source | `naijashop-marketplace`, tester-role commit |
| Staging build | `ygTpeinzqY0L2X5fgwNUL` (`C:/NaijaDeals-Staging/app/.next/BUILD_ID`) |
| Build provenance caveat | The served build ID is authoritative for acceptance. The reviewer confirmed the staging source matches the repository auth/support files except for line endings. |
| Application URL | <http://localhost:3200> (bound to `127.0.0.1`) |
| Database | `naijadeals_staging`, TEST classification |
| Accounts | 5 (3 primary testers, 2 persona accounts) |
| Vendors | 1 (staging-only seller persona) |
| Products | 0 (`GET /api/products` returned `[]`) |
| Published public categories | 0 (`GET /api/categories` returned `[]`) |
| Orders | 0 |
| Published country guides | 0 (`/naijashop/countries` reported "0 published country guides") |
| Payment methods offered | `wallet` only (`GET /api/payments/methods?country=NG`) |
| n8n | `http://127.0.0.1:5680`, health endpoint HTTP 200 |
| External access | **NOT AVAILABLE** — see below |

### External access is blocked

This build is **local only**. Do not attempt an external login and do not treat
the following as tester URLs:

- The Cloudflare zone `naijadeals.com` is still pending nameserver migration.
  Hostinger nameservers remain authoritative.
- The Cloudflare Access organisation is enabled but no Access application can be
  created while the zone is pending. The API refuses application creation with
  `400 domain_does_not_belong_to_zone`.
- The named tunnel exists but is inactive.
- `staging-remote.naijadeals.com` is still an `A` record to `187.127.252.23`
  (the existing VPS), not this staging build. It must not be used for acceptance.

The only working URL is <http://localhost:3200> on the machine that runs the
staging stack.

## Status legend

| Status | Meaning |
| --- | --- |
| **PASS** | Implementation is present, the current staging data/configuration permits the journey, and the expected result is defined. Existing local evidence is cited where available. A tester still performs the journey to confirm the build. |
| **FAIL** | A reproducible defect was found in the current staging build. No FAIL rows are recorded at document creation. Report new failures through support. |
| **BLOCKED** | The journey cannot be completed because a required prerequisite is absent: catalogue data, an order, a ride, a published country guide, a test payment method, or a persona/permission. Do not manufacture the missing prerequisite. |
| **DEFERRED** | Implemented but outside this test round, has no assigned persona, or has no dedicated tester-visible surface. Do not execute without coordinator approval. |

## Shared platform and identity

| ID | Journey | Route(s) | Implementation | Status | Persona | Preconditions / data | Steps to expected result | Automation / evidence | Limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | Sign in | `/login` → `POST /api/auth/login` | Implemented | **PASS** | All five accounts | Own credential from the owner's activation handoff; app running | Open `/login`; enter your own email and password; submit → HTTP 200, session cookie set, landing is role-based: `tester01` → `/admin`; `tester02`/`tester03` → `/account`; seller persona → `/seller`; driver persona → `/account` | `scripts/staging/verify-tester-access.mjs` sign-in checks; `docs/handoff.md` records 36/36 local allowed/denied checks | The driver persona has no driver-aware post-login landing; navigate to `/driver` manually. Use a current Chromium browser on localhost. |
| S2 | Invalid sign-in / auth validation | `/login` | Implemented | **PASS** | Any account | Own email plus a deliberately wrong password | Submit → stay on `/login`; inline `role="alert"` reads "Email or password is incorrect."; no session established | Manual; `app/api/auth/login/route.ts` | Do not repeatedly retry or attempt to lock accounts. |
| S3 | Sign out | Header account/user menu → `POST /api/auth/logout` | Implemented | **PASS** | Any signed-in account | Active session | Sign out → session cookie cleared; `/account` then redirects to `/login?next=/account` | Manual; `lib/auth/session.ts`, `app/api/auth/logout/route.ts` | Control Center sign-out is inside the avatar menu; the Shop header is a separate shell. |
| S4 | Account profile | `/account` | Implemented | **PASS** | Customer roles, including personas | Signed in | Change name and phone; save → "Profile saved."; email and roles remain read-only | Manual; `components/functional/account-page.tsx` | Do not change email or password. |
| S5 | Account addresses | `/account` address panel | Implemented | **PASS** | Testers | Signed in | Add, edit and set a default address → list updates and default marker moves; invalid fields are rejected server-side | Manual; `app/api/account/addresses/*` | Use a clearly fake test address. Do not enter a real home or workplace address. |
| S6 | Password change | `/account` password panel | Implemented | **DEFERRED** | None | N/A | Do not execute. Changing the password signs the account out and invalidates the owner's activation handoff | Implementation present | Credential-handoff integrity; only the owner may reset a tester password. |
| S7 | Unauthorized access boundaries | `/admin`, `/seller`, `/driver`, admin/seller/driver APIs | Implemented | **PASS** | All | Signed in as the wrong role | Customer → `/admin` redirects away; customer → `/seller` redirects to `/sell`; customer → `/driver` redirects to `/naijadrive`; protected APIs return 403; support manager is denied payouts and super-admin | `scripts/staging/verify-tester-access.mjs` (36/36) | Do not probe beyond the documented cases. Report any granted access immediately. |

## Shop

| ID | Journey | Route(s) | Implementation | Status | Persona | Preconditions / data | Steps to expected result | Automation / evidence | Limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | Browse Shop shell | `/naijashop` | Implemented | **PASS** | Any | App running; 0 published products | Load the marketplace → header, delivery-location control, search, cart and department area render; the catalogue is honestly empty and no fake product cards appear | `GET /naijashop` 200; `GET /api/products` `[]`; `GET /api/categories` `[]` | The shell is testable, but there is no catalogue. Any loading indicator must resolve to an empty state. |
| P2 | Browse by category | `/naijashop/categories`, `/naijashop/c/[slug]` | Implemented | **BLOCKED** | Any | At least one published category | A department tree and category listing cannot be exercised: 0 public categories and no category links were returned | `GET /api/categories` returned `[]` | Missing category fixture, not a route crash. Do not create categories or products. |
| P3 | Shop search | `/naijashop/search?q=...` | Implemented | **PASS** | Any | A query, e.g. `phone` or `jollof` | Submit a query → an honest no-results state ("No products match …"); no invented results or prices | Manual; `components/shop/category-browse.tsx` | Relevance, ranking and filters cannot be judged with 0 products. |
| P4 | Product detail and variants | `/product/[id]` | Implemented | **BLOCKED** | Any | One published product | Price, stock, gallery, attribute labels, variant selector and add-to-cart cannot be exercised; an unknown id correctly returns 404 | Historical `npm run test:marketplace` 13/13 on a seeded development database (2026-10-28), **not** current staging | No product fixture. Do not treat the 404 for an unknown id as a defect. |
| P5 | Saved items | `/account` saved items; product save action | Implemented | **BLOCKED** | Testers | A published product | Save/unsave and "add saved item to cart" cannot be exercised; only the empty saved list is available | Historical marketplace suite | 0 products. The empty saved list is not a failure. |
| P6 | Cart empty state | `/cart` | Implemented | **PASS** | Testers | Signed in; empty cart | Open `/cart` → "Your cart is empty"; no checkout action is offered | Manual; `components/commerce/naijashop.tsx` | Add/update/remove is blocked by the empty catalogue. |
| P7 | Cart add/update/remove | `/cart`, `/api/cart` | Implemented | **BLOCKED** | Testers | A product and variant | Add to cart, change quantity, remove, verify totals and stock reservation | Historical marketplace suite | 0 products; no cart mutation fixture. |
| P8 | Checkout | `/checkout`, `/api/checkout` | Implemented | **BLOCKED** | Testers | Non-empty cart, delivery configuration, a demonstrated test payment method | Address, delivery, fees and payment selection cannot be completed. Current staging offers only `wallet` as a payment method; the `test` adapter is not offered | `GET /api/payments/methods?country=NG` returned only `wallet`; `lib/payments/adapters.ts` gates the test adapter behind `ENABLE_TEST_PAYMENTS=true` outside production | **No test-payment procedure exists on this build.** Do not attempt a wallet payment, card payment, transfer or top-up. |
| P9 | Orders | `/orders`, `/orders/[id]` | Implemented | **BLOCKED** | Testers | At least one created order | Order list, detail, cancel/confirm and status history cannot be exercised. The empty state is the honest current result | Historical marketplace suite; staging has 0 orders | An order can only be created through the blocked checkout path. |
| P10 | Returns and refunds | `/returns` | Implemented | **BLOCKED** | Testers | A delivered/completed order inside the return window | The eligibility screen renders "No orders are ready to return"; opening a case, seller decision and refund status cannot be exercised | Historical marketplace suite | 0 eligible orders. Do not fabricate returns or refunds. |

## Support and notification journeys

| ID | Journey | Route(s) | Implementation | Status | Persona | Preconditions / data | Steps to expected result | Automation / evidence | Limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | Create a support/finding ticket | `/contact` or `/account/support` → New enquiry | Implemented | **PASS** | Testers | Signed in; subject 3–160 characters; message 10–8000 characters | Choose the closest service and a topic; submit → a ticket reference is shown and the ticket appears under Account → Support. No email is claimed to have been sent | `scripts/tests/support-http-acceptance.ts` (12/12 creation, 23/23 HTTP per `docs/automation/workflow-matrix.md`); `scripts/staging/verify-tester-access.mjs` creation check | The support form has no attachment field. Screenshots must be named in the message. In-site only; no outbound email/SMS. |
| C2 | Track and reply to your ticket | `/account/support`, `/support/ticket/[reference]` | Implemented | **PASS** | Testers | Own ticket | Open the ticket → messages, status and replies are listed; reply → message appended; a closed ticket disables reply | `scripts/tests/support-reply-acceptance.ts` (20/20); `support-http-acceptance` (23/23) | Refresh to see staff replies. There is no email or push notification. |
| C3 | Testing Manager support inbox | `/admin/support` | Implemented | **PASS** | `tester01` only | `staging_test_manager` role; signed in | After sign-in, go directly to `/admin/support`; filter/search/paginate; open a tester's report; confirm payout and super-admin access are denied | `scripts/staging/verify-tester-access.mjs` (read inbox, deny payouts, deny super-admin; 36/36 total) | There is **no test-management UI**. Findings are ordinary support tickets. The `/admin` landing may show load errors for modules the staging_test_manager role cannot read; ignore those and use the Support inbox. Do not use other Control Center modules. |
| C4 | Manager assign / reply / internal note | `/admin/support/[id]` | Implemented | **PASS** | `tester01` only | A ticket id | Assign to yourself, set status/priority, send a customer-visible reply, add an internal note; the customer must not see the internal note | `scripts/staging/verify-tester-access.mjs` (36/36: assign, internal/public reply, cross-tester denial, expired session) | No attachments. Do not change a ticket to CLOSED unless it is genuinely resolved. |
| C5 | n8n follow-up delivery | `NotificationIntent` → n8n workflow `1lU7ERGPS0jAW7V4` → `POST /api/automation/notifications/drain` | Implemented | **PASS (operator-verified)** | `tester01` observer; testers create the event | A committed ticket/reply; n8n running on `127.0.0.1:5680` | The transactional outbox is drained on the two-minute schedule; one in-app staff notification per ticket/recipient; dedupe, lease and retry prevent duplicates | `docs/automation/workflow-matrix.md`: 12/12 creation, 20/20 reply, 23/23 HTTP; n8n health 200 | Testers must not access n8n. Delivery can take up to about two minutes. In-app records only; no live email/SMS. |
| C6 | Staff-visible follow-up alert | Shared in-app feed `/naijagigs/notifications`; Control Center bell `/admin` | Implemented, but no dedicated staff notification surface | **DEFERRED** | `tester01` observer | Create a ticket, wait for the drain | The shared in-app feed can show "New support ticket <reference>". The Control Center bell currently opens static text: "No notification service is connected." | `lib/notifications/templates.ts`; `components/functional/admin-shell.tsx` | Cross-vertical diagnostic page, not a support workflow. The bell is a known gap: do not report it as a new defect unless its behaviour changes. |

## Seller persona (NaijaShop)

| ID | Journey | Route(s) | Implementation | Status | Persona | Preconditions / data | Steps to expected result | Automation / evidence | Limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L1 | Seller overview | `/seller` | Implemented | **PASS** | `seller persona account` | Vendor is `VERIFIED`; 0 products/orders | Sign in → land on `/seller`; overview shows vendor name/status, zero-valued stats and wallet values; no Control Center access | `scripts/staging/verify-tester-access.mjs` seller overview 200 | Zero figures are the real state. Do not invent or seed orders/products. |
| L2 | Seller orders list | `/seller` Orders section | Implemented | **PASS** | Seller persona | 0 orders | Orders section shows "No orders yet." and no actionable order controls | `getSellerOverview` returns the vendor's orders (currently empty); manual | The order lifecycle is blocked; see L3. |
| L3 | Seller order actions | `/seller` order controls, `/api/seller/orders/[id]/status` | Implemented | **BLOCKED** | Seller persona | At least one order for this vendor | Accept/prepare/ready/reject and fulfilment status changes cannot be exercised | Historical marketplace suite (seller fulfilment PASS) | 0 orders. Do not create an order through the blocked checkout path. |
| L4 | Seller products list | `/seller` Products section | Implemented | **PASS** | Seller persona | 0 products | Products section shows the empty list and the "Add product" control | `getSellerOverview` `productCount` is 0; manual | Do not submit the add-product form; see L5. |
| L5 | Create / publish a product | `/seller` Add product, `/api/seller/products` | Implemented | **BLOCKED** | Seller persona | At least one eligible seller category; Control Center publication | New listings are created as `DRAFT` only. Publication requires the Control Center `products:moderate` permission, which no tester account holds. There are 0 public categories | `lib/services/core/seller.service.ts` (`createSellerProduct` refuses `ACTIVE`); `GET /api/categories` `[]` | Do not create draft products or attempt publication. This mutates shared staging data and cannot complete. |

## Driver persona (NaijaDrive)

| ID | Journey | Route(s) | Implementation | Status | Persona | Preconditions / data | Steps to expected result | Automation / evidence | Limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | Driver workspace access | `/driver` | Implemented | **PASS** | `driver persona account` | `driver` role; driver profile exists | Sign in (lands on `/account`), then open `/driver`; the workspace loads with the driver's service zone and presence controls; a customer is redirected away | `scripts/staging/verify-tester-access.mjs` presence GET 200; manual workspace check | Login has no driver-aware landing. Service zone in staging is Abuja, not Lagos. |
| D2 | Driver presence online/offline | `/driver`, `GET/POST /api/drive/driver/presence` | Implemented | **PASS** | Driver persona | Browser location permission granted | Allow location; Go online → status Online, heartbeat starts, presence TTL 120 s; stop new requests → Offline. Deny location → "A usable browser location is required before you can go online." | `scripts/staging/verify-tester-access.mjs`; `lib/services/core/drive.service.ts` (`DRIVE_PRESENCE_TTL_SECONDS = 120`) | No passenger requests exist. Presence uses the real browser location; do not fake coordinates. A stale heartbeat warning appears after 60 s without a beat. The staging profile's service zone is Abuja, but the go-online success notice text is hardcoded to Lagos; record the displayed text, but do not treat it as proof of a Lagos service area. |
| D3 | Ride acceptance and completion | `/driver`, `/api/drive/driver/rides` | Implemented | **BLOCKED** | Driver + customer | A passenger ride request in the driver's zone | Accept, passenger verification, navigation, complete, cash/release, receipt and earnings cannot be exercised | Historical NaijaDrive work exists, but no current ride fixture or acceptance run | 0 rides. Do not create a passenger ride; that is outside this round. |

## Stay host (NaijaStay)

| ID | Journey | Route(s) | Implementation | Status | Persona | Preconditions / data | Steps to expected result | Automation / evidence | Limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Host landing and application form | `/naijastay/host` | Implemented | **PASS** | Any signed-in tester | None | The host page renders the application form (name/business, phone, country, ID/business reference) and explains that verification happens in the Control Center | `GET /naijastay/host` 200; `app/naijastay/host/page.tsx` | Read-only. Do not submit the form. |
| T2 | Host application, dashboard and approval | `/naijastay/host`, `/naijastay/host/dashboard`, `/api/admin/stay` | Implemented | **DEFERRED** | None assigned | A host record; Control Center `vendors:review` for approval | Apply → `pending`; approve → `verified`; add a property → `pending`; booking after approval. Requires a host persona and an approval path not held by the tester accounts | `app/api/stay/host/route.ts`, `app/api/admin/stay/route.ts` | No host persona was provisioned. The staging_test_manager role cannot approve hosts (`vendors:review` absent). Do not create a host record in this round. |

## Country discovery, navigation and validation

| ID | Journey | Route(s) | Implementation | Status | Persona | Preconditions / data | Steps to expected result | Automation / evidence | Limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G1 | Country discovery directory | `/naijashop/countries` | Implemented | **PASS** | Any | 0 published country guides | The directory renders; search and region controls render and return the honest empty state; it reports "0 published country guides" and does not invent countries or supply claims | `GET /naijashop/countries` 200; `lib/services/countries/discovery.service.ts` | The empty directory is the real state. Filtering cannot be meaningfully judged with 0 guides. Browsing a guide is blocked. |
| G2 | Country guide detail | `/naijashop/countries/[slug]` | Implemented | **BLOCKED** | Any | A published `CountryProfile` | Editorial intro, sourced themes, associated categories/sellers/origin products cannot be exercised | None current | 0 published country guides. Do not create editorial records. |
| G3 | Desktop navigation (shared shell) | `/`, `/account`, `/orders` | Implemented | **PASS** | Any | 1440×900 viewport (also spot-check 1280×800) | Header exposes Services, location, search (where relevant), Earn, Business, Help, Activity and Account; exactly one header; keyboard Tab reaches links with visible focus; no dead primary controls | Manual; historical `npm run qa:visual` 99 checks | No current automated visual run on this staging build. `/naijashop` intentionally uses its own `ShopShell` header; see G5. |
| G4 | Mobile navigation (shared shell) | `/`, `/account`, `/orders` | Implemented | **PASS** | Any | 390×844 viewport (also spot-check 360×800) | Shared bottom navigation exposes Home, Activity, Wallet and Account; the menu opens/closes; no horizontal overflow; touch targets are usable; keyboard focus remains visible | Manual; historical `qa:visual` | No current automated visual run. `/naijashop` intentionally uses its own header and navigation; see G5. |
| G5 | Shop responsive header | `/naijashop/*` | Implemented | **PASS** | Any | 390×844 and 1440×900 | Marketplace header, search, delivery location, Orders/Returns and Cart remain usable at both sizes; one mobile menu; no overlapping cart/actions | Manual; `components/shop/shop-header.tsx` | No catalogue, so only the shell and empty states are observed. |
| V1 | Form validation and error states | `/login`, `/contact`, `/account`, `/naijastay/host` | Implemented | **PASS** | Testers | Invalid inputs | Invalid login shows the auth alert; a too-short ticket subject/message shows inline field errors; missing address fields are rejected; no false "success" message | Manual; `app/api/auth/*`, `lib/services/core/support.service.ts`, account service | Use synthetic test input only. Do not paste real personal data. |
| V2 | Authorization and role boundaries | `/admin`, `/seller`, `/driver`, related APIs | Implemented | **PASS** | All | Signed in under each persona | Each role reaches only its surface; the support manager is denied payouts and super-admin; personas are denied seller/support consoles | `scripts/staging/verify-tester-access.mjs` 36/36 | Do not perform broad IDOR or permission probing. Report an unexpected grant immediately. |
| V3 | Driver geolocation denial | `/driver` | Implemented | **PASS** | Driver persona | Location permission denied or unavailable | Attempting to go online shows "A usable browser location is required before you can go online." and does not set online presence | Manual; `components/drive/driver-workspace.tsx` | Reset the browser permission to retest the allowed path. |

## Blocking gaps (must be resolved before the affected journey can pass)

1. **No Shop catalogue data.** 0 products and 0 published public categories
   block product detail, variants, saved-item actions, cart mutation, checkout,
   orders and returns. A route returning 200 is not evidence that these
   journeys work.
2. **No demonstrated test payment.** The running staging build offers only the
   `wallet` payment method. The local `test` adapter is gated and not offered.
   Checkout and payment cannot be accepted on this build.
3. **No orders.** Customer order tracking, returns/refunds, seller order
   actions and driver ride lifecycles have no fixture.
4. **No published country guides.** The Discover Africa directory is empty, so
   country guide detail is blocked.
5. **No dedicated staff notification surface.** Support follow-up notifications
   are delivered as in-app records, but the Control Center bell is a static
   placeholder. The shared `/naijagigs/notifications` feed is a diagnostic
   workaround, not a support workflow.
6. **No host persona or tester-held host approval.** Stay host application,
   verification and listing approval are deferred.
7. **External tester access is blocked by DNS/Cloudflare state.** Only
   `http://localhost:3200` is valid. `staging-remote.naijadeals.com` does not
   point at this build.
8. **Driver login landing is not role-aware.** The driver persona lands on
   `/account` and must navigate to `/driver` manually.
9. **Support has no attachment upload and no outbound email/SMS.** Findings are
   text-only in-app tickets; screenshots must be named in the message and kept
   outside Git.

## Implementation references

- Canonical vertical registry: `lib/data/ecosystem.ts`
- Auth/session/roles: `lib/auth/session.ts`, `lib/auth/permissions.ts`,
  `components/functional/auth-page.tsx`, `app/api/auth/*`
- Account: `app/account/page.tsx`, `components/functional/account-page.tsx`
- Shop: `app/naijashop/*`, `components/shop/*`,
  `components/commerce/naijashop.tsx`, `app/product/[id]/page.tsx`,
  `app/cart/page.tsx`, `app/checkout/page.tsx`, `app/orders/page.tsx`,
  `app/returns/page.tsx`
- Checkout/payments: `app/api/checkout/route.ts`,
  `lib/services/core/checkout.service.ts`, `app/api/payments/*`,
  `lib/payments/adapters.ts`
- Support: `lib/services/core/support.service.ts`, `app/contact/page.tsx`,
  `app/account/support/page.tsx`, `app/support/ticket/[reference]/page.tsx`,
  `app/admin/support/*`, `app/api/support/*`, `app/api/admin/support/*`
- Seller: `app/seller/page.tsx`, `components/functional/seller-dashboard.tsx`,
  `lib/services/core/seller.service.ts`
- Driver: `app/driver/page.tsx`, `components/drive/driver-workspace.tsx`,
  `app/api/drive/driver/presence/route.ts`, `lib/services/core/drive.service.ts`
- Stay host: `app/naijastay/host/page.tsx`,
  `app/naijastay/host/dashboard/page.tsx`, `app/api/stay/host/route.ts`
- Country discovery: `app/naijashop/countries/page.tsx`,
  `lib/services/countries/discovery.service.ts`
- Navigation: `components/shell/app-shell.tsx`,
  `components/shop/shop-header.tsx`
- Notifications/automation: `lib/notifications/intent.service.ts`,
  `lib/notifications/templates.ts`, `app/api/automation/notifications/*`,
  `docs/automation/workflow-matrix.md`
- Tester access check: `scripts/staging/verify-tester-access.mjs`
