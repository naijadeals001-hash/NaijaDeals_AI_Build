# Phase Tracker

## Repository audit snapshot (2026-11-03)

Full audit recorded in `docs/audits/` (8 documents + machine manifests). Documentation
reconciled 2026-11-03: `architecture.md` and `requirements-matrix.md` rewritten to the verified
state, and `functional-gap-report.md` marked historical (it described the June localStorage demo). Verified: 664 in-scope
files, 279 inspected in full, 70 API routes, 25 pages, 39 Prisma models, playbook of 21 canonical
phases (00–20) plus 10 advisory Part M workstreams. No phase status was upgraded by the audit.

## Phase 00 — Verified baseline and recovery

**Status:** PASS ✅

**Completed:**
- UI/UX corrections: ecosystem-home.tsx QuickActions (4→3), Hero (removed duplicate sellPartner CTA, reduced heading size)
- Git push authenticated and verified to github-preservation → NaijaDeals_AI_Build
- Remote SHA 884faecc0ddbca84da150a8e2f7f7f95384164df confirmed
- Credentials protected: .env.txt in .gitignore
- Documentation: AGENTS.md, architecture.md, requirements-matrix.md, decisions.md, handoff.md
- Local baseline repair: stale `.next` regenerated, dev server restarted, all routes verified 200 OK with full CSS/Tailwind delivery
- Admin authentication verified: unauthenticated access returns 401 (not 500), `/api/auth.me` returns `user:null`
- Password reset script `scripts/reset-admin-password.cjs` created and tested
- `scripts/check-admin-pass.mjs` password hash output removed per security requirements

**Verified findings:**
- All routes (`/`, `/login`, `/naijashop`, `/admin`, `/super-admin`) return HTTP 200 OK
- Tailwind CSS delivered at all routes (`<link rel="stylesheet" href="/_next/static/css/app/layout.css">`)
- `bg-[#04140f]`, `text-white` classes rendered at homepage
- API `/api/auth/me` returns `{"user":null}` for unauthenticated session
- API `/api/admin/overview` returns 401 `{"error":"Sign in to continue.","code":"unauthenticated"}` for unauthenticated access (not 500)
- Earlier "missing required error components" and "Cannot find module './1682.js'" errors were transient webpack runtime cache mismatches resolved by fresh `.next` rebuild + dev server restart

**Baseline recovery procedure:**
1. Rename stale `.next` to `.next-stale` (backup preserved)
2. Run `npm run build` to regenerate fresh `.next` output
3. Restart dev server: `npm run dev -- --port 3000`
4. Verify all routes return 200 OK with stylesheet delivery

## Phase 01 — Development skills, tests and change gates

**Status:** BLOCKED — Exit criteria not met

**Required per playbook:**
- Verify REA, ECC and Soup implementations with harmless real calls
- Select compatible, licensed skills for admin dashboards, account dashboards, UI/UX, backend, security, QA and Git
- Use ECC as primary workflow; avoid conflicting frameworks
- Create concise project rules and focused custom skills
- Establish unit/integration/browser test coverage using existing tooling
- Add CI for lint, type checks, relevant tests and build without automatic deployment
- Use isolated test database; prohibit tests against production
- Create regression suite for current authentication, purchase and ride flows

**Completed:**
- GitHub Actions CI workflow (lint, type-check, build, test, Docker)
- Docker and docker-compose configuration
- Hosting research documentation (OPS-01 — separate from Phase 01)

**Completed (2026-11-03, tooling verification):**
- REA 6.8.0 verified: registration aligned, 229 tools, skill 8/8 file hashes match, browser CDP captures executed, JADX/apktool/adb executed against a real APK
- ECC 2.2.3 discovered and inventoried (120 skills, 68 agents, 94 commands); Soup router executed and registered as an MCP server
- Evidence and hashes recorded in `docs/reference-and-tooling-evidence.md`
- Domain-to-skill selection recorded in `docs/skills-selection.md` (Soup output + explicit fallbacks for router gaps)
- Isolated test database created (`naijadeals_test`), migrated and seeded; baseline recorded: marketplace **13/13**, admin security **19/19**, drive **28/28**, `tsc --noEmit` clean (2026-11-03)
- Repository audit complete: `docs/audits/` (file, playbook, architecture, module, admin, requirements, tooling, next actions)

**Blocked:**
- No genuine Uber/Bolt APK available (the `taxify-driver.apk` in the reference folder is Aptoide `cm.aptoide.pt` 10.0.0), so competitor Android analysis is unverified
- No Android device or emulator attached
- Disposable failing CI check not demonstrated
- Disposable failing CI check not demonstrated (push/CI access blocked)

## Phase 02 — Design system and accessible application shells

**Status:** IN PROGRESS — visual direction applied to the homepage (2026-11-03); sub-phases 02A–02D
(contrast/keyboard/ARIA/screen-reader audits) remain open, and Phase 01 is still blocked on its CI gate.

**Landed:** editorial homepage hero, ecosystem pulse, asymmetric service bento, wallet band,
refined trust/partner sections, `/drive` → `/naijadrive` redirect; see `docs/design-direction.md`

**02A/02C evidence (2026-11-03):** axe-core WCAG A/AA audit is clean on 15 routes (desktop +
mobile); contrast tokens measured (amber dot raised to 5.02:1), sidebar sign-in target raised to
36 px, and the Leaflet map is now a labelled region instead of `aria-hidden` with focusable
controls.

**02B/02D evidence (2026-11-03):** Arabic RTL renders correctly with zero axe violations at 1440
and no overflow at 320; 200 % text resize does not overflow; forced-colors mode was fixed with
`forced-color-adjust` on brand surfaces (it previously produced white-on-white text); the Leaflet
map pans with arrow keys. Remaining: a manual NVDA/VoiceOver pass and dialog focus traps when
dialogs are introduced.

**Required per playbook:**
- Research Uber/Bolt ecosystem navigation and commerce/dashboard references through REA
- Create shared tokens, typography, spacing, colors, responsive layouts and accessible components
- Build buttons, fields, validation messages, tables, filters, pagination, dialogs, tabs, notifications, skeletons, empty/error states
- Establish distinct public, customer, partner and admin shells
- Replace unrelated imagery with original or licensed context-appropriate assets

## Phase 03 — Identity, login and account security

**Status:** NOT STARTED (depends on Phase 02)

## Phase 04 — Customer dashboard and account center

**Status:** NOT STARTED (depends on Phase 03)

## Phase 05 — Unified admin Control Center and permissions

**Status:** PASS ✅ (2026-11-03) — exit gate 6/6 and all work coverage closed

**Completed and verified:**
- One `/admin` + `/super-admin` shell driven by `searchParams`, with URL-addressable modules/workspaces (`?module=…&tab=…&q=…`)
- Real PostgreSQL data in Overview, Orders, Deliveries, Trips, Payouts, Products, Seller applications, Payments, Users, Vendors, Couriers, Drivers, Audit and Settings; no fabricated demo metrics
- Server-enforced super-admin boundary: `requireSuperAdmin()` and `/api/super-admin/system` return **403** for a standard admin and **200** for a super admin
- Real filters, in-table search, header search, refresh, honest empty/unavailable states, sign-out to `/login`
- Desktop reference comparison at 1440×1000 and mobile usability at 390×844 with zero horizontal overflow; mobile sidebar closes after navigation
- Evidence: `node scripts/control-center-visual-qa.mjs` **29/29**, `npm run test:drive` **28/28**, `npm run qa:idle-sweep` **3/3**, `npx tsc --noEmit` clean, production build successful; screenshots in `.qa/control-center/`

**Exit-gate evidence (2026-11-03):**

| Exit criterion | Result |
| --- | --- |
| Allow/deny and cross-region API tests | PASS — admin security suite **19/19** (region-scoped moderation, dashboard, payouts, audit, role delegation) |
| No self-escalation | PASS — covered by the same suite (self role change and privilege delegation rejected) |
| Dashboard figures reconcile | PASS — rendered KPIs matched direct SQL: products 12, vendors 2, orders 0, trips 43, completed trips 20, drivers 2 |
| Pagination / filter / bulk-action error paths | PASS — filters/pagination exercised in-browser; bulk partial failure injected a 500 for one row → 1 suspended, 1 unchanged, failure surfaced with the row message |
| Sensitive changes create audit events | PASS — moderation, order status, refund and dispute rows carry before/after metadata |
| Admin usable on smaller screens | PASS — 390×844: 0 document overflow, tables scroll inside their container, navigation available, axe 0 |

- City activation (2026-11-03): `CitySetting` overrides with a `/api/admin/cities` API, a city
  availability table in Settings, audited `city.updated` rows, and enforcement in staff scope
  assignment (assigning a non-activated city returns **409 city_not_activated**). Verified by
  activating Accra, assigning a GH/Accra scope (200), and rejecting GH/Kumasi (409).
- Role-assignment UI and dispute resolution are covered in the handoff; the previously listed
  coverage gaps are closed.

**Delivered coverage (2026-11-03):**
- Final acceptance run on a freshly migrated/seeded isolated database, in the order admin → marketplace →
  drive: **19/19**, **13/13**, **28/28**, `tsc --noEmit` clean.
- Role-assignment UI (Users → Manage): database roles, country/city scope, self-edit rejected with 403, audited
  `admin.roles_updated` before/after.
- Dispute resolution (Control Center → Disputes): refund buyer or release escrow to seller, audited
  `dispute.resolved` before/after, double-release guarded with 409 `escrow_not_releasable`.
- Country activation (Settings): `CountrySetting` overrides, audited, enforced at checkout (400
  `country_disabled`, 503 `delivery_unconfigured`).
- City activation (Settings): `CitySetting` overrides, audited `city.updated`, enforced in staff scope
  assignment (409 `city_not_activated`).
- Region filtering is server-side and permission-aware: regions come from the country catalogue (not a
  hard-coded pair), `geo` is validated and clamped to scoped staff so the URL cannot widen access, datasets
  are filtered before serialisation, tables paginate 10/page, and a 17/17 Playwright check covers
  default/selection/refresh/invalid/pagination/staff-scope/mobile with zero console errors.
- Before/after audit detail: product moderation, order status, refunds, disputes, payouts, role changes and
  country/city activation all carry before/after metadata rendered in the record dialog.

**Documented limitations (not exit-gate failures):**
- Dispute *dismissal* is not exposed: the order status machine cannot restore an arbitrary pre-dispute status.
- Live driver presence and a live map provider are not integrated; the dashboard reports only evidence-backed
  coverage instead of inventing online/offline states.

## Phase 06 — Partner dashboards and onboarding

**Status:** IN PROGRESS — seller suspension slice landed (2026-11-03); entry gate satisfied by Phase 05 PASS

**Completed and verified:**
- Existing seller (`/seller`), driver (`/driver`) and courier (`/courier`) portals retained; seller overview is scoped to the signed-in vendor only
- Vendor suspension end to end: admin `POST /api/admin/vendors/[id]/status` (audited `vendor.status_changed` before/after), suspended products disappear from the catalogue, seller writes return **403 vendor_suspended** with the reason, the seller dashboard shows a suspension banner, and reactivation restores product creation
- Evidence: suspend → catalogue hidden, create blocked 403, overview status SUSPENDED with reason, reactivate → create 201 (cleaned up); screenshot `qa-artifacts/preview/seller-suspended.png`
- Driver suspension: admin Drivers tab action, audited `driver.status_changed` before/after, suspended drivers cannot accept new rides (403 verified), reactivation restores acceptance, and existing active work stays readable
- Seller earnings now include **NaijaPay ledger balances** (available/held) from the vendor wallet; verified figures matched the wallet table exactly (2,450,000 available / 1,665,000 held)
- Courier suspension: admin Couriers tab action with required reason, audited `courier.status_changed` before/after, suspended couriers rejected from new delivery assignment (**409 courier_suspended** with the reason), reactivation restores assignment; existing assigned deliveries remain updatable so active work can finish

**Still open for a Phase 06 PASS:**
- Rejected-application access re-verification
- Explicit end-to-end test of "suspension during an active job" for each partner type
- Partner notifications and profile management primitives

## Phase 07 — Wallet, payments, escrow and settlement correctness

**Status:** IN PROGRESS � ledger/payout invariants verified; partial refund and sandbox webhook evidence open (2026-11-03)

## Phase 08 — NaijaShop end-to-end commerce

**UI slice (2026-11-03):** the marketplace floor was rebuilt against an REA capture of the Amazon
search experience (utility bar, department strip, filter rail with counts, sort, Amazon-shaped
cards, pagination). Functional commerce gates (checkout/escrow/returns acceptance) are unchanged
and still governed by Phases 07–08; this is a presentation and interaction slice only.

**Status:** NOT STARTED (depends on Phase 07)

## Phase 09 — NaijaDrive core rides and driver operations

**Status:** NOT STARTED (depends on Phase 07)

## Phase 10 — NaijaSend customer booking and delivery operations

**Status:** NOT STARTED (depends on Phase 08, 09)

## Phase 11 — Notifications, support and operational automation

**Status:** NOT STARTED (depends on Phase 08–10)

## OPS-01 — Hosting and deployment preparation (completed independently)

**Status:** CONFIGURATION COMPLETE — RUNTIME VERIFICATION BLOCKED

**Completed:**
- docs/hosting-comparison.md — 3-option analysis (VPS pilot, Vercel+managed DB, hybrid)
- docs/deployment-plan.md — Build, release, rollback, security procedures
- docs/operations-runbook.md — Daily checks, backups, incident response, maintenance
- Dockerfile — Multi-stage Next.js standalone build (Node 20 Alpine)
- docker-compose.yml — Local dev stack (app + PostgreSQL)
- docker-compose.prod.yml — Production with Docker secrets, health checks
- .dockerignore — Optimized build context
- .github/workflows/ci.yml — CI pipeline: type-check → lint → build → test → Docker
- next.config.mjs — Added output: "standalone"

**Runtime verification blocked:**
- Docker not available in environment — cannot build/run images
- GitHub Actions run not triggered/verified
- Secret mounts not tested against application configuration
- Database migration/rollback procedures not tested
- Backup/restore procedures not tested

**Next action:** Verify Phase 01 exit criteria before proceeding to Phase 02
## Phase 06 progress notes (2026-11-03)

- Seller profile management landed: PATCH /api/seller/profile updates business name, description,
  pickup address/phone and payout account from /seller; audited as vendor.profile_updated with the
  account number masked (verified ****6789).
- Active-job seller rule verified: a suspended seller advanced an assigned order while new listings
  stayed blocked.
- Still open for Phase 06 PASS: rejected-application verification (submit -> reject -> denied), driver
  and courier active-job tests, partner notifications.

## Phase 06 exit-gate evidence (2026-11-03)

| Criterion | Evidence |
| --- | --- |
| Application -> admin approval -> role access | Admin suite approval path (19/19); rejection chain verified separately: register 201 -> application 201 -> admin reject 200 (REJECTED) -> seller API 403 and /seller redirect to /sell |
| Rejected/suspended cannot take new jobs | Rejected applicant denied seller API; suspended vendor products hidden and writes 403 vendor_suspended; suspended driver accept 403; suspended courier assignment 409 courier_suspended |
| Assigned work scoped correctly | Seller overview scoped to own vendor; courier and driver lists only their own; admin suite cross-tenant checks pass |
| Earnings reflect ledger | Seller dashboard available/held matched the vendor wallet exactly (2,450,000 / 1,665,000) |
| Loading and recovery | Seller profile, role editor, dispute dialog, freight actions and partner updates expose loading/error states |

Active-job rule verified: suspended driver moved an assigned ride to driver_arriving (200) and a
suspended courier moved an assigned delivery to pickup_started (200), while new acceptance/assignment
stayed blocked. Partner notifications verified for vendor and courier suspension, with application,
order-paid and delivery-assigned hooks implemented. Notifications for every hook are not yet covered
by an automated regression suite.

**Status: PASS** (exit criteria met; notification automation is the remaining hardening item).


### NaijaEats restaurant onboarding increment (2026-11-03)

Bounded slice inside the Eats module: restaurant application → admin approval (idempotent) → partner
menu publishing (draft/publish/unavailable) → customer discovery by delivery area, with ownership,
suspension and unpublished-item denials verified on the isolated server. Checkout remains gated;
kitchen dispatch is the next slice.


### NaijaEats ordering and dispatch increment (2026-11-03)

Wallet-paid food orders now run through kitchen acceptance, preparation, admin courier assignment and
courier pickup/delivery with a customer timeline. Browser-verified end to end on the isolated server;
checkout remains limited to single-kitchen orders and no delivery/service fee is charged.

### Phase 07 progress (2026-11-03)

Audit and invariant tests are recorded in docs/audits/phase07-ledger-audit.md. Passing on the isolated
database: per-transaction debit/credit balance, non-negative wallets, duplicate confirmation,
insufficient-funds rejection, concurrent payout settlement (single debit) and payout overdraw
rejection. A real defect was fixed in markPayoutPaid: the payout is now claimed atomically and the
wallet debit is conditional, so repeated or simultaneous clicks cannot settle twice or go negative.
Blocked exit criteria: partial refunds are not implemented (full-order refunds only), and no
Paystack/Flutterwave sandbox credentials exist for webhook-signature evidence.


### Phase 07 completion (2026-11-03)

Local exit criteria pass via scripts/phase07-ledger-tests.ts and scripts/phase07-partial-refund-tests.ts:
ledger balance, non-negative wallets, duplicate confirmation, insufficient funds, payout
idempotency/overdraw, partial and cumulative refunds, concurrent refund single settlement and repeated
refund rejection. Provider sandbox signature checks remain BLOCKED (no Paystack/Flutterwave
credentials); no live charge was made.


### Phase 07 review follow-up (2026-11-03)

Added an individual Refund attempt model with a unique idempotency key, atomic reservation of the
remaining refundable amount, cumulative attempts, and provider calls made at most once per key.
Payouts are limited to explicit PENDING/APPROVED eligibility (REJECTED is terminal). Synthetic
Paystack/Flutterwave signature tests pass with test-only secrets. Wallet partial refunds and escrow
release verified. Phase remains IN PROGRESS pending live provider sandbox reconciliation, the refund
fee policy decision, and GitHub preservation.


### Phase 07 reconciliation finding (2026-11-03)

scripts/phase07-reconciliation.ts finds 3 of 37 wallets whose available+held balance differs from
their ledger net: one SYSTEM and two VENDOR wallets. Payouts before this change wrote no ledger
transaction, and early fixture/escrow flows left gaps. New payouts now post a balanced payout
transaction (vendor debit, SYSTEM credit). The historical rows require an explicit, reviewed backfill
before reconciliation can pass; no backfill was applied.

### NaijaFresh marketplace increment (2026-11-09)

Pan-African farm-to-home / farm-to-business marketplace. Design reference: the approved desktop and
mobile mockups in `design-references/approved/NaijaFresh/` (hashes recorded in the final report).
REA evidence is in `qa-artifacts/rea-fresh/REA-EVIDENCE.md`: both public farm-direct comparators were
NXDOMAIN or a corporate site with no ordering UI, so no competitor flow was copied.

Data (additive migrations `20261109065111_naijafresh_catalogue`, `20261109065545_naijafresh_orders`,
`20261109065833_naijafresh_bulk_quote_relation`, `20261109…_naijafresh_pan_african_farm`): `Farm`,
`ProduceListing` (agricultural `unit` + `minimumOrder`), `BulkQuoteRequest`, `FreshCartItem`,
`FreshOrder`/`FreshOrderItem`/`FreshOrderEvent`, `FreshDispatch`/`FreshDispatchOffer`.

Demonstration catalogue (`prisma/naijafresh-seed.cjs`): 26 farms across 13 African countries
(Nigeria, Ghana, Kenya, South Africa, Cameroon, Ethiopia, Senegal, Tanzania, Uganda, Zambia, Rwanda,
Mozambique, Egypt) and 82 listings across the 9 mockup categories. Every row is `isSample: true` and
labelled "Demo" in the UI; prices are illustrative fixtures, not market prices.

Workflows: basket (per farm) → NaijaPay checkout (one order per farm, stock reserved) → farm accept /
pack / ready → dispatch to NaijaSend couriers **and** NaijaDrive drivers → pickup PIN → delivery PIN →
balanced settlement (farm revenue, courier earnings, platform fee) guarded by `FRESH-SETTLE-<dispatchId>`.
Cancellation before acceptance refunds the wallet and restores stock. Bulk quote requests are answered
by the farm only; no quote is generated on a farm's behalf.

Verification: `node scripts/naijafresh-e2e.cjs` — 51/51 checks including unauthorised owner, competing
provider, wrong PIN, replayed delivery, double settlement, over-stock, minimum order and cancel-window
cases. Admin verification lives at `POST /api/admin/fresh/farms` (`vendors:review`).

Open: image generation (see report), commercial commission/delivery terms, real farmer onboarding,
and cross-border delivery zones (dispatch widens to any online provider when no zone matches, which
must be confirmed as a commercial decision).

### NaijaSend logistics marketplace increment (2026-11-09)

NaijaSend is built as a logistics **marketplace**, not a courier app: customers request
shipments, independent providers quote, the customer books one quote, and NaijaPay holds the money
until delivery. NaijaSend never owns or operates vehicles; NaijaDrive drivers and vehicles may enrol
as providers (`sourcePlatform = "naijadrive"`, linked by `driverProfileId`, not copied).

Schema (additive migration `20261109153242_naijasend_marketplace`): `LogisticsShipment`,
`ShipmentPackage`, `LogisticsProvider`, `ProviderVehicle`, `ShipmentQuote`, `ShipmentLeg`,
`ShipmentEvent`, `ShipmentProof`. The legacy `FreightRequest` flow is untouched.

Workflow: request → verified providers quote → compare → book (wallet debited, competing quotes
declined atomically) → legs per mode → pickup PIN → transit → arrived per leg → shipment delivered
only when every leg is complete → customer confirms with delivery PIN → settlement
(`SEND-SETTLE-<shipmentId>`, provider 95%, platform 5% inherited from the shared ledger).

Verification: `node scripts/naijasend-e2e.cjs` **46/46** and
`node scripts/naijasend-responsive-qa.cjs` **294/294** (320–1920, 12 routes).

Imagery: 33 Kie.ai assets (`send-*`), 198 credits ≈ **$0.99** confirmed, served as WebP (4.5 MB).

Open: commission rate not approved; live carrier integration for air/sea milestones is not
configured (milestones recorded by the operator, flagged `simulated` for external modes); enterprise
contracted rates and multi-user approval are not built.

### NaijaSend transport identity, navigation and cross-vertical fulfilment (2026-11-09)

**The rule enforced here:** a shipment is recognised as NaijaSend's because verified booking,
assignment and pickup records exist — never because a transporter pressed a button.

- `ShipmentAssignment` (unique per shipment) records the provider, the accepted quote and the
  vehicle at booking; PINs are stored only as SHA-256 hashes. There is no code path that creates
  an assignment from a driver action.
- `ShipmentPickup` (unique per shipment) is written only inside a transition that passed the PIN
  check, so a second pickup cannot be recorded even concurrently.
- `LogisticsShipment.originVertical` is set at creation and immutable; a partial unique index on
  `(originVertical, sourceReference)` makes a duplicate shipment for one order impossible.
- `transportState` + `version` form the state machine (`lib/services/send/state-machine.ts`):
  every transition validates actor authority from the assignment, legal next state, required
  evidence, the version the client saw, and an idempotency key. Row-level `FOR UPDATE` serialises
  concurrent actions.
- Cross-vertical entry point: `POST /api/send/logistics/from-order` reads the authoritative order
  row (NaijaShop / NaijaFresh / NaijaEats) and returns the same shipment on repeat calls.
- One tracking record for every vertical: `GET /api/send/logistics/tracking` and
  `/naijasend/track/[trackingNumber]`.

Routes added: `/naijasend/driver/jobs`, `/naijasend/driver/navigation/[id]`,
`/naijasend/driver/earnings`, `/naijasend/track/[trackingNumber]`.

Verification: `node scripts/naijasend-transport-e2e.cjs` **37/37** (includes concurrent duplicate
pickup, idempotent replay, stale version, unassigned provider, origin immutability),
`node scripts/naijasend-e2e.cjs` **46/46**, `node scripts/naijasend-responsive-qa.cjs` **402/402**.

Navigation: OpenStreetMap tiles via the existing Leaflet dependency; the connecting line is
straight-line distance, labelled as such — **no turn-by-turn routing exists**, and the UI says so.

Open: live carrier milestone integration (air/sea/rail remain operator-recorded and flagged);
map routing/turn-by-turn is not implemented; NaijaShop order → shipment wiring is available through
the API but not yet triggered from the seller fulfilment screen.

### Platform foundation — PWA, install and shared location (2026-11-09)

Not a vertical: one shared foundation for all verticals. Adds the web app manifest,
original icons (Kie.ai FLUX 3 Klein), a service worker whose cache policy excludes
every private and financial route, an offline page, an install/update banner, an
`/install` page with live capability detection, and a shared capability + location
layer (`lib/platform/*`) used by NaijaDrive and NaijaSend driver workspaces.

Location uploads are session-scoped (`drive:<rideId>`, `send:<shipmentId>`),
authorised server-side, idempotent per `(deviceId, clientId)`, ordered by capture
time, and flagged stale after 90 s. New models: `DeviceRegistration`, `LocationPing`.

Verified: `node scripts/platform-pwa-e2e.cjs` **27/27**.

BLOCKED / OPEN: Android APK (no Android SDK or Gradle on this machine; no signing
key), push notifications (no provider configured), dispatch-side location
endpoint, and location retention job. iOS background tracking is unsupported by
the platform — documented, not worked around. See `docs/mobile-foundation.md`.

### Mobile foundation — Android build, operations access, retention (2026-11-09)

Android SDK installed locally (cmdline-tools, platform-tools 37.0.1, platforms
34/35, build-tools 34/35). Capacitor 8.6.0 and @capacitor/geolocation 8.2.4 (both
MIT) added; the Transistorsoft background-geolocation plugin was **rejected** for
its CUSTOM licence.

Native tracking: `LocationTrackingService` (foreground service,
FusedLocationProvider, persistent queue, idempotent uploads, stop control) plus
`NaijaDealsLocationPlugin` implementing the `window.NaijaDealsLocation.start/stop`
contract. **Debug and signed release APKs both build**; the release APK is signed
with a keystore held outside the repo and published at
`public/downloads/naijadeals-1.0.0.apk` (SHA-256 recorded in `lib/platform/release.ts`).

Operations: `GET /api/admin/location` (`deliveries:read`, per-session only,
audited, freshness from server time). Retention:
`scripts/location-retention.cjs` + `scripts/schedule-location-retention.ps1`.

Verified: `scripts/mobile-foundation-e2e.cjs` **26/26**,
`scripts/platform-pwa-e2e.cjs` **28/28**, link audit **232/232**.

OPEN: physical-device acceptance; push (no VAPID keys); operations UI; Android
developer verification; production scheduling of the retention job.

### Homepage experiences — four dashboard designs (2026-11-09)

Four homepage designs on one platform: `original` (the untouched EcosystemHome),
`africa-super-app` (approved mockup, Abuja landmarks), `mobility` and `commerce`.
Every design links all ten services. New models: `HomeVariant`, `HomeHeroSlide`,
`HomeAssignment`, `HomeMetric`. Stable assignment via the `nd_visitor` middleware
cookie; manual choice via `nd_design` always wins. Shared hero carousel with
8-10 slides per design, reduced-motion support and an explicit pause control.
Control Center → Homepage designs (new `homepage:write` permission).

Imagery: 22 Kie.ai assets (12 heroes incl. the Abuja composite, 10 vertical cards).

Verified: `home-dashboards-e2e.cjs` **40/40**, `home-responsive-qa.cjs` **120/120**
(4 designs x 10 widths), link audit **235/235**.

OPEN: no inline slide editor UI; no image upload for slides; region/interest
assignment strategies not built; Dashboard 1 keeps a single hero.
See `docs/homepage-experiences.md`.

## Dependency record — NaijaDeals Affiliate (2026-11-10)

**Status:** BLOCKED on Aura AI acceptance. Not started. No Affiliate code, schema or
migration exists.

### Aura AI acceptance — verified against source documents, not assumed

Evidence in this repository (handoff, "Aura AI — connected assistant", 2026-11-05):
`node scripts/aura-acceptance.cjs` reported **4/4 suites, 66 checks** — orchestration 24/24,
visual QA 28/28, browser journey 14/14, Control Center 6/6.

That evidence is real but the milestone is **not fully met**. Still outstanding, as recorded
in the same handoff section:

1. **Voice input and file attachments were shown as disabled controls.** A later change made
   them functional, but no acceptance run has re-verified them since.
2. **Live web access is not implemented.** The model has no browsing tool.
3. **Per-user rate limiting is not enforced.** Usage is recorded; no quota is applied.
4. **Visual fidelity was never accepted by the owner.** Whole-screen pixel difference sat
   around 31% (desktop) and 38% (mobile) against the approved mockups, and the owner's last
   word on it was that the presentation was not close enough.

Therefore Aura is **PARTIAL**, not complete.

### Gate for starting Affiliate

Affiliate work may begin only when all four of these are recorded as met:

- voice/attachment acceptance re-run and passing;
- a decision recorded on live web access (implemented, or explicitly deferred with the UI
  stating it is unavailable);
- rate limiting enforced per user, or an explicit product decision to defer it;
- visual acceptance of the desktop and mobile Aura surfaces by the owner.

Until then this entry stands as the dependency record. The Affiliate specification itself —
attribution, commission accounting on the shared ledger, fraud controls, merchant and Control
Center surfaces, Aura integration — is held ready and must not be built against an unverified
assistant, because Affiliate depends on Aura's permission-scoped tools and its explanations of
commission state.
