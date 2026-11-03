# Design direction (2026-11-03)

This records the visual direction now applied to the NaijaDeals homepage and the rules that
govern the rest of the ecosystem. It is derived from the project's own specification, not invented:

- `docs/NaijaDeals_Phased_Build_Playbook.md` §2 (homepage), §4 (Control Center), §14 (assets),
  §15 (design system), and the "Uber + Bolt experience" section of V3.
- `docs/stitch-design-inventory.md`: palette (canvas white, near-black ink, commerce green
  `#006d38`, live green `#00a859`, amber trust `#F59E0B`), Inter + Plus Jakarta Sans, sticky top
  bar / desktop rail / mobile bottom navigation, verified badges, rails, trust and escrow strips.
- `docs/stitch-conversion-worklist.md`: screen-by-screen component blueprint.
- REA captures of Uber Kenya, the Uber public price estimate and Bolt Kenya (2026-11-03), used for
  observable layout patterns only — no competitor assets or code are copied.
- `design-references/admin/naijadeals-control-center-master.png` for the Control Center.

## Principles

1. **One primary action per screen.** Location-first hero, unified search, then service entry.
2. **Editorial hierarchy.** Oversized Plus Jakarta display type, a single accent, generous
   whitespace, restrained borders — no template card soup.
3. **Honest status is part of the design.** Live / Setup required badges come from the vertical
   catalogue; no invented metrics or fake balances.
4. **One ecosystem.** Every module shares the same shell, tokens and status language; each keeps
   its own imagery and accent.
5. **Mobile-first.** 390 px layouts are designed, not squeezed: stacked hero, scrollable module
   rail, bottom navigation, large tap targets.

## Implemented in this slice (homepage)

| Section | What changed |
| --- | --- |
| Hero | Full-bleed editorial image, cinematic multi-stop gradient, location + currency + live-count badges, 4.1rem display headline, glass search, quick chips (Shop/Drive/Pay), trust micro-row |
| Ecosystem pulse | Compact strip with honest live/setup counts and a scrollable rail of all ten modules |
| Service grid | Asymmetric bento: NaijaShop and NaijaDrive as large image-led feature cards; the remaining eight as compact cards with status, icon and description |
| Wallet band | Dark "One wallet" band with an abstract NaijaPay card (labels only — no fake balance), escrow/delivery/verified chips and direct CTAs |
| Trust and partner | Refined trust tiles and a partner band with depth/glow, unchanged copy and links |
| Routing | `/drive` now redirects to the real ride experience at `/naijadrive` |

No new dependencies, no new i18n strings, and the existing shell markers (viewport, skip link,
primary navigation) are preserved so the regression suite still finds them.

## Evidence

- Desktop 1440×1100 and mobile 390×844 captures:
  `qa-artifacts/preview/final-redesign-desktop.png`, `final-redesign-mobile.png`,
  `final-redesign-mobile-full.png`, `final-redesign-tablet.png` (Git-ignored).
- Browser checks: HTTP 200, zero console errors, 11 images loaded, `/naijashop`, `/naijadrive`,
  `/wallet`, `/products` all 200.

## Next design increments

1. Shell and navigation polish (top bar density, rail active states, mobile tab clarity).
2. NaijaShop listing/detail surfaces against the Stitch product grid and the price/verified-trust
   language.
3. NaijaDrive booking flow: map-first fare estimate, vehicle cards, fare breakdown.
4. Control Center density pass against the master reference (compact KPIs, module tabs).
5. Accessibility pass (02A–02D): contrast, focus order, screen-reader labels.

## NaijaShop marketplace floor (2026-11-03)

Reference: **REA capture of `https://www.amazon.com/s?k=wireless+headphones`**, Evidence
`ev_92440282acbf0ec7aab1b4d0bf4a00d6d9656607192d0d3a727f010b864bb9fd` (1,3062 DOM nodes,
5,586 accessibility nodes), plus the existing `docs/amazon-observed-behavior.md` REA record for
homepage, product page and cart. Screenshot kept outside Git at
`~/rea-artifacts/amazon-search.png` (SHA-256 `d12f2c40…`).

Observed patterns reproduced with original NaijaDeals code, copy and data:

| Amazon pattern | NaijaDeals implementation |
| --- | --- |
| Utility header: deliver-to → department select → search → account → returns/orders → cart | Dark marketplace bar with "Deliver to Lagos, Nigeria", category scope, search form, Account & Lists, Returns & Orders, Cart |
| Department strip under the header | Scrollable department chips bound to real categories |
| Results count + sort control | "Showing 1–12 of N results", sort by Featured / price asc / price desc / review |
| Left filter rail (department, price, reviews, availability) | Real counts per category, four computed NGN price bands, rating floor, in-stock toggle; collapsible on mobile via a Filters button |
| Result cards: image, title, stars + count, price, strike list price, discount badge, stock, seller, buy action | Amazon-shaped card with square product image, stars, review count, discount %, "Only N left", seller, yellow Add to cart / See options |
| Pagination | 12-per-page Previous/Next with an aria-live page label |

Honesty rules kept: no fabricated review counts (products without reviews read "No reviews yet"),
no invented delivery promises, no fake deals — discounts only render when a real
`compareAtKobo` exceeds the price.

Verified: 12 cards / 9 add buttons / 3 variant cards, axe-core **0 violations**, 390 px layout has
no overflow and the filter panel toggles, anonymous add-to-cart returns the real 401 path with a
"Sign in to add items" alert (`qa-artifacts/preview/shop-amazon-*.png`).

## Catalogue provenance (2026-11-03)

The seed catalogue (12 items, generated SVG artwork, fixture vendors) is **not** real inventory.
To stop it being presented as real seller listings:

- `Product.isSample` (migration `20261103120000_product_sample_flag`, default false) marks
  fixture rows; `prisma/seed.cjs` sets it for every seeded product.
- `/api/products` and `/api/products/[id]` return the flag; the running dev server also falls
  back to vendor+image provenance while its Prisma client predates the column.
- `/naijashop` shows **only genuine seller listings by default**. With none in the dev database it
  renders an honest empty state ("No live seller listings yet") with a Sell CTA and an explicit
  **View sample catalogue (demo)** button. Samples then appear behind a banner, carry a "Sample"
  badge, and the product-detail page repeats the warning.
- Search result cards and the shared `ProductCard` carry the same badge.
- A real listing is a product published by a verified seller from `/seller`; nothing is invented
  on the storefront.

Verified: default storefront 0 cards + empty state; demo toggle 12 labelled cards; detail banner
present; axe-core 0 violations in both states; 390 px layout has no overflow.


## Approved reference mockups (2026-11-03)

The project owner supplied five target mockups; they are stored under
`design-references/approved/` (JPEG, ~180 KB each) and are the visual north star for the
customer super-app, NaijaDrive and NaijaShop.

| File | SHA-256 prefix |
| --- | --- |
| `01-admin-control-center.jpg` | `48958321e2cf3719…` |
| `02-home-super-app.jpg` | `112056a5741ca688…` |
| `03-home-rides.jpg` | `409c982c9a2ea45f…` |
| `04-naijadrive-landing.jpg` | `8ec47c5438432427…` |
| `05-naijashop-marketplace.jpg` | `5045af6dd0246db6…` |

| Reference | What it shows | Adoption status |
| --- | --- | --- |
| `01-admin-control-center.jpg` | Dense Control Center: module switcher tiles, NaijaDrive admin header with city + Live Operations pill, KPI row, Live Operations Map + Active Trips, service performance, revenue trend, driver donut, ecosystem health/summary, future modules, activity/alerts/quick actions | Mostly implemented (same component families, region filter, real tables). Gaps: live map provider, populated active-trip list, 4-state driver presence, uptime metric |
| `02-home-super-app.jpg` | Dark navy/green hero with large photography, Ride/Eat/Shop/Stay/Send/Gigs tab bar, pickup/destination fields, service tile rail, trust strip, app-store badges | Hero, search, service tiles and trust strip implemented. The tabbed location panel and app-store badges are **not** copied: no native apps are shipped, and the playbook forbids implying they are |
| `03-home-rides.jpg` | Variant homepage: ecosystem nav, "Ride. Eat. Shop. Stay. Pay. Stream. All in One." hero with phone, download badges, arrowed service tiles, four-part trust strip | Copy and claims adapted; visual language (green/navy, photography, tile rail) already reflected in the current homepage |
| `04-naijadrive-landing.jpg` | Ride landing: "Request a ride, get around Nigeria", Ride/Bike/Package/Schedule tabs, pickup + destination inputs, Find a Ride CTA, service strip | **Landed (2026-11-03):** photographic hero with the ride headline, a service tab bar (Ride active; Package links to the delivery workflow; Bike and Schedule visibly disabled with a truthful "not available yet" note), then the live pickup/drop-off, vehicle, fare and CTA flow. Bike and scheduled rides remain unimplemented by design |
| `05-naijashop-marketplace.jpg` | Amazon-style storefront: brand header with deliver-to/search/account/cart, department nav, hero deal banner, category icon grid, Today's Deals / Bestsellers / New Arrivals trio, deals-by-category rail | Implemented today: brand bar, department chips, category icon rail, red/amber/green promo trio wired to real data, filters and result cards |

Rules applied when adopting the mockups: no app-store badges (nothing shipped there), no
"54 countries operational" claims (only six configured countries, four African), no competitor
assets, and every count shown is computed from the database.


## Homepage service switcher (2026-11-03)

Reference 02/03's tab bar is now implemented in the hero: six service chips (NaijaShop, NaijaDrive,
NaijaEats, NaijaStay, NaijaSend, NaijaGigs) with icons and `aria-pressed` state. The active chip
drives the hero action — NaijaShop keeps the marketplace search form; every other selection swaps it
for a module card (name, real description, status) with an "Open" link to that module. Switching back
restores the search. Verified: 6 tabs, form ⇄ CTA swap works, axe 0, no mobile overflow
(`qa-artifacts/preview/home-service-tabs-*.png`).


## Owner-supplied brand artwork (2026-11-03)

Eight brand illustrations were supplied by the project owner (AI-generated, delivered as PNG,
converted to 1280-wide JPEG q82 under `public/brand-photography/`). They are used **only** as
module/brand artwork — never as product listings, real customers, drivers, artists or property
records. Alt text and data comments mark them as illustrations.

| Asset | Size | SHA-256 prefix |
| --- | --- | --- |
| `aura-concierge-lagos.jpg` | 186 KB | `19ba91eb8cf6…` |
| `aura-orb-lagos.jpg` | 141 KB | `ef8c394f4b62…` |
| `drive-sedan-lagos.jpg` | 232 KB | `1b0a4c753d7e…` |
| `drive-suv-lagos.jpg` | 254 KB | `6957e3ff5e44…` |
| `stay-courtyard-villa.jpg` | 264 KB | `35b842e909ba…` |
| `stay-waterfront-apartment.jpg` | 223 KB | `dbb9382ebf5a…` |
| `stream-rooftop-lagos.jpg` | 160 KB | `4997a9d7d160…` |
| `stream-studio-lagos.jpg` | 159 KB | `712923a852bc…` |

Usage map: NaijaDrive hero (sedan) and ecosystem card (SUV); NaijaStay module page (waterfront
apartment + courtyard villa); NaijaStream module page (studio + rooftop listener); Aura AI module
page (concierge + orb). Verified in Chrome: all eight load with `naturalWidth > 0`, no 404s and
axe 0 on the module pages.


## Homepage redesign (2026-11-03)

Following owner feedback that the homepage did not meet the reference standard, the page is now a
full-bleed storefront:

- The ecosystem sidebar is suppressed on `/` only; the header gains a module sub-nav row
  (NaijaShop, NaijaEats, NaijaFresh, NaijaDrive, NaijaSend, NaijaGigs, NaijaStay, NaijaStream,
  NaijaPay, Aura AI).
- Hero uses the owner-supplied NaijaDrive sedan artwork as a cinematic full-bleed image with a
  left-weighted gradient, a single service-chip row, the marketplace search, and two primary CTAs
  (Explore products, NaijaDrive).
- A ten-tile module rail sits directly beneath the hero with icon, label, working status and arrow.
- The redundant status-pill strip was removed.

Verified at 1440 and 390: no sidebar on the homepage, hero image loads, rail has 10 links, no
horizontal overflow, axe 0, no console errors (`qa-artifacts/preview/home-redesign-*.png`).


**NaijaSend artwork (2026-11-03):** the owner supplied an airport cargo-hub illustration with a
branded NaijaSend truck. It is stored as `public/brand-photography/send-airport-logistics.jpg`
(1280-wide JPEG) and drives both the NaijaSend ecosystem card and a new landing hero, followed by
three honest capability cards (recorded events, escrow release, Lagos coverage) and a status card
stating that external carrier integrations are not configured.


**NaijaEats artwork (2026-11-03):** the supplied NaijaEats delivery graphic is cropped past its
baked-in marketing text and stored as `public/brand-photography/eats-jollof-delivery.jpg`
(1280-wide). It drives the NaijaEats ecosystem card and a split landing hero with honest copy:
ordering stays disabled until restaurant credentials, menus and dispatch partners are connected.
Three capability cards and a setup-status card follow.


**NaijaFresh artwork (2026-11-03):** the supplied market-groceries graphic is cropped past its
baked-in "Order fresh groceries" panel and stored as
`public/brand-photography/fresh-market-groceries.jpg`. It drives the NaijaFresh ecosystem card and
a new split landing hero on `/naijafresh`, with three capability cards and an honest setup-status
card (ordering disabled until market vendors, catalogue and delivery slots are connected).


## REA reference research — mobility super-app landing (2026-11-03)

To ground the landing redesign in the reference apps instead of taste, REA's CDP provider inspected
a live mobility super-app landing:

- Provider: `rea-cdp-browser` v2, Chrome 156 headless, target `https://bolt.eu/en-ng/`
- Evidence: `ev_d34fa5ed…e64` (target list) and `ev_77ddd6bc…32` (page inspection)
- Captured sections (accessibility tree, names only): hero "Riding is the new driving"; "Our services";
  "Meet Bolt 7"; "Bolt is the first European mobility super-app."; "Earn money with Bolt" with Drive /
  delivery / sales / fleet paths; "Bolt Send"; "Download our apps"; "News and updates".
- Primary actions observed: Start riding, Earn with Bolt, Register to drive / courier / Bolt Food /
  fleet, Send items, View all.
- Limitations recorded by REA: DOM and accessibility text are policy-filtered unless explicitly
  requested; script/resource capture is origin-restricted; no pixel or layout-metric evidence.

Translation into this build: every vertical landing uses one shared structure —
**hero (badge, headline, description, proof chips, two CTAs, primary image + secondary thumbnail) →
capability grid → earn/partner band → honest setup status** — matching the reference's
hero → services → earn → download/news rhythm without copying its claims or assets.

Applied so far: NaijaStay, NaijaStream, Aura AI, NaijaGigs (new), with NaijaEats, NaijaFresh and
NaijaSend following the same pattern. NaijaDrive keeps its reference-04 hero; NaijaShop keeps the
Amazon-derived storefront.


**Homepage hero simplification (2026-11-03, owner feedback):** the service-chip row inside the hero
was removed. It duplicated the module rail directly beneath the hero, introduced a horizontal
scrollbar at narrow widths, and added a second switcher to a search-first hero. The hero now reads
badges → headline → description → search → two CTAs → trust row, with navigation handled by the
header sub-nav and the ten-tile module rail.


**Full-bleed blended heroes (2026-11-03, owner feedback):** every vertical landing now uses one
full-bleed photograph blended into the dark surface with a left-weighted gradient — matching the
NaijaDrive header — instead of the earlier split panel with a floating secondary thumbnail. The
shared `ModuleLanding` drives NaijaStay, NaijaStream, Aura AI, NaijaGigs, NaijaEats, NaijaFresh and
NaijaSend; each page now has exactly one hero image.


## Module landing inventory (2026-11-03)

Every ecosystem module now has a landing surface; the shared `ModuleLanding` supplies the
full-bleed blended hero, capability cards, optional partner band and honest setup card.

| Module | Route | State |
| --- | --- | --- |
| NaijaShop | `/naijashop` | Live storefront (Amazon-derived layout) |
| NaijaDrive | `/naijadrive` | Live booking page with reference-04 hero |
| NaijaEats | `/naijaeats` | Landing, ordering disabled until kitchens connect |
| NaijaFresh | `/naijafresh` | Landing, ordering disabled until market vendors connect |
| NaijaSend | `/naijasend` | Landing, manual courier workflow live |
| NaijaGigs | `/naijagigs` | Landing, booking disabled until dispatch connects |
| NaijaStay | `/naijastay` | Landing, booking disabled until properties/calendars connect |
| NaijaStream | `/naijastream` | Landing, playback disabled until licensing connects |
| Aura AI | `/aura-ai` | Landing, assistant disabled until a model provider connects |
| NaijaPay | `/naijapay` | Landing with "Open NaijaPay" → functional `/wallet` |

Ecosystem cards and the header sub-nav point at these landing routes; functional apps remain at
`/wallet`, `/orders`, etc.
