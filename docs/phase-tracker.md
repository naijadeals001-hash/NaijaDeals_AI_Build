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

**Still open for a Phase 06 PASS:**
- Courier suspension parity
- Rejected-application access re-verification and suspension *during an active job* policy
- Partner notifications and profile management primitives

## Phase 07 — Wallet, payments, escrow and settlement correctness

**Status:** NOT STARTED (depends on Phase 05, 06)

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