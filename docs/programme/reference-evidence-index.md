# Reference evidence index

Read-only index of external reference research and owner-supplied design references. It records
what was actually inspected, what was blocked, and what was never researched. It does not add
observations that are not in the repository.

## Baseline and method

| Item | Recorded value |
| --- | --- |
| Branch | `naijashop-marketplace` |
| HEAD | `7fab2a0f075f1dd179ad3617ff76bde85979aef1` |
| Date of this index | 2026-11-05 environment date. Repository documents and artifacts carry dates up to 2026-11-12; see §6. |
| Method | Read-only review of `docs/`, `qa-artifacts/`, `design-references/`, commit messages and artifact JSON. No site was visited for this index and no capture was created. |

Evidence classes used below:

| Class | Meaning |
| --- | --- |
| **Inspected — artifact** | A live public page was captured and an Evidence ID, screenshot hash or artifact file is present in the repository. |
| **Inspected — record only** | A document records that a page or calculator was inspected, but no Evidence ID or artifact is present. Treat as weaker than an artifact-backed observation. |
| **Attempted — blocked** | A capture was attempted and failed (Cloudflare, DNS, HTTP/2, target scope). Negative evidence; no behaviour is claimed. |
| **Planned only** | Named in a research plan or mockup brief but never inspected. Not evidence. |
| **Owner-supplied** | A mockup, screenshot or brand asset supplied by the owner. It is a design target, not observed competitor behaviour. |

## 1. Reference sites actually inspected

### 1.1 Amazon.com — NaijaShop

Primary records: `docs/amazon-observed-behavior.md`, `docs/rea-amazon-research.md`,
`docs/naiqashop/reference-research.md`, `qa-artifacts/rea-2026-11-09/`.

| # | Surface and URL | Date | Evidence | What was observed | Limitations |
| ---: | --- | --- | --- | --- | --- |
| 1 | Homepage `https://www.amazon.com/` | 2026-11-09 artifact timestamp; earlier 2026-11-03 capture recorded | `ev_ac74042bd5297ac263091309ca0ce83d244e59137f333002742d29b5c1a5f957` (scenario); `ev_831647bc…` 1440×900; `ev_51af77de…` 764×485; `ev_c18a56b3…` 500×749; files `qa-artifacts/rea-2026-11-09/amazon-*.png` | Header order, location control, department select, search, account/orders/cart; category strip; delivery resolved to Bronx 10470; promo content not captured in detail | Public anonymous page; US locale/USD; personalised/A-B layout; only one location |
| 2 | Search `https://www.amazon.com/s?k=wireless+earbuds` | 2026-11-09 | `ev_265d0e2f8a705c322e00eef951c8b275eade3df53f1121d78d7228d57bf72f73`; `amazon-mobile-search.png` (actual viewport 1424×805, not mobile) | Result-count window, six sorts, facet rail, cards with rating/review count, price/list price, delivery, "Add to cart" or "See options" | No post-click sort/filter state; no pagination click; filename says mobile but capture is desktop 1424×805 |
| 3 | Product `https://www.amazon.com/dp/B0C3HCD34R` | Date not recorded in the source document | `ev_8e0f08e123445378720d4472d0a18e38c6143ba71a8c5fee69a07c3bbf0fda49` | Breadcrumbs, gallery, title/brand, rating, price/list price, variant radios with per-variant price/stock, delivery panel, seller/ships-from/returns, quantity, add/Buy Now, protection plans | One product/category; no variant-switch effect recorded; no populated cart |
| 4 | Add-to-cart modal | Date not recorded in the source document | `ev_e773f780e122f9028429f5cf54de633057b3b653af3d702cee396cc8c6cb00f8` | Add-to-cart opens a protection-plan dialog; cart count stayed 0; dialog has "No thanks" / "Add protection" | Add was not completed; cart count increment not observed |
| 5 | Empty cart `https://www.amazon.com/gp/cart/view.html` (recorded as cart page) | Date not recorded in the source document | `ev_dc0fc1d64b498722452f3a25ed9faec62d5409fbe5e83ce48c66c6bf0a44affe` | Empty-cart heading, sign-in prompt, recently-viewed rail, price/availability disclosure | Populated cart, quantity edit, remove, checkout, payment and order history were not observed |
| 6 | Returns/help policy pages | 2026-11-12 doc only | No Evidence ID or artifact located in the repository | 30-day returns, free returns at many locations, refund after receipt (as summarised in `docs/naiqashop/reference-research.md`) | Documented without a capture reference; treat as a secondary summary, not an artifact-backed observation |
| 7 | Owner-supplied homepage screenshot | 2026-11-03 | `qa-artifacts/preview/amazon-reference.png` (owner capture) | Five-card carousel, four-up shelves, sign-in band, layered footer | Owner image, not an agent inspection |

Amazon `docs/amazon-observed-behavior.md` also records failed/negative attempts:
`ev_c42dc5ee…` (search strict-mode locator), `ev_35841ece…`, `ev_21b9f7ef…` and `ev_4e2acb01…`
(product page throttling). These are correctly kept as negative evidence.

Provenance note: the homepage/screenshot IDs `ev_831647bc…`, `ev_51af77de…`, `ev_c18a56b3…` and the
search ID `ev_265d0e2f…` have matching artifact JSON under `qa-artifacts/rea-2026-11-09/`. The
product, add-to-cart and cart IDs (`ev_8e0f08e1…`, `ev_e773f780…`, `ev_dc0fc1d6…`), the homepage
scenario ID `ev_ac74042b…` and the separate `wireless+headphones` search ID `ev_1fcbbc7d…` exist
only in `docs/amazon-observed-behavior.md`; the underlying Evidence objects are not present in this
repository. They are record-only evidence. An earlier 2026-11-03 pass recorded in
`docs/rea-amazon-research.md` failed to capture product detail; the later successful run is the
record above, not a contradiction.

### 1.2 Rides — Uber and Bolt

| Site and URL | Date | Evidence | What was observed | Limitations | Used by |
| --- | --- | --- | --- | --- | --- |
| Uber Nigeria ride page `https://www.uber.com/ng/en/ride/` | 2026-11-03 | Recorded in `docs/rea-module-research.md` Journey 2; no Evidence ID in that file | "Request a ride", "Ride options", "Plan for later", pickup-now/date-time cues, auto-fill location, Next, 700+ airports / 15,000+ cities claims | Class names and prices not exposed; no dispatch, pricing formula, commission, onboarding, insurance or Lagos terms | NaijaDrive landing/booking structure |
| Uber Kenya homepage and public price estimate | 2026-11-03 | `ev_f8319b3d…61a7e089`, screenshot hash `266dcd32…f4826a`; `ev_041ece60…990cba`, hash `d8aae732…ed465f` in `docs/reference-and-tooling-evidence.md` | Dark hero "Go anywhere", pickup/dropoff estimator, nav Ride/Earn/Travel/Business/Uber Eats/About | Not Nigeria-specific; no commercial terms, driver terms or city coverage | Homepage/one-primary-action comparison |
| Bolt Kenya homepage | 2026-11-03 | `ev_ef067a26…32bf4`, screenshot hash `1803f9ca…67e9ff4` | Light hero "Riding is the new driving", one primary "Get Bolt" action, service cards, minimal nav | Not Nigeria-specific; no fare, commission, payout, safety or onboarding terms | Homepage comparison |

No Uber or Bolt driver app was inspected. No Lagos fare, commission, payout, cancellation,
insurance, onboarding or safety policy is recorded. The NaijaDrive market registry correctly marks
those fields `UNVERIFIED` (`docs/nairadrive/market-registry.md` M2-M11).

### 1.3 Food — Bolt Food and Uber Eats

| Site and URL | Date | Evidence | What was observed | Limitations | Used by |
| --- | --- | --- | --- | --- | --- |
| Bolt Food Lagos `https://food.bolt.eu/en-NG/lagos/` desktop 1424×805 | 2026-11-09 | `ev_8fb0979b…` in `qa-artifacts/rea-eats/REA-EVIDENCE.md` | Utility row (Select destination, Become a Courier, Become a Partner, Get the app), green hero, "Enter your address", "Log in or sign up"; address dialog with "Enter a new address" / "Choose on map" | No restaurant list, cuisine rail, menu, cart or checkout until an address is confirmed; address autocomplete returned no suggestions | NaijaEats address-first header and utility row |
| Bolt Food Lagos mobile | 2026-11-09 | `ev_070f1157…` | Same address-gated entry on mobile | Same limitations; no authenticated flow | Mobile header |
| Uber Eats `https://www.ubereats.com/` | 2026-11-09 | `ev_97c03a87…` | Cloudflare "Just a moment…" interstitial only | No surface could be observed | Recorded as blocked |

`Chowdeck` is named as a reference product in `docs/rea-module-research.md` but no inspection,
Evidence ID or artifact is recorded. Food research is therefore **minimal**, not partial-to-complete.

### 1.4 Deliveries and Freight — uShip, Freightos, GIG Logistics

| Site and URL | Date | Evidence | What was observed | Limitations | Used by |
| --- | --- | --- | --- | --- | --- |
| uShip `https://www.uship.com/` 1424×805 | 2026-11-09 | `ev_3f96f174…ed4b7d`, artifact hash `4f4d1cd2…ee607`, in `qa-artifacts/rea-send/REA-EVIDENCE.md` | H1 "Find Shipping Companies for Large Items, Cars, Furniture, and More"; cargo category/subcategory selects; SHIP / FIND SHIPMENTS / FOR CARRIERS / FOR BUSINESS; "Secure Payments" | Desktop only; public marketing page; no booking, carrier quote, pickup evidence or settlement observed | NaijaSend two-sided marketplace and cargo-first quote |
| Freightos `https://www.freightos.com/` 1424×805 | 2026-11-09 | `ev_a6abe77b…cb9188` | H1 "The Digital Infrastructure Powering Global Freight"; instant-quote/booking/visibility sections; enterprise lead-capture form | Corporate/enterprise framing; no consumer checkout or carrier terms | Enterprise route framing only |
| GIG Logistics `https://giglogistics.com/` and `/shipping-price-calculator/` | 2026-11-03 | Recorded in `docs/rea-module-research.md` Journey 1; no Evidence ID present | Track shipment, price calculator, product families, international lanes; calculator factors distance, weight, plan, mode | Accessibility/DOM only; no price, SLA or availability fact captured; no competitor dispatch logic | First NaijaSend freight slice |
| DHL tracking `https://www.dhl.com/global-en/home/tracking.html` | 2026-11-09 | Negative: `net::ERR_HTTP2_PROTOCOL_ERROR`, `target_unavailable` in `qa-artifacts/rea-send/REA-NAVIGATION-EVIDENCE.md` | Nothing | Not inspected | Recorded as blocked |

Maersk, FedEx, Uber Freight and African logistics driver apps were not inspected. No mobile viewport
of uShip or Freightos was captured.

### 1.5 Groceries — attempted references

| Site and URL | Date | Evidence | Result | Limitation |
| --- | --- | --- | --- | --- |
| Twiga Foods `https://www.twiga.food/` | 2026-11-09 | `ev_92b7e0fd…` | DNS does not resolve (NXDOMAIN) | No catalogue, cart or checkout observed |
| ThriveAgric `https://thriveagric.com/` 1424×805 | 2026-11-09 | `ev_b211de09…` | Corporate agritech site ("Building the Largest Network of Profitable African Farmers"), corporate navigation | No category grid, produce cards, cart or checkout |
| Farmcrowdy `https://farmcrowdy.com/` | 2026-11-09 | Probed directly; no resolution | NXDOMAIN | No observation |

Instacart, Glovo and local market services are named in `docs/rea-module-research.md` but were never
inspected. NaijaFresh was built from the owner-approved mockups and existing NaijaEats patterns. The
Fresh report says this explicitly; no claim of competitor cart/checkout study is made.

### 1.6 Music — Spotify

| Site and URL | Date | Evidence | Result | Limitation |
| --- | --- | --- | --- | --- |
| `https://open.spotify.com` | 2026-11-08 | `capture_browser_scenario` Evidence `ev_3eb991b8…`, service workers allowed, in `docs/handoff.md` | Capture executed successfully; the record proves REA was operational | No findings, screenshot notes or behaviour observations were recorded. This is not behavioural research. |
| Owner-supplied NaijaStream dashboard | 2026-11-08 | `design-references/approved/NaijaStream/NaijaStream Africa Music Dashboard.png`; hash `af33235a…` recorded | Design target | Owner mockup, not an inspection |

Audiomack, Boomplay and Apple Music were named but never inspected.

## 2. Attempted and blocked references

| Site | Dates attempted | Failure | Evidence | Consequence |
| --- | --- | --- | --- | --- |
| Jumia Nigeria `https://www.jumia.com.ng/` | 2026-11-03 and 2026-11-12 | Cloudflare 403 / "Just a moment…" challenge | `qa-artifacts/jumia-nav.cjs`; `docs/handoff.md`; `docs/naiqashop/reference-research.md` | No Jumia product, search, cart, checkout or seller behaviour is claimed |
| Jiji | 2026-11-03 | Cloudflare challenge | `qa-artifacts/jiji-nav.cjs`; `docs/handoff.md` | No Jiji listing or contact-seller behaviour is claimed |
| Uber Eats | 2026-11-09 | Cloudflare | `qa-artifacts/rea-eats/REA-EVIDENCE.md` | Food reference is Bolt Food entry only |
| DHL tracking | 2026-11-09 | HTTP/2 protocol error and target scope | `qa-artifacts/rea-send/REA-NAVIGATION-EVIDENCE.md` | No DHL tracking surface observed |
| Twiga Foods | 2026-11-09 | NXDOMAIN | `qa-artifacts/rea-fresh/REA-EVIDENCE.md` | Grocery reference gone |
| Farmcrowdy | 2026-11-09 | NXDOMAIN | `qa-artifacts/rea-fresh/REA-EVIDENCE.md` | Grocery reference gone |

Negative evidence is correctly recorded as blocked rather than converted into inferred behaviour.

## 3. Planned references never inspected

These products are named in research plans, briefs or roadmaps but have **no inspection, Evidence
ID or artifact**. They must not be cited as research findings.

| Vertical | Named but not inspected | Where named |
| --- | --- | --- |
| Shop | Jumia and Jiji beyond the blocked attempts; Amazon populated cart, checkout, seller and admin surfaces | `docs/rea-module-research.md`; `docs/naiqashop/reference-research.md` |
| Rides | Uber/Bolt Lagos fare, commission, payout, onboarding, insurance and safety terms; inDrive; local/regional operators; driver apps | `docs/nairadrive/market-registry.md`; `docs/rea-module-research.md` |
| Food | Chowdeck; Uber Eats (blocked); Bolt Food menu/cart/checkout (address gate); restaurant partner screens | `docs/rea-module-research.md`; `qa-artifacts/rea-eats/REA-EVIDENCE.md` |
| Groceries | Instacart; Glovo; local market services; Twiga/Farmcrowdy dead; ThriveAgric corporate only | `docs/rea-module-research.md`; `qa-artifacts/rea-fresh/REA-EVIDENCE.md` |
| Deliveries and Freight | DHL (blocked), Maersk, FedEx, Uber Freight; carrier driver apps; African freight forwarders | `qa-artifacts/rea-send/*`; `docs/rea-module-research.md` |
| Services | Taskrabbit, Upwork, Fiverr — no inspection at all | `docs/rea-module-research.md` |
| Stays | Airbnb, Booking.com, PropertyPro — no inspection at all | `docs/rea-module-research.md` |
| Property | No reference product named or inspected | — |
| Rentals | No reference product named or inspected | — |
| Music | Audiomack, Boomplay, Apple Music; Spotify captured without findings | `docs/rea-module-research.md`; handoff 2026-11-08 |
| Wallet and Payments | OPay, PalmPay, Paystack, Flutterwave public products; merchant/payout dashboards | `docs/rea-module-research.md` |
| Affiliates | No external affiliate programme was named or inspected | `docs/affiliate/architecture.md` (implementation spec only) |
| Travel | No reference product named or inspected | `docs/rea-module-research.md` has no Travel row |
| Central Admin | No external admin/control-centre product inspected; owner mockup only | `design-references/approved/01-admin-control-center.jpg` |
| Country commerce | No country-level commerce, tax, customs, entity or consumer-law research | `docs/nairadrive/market-registry.md` covers Lagos/Abuja rides only |

## 4. Reference coverage by vertical

| Vertical | Reference state | What is proven | What is missing | Risk if treated as complete |
| --- | --- | --- | --- | --- |
| Shop — NaijaShop | **Partial, strongest** | Amazon public homepage, search, product, add-to-cart, empty cart; Amazon seller/shipping/returns disclosure; owner mockup | Jumia/Jiji blocked; populated cart, checkout, seller/admin, localisation, Nigerian delivery and returns behaviour | Medium: the public journey is grounded; seller/admin and checkout assumptions are not |
| Rides — NaijaDrive | **Partial, structural** | Uber NG page structure; Uber/Bolt Kenya homepage/estimator structure | Lagos fares, commission, payouts, onboarding, insurance, safety, cancellation terms, driver apps | High: several commercial and safety decisions remain unverified |
| Food — NaijaEats | **Minimal** | Bolt Food address-first entry and utility row; Uber Eats blocked | Menu, cart, checkout, fees, kitchen acceptance, courier flow, Chowdeck | High: behaviour beyond the header comes from mockups and existing patterns |
| Groceries — NaijaFresh | **None completed** | Owner mockups; existing NaijaEats patterns | All competitor behaviour; live farm-direct marketplace | High: no external validation exists |
| Deliveries and Freight — NaijaSend | **Partial** | uShip two-sided, cargo-first, quote-before-book; Freightos enterprise framing; GIG calculator factors | DHL/Maersk/FedEx/Uber Freight; mobile; carrier terms, SLAs, customs, claims | Medium-high |
| Services — NaijaGigs | **None** | Owner mockups only | Taskrabbit/Upwork/Fiverr discovery, escrow, milestones, disputes | High |
| Stays — NaijaStay | **None** | Owner mockups only | Airbnb/Booking.com/PropertyPro search, availability, reviews, cancellation, host tools | High |
| Property | **None** | Stay listing fields and owner mockup category | Every property sale/land journey | High |
| Rentals | **None** | Stay category label and nightly booking | Tenancy, deposit, rent schedule, landlord/agent tooling | High |
| Music — NaijaStream | **Minimal/none** | Spotify capture executed without findings; owner dashboard mockup | Audiomack/Boomplay/Apple Music; player, creator, royalty, podcast and live behaviour | High |
| Wallet and Payments — NaijaPay | **None** | Owner mockups; provider adapter code | OPay/PalmPay/Paystack/Flutterwave public flows; merchant, payout, dispute UIs | High |
| Affiliates | **None** | Implementation specification only | Any external affiliate programme, attribution, commission or payout practice | High |
| Central Admin | **None external** | Owner Control Center mockup; internal QA | Any external admin product or operator benchmark | Medium |
| Travel | **None** | Roadmap entry only | All supplier, ticketing and fare behaviour | High |
| Country commerce | **None** | NaijaDrive Lagos/Abuja market registry (rides only) | Commerce, tax, customs, entity, consumer law and payment method research | Very high |

## 5. Owner-supplied design references

These are design targets, not reference-site observations. They do not establish competitor
behaviour, market terms or parity.

| Vertical | Owner-supplied file(s) | Notes |
| --- | --- | --- |
| Control Center | `design-references/approved/01-admin-control-center.jpg` | Admin shell target |
| Ecosystem home | `02-home-super-app.jpg`, `03-home-rides.jpg` | Two homepage designs |
| NaijaDrive | `04-naijadrive-landing.jpg` | Landing target |
| NaijaShop | `05-naijashop-marketplace.jpg`, `NaijaShop/desktop-homepage.png`, `NaijaShop/mobile-homepage.png` | Desktop/mobile target |
| NaijaEats | `NaijaEats/naijaeats-desktop-approved.png` (sha256 `0b5e9401…`), `NaijaEats/naijaeats-mobile-approved.png` (sha256 `743bdb8d…`) | Recorded in handoff |
| NaijaFresh | `NaijaFresh/naijafresh-desktop-approved.png`, `naijafresh-mobile-approved.png`, `reference-market-stall.png` | Hashes in `qa-artifacts/naijafresh/FINAL-REPORT.md` |
| NaijaGigs | `NaijaGigs/naijagigs-desktop-approved.png`, `naijagigs-mobile-approved.png` plus service photography | Mockups and generated campaign images |
| NaijaPay | 18 images under `design-references/approved/NaijaPay/` (wallet, send, receive, scan, escrow, business, security, bill payments, payouts, transaction history) | Some surfaces (bills, payment links, payouts) are mockups without a corresponding live provider |
| NaijaSend | `NaijaSend/naijasend-desktop-approved.png` (sha256 `2ba06e71…`), `naijasend-mobile-approved.png` (sha256 `0a1a4fca…`) | Hashes in `qa-artifacts/naijafresh/SEND-FINAL-REPORT.md` |
| NaijaStay | `NaijaStay/naijastay-desktop-approved.png`, `naijastay-mobile-approved.png` | Mockup targets |
| NaijaStream | `NaijaStream/NaijaStream Africa Music Dashboard.png` (hash `af33235a…`) | Desktop target |
| Aura AI | `AuraAI/aura-desktop-dark.png`, `aura-mobile-dark.png`, `aura-hero-reference.png`, `aura-orb-reference.png` | Visual acceptance still outstanding |

## 6. Date and provenance issues

1. The environment date is 2026-11-05. Repository documents contain entries dated 2026-11-08 through
   2026-11-12, and artifact files carry 2026-11-09 timestamps. The index records the dates as they
   appear, but the programme cannot treat them as a chronological audit trail until the clock and
   document order are reconciled.
2. `docs/naiqashop/reference-research.md` is headed 2026-11-12. Its Amazon observations align with
   `docs/amazon-observed-behavior.md`, which records separate capture runs and a 2026-11-09 artifact
   set, but the 2026-11-12 file cites no Evidence IDs itself.
3. `docs/rea-module-research.md` lists reference products and "Coverage shown" per module. Several
   rows were written before the sites were inspected (or before an attempt failed). Its status
   column is a plan, not an evidence register.
4. `docs/ecosystem-delivery-tracker.md` cites owner screenshots in
   `C:\Users\User\Documents\Uber and Bolt` and module statuses from 2026-11-02. That folder is outside
   the repository and is not independently verifiable here.
5. `docs/nairadrive/market-registry.md` is the only market registry. It covers Lagos and Abuja rides
   only. It explicitly states that no country is live and that competitor commercial terms are
   unverified; no equivalent registry exists for Shop, Food, Fresh, Gigs, Stay, Stream, Pay or
   Affiliates.

## 7. Verticals with no completed research and no evidence

The following have **no artifact-backed reference research** in this repository:

1. **Services (NaijaGigs)** — no external site inspected.
2. **Stays (NaijaStay)** — no external site inspected.
3. **Music (NaijaStream)** — one Spotify capture with no findings; no other site inspected.
4. **Wallet and Payments (NaijaPay)** — no public product inspection; provider adapters only.
5. **Airtime credit** — no reference, policy or product research.
6. **Affiliates** — no external programme research.
7. **Travel** — no reference, supplier or product research.
8. **Property** — no sales/land transaction research.
9. **Rentals** — no tenancy research.
10. **Central Admin** — no external admin product inspection; owner mockup only.
11. **Country commerce** — no country-level commerce, currency, tax, customs, entity or legal research.

The following have **partial or minimal** research only, and should not be described as reference-verified:

- **Shop** — Amazon public journey only; Jumia/Jiji blocked; no populated checkout or seller/admin.
- **Rides** — structure only; no Lagos commercial, onboarding, safety or payout terms.
- **Food** — Bolt Food entry gate only; Uber Eats blocked; Chowdeck not inspected.
- **Groceries** — all named references dead, corporate or uninspected.
- **Deliveries and Freight** — three public pages; no carrier operations, mobile or Africa-specific terms.

No reference research supports a claim of "live parity" for any vertical. The correct statement is
that Amazon's public shopping journey informed NaijaShop's structure, and that uShip/Freightos/GIG
informed NaijaSend's marketplace interaction pattern; everything else is owner-mockup-led.
