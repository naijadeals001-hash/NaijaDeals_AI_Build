# NaijaDeals Handoff — Phase 00 & Phase 01

## Verification Baseline Summary (Phase 00)

**Phase:** 00 — Verified baseline and recovery  
**Workspace:** C:\Users\User\Documents\naijadeals.com  
**Branch:** naijashop-marketplace  
**Remote:** github-preservation → https://github.com/naijadeals001-hash/NaijaDeals_AI_Build.git  
**Last Commit (Phase 00):** 884faecc "Phase 00 UI/UX corrections"  
**Last Commit (Phase 01):** c53d8bb "Add hosting, deployment & operations capabilities: Docker, CI/CD, docs"  
**Stash Backup:** `Phase00-backup-before-audit` (git stash)  
**Preview URL:** http://localhost:3000 (development via `npm run dev`); build artifact `.next/` produced by `npm run build`  

## Phase 00 Files Created

| File | Purpose | Evidence |
|------|---------|----------|
| `AGENTS.md` | Master project rules | 24 rules documented |
| `docs/architecture.md` | System architecture overview | 50+ models; 10 verticals; API surface; auth/payment flow |
| `docs/requirements-matrix.md` | Requirements coverage by status | 30+ requirements mapped |
| `docs/decisions.md` | Decision log with rationale | 10 documented decisions |
| `docs/phase-tracker.md` | Phase progression tracking | All phases mapped; Phase 00 PASS |
| `docs/handoff.md` | Phase exit summary | Preserves baseline; documents changes |

## Phase 01 Files Created

| File | Purpose | Evidence |
|------|---------|----------|
| `docs/hosting-comparison.md` | Hosting research and cost comparison | 3 options analyzed; pilot vs production |
| `docs/deployment-plan.md` | Deployment procedures | Docker, CI/CD, rollback, security |
| `docs/operations-runbook.md` | Operations procedures | Backups, incidents, maintenance |
| `Dockerfile` | Multi-stage build for Next.js | Standalone output; Alpine base |
| `docker-compose.yml` | Local development stack | App + PostgreSQL |
| `docker-compose.prod.yml` | Production deployment | Secrets management, health checks |
| `.dockerignore` | Build optimization | Excludes dev/secret files |
| `.github/workflows/ci.yml` | CI pipeline | Type-check, lint, build, test, Docker |
| `next.config.mjs` | Next.js config update | Added output: "standalone" |

## Key Findings (Phase 01)

1. **Hosting Options Identified:**
   - **Pilot (Lowest Cost):** Self-managed VPS (~$5-10/mo) — high operational burden
   - **Production (Better Resilience):** Vercel + Neon/Supabase (~$40+/mo) — managed, scales well, good African latency via edge
   - **Hybrid:** Single VPS with managed DB (Supabase/Neon) — balanced cost/ops

2. **Deployment Readiness:**
   - Build passes with `output: "standalone"` (verified via `npm run build`)
   - Docker multi-stage build produces minimal production image
   - CI/CD pipeline validates type-check, lint, build, tests before Docker build
   - Rollback procedure documented (revert to previous image tag)

3. **Operations:**
   - Backup strategy: daily pg_dump to off-server storage
   - Secrets management via Docker secrets (prod) / env files (local)
   - Health checks on both app and DB containers
   - TLS via Let's Encrypt (documented in runbook)

4. **Security:**
   - No credentials in repo (`.env`, `.env.txt`, `.env.local` in `.gitignore`)
   - Production uses Docker secrets for sensitive data
   - Firewall rules and SSH hardening documented
   - Non-root containers

## Verification Evidence

- **Build:** `npm run build` ✅ (standalone output verified at `.next/standalone/`)
- **Type-check:** `npm run type-check` ✅
- **Git Push:** Remote SHA `c53d8bb31e48bdffaf0f857183ae7e10f0f77926` confirmed matching local
- **No secrets committed:** Verified via `git diff` and `.gitignore` check

## Remaining Work

**Phase 02A** — Design system: accessible color and typography tokens (per AGENTS.md rule 23)

## Authorization Boundaries

- **No purchases made** — hosting research only
- **No domain registration** — documented for future
- **No production DNS changes** — documented for future
- **No production deployment** — configuration prepared only
- **No production data migration** — documented procedure only

---

## Handoff — Control Center runtime integration (2026-11-02)

**Branch:** `naijashop-marketplace`

**Base:** `dc47a4d` “Add reference-aligned Control Center components”

**Published:** pushed to `origin/naijashop-marketplace` at `90a7f20` (working tree clean, remote in sync)

**Preview:** production build served at `http://localhost:3100` with `NEXT_DIST_DIR=.next-prod` (not a deployed URL)

**Visual target:** `design-references/admin/naijadeals-control-center-master.png`

### Delivered

- `lib/admin/admin-navigation.ts` — module/tab IDs, aliases and href builder
- `lib/admin/load-page-data.ts` — server loader and normalisation for real PostgreSQL rows
- `app/admin/page.tsx`, `app/super-admin/page.tsx` — `searchParams`-driven rendering with session roles
- `components/functional/admin-workspace-tabs.tsx` — real Orders, Deliveries, Trips, Payouts, Products, Applications, Payments, Users, Vendors, Couriers, Drivers, Audit and Settings tables with filters, search, refresh and honest empty states
- `components/functional/admin-dashboard.tsx`, `admin-shell.tsx`, `admin-module-switcher.tsx`, `admin-module-workspace-header.tsx` — URL-aware active states, header search, mobile sidebar, overflow fixes
- `lib/auth/guard.ts` — `requireSuperAdmin()`; `app/api/super-admin/system/route.ts` — super-admin-only snapshot without secrets
- `scripts/ensure-super-admin.cjs`, `prisma/seed.cjs` — idempotent local super-admin fixture
- `scripts/control-center-visual-qa.mjs` — real-Chrome Playwright verification and screenshots

### Verification (local runtime only)

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `NEXT_DIST_DIR=.next-prod npx next build` | successful |
| `node scripts/control-center-visual-qa.mjs` | **29/29** browser checks, no console/network errors |
| `npm run test:drive` | **28/28** |
| `npm run qa:idle-sweep` | **3/3** |

Artifacts: `.qa/control-center/` (desktop and mobile screenshots plus `report.json`; no credentials are written).

### Honest boundaries

- No production deployment, live payment, live dispatch or provider-credential test occurred.
- Unimplemented modules show “not available in this build”; they contain no sample metrics.
- Phase 05 remains **IN PROGRESS**: pagination, bulk actions, detail views, cross-region scopes, role-assignment writes and sensitive-action audit events are not done.
- The in-app browser screenshot API was unavailable (“Screenshot needs a visible tab”); Playwright with installed Chrome was used instead.
- Push status must be checked separately from local verification; a GitHub rejection does not invalidate the local repair.

### Publication (2026-11-02)

- **Remote:** `origin/naijashop-marketplace` now at `90a7f20`; `git rev-list --left-right --count` reports `0 0`.
- **Push blocked once, then cleared:** GitHub secret scanning rejected the branch because a **revoked** token value was still written in plaintext in `HANDOFF.md` inside two of the eight unpublished commits (`8d97fc2`, `e1e8bbd`). The value has been replaced with `ghp_REDACTED_IN_HISTORY` across the eight unpublished commits (no other content changed; `git diff --stat` shows only that one line).
- **History rewrite scope:** local-only commits on `naijashop-marketplace` above the previously published `9fe78d5`. Pre-rewrite commits are still reachable through the local branch `backup/pre-secret-redaction-ec55b41`; nothing was deleted.
- **CI:** `.github/workflows/ci.yml` runs type-check, lint, build, test and a Docker build with `push: false`. There is no deployment job, so the push triggered CI only.
- **Credentials:** the push used a credential supplied outside Git; no token value is stored in tracked files, logs, or reports. The leaked value in `HANDOFF.md` was already revoked and remains unusable.

## Phase 01 — tooling verification (2026-11-03)

Scope: tooling evidence only. No application source was changed, and Phase 01 is **not**
claimed as passed by this work.

**Verified by execution (details and hashes in `docs/reference-and-tooling-evidence.md`):**

- REA 6.8.0: MCP registration `aligned` for this harness, 229 tools advertised, and the
  `reverse-engineer-anything` skill matches the published package on all 8 files.
- Browser: passive CDP captures against Uber Kenya, the public Uber price estimate, Bolt
  Kenya and `http://localhost:3000`, each with a screenshot digest, through a dedicated
  browser profile bound to loopback debugging.
- Android: JDK 21, platform-tools 37.0.1, apktool 3.0.3, JADX 1.5.6 and REA's required
  `jadx-headless-mcp` 0.7.1 bridge, each digest-checked against an upstream source. REA
  ran JADX on a real APK and apktool decoded 1207 resources; adb reports no attached device.
- ECC 2.2.3 is installed (120 skills, 68 agents, 94 commands). Soup, the local ECC skill
  router, runs and is registered as an MCP server alongside REA.

**Correction to the earlier record:** the only APK on this workstation, `taxify-driver.apk`,
is package `cm.aptoide.pt` (Aptoide 10.0.0), not a Bolt/Taxify client. The earlier claim
that it was a Bolt driver app was wrong.

**Blocked / next:**

- No genuine Uber or Bolt APK exists locally, so competitor Android behaviour is unverified.
- No Android device or emulator is attached.
- Phase 01 remains BLOCKED on its other gates: documented skill selection per domain,
  a deliberately failing CI check, a coverage baseline, and the regression suite for auth,
  purchase and ride flows.

## Implementation slice — scoped staff RBAC + baseline (2026-11-03)

**Change:** `lib/auth/guard.ts` now exposes `hasAdminConsoleAccess()` and `requireAdmin()`
admits scoped staff roles (ops, finance, support, moderator) in addition to full admins.
Permission checks and region scope are unchanged; role administration stays super-admin only.

**Why:** the admin security suite showed every scoped-staff call returning
`403 "Administrator access is required"` before permission logic could run — ten failing checks
rooted in one gate.

**Test-fixture repairs (no assertions weakened):** the admin suite referenced a retired
`VendorStatus.ACTIVE` value (now `VERIFIED`) in two fixtures; the drive race check accepted only
409 for an expired start, but release clears the assignment so 403 is equally valid — it now
accepts either while keeping the "not started / requeued" invariants.

**Verified on an isolated database (`naijadeals_test`, freshly migrated and seeded):**

| Suite | Result |
| --- | --- |
| `scripts/marketplace-tests.ts` | **13/13** |
| `scripts/admin-security-tests.ts` | **19/19** (was 9/19 before the fix) |
| `scripts/drive-tests.ts` | **28/28** |
| `npx tsc --noEmit` | clean |

Reproduction: `DATABASE_URL=<test db> ENABLE_TEST_PAYMENTS=true npm run dev -- --port 3101`,
then `TEST_BASE_URL=http://localhost:3101 npx tsx scripts/<suite>.ts`. Suites are not fully
idempotent on a shared database (marketplace rejects catalog products without images created by
a previous run; drive needs no active ride), so reset and reseed between full runs.

**Region filter (same pass):** the Control Center selector previously only rewrote the URL — a dead
control. The final implementation:

- regions are derived from the country catalogue (`lib/config/commerce.ts` → `COUNTRIES`) instead of
  a hard-coded Nigeria/Ghana pair, so enabling any country there adds it to the selector with no
  code change; "All regions" is a real option;
- the server resolves and validates `geo`, clamps it to a scoped staff member's assigned country
  (staff cannot widen scope through the URL), and filters the page datasets **before** they are
  serialised, so out-of-region rows never reach the browser;
- scoped staff can now enter the console at all: `app/admin/layout.tsx` and the login landing
  route use `hasAdminConsoleAccess`, matching the API guard;
- tables paginate at 10 rows with Previous/Next and a “Showing x–y of n” range; the footer resets
  when the filter or search changes;
- summary cards remain platform-wide and are labelled as such, and rides/couriers/audit are
  explicitly called out as not country-scoped (no normalised country column exists for them).

Browser evidence (`qa-artifacts/region-verification.cjs`, 17/17 checks): default region, GH
selection, refresh persistence, invalid `geo=XX` fallback to All, pagination page 1→2, scoped
staff clamping with no GH order visible, mobile selector, zero console errors.

**Live development preview (2026-11-03):** the persistent dev server runs on
`http://localhost:3000` against the local development database from `.env` (the pending
`admin_region_scope` migration was applied locally first). Verified: `/`, `/naijashop`,
`/naijadrive` return 200 with stylesheets; 11 module images load at 1024 px; `/admin` redirects
anonymous visitors to `/login?next=/admin` and renders after sign-in; zero console errors;
desktop and 390×844 mobile screenshots captured. A separate isolated test server may run on
`http://localhost:3101` against `naijadeals_test`; it is not the preview.

**Documentation reconciliation (same pass):** `docs/architecture.md` and
`docs/requirements-matrix.md` were rewritten from the verified code and test evidence;
`docs/functional-gap-report.md` is now explicitly historical (it described the June 2026
localStorage demo). Stale claims (commit `61b066ee`, phantom stash, "no tests/CI") are gone.

**Still blocked:** the deliberately failing CI check (push returns 403), and the remaining
Phase 05 items (pagination/bulk/detail views, country activation, audit before/after detail).

## Homepage redesign (2026-11-03)

The homepage was rebuilt against the project's own specification
(`docs/design-direction.md`): editorial hero with location/currency/live badges and a glass
search, an honest ecosystem pulse strip, an asymmetric service bento (Shop and Drive featured),
a "One wallet" band, refined trust/partner sections and a `/drive` → `/naijadrive` redirect.
Copy and i18n keys are unchanged; no new dependencies; shell markers preserved.

Verified in Chrome at 1440×1100, 820×1000 and 390×844: HTTP 200, zero console errors, 11 module
images loaded, and `/naijashop`, `/naijadrive`, `/wallet`, `/products` all 200. Screenshots in
`qa-artifacts/preview/final-redesign-*.png` (Git-ignored). The preview is served from the
project's dedicated `.next-preview` build directory so concurrent agent servers cannot corrupt it.

## Accessibility pass 02A/02C (2026-11-03)

axe-core 4.12 (WCAG 2.0/2.1 A+AA) reports **zero violations** across 15 routes on desktop and
mobile. Three defects were found and fixed: the setup-status dot contrast (2.15:1 → 5.02:1 via a
new `amber-strong` token), the 16 px sidebar sign-in target (now 36 px), and the Leaflet map
container that was `aria-hidden` while containing focusable controls (now a labelled region).
Keyboard traversal starts at the skip link (147×40 when focused) with visible focus throughout;
heading order and image alts are clean; no horizontal overflow at 390 px. Full evidence:
`docs/audits/deepseek-accessibility-02a-02c.md`. 02B keyboard flows and 02D screen-reader/RTL
checks remain open.

## Accessibility pass 02B/02D (2026-11-03)

Arabic RTL verified end to end (dir/lang, mirrored layout, 0 axe violations, no overflow at 1440
or 320 px); 200 % text resize and 320 px reflow both pass without horizontal scrolling; the
Leaflet map is keyboard-pannable (ArrowRight moves the map pane 80 px). Forced-colors mode
initially broke the hero (white text on flattened backgrounds) and is fixed by opting brand
surfaces out with `forced-color-adjust` under `@media (forced-colors: active)`. Semantic tree:
header/nav ×3/main/footer/aside, zero unnamed controls. Evidence:
`docs/audits/deepseek-accessibility-02b-02d.md`. A manual screen-reader pass remains.

## NaijaShop marketplace rework (2026-11-03)

`/naijashop` now follows the Amazon-referenced marketplace floor captured with REA
(Evidence `ev_92440282…bb9fd`): utility bar (deliver-to, department scope, search, account,
returns/orders, cart), department strip, left filter rail with real category counts, NGN price
bands, rating floor and in-stock toggle, a results header with sort, and Amazon-shaped product
cards (square image, stars, review count, price, strike list price, discount badge, stock, seller,
yellow Add to cart / See options). Mobile collapses filters behind a Filters button and keeps a
2-column grid. Verified: 12 cards build from live API data, axe 0 violations, no mobile overflow,
anonymous add-to-cart surfaces the real sign-in error. Details: `docs/design-direction.md`.

## Catalogue provenance (2026-11-03)

The 12 seeded products are now explicitly marked as samples (`Product.isSample`) instead of being
presented as real listings. `/naijashop` shows only genuine seller-published products; the dev
database currently has none, so the storefront renders an honest empty state with a Sell CTA and a
clearly-labelled "View sample catalogue (demo)" toggle. Sample cards, search results and product
detail pages all carry a "Sample" warning. Migration, seed, API and UI changes are recorded in
`docs/design-direction.md`; axe is clean in both states and the mobile layout has no overflow.

## Shell and navigation polish (2026-11-03)

Shared shell refreshed for the new design language: pill navigation with a labelled Search
affordance, ecosystem and account section labels in the rail, active-module accent plus honest
live/setup status dots, Orders and NaijaPay links, a safe-area-aware mobile tab bar with an active
pill, and automatic menu close on navigation. All accessibility markers survived (skip link,
`Primary`/`Marketplace`/`Account`/`Mobile` nav labels); axe is clean on desktop and mobile.

Note for other agents: the long-running dev server on port 3000 could not be restarted from this
session (its process survived kill attempts), so it still has the pre-`amber-strong` Tailwind
config cached. The affected utilities now use `bg-[#B45309]`-style arbitrary values so they render
without a restart; a normal restart can switch them back to the token.

## Control Center record detail (2026-11-03)

The Products table now supports **bulk moderation**: row and select-all checkboxes, a live
"N selected" bar, Suspend/Activate selected with a confirmation step, per-row outcomes, a failure
summary and a refresh. Verified in Chrome: 12 selected via the header checkbox, two products
suspended and then restored to ACTIVE, selection cleared, axe 0 with the bar visible. Bulk actions
for orders, rides and payments are intentionally not enabled yet.

**Commit note:** `0ff7e2b` also carried the previously uncommitted admin-service
scope/permission edits that already backed the 19/19 admin suite; they were exercised in the running
app before being committed, and the file is now clean.

Sensitive admin mutations now record their previous state: `product.moderated` and
`admin.order_status_updated` write `{ before, after, note }` into the audit row, and the record
dialog renders an "Audit metadata" block (verified: a product suspended then restored produced
`before: ACTIVE, after: SUSPENDED` in the audit detail). Payouts and role changes already stored
before-state; refunds and disputes still need the same treatment.

Every operational admin table (orders, deliveries, rides, payouts, products, applications,
payments, users, vendors, couriers, audit) now exposes the shared `View` dialog; audit rows title
themselves by action (e.g. `product.moderated`) and rides by ride number. Verified: ride dialog
7 fields, audit dialog 5 fields, no console errors.

Orders, Vendors, Products and Users tables now expose a shared `View` action that opens an accessible native modal dialog
with the row's real fields (status, payment, total, customer/vendor, market, owner, counts,
created). Verified in Chrome: `showModal` modal semantics, labelled title, initial focus inside,
Tab/Shift+Tab trapped (explicit wrap handler), Escape closes, focus returns to the triggering
button, axe 0 with the dialog open. A StrictMode cleanup bug that dismissed the dialog immediately
was found and fixed. Bulk actions and detail views for the remaining tables are still open.

## Country activation (2026-11-03)

`CountrySetting` rows now override the static catalogue at runtime. The Control Center Settings
tab has a super-admin "Country activation" panel (sell/delivery checkboxes, source badge, save) backed
by `GET/PATCH /api/admin/countries` and the new `countries:write` permission. Every change writes a
`country.updated` audit row with before/after metadata.

Checkout now consults the override: disabling Ghana returned **400 `country_disabled`**, re-enabling
moved the request on to **503 `delivery_unconfigured`** (Ghana delivery is genuinely not configured).
Absent rows fall back to `lib/config/commerce.ts`. Because the long-running dev server still has a
Prisma client from before the model existed, the service uses parameterised raw SQL; a normal
restart can switch it to `prisma.countrySetting` without behaviour change.

**Preservation repair (same pass):** several files the app already imports were never tracked —
`lib/auth/api-error.ts`, `lib/auth/scope.ts`, the super-admin role route, and the
`20261102173000_admin_region_scope` migration. They are now committed (`c5d89ea`) and an import
audit confirms every local `@/`/relative import resolves to a tracked file. Build directories,
test results and the REA bundle are now ignored explicitly.

## Design references and NaijaShop alignment (2026-11-03)

The owner's five target mockups are preserved in `design-references/approved/` and mapped to
current status in `docs/design-direction.md`. The NaijaShop storefront now mirrors the supplied
marketplace reference: department chips, a **category icon rail** (9 categories, icon per vertical)
and a **red/amber/green promo trio** — Today's deals, Top rated, New arrivals — each wired to real
data and filtering (deals reduced 12 sample cards to the 6 with genuine savings; aria-pressed and
axe clean). The next design increment is the NaijaDrive landing composition (reference 04).

**Phase 05 acceptance (same pass):** on a freshly migrated/seeded isolated database, run in the
order admin → marketplace → drive, the suites report **19/19**, **13/13**, **28/28** with
`tsc --noEmit` clean. One coupling was fixed: the admin suite's cross-region product fixture had no
image, which made the marketplace catalogue check fail when it ran second; the fixture now carries
an image. Reminder: restart the test server after dropping/recreating its database, otherwise
Prisma reports "Server has closed the connection".

**NaijaDrive landing (same pass):** the ride page now opens with the reference-04 composition — a
photographic hero carrying "Request a ride, get around Lagos with NaijaDrive", a service tab bar
(Ride active; Package → delivery workflow; Bike and Schedule visibly disabled with "not available
yet"), then the existing live fare/vehicle/request flow. Verified: headline renders, 5 tab items,
2 disabled, axe 0, no mobile overflow, screenshots in `qa-artifacts/preview/drive-landing-*.png`.

**Homepage service switcher (same pass):** six service chips now sit in the hero
(NaijaShop, NaijaDrive, NaijaEats, NaijaStay, NaijaSend, NaijaGigs). NaijaShop keeps the search form;
selecting another service swaps it for a module card with an "Open" link, and switching back restores
the search. Verified: 6 tabs, form ⇄ CTA swap, axe 0, no mobile overflow.

**Remote naming:** the single named remote is now `github-preservation` →
`https://github.com/naijadeals001-hash/NaijaDeals_AI_Build.git`, per the project preservation rule;
the duplicate `origin` entry was removed. Pushes still return **403 (denied to BetFuz)**, so the
verified local bare backup at `C:\Users\User\naijadeals-backup.git` and the dated bundle remain the
authoritative recovery path until GitHub authentication is fixed.

**Refund and dispute audit parity (same pass):** `payment.refunded` now stores
`before`/`after` for payment, order and escrow status, and `dispute.opened` stores the order and
escrow states it replaced. Verified against the isolated database: a refund produced
`paid/held/vendor_notified → refunded` and opening a dispute produced `completed/released →
disputed`; marketplace suite still **13/13**.

**Phase 05 exit-gate run (2026-11-03):** fresh isolated database → admin **19/19**, marketplace
**13/13**, drive **28/28**, `tsc` clean. Dashboard KPIs matched direct SQL across six figures
(products 12, vendors 2, orders 0, trips 43, completed 20, drivers 2). Bulk partial failure was
exercised by injecting a 500 on one selected product: the other row was suspended, the blocked row
stayed ACTIVE, and the UI surfaced the row failure. Admin at 390×844 has 0 document overflow,
in-container table scrolling, working navigation and axe 0. Phase 05 stays **IN PROGRESS** only for
work coverage: role-assignment UI, disputes admin view, city activation.

**Owner-supplied brand artwork (same pass):** eight AI-generated illustrations were compressed into
`public/brand-photography/` and wired into NaijaDrive (hero sedan, card SUV), NaijaStay (apartment +
villa), NaijaStream (studio + rooftop) and Aura AI (concierge + orb). They are labelled as brand
illustrations, never as real listings, customers or drivers. All eight load with naturalWidth > 0,
no 404s, axe 0.

**Homepage redesign (owner feedback, 2026-11-03):** `/` is now full-bleed — no ecosystem sidebar,
a module sub-nav row under the header, the owner-supplied NaijaDrive sedan as the hero image, one
service-chip row, the marketplace search, two primary CTAs and a ten-tile module rail; the redundant
status-pill strip is gone. Verified 1440 + 390: no overflow, axe 0, no console errors.

**Disputes admin view (same pass):** new `disputes:read` permission, `GET /api/admin/disputes`
(region-scoped, jsonSafe for BigInt), a "Disputes" tab in ecosystem/shop/pay workspaces, and a
table with order, buyer, seller, status, escrow state and opened date plus the record dialog
(now titles by order number and shows the reason). Verified on the isolated instance: 1 dispute
row rendered, dialog reason present, axe 0; anonymous access returns **401**. Resolution actions are
deliberately not exposed yet.

**NaijaSend landing (same pass):** the supplied airport cargo-hub image now drives the NaijaSend
ecosystem card and a new `/naijasend` hero ("Send parcels across town, tracked at every step"),
followed by recorded-events / escrow-release / Lagos-coverage cards and a status card that states
external carrier credentials are not configured. Verified: image loads, 3 feature cards, axe 0,
0 overflow at 1440 and 390.

**Role-assignment UI (same pass):** the Users table now has a super-admin-only "Manage" action
opening a role/scope dialog (role checkboxes from the database, country select, city scope). Saving
calls the existing `PUT /api/super-admin/users/[id]/roles`, refreshes the row and confirms inline.
Verified: support granted to the test customer then removed, row state persisted both times, audit
rows `admin.roles_updated` contain before/after role arrays, and saving your own account returns
"You cannot change your own roles or scope." (403). axe is 0 after fixing the error text contrast.

Note: the development database predated the expanded staff-role list, so `ops`, `finance`,
`support` and `moderator` were missing there; they were upserted (seed already defines them) and
both dev and test databases now expose all ten roles.

**NaijaEats landing (same pass):** the supplied food-delivery graphic was cropped past its baked-in
text and now drives the NaijaEats card and a split hero ("Order food for delivery, once the kitchen
is connected"), followed by escrow / tracked-dispatch / no-fake-kitchens cards and a setup-status
card that keeps ordering disabled honestly. Verified: image loads on the page and homepage card,
3 feature cards, axe 0, 0 overflow at 1440 and 390.

**NaijaFresh landing (same pass):** the supplied market graphic (cropped past its baked-in text)
now drives the NaijaFresh card and a new `/naijafresh` split hero — "Fresh groceries from Lagos
markets, once vendors are connected" — with verified-vendor / escrow / honest-availability cards
and a setup-status card. Verified: image loads on page and homepage, 3 cards, axe 0, 0 overflow at
1440 and 390.

**Landing redesign from REA evidence (same pass):** a shared `ModuleLanding` component now backs
the vertical pages, derived from an REA capture of a live mobility super-app landing (hero → services
→ earn → setup status). NaijaStay, NaijaStream, Aura AI and NaijaGigs were rebuilt on it, each with
two images, capability cards, an optional partner band and an honest setup card. Verified: all images
load, 3 feature cards each, axe 0, 0 overflow at 1440 and 390. NaijaEats/Fresh/Send already follow
the same structure; Drive and Shop keep their reference-specific layouts.

**Homepage hero cleanup (same pass):** the in-hero service chips were removed per owner feedback —
they duplicated the module rail, produced a horizontal scrollbar at narrow widths and cluttered the
search-first hero. Verified: no chip group in the hero, search and both CTAs present, 0 page
overflow, axe 0.

**Dispute resolution (same pass):** disputes can now be resolved from the Control Center with an
audited decision — **refund the buyer** (reverses the completed payment, escrow to refunded, order
refunded) or **release escrow to the seller** (credits the seller payable, retains commission,
order completed).

Verified on the isolated instance: refund produced `refunded / refunded / refunded` and dispute
`resolved_refund`; release moved escrow to `released`, completed the order, credited the vendor
wallet **555,000** and closed the dispute as `resolved_release`; both wrote `dispute.resolved` audit
rows with before/after. The dialog disables an action when the payment or escrow cannot support it,
axe is 0, and attempting a release on already-released escrow returns **409
`escrow_not_releasable`** — a guard added because opening a dispute must not make released money
releasable a second time. Dismissal is deliberately not exposed (the order status machine cannot
restore an arbitrary pre-dispute status).

**City activation (same pass):** `CitySetting` rows override the configured city list for onboarding
and staff scopes. Settings now shows a "City availability" table (country, city, on/off, config vs
saved) with immediate saves, and every change writes a `city.updated` audit row with before/after.
Role scope assignment validates the city: GH/Accra succeeded only after Accra was activated, while
GH/Kumasi returned **409 `city_not_activated`**. Verified with axe 0 and state restored afterwards.

**Blended landing heroes (owner feedback):** all seven vertical landings now use a single full-bleed
hero image blended into the dark surface, matching the NaijaDrive header; the split panel and
floating secondary thumbnails were removed. Each page reports exactly one hero image, axe 0 and no
overflow.

**Phase 05 PASS (2026-11-03):** final acceptance run on a freshly migrated/seeded isolated database —
admin **19/19**, marketplace **13/13**, drive **28/28**, `tsc` clean. Exit gate 6/6 and every work
item is closed: role-assignment UI, dispute resolution, country activation, city activation, region
filtering, before/after audit. Documented limitations: dispute dismissal is not exposed (status
machine), and live driver presence/map provider remain unintegrated.

**Landing page for every module (same pass):** NaijaPay gained `/naijapay` (one blended hero,
ledger/escrow/payout cards, "Open NaijaPay" → `/wallet`), completing the set: shop, drive, eats,
fresh, send, gigs, stay, stream, aura and pay each have a landing route recorded in
`docs/design-direction.md`. Verified all ten return 200 with axe 0 and 0 overflow.

**Phase 06 seller suspension (2026-11-03):** admin vendors table now has Suspend/Reactivate; suspension
requires a reason, is audited with before/after, hides the vendor's products from the catalogue (which
already filters `vendor.status = VERIFIED`), blocks seller writes with **403 vendor_suspended**, and
shows a banner on `/seller`. Verified: suspend 200 → catalogue product absent → create 403 with reason →
overview SUSPENDED → reactivate 200 → create 201 (probe deleted). Driver/courier suspension, rejected-
application access and ledger-based earnings remain open for Phase 06.

**Phase 06 courier suspension (2026-11-03):** Couriers table now has Suspend/Reactivate with a required
reason and an audited `courier.status_changed` row. Assignment checks the suspension first and returns
**409 courier_suspended** with the reason; reactivation clears it. Courier delivery updates stay open so
an assigned delivery can be finished. Verified: suspend 200 → assign 409 → reactivate 200, audit
before/after present.

**Commit scope note:** `f1bbb0b` also carried a pending change in `app/api/admin/couriers/route.ts`
(`requireAdmin()` → `requireAdminPermission("deliveries:read")`) that was already in the working tree
from the earlier RBAC migration; it was exercised by the admin suite before commit.

**REA module research map + NaijaSend freight (2026-11-03):** the ten-module journey map is now
recorded in `docs/rea-module-research.md`, with references, journeys and status per module. Journey 1
was captured with REA from GIG Logistics (entry points and calculator factors, with limitations
noted). NaijaDeals implemented its own first freight slice: `FreightRequest` (bus/air/truck/last-mile
quote requests), validated API with audit, freight form + history on `/naijasend`, and an operator
queue API. Verified quote NFS-20261103-BF20 end to end, axe 0.

**Journey 1 freight operator flow (2026-11-03):** freight requests now carry a carrier, quote and
milestone events. Operators quote (amount + carrier), assign, mark in transit and delivered; each step
writes a `FreightEvent` and an audited `freight.status_changed` row. The Control Center has a Freight
tab in the NaijaSend workspace and the sender sees milestones on `/naijasend`. Verified: truck Lagos →
Kano 800 kg quoted ₦450,000, assigned, in transit, delivered; 4 events shown to the customer; axe 0.

**Journey 2 ride fare comparison (2026-11-03):** REA captured `https://www.uber.com/ng/en/ride/`
("Request a ride", "Ride options", "Pickup now", "Choose date and time", auto-fill cue) with the
repo's limitations recorded. NaijaDrive now compares fares across every class: `/api/drive/quote?all=true`
returns four server quotes and the vehicle cards show each price while the selected class drives the
booked fare. Verified prices ₦4,650 / ₦7,750 / ₦11,250 / ₦14,900 and axe 0.

**Journey 3 shop mode (2026-11-03):** products now carry `saleMode` (escrow | contact). Contact
listings show a badge and Contact seller panel (phone + WhatsApp) with an explicit escrow exclusion;
the cart API rejects them with 400 `contact_seller_only`. Jumia and Jiji were blocked by a Cloudflare
challenge in the REA browser, recorded as unavailable. Verified contact/escrow sample listings, card
and detail rendering, cart rejection, axe 0.

## Repository preservation (2026-11-03)

GitHub write access is still unavailable: `gh auth status` reports no logged-in host, the only
stored credential is for `BetFuz` (which lacks permission on
`naijadeals001-hash/NaijaDeals_AI_Build`), and a push/dry-run is rejected with `403`. No token
exists in the environment. **Nothing was force-pushed and no history was rewritten.**

A verified local preservation remote was created *outside* the repository:

| Artifact | Value |
| --- | --- |
| Bare backup repo | `C:\Users\User\naijadeals-backup.git` |
| Verified head | `0fcee5dd55e981e2dc8e7626cb0103b8768c1820` (matches local HEAD at backup time) |
| `git fsck --full` | clean (no output) |
| Bundle | `C:\Users\User\naijadeals-backup-20261103.bundle` (10,355,018 bytes) |
| Bundle verify | `The bundle records a complete history` (exit 0) |

Recovery: clone from the bare repo or `git clone <bundle>`; push new commits to the bare repo with
`git push C:\Users\User\naijadeals-backup.git "refs/heads/*:refs/heads/*"`. Restore GitHub access
with `gh auth login` or a PAT with `repo` scope for an account that owns/collaborates on
`naijadeals001-hash/NaijaDeals_AI_Build`, then push; the local branch history is intact.

**Final verification on a freshly migrated/seeded isolated database (2026-11-03):**
marketplace **13/13**, admin security **19/19**, drive **28/28**, `tsc --noEmit` clean.

## Repository audit (2026-11-03)

Eight audit deliverables were produced under `docs/audits/` with two machine manifests
(`deepseek-file-manifest.json`, `source-facts.json`):

| Document | Result |
| --- | --- |
| `deepseek-playbook-phase-inventory.md` | 21 canonical phases (00–20), 10 subphases (02A–D, 18A–F), 10 advisory Part M workstreams |
| `deepseek-file-inventory.md` | 664 in-scope files; 279 read in full (42,308 lines); 349 metadata/visual; 36 excluded with reasons |
| `deepseek-architecture-audit.md` | Next.js 14 / Prisma 6 / custom sessions; 39 models; 70 API routes; stale docs identified |
| `deepseek-module-capability-matrix.md` | NaijaShop/Drive/Send/Pay = PARTIAL; Eats/Fresh/Gigs/Stay/Stream/Aura/Property = NOT STARTED |
| `deepseek-admin-and-ui-audit.md` | Control Center structurally faithful; 15 gaps vs the master reference |
| `deepseek-requirements-gap-analysis.md` | Discovery, Property, native apps, NaijaID/Search/Connect/Ads/Rewards/API/Insights lack phases |
| `deepseek-tooling-readiness.md` | REA/ECC/Soup/Playwright/Android verified or blocked with evidence |
| `deepseek-next-actions.md` | Phase 01 first; push/CI, email, map, APK, imagery blocked |

No application code was changed by the audit. Phase 01 remains BLOCKED; Phase 05 remains IN
PROGRESS. Documentation contradictions were recorded rather than silently "fixed" in the source
documents that still need rewriting (`architecture.md`, `requirements-matrix.md`,
`functional-gap-report.md`).

**Push status (2026-11-03):** the documentation commit is **local only**. `git push origin
naijashop-marketplace` was rejected with `403` — `Permission to
naijadeals001-hash/NaijaDeals_AI_Build.git denied to BetFuz` — and `gh auth status`
reports no logged-in GitHub host. The remote branch is unchanged at `d28a6be`. Recovery:
authenticate (`gh auth login` or an authorised token) and push the existing commit; no
history rewrite is required.

**Phase 06 seller profile management (2026-11-03):** /seller now has a Business profile form
(name, description, pickup address/phone, payout bank/account name/number) backed by
GET/PATCH /api/seller/profile; changes are audited as vendor.profile_updated with the account number
masked. Updated values appear in the seller overview immediately. Notifications and the full
rejected-application verification remain.

**NaijaEats discovery slice (2026-11-03):** Restaurant/MenuItem schema and migration, verified-kitchen
API (raw SQL so the long-running preview works), two labelled sample kitchens, and a discovery section
on /naijaeats with delivery-area filter, cuisine chips and priced menus. Verified 2 kitchens / 6 items,
axe 0, no mobile overflow. Ordering journey (cart, fees, payment, kitchen acceptance, dispatch,
tracking) remains to be built and is explicitly marked as not available.

**Partner lifecycle regression (2026-11-03):** scripts/partner-lifecycle-tests.mjs runs against
TEST_BASE_URL and covers registration -> application -> admin rejection -> 403 + redirect -> rejection
notification, vendor suspension notification + mark-all-read, and courier suspension notification.
Latest run: 9/9 passed.

**NaijaEats layout parity (2026-11-03):** full-bleed /naijaeats with green brand bar, hero, mode tabs,
colored categories, photo-cover restaurant cards and a partner CTA tile. Verified: no sidebar, 2
kitchen cards + promo tile, 0 overflow, axe 0. Freight-style ordering foundation added as
lib/services/core/eats-order.service.ts (wallet-debited food orders with kitchen/courier transitions
and events); APIs and UI are not wired yet.

**KIE image generation blocked (2026-11-03):** .env, .env.txt and the standalone build env copies
declare no KIE key; only .env.example lists KIE_API_KEY with an empty value, and no KIE variable
exists in the Windows user or machine environment. Eleven properly licensed Nigerian food photographs
were sourced from Wikimedia Commons instead (public/food + /credits). NaijaEats hero now uses the
NaijaEats courier/jollof artwork with the mockup's category labels; ordering APIs/UI exist but the
end-to-end run is still being verified (test wallet balance blocked the first attempt).


## NaijaEats restaurant onboarding and menu publishing (2026-11-03)

Bounded increment after Phase 06 PASS. Route tested end to end on the isolated server
`http://localhost:3101` (test database), then the customer storefront was visually checked on the
preview.

**Migration impact** (`20261103230000_restaurant_onboarding`):
- new enum `RestaurantApplicationStatus` and table `RestaurantApplication` (unique per applicant in
  service logic; resubmission reuses the rejected row);
- `Restaurant.applicationId` (unique) links an approved application to exactly one kitchen, making
  approval idempotent;
- `MenuItem.published` defaults to false; existing sample items were backfilled to true so the
  labelled QA kitchens keep their menus.

**Tested route and results**
- New applicant submitted a kitchen application (201) for Yaba, Lagos; admin approved through the
  Control Center `Applications` tab; exactly one `Restaurant` was created and the partner gained
  `/restaurant` access.
- Partner added two items (naira input converted to integer kobo), published both, and both appeared
  at `/naijaeats` for the Yaba area with the exact prices (₦12,500 / ₦8,000).
- Price change to ₦13,000 was reflected on reload. Marking one item unavailable removed it while the
  other stayed published. A draft item never appeared for customers.
- Retrying approval returned 409 and did not create a second kitchen (single application row,
  single linked restaurant).
- A second approved kitchen's item could not be edited by the first partner (403, item unchanged).
- Admin suspension made every partner write return 403 `kitchen_suspended`; the public price stayed
  ₦8,000 until reactivation.
- Rejection left management denied: rejected applicant got 403 `not_a_kitchen` and the
  `/restaurant` page showed the rejection reason.
- `scripts/partner-lifecycle-tests.mjs` still passes 9/9.

**UI rules:** published + available items are the only menu rows returned by
`GET /api/eats/restaurants`; a kitchen with no live items is hidden; customer cards expose
"Browse menu" (checkout is gated) and QA fixtures carry a "QA sample" badge.

**Limitations:** the long-running dev server predates the generated Prisma client for these models,
so the new service uses raw SQL (matching the existing discovery query); a restart would allow typed
Prisma calls. Kitchen order dispatch stays out of this increment.

**GitHub preservation attempt (2026-11-03):** commit 6904434 on branch naijashop-marketplace.
Remote naijadeals001-hash/NaijaDeals_AI_Build stayed at d28a6beadbd10cdc42424270b79b3ff627d0d3b7;
the push failed with exit 128 and no updated remote ref (the same remote previously returned
"Permission ... denied to BetFuz"). Local backup remote and bundle were updated instead. Production
deployment remains gated.


## NaijaEats ordering and dispatch (2026-11-03)

Checkout is enabled for published menu items. Payment debits the customer NaijaPay wallet inside the
same transaction that writes the FoodOrder, its items, the first event and the audit row; the kitchen,
courier and customer screens all read the same order.

**Tested route** (`http://localhost:3101`, isolated test database):
- customer added a published item, paid ₦1,500; wallet moved from 1,480,000 to 1,330,000 kobo and the
  order page opened at `/naijaeats/orders/<id>`;
- kitchen clicked Accept order → Start preparing → Ready for pickup (all three badges confirmed);
- admin opened `/admin?tab=deliveries` → NaijaEats orders, assigned Test Courier;
- courier opened `/courier` → NaijaEats deliveries, clicked Mark picked up → Mark delivered;
- customer timeline showed 7 events ending in Delivered.
- A second browser run repeated the whole chain with the same result (order NFE-20261103-79B9).

**Migration impact:** none in this slice (uses the FoodOrder tables from `20261103220000_food_orders`).

**Rules:** only published + available items can be ordered; ownership is checked for kitchen and
courier transitions; suspension blocks kitchen writes; totals equal the menu subtotal because no
delivery or service fee has been approved. Cancellation/refund beyond the customer cancel-while-placed
path is not implemented.

**Tooling note:** the order-detail and status routes now read restaurant/courier ownership with raw SQL
because the long-running dev server's Prisma client predates those models; this removed the 500 that
previously blocked kitchen transitions.

**Preservation after ordering increment (2026-11-03):** commit e1c0ea9 is on local
naijashop-marketplace; the GitHub push again exited 128 and the remote branch stayed at
d28a6beadbd10cdc42424270b79b3ff627d0d3b7 (account access still denied). Local backup remote and bundle
were updated; production remains gated.

## Phase 07 audit and payout fix (2026-11-03)

Started Phase 07 after Phase 06 PASS. docs/audits/phase07-ledger-audit.md records the reviewed
services, acceptance cases and results. scripts/phase07-ledger-tests.ts runs eight cases against
the isolated database: ledger balance, non-negative wallets, duplicate confirmation, insufficient
funds, concurrent payout, payout overdraw (PASS) plus partial refund and sandbox webhook (BLOCKED).

markPayoutPaid had a double-settlement race: two concurrent calls could both decrement the vendor
wallet, and an oversized payout could overdraw it. It now claims the payout with a conditional
updateMany and debits the wallet only when availableKobo >= amountKobo inside the same transaction.
Wallet 2,450,000 to 2,449,500 exactly once under two simultaneous calls; a larger payout returns
insufficient_wallet and leaves the payout PENDING.

Migration impact: none. Phase 07 remains IN PROGRESS until partial refunds and sandbox webhook
evidence exist. No live charges were made.


## Phase 07 completion (2026-11-03)

Partial refunds are implemented in lib/payments/service.ts: optional amountKobo, cumulative
Order.refundedKobo, proportional seller/platform ledger split, atomic refund claim, full-refund
escrow/restock/order close behaviour preserved. Tests: scripts/phase07-partial-refund-tests.ts
(100 → 300 kobo accumulation, over-refund rejection, concurrent full refund with one conflict, repeat
rejection) and scripts/phase07-ledger-tests.ts (ledger balance, non-negative wallets, duplicate
confirmation, insufficient funds, concurrent payout, payout overdraw). All local cases PASS.
Sandbox webhook/signature evidence is BLOCKED for missing provider credentials; no live charge.

Migration impact: none.


## Phase 07 review follow-up (2026-11-03)

Review feedback addressed:
- Payouts are eligible only from PENDING/APPROVED; REJECTED is terminal and a PAID payout is returned
  without a wallet debit. Only the caller whose conditional update changed one row debits.
- Refunds now create an individual Refund attempt (unique idempotency key) and reserve the remaining
  refundable amount atomically before the provider call, so concurrent requests cannot exceed the
  order total and a retried key never calls the provider twice.
- Wallet partial refunds were exercised end to end: buyer wallet credited, escrow marked refunded,
  attempts summed to the order total.
- Synthetic Paystack HMAC-SHA512 and Flutterwave verif-hash tests pass with test-only secrets; live
  sandbox delivery/reconciliation remains BLOCKED.
- Payout provider transfer does not exist in this build (payouts are recorded manually), so duplicate
  external payout calls cannot occur yet; this must be revisited if a transfer adapter is added.

Refund fee policy remains unresolved in docs/decisions.md (proportional vs retained vs by reason, and
provider processing fees separately). No fee logic was invented.

Phase 07 stays IN PROGRESS: GitHub preservation and live provider sandbox evidence are outstanding.


## Phase 07 reconciliation gap (2026-11-03)

Payout settlement now writes a balanced WalletTransaction (vendor DEBIT, SYSTEM CREDIT) and credits the
SYSTEM clearing wallet. scripts/phase07-reconciliation.ts reports 3 of 37 wallets still out of balance:
one SYSTEM wallet (balance 0 vs ledger net 2,418,000) and two VENDOR wallets (1,425,474 vs
-25,974,526 and 2,446,726 vs 22,256,226). These predate the payout ledger change; a reviewed backfill
is required and was not performed. Phase 07 remains IN PROGRESS.

## Audit index and backfill preview (2026-11-03)

docs/audits/README.md now indexes phase status, evidence commands, blockers and the preview URL.
scripts/phase07-backfill-preview.ts is a dry run that proposes balanced reconciliation entries for the
three mismatched wallets using a new SYSTEM reconciliation counter-account; it writes nothing and
needs human approval. Phase 07 remains IN PROGRESS.


## GitHub preservation verified (2026-11-03)

An authorized token was added to .env.txt (value never printed or committed). The token authenticates
as **naijadeals001-hash** with push permission on naijadeals001-hash/NaijaDeals_AI_Build. The branch
naijashop-marketplace pushed successfully and the remote ref resolved to
**c576e56c9d2fa3807086630484abfa2a3f9fa76c**. CI runs tests only; no deployment workflow is triggered by
this branch.

## Amazon REA and NaijaShop layout pass (2026-11-03)

REA inspected the public amazon.com homepage (3,569 DOM nodes, deliver-to + department select +
search, category row, 9 promo cards, four footer columns). NaijaShop now runs full-bleed without the
ecosystem sidebar, keeps the two-row commerce header, dense four-column results, department rail,
sort control and a Back-to-top footer. No Amazon trademarks, ratings or imagery were copied; the
reference and resulting screenshots are recorded in docs/rea-amazon-research.md.


## NaijaShop Amazon pass 2 (2026-11-03)

REA also captured amazon.com search results: result count bar with sort options, left refinements, and
list rows with image, title, stars/review count, price/list price and add-to-cart. NaijaShop now renders
populated Amazon-style result rows (image left, rating/no-ratings, price, delivery, seller, yellow Add to
cart), a full-bleed dark header with a dark department strip, and automatically shows the labelled demo
catalogue when no live listings exist. Screenshot qa-artifacts/preview/naijashop-after.png.
**NaijaShop footer fix (2026-11-03):** removed the duplicate ShopFooter render (the page had two
instances) and suppressed the global AppShell footer on /naijashop so the storefront has exactly one
footer. Also darkened the discount badge text for contrast; axe is clean again.


## NaijaShop Amazon homepage pass (2026-11-03)

Replaced the marketplace hero and promo tiles with a colored collection carousel, eight category
shelves (2x2 images + See more), a personalized-recommendations sign-in band, and a layered Amazon-style
footer. Result rows and filters remain below the shelves. Verified on the working dev server at
http://localhost:3001/naijashop: 1 footer, 8 shelves, axe 0, no overflow. The canonical port 3000 is
currently returning 500 from an orphaned dev-server socket (PID 60680) that could not be terminated;
the 3001 server serves the same repository and latest build.

## NaijaShop homepage cleanup (2026-11-03)

Removed the results/filter block that sat below the personalized-recommendations band; the homepage now
ends with the carousel, eight shelves, the sign-in band and the footer, and the demo note is a compact
strip at the top. Shop now / See more links go to /search?category=... where the result rows and
filters live. Verified on the 3001 server: axe 0, no overflow, one footer.

## NaijaShop controls + search flow (2026-11-03)

Department nav items and All departments now link to /search?category=..., the shop header's deliver-to
block links to /account, and the search page renders Amazon-style result rows with a working Add to cart
(signed-in) that feeds /cart and its checkout action. Verified: Fashion nav -> /search?category=fashion;
search "phone" -> 3 Add to cart buttons; adding an item shows the cart notice; /cart shows the item and a
checkout link; product page exposes Add to cart and Buy now; mobile menu opens; language switcher opens.

## NaijaShop visual fill (2026-11-03)

Added licensed category product photography and seeded 20 extra labelled sample products so every
department shelf shows four tiles (photos plus existing illustrations). Added working left/right
carousel arrows. Verified on 3001: 8 shelves, arrows scroll 0 -> 352px, axe 0, one footer. Product
photo licences are listed on /credits.

## Preview incident (2026-11-03)

An orphaned entry named app/index could not be created, renamed or removed (NTFS EPERM; the owning
process is gone). Next and Tailwind both scan app/**, so every route on the original checkout returned
500. The source tree is intact and committed; a clean git worktree at C:UsersUser
aijadeals-live
serves the same commit on port 3010 with /, /home and /naijashop returning 200. The canonical ports
3000/3001 still hold the ghost listener (PID 60680) and need a host restart or handle release.

## Demo catalogue four-per-shelf (2026-11-03)

Added 16 further demo products (Openverse CC images, credits in public/products/demo2/credits.json)
so every department shelf renders four distinct products: 32 demo products, 32 unique local images.
Names were aligned to the actual photographs; mismatched branded samples remain archived as DRAFT.


## NaijaShop image audit (2026-11-03)

docs/audits/naijashop-image-audit.md records the 32-product audit: 13 images have recorded provenance,
19 lack complete source/licence records, and the phone/kettle/charger/cookware images are not acceptable
packshots. The 12 branded samples remain archived. Demo checkout is blocked server-side and the
Playwright suite passes 12/12. Image completion is NOT done; see the audit for the remaining gaps.


## NaijaShop catalogue cleanup (2026-11-03)

Visible demo catalogue reduced to 6 provenanced products (3 shelves); 59 sample records archived as
DRAFT. Canonical provenance is public/products/provenance.json. Playwright suite 13/13. Remaining gap:
Phones, Fashion, Groceries, Power and Gaming shelves are empty until suitable licensed photographs are
sourced. Demo checkout is blocked server-side. Canonical ports 3000/3001 remain a tracked infra issue.

## NaijaShop imagery restored (2026-11-03)

Per owner direction, all 65 sample products were re-activated so the storefront shows images again:
32 products rendered across 8 shelves (4 per shelf), 0 broken images. The earlier archive-only
cleanup was reversed; image-quality and provenance gaps remain tracked in the audit and will be fixed
by replacing images, not removing products.


## Admin-managed NaijaShop storefront (2026-11-03)

Added StorefrontConfig (singleton JSON) with admin API GET/PATCH at /api/admin/storefront
(products:moderate), public GET /api/storefront, and a Storefront controls panel in the Control Center
Products tab. Admin now controls: announcement banner, hero title/subtitle, visible departments, shelf
order, shelf item limit (1-8), demo-inventory visibility, and hero/shelf visibility. Changes are audited
as storefront.updated.

Verified live: admin PATCH 200 changed heroTitle to "Admin-managed NaijaShop" and the announcement;
/api/storefront and /naijashop reflected both. Screenshot qa-artifacts/preview/admin-managed-storefront.png.
Migration 20261103250000_storefront_config.


## Storefront controls acceptance (2026-11-03)

scripts/storefront-acceptance.mjs passes 13/13 locally on port 3010: unauthenticated 401, non-staff 403,
length/boolean/slug/limit validation 400, stale version 409, valid save 200, public API omits version,
script announcement rendered as text (no execution), demo visibility toggle, demo checkout guard 409,
audit row with actor and change set, and shop fallback when /api/storefront returns 500.
Optimistic concurrency uses a version in the config JSON; legacy rows without a version are treated as
version 1. The config row persists in PostgreSQL (migration 20261103250000_storefront_config).


## Storefront fallback hardening (2026-11-03)

When /api/storefront is unavailable the shop now uses the last valid configuration cached in
localStorage; with no cache it fails closed (showDemoProducts=false), so a failed fetch cannot
re-expose demos an admin hid. Acceptance suite extended to 14 checks, all passing locally on 3010.

Persistence wording: cross-request database persistence is demonstrated. A process restart and a
migration replay against an existing database were NOT executed; those remain outstanding.


## Imagery priority pass (2026-11-03)

Storefront shows 6 provenanced demo products across 3 shelves (Computers 3, Home & Kitchen 1, Beauty 2);
59 sample records are archived as DRAFT, not deleted. Every displayed image loads, matches its listing,
and has source/author/licence in public/products/provenance.json. Suitability is 5/6 (monitor is a desk
scene). Remaining shelves are empty until suitable licensed photos are sourced; no branded lookalikes
or AI packshots were used. Screenshots: qa-artifacts/preview/imagery-final-desktop.png and
imagery-final-mobile.png. Shop E2E 13/13; storefront acceptance 15/15 (includes stale-cache fail-closed).

Cached config may preserve layout/copy during outages, but demo visibility is never read from cache and
defaults to hidden whenever current configuration cannot be fetched.


## Catalogue population (2026-11-03, partial)

16 of 32 target demo products displayed with complete provenance (16/16): Computers 4, Groceries 3,
Home 2, Fashion 2, Beauty 2, Power 2, Gaming 1, Phones 0. 59 sample records remain DRAFT
(12 branded + 15 demo1 + 20 seed-catalog + 12 demo2); 10 new demo3 records active. Shop E2E 13/13 and
storefront acceptance 15/15 pass locally on 3010. Screenshots: qa-artifacts/preview/expanded-desktop.png,
expanded-mobile.png. Milestone remains PARTIAL pending Phones/Fashion/Home/Beauty/Power/Gaming coverage.
REA was used earlier for Amazon reference research; ECC/Soup were not invoked for this asset-sourcing pass.


## Four-per-department catalogue complete (2026-11-03)

32 demo products displayed, 4 in each of 8 departments, 32 unique images, 32/32 provenance entries,
0 broken images. Shop E2E 13/13 on 3010. Remaining DRAFT inventory is 59 records (12 branded, 15 demo1,
20 seed-catalog, 12 demo2). Presentation quality is mixed (~26/32 suitable packshots); monitor photos
are desk scenes. Screenshots refreshed: expanded-desktop.png / expanded-mobile.png.


## Six image replacements (2026-11-03)

Replaced six weak photos with licensed packshots (Asics shoes, Prada handbag, Blackview A60, EIZO
FG2421 monitor, mechanical keyboard, PS4/Xbox controllers). Removed unsupported 16GB/refurbished
claims. 32/32 products display 4 per shelf with 0 broken images; provenance 32/32; shop E2E 13/13.
Presentation ~28/32; the 27-inch monitor desk scene remains weak. Screenshots refreshed.


## Demo catalogue population — CLOSED (2026-11-03)

32 products, 8 departments x 4, 32 unique images, 0 broken, 32/32 provenance. Desktop and mobile
reviewed; horizontal category carousel is intentional. The four below-standard presentation images
(LED Monitor, Apple iPhone 5s, Coffee Maker, Smartphone on Desk) are tracked separately as visual
polish, not as a population blocker. Spec claims narrowed (no 27-inch/16GB/refurbished/filter/vintage
claims). Shop E2E 13/13.


## Playbook priority checks (2026-11-03, after catalogue closure)

### Restart persistence — PASS
The 3010 preview process (PID 24760, launched from C:\Users\User\naijadeals-live) was stopped and
restarted alone (new PID 6724). After restart: /api/storefront 200 with heroTitle
"Shop verified sellers across Africa", demo announcement, showDemoProducts=true; /naijashop 200.
Storefront config therefore survives a real process restart. 3000/3001 were not touched.

### Migration status — PARTIAL
npx prisma migrate status: 19 migrations found, "Database schema is up to date!" against the existing
dev database. A migration replay against a fresh/restored existing database was NOT executed.

### Canonical preview repair — BLOCKED (host restart required)
Evidence: port 3000 owned by PID 60680 (node.exe, owner DESKTOP-AQQLCB2\User, started 2026-10-31
01:24) returns HTTP 500. app\index is now ABSENT. Targeted Stop-Process and taskkill /F /PID 60680 did
not release the listener; a new dev server on 3000 failed with EADDRINUSE. Port 3001 similarly returns
500 with PID 65032. This is an OS-level ghost listener; no blind deletion or further killing performed.
Canonical repair requires a host restart or elevated handle release. Working preview remains 3010.

### Phase 07 — still IN PROGRESS
Local ledger/refund/payout tests pass, but closure remains blocked on:
- reconciliation mismatch: 3 of 37 wallets (1 SYSTEM, 2 VENDOR) differ from ledger net; dry-run
  backfill exists, no history rewritten and no approval to apply it;
- live Paystack/Flutterwave sandbox reconciliation unavailable;
- refund-fee business decision unresolved.
No Phase 08 work started.

### Image backlog unchanged
Four presentation improvements remain open (LED Monitor, Apple iPhone 5s, Coffee Maker,
Smartphone on Desk). Catalogue population stays closed; 32/32 images and provenance intact.


## Phase 07 wallet investigation (2026-11-03)

Read-only investigation in docs/audits/phase07-wallet-investigation.md. Current dev DB: 10 wallets,
1 SYSTEM mismatch cmvzwmxzx002cv4ucop26i63c (stored 1,940,000, ledger -560,000, difference +2,500,000);
earliest entry 2026-11-02T23:43:16.895Z "Fixture funding source" DEBIT 2.5m with no stored movement.
Earlier 3-of-37 rows belong to the isolated database and are absent from the current DB. Proposed
balanced opening-equity journal is dry-run only; no history rewritten. Phase 07 remains IN PROGRESS.

Environment: 3010 = clean worktree C:\Users\User\naijadeals-live, detached HEAD 941991d, same
naijadeals_core database as authoritative checkout (branch naijashop-marketplace, HEAD 941991d).


## Phase 07 correction prepared, not applied (2026-11-03)

Traced fixture: transaction SEED-WALLET-FIXTURE credits the customer 2.5m and debits SYSTEM 2.5m in the
ledger, but the SYSTEM stored available was never reduced. SYSTEM is the platform clearing/funding
wallet. Proposed opening-equity reclassification is therefore not duplicate funding. The generator that
created SEED-WALLET-FIXTURE is not present in this checkout, so it cannot be fixed here; the new
lifetime regression suite guards new databases.

LedgerAdjustment migration 20261103260000 adds an append-only PREPARED correction
PHASE07-FIXTURE-FUNDING-20261103 (references and balanced journal; appliedAt null). Prepare is
idempotent. Lifetime suite passes: non-negative wallets, one quarantined mismatch only, all ledger
transaction groups balanced, single PREPARED correction. Isolated 3-wallet DB remains unavailable and
unresolved. Phase 07 remains IN PROGRESS; correction is unapplied.


## Phase 07 correction implementation tested in isolation (2026-11-03)

Added LedgerAccount/AccountPosting and applyLedgerAdjustment (serializable, atomic status+postings,
idempotent, rollback on failure). Isolated schema test passes: whole-system balances, retry,
concurrent apply, forced-failure rollback, retry-after-failure, all wallets reconcile. Production
correction remains PREPARED/unapplied. Lifetime suite relabelled as containment, not full
reconciliation. Shared DB warning: 3010 and authoritative checkout both use
localhost:5432/naijadeals_core.


## Phase 07 cross-table check and policy choices (2026-11-03)

reconcileAdjustmentJournals validates adjustment journals across LedgerEntry and AccountPosting.
Shared DB: one PREPARED adjustment, zero postings, valid. Isolated applied test: wallet credits 2.5m =
account debits 2.5m, valid. Lifetime suite labels the shared result as containment only. Policy A
(negative SYSTEM clearing) versus Policy B (FIXTURE_EQUITY contra) documented with consequences; neither
applied. Provider readiness: Paystack/Flutterwave secrets and ENABLE_TEST_PAYMENTS missing; sandbox
reconciliation blocked on credentials. naijadeals_core is the shared local development database; the
pending adjustment is a shared-database adjustment, not production.


## Phase 07 coverage and policy notes (2026-11-03)

Lifetime suite now classifies every transaction (27 ordinary, 0 adjustment-linked) and fails on
uncovered/unbalanced/unrecognised rows; adjustment transactions are excluded only when an exact
LedgerAdjustment key exists and cross-table validation passes. Choice B (FIXTURE_EQUITY) recommended but
not applied; synthetic-funds schema isolation gap recorded. Refund-fee options A/B/C recorded, no
decision. Provider readiness is credential presence only; sandbox execution remains blocked.
