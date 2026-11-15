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

### Baseline update — 2026-11-15 integrated Shop baseline

The table above is the original programme snapshot. It is retained as history and is **not** the
current baseline. This section records the integrated state used for the consolidated Shop matrix in
§1.2. The previous 2026-11-14 baseline (`23da554` / build `H9mMmDLBrIv4jMFc6Co0M`) is superseded.

| Item | Verified value (read-only inspection, 2026-11-15) |
| --- | --- |
| Repository / branch | `C:\Users\User\Documents\naijadeals.com`, branch `naijashop-marketplace` |
| Local HEAD | `251810fa30cc074206c1fb97680a3f779784a16e` ("Fix Shop reviewer findings and test contracts", 2026-11-15). Parent `1005a7a`. It commits the admin restock-recovery route, saved-items market cookies, `aria-label="Primary"`, the product-level gallery assertion and the origin-removal public-inventory assertion. |
| Final build | `8CTjw5MV-9MCKuV66hkoY`, `.next-programme/BUILD_ID`, commit `251810f` (build log `qa-artifacts/shop-consolidation/final-build-251810f.log`). This supersedes the interim `jwDsK2Ru5RpdPSdRU29w8` test build and `H9mMmDLBrIv4jMFc6Co0M`. |
| Migrations applied to REVIEW | `20261114120000_order_item_restock` and `20261114121000_inventory_nonnegative_constraints`. Evidence: `qa-artifacts/shop-consolidation/migrations-review.log` (84 migrations, no pending) and `migrations-test.log` (all applied on TEST). The inventory migration preflighted zero violations and repairs no history. |
| Remote preservation | `github-preservation/naijashop-marketplace` resolves to `e80a0f9` (2026-11-08) by `git ls-remote`; local HEAD is **417** commits ahead. Shop work is preserved locally only. See §1.2 gate G10. |
| Catalogue | 259 products, 63 ACTIVE, all ACTIVE products DEMO, 0 active fixtures, 0 variants, 0 Shop activation rows. Confirmed in `qa-artifacts/shop-consolidation/variant-concurrency-tests.log` (baseline and restored counts 259/63/0) and the country acceptance restoration. |
| Taxonomy | 11 departments / 37 categories / 117 selectable leaves / 165 nodes; 100 publishable, 17 NG-regulated; 41/100 populated, 59 empty; 63 ACTIVE products on leaves. Evidence: `qa-artifacts/visual/catalogue-batch3/coverage.log` (PASS). The older `qa-artifacts/_taxonomy-coverage.json` (113 leaves, 57 ACTIVE) is stale. |
| Discover Africa | 54 published country profiles, 324 themes, 362 source records; **57** theme override rows; visual acceptance **175/175** including **57/57** changed overrides (`qa-artifacts/shop-consolidation/country-visual.log`), final 54-card/324-image pass with 0 defects (`country-54-final.log`) and origin-removal public-inventory test **10/10** (`country-origin-final.log`). The remaining imagery audit is **39 NON_PHOTOGRAPHIC + 44 BROAD, 0 MATERIAL_FAIL**; the Kie MCP host approval was explicitly declined, so no new images were generated and **0 credits** were spent. Country imagery is **not complete**. |
| Working tree | The final reconciliation modifies these two matrix docs and the country imagery docs/evidence; the admin restock-recovery route is **committed** in `251810f` and there is no untracked code route under `app/`. Pre-existing unrelated research assets and line-ending-only script changes remain untouched. |
| Audit method | `git rev-parse`, `git log`, `git show`, `git merge-base --is-ancestor`, `git ls-remote`, `git diff`, `git cat-file`, file reads and artifact reads. The integrated test results below were supplied by the coordinator and checked against their logs where present; no test, migration, database read/write, browser run or preview restart was performed by this audit. Status claims mean "a recorded run exists", not "re-executed here". |

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

### 1.2 Shop (retail) — NaijaShop — consolidated completion matrix

This is the single authoritative Shop tracker as of 2026-11-15. The historical acceptance log
further below is retained as provenance only and is subordinate to this section.

Canonical routes: `/naijashop` (storefront), `/naijashop/{categories,c/[slug],search,deals,bestsellers,sellers,plus,help}`,
`/naijashop/countries`, `/naijashop/countries/[slug]`, `/product/[id]`, `/cart`, `/checkout`,
`/orders`, `/orders/[id]`, `/tracking/[id]`, `/returns`, `/seller`, `/sell`, `/account#saved`.
APIs: `/api/products`, `/api/products/availability`, `/api/categories`, `/api/cart*`, `/api/checkout`,
`/api/orders*`, `/api/seller/*`, `/api/reviews`, `/api/storefront`, `/api/admin/{products,catalogue,taxonomy,orders,vendors,applications,deliveries,reviews,disputes,payouts,verticals,countries}`.
Models include `Vendor`, `Category`, `Product`, `ProductImage`, `ProductVariant`, `InventoryStock`,
`Cart`, `CartItem`, `Order`, `OrderItem`, `OrderStatusEvent`, `Delivery`, `TrackingEvent`,
`ReturnRequest`, `Review`, `SellerApplication`, `StorefrontConfig`, `VerticalActivation`,
`CountryProfile/Theme/Source`, and the Plus+/affiliate models.

**Accepted-fix reconciliation (committed source, verified by ancestry).** All of the following are
ancestors of HEAD `251810f` (`git merge-base --is-ancestor <commit> HEAD` = true): `873aa37`
(paused Shop/Stay integration and catalogue coverage), `fd4207c` + `25fc304` (image persistence and
market acceptance), `2d56c70` (image pairing and market-cache gaps), `a72eec0` + `8482d23`
(market-scoped browsing and regulated eligibility), `0797a19` + `0cd0b4e` + `0b53d49` (variant
integrity, locks and strict variant input), `3052d07` + `e968db1` + `9fdafdf` + `9dd9b11` (paused
Shop first paint and presentation), `dea4235` (activation recovery and batch 3), `d021408` +
`9c5fe8f` + `37172e5` (country-discovery remediation), and `1005a7a` (durable per-item restock
recovery, inventory CHECK constraints, safe saved-items projection, transactional activation
snapshot restore, server-paginated admin products), and `251810f` (committed admin restock-recovery
route with admin/region guards, saved-items market cookies, `aria-label="Primary"`, product-level
gallery assertion, origin-removal inventory assertion). `50a0b57` (D1 gallery) is **not** an
ancestor: its merge base with HEAD is `873aa37`, and HEAD contains 60 commits it lacks.

Shop status vocabulary for this matrix (deliberately stricter than the rest of the document):

| Status | Meaning here |
| --- | --- |
| **INDEPENDENTLY TESTED** | An executed run exists with a named command, log or artifact at the cited revision (implementer run or recorded independent review). The area was not re-executed by this audit. It is not commercial readiness. |
| **IMPLEMENTED** | Code exists at HEAD but the area has no current acceptance run at the cited revision, only partial/stale evidence, or an unrun committed suite. |
| **OPERATIONALLY READY** | Software plus the operational prerequisites (live provider, real supply, staffed support/moderation/refund operation, runbooks) are in place for a real transaction. **No Shop area reaches this.** |
| **LIVE** | Serving real customers with real inventory and money. **No Shop area is LIVE**; REVIEW holds 63 ACTIVE demonstration listings only. |
| **NOT IMPLEMENTED** | The capability is absent. Used where a required sub-capability does not exist, so a positive status would be false. |

DEMO inventory, REVIEW acceptance and a green build are never treated as launch readiness. Software
defects are separated from commercial/provider/business decisions in the last column. Where a row
cites a revision earlier than `1005a7a`, that area was not changed by the integrated commit and the
cited run remains its latest recorded evidence; it is not a re-run at `1005a7a`.

| Area | Public / customer behaviour | Seller / provider management | Control Center management | Server permissions and market scope | Status | Exact evidence + candidate revision | Remaining defect / dependency |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Landing / storefront | Retail-first `/naijashop`: hero, category shortcuts, eight shelves before wholesale, Discover Africa row after two shelves, honest loading/empty/error; DEMO labels; paused panel in DISABLED/PREVIEW keeps orders/cart/saved/returns/help and advertises no new order | None (read-only) | Storefront draft/publish preview, hero/shelves/African-discovery controls, Shop activation | Public; selected country/city drives catalogue (NG 63 listings; GH returned 0 in the recorded market runs, all catalogue rows are NG); Shop activation resolver; no permission for read | INDEPENDENTLY TESTED | `BASE_URL=http://localhost:3061 node scripts/storefront-landing-audit.cjs` **95/95** (`qa-artifacts/review-basket-review/product-activation-final/landing-audit-final.log`); homepage activation recheck **17/17** (`qa-artifacts/visual/final-variant-acceptance/recheck-homepage-activation.log`); country row/cards **175/175** including 57/57 overrides (`qa-artifacts/shop-consolidation/country-visual.log`) and final 54-card/324-image pass with 0 defects (`country-54-final.log`); final build `8CTjw5MV-9MCKuV66hkoY`, commit `251810f` | Live storefront consumes `showHero/showShelves/shelfLimit/AfricanDiscovery/discoveryCards` but not the persisted announcement, hero copy, `visibleCategories`, `showDemoProducts` or `heroSlides` (legacy `components/commerce/naijashop.tsx` still reads some for non-landing pages). Storefront controls therefore remain partly disconnected. Country imagery is not complete: 39 NON_PHOTOGRAPHIC + 44 BROAD remaining, 0 MATERIAL_FAIL. |
| Category rail / directory | Horizontal department rail plus searchable full directory, derived from effective taxonomy (37 categories at level 2 under 11 departments), arrows/swipe/keyboard/snap/reduced motion, counts and images; no hardcoded subset | Seller sees category picker/breadcrumb/attributes in the product form | Taxonomy workspace, browsing visibility, publication | Public; `browsingVisible` separates browsing from publication; market-scoped; a restricted category remains visible with zero count and `canPublish:false` | INDEPENDENTLY TESTED | `BASE_URL=... node scripts/category-rail-audit.cjs`: **150/150, 0 failed** (`qa-artifacts/visual/category-rail/result.json`, 2026-11-14T07:10Z; 11 departments, 37 categories, 19 populated at that snapshot, 35 images, 2 fallback icons); rail recheck in `qa-artifacts/visual/final-variant-acceptance/` | Two all-regulated categories have no tile image (fallback icon). Directory/rail counts are snapshot-derived; later catalogue growth changes populated counts. |
| Taxonomy | Department → category → leaf navigation, attributes and filters; restricted leaves explain the market restriction | Seller category request → admin resolution; alias search; attribute capture | Nested tree create/edit/aliases/attributes/rules/requests, audit; `products:moderate` | `products:read` for reads, `products:moderate` for mutations; country scope enforced on mutations; regulated leaf without an explicit country rule fails closed | INDEPENDENTLY TESTED | `npx tsx scripts/taxonomy-response-contract-tests.ts` **18/18**; `REVIEW_DATABASE_URL=... npx tsx scripts/taxonomy-market-browsing-tests.ts` **18/18**; `taxonomy-browsing-visibility-tests.ts` **16/16**; aggregation **34/34**; `taxonomy-image-persistence-tests.ts` **13/13**; coverage `qa-artifacts/visual/catalogue-batch3/coverage.log` = PASS, 11/37/117/165, 41/100 populated, 59 empty, 17 regulated. Revision `25250d3`–`0b53d49` | 59 publishable leaves have no listing; 22 ACTIVE products were intentionally kept at their existing leaves. `qa-artifacts/_taxonomy-coverage.json` (113 leaves, 57 ACTIVE) is stale and must not be cited. Population is blocked on approved original assets, not code. |
| Search | Query/filter/sort/page discovery with token-AND matching; honest empty state; market-isolated results | Seller catalogue search not exposed beyond product list | No dedicated search-index admin | Public; market country/city scoping; no suggestions | IMPLEMENTED | Search/market isolation is covered by `taxonomy-market-browsing-tests.ts` **18/18** and the landing audit's search journeys; multi-word token matching is in `lib/services/core/catalog.service.ts` (`matchesText`) | No search suggestions. The catalogue is loaded and paginated in memory; Meilisearch is unavailable in REVIEW, so the DB fallback serves. No current dedicated search suite at HEAD; a typo-tolerance claim would be unverified. Dependency: production search engine/limits decision. |
| Product detail / gallery | Three-area desktop / ordered mobile; gallery with keyboard viewer and broken-image removal; variant price/stock updates; selected variant leaves the product-level gallery unchanged; approved reviews only; related failure isolated; seller destination; REVIEW purchase notice; effective DEMO label | Seller product form parity for gallery order/alt/attributes/stock; seller cannot publish | Admin gallery/attributes/stock/DEMO/publish; draft preview | Public read; `products:moderate` for admin writes; seller ownership; market gating on detail 404/200 | INDEPENDENTLY TESTED | `qa-artifacts/shop-consolidation/product-detail-final.log` **101/101, 0 failed** on the final build (`8CTjw5MV-9MCKuV66hkoY`, commit `251810f`), now asserting the product-level gallery across variant selection; earlier 99/99 at `0b53d49`. | **Per-variant gallery switching is intentionally deferred.** The UI passes `preferredUrl={null}` and the public/admin variant payloads exclude `imageUrl`/`imageId`; the product gallery is the only image source. Branch `fix/d1-variant-gallery` (`50a0b57`) is not merged and conflicts with the current contract; the suite now asserts the deferred contract rather than D1 behaviour. |
| Variants (current strict contract) | Variant selector on detail; missing option → `variant_required`; inactive/foreign/out-of-stock refused; last-unit race preserves one reservation | Seller creates/edits variant name/SKU/price/stock/options, cannot set product stock while variants are active, cannot publish | Admin variant editor, publish gate, before/after audit | Ownership and product-currency checks; 50-variant/1,000,000-stock bounds; stock-and-variant row locks in canonical order; `imageUrl`/`imageId` rejected `400 unsupported_variant_field`; database CHECK constraints now enforce nonnegative and reserved ≤ stock on both stock sources | INDEPENDENTLY TESTED | `qa-artifacts/shop-consolidation/variant-concurrency-tests.log`: **109/109, 0 blocked, 0 failed** (build `jwDsK2Ru5RpdPSdRU29w8`, commit `1005a7a`; baseline/restored 259/63/0); `variant-management-tests.log` **32/32** with explicit `REVIEW_DATABASE_URL`; migration `20261114121000_inventory_nonnegative_constraints` applied after a zero-violation preflight (`migrations-review.log`, `migrations-test.log`); strict image rejection asserted in both runs. | Legacy `ProductVariant.imageUrl` remains readable and appears in some non-catalogue snapshots (`checkout.service.ts`, raw seller/admin includes); current data has 0 legacy variant images. Per-variant gallery images remain deliberately out of contract. The historical `latest.json` (104 passed / 5 failed) is stale and must not be cited. |
| Saved items | Heart/save on detail, `/account#saved` list, saved-for-later section in `/cart`, badge excludes saved lines; the account page now sends the selected `nd_country`/`nd_city`; unavailable items stay visible with a truthful reason and are not marked purchasable | None | None | Session-owned; safe public projection enforces Shop activation, publication, market, seller eligibility, contact-only and availability/variant reasons; no raw vendor/category/variant rows; `savedForLater` is display state, not a reservation | INDEPENDENTLY TESTED | `qa-artifacts/shop-consolidation/saved-items-tests.log`: **11/11** on TEST (`SIP-MWHQ55K9-A7C72A`), covering unpublished, out-of-market, blocked activation, seller-unavailable, contact-only, unknown availability, out-of-stock and choose-variant reasons with no raw rows; `availability-view-tests.log` **14/14**; `251810f` wires `selectedMarket()` into `apiClient.getSaved(market)` (reviewer F2). The pre-fix mismatch is reproduced in `qa-artifacts/review-acceptance/market-saved-probe.log` | No post-fix browser journey for `/account#saved` was found in this evidence set; the API/service projection and source wiring are verified. |
| Basket | Server-priced cart, quantity cap 10, per-line availability, saved-for-later, market mismatch refusal (`item_market_mismatch`/`product_market_unavailable`), variant-required and stock refusals, authoritative header count; unavailable lines are presented with the server reason at 390/768/1440 and checkout stays refused | None | None | Session/cart ownership; product/vendor eligibility and market checked on add and update; stock locks | INDEPENDENTLY TESTED | `qa-artifacts/shop-consolidation/basket-tests.log` **10/10**; `cart-availability-tests.log` **3/3** (API availability for active and saved lines; checkout refuses `item_unavailable` with no order; UI at 390/768/1440, screenshots `qa-artifacts/cart-availability`); variant concurrency **109/109** covers oversell/last-unit/same-customer adds. Build `jwDsK2Ru5RpdPSdRU29w8`, commit `1005a7a` | No separate load/concurrency test for one customer editing on two devices. |
| Checkout / payment foundations | Wallet-payment checkout with server totals, delivery zone/fee, escrow hold, per-vendor orders, idempotent confirmation, cancellation and expiry; REVIEW financial operations refused | None | Payments/escrow/reconciliation tabs, order status, refunds | `country_disabled` 400, `delivery_unconfigured` 503, cross-market line refusal; wallet ownership; TEST/LIVE classification fail-closed; no live provider | IMPLEMENTED | Targeted suites pass: `closure-lock-custody-acceptance.ts` **13/13**, `checkout-refund-delivery-acceptance.ts` **10/10**, `review-financial-refusal.ts` **46/46** (`boundaryComplete true`, 0 provider calls; `qa-artifacts/shop-consolidation/financial-refusal.log`). The full `scripts/marketplace-tests.ts` on TEST is **4/13 — OPEN/BLOCKED**, logged at `qa-artifacts/shop-consolidation/marketplace-tests.log`: seller-created product expected ACTIVE but the admin-publication policy keeps it DRAFT; seeded public catalogue is 6 products against a ≥12 historical expectation; homepage shell is missing the expected primary-nav marker; the checkout/refund/delivery/cross-tenant steps then fail on the resulting 404/seller-inactive/308 assumptions. These are stale test expectations and dependent steps, **not a software pass**. | **G3 is OPEN/BLOCKED, not passed.** The historical marketplace suite must be updated to the current publication, seed-size and shell contracts and re-run before any 13/13 claim. No live payment provider; only the TEST adapter and wallet path. Checkout writes `country.currency` (lines ~458/530); non-NG delivery is refused by the static `deliveryEnabled` flag, so enabling it later would label NGN-priced orders in another currency. City activation is not enforced at checkout. Commercial gates: provider contract, non-NG price lists/FX, entity/tax. |
| Orders | `/orders` and `/orders/[id]` list real orders and statuses; customer confirm/cancel; historical order readable after product unpublish; tracking link; DEMO wording | Seller sees own orders and advances fulfilment status | Order list/detail, status transitions, cancellation, refund-aware closure | Customer ownership; seller ownership; `orders:read`/`orders:write`; country scope; closure uses `Order -> Payment -> Delivery -> wallet` lock order | INDEPENDENTLY TESTED | `scripts/review-order-snapshot-journey.cjs` **8/8** after unpublish (`review-order-snapshot-journey.cjs` recorded in handoff; run-tagged fixture removed); closure/custody **13/13** covers duplicate/concurrent closure and custody retention. Revision `0b53d49` | No printable receipt/invoice or payment reference document. No customer dispute-intake route (`openDispute` service exists but no customer API); admin resolution/refund UI exists. |
| Delivery / tracking | `/tracking/[id]` shows the recorded delivery and tracking events; order page links to it; no invented live map | Courier sees only assigned deliveries and advances pickup → in transit → delivered | Deliveries tab with assignment panel, courier list, status controls; refunds cancel only uncollected parcels | `deliveries:write`; courier active + account verified; order must be `ready_for_pickup`; order-before-delivery lock order; courier sees own rows only | IMPLEMENTED | `assignCourier` refused closed states/suspended/unapproved/not-ready and notifies the courier (`lib/services/core/admin.service.ts`); committed UI `components/functional/admin-delivery-assignment.tsx` wired in `admin-workspace-tabs.tsx` at HEAD; assignment/cancellation race and stale courier are covered by `closure-lock-custody-acceptance.ts` **13/13** | No current end-to-end UI assignment → courier → delivery journey at HEAD; the dedicated HTTP suite `scripts/naijashop-control-center-tests.ts` is committed but no run log was found. No courier GPS breadcrumbs/ETA. No courier payout statement. |
| Returns / refunds | `/returns` eligible-order return-case journey, reason/notes, case timeline, honest refund panel; seller approve/reject/receive; 14-day window retained | Seller queue and resolution; receive restocks through the durable per-item ledger and settles the refund | Dispute/refund queues; no dedicated returns queue | Customer ownership; vendor ownership; `returns`/`orders` permissions; refund uses order-first lock; provider refund status absent | INDEPENDENTLY TESTED | `returns-case-tests.ts` **18/18** (handoff record) and `returns-case-visual-qa.mjs` pass (screenshots `qa-artifacts/returns-case/`); refund mechanics 20/20 and 156/156 (handoff records); durable restock `qa-artifacts/shop-consolidation/restock-tests.log` **35/35** on TEST (baseline 25/27 before the fix): `OrderItemRestock` per item, `RESTORED` terminal, `SUPPRESSED` retryable, `LEGACY_RECORDED`, `order.stock_recovery_pending`; a completed financial refund is separate from physical-stock recovery. Build `jwDsK2Ru5RpdPSdRU29w8`, commit `1005a7a` | No admin returns queue or admin resolution route; whole-order only; no photo/evidence field; the receive-and-refund customer/seller journey was not re-executed in this integrated run. Return-leg funding, return statuses and non-recoverable parcel policy remain owner decisions. The restock-recovery admin HTTP route is now **committed** in `251810f` (`GET/POST`, `orders:read`/`orders:write` plus `assertOrderRegion`); it lists/retries SUPPRESSED items and moves no money. |
| Seller lifecycle | Public `/sell` recruitment and `/seller` sign-in; seller dashboard products/orders/returns/profile/earnings | Application → admin approval, DRAFT creation, variant/price/stock editing, gallery/attributes, submit for publication; seller cannot self-publish; suspension blocks writes | Applications, vendors, products, payouts, orders, returns, audit; the products tab is now server-paginated with total/search/status/sort and region scope, so the oldest product is reachable | `SellerApplication` unique per user; `vendor` actor scope; seller ownership; publication requires admin + verified vendor; country/market fixed after creation | INDEPENDENTLY TESTED | `review-catalogue-workflow.cjs` **142/142 twice** (`qa-artifacts/catalogue-admin-parity/`); seller variant editing **32/32** and publication refusal `403 admin_publication_required` (`qa-artifacts/shop-consolidation/variant-management-tests.log`); admin products **12/12** including oldest-product reachability, total/search/status/sort, region scope and 390/768/1440 (`qa-artifacts/shop-consolidation/admin-products-tests.log`) | No seller payout request/history (admin-created payouts only), no seller staff/roles, no seller receipt/invoice, no seller analytics. Real seller supply is unproven: all 63 ACTIVE listings are DEMO. |
| Moderation | Products/cards show DEMO labels; reviews PENDING until approved; only approved reviews affect ratings | Seller cannot moderate or self-publish | Reviews tab (approve/reject with reason, status filter), product suspend/reactivate, vendor review, taxonomy restrictions, audit; scoped moderator product action verified through the paginated products tab | `products:moderate`; `support` is denied review queue and decisions; country scope on review/product lists; customer cannot moderate | IMPLEMENTED | `components/functional/admin-reviews-panel.tsx` and `/api/admin/reviews` are committed; product/vendor suspend → Shop journey **7/7** (`qa-artifacts/review-basket/admin-journey.json`); scoped moderator suspend→activate with audit and cross-region 403 in `qa-artifacts/shop-consolidation/admin-products-tests.log` **12/12**; review moderation assertions exist in `scripts/naijashop-control-center-tests.ts` but **no run log/artifact was found**; screenshots `qa-artifacts/visual/naijashop-control-center/` | Review moderation itself is not independently verified at this revision. No rating-recomputation assertion artifact found. No moderation queue for returns or support. |
| Plus+ | `/naijashop/plus` honest availability page: 10 awareness cards, zero configured benefits/promotions, every country "not yet available", no price/join/billing control | None | `/admin/plus`: awareness draft/publish/archive/reorder/schedule/country scope; plans with frozen terms and paid-activation gate; benefits; house/sponsored promotions with advertiser approval; plan retirement | Separate `plus:*` permissions; ordinary `admin` cannot publish content, configure membership or approve advertisers; owner-only commercial decisions | INDEPENDENTLY TESTED | Handoff 2026-11-12 records honesty **20/20**, lifecycle **37/37**, admin **19/19** (commands/results recorded; no raw stdout located in `qa-artifacts`); independent browser reviewer executed Control Center activation → retirement and inspected 390/1440; earlier honesty **19/19**; screenshots `qa-artifacts/plus-review-final/`, `qa-artifacts/plus-final-independent-review/` | No membership purchase, billing, entitlement enforcement or redemption; no approved price/country rollout. Commercial dependency: owner decisions in `docs/plus/commercial-decisions.md`. |
| Affiliates | `/affiliate` enrolment, campaigns/links, `/r/[code]` consented attribution, Shop checkout conversion, settlement visible in wallet | Affiliate self-service dashboard | `/admin/affiliate-campaigns`, `/admin/affiliate-reviews`, recovery review | `affiliates:read/manage`; supported-vertical registry is `["shop"]` only; first-party touch, self-referral refusal, frozen commission rules | INDEPENDENTLY TESTED | Recorded suites: `affiliate-verify.ts` 12/12, destination 11/11, guest journey 3 checks, campaign 9, financial 6, settlement 10/10, recovery 5, race 6; Aura read tools 4 checks. Affiliate code last changed `15d9173` (2026-11-11) | Shop only; multi-vertical attribution, external affiliate payout and tax handling absent. Refund → reversal integration has no recorded full-suite pass, and the affiliate suites were not re-run after the 2026-11-14/15 checkout/variant changes. |
| Country discovery | `/naijashop/countries` searchable directory and 54 country pages; Discover Africa row after two retail shelves; six theme/source rows per country; Known for separate from Available on NaijaDeals; honest empty inventory; delivery/address/currency unchanged | None | `/admin/countries`: draft/edit/preview/publish/unpublish, themes/sources, image/alt, featuring/order, audit, origin review | `countries:editorial:*` / `countries:origin:review`; ordinary `admin` may draft but cannot publish or verify origin; country scope; origin must be a published discovery country; publication requires reviewed themes/sources/images/alt | INDEPENDENTLY TESTED | `country-discovery-acceptance.cjs` **67/67, 0 failed/blocked** (`qa-artifacts/shop-consolidation/country-acceptance.log`, restored 54/324/362); visual/carousel **175/175** with **57/57** override rows rendered (`country-visual.log`); final 54-card/324-image pass with 0 defects (`country-54-final.log`); origin-removal test **10/10** now asserts the cleared product is excluded from public country inventory (`country-origin-final.log`, reviewer F7); origin-review pagination independently verified (`admin-products-tests.log`); axe 0 on directory/Ghana/storefront at 390/1440. Final build `8CTjw5MV-9MCKuV66hkoY`, commit `251810f`. Remaining audit: **39 NON_PHOTOGRAPHIC + 44 BROAD, 0 MATERIAL_FAIL** | **Imagery is not complete.** The Kie MCP host approval was explicitly declined, so no new images were generated and 0 credits were spent; the 39 non-photographic and 44 broad theme rows remain an open external/tooling gate. 0 products have recorded origin (honest empty state). The country audit is reconciled to 57/57 applied and 0 pending reseed; its remaining verdict is 39 NON_PHOTOGRAPHIC + 44 BROAD, not a completed photographic set. Country guides do not enable commerce. |
| Support | `/naijashop/help` topic page links to orders/wallet/pay/account; no ticket, chat or case intake | None | None | `support` staff role is read-only (`dashboard:read`, `orders:read`, `deliveries:read`); no ticket model/route | NOT IMPLEMENTED | Source inspection: no `/support` route, no ticket model or queue; help copy says returns are "reviewed by the seller and platform support"; `docs/naiqashop/surface-audit.md` gap 6 | No support domain, SLA, assignment or customer history. The help copy overstates the current support capability. Dependency: support-domain/helpdesk decision and staffed operation. |
| Super Admin Shop activation | DISABLED/PREVIEW/LIVE behaviour: paused public storefront/homepage, no new cart additions/checkout/seller listings; authorized PREVIEW sees draft UI; existing orders/cart/saved/returns/help preserved | New listings refused while paused | Service activation panel, reason, audit; read for any dashboard operator, write super-admin only | `verticals:write` is super-admin-only; least-permissive precedence across GLOBAL/COUNTRY/CITY; local rule cannot loosen parent; Shop is the only consumer wired (Stay enforced; other verticals NOT_WIRED) | INDEPENDENTLY TESTED | `qa-artifacts/shop-consolidation/activation-tests.log` **30/30** and `activation-recovery-tests.log` **8/8** at `1005a7a` (unchanged by `251810f`). Restore and discard run as one exclusive transaction under `LOCK TABLE "VerticalActivation" IN EXCLUSIVE MODE`, re-diff, use exact force fingerprints and write audit; failure rolls the whole transaction back. Server-resolved first paint adds 0 initial probes (`3052d07`) | SIGKILL/power loss cannot run a transaction; the durable snapshot plus CLI recovery remains the operator fallback. The paused-homepage RSC path was not re-executed in this run. |
| Accessibility | Semantic headings, labels, keyboard gallery/rail/directory, focus retention, touch targets, reduced motion, no horizontal overflow at 320/390/768/1440 (Shop landing/rail/drawer) | Seller/admin forms labelled | Admin countries/catalogue panels keyboard reachable | n/a (presentation) | INDEPENDENTLY TESTED (partial) | axe WCAG 2.0/2.1 A+AA: 0 violations for storefront, directory and Ghana landing at 390/1440 (`qa-artifacts/visual/discover-africa/axe.json`) and `/admin/countries` at 390/1440 (`axe-admin-final.json`); rail 150/150 includes keyboard/focus/end-state; landing 95/95 includes no-overflow/keyboard destinations; country visual 175/175; app-shell primary navigation is now `aria-label="Primary"` (`251810f`, reviewer F3) | Not all Shop routes are covered: cart, checkout, orders, returns, seller and most admin Shop tabs have no current axe run. No manual NVDA/VoiceOver pass. The 15-route 2026-11-03 audit in §3 predates this catalogue. Automated checks are not certification. |
| Recovery and preservation | Existing orders/cart/saved items/returns remain readable through pauses and catalogue changes; no data loss on failed runs | Run-owned fixtures removed; accepted catalogue counts restored (259/63/0); suppressed restock units remain visible and retryable through the committed admin route | Activation restore/discard one-transaction CLI with audit; per-item stock-recovery ledger, reconciliation service and admin API; catalogue workflow cleanup | REVIEW/TEST database identity + classification guards; run-tagged fixtures; exclusive acceptance lease; `orders:read`/`orders:write` + `assertOrderRegion` on recovery | INDEPENDENTLY TESTED | `activation-recovery-tests.log` **8/8**; `activation-tests.log` **30/30**; `restock-tests.log` **35/35**; workflows **142/142 twice**; variant/country runs restored 259/63/0; admin route committed at `251810f` | **Remote preservation is BLOCKED:** `git ls-remote` shows `github-preservation/naijashop-marketplace` at `e80a0f9` (2026-11-08); local HEAD `251810f` is **417** commits ahead. Local commits are the only preservation path. SIGKILL/power loss still needs operator recovery. |

Shop counts for §4: INDEPENDENTLY TESTED 16, IMPLEMENTED 4, NOT IMPLEMENTED 1,
OPERATIONALLY READY 0, LIVE 0 (21 rows). Accessibility remains only partially covered by axe;
G3 (full marketplace regression) is OPEN/BLOCKED and is not counted as a pass.

**Finite Shop completion gates.** These are the gates between the current REVIEW/demo state and a
defensible commercial Shop launch. None is a reason to call the Shop complete today.

1. **G1 — Real supply:** at least one real, verified seller with real inventory, origin evidence where claimed, and a completed customer order.
2. **G2 — Payment provider:** a contracted provider with sandbox charge/webhook/refund/payout acceptance, then an authorised LIVE gate. No live provider exists.
3. **G3 — Full current marketplace regression: OPEN/BLOCKED (not passed).** The TEST run is **4/13** (`qa-artifacts/shop-consolidation/marketplace-tests.log`). Exact causes: the suite expects a seller-created product to be ACTIVE (the current policy requires admin publication, so it is DRAFT); it expects ≥12 seeded public products but the public catalogue returns 6; it expects a homepage primary-nav marker that no longer exists; the checkout, failed-payment, concurrency, refund and delivery steps then fail on dependent 404s/seller-inactive, and the cross-tenant step expects 200 where `/api/orders` returns 308. Fix the stale test contract and re-run; do not report a software pass from this run.
4. **G4 — Support operation:** a real ticket/case intake, queue, assignment and customer-visible status; remove or correct the help copy until then.
5. **G5 — Returns operation:** admin returns queue, evidence capture, return-leg funding policy, and an executed receive-and-refund acceptance. The per-item restock ledger, retry service and guarded admin recovery route are now committed.
6. **G6 — Seller lifecycle completion:** seller payout request/history, staff roles, receipts/invoices and agreed commission/payout policy.
7. **G7 — Remaining contract decisions:** DB CHECK constraints for stock invariants are **fixed and applied**; durable per-item restock recovery is **fixed and tested (35/35)**. Still open: decide whether per-variant images return (D1 branch deferred, not in HEAD) and close legacy variant-image exposure in non-catalogue snapshots.
8. **G8 — Non-NG commerce:** per-country price lists/FX, currency settlement, entity/tax/consumer-law review, and city-level checkout enforcement. Country discovery is editorial only; its imagery is not complete (39 non-photographic + 44 broad).
9. **G9 — Accessibility completion:** axe on cart/checkout/orders/returns/seller/admin Shop tabs plus a manual screen-reader pass; no "certified" claim before that.
10. **G10 — Preservation:** push the **417** local commits to the authorised remote (or a verified non-deploying branch) and confirm `git ls-remote` equals the intended local SHA. The remaining documentation/evidence edits should be committed first.

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

### 2.8 Discover Africa editorial discovery (not commerce readiness)

This is an editorial discovery registry, separate from the six-market commerce registry. Publishing a
country guide does not enable checkout, delivery, currency, language or an operating entity in that
country. Western Sahara is documented separately as a disputed/non-self-governing territory and is not
a 55th country page.

| Capability | Reference + evidence | Existing implementation | Gap | Planned adaptation | Owner (agent type) | Acceptance test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 54-country coverage and direct navigation | `docs/countries/registry-reconciliation.md`; `CountryProfile`; `scripts/country-discovery-acceptance.cjs` | 54 published profiles, 54 flags, directory search, country row and dedicated pages | No approved commerce readiness for 50 of the 54 countries | Keep discovery and commerce separate; add a market only through the commerce checklist | Fullstack agent | Every published code resolves; row/directory/landing coverage; unknown and Western Sahara 404 | VERIFIED (34/34 final acceptance) |
| Editorial source records | `docs/countries/research/*`; `CountryThemeSource` | 324 themes, 362 sources, 6 per country, all reviewed | Some source associations are single-source or dated; external links were not re-fetched in final acceptance | Periodic editorial recheck; keep access dates | Editorial agent | Every theme has source URL/date; no empty source; publication gate | VERIFIED |
| Country card row and directory | `components/shop/country-discovery.tsx`; `qa-artifacts/visual/discover-africa/` | 54 lazy-loaded cards after two shelves, six HTML-labelled images, arrows/swipe/keyboard/snap/reduced motion; searchable directory | Broad reused/illustrated imagery remains for some themes; no auto-rotation | Replace broad tiles through the theme editor when accurate assets exist | Frontend agent | 54 cards; no overflow; focus/end-state; search; 390/768/1440 | VERIFIED |
| Country landing and honest inventory | `app/naijashop/countries/[slug]/page.tsx`; `docs/countries/origin-data-audit.md` | Intro, six themes/sources, separate Known for / Available on NaijaDeals, wholesale/freight links | 0 products currently have recorded origin; populated listing path not exercised | Record genuine origin evidence through Control Center | Fullstack agent | 54/54 pages; empty state; delivery settings unchanged | VERIFIED for empty-state journey; populated origin path IMPLEMENTED but unverified |
| Country Control Center | `/admin/countries`; `app/api/admin/country-discovery/**`; `lib/auth/permissions.ts` | Draft/edit/preview/publish/unpublish, source editing, order/featuring, audit, origin review | No dedicated `country_publisher`/`country_origin_reviewer` account exists in REVIEW; role separation is code-verified only | Create named staff roles when used operationally | Backend/Security agent | Admin edit/preview/publish/public, scoped and anonymous refusals, drift gate | VERIFIED (34/34) |
| Kie theme imagery | `docs/countries/imagery-manifest.md`; `public/generated/countries` assets | 12 generated WebP, 72 credits; 231 approved-existing/illustration tiles | No further generation after host approval timeouts; some themes broad | Replace only where an accurate asset exists; no top-up | Visual assets agent | 324/324 URLs, alt, provenance; no fabricated landmarks/text | VERIFIED for integrity; correspondence has documented broad matches |

Counts: VERIFIED 5, IMPLEMENTED 1, BLOCKED 0, NOT STARTED 0 for this editorial slice. Commerce counts above are unchanged.

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
| Shop (retail) — NaijaShop (consolidated 2026-11-15) | 16 | 4 | 0 | 1 | 21 |
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
| **Total** | **64** | **28** | **20** | **13** | **125** |

Shop row mapping: §1.2 uses its own stricter vocabulary, so its INDEPENDENTLY TESTED count is shown
in the VERIFIED column, IMPLEMENTED in IMPLEMENTED, and NOT IMPLEMENTED in NOT STARTED.
OPERATIONALLY READY and LIVE are 0. The blocked sub-area (remote preservation) is inside the
Recovery row rather than a BLOCKED row; see §1.2 gate G10.

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
| `docs/naiqashop/surface-audit.md` | Courier assignment has no Control Center UI; review moderation is API-only | **Stale.** Both UIs are committed at HEAD (`components/functional/admin-delivery-assignment.tsx`, `components/functional/admin-reviews-panel.tsx`, wired in `admin-workspace-tabs.tsx`); assignment service paths are tested, review-moderation acceptance has no run artifact. |
| `docs/naiqashop/requirement-matrix.md` (2026-11-12) | "Tested: discovery 17/17 and browser 21/21" | No command, output file or commit supports those scores. Current Shop evidence is landing 95/95, rail 150/150, variants 109/109 + 32/32, product detail 101/101, basket 10/10, saved items 11/11, activation 30/30 + 8/8 recovery, restock 35/35, financial refusal 46/46; marketplace is 4/13 and OPEN/BLOCKED. The file was rewritten on 2026-11-15. |
| `qa-artifacts/_taxonomy-coverage.json` | 11 departments / 37 categories / 113 leaves / 57 ACTIVE / 172 total | **Stale.** Current coverage is 11/37/117 leaves/165 nodes, 63 ACTIVE / 259 total, 41/100 populated (17 NG-regulated). Cite `qa-artifacts/visual/catalogue-batch3/coverage.log`. |
| `qa-artifacts/visual/variant-concurrency/latest.json` | Passed 104 / failed 5 at build `MEXjYZz0XXOfTVByJUM3l` | **Stale failing run** from before `0cd0b4e`. The current run is `qa-artifacts/shop-consolidation/variant-concurrency-tests.log` at commit `1005a7a`, build `jwDsK2Ru5RpdPSdRU29w8`: 109/109, 0 blocked, 0 failed, restored 259/63/0. |
| `docs/programme/completion-matrix.md` historical Shop log | "Catalogue coverage 2026-11-14: 117 leaves, 57 ACTIVE" | Mixed snapshot. Current is 117 leaves and **63** ACTIVE / 259 total; the historical log row is retained only as provenance. |
| Branch `fix/d1-variant-gallery` | D1 variant gallery checkpoint based on `873aa37` | `50a0b57` is a sibling of `71392e4`, not an ancestor of HEAD (`git merge-base HEAD 50a0b57` = `873aa37`; 60 commits on HEAD are absent from it). `0cd0b4e` deliberately removed per-variant image exposure, so D1 cannot apply to the current contract. Deferred; do not merge or serve it. The product-detail suite now asserts the product-level gallery (`101/101`). |
| Earlier 2026-11-14 matrix claims | Saved items ignore product status; restock suppression is open; activation recovery TOCTOU/audit open; DB stock CHECK constraints missing; admin products capped at 200; cart presentation ignores availability | **Fixed at `1005a7a`.** Saved items now use a safe projection (11/11); `OrderItemRestock` + recovery service and 35/35 restock tests; activation restore/discard is one audited transaction (8/8); inventory CHECK constraints applied after zero-violation preflight; admin products are server-paginated with oldest reachable (12/12); cart availability is presented at 390/768/1440 (3/3). |
| Earlier 2026-11-15 caveat | Admin restock-recovery route is untracked / API surface not delivered | **Resolved at `251810f`.** The route is committed with `orders:read` for GET, `orders:write` plus same-origin for POST, and `assertOrderRegion` on both. No untracked code route remains under `app/`; the working tree carries documentation/evidence edits only. |
| Reviewer findings F2/F3/F4/F7 (2026-11-15) | Saved account ignored selected market; shell nav label; product-detail expected D1 images; origin removal did not assert public exclusion | **Fixed at `251810f`:** account page passes `nd_country`/`nd_city` to `getSaved`; app-shell nav is `aria-label="Primary"`; product-detail suite **101/101** asserts the product-level gallery; origin-removal test **10/10** asserts the cleared product is excluded from public country inventory. |
| `scripts/marketplace-tests.ts` on TEST (2026-11-15) | No current full marketplace acceptance run | The run exists but is **4/13, OPEN/BLOCKED** (`qa-artifacts/shop-consolidation/marketplace-tests.log`). Failures are stale expectations (seller product ACTIVE, ≥12 seeded products, homepage nav marker) plus dependent 404/308 steps. `251810f` adjusted part of the test contract, but no post-change 13/13 run exists. This is not a software pass and G3 remains open. |
| Country imagery (2026-11-15) | Imagery can be described as complete | **Not complete.** 57 overrides render 175/175, but 39 NON_PHOTOGRAPHIC + 44 BROAD theme rows remain, 0 MATERIAL_FAIL. Kie MCP host approval was declined; 0 images generated, 0 credits. The audit is reconciled to 57/57 applied; 39 NON_PHOTOGRAPHIC + 44 BROAD remain. |
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
- The full Shop marketplace suite was executed and is **4/13, OPEN/BLOCKED**
  (`qa-artifacts/shop-consolidation/marketplace-tests.log`), not a pass. Its failures are stale
  historical expectations plus dependent 404/308 steps; G3 is not satisfied.
- Review moderation has a committed HTTP suite and screenshots but no recorded run artifact; courier
  assignment has no current end-to-end UI → courier → delivery journey.
- Per-variant gallery switching is deliberately absent from the current contract; the D1 branch is
  not merged and must not be served. Legacy variant images remain in some non-catalogue snapshots.
- Saved items have service/API acceptance (11/11) but no separate browser journey for
  `/account#saved` was found.
- Support has no ticket/case intake, queue or staffed operation; the help copy still implies
  platform support.
- No real seller, real inventory or live payment provider has completed a real Shop transaction;
  all 63 ACTIVE listings are DEMO and REVIEW financial operations are refused.
- Country imagery is not complete: 39 NON_PHOTOGRAPHIC + 44 BROAD remain (0 MATERIAL_FAIL); the Kie
  MCP host approval was declined, so no new images and 0 credits. The audit is reconciled to 57/57
  applied and 0 pending reseed; the remaining rows are the open external/tooling gate.
- Shop accessibility is verified by axe only on storefront, country directory/landing and
  `/admin/countries`; cart, checkout, orders, returns, seller and most admin tabs are unaudited and
  no manual screen-reader pass exists.
- Remote preservation is blocked: `github-preservation/naijashop-marketplace` is at `e80a0f9`
  while local HEAD `251810f` is **417** commits ahead.
- The admin restock-recovery route is committed in `251810f`; this audit assessed that commit plus the final `8CTjw5MV-9MCKuV66hkoY` build.
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

## REVIEW catalogue and Shop acceptance — historical log (2026-11-12 to 2026-11-14)

**This is a provenance log, not a current Shop tracker.** §1.2 is authoritative. Statuses and counts
below are snapshots at the cited run; several are superseded — in particular the rows saying variant
management / variant admin parity are "NOT IMPLEMENTED", the 57-ACTIVE catalogue counts, the
113-leaf / 18-regulated taxonomy counts, the earlier absence of courier/review panels, and the
2026-11-14 state where saved items ignored status, restock suppression, activation recovery TOCTOU,
stock CHECK constraints and admin pagination were open. Current verified counts are 259 products /
63 ACTIVE (all DEMO), 117 leaves / 17 NG-regulated leaves, and 54 country profiles / 324 themes /
362 sources with 57 overrides rendered at 175/175 but 39 non-photographic + 44 broad theme rows
remaining. The current integrated commit is `251810f`; see §1.2 and the 2026-11-15 baseline.

| Requirement | Evidence | Status |
|---|---|---|
| Separate REVIEW environment with full migrations | `naijadeals_review`, classification REVIEW, 72 migrations | VERIFIED |
| Guarded preview startup (identity + classification) | `scripts/review-preview-guard.ts`, `scripts/start-review-preview.cmd` | VERIFIED |
| Demonstration catalogue, no CRF fixtures | 7 departments, 23 active DEMO products, 0 CRF categories | VERIFIED |
| Product image/content accuracy | Electronics tile banner-electronics.webp; product images 200 with alt | VERIFIED |
| Public availability claims | product detail + cards say Demonstration seller; 404 for unpublished | VERIFIED |
| Shop wording and cart units | Deliveries & Freight label; "N product lines · M units" | VERIFIED |
| Mobile layout | docSW == viewport at 320/390/768/1440; no clipped wholesale copy | VERIFIED |
| Basket continuity | `scripts/review-basket-journey.cjs` 10/10; independent UI 18/18 | VERIFIED |
| Admin suspend/reactivate through to Shop | `scripts/review-catalogue-admin-journey.cjs` 7/7 | VERIFIED |
| REVIEW financial refusal | ledger + provider choke points; 5/5, zero provider fetches, no ledger writes; TEST allowed | VERIFIED |
| Catalogue editing (department/product fields) in Control Center | existing UI supports moderation only; no product create/edit form | NOT IMPLEMENTED |
| Admin-led catalogue slice: publishing controls, edit validation, image remediation queue | moderation exists; editing, demo/test classification fields and remediation queue are absent | PARTIAL |
| Search index for REVIEW catalogue | engine unavailable; DB substring fallback serves results; reindex script committed | PARTIAL |
| Route-level REVIEW financial refusal at every entry point | `scripts/review-financial-refusal.ts` 14/14: funding, confirmation, refund, reservation, settlement, reconciliation, webhook, ledger; zero fetches/writes; payouts use existing LIVE boundary | VERIFIED |
| Admin catalogue create/edit department | `/admin/catalogue` + `/api/admin/catalogue/departments`; audited; `scripts/review-catalogue-workflow.cjs` 14/14 | VERIFIED |
| Admin product draft → preview → publish → Shop → edit → unpublish | same workflow; server reports ACTIVE, product 200/404, Shop search reflects state | VERIFIED |
| DEMO classification field | `Category.isDemo` / `Product.isDemo` migration applied to REVIEW and TEST; existing demo rows classified | VERIFIED |
| Image validation before publish | existing project asset or https required; alt required; publish blocked otherwise | VERIFIED |
| Catalogue image remediation queue | no queue surface; publish blocks missing imagery instead | NOT IMPLEMENTED |
| Admin department/product delete or archive | no delete; unpublish and inactive only | NOT IMPLEMENTED |
| Department image alt text | `Category.imageAlt` migration applied REVIEW + TEST; admin form persists and requires alt | VERIFIED |
| Public DEMO classification | `Product.isDemo` badge on cards ("DEMO — illustrative listing") and product detail ("inventory, specifications and availability are illustrative") | VERIFIED |
| Inactive department visibility | inactive departments omitted from navigation and from `/api/products` results (category filter) | VERIFIED |
| Nonexistent product route | genuine HTTP 404 (`P2025` mapped to notFound) | VERIFIED |
| Escrow release financial boundary | `postEscrowRelease` guarded; harness boundaryComplete true, 46/46 | VERIFIED |
| Authorized admin draft preview | `/admin/catalogue/products/[id]/preview`; session + products:read/moderate; noindex/no-store; public draft still 404; workflow 141/141 | VERIFIED |
| DEMO labels on every public card | `isDemo` drives homepage, category/search (`product-card`), related and detail labels; seller chip metadata-derived | VERIFIED |
| Cleanup isolation | workflow snapshots shared departments, restores exact state, asserts 9/31 baseline and Phones & Tablets active | VERIFIED |
| Catalogue expansion batch | Groceries +3, Power & Solar 3, Gaming 2 (8 published DEMO products, unique existing assets; no duplicates/spec invention) | VERIFIED |
| Accepted REVIEW baseline after expansion | 9 active departments / 31 active products / 0 non-DEMO / 0 CRF | VERIFIED |
| Global footer/seller wording | "sellers across Africa, with demonstration inventory clearly labelled"; no "verified Nigerian sellers" claim | VERIFIED |
| Admin preview seller status | DEMO preview shows "Demonstration seller"; no VERIFIED seller status | VERIFIED |
| Narrow-card demonstration label | "Demonstration seller" visible on homepage, category, search and related cards at 390/1440, not truncated | VERIFIED |
| Country-scoped administrator enforcement | `scripts/review-scoped-admin-setup.ts` (GH) + `scripts/review-catalogue-scope-journey.cjs` 6/6: NG products hidden, unpublish/create outside scope 403, catalogue intact | VERIFIED |
| Historical order readability after unpublish | `scripts/review-order-snapshot-journey.cjs` 8/8 with dedicated REVIEW order fixture; snapshot readable after product 404; fixture removed | VERIFIED |
| Public verified-seller phrase removed | footer, homepage, category/deals metadata, marketplace hero and empty states | VERIFIED |
| Batch A catalogue additions | 6 DEMO products (2 phones, 1 monitor, DSLR, smartwatch, baby shoes), existing assets, published via Control Center, 37 active | VERIFIED |
| Batch B produce additions | 4 DEMO groceries (cabbage, carrots, cucumbers, mangoes), existing approved fresh assets, 41 active | VERIFIED |
| Residue exclusion | 103 run-tagged non-public records; 0 public in API/search/navigation/shelves; read-only audit 321/321 | VERIFIED |
| Catalogue baseline | 9 active departments / 41 active products / all isDemo / 0 CRF | VERIFIED |
| Marketplace taxonomy | 11 departments / 37 categories / 113 leaves, 969 aliases, 353 attributes, 18 NG country rules; 18 regulated NG leaves gated | VERIFIED |
| Seller category workflow | alias search, breadcrumb, attributes, draft persistence, request→admin resolution, restricted-category 403 | VERIFIED |
| Admin taxonomy | nested tree, create/edit/aliases/attributes/rules/requests, audit; country scope enforced on mutations | VERIFIED |
| Category image gaps | five department images corrected to existing approved assets | VERIFIED |
| Multi-word Shop search | token AND matching finds "african print fabric" and "woven baskets" | VERIFIED |
| Taxonomy DEMO products | 8 Kie-generated products on leaves, 49 active total, 48 credits | VERIFIED |
| Product-count reconciliation | 49 pre-batch2 = 31 accepted + 10 Batch A/B + 8 taxonomy; 0 active acceptance fixtures; now 57 with Batch 2 | VERIFIED |
| Marketplace breadth | 11 departments / 37 categories / 113 leaves; Health, Baby, Sports, Automotive, Tools, Books added; 17 regulated NG leaves gated | VERIFIED |
| Product→leaf migration | 34 reviewed moves applied in 4 audited batches; 8 already correct; 7 ambiguous retained; 0 image/stock/id changes | VERIFIED |
| Descendant aggregation | parent 21 unique products, leaf-only, 0 duplicates; `/api/categories` 11 roots sum 57; drafts/restricted excluded | VERIFIED |
| Batch 2 Kie coverage | 8 new DEMO products, 8 images, 48 new credits; 30/96 publishable leaves populated; 66 documented gaps | VERIFIED |
| Leaf-move integrity | 34 audited moves retained after workflow fix; 30 populated leaves / 50 active products on leaves; workflow no longer recategorises existing products | VERIFIED |
| Aura category assistance | opt-in `assist=aura`, eligible-ID validation, fail-closed/mock tests; deterministic default; live model call not exercised | PARTIAL |
| Retail-first Shop landing | Full-width compact hero, 8 category shortcuts, 8 populated shelves (29 unique products) before wholesale; 95/95 landing audit | VERIFIED |
| Landing visual acceptance | Independent 390/768/1440 review: 8 shelves before wholesale, no placeholder department cards, 0 broken images, 0 overflow, 0 unexpected console errors | VERIFIED |
| Workflow baseline preservation | Two runs 142/142; accepted-product field fingerprint identical (id/slug/category/status/DEMO/images/stock/price) both runs | VERIFIED |
| Computed coverage | 30/96 populated, 66 gaps, 57 ACTIVE / 50 leaf / 7 ambiguous; Batch 2 counted once | VERIFIED |
| Product-detail redesign | 3-area desktop / ordered mobile, gallery+zoom, stored attributes, seller destination, REVIEW purchase notice, related/reviews; 261/261 audit, 162/162 final build | VERIFIED |
| Product gallery/attribute admin parity | Admin gallery/attributes/stock/DEMO/publish; seller form parity; unauthorized/unpublish tests 74/74; sellers cannot activate | VERIFIED |
| Shop vertical activation | Global/country/city states, reason+audit, super-admin only; Shop catalogue/checkout/seller gates; other verticals NOT_WIRED | VERIFIED |
| Department banners | Six Kie banners applied to taxonomy; public category pages render them; 68/68 images | VERIFIED |
| Activation UI/mobile fixes | 390 overflow 0; success notice persists; seller Activate removed | VERIFIED |
| Full category rail | 37 level-1 categories derived from effective taxonomy, counts/images/order, carousel + full directory; no hardcoded subset | VERIFIED |
| Category tile imagery | 19 generated + 7 reused approved product images; 35/37 have image+alt; 2 all-regulated categories skipped; 114 new credits | VERIFIED |
| Browsing visibility admin | `Category.browsingVisible` separate from publication/homepage/selectable; admin edit + audit + tests 16/16 | VERIFIED |
| Mobile product-first order | Explore shelf moved before category rail; first product card 661 px (was 910) | VERIFIED |
| Demo wording in drawer | "live stock" replaced with demonstration-listing wording | VERIFIED |
| Category rail acceptance | 150/150 on canonical: 37 categories, 19 populated/18 empty, 35 images, arrows/swipe/keyboard/nap snap/reduced motion, directory, no overflow; arrow end reaches true max at 390/768/1440; separate GH zero-listing probe | VERIFIED |
| Market-scoped storefront | `/naijashop`, category, search, bestsellers, header counts and related rail use the selected country/city; GH shows 0 shelves/grid products, NG 57; GH detail 404 vs NG 200 | VERIFIED |
| Missing-rule semantics | Regulated node with no country rule is `market_eligibility_unresolved`; migration backfills 18 keys; catalogue, detail, cart, Aura candidates, admin reactivation and admin `isRegulated` create/update fail closed; category copy states the restriction | VERIFIED |
| Browsing vs publishing | 37 browsing-visible level-1 categories in NG and GH; restricted L1 remains with `canPublish:false`, notice and zero count; `browsingVisible=false` is the only browsing-removal flag; NG 57 listings / GH 0 | VERIFIED |
| Category hero/art | Accurate Electronics & Appliances 1600x900 composition from approved monitor + coffee-maker assets, 0 new Kie credits; square/wide heroes contain the full subject; rail/directory thumbnails uncropped | VERIFIED |
| Empty-category demo wording | "live stock/live listings" removed from category pages and drawer | VERIFIED |
| Activation precedence | Least-permissive rule across GLOBAL/COUNTRY/CITY; local cannot loosen parent; responsible rule exposed; 30/30 | VERIFIED |
| PREVIEW SSR + access | Authorized preview passes into homepage/Shop layout SSR; unauthorized paused; product page shared preview helper; no-store | VERIFIED |
| Cart-add paused behaviour | Public cart add blocked in DISABLED/PREVIEW, authorized preview allowed; existing cart/orders readable | VERIFIED |
| Product-detail gaps | Variant price/stock/invalid combos, approved-only reviews, related failure, seller-location wording, admin/seller lifecycle 97/97 | VERIFIED |
| Variant admin parity | Read/select works; create/edit management absent (schema exists) | NOT IMPLEMENTED |
| Public seller privacy | Public product payload exposes only seller id/name/slug/market/status/trustScore; pickup phone/address/commission restricted to admin/seller views | VERIFIED |
| Currency immutability | Fulfilment country fixed after product creation; currency mismatch rejected (409 country, 400 currency) | VERIFIED |
| Seller publication policy | Seller POST/PATCH ACTIVE rejected 403 admin_publication_required; Control Center publishes | VERIFIED |
| Six new department banners | All six 1600x900 assets 200 and decoded/rendered on canonical 3047 | VERIFIED |
| Variant management | Public selection works; no authorized create/edit contract | NOT IMPLEMENTED |

| Variant inventory contract | Active variants authoritative; product stock 0; validation, SKU/options/price/stock/currency/ownership, audit, seller/admin editors, publish-only Control Center; suite 26/26 | VERIFIED |
| Related-products controlled failure | REVIEW-only server seam; product detail survives, unavailable/retry recovers; 99/99 | VERIFIED |
| Variant/activation integrated acceptance | Landing 95/95, rail 150/150, market 11/11, visibility 16/16, variant 26/26, detail 99/99, basket 10/10, activation 30/30, financial 46/46; 57 ACTIVE restored | VERIFIED |

| Paused Shop presentation | DISABLED/PREVIEW public storefront and homepage hide Shop hero/shelves/counts/new-order CTAs; authorized PREVIEW sees preview UI; orders/cart/help preserved; server initial availability passed | VERIFIED |
| Stay activation | Stay discovery/search/stays/destinations/property pages paused; new holds and host listings 409 vertical_unavailable; bookings/cancel/review/host tools/help preserved; public and authorized PREVIEW verified | VERIFIED |
| Variant image + locking | ProductVariant.imageUrl validated against product gallery; selected-variant gallery switch; variant row locks serialize edits with reservations; contract 30/30, concurrency 100/100 | VERIFIED |
| Catalogue coverage 2026-11-14 | 11 departments / 37 categories / 117 leaves; 57 ACTIVE products all on leaves; 35/100 populated, 65 gaps; 68/68 images | VERIFIED (population batch blocked on assets) |


## Activation enforcement audit — 2026-11-14 (Shop-only changes)

This audit adds no runtime enforcement to any new vertical. Shop presentation and probe behaviour
changed; Stay remains ENFORCED from its accepted slice. Every other vertical remains **NOT_WIRED**
(a saved activation row has no runtime effect).

| Vertical | State | Audit note |
|---|---|---|
| Shop | ENFORCED | Catalogue, detail, new cart additions, checkout, seller listings and availability probe. Server-resolved state now seeds the first paint; the LIVE page made 0 client availability probes. |
| Stay | ENFORCED | Existing discovery/hold/host gates. **Gap:** `releaseExpiredHolds()` exists but has no scheduler/worker invocation; expired holds are released only when that function is called. |
| Food (eats) | NOT_WIRED | No route/service consults activation. |
| Groceries (fresh) | NOT_WIRED | No route/service consults activation. |
| Drive | NOT_WIRED | No route/service consults activation. |
| Deliveries (send) | NOT_WIRED | No route/service consults activation. |
| Services (gigs) | NOT_WIRED | No route/service consults activation. |
| Music (stream) | NOT_WIRED | No route/service consults activation. **Gap:** `recoverPendingJobs()` exists but is not invoked at boot or by the infrastructure worker, so media processing can remain PENDING/PROCESSING after restart. |
| Wallet | NOT_WIRED | Shared ledger serves accepted Shop/Plus/affiliate flows; do not pause it with this batch. |
| Aura | NOT_WIRED | Per-capability gating and paid-provider policy unresolved. |

The paused Shop panel keeps existing orders, receipts, cart/saved items, returns, disputes, wallet
payments for existing orders and support links. It advertises no new catalogue, cart addition,
checkout, seller listing or order. Backend activation remains authoritative.
