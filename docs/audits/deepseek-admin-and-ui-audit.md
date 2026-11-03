# Admin Control Center and UI/UX audit

## 1. Reference inspection

`design-references/admin/naijadeals-control-center-master.png` — 1672×941, SHA-256
`2a7103887dbdca99425e05c779818618593a34bacfafc9a92503da51581fe919` (visually inspected).

The reference is a dense dark enterprise console:

- Brand block "NaijaDeals Control Center / Unified Ecosystem Admin".
- Sidebar: Dashboard, Ecosystem Overview, Analytics & Reports, Users & Access (RBAC),
  Payments & NaijaPay, Settlement & Payouts, Disputes & Support (badge 12), Automation (n8n),
  Audit Logs, System Settings; **Ecosystem Modules** with per-module Admin links (Shop, Eats,
  Drive, Send, Gigs, Stay, Stream, Pay, Fresh, Aura); **Future Modules** with Plan badges
  (Health, Learn, Travel, Events, Finance, Agri); More Modules.
- Header: ecosystem-wide search, notification badge, avatar with role.
- Module tile switcher; page header with city selector ("Nigeria (All Cities)"),
  "Live Operations" status pill, Launch User App / Launch Driver App, expand.
- 14 module tabs: Overview, Dispatch, Live Map, Trips, Drivers, Vehicles, Fleet, Pricing, Zones,
  Services, Promotions, Finance, Reports, Settings.
- Six KPI cards with period deltas; live operations map with 4-state fleet legend and route pins;
  active trips list with IDs, routes, status, fares; service performance table with deltas;
  revenue trend line chart (7 days, ₦ values); driver-status donut (4 segments); ecosystem health
  (99.98% uptime); ecosystem summary totals; roadmap cards; recent activity; alerts with actions;
  six quick actions.

## 2. Implementation inspected

`/admin` and `/super-admin` both render `AdminDashboard` (`components/functional/admin-dashboard.tsx`,
539 L) composed from 15 purpose-built components: module switcher, workspace header, KPI cards,
operations map, service performance, revenue trend, driver status, activity, alerts, quick
actions, ecosystem health, ecosystem summary, planned modules, workspace tabs (1,031 L).

A real capture from the existing QA run (2026-11-03T00:23, `.qa/control-center/`) shows the
rendered desktop overview at 1440 px, 13 screens tall. The report records 29/29 passing checks,
including anonymous `/admin` → `/login?next=/admin` and a clean console/network on the
authenticated page.

## 3. Reference vs implementation — gaps

| Area | Reference | Current | Verdict |
| --- | --- | --- | --- |
| Sidebar structure | Ecosystem module list + future modules + settings groups | Flat operational list (Overview, Operations, Orders, Deliveries, Rides, Payouts, Catalog, Finance, People, Audit) | **Gap** — module navigation lives in tiles, not the rail |
| Module tabs | 14 per module (Dispatch, Live Map, Zones, Pricing…) | 6 generic tabs (Overview, Orders, Users, Vendors, Payments, Audit) | **Gap** — no dispatch/zones/pricing/report surfaces |
| KPI cards | 6 with deltas and trend arrows | 6 without deltas | **Gap** (honest: no prior-period aggregate) |
| Live map | Fleet pins, 4-state legend, active list | "Map not connected" placeholder; no provider | **Gap / blocked** — no mapping provider configured |
| Active trips | Live list with fares | Empty state | **Gap (data)** — DB has 43 trips but no live assignment records |
| Revenue chart | 7-day line with ₦ axis | Empty state with explanation | **Gap (data)** — no completed payments |
| Driver donut | 4 segments | 2 segments (registered drivers) | **Partial** — presence not tracked |
| Ecosystem health | Uptime 99.98% + sparkline | Integration health panel (endpoints/DB/providers) | **Different, acceptable** — no fabricated uptime |
| Ecosystem summary | 5 totals | 5 totals (users, orders, revenue, escrow, refunds) | **Close** |
| Future modules | 6 cards | 5 cards | **Partial** — Agri missing |
| Notifications / avatar | Badge + identity | Bell + admin menu, no badge/avatar | **Minor gap** |
| Search | Ecosystem-wide | Orders/users/products search in header | **Partial** |
| Country/city activation | Selector + all-cities | "All regions" selector | **Partial** — no activation workflow |
| RBAC management | Users & Access (RBAC) section | Super-admin settings only | **Gap** — no role editor |
| Density | Compact, 941 px one screen | 2,934 px tall page | **Visual gap** — vertical rhythm is looser |

**No fake metrics:** the current console openly reports zero revenue, an unavailable map and
provider "Setup" states. That satisfies the honesty rule but not the reference's information
density.

## 4. Homepage and super-app UI

Captured 2026-11-03 at 1424×805 (`http://localhost:3000`):

- Left ecosystem rail (NaijaShop…Aura AI) with live/setup badges; dark hero
  "One app for the way Africa moves, shops and pays"; Lagos/Nigeria/Naira chip; search field;
  three quick actions; ecosystem card grid.
- Compared with Uber Kenya (single location-first action) and Bolt Kenya (single "Get Bolt"),
  NaijaDeals leads with a rail plus search. The playbook asks for "prominent search or service
  selection" — present — but the ride-request entry is not a single above-the-fold action.
- Mobile: `app-shell.tsx` provides the shared shell; mobile QA screenshots exist in
  `qa-artifacts/` (`home-mobile.png`), but no mobile acceptance checklist is recorded.

## 5. Accessibility and responsiveness

- 25 pages use shared `AppShell`; `components/ui` holds only `badge` and `states`, so most
  patterns are ad-hoc rather than a documented design system.
- Admin report includes mobile viewport checks (768 px) and a mobile menu capture; no
  screen-reader or contrast audit is recorded anywhere (Phase 02C/02D are not done).
- No horizontal-overflow evidence beyond the QA script assertions.

## 6. Verdict

The Control Center is **structurally faithful** to the reference (same information architecture
and component families) and **honest about empty data**, but it is **not yet enterprise-complete**:
missing live map, module-specific operational tabs, RBAC editor, country activation, notification
center, and chart data. Phase 05 remains PARTIAL; it is not PASS.
