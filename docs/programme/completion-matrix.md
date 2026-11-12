# Programme completion matrix

Read-only inventory of the NaijaDeals programme. No code, schema, database, migration, commit or
deployment was produced for this document.

## Baseline

| Item | Recorded value |
| --- | --- |
| Repository | `C:\Users\User\Documents\naijadeals.com` |
| Branch | `naijashop-marketplace` |
| HEAD | `7fab2a0f075f1dd179ad3617ff76bde85979aef1` ("feat(drive): key pickup verification with a versioned server secret") |
| Working tree | Dirty. At first snapshot 13 tracked files were modified and 108 untracked entries were present. The tree changed during the session through concurrent work (113 untracked entries at the final check). |
| Uncommitted code of programme relevance | Review-moderation API/panel, courier-assignment UI, admin navigation changes, `scripts/naijashop-control-center-tests.ts`, plus unrelated research assets and scratch scripts. These are **not** counted as delivered in this matrix. |
| Inventory method | Static inspection only: `git`, `find`, `grep`, file reads. No test suite was executed, no browser run was performed, no database row was read or written. |
| Counted surface at HEAD | 164 Prisma models, 61 enums, 69 migrations, 241 API route files, 162 `page.tsx` files, 181 TSX components, 85 service files. The working tree adds one untracked API route and two untracked TSX components. |
| Date | 2026-11-05 environment date. Repository documents also carry 2026-11-08 to 2026-11-12 dates; that inconsistency is recorded in §7. |

## Status definitions

| Status | Meaning in this document |
| --- | --- |
| **VERIFIED** | An executed test, browser run or named acceptance run is recorded with a command or evidence identifier, a result and a date/commit, and the result is consistent with the inspected code. Prior scores without a command or artifact are not enough. |
| **IMPLEMENTED** | The model, service, route and/or surface exist in the committed tree and the code path is coherent, but no current acceptance run for the capability is recorded. |
| **BLOCKED** | Material code/surface exists or is deliberately absent because an external decision, credential, licence, provider, device or business rule is required. |
| **NOT STARTED** | No model, route, service or UI for the capability exists. |

No suite was re-executed for this inventory. "VERIFIED" therefore means an executed run is recorded
at the cited date/commit and the code inspected is consistent with it; it does not automatically mean
the capability was re-executed at HEAD. Rows where the cited run predates later code changes say so.

Counts below are **row counts**, not unique features. A capability referenced by two verticals is
counted in each vertical where it appears.

## 1. Verified and implemented verticals

### 1.1 Rides — NaijaDrive

Canonical routes: `/naijadrive`, `/naijadrive/help`, `/driver`; 22 `app/api/drive/**` handlers.
Models: `DriverProfile`, `Ride`, `RideEvent`, `RideVerification`, `RideRating`, `RideSafetyReport`,
`SavedPlace`. Partner workspace: `/driver`. Admin controls: `/admin?module=drive` plus
`/api/admin/rides*`, `/api/admin/drivers/[userId]/status`, `/api/admin/rides/verification`.
Tests: `drive-tests.ts`, `drive-verification-rating-acceptance.ts`, `nairadrive-e2e.ts`,
`drive-*-qa` scripts. Reference: Uber Nigeria ride page and Uber/Bolt Kenya public structure only
(see reference index).

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Customer quote, request, dispatch and trip lifecycle | Uber NG page structure; `drive-tests.ts` 28/28 recorded 2026-11-03; `docs/nairadrive/current-state-audit.md` §3.1 | Server quotes for four classes, wallet hold, open-queue acceptance, cancellation/expiry, tracking and completion | Suite changed after the pickup gate and has not been re-run; `nairadrive-e2e.ts` not executed after its edit; no card, scheduled ride or surge | Re-run HTTP and browser suites at current HEAD; schedule/surge only after policy approval | Backend agent + QA agent | `drive-tests.ts` and `nairadrive-e2e.ts` pass on an isolated DB at this HEAD | IMPLEMENTED |
| Driver workspace, presence and online time | `docs/nairadrive/current-state-audit.md` §3.3, §3.10; `/driver`, `components/drive/driver-workspace.tsx` | Online/offline presence, 12 s board polling, trip actions, earnings, wallet, vehicle and support tabs | No push for a new request; no shift or destination filter; browser e2e not current; physical device unverified | Add push/queue notification after a provider decision; re-run browser journey | Frontend agent + Backend agent | Driver online → accept → verify → complete in a recorded browser run | IMPLEMENTED |
| Protected pickup verification | `docs/nairadrive/pickup-verification-security.md`; `drive-verification-rating-acceptance.ts` 172/172 on four runs, final RUN_ID `drive-verify-20261112051929-4b362c1a` | Server-keyed 4-digit code, expiry, attempt cap, cooldown, lockout, support reset/verify, key versioning and fail-closed 503 | No key-status screen; pre-existing active rides need rider/support reissue | Keep the service test in the regression gate; add key-status operator view | Backend agent + Security agent | 172/172 at current HEAD plus unauthorised/expired/locked/rotation cases | VERIFIED |
| Receipts and participant ratings | Part of `drive-verification-rating-acceptance.ts` 172/172; `GET /api/drive/rides/[id]/receipt`, `/api/drive/ratings*` | Itemised fare receipt, one rating per participant per ride, real-row aggregates | No PDF/email receipt; no rating moderation; ratings do not affect dispatch | Add receipt download only after a document-generation decision; rating moderation is an admin slice | Backend agent | Receipt math, duplicate rating, cross-account denial recorded | VERIFIED |
| Safety reporting | `docs/nairadrive/current-state-audit.md` §3.13; `RideSafetyReport`, `/api/drive/rides/[id]/safety-report` | Participant-only report capture; status fields exist | No SOS, triage queue, SLA, reviewer workflow or incident/insurance process | Build an admin safety queue and define response policy | Backend agent + Ops agent | Report filed by both roles; unrelated account denied; triage transition audited | IMPLEMENTED |
| Driver onboarding, vehicle documents and approval | `docs/nairadrive/current-state-audit.md` §3.5; `DriverProfile` lacks document fields; `setDriverStatus` refuses `pending` | Driver profile stores licence number, vehicle and status | No application route, document upload/expiry, background check or approval from `pending`; seeds create approved drivers | Build application→document upload→verification→approval. A KYC/document vendor decision is required | Backend agent + Ops agent | Real applicant becomes approved through the UI/API; expiry reminder fires | BLOCKED |
| Driver payouts, commission and statements | `docs/nairadrive/current-state-audit.md` §3.6; `market-registry.md` M4 | Full fare credited to the driver wallet; cash recorded separately; earnings view is real | `Payout` is vendor-only; no commission, payout request, schedule, fee, statement or tax treatment | Decide commission/payout policy, then add driver payout lifecycle on the shared ledger | Payments agent | Payout request → approval → balanced debit; overdraw and duplicate rejection | BLOCKED |
| GPS, map and navigation | `docs/nairadrive/current-state-audit.md` §3.9; OSRM probe HTTP 200 during audit | Browser geolocation, OSRM road routes, OSM tiles, saved places, stale-position handling | No turn-by-turn, rerouting, traffic ETA, background iOS tracking or physical-device acceptance | Add a routing/guidance provider only after a licence decision; retain OSM fallback | Platform agent | Recorded device run with route, tracking and stale/failover cases | IMPLEMENTED |
| Ride notifications | `docs/nairadrive/current-state-audit.md` §3.8; `lib/notifications/domain-events.ts` | In-app partner notification rows and durable outbox | Notification href `/naijadrive/rides/[id]` has no page; rider has no feed; no push | Add rider ride-detail route and feed; push depends on provider | Frontend agent + Backend agent | Rider receives a notification whose link resolves; driver sees new-request signal | BLOCKED |
| Control Center drive operations | `docs/nairadrive/current-state-audit.md` §3.7; `components/functional/admin-drive-verification.tsx`; `/api/admin/rides*` | Trips, drivers, finance, audit, cancel, suspend/reactivate, pickup-verification support desk | No safety queue, rating moderation, online-time history or driver approval; stale "not recorded" copy | Build safety and driver-approval panels; correct stale copy | Frontend agent | Admin lists, cancels, suspends and resolves verification with before/after audit | IMPLEMENTED |

Counts: VERIFIED 2, IMPLEMENTED 5, BLOCKED 3, NOT STARTED 0.

### 1.2 Shop (retail) — NaijaShop

Canonical routes: `/naijashop` (storefront), `/naijashop/{categories,c/[slug],search,deals,bestsellers,sellers,plus,help}`,
`/product/[id]`, `/cart`, `/checkout`, `/orders`, `/orders/[id]`, `/tracking/[id]`, `/seller`, `/sell`.
APIs: `/api/products`, `/api/categories`, `/api/cart*`, `/api/checkout`, `/api/orders*`,
`/api/seller/*`, `/api/reviews`, `/api/storefront`. Models: `Vendor`, `Category`, `Product`,
`ProductImage`, `ProductVariant`, `InventoryStock`, `Cart`, `CartItem`, `Order`, `OrderItem`,
`OrderStatusEvent`, `ReturnRequest`, `Review`, `SellerApplication`, `StorefrontConfig`.
Partner workspace: `/seller`. Admin controls: `/admin?module=shop` plus
`/api/admin/{products,orders,vendors,applications,deliveries,payments,disputes,storefront}` and
`/api/admin/reviews/[id]`.
Tests: `marketplace-tests.ts`, `naijashop-*` QA and discovery scripts, `storefront-acceptance.mjs`,
wallet/escrow acceptance suites. Reference: Amazon.com public journey (homepage/search/product/
add-to-cart/empty cart); Jumia and Jiji blocked (see reference index).

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Storefront discovery, search, filters and sort | Amazon homepage/search; `scripts/naijashop-qa.cjs` 43/43 (`qa-artifacts/naijashop/qa-result.json`), `naijashop-four-card-qa.cjs` 70/70, `naijashop-mobile-qa.cjs` 85/85 (2026-11-09); `docs/naiqashop/surface-audit.md` | Department rail, category browse, search results, deal/bestseller routes, URL-backed discovery | No suggestions; facets limited; `docs/naiqashop/requirement-matrix.md` "discovery 17/17, browser 21/21" has no command/output artifact | Re-run `naijashop-discovery-tests.ts` and a browser suite; add suggestions on the product index | Frontend agent + QA agent | Filter/sort/page/search change results; counts truthful; typo/empty states | VERIFIED |
| Product detail and variant purchase | Amazon product buy box; `docs/naiqashop/surface-audit.md` gap 10; `components/shop/product-card.tsx` | Product detail with variant select, quantity and stock; API enforces variant choice | Grid "Add to Cart" still calls `addCartItem` without a variant; variant products are not purchasable from the grid | Route variant cards to detail/options, or open a variant picker | Frontend agent | Variant product purchasable from grid without `variant_required` error | IMPLEMENTED |
| Cart, checkout, escrow and order creation | Amazon add-to-cart/cart states; `marketplace-tests.ts` 13/13 (2026-11-03) and 12/13 (2026-11-09); wallet/escrow suites 156/156, 89/89, 24/24, 20/20, 78/78 (2026-11-11/12) | Server-priced cart, atomic stock reservation, per-vendor orders, escrow hold, delivery zone and fee | Full Shop suite not re-run after the 2026-11-12 escrow/refund repairs; one 2026-11-09 failure was the escrow finding now repaired | Re-run marketplace suite on isolated DB; keep financial suites in the gate | Backend agent + QA agent | Marketplace 13/13 at current HEAD; oversell, duplicate payment and refund cases | IMPLEMENTED |
| Order lifecycle, cancellation and refunds | `docs/handoff.md` 2026-11-12 escrow/refund sections; `wallet-post-release-refund-acceptance.ts` 20/20 | Status machine, customer confirm, cancellation, refund-aware release, reservation lifecycle | External legacy escrows refuse with `escrow_conflict`; no provider refund-status API; dispute release disabled by default | Keep operator reconciliation; enable dispute release only after policy sign-off | Payments agent | Release after partial refund; full refund no release; duplicate/race refusal | IMPLEMENTED |
| Returns | `docs/naiqashop/surface-audit.md` gap 8; `ReturnRequest`, `/api/seller/returns/[id]` | Whole-order return request with seller resolution | Seller-only; no admin queue, return window, label or line-level return; no customer end-to-end run recorded | Add admin returns queue and line-level policy after a returns policy decision | Backend agent + Ops agent | Customer request → seller/admin decision → refund/restock with audit | IMPLEMENTED |
| Courier assignment for paid orders | `docs/naiqashop/surface-audit.md` gap 1; HEAD `assignCourier` API; uncommitted `admin-delivery-assignment.tsx` | `assignCourier` validates courier active and order ready; no committed Control Center control | At HEAD fulfilment dead-ends after `ready_for_pickup`; working tree adds the UI but is uncommitted and untested | Commit and test the assignment panel; enforce verified courier | Frontend agent + Backend agent | Admin assigns courier; courier sees delivery; suspended/unapproved courier refused | IMPLEMENTED |
| Seller product and profile tools | `docs/naiqashop/surface-audit.md` gap 9; `/seller`, `/api/seller/*` | Product create/edit, stock, publish, orders, returns, profile and ledger earnings | No variant editor, price-edit UI, draft/review gate, payout request/history or staff model | Build variant/price editor and payout request after policy approval | Frontend agent + Backend agent | Seller edits variant price; change reflected publicly; audit row | IMPLEMENTED |
| Seller payouts | `/api/admin/payouts*`, `Payout` model; `docs/naiqashop/surface-audit.md` | Admin-created vendor payouts with ledger debit | No seller request/history; no live payout provider | Add seller request and history after payout policy and provider approval | Payments agent | Request → admin approval → payout debit; duplicate/overdraw refused | NOT STARTED |
| Seller staff and scoped roles | `docs/naiqashop/surface-audit.md` role section | Only the vendor owner account is supported | No vendor staff model or scoped capabilities | Add vendor membership and scoped permissions | Backend agent | Staff sees only granted capabilities; owner can revoke | NOT STARTED |
| Receipt and invoice | `docs/naiqashop/surface-audit.md` gap 7 | Order detail shows totals and payment state | No printable/downloadable receipt, tax line or payment reference document | Add receipt route after tax/invoice format decision | Backend agent | Owner downloads receipt; non-owner 403; totals match order | NOT STARTED |
| Public seller profile | `docs/naiqashop/surface-audit.md` gap 5; `/naijashop/sellers` is a recruitment page | Vendor name shown on cards and product | No public seller route, policy page or rating aggregate | Add public seller route scoped to verified catalogue | Frontend agent | Seller name links to real catalogue and policy | NOT STARTED |
| Wholesale / B2B shop pricing | No reference research; `SaleMode` has only `escrow` and `contact` | Retail escrow and contact-seller modes | No wholesale price tiers, minimum order, tax invoice or B2B approval | Decide whether B2B belongs in Shop or Fresh bulk quotes | Product/Backend agent | Wholesale tier visible and enforced server-side | NOT STARTED |
| Reviews and moderation | `docs/naiqashop/surface-audit.md` gap 2; `Review` model, `/api/admin/reviews/[id]` | Reviews created `PENDING`; live review cycle produced 25 approved reviews and real ratings | At HEAD no committed admin review list/panel; working tree adds it | Commit and test the review panel; add rating recomputation assertions | Frontend agent + Backend agent | Pending review approved → public rating changes; customer cannot moderate | IMPLEMENTED |

Counts: VERIFIED 1, IMPLEMENTED 7, BLOCKED 0, NOT STARTED 5.

### 1.3 Food — NaijaEats

Canonical routes: `/naijaeats`, `/naijaeats/{cart,orders,orders/[id],restaurants,restaurants/[slug],restaurants/cuisine/[cuisine],search,favourites,catering,courier,help}`,
`/restaurant`, `/restaurant/apply`, `/courier`. APIs: `/api/eats/*` (13), `/api/restaurant/*` (4),
`/api/courier/eats` (1), `/api/admin/eats/*`, `/api/admin/restaurants/*`,
`/api/admin/restaurant-applications/*`. Models: `Restaurant`, `Dish`, `MenuItem`,
`RestaurantRating`, `FoodCartItem`, `EatsFavourite`, `FoodOrder*`, `FoodDispatch`, `DispatchOffer`,
`RestaurantApplication`. Partner workspace: `/restaurant` (kitchen), `/naijaeats/courier` (rider).
Admin controls: `/api/admin/eats/*`, `/api/admin/restaurants/*`,
`/api/admin/restaurant-applications/*` plus the `AdminFoodOrders` and `AdminKitchenApplications`
panels rendered inside the Shop module. Tests: `naijaeats-functional-check.cjs`,
`naijaeats-cart-check.cjs`, `naijaeats-operator-check.cjs`, `naijaeats-delivery-e2e.cjs`,
`naijaeats-dispatch-failure.cjs`. Reference: Bolt Food Lagos address gate only; Uber Eats blocked
(see reference index).

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Storefront and menu discovery | Bolt Food address-first header; `naijaeats-functional-check.cjs` 23/23 (2026-11-09) | Cuisine/category/search filters, restaurant pages, real menus, ratings | No dish imagery for 279 of 298 dishes; no cart/checkout observation in reference | Keep "pending photo" labels; do not fabricate dish art | Frontend agent | Filters narrow real list; menu prices match; no page errors | VERIFIED |
| Basket and checkout | Existing marketplace patterns; `naijaeats-cart-check.cjs` 13/13 | Server-side basket, quantity cap, per-kitchen checkout, wallet payment | Single-kitchen orders only; no delivery/service fee approved | Decide fee policy before adding charges | Backend agent | Basket persists; checkout debits exactly total; guest/cross-kitchen denial | VERIFIED |
| Kitchen operator console | `naijaeats-operator-check.cjs` 9/9 | Kitchen queue, accept → preparing → ready, ownership enforcement | No kitchen prep-time analytics or menu scheduling | Add only after operator demand | Frontend agent | Kitchen advances state; unrelated account 403; jump refused | VERIFIED |
| Dispatch, rider assignment and delivery PIN | `naijaeats-delivery-e2e.cjs` 22/22; `naijaeats-dispatch-failure.cjs` 6/6 | Offers to Send couriers and Drive drivers, 60 s expiry, competing acceptance race, pickup/delivery PIN, balanced settlement | No traffic/ETA/live map; Eats still uses its own dispatch engine, not Send's state machine | Decide whether to unify with Send's state machine | Backend agent | Dispatch → accept → PIN → settlement once; offline path marks failed | VERIFIED |
| Rider workspace | `naijaeats-delivery-e2e.cjs`; `/naijaeats/courier` | Live offers, accept/decline, pickup and delivery PIN entry | Non-provider messaging only; no push | Add push after provider decision | Frontend agent | Rider sees assigned offer; wrong PIN and unassigned provider refused | VERIFIED |
| Restaurant onboarding and menu publishing | `docs/handoff.md` 2026-11-03 restaurant onboarding; `partner-lifecycle-tests.mjs` 9/9 | Application → admin approval (idempotent) → menu draft/publish/unavailable → discovery | Real restaurant onboarding not exercised; only demo kitchens | Onboard one real kitchen through the same route | Backend agent + Ops agent | Real application approved; published item appears; suspension blocks writes | VERIFIED |
| Catering, events and bulk orders | `/naijaeats/catering` honestly states brokered only | Informational page linking to kitchens | No self-serve catering pipeline | Build only after catering commercial terms | Product agent | Catering request creates a trackable order | NOT STARTED |
| Admin kitchen/order controls | `docs/handoff.md` 2026-11-03 ordering/dispatch; `AdminFoodOrders`, `AdminKitchenApplications` | Order list, courier assignment, kitchen application review, restaurant status | Eats module itself is "overview only"; controls live inside the Shop module; no Eats admin module | Move Eats controls into the Eats module and test permissions | Frontend agent | Admin sees kitchen orders and applications under Eats; audited | IMPLEMENTED |
| Ratings and reviews | `RestaurantRating` model; functional check | One rating per delivered order; real averages | No moderation UI; no review text policy | Add review moderation if text is introduced | Backend agent | Rating denied before delivery; duplicate denied; average from real rows | IMPLEMENTED |

Counts: VERIFIED 6, IMPLEMENTED 2, BLOCKED 0, NOT STARTED 1.

### 1.4 Deliveries and Freight — NaijaSend

Canonical routes: `/naijasend` plus 18 subpages (19 page files including the landing page), including `/naijasend/{ship,quote,shipments/[id],track,track/[trackingNumber],orders,providers,transporter,dashboard,driver/jobs,driver/earnings,enterprise,help}`,
`/courier`, `/tracking/[id]`. APIs: `/api/send/*` (12), `/api/deliveries/*` (2), `/api/courier/*` (3),
`/api/admin/{freight,deliveries,couriers,send/providers}`. Models: `FreightRequest`, `FreightEvent`,
`LogisticsShipment`, `ShipmentPackage`, `LogisticsProvider`, `ProviderVehicle`, `ShipmentQuote`,
`ShipmentLeg`, `ShipmentEvent`, `ShipmentProof`, `ShipmentAssignment`, `ShipmentPickup`, `Courier`,
`Delivery`, `TrackingEvent`. Partner workspaces: `/naijasend/transporter/dashboard`,
`/naijasend/driver/*`, `/courier`. Admin controls: `/admin?module=send` plus
`/api/admin/{freight,deliveries,couriers,send/providers}`. Tests: `naijasend-e2e.cjs`,
`naijasend-transport-e2e.cjs`, `naijasend-responsive-qa.cjs`, `partner-lifecycle-tests.mjs`.
Reference: uShip, Freightos, GIG Logistics public pages; DHL blocked; Maersk/FedEx/Uber Freight not
inspected.

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Marketplace request, quotes, compare and booking | uShip/Freightos; `naijasend-e2e.cjs` 46/46 (2026-11-09) | Cargo-first request, provider quotes, cheapest comparison, wallet debit, competing quotes declined | No live carrier rate cards; commission 5% inherited and unapproved | Obtain commercial terms before enabling external providers | Backend agent | Unverified provider refused; booking debits quote once; duplicate refused | VERIFIED |
| Transport state machine, assignment and PINs | `naijasend-transport-e2e.cjs` 37/37 | 20-state machine, assignment record, hashed pickup/delivery PIN, version and idempotency | No outbound event bus or dead-letter replay | Add queue only if cross-service events require it | Backend agent | Concurrent pickup one winner; stale version refused; replay no-op | VERIFIED |
| Shipment tracking | `naijasend-e2e.cjs` 46/46; `/naijasend/track/[trackingNumber]` | One authoritative tracking record by number or origin order; cross-account 403 | No GPS breadcrumb history; milestones only | Add breadcrumb view after retention policy | Frontend agent | Tracking resolves same record; other account 403 | VERIFIED |
| Legacy freight quote and operator milestones | GIG Logistics; `docs/handoff.md` 2026-11-03 freight journey | FreightRequest intake, operator quote/assign/in-transit/delivered, FreightEvent timeline | No automated carrier milestones; operator-entered | Replace with provider integration when contracted | Backend agent | Quote → assign → in transit → delivered with 4 events | VERIFIED |
| Provider onboarding and transporter workspace | `naijasend-e2e.cjs`; `/naijasend/transporter/*`, `/naijasend/driver/*` | Application, admin verification, quote queue, active jobs, fleet, navigation | No live fleet; no contracted rates | Onboard one real provider | Backend agent + Ops agent | Non-admin cannot self-verify; assigned provider advances only its leg | VERIFIED |
| Cross-vertical shipment creation | `docs/handoff.md` NaijaSend transport section; `/api/send/logistics/from-order` | Fresh order creates one shipment; repeat returns same; Shop/Eats resolvers implemented | Eats resolver not exercised in a test; Shop seller-screen trigger absent | Exercise Eats resolver; add seller trigger | Backend agent | Repeat call returns same shipment; origin immutability | IMPLEMENTED |
| Enterprise and government logistics | uShip/Freightos two-sided patterns; `/naijasend/enterprise` | Honest route and RFP framing; normal marketplace booking | Contracted rates, invoices, multi-user approval and procurement onboarding absent | Build after enterprise commercial terms | Product/Backend agent | Corporate account books under one entity with approval | BLOCKED |
| Air, sea and rail carrier integration | No live carrier reference | Multimodal legs and operator-recorded milestones flagged `simulated` | No carrier API, customs documentation, claims or live vessel/flight data | Contract a carrier/forwarder; define customs/claims workflow | Integrations agent | Carrier milestone received and reconciled | BLOCKED |
| Turn-by-turn and live navigation | uShip/Freightos do not cover Africa navigation | OSM tiles and straight-line distance, labelled as such | No routing engine, traffic or turn-by-turn | Add routing provider after licence decision | Platform agent | Route guidance rendered with provider attribution | BLOCKED |
| Control Center shipment oversight | `docs/handoff.md` NaijaSend; `/admin?module=send&tab=logistics` | Provider verification tab, freight tab, courier/delivery tabs | No per-shipment operations view; no claims queue | Add shipment detail and claims queue | Frontend agent | Admin opens a shipment, sees legs, events and provider | IMPLEMENTED |

Counts: VERIFIED 5, IMPLEMENTED 2, BLOCKED 3, NOT STARTED 0.

### 1.5 Services — NaijaGigs

Canonical routes: `/naijagigs` plus 16 subpages (17 page files including the landing page), including `/naijagigs/{services,services/[slug],professionals,professionals/[id],jobs,post-job,bookings,pro,pro/apply,pro/dashboard,notifications}`.
APIs: `/api/gigs/*` (18), `/api/admin/gigs/*` (5). Models: `ProfessionalProfile`,
`ProfessionalCategory`, `ServiceCategory`, `ServiceListing`, `ServiceListingImage`, `ServicePackage`,
`PortfolioItem`, `ServiceArea`, `AvailabilitySlot`, `CustomerJob`, `JobProposal`, `ServiceBooking`,
`BookingMilestone`, `Conversation`, `Message`, `ServiceReview`, `ServiceDispute`, `ServiceSpotlight`,
`GigSiteConfig`. Partner workspace: `/naijagigs/pro` (apply/dashboard). Admin controls:
`/api/admin/gigs/*` only; no committed Control Center module. Tests: `gigs-e2e-tests.mjs`,
`gigs-journey-browser.cjs`, `gigs-visual-qa.cjs`, `gigs-route-crawl.cjs`.
Reference: none. Taskrabbit/Upwork/Fiverr appear only in a research plan; no inspection is recorded.

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Discovery, service detail, booking and escrow | No reference inspection; `gigs-e2e-tests.mjs` 42/42; `gigs-journey-browser.cjs` 20/20 (2026-11-08) | URL-driven discovery, service/professional detail, booking, wallet escrow, release at 12% commission | No reference research; commission inherited, not approved | Obtain commercial/commission approval; add reference research before redesign | Backend agent | Apply → verify → publish → book → pay → release once | VERIFIED |
| Professional onboarding and verification | `gigs-e2e-tests.mjs` 42/42; `/naijagigs/pro/apply`, `/naijagigs/pro/dashboard` | Application PENDING, admin `gigs:moderate` verification, publish gate | No document/KYC verification; only admin approval | Add document/KYC only after a verification policy | Backend agent + Ops agent | Unverified pro cannot publish; admin verification audited | VERIFIED |
| Reviews and earnings | `gigs-journey-browser.cjs` 20/20 | Review after COMPLETED, one per booking; pro net earnings shown | No pro payout request or statement | Add payout after policy | Backend agent | Review before completion refused; earnings match ledger | VERIFIED |
| Disputes | `ServiceDispute` model; `/api/gigs/bookings/[id]/dispute`, `/api/admin/gigs/disputes/[id]` | Customer dispute route and admin decision route | No Control Center UI or recorded dispute acceptance run | Add admin dispute panel and test | Backend agent | Dispute opened, resolved, funds conserved | IMPLEMENTED |
| Admin moderation and operations | `/api/admin/gigs/*`; `adminGigOverview` | Overview, listings, professionals, reviews, disputes APIs | No Control Center module; API-only | Build Gigs admin module or place panels in ecosystem | Frontend agent | Admin sees real rows, acts, audit written | IMPLEMENTED |
| Demonstration-data isolation | `docs/handoff.md` 2026-11-08 demo isolation gate | Sample pros/services hidden unless `NAIJA_GIGS_SHOW_SAMPLES=true`; sample booking/review refused | No issue found in recorded runs | Keep the flag default off in production | Backend agent | Production mode hides samples; sample booking 409 | VERIFIED |
| Professional KYC and document verification | No reference; no KYC model | Admin approval of profile only | No identity, licence, insurance or background-check record | Add KYC after policy/vendor decision | Backend agent + Security agent | Document verified before publish; expiry enforced | BLOCKED |

Counts: VERIFIED 4, IMPLEMENTED 2, BLOCKED 1, NOT STARTED 0.

### 1.6 Stays — NaijaStay

Canonical routes: `/naijastay` plus 15 subpages (16 page files including the landing page), including `/naijastay/{stays,stays/[slug],search,destinations,bookings,bookings/[reference],host,host/dashboard,messages,notifications,saved,safety,agents,help}`.
APIs: `/api/stay/*` (6), `/api/admin/stay`. Models: `StayHost`, `StayProperty`, `StayImage`,
`StayUnit`, `StayBlock`, `StayReservation`, `StayReservationEvent`, `StayReview`, `StayMessage`.
Partner workspace: `/naijastay/host` and `/naijastay/host/dashboard`. Admin controls:
`/api/admin/stay` only; no committed Control Center module. Tests: `naijastay-e2e.cjs`,
`naijastay-qa.cjs`, `link-audit.cjs`.
Reference: none. Airbnb/Booking.com/PropertyPro appear only in a research plan.

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Discovery, holds, payment and cancellation | No reference inspection; `naijastay-e2e.cjs` 25/25 including simultaneous-hold race; commit `f9d3496` | Search by destination/dates/guests, 20-minute holds, exclusion constraint, wallet payment, policy-snapshot refunds | No reference research; no real host supply; no host payout | Obtain supply and commercial terms before launch | Backend agent | Two simultaneous holds → at most one wins; cancel policy enforced | VERIFIED |
| Host workspace and listing management | Commit `f9d3496`; `/naijastay/host/dashboard` | Host sees own properties, reservations, status and price | No listing editor, calendar management or payout; host application approval is API-only | Build listing editor and calendar after host policy | Frontend agent | Host creates/updates a listing and sees only own bookings | IMPLEMENTED |
| Host and listing approval | `/api/admin/stay` (`vendors:read`/`vendors:review`) | Approve/reject/suspend host or property, audited | No Control Center UI; no recorded admin approval acceptance | Add Stay admin module | Frontend agent + Backend agent | Admin verifies host; listing becomes published; audit row | IMPLEMENTED |
| Reviews | `naijastay-e2e.cjs` section H | Review only after stay ends, one per reservation, real aggregate | No moderation UI | Add moderation if public text is introduced | Backend agent | Early review 409; second review 409; rating real | VERIFIED |
| Guest–host messaging | `/naijastay/messages` | Read-only reservation-scoped threads; page says sending is disabled | No send API; "open a support case" links to `/support`, which does not exist | Build messaging or remove the dead support link | Frontend agent + Backend agent | Message send persists for both parties; outsider 403 | BLOCKED |
| Admin Stay controls | `/api/admin/stay` | API only | No Control Center page | Build Stay module | Frontend agent | Host/listing actions with audit | IMPLEMENTED |

Counts: VERIFIED 2, IMPLEMENTED 3, BLOCKED 1, NOT STARTED 0.

### 1.7 Groceries — NaijaFresh

Canonical routes: `/naijafresh` plus 14 subpages (15 page files including the landing page), including `/naijafresh/{shop,shop/[slug],category/[slug],farmers,farmers/[slug],farmers/apply,farmers/dashboard,cart,orders,favourites,offers,seasonal,business}`.
APIs: `/api/fresh/*` (9), `/api/admin/fresh/farms`. Models: `Farm`, `ProduceListing`,
`BulkQuoteRequest`, `FreshCartItem`, `FreshOrder`, `FreshOrderItem`, `FreshOrderEvent`,
`FreshDispatch`, `FreshDispatchOffer`. Partner workspace: `/naijafresh/farmers/apply` and
`/naijafresh/farmers/dashboard`. Admin controls: `/api/admin/fresh/farms` only; no committed
Control Center module. Tests: `naijafresh-e2e.cjs`, `naijafresh-responsive-qa.cjs`,
`qa-artifacts/naijafresh/FINAL-REPORT.md`.
Reference: none completed. Twiga and Farmcrowdy NXDOMAIN; ThriveAgric corporate site without ordering.

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Storefront, categories and responsive layout | No live reference; `naijafresh-responsive-qa.cjs` 401/401; `qa-artifacts/naijafresh/FINAL-REPORT.md` | 14 routes, 7 viewports, category/farm/produce imagery, bottom nav | No live reference; 26 demo farms and 82 demo listings only | Onboard real farms before public supply claims | Frontend agent | All routes render, no overflow, images load | VERIFIED |
| Basket and checkout | `naijafresh-e2e.cjs` 51/51 | Per-farm basket, server subtotal, stock reservation, wallet debit | No delivery fee policy; commission inherited | Decide delivery and commission policy | Backend agent | Over-stock refused; wallet debited exact total | VERIFIED |
| Farm order, dispatch and settlement | `naijafresh-e2e.cjs` 51/51 | Accept/pack/ready, dispatch to Send couriers and Drive drivers, pickup/delivery PIN, balanced settlement | Cross-border fallback widens to any online provider; unconfirmed commercial decision | Confirm cross-border dispatch policy | Backend agent | Wrong PIN/replay/double settlement refused | VERIFIED |
| Bulk and B2B quotes | `naijafresh-e2e.cjs` 51/51 | `BulkQuoteRequest`, farm-only response, own price | No contracted B2B terms or invoice | Add after B2B terms | Backend agent | Only the farm answers its quote; new farm unverified | VERIFIED |
| Farmer onboarding and workspace | `qa-artifacts/naijafresh/FINAL-REPORT.md`; `/naijafresh/farmers/apply`, `/dashboard` | Registration, unverified-by-default, listing creation gated on verification | Only demo farms; real farmer not exercised | Onboard one real farmer through registration → admin verify → listing → sale | Backend agent + Ops agent | Real farm verified and sells; unverified cannot list | IMPLEMENTED |
| Admin farm verification | `POST /api/admin/fresh/farms` (`vendors:review`) | Verify/revoke, sample farms refused, audited | API only; no Control Center UI | Add Fresh admin module | Frontend agent | Admin verifies farm; audit row; sample refused | IMPLEMENTED |
| Cross-border delivery | No reference; `docs/handoff.md` Fresh blockers | Dispatch zone fallback within Lagos provider pool | No country price list, customs, FX or cross-border zone | Block cross-border until country readiness | Product/Backend agent | Cross-border order refused or explicitly routed | BLOCKED |
| Commercial terms and real supply | No reference | 5% platform fee and courier earnings inherited from Eats; no approved rate | Commission, delivery fee, refund policy unapproved; demo data only | Owner decision and one real farmer | Product agent | Rate configured explicitly; no inherited default | BLOCKED |

Counts: VERIFIED 4, IMPLEMENTED 2, BLOCKED 2, NOT STARTED 0.

### 1.8 Music — NaijaStream

Canonical routes: `/naijastream` plus 26 subpages (27 page files including the landing page), including `/naijastream/{music,discover,search,charts,artists,artists/[slug],playlists,playlists/[slug],library,tracks/[slug],podcasts,videos,live,premium,studio,studio/upload,studio/royalties,cities/[slug],account,notifications}`.
APIs: `/api/stream/*` (29), `/api/admin/stream/*` (2). Models: 22 `Stream*` models including artist,
release, track, playlist, play, royalty, show, episode, video, live event, media asset, plan,
subscription, billing, hero slide, city and podcast category. Partner workspace:
`/naijastream/studio`. Admin controls: `/api/admin/stream/{cities,royalties}` only; no committed
Control Center module. Tests: `stream-tests.mjs`, `stream-full-qa.cjs`, `stream-features-verify.cjs`,
`stream-upload-verify.cjs`, `stream-video-podcast-verify.cjs`, `stream-live-verify.cjs`,
`stream-premium-verify.cjs`, `stream-royalty-tests.ts`, `stream-royalty-flow.mjs`,
`stream-audio-verify.cjs`, `stream-mobile-qa.cjs`, `stream-discovery-qa.cjs`,
`stream-asset-audit.cjs`.
Reference: Spotify capture only; no findings recorded. Audiomack, Boomplay and Apple Music not inspected.

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Catalogue and playback | Spotify capture (no findings); `stream-tests.mjs` 23/23; `stream-full-qa.cjs` 19/19 routes; `stream-audio-verify.cjs` | Published/verified catalogue, real audio, persistent player, queue, shuffle, seek, error states | No licensed commercial catalogue; demo artists/tracks hidden by flag | Licence music or keep creator-owned catalogue only | Frontend agent + Content agent | Play/seek/next on real files; unavailable state honest | VERIFIED |
| Playlists, library, likes and follows | `stream-features-verify.cjs` 9/9 | Create/add/remove playlists with ownership, likes, follows, library | No social graph beyond follow | Add only after growth requirements | Backend agent | Ownership enforced; follow/like persists | VERIFIED |
| Creator studio, upload and publish | `stream-upload-verify.cjs` 11/11; `stream-video-podcast-verify.cjs` 10/10 | Upload → process → draft → publish, rights declaration, show/episode and video flows | No transcoding worker at scale; test audio only | Add production media pipeline after licence decision | Backend agent | Anonymous listener plays published track; cross-creator delete denied | VERIFIED |
| Royalty calculation and settlement | `stream-royalty-tests.ts` 8/8; `stream-royalty-flow.mjs` 7/7 | Period pool / eligible plays, integer truncation, balanced wallet settlement | No external payout; rates/rights not approved | Define rights and payout policy | Payments agent | Conservation and zero-play case pass | VERIFIED |
| Premium subscriptions | `stream-premium-verify.cjs` 11/11 | Plans, wallet-paid subscription, cancel/resubscribe, billing history | Plan prices are placeholders requiring approval; no card provider | Approve pricing and provider | Payments agent | Wallet debit once; cancel and resubscribe; no double charge | VERIFIED |
| Live, video and podcast | `stream-live-verify.cjs` 7/7; video/podcast 10/10 | HLS live, episodes, videos, creator ownership | No live moderation/SLA; no licensed rights | Add moderation and rights review | Backend agent | HLS segments reach viewer; foreign creator 403 | VERIFIED |
| Licensed catalogue and rights | No reference research; handoff says test audio only | Rights declaration field; demo artists and test media | No licensed music, publishing metadata, takedown workflow or royalty agreement | Legal/licensing decision | Content/Legal agent | Licensed track with documented rights plays and pays | BLOCKED |
| Admin city and royalty controls | `/api/admin/stream/cities`, `/api/admin/stream/royalties` | City catalogue/image approval and royalty pool APIs | No Control Center UI | Add Stream admin module | Frontend agent | City image approved; royalty pool calculated | IMPLEMENTED |
| Artist payouts and withdrawals | No reference | Royalties credit the artist wallet | No withdrawal, payout provider or statement | Add payout after provider/policy | Payments agent | Artist withdraws with balanced ledger and KYC | BLOCKED |

Counts: VERIFIED 6, IMPLEMENTED 1, BLOCKED 2, NOT STARTED 0.

## 2. Verticals with partial or no implementation

### 2.1 Wallet and Payments — NaijaPay (including airtime credit)

Canonical routes: `/pay` and `/pay/{send,receive,scan,escrow,business,security}`, `/wallet`.
APIs: `/api/wallet/*` (2), `/api/pay/*` (4), `/api/payments/*` (4), `/api/admin/{payouts,payments,escrow,naijapay,finance/reconciliation}`.
Models: `Wallet`, `WalletTransaction`, `LedgerEntry`, `LedgerAccount`, `AccountPosting`,
`LedgerAdjustment`, `EscrowHold`, `EscrowEvent`, `EscrowMilestone`, `Payment`, `WebhookEvent`,
`Payout`, `Refund`, `WalletTopUp`. No airtime-credit model, provider or ledger product exists.
Partner workspace: `/pay/business` (business overview); no consumer partner payout surface.
Admin controls: `/admin?module=pay` plus `/api/admin/{payouts,payments,escrow,naijapay,finance/reconciliation}`.
Tests: `naijapay-acceptance.cjs` 14/14, `wallet-*acceptance.ts`, `escrow-*acceptance.ts`,
`payments-funding-webhook-acceptance.ts`, `pay-transfer-tests.ts`, `wallet-reconcile.ts`.
Reference: none. OPay/PalmPay/Paystack/Flutterwave public products were not inspected; provider
adapters are implementation, not reference research.

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Wallet, ledger and reconciliation | No reference; `wallet-reconcile.ts` CLEAN; `docs/handoff.md` 2026-11-11 wallet sections | Shared NGN wallet, balanced journals, holds, read-only reconciliation | No cross-currency; reconciliation performance on a large ledger not measured | Add scale test before live | Payments agent | `wallet-reconcile.ts` CLEAN with 0 mismatches | VERIFIED |
| Add Money and top-ups | No reference; `payments-funding-webhook-acceptance.ts` 24/24; `naijapay-acceptance.cjs` 14/14 | `WalletTopUp`, local test provider, funding webhook, idempotency | Paystack/Flutterwave credentials absent; test provider refused on LIVE DB | Contract and configure a provider | Payments agent | Sandbox top-up → webhook → credit once | VERIFIED |
| P2P transfers | No reference; `pay-transfer-tests.ts` 23/23; browser journey 25/25 | Internal transfer with idempotency, account isolation, offline outbox | No external transfer; no cross-currency | Add external rails after provider/KYC | Payments agent | Duplicate/self/insufficient cases refused | VERIFIED |
| Escrow holds and milestones | No reference; `escrow-*.ts` 156/156, 89/89; milestone 32/32 | Order escrow, customer-to-customer milestones, release/refund lifecycle | Dispute release disabled; provider refund status absent; legacy external escrows refused | Operator runbook and policy sign-off | Payments agent | Release after partial refunds; duplicate/race refusal | VERIFIED |
| Refunds and recovery | `wallet-post-release-refund-acceptance.ts` 20/20; `escrow-refund-release-acceptance.ts` 156/156 | Reservation, submission, confirmation, unknown states, operator reconciliation | No polling worker; no finance notification beyond reconciliation; post-release needs liquidity | Add scheduled escalation after policy | Payments agent | Provider timeout → unknown, no retry; operator settles | VERIFIED |
| Vendor payouts | `payout-lifecycle-inspection.ts`; admin payout tests | Admin-created payouts, atomic claim, conditional debit | No live provider credentials; no seller-initiated request | Add provider and seller request | Payments agent | Concurrent clicks settle once; overdraw refused | VERIFIED |
| Customer withdrawals | No reference | No route or UI | Not built | Decide licence/KYC/provider, then build | Payments agent | Withdrawal request → KYC → balanced debit | BLOCKED |
| Bills, airtime, data, electricity and TV | No reference; `/pay` copy says providers not connected | Marketing tiles only; no adapter, model or order | No provider selected or contracted | Compare providers, contract, then build adapter | Integrations agent | Airtime delivered once; ambiguity reconciled before retry | BLOCKED |
| Airtime credit | No reference; no `credit`, `loan` or `BNPL` model | Nothing | Product, credit policy, affordability, collections and ledger treatment undefined | Define credit product and risk policy before any code | Product/Finance agent | Credit issued, repaid, default handled; no customer owes for unfulfilled purchase | NOT STARTED |
| Payment links and merchant QR | No reference; `docs/naijapay-status.md` | `/pay/scan`, `/pay/receive` are informational | No signed single-use token, expiry or duplicate protection | Build as a separate public surface | Payments agent | Link resolves; opening does not authorise; payer confirms server-side | NOT STARTED |
| Business dashboard | No reference; `/pay/business` | Business overview API and page | No invoicing, multi-user or settlement reports | Add after business requirements | Frontend agent | Figures match ledger scope | IMPLEMENTED |
| Two-factor authentication and payment security | No reference; `/pay/security` | Security information page; password and session controls | No TOTP/WebAuthn, step-up or device management | Add MFA before live money | Security agent | Enrol, recover, step-up; bypass refused | NOT STARTED |
| Live payment provider | No reference; `docs/naijapay-status.md`; `PAYSTACK_SECRET_KEY`/`FLUTTERWAVE_SECRET_KEY` absent | Adapters and status only | No sandbox or live call recorded; DB classified TEST | Contract provider, sandbox acceptance, then launch gate | Payments agent | Sandbox charge, webhook signature, refund, payout | BLOCKED |

Counts: VERIFIED 6, IMPLEMENTED 1, BLOCKED 3, NOT STARTED 3.

### 2.2 Affiliates — NaijaDeals Affiliate

Canonical routes: `/affiliate`, `/r/[code]`, `/admin/affiliate-campaigns`, `/admin/affiliate-reviews`.
APIs: `/api/affiliate/*` (3), `/api/admin/{affiliates,affiliate-campaigns,affiliate-reviews,affiliate-recoveries}`.
Models: `AffiliateProfile`, `AffiliateCampaign`, `AffiliateLink`, `AttributionTouch`,
`AffiliateConversion`, `AffiliatePayout`, `AffiliateRecovery`, `AffiliateReversalIntent`,
`AffiliateReversalOperation`, `OrderAttribution`. Partner workspace: `/affiliate` (self-service
enrolment, campaigns and links). Admin controls: `/admin/affiliate-campaigns`,
`/admin/affiliate-reviews` plus `/api/admin/{affiliates,affiliate-campaigns,affiliate-reviews,affiliate-recoveries}`.
Tests: `affiliate-verify.ts`, `affiliate-destination-verify.ts`, `affiliate-guest-journey.cjs`,
`affiliate-financial-acceptance.ts`, `affiliate-campaign-journey.ts`,
`affiliate-settlement-verify.ts`, `affiliate-recovery-accounting.ts`, `affiliate-settlement-race.ts`,
`aura-affiliate-tool-verify.ts`, `aura-affiliate-dispatch-verify.ts`.
Reference: none. No external affiliate programme research is recorded.

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Enrolment and approval gating | No reference; `affiliate-verify.ts` 12/12 | Apply, approve/reject/suspend, terms version, audit | No KYC/tax onboarding | Add after payout policy | Backend agent | Unapproved affiliate cannot create links | VERIFIED |
| Links and attribution | No reference; `affiliate-destination-verify.ts` 11/11; `affiliate-guest-journey.cjs` 3 checks | Destination allowlist, consent, first-party touch, guest-to-account continuity, self-referral refusal | No external destination support by design | Keep same-origin only | Backend agent | Guest → signup → attributed checkout → one conversion | VERIFIED |
| Commission and conversion | No reference; `affiliate-campaign-journey.ts` 9 checks; `affiliate-financial-acceptance.ts` 6 checks | Frozen rule, dedupe key, budget claim, payment-time conversion, cursor pagination | Only Shop `Order` rows are attributable | Add per-vertical freeze points after business rules | Backend agent | Duplicate payment adds no commission; expired touch/paused campaign null | VERIFIED |
| Settlement, reversal and recovery | No reference; `affiliate-settlement-verify.ts` 10/10; recovery accounting 5 checks; settlement race 6 checks | Balanced wallet settlement, reversal before/after, recovery offset/collection, worker sweep | No external affiliate payout; mid-flight provider outage not fault-injected | Add provider and payout policy | Payments agent | Settlement and reversal conserve; recovery never exceeds debt | VERIFIED |
| Admin review and campaign UI | No reference; `affiliate-campaign-ui-check.cjs`; `/admin/affiliate-*` | Dedicated admin pages for reviews/campaigns | Not inside the unified module switcher | Decide whether to fold into Control Center modules | Frontend agent | Manager creates/activates campaign; affiliate discovers/link | VERIFIED |
| Aura read-only integration | No reference; `aura-affiliate-tool-verify.ts` 4 checks; `aura-affiliate-dispatch-verify.ts` | Session-scoped `get_affiliate_summary`; no argument identity | Single read tool, not a conversational journey | Add read-only tool routing after Aura acceptance | Backend agent | Non-affiliate gets no id/amount; argument cannot change identity | VERIFIED |
| Multi-vertical attribution | No reference; `docs/handoff.md` vertical coverage audit | Shop only; verticals registry enforces `["shop"]` | Stay/rides/gigs have no attribution hook; funding source undefined | Decide commission basis per vertical before adapters | Product/Finance agent | Each vertical freezes touch and creates one conversion | BLOCKED |
| Refund → reversal integration | No reference; `affiliate-refund-integration.ts` exists | `refundPayment` writes an intent; processor and recovery exist | No recorded pass of the full integration suite; incident shows dev reversal intents but not acceptance | Run the suite on isolated DB and record output | QA agent | Refund → intent → adjustment once; failure does not block customer refund | IMPLEMENTED |
| External affiliate payouts | No reference; `AffiliatePayout` model | Settlement credits the NaijaPay wallet | No bank/mobile-money payout or tax handling | Add after payout policy | Payments agent | Approved payout debits once; provider reference reconciled | BLOCKED |

Counts: VERIFIED 6, IMPLEMENTED 1, BLOCKED 2, NOT STARTED 0.

### 2.3 Property — sale and land listings

Canonical surface: `/naijastay/agents`, sale/land entries in `/naijastay/stays/[slug]`, cards in
`/naijastay`. Models: `StayProperty` (`listingType` = `sale`/`land`, `salePriceKobo`), `StayHost`.
Partner workspace: `/naijastay/host/dashboard` (shared with stays). Admin controls: `/api/admin/stay`
only; no committed Control Center module. Tests: no property-specific test; `naijastay-e2e.cjs`
covers stays, not sale/land. Reference: none.

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sale/land listing publication and enquiry | No reference; `app/naijastay/stays/[slug]/page.tsx`; `lib/services/stay/reservations.ts:119` | Sale/land cards, price, agent list, "online purchase is not enabled", contact link | Contact link goes to read-only messages, then `/support` which does not exist; no agent contact workflow | Add a real enquiry/lead workflow or remove the link | Frontend agent | Enquiry reaches the agent; non-agent cannot read it | IMPLEMENTED |
| Property transaction, title and commission | No reference; no property model | Nothing beyond listing fields | No offer, escrow, title, inspection, commission, tax or handover | Define property transaction policy and legal model before building | Product/Backend agent | Offer → escrow → title/handover; commission disclosed | NOT STARTED |

Counts: VERIFIED 0, IMPLEMENTED 1, BLOCKED 0, NOT STARTED 1.

### 2.4 Rentals — long-term tenancy

Canonical surface: `/naijastay/search?category=long-term-rentals`, `/naijastay/search?type=rent`.
Model: `StayProperty.listingType = "rent"`. Partner workspace: `/naijastay/host/dashboard` (shared
with stays). Admin controls: `/api/admin/stay` only. Tests: `naijastay-e2e.cjs` books a `rent`
listing nightly; no tenancy test exists. Reference: none.

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Rental discovery and category | No reference; `lib/services/stay/discovery.ts` | Category chip, `type=rent` filter and rent cards | Labels a nightly reservation product as a rental; no tenancy terms | Separate short-term from long-term inventory | Frontend agent | Filter returns rental-intent listings only | IMPLEMENTED |
| Tenancy contract, deposit and rent schedule | No reference; `lib/services/stay/reservations.ts:119` allows `rent` to be booked nightly | Nightly hold/payment only | No lease, deposit, monthly schedule, arrears, inspection or eviction workflow | Build a tenancy model after legal/policy decision | Product/Backend agent | Tenancy signed; deposit held; rent schedule posts | NOT STARTED |
| Agent/landlord rental management | No reference | Host dashboard shows properties and nightly reservations | No rent ledger, maintenance, renewal or statement | Add after tenancy model | Backend agent | Landlord sees rent due/paid; statement reconciles | NOT STARTED |

Counts: VERIFIED 0, IMPLEMENTED 1, BLOCKED 0, NOT STARTED 2.

### 2.5 Travel — NaijaTravel

No route, API, model or service. Only a roadmap entry in
`components/functional/admin-planned-modules.tsx:17` and a research-plan row in
`docs/rea-module-research.md`. Partner workspace: none. Admin controls: none (roadmap entry only).
Tests: none. Reference: none.

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Flights, buses and travel packages | No reference research; roadmap entry only | Nothing | No inventory, supplier, GDS, ticketing, cancellation or payment integration | Decide supplier model and licensing; build after country/payment readiness | Product/Integrations agent | Search → hold → ticket/booking → cancellation with supplier reference | NOT STARTED |

Counts: VERIFIED 0, IMPLEMENTED 0, BLOCKED 0, NOT STARTED 1.

### 2.6 Central Admin — Control Center

Canonical routes: `/admin`, `/super-admin`, `/admin/affiliate-campaigns`, `/admin/affiliate-reviews`.
APIs: 57 `/api/admin/*` handlers plus 2 `/api/super-admin/*`. Models: `AdminAction`, `AuditLog`,
`SystemEvent`, `Role`, `UserRole`, `CountrySetting`, `CitySetting`, `StorefrontConfig`,
`HomeVariant`/`HomeHeroSlide`/`HomeAssignment`/`HomeMetric`, `DatabaseClassification`.
Operator workspace: `/admin` and `/super-admin` (module/tab query parameters). Tests:
`admin-security-tests.ts`, `control-center-visual-qa.mjs`, `region-verification`, `link-audit.cjs`.
Reference: owner-supplied Control Center mockup; no external admin product was inspected.

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Unified shell, navigation and real data | Owner mockup `design-references/approved/01-admin-control-center.jpg`; `control-center-visual-qa.mjs` 29/29 (2026-11-03) | One `/admin` and `/super-admin` shell, URL-addressable modules/tabs, real tables | Visual QA is historical; newer panels not re-audited | Re-run visual and accessibility QA at HEAD | Frontend agent + QA agent | All tabs render real rows; no fabricated figures | VERIFIED |
| Permissions and fail-closed roles | `admin-security-tests.ts` 19/19 (2026-11-03), later 21/21 references; `lib/auth/permissions.ts` | Permission set, staff roles, super-admin boundary, unknown role fails closed | No AGENT actor type; `support` is read-only; no impersonation | Add scoped support actions after policy | Security agent | Allow/deny, self-escalation and unknown-role cases pass | VERIFIED |
| Region and country scope | `region-verification` 17/17; `lib/auth/scope.ts`; phase-tracker Phase 05 evidence | Server-side country/city scope, clamp and 403 `region_forbidden` | Scope coverage on newer verticals not exhaustively tested | Add scope assertions to each vertical admin suite | Security agent | Scoped staff cannot read or mutate other region | VERIFIED |
| Audit trail | Phase 05 evidence; before/after dialogs | `AdminAction`/`AuditLog` with before/after for key mutations | Some newer vertical actions are API-only and not UI-audited | Keep record on every mutation; add UI detail | Backend agent | Sensitive change produces before/after row | VERIFIED |
| Country and city activation | `docs/handoff.md` 2026-11-03 country activation; phase-tracker | `CountrySetting`/`CitySetting`, `countries:write`, audited, checkout and scope enforcement | No country price list, entity or legal readiness | Keep NG only until §5 work completes | Backend agent | Disable country 400; delivery unconfigured 503; city scope 409 | VERIFIED |
| Module coverage across verticals | `lib/admin/admin-navigation.ts` `IMPLEMENTED_MODULES` = ecosystem, shop, drive, send, pay; `AdminModule` lists 11 | Five modules have real workspaces; Eats has panels inside Shop | Eats/Gigs/Stay/Stream/Fresh show "module not available"; Aura module is listed but not in `IMPLEMENTED_MODULES` | Build modules in dependency order; fix Aura mismatch | Frontend agent | Each module shows real data and actions or an honest unavailable state | BLOCKED |
| Vertical admin APIs | `/api/admin/{eats,gigs,stay,stream,fresh,affiliate*}` | Real APIs with permission checks and audits | Most have no committed UI call site | Wire into modules; add tests | Frontend agent + Backend agent | API action reflected in UI with audit | IMPLEMENTED |
| Support ticket queue | No reference; no support model/route | Nothing; help pages only | No ticket, conversation, SLA, assignment or customer history | Build support domain or integrate an approved helpdesk | Backend agent + Ops agent | Ticket linked to order; support resolves; customer sees status | NOT STARTED |
| Returns queue | No reference; no admin returns route | Seller-only `ReturnRequest` resolution | No admin queue, reason codes or refund integration UI | Add returns queue after policy | Frontend agent | Admin sees returns; decision posts refund/restock | NOT STARTED |
| Review moderation | `/api/admin/reviews/[id]`; uncommitted `admin-reviews-panel.tsx` | Approve/reject API; working tree adds list and tab | At HEAD API-only and no reviews tab | Commit, test and audit | Frontend agent + Backend agent | Pending review approved; rating recomputed | IMPLEMENTED |
| Homepage and storefront configuration | `/api/admin/home`, `/api/admin/storefront`; `/admin?tab=homepage` | Design variants, hero slides, storefront fields saved | No inline slide/image editor; some saved fields are not consumed publicly | Wire saved fields to public renderer; add editor | Frontend agent | Change saved in admin appears publicly | IMPLEMENTED |

Counts: VERIFIED 5, IMPLEMENTED 3, BLOCKED 1, NOT STARTED 2.

### 2.7 Country configuration and readiness

Reference: no country-market research beyond the NaijaDrive Lagos/Abuja registry. No commerce
country research (customs, tax, entity, currency, consumer law) is recorded.

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Country/city catalogue and activation | `lib/config/commerce.ts`, `regions.ts`, `country.service.ts`, `city.service.ts`; phase-tracker | Six countries, city lists, runtime overrides, audited activation | Only six countries, not the African set; catalogue is browsing context, not commerce | Add a country only with a ready checklist | Backend agent | Activation persists; unknown country 400; audit row | VERIFIED |
| Nigeria delivery and checkout enforcement | `checkout.service.ts:37-45`; `country_disabled`/`delivery_unconfigured` evidence | NG delivery zones, fees, ETA; checkout refuses disabled/non-delivery country | City activation is not enforced at checkout; delivery fee policy is configuration, not approved commercial terms | Enforce city and document fee approval | Backend agent | Non-NG checkout 503; disabled country 400 | VERIFIED |
| Non-Nigeria currency and price safety | `checkout.service.ts:163,235` writes `country.currency`; catalogue prices are NGN kobo; `docs/naiqashop/surface-audit.md` gap 3 | Country code and currency fields exist | An enabled GH/KE/ZA/GB/US checkout would label NGN-priced amounts as GHS/KES/ZAR/GBP/USD; no FX or country price list | Do not enable non-NG selling until price lists/FX and entity are approved | Payments/Backend agent | Same product priced per country; order totals and ledger currency agree | BLOCKED |
| Country entity, tax and legal approval | No reference; `docs/nairadrive/market-registry.md` M11 | None recorded | No local entity, tax registration, consumer terms, data-transfer review or counsel memo | Per-country legal/finance gate | Finance/Legal agent | Signed checklist per country | NOT STARTED |
| Per-country payment methods | `lib/payments/adapters.ts` `supportsCountry`; no credentials | Paystack NG; Flutterwave NG/GH/KE/ZA; test adapter all countries | No live provider; no mobile-money or bank rail per country | Contract per country | Payments agent | Country-specific method completes a sandbox payment | BLOCKED |
| Live country | No country is live in the market registry | Local/test only | No deployment, provider, support or approved terms | Launch gate after all above | Programme owner | Named country in `live` with monitoring and support | NOT STARTED |

Counts: VERIFIED 2, IMPLEMENTED 0, BLOCKED 2, NOT STARTED 2.

## 3. Cross-cutting shared capabilities

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Unified accounts and sessions | `D-004`; `docs/handoff.md` customer account completion; `sessions-api-test.mjs`; isolated browser runs 2026-11-05 | One `User`, session cookie, profile/address/password/session revocation, cross-customer isolation | No email verification, password reset, MFA or account deletion | Add identity hardening before live money | Security/Backend agent | Wrong password, isolation, safe return URL, session revocation | VERIFIED |
| Permissions and regional scopes | `lib/auth/permissions.ts`, `scope.ts`; admin suite 19/19/21/21; region 17/17 | Permission registry, staff roles, scope filters, fail-closed unknown role | Newer vertical admin APIs not all covered by tests; no AGENT actor | Extend suite per vertical | Security agent | Allow/deny and cross-region cases for every admin route | VERIFIED |
| Wallet and ledger | Wallet acceptance suites listed in §2.1 | One NGN wallet/ledger per owner type, balanced journals, escrow, holds | No multi-currency, no airtime credit, no customer withdrawal; SYSTEM position is overloaded | Separate platform/clearing positions; add currency only with country readiness | Payments agent | Conservation, non-negative, duplicate and race cases | VERIFIED |
| In-app notifications and outbox | `wallet-notification-outbox-acceptance.ts` 12/12; `Notification`/`Intent`/`Attempt` models | In-app feed, durable outbox with leases/retries, preferences | Full `notifications-verify.ts` has no recorded run in the repository | Run and record the full notification suite | Backend agent | In-app delivery, preference suppression, retry, duplicate | VERIFIED |
| Email, SMS and push delivery | `lib/notifications/transports.ts` | Email is capture-only; SMS/PUSH explicitly unconfigured | No provider contract or credentials; no push keys | Contract provider; keep honest suppression until then | Integrations agent | Real email/SMS/push delivery receipt | BLOCKED |
| Support and ticketing | No model/route; `components/functional/admin-planned-modules.tsx`; `/naijastay/messages` links `/support` | Nothing | No ticket, SLA, assignment, conversation or customer history; help copy implies support | Build support domain or integrate approved helpdesk | Backend/Ops agent | Ticket linked to order; support resolves; customer notified | NOT STARTED |
| Product search | Meilisearch 1.56.2; `lib/infra/search.ts`; infra verify | Product index with typo tolerance, Postgres fallback and reindex API | No suggestions; shop-only | Add suggestions on the existing index | Backend agent | Typo query returns expected products; fallback works | IMPLEMENTED |
| Unified ecosystem search | No reference | Separate discovery per vertical; `/search` is NaijaShop only | No cross-vertical query, ranking or routing | Add an aggregated index only after entity contracts | Search agent | Query returns shop/food/stay/gig results with correct routing | NOT STARTED |
| Media and Kie.ai pipeline | `scripts/image-registry.json` (386 entries, 1,914.8 credits, $9.72 recorded); generation scripts per vertical | Script-only generation, provenance, WebP optimisation, manifest resolution | No runtime generation endpoint; 60 registry entries lack `taskId`; owner review pending for many assets | Keep generation offline; add an approval workflow | Content agent + Backend agent | Asset registered with taskId, cost, licence and usage path | IMPLEMENTED |
| Country readiness | §2.7; `docs/nairadrive/market-registry.md` | Architecture fields and NG configuration | No non-NG approval or live country | Gate every non-NG launch on §2.7 | Programme/Finance agent | Country checklist complete before enablement | BLOCKED |
| PWA, offline and install | `platform-pwa-e2e.cjs` 27/27 and 28/28; `mobile-foundation-e2e.cjs` 26/26; signed APK build recorded | Manifest, service worker with private-route exclusions, offline page, install/update UI, Android APK | No physical-device acceptance; iOS background location unsupported; push unconfigured; retention job not scheduled | Device test and push provider | Mobile agent | Install, offline revisit, background location on a real device | VERIFIED |
| Accessibility | `docs/audits/deepseek-accessibility-02a-02c.md`; `02b-02d.md`; axe 0 on 15 routes (2026-11-03) | Tokens, contrast fixes, keyboard, RTL, 200% reflow, forced colors, labelled map | Newer verticals (Food/Fresh/Stay/Stream/Gigs/Pay/Affiliate) were not in the 15-route audit; no manual NVDA/VoiceOver pass | Re-run axe + keyboard on every vertical; manual screen-reader pass | Accessibility/QA agent | 0 axe A/AA violations; keyboard and screen-reader flows | IMPLEMENTED |
| Observability and health | `app/api/health`, `app/api/metrics`; infra audit | DB-critical health, metrics, Prometheus/Grafana local stack | No rate limiting, distributed tracing or production alerting | Add rate limiting and alert routing | Platform agent | Health 503 on DB failure; metrics auth; alert fires | IMPLEMENTED |

Counts: VERIFIED 5, IMPLEMENTED 4, BLOCKED 2, NOT STARTED 2.

## 4. Matrix summary

| Vertical | VERIFIED | IMPLEMENTED | BLOCKED | NOT STARTED | Total rows |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rides — NaijaDrive | 2 | 5 | 3 | 0 | 10 |
| Shop (retail) — NaijaShop | 1 | 7 | 0 | 5 | 13 |
| Food — NaijaEats | 6 | 2 | 0 | 1 | 9 |
| Deliveries and Freight — NaijaSend | 5 | 2 | 3 | 0 | 10 |
| Services — NaijaGigs | 4 | 2 | 1 | 0 | 7 |
| Stays — NaijaStay | 2 | 3 | 1 | 0 | 6 |
| Groceries — NaijaFresh | 4 | 2 | 2 | 0 | 8 |
| Music — NaijaStream | 6 | 1 | 2 | 0 | 9 |
| Wallet and Payments — NaijaPay | 6 | 1 | 3 | 3 | 13 |
| Affiliates | 6 | 1 | 2 | 0 | 9 |
| Property | 0 | 1 | 0 | 1 | 2 |
| Rentals | 0 | 1 | 0 | 2 | 3 |
| Travel | 0 | 0 | 0 | 1 | 1 |
| Central Admin | 5 | 3 | 1 | 2 | 11 |
| Country configuration | 2 | 0 | 2 | 2 | 6 |
| **Total** | **49** | **31** | **20** | **17** | **117** |

Cross-cutting rows are counted separately: 5 VERIFIED, 4 IMPLEMENTED, 2 BLOCKED, 2 NOT STARTED.

Note: the Services row count is 7 because the seven capabilities listed are the ones with distinct
evidence; the professional-KYC row is the blocked one. No row was omitted to improve the count.

## 5. Country readiness

No country is live. No non-Nigeria market is approved. The only tested commerce country is Nigeria,
on local/isolated databases, with the wallet test rail; no live provider or deployment exists.

| Country | Architecture-supported | Configured | Tested | Approved | Live | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Nigeria (NG) | Yes: `countryCode` fields, NGN, NG delivery zones, Paystack adapter country gate, region scope | Yes: enabled, delivery enabled, 8 cities, five NG delivery zones | Yes for activation, checkout refusal, city scope, wallet checkout; no live provider | Existing platform decisions only; no launch approval | No | `lib/config/commerce.ts`; `checkout.service.ts`; phase-tracker Phase 05; handoff 2026-11-03 |
| Ghana (GH) | Yes: country code, GHS, city list, Flutterwave country support | Browsing enabled; delivery disabled; no GH price list or entity | Activation and scope only: disable 400, enable → delivery 503; Accra scope 200; Kumasi 409 | No | No | handoff 2026-11-03; `COUNTRIES.GH` |
| Kenya (KE) | Yes: country code, KES, city list, Flutterwave country support | Browsing enabled; delivery disabled | No recorded test | No | No | `COUNTRIES.KE` |
| South Africa (ZA) | Yes: country code, ZAR, city list, Flutterwave country support | Browsing enabled; delivery disabled | No recorded test | No | No | `COUNTRIES.ZA` |
| United Kingdom (GB) | Yes: country code, GBP, city list | Browsing enabled; delivery disabled; no UK entity or payment method | No recorded test | No | No | `COUNTRIES.GB` |
| United States (US) | Yes: country code, USD, city list | Browsing enabled; delivery disabled; no US entity or payment method | No recorded test | No | No | `COUNTRIES.US` |

Readiness ladder, stated in the terms the repository can support:

| Level | What is actually true |
| --- | --- |
| Architecture-supported | Country and currency fields, country/city activation, provider `supportsCountry`, and region-scoped admin exist. They support a country record; they do not make commerce safe. |
| Configured | Six countries are in the catalogue; only NG has delivery zones, a delivery-enabled flag, and a tested wallet checkout path. |
| Tested | NG activation/refusal/scope and a Ghana activation/scope exercise are recorded. No non-NG order has ever been created. |
| Approved | No expansion market, currency, entity, tax, consumer terms or data-transfer arrangement is approved. |
| Live | None. No deployment, no live payment provider, no real customer or partner. |

**Unsafe non-NG commerce:** the runtime activation override alone does not complete a non-NG
checkout: `checkout.service.ts:43-45` passes the activation check, but `deliveryQuote` still calls
`resolveDeliveryZone`, which reads the static `deliveryEnabled` flag and throws for GH/KE/ZA/GB/US.
If that static flag were also enabled, checkout would write the country currency onto an NGN-priced
order (`checkout.service.ts:163,235`) with no FX or country price list. Either way, non-NG selling is
not ready. It must stay blocked until per-country price lists, currency settlement, entity/tax
treatment and legal review are approved. City activation is also not enforced at checkout; only
country delivery and zone resolution are.

## 6. Top 15 ranked programme gaps

Ranking is by dependency and blast radius, not by ease.

| # | Gap | Why it ranks here | Evidence | Required next action |
| ---: | --- | --- | --- | --- |
| 1 | No live payment provider or live-money path | Every paid vertical, affiliate settlement, payout and country launch depends on it; only the test adapter is usable and it is refused on a LIVE database | `docs/naijapay-status.md`; `lib/payments/adapters.ts`; `docs/handoff.md` | Contract a provider, run sandbox charge/webhook/refund/payout acceptance, then a launch gate |
| 2 | Non-NG currency, entity and price safety | The runtime activation path cannot complete a non-NG checkout, and enabling the static delivery flag would label NGN amounts in another currency | `checkout.service.ts:43-45,163,235`; `lib/config/commerce.ts` `resolveDeliveryZone`; `docs/naiqashop/surface-audit.md` gap 3 | Keep non-NG delivery disabled until price lists/FX, entity and legal review are approved |
| 3 | Financial state not fully re-verified at HEAD | Escrow/refund repairs are strong but the Shop suite was last 12/13 and the drive HTTP suite is stale; legacy external escrows are refused | `docs/handoff.md` 2026-11-12; `docs/nairadrive/current-state-audit.md` §4-5 | Re-run marketplace, drive, escrow and reconciliation suites on isolated DBs and record outputs |
| 4 | No support system | No ticket model, queue, SLA or customer history; `/support` is linked but does not exist; support role is read-only | `grep` of `app`, `prisma/schema.prisma`; `/naijastay/messages`; `docs/naiqashop/surface-audit.md` gap 6 | Build support ticketing or integrate an approved helpdesk; link only to real routes |
| 5 | Driver onboarding and documents absent | Rides cannot recruit or approve a real driver; only seeds create approved profiles | `docs/nairadrive/current-state-audit.md` §3.5; `admin.service.ts` `driver_pending` | Build application, document storage/expiry, review and approval |
| 6 | Driver commission and payouts undefined | Full fare is credited; no platform margin, payout, statement or tax treatment | `drive.service.ts` release; `market-registry.md` M4 | Decide commission/payout policy, then build payout lifecycle |
| 7 | Control Center covers 5 of 11 modules | Eats/Gigs/Stay/Stream/Fresh admin APIs exist but the UI says unavailable; operations run via API only | `lib/admin/admin-navigation.ts` `IMPLEMENTED_MODULES`; `admin-dashboard.tsx` `ModuleNotAvailable` | Build modules in dependency order; fix the Aura module mismatch |
| 8 | NaijaShop seller lifecycle incomplete | Seller cannot edit variants/prices, request payout, manage staff, print a receipt or operate returns | `docs/naiqashop/surface-audit.md` gaps 7-9; `app/seller`, `/api/seller/*` | Complete seller tools; add returns queue and receipt after policy decisions |
| 9 | Real supply onboarding unproven for most verticals | Food, Fresh, Stay, Gigs and Stream run on demo/sample rows; some paths have never onboarded a real partner | `qa-artifacts/naijafresh/FINAL-REPORT.md`; `docs/handoff.md` Eats/Stay/Stream; `prisma/*seed*` | Onboard one real partner per vertical through application → approval → first paid transaction |
| 10 | Notification delivery is in-app only | No email/SMS/push; ride notification target 404; no notification centre; dispatch depends on polling | `lib/notifications/transports.ts`; `domain-events.ts`; `docs/nairadrive/current-state-audit.md` §3.8 | Add provider(s) and a notification centre; fix the ride target |
| 11 | Affiliate coverage and refund integration incomplete | Attribution covers Shop only; refund→reversal suite has no recorded pass; multi-vertical funding decisions unresolved | `lib/services/affiliate/verticals.ts`; `affiliate-refund-integration.ts`; handoff vertical audit | Run the integration suite; decide per-vertical commission basis |
| 12 | No unified ecosystem search | Each vertical has its own discovery; `/search` is product-only; no suggestions | `app/search/page.tsx`; `lib/infra/search.ts`; per-vertical discovery | Add a cross-vertical index and query contract after entity definitions |
| 13 | Property, Rentals and Travel have no transaction model | Stay exposes sale/land/rent labels without sale, tenancy or travel supply; "contact host" is broken | `prisma/schema.prisma` `StayProperty`; `reservations.ts:119`; `admin-planned-modules.tsx` | Decide property/tenancy/travel models and legal terms; do not start with UI |
| 14 | Airtime, bills, payment links and withdrawals absent | NaijaPay is wallet/escrow only; the pay landing shows everyday-payment tiles without providers | `docs/naijapay-status.md`; `/pay` copy; no models | Select and contract providers; build one rail at a time with delivery reconciliation |
| 15 | Documentation and status integrity | "All verticals live", fake business metrics, stale architecture and mixed dates can cause false acceptance | `lib/data/ecosystem.ts` statuses; `app/business/[vertical]/page.tsx:33-38`; `docs/architecture.md`; `docs/requirements-matrix.md`; handoff dates | Correct claims, remove fake metrics, freeze a single dated evidence register |

## 7. Contradictions with prior documents

| Prior document | Claim | Repository reality at HEAD |
| --- | --- | --- |
| `docs/architecture.md` (2026-11-03, HEAD `7590af5`) | 39 models, 19 enums, 25 pages, 70 API handlers, 5 migrations | 164 models, 61 enums, 162 pages, 241 route files, 69 migrations |
| `docs/architecture.md` | Eats/Fresh/Gigs/Stay/Stream/Aura AI "NOT STARTED"; no models | All have models, APIs, pages and recorded test runs |
| `docs/architecture.md` | NaijaPay has no customer deposit/withdraw | Add Money/top-ups exist; withdrawal still absent |
| `docs/architecture.md` | Drive has no live GPS/map | Browser geolocation, OSRM and OSM are implemented; background device tracking remains unverified |
| `docs/requirements-matrix.md` (2026-11-03) | PWA "PARTIAL"; native Android/iOS "NOT STARTED"; GPS "BLOCKED — no map provider"; reconciliation "NOT STARTED" | PWA e2e 27/27/28/28; signed APK builds recorded; GPS/OSRM/OSM implemented; reconciliation exists and has CLEAN runs |
| `docs/phase-tracker.md` | Phase 08 NaijaShop and Phase 09 NaijaDrive "NOT STARTED" | Both have substantial implemented and recorded-tested slices |
| `docs/phase-tracker.md` / `docs/handoff.md` | "All verticals marked live" and `lib/data/ecosystem.ts` status `live` | No country is live, no live payment provider, no deployment, DB classified TEST; `docs/nairadrive/market-registry.md` says no country is live |
| `docs/ecosystem-delivery-tracker.md` (2026-11-02) | Drive 20/20; modules show "Setup required" | Drive suite later 28/28 then 172/172 verification; modules were relabelled "live" |
| `docs/naijapay-status.md` | AI assistant financial tools "No — no AI provider configured" | Aura is implemented with DeepSeek and a permissioned transfer proposal; financial tooling is still not approved, but the blanket "no provider" statement is stale |
| `docs/naiqashop/surface-audit.md` | Courier assignment has no Control Center UI; review moderation is API-only | True at HEAD; the dirty working tree adds both UIs, uncommitted and untested |
| `docs/naiqashop/requirement-matrix.md` | "Tested: discovery 17/17 and browser 21/21" | No command, output file or commit for those scores is present; the recorded Shop evidence is 43/43 storefront QA |
| `docs/nairadrive/current-state-audit.md` | Pickup-verification support UI absent | `components/functional/admin-drive-verification.tsx` is committed and wired at HEAD |
| `docs/nairadrive/current-state-audit.md` | External escrow 2× projection and partial-refund release defects present | Later 2026-11-12 escrow work records both paths corrected and tested; the audit describes an earlier commit |
| `docs/naijadeals-operating-system-build-plan.md` / `docs/ecosystem-delivery-tracker.md` | Various legacy status snapshots | Superseded by later vertical builds; no longer usable as a status source |
| `lib/data/ecosystem.ts` | All ten verticals status `Live`; investor narrative metrics such as "42 sec support response", "1,248 risk alerts blocked", "NGN 1.8B escrow protected" | No live provider, support system or measured metric supports these; `D-002` forbids simulated live data |
| `app/business/[vertical]/page.tsx:33-38` | Revenue today NGN 8.4M, payout queue 418, open support 29, risk score 92 | No data source; fabricated metrics in a rendered page |

## 8. Recommended next three verticals

The dependency order is shared money first, then operator capability, then the commerce anchor. This
is a recommendation, not an authorisation to start any of them.

| Order | Vertical | Why it must come next | Entry gate |
| ---: | --- | --- | --- |
| 1 | Wallet and Payments | Every paid vertical, affiliate settlement and country launch depends on a live provider, safe currency handling, payouts and a supportable refund path. The wallet is the most verified subsystem, so the remaining work is provider, policy and control, not new architecture. | Provider contract; commission/payout policies; non-NG currency gate; re-run escrow/refund suites |
| 2 | Central Admin and support | Five of eleven modules are operable; support, returns and safety queues are absent. Without operator tooling, launching another consumer vertical adds unmanageable queues. | Support domain decision; module build order; RBAC extension; audit tests |
| 3 | NaijaShop (retail) | It is the only affiliate-supported vertical, the anchor for cross-vertical orders, and it already has verified discovery and financial coverage. Completing seller tools, returns, receipts and fulfilment converts it from a demo-grade storefront into an operable marketplace. | Courier assignment committed; seller payout/returns policy; marketplace suite re-run |

Do not start Travel, Property or Rentals next. Each lacks a transaction model, legal terms and a
country/payment base. NaijaDrive is the strongest conditional fourth: it has a verified ride core
and needs supply, onboarding and payout work rather than a rebuild.

## 9. What could not be verified

- No live payment, payout, refund or webhook was executed; no Paystack/Flutterwave credential is
  present.
- No non-NG order was created; country readiness for GH/KE/ZA/GB/US is untested beyond activation.
- No physical Android/iOS device run, push delivery or background-location acceptance is recorded.
- No current full Shop acceptance run exists after the 2026-11-12 escrow/refund repairs; the last
  marketplace suite was 12/13 on 2026-11-09.
- The current drive HTTP and browser suites have not been executed after the pickup-verification
  gate; only the service-level 172/172 is current.
- The affiliate refund→reversal integration suite has no recorded pass; the incident record shows
  real dev reversal intents, not an acceptance run.
- No real restaurant, farmer, host, professional, artist or transporter has completed the full
  application → approval → first paid transaction path in a recorded run.
- The Gigs/Fresh/Stay/Stream admin APIs have no committed UI call site and no recorded admin
  acceptance run; Eats admin controls are inside the Shop module.
- `notifications-verify.ts` exists but no executed result is recorded; only the outbox suite is.
- No unified ecosystem search, airtime/bills, payment link, customer withdrawal or airtime-credit
  implementation exists to verify.
- Accessibility was audited on 15 routes on 2026-11-03; the newer verticals and admin panels have
  no equivalent run, and no manual screen-reader pass is recorded.
- Kie.ai assets are recorded as generated, but 60 registry entries lack a `taskId` and many are
  `pending-owner-review`; no runtime generation endpoint exists.
- The `docs/naiqashop/reference-research.md` observations are documented, but the Amazon captures
  found are from 2026-11-09 and do not include the populated cart/checkout; no Jumia observation
  exists.
- Runtime country/city activation state in the live database was not read; only code and recorded
  tests were inspected.
- No test, browser or database verification was performed for this document.
