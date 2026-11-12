# Plus+ service readiness audit

Date: 2026-11-12. Scope: the ten awareness cards seeded from
`lib/data/public-services.ts` (`scripts/plus-awareness-seed.ts`, keys
`service:<key>`). This audit decides the Plus+-scoped readiness label rendered on
each card. It does **not** edit the global service registry in
`lib/data/ecosystem.ts` or `lib/data/public-services.ts`.

Method: existing executed evidence only. Every "Verified evidence" cell names a
recorded suite or document from `docs/programme/completion-matrix.md`,
`docs/handoff.md`, `docs/nairadrive/` or the named `scripts/` file. No suite was
re-executed for this audit and no new availability claim is made.

## Label definitions

| Label | Meaning in the Plus+ page |
| --- | --- |
| **Verified** | A recorded executed suite covers the service's primary customer and partner journey. Residual gaps are listed below and do not remove the executed result. |
| **Available — limited verification** | The route and main flows exist, but the decisive suite is stale relative to the current implementation, previously recorded a failure that was repaired without a re-run, or covers only part of the journey. |
| **Preview** | Implemented scaffolding or demo-only behaviour without an executed end-to-end result at the current implementation. |

Readiness is **not** launch status and **not** country eligibility. A country is
Available for Plus+ only when an active plan is enabled for it and, if priced, an
approved effective term exists (`lib/services/plus/availability.ts`). These
labels do not alter that calculation, and no service becomes available in any
country through this audit. Readiness also does not publish a benefit, price or
plan.

## Per-service rows

| Service (card key) | Public label | Implemented capability | Verified evidence (exact suite/document) | Residual gap | Plus+ readiness label |
| --- | --- | --- | --- | --- | --- |
| Shop (`service:shop`) | Shop | Retail storefront, URL-backed discovery, cart/checkout with escrow, order lifecycle and refunds, returns, seller product tools, admin moderation | `scripts/naijashop-qa.cjs` 43/43 (`qa-artifacts/naijashop/qa-result.json`), `naijashop-four-card-qa.cjs` 70/70, `naijashop-mobile-qa.cjs` 85/85 (2026-11-09); `scripts/marketplace-tests.ts` 13/13 (2026-11-03) and 12/13 (2026-11-09); wallet/escrow suites 156/156, 89/89, 24/24, 20/20, 78/78 (2026-11-11/12) — `docs/programme/completion-matrix.md` §1.2 | Full Shop suite not re-run at current HEAD after the 2026-11-12 escrow/refund repairs; seller payouts, receipt/invoice, public seller profile, wholesale pricing and seller staff are not started; courier assignment UI was uncommitted at the matrix baseline | **Available — limited verification** |
| Rides (`service:drive`) | Drive | Quote/request/dispatch, protected pickup verification, itemised receipts and ratings, driver workspace and presence, safety-report capture, OSM map/GPS, admin trip operations | `scripts/drive-verification-rating-acceptance.ts` 172/172, final RUN_ID `drive-verify-20261112051929-4b362c1a`; `scripts/drive-tests.ts` 28/28 recorded 2026-11-03; `docs/nairadrive/current-state-audit.md`; `docs/programme/completion-matrix.md` §1.1 | Quote/dispatch suite predates the pickup gate and has not been re-run at HEAD; `nairadrive-e2e.ts` not executed after its edit; rider notification links have no ride-detail page; driver onboarding/documents and driver payouts are blocked; no turn-by-turn, rerouting or traffic ETA | **Available — limited verification** |
| Food (`service:eats`) | Food | Menu discovery, basket/checkout, kitchen console, dispatch with 60 s offers, pickup/delivery PIN, restaurant onboarding, ratings, admin kitchen controls | `naijaeats-functional-check.cjs` 23/23, `naijaeats-cart-check.cjs` 13/13, `naijaeats-operator-check.cjs` 9/9, `naijaeats-delivery-e2e.cjs` 22/22, `naijaeats-dispatch-failure.cjs` 6/6, `partner-lifecycle-tests.mjs` 9/9 (2026-11-09) — `docs/programme/completion-matrix.md` §1.3 | Demo kitchens only (no real restaurant exercised); dish imagery missing for 279 of 298 dishes; single-kitchen orders only; no approved delivery/service fee; catering not built | **Verified** |
| Deliveries & Freight (`service:send`) | Deliveries & Freight | Cargo request/quote/compare/booking, 20-state transport machine, hashed pickup/delivery PINs, shipment tracking, provider onboarding and transporter workspace, legacy freight milestones | `naijasend-e2e.cjs` 46/46 (2026-11-09), `naijasend-transport-e2e.cjs` 37/37 — `docs/programme/completion-matrix.md` §1.4 | No contracted carrier rates or air/sea/rail carrier APIs; enterprise logistics blocked; no turn-by-turn navigation; no per-shipment Control Center operations view; 5% commission inherited and unapproved | **Verified** |
| Services (`service:gigs`) | Services | URL-driven discovery, service/professional detail, booking with wallet escrow, professional onboarding/verification, reviews and earnings, dispute APIs, demo-data isolation | `gigs-e2e-tests.mjs` 42/42, `gigs-journey-browser.cjs` 20/20 (2026-11-08) — `docs/programme/completion-matrix.md` §1.5 | No identity/document/KYC verification; no Control Center module (API only); 12% commission inherited and unapproved; no professional payout request or statement | **Verified** |
| Stays (`service:stay`) | Stays | Destination/date/guest search, 20-minute holds with an exclusion constraint, wallet payment, policy-snapshot refunds, host workspace, reviews, admin approval API | `naijastay-e2e.cjs` 25/25 including the simultaneous-hold race (commit `f9d3496`) — `docs/programme/completion-matrix.md` §1.6 | No real host supply; no listing editor, calendar management or host payout; guest messaging is blocked; host/listing admin UI is API-only | **Verified** |
| Groceries (`service:fresh`) | Groceries | Storefront and categories, per-farm basket, stock reservation, wallet debit, farm dispatch with PIN delivery, balanced settlement, bulk quotes, farmer application and workspace | `naijafresh-responsive-qa.cjs` 401/401 and `qa-artifacts/naijafresh/FINAL-REPORT.md`; `naijafresh-e2e.cjs` 51/51 — `docs/programme/completion-matrix.md` §1.7 | 26 demo farms and 82 demo listings only; real farmer onboarding not exercised; commission and delivery fee unapproved; cross-border delivery blocked | **Verified** |
| Music (`service:stream`) | Music | Catalogue and playback, playlists/library/likes/follows, creator upload and publish, royalty calculation and settlement, premium subscription on the wallet rail, live/video/podcast, city and royalty admin APIs | `stream-tests.mjs` 23/23, `stream-full-qa.cjs` 19/19 routes, `stream-features-verify.cjs` 9/9, `stream-upload-verify.cjs` 11/11, `stream-video-podcast-verify.cjs` 10/10, `stream-live-verify.cjs` 7/7, `stream-premium-verify.cjs` 11/11, `stream-royalty-tests.ts` 8/8, `stream-royalty-flow.mjs` 7/7, `stream-audio-verify.cjs` — `docs/programme/completion-matrix.md` §1.8 | No licensed commercial catalogue (test/creator audio only); **"creator rooms" is not implemented** — the Plus+ card description is corrected in `lib/data/plus.ts`; no live moderation/SLA; premium prices are placeholders; artist payouts blocked; no Control Center UI | **Verified** |
| Wallet & Payments (`service:pay`) | Wallet & Payments | NGN wallet with balanced ledger, top-up via the local test provider, P2P transfers, escrow holds/milestones, refunds and recovery, vendor payouts, business overview | `wallet-reconcile.ts` CLEAN; `payments-funding-webhook-acceptance.ts` 24/24; `naijapay-acceptance.cjs` 14/14; `pay-transfer-tests.ts` 23/23; escrow suites 156/156, 89/89, 32/32; `wallet-post-release-refund-acceptance.ts` 20/20 — `docs/programme/completion-matrix.md` §2.1 | Funding is verified only against the local test provider; no Paystack/Flutterwave credentials or sandbox call; bills, airtime, data, electricity and TV are not connected; customer withdrawals and MFA are not built; no cross-currency | **Available — limited verification** |
| Earn & Affiliates (`service:earn`) | Earn & Affiliates | Enrolment/approval gating, same-origin links with consent and attribution, frozen commission rules, settlement/reversal/recovery, admin review and campaign pages, Aura read-only summary | `affiliate-verify.ts` 12/12; `affiliate-destination-verify.ts` 11/11; `affiliate-guest-journey.cjs` 3 checks; `affiliate-campaign-journey.ts` 9 checks; `affiliate-financial-acceptance.ts` 6 checks; `affiliate-settlement-verify.ts` 10/10; recovery accounting 5 checks; settlement race 6 checks; `affiliate-campaign-ui-check.cjs` — `docs/programme/completion-matrix.md` §2.2 | Only Shop order rows are attributable; refund-to-reversal integration has no recorded passing run; no external affiliate payout, KYC/tax onboarding or bank/mobile-money payout | **Verified** |

## Copy corrections applied with this audit

- The Plus+ page no longer labels anything "Plus+-exclusive". Entitlements are
  records only and are not enforced in any other vertical
  (`docs/plus/membership-foundation.md`), so the page and FAQ now say
  "Plus+ member benefits" and state that no benefit is enforced as an
  entitlement yet.
- The Music awareness card no longer repeats the registry's "creator rooms"
  claim. `lib/data/plus.ts` supplies Plus+-scoped display copy for that card
  ("African music, playlists and creator uploads") because creator rooms have no
  implementation, route or test evidence.
- No review date is displayed. `docs/plus/membership-foundation.md` records why
  the unsupported 2026-11-05 date was removed.
- `components/fresh/fresh-promo.tsx` no longer claims "exclusive app deals"; the
  app banner copy now describes only implemented capabilities. Its inbound
  Plus+ footer link already uses the current "NaijaDeals Plus+" wording and
  still resolves to `/naijashop/plus`.

## Out of scope

- No global registry status was edited. `lib/data/public-services.ts` remains the
  catalogue source.
- No plan, price, trial, benefit or country eligibility is published or changed.
- The labels above describe verification of the software; they are not a launch,
  supply, provider or regulatory statement.
