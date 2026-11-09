# Four-dashboard homepage system

Branch `naijashop-marketplace`. Preview: http://localhost:3015/ (design switcher at `/designs`).

## What exists

Four homepage designs on one platform. They share identity, wallet, routes and data;
they differ in what they put first. **Every design links to all ten services.**

| # | Design | Key | Hero | Emphasis |
|---|---|---|---|---|
| 1 | Original NaijaDeals | `original` | Existing NaijaDrive-led hero | The untouched `EcosystemHome` |
| 2 | Africa Super-App | `africa-super-app` | Abuja landmarks (Aso Rock, National Mosque, National Christian Centre, City Gate) | All verticals, equal weight |
| 3 | Mobility & Services | `mobility` | Centre-aligned, courier + ride | Drive, Send, Eats, Fresh, Gigs, Stay |
| 4 | Commerce & Lifestyle | `commerce` | Market scene | Shop, Fresh, Eats, Stay, Stream, Pay |

## Assignment

- New visitors get a weighted-random design from the **enabled** variants; the
  percentages live in the database (`HomeVariant`), seeded at 25/25/25/25.
- **Stable:** an httpOnly `nd_visitor` cookie (random opaque id, no personal data)
  is issued by `middleware.ts` and the pin is stored in `HomeAssignment`, so a
  refresh, restart or deploy does not change the design.
- **Manual choice wins:** `/designs` (or the docked switcher) sets `nd_design`
  and the database pin with `manual: true`, which automatic assignment never
  overwrites.
- Disabling a design sends its visitors to the first enabled design without
  losing their pin.

## Hero carousel

Each design has 6–10 slides (`lib/home/designs.ts`, overridable per slide in the
database). Behaviour: 7-second rotation, pauses on hover, focus and hidden tab;
arrows, dots, swipe and arrow keys; **reduced-motion users start paused**; only
the first image loads eagerly; a slide never navigates by itself.

## Control Center

`/admin` → **Homepage designs** (`homepage:write`): enable/disable each design,
set allocations (must total 100%), see the revision counter, list hero slides and
your override counts, and compare aggregate engagement per design.

## Analytics

`POST /api/home/metrics` stores **daily counters only** — design, event kind,
slide slug. No visitor id, IP or user id is recorded, so there is no per-person
profiling.

## Test results (2026-11-09)

| Suite | Result |
|---|---|
| `scripts/home-dashboards-e2e.cjs` (tests A–N) | **40/40** |
| `scripts/home-responsive-qa.cjs` (4 designs × 10 widths 320–1920) | **120/120** |
| `scripts/link-audit.cjs` (incl. `/designs`) | **235/235** |

Covered: original preserved; each design renders with its own marker; all ten
services linked in every design; ecosystem grid shows ten cards; no broken
images; stable assignment across refresh; manual choice honoured and persistent;
hero dots/arrows/pause/reduced-motion; customers blocked from config (403);
external CTA rejected; `<script>` stripped from headlines; allocation ≠ 100
refused; stale-revision concurrent edit refused; assignments persisted.

## Imagery

22 new Kie.ai assets (FLUX 3 Klein, ≈$0.18): 12 hero scenes including the Abuja
composite, and 10 vertical card images so no card is a colour block. Provenance in
`scripts/image-registry.json` under `home-*`.

## Known gaps

1. **Dashboard 1 is not byte-identical to a previous screenshot** — it is the same
   component with no edits, but data-driven sections vary with the database.
2. Hero slides are editable via API; the Control Center shows them but has no
   inline editor UI yet.
3. No image upload for slides — admins choose from generated asset ids.
4. Region-based and interest-based assignment strategies are **not** implemented;
   only stable random assignment (the recommended default) and manual choice.
5. Design 1 has a single hero; it was preserved rather than given a carousel.
