# NaijaShop demo product image audit

Date: 2026-11-03. Preview: http://localhost:3010/naijashop. Canonical manifest:
`public/products/provenance.json`.

## Displayed catalogue (post-cleanup)

**6 demo products**, 3 shelves, 0 broken images, 13/13 Playwright checks passing.

| Product | Image | Loads | Accurate match | Suitable presentation | Provenance |
| --- | --- | --- | --- | --- | --- |
| 14-inch Business Laptop | /products/catalog/computers-1.jpg | yes | yes | yes | CC BY-SA 4.0, André Karwath |
| 15.6-inch Laptop | /products/catalog/computers-2.jpg | yes | yes | yes | CC0, Mediamodifier |
| 27-inch LED Monitor | /products/demo2/monitor-led.jpg | yes | yes (monitor on desk) | acceptable, not studio packshot | CC BY-SA, hodgers |
| 2-Slice Toaster | /products/demo2/toaster.jpg | yes | yes | yes | CC BY-SA, healthserviceglasses |
| Eau de Parfum 50ml | /products/demo2/perfume.jpg | yes | yes (perfume bottles) | yes | CC BY-SA, Vetiver Aromatics |
| Perfume Gift Set | /products/demo2/perfume-set.jpg | yes | yes (perfume bottles) | yes | CC BY-SA, Vetiver Aromatics |

Counts, kept deliberately separate:

- **Image loads:** 6 / 6
- **Accurate image-to-listing match:** 6 / 6
- **Suitable product presentation:** 5 / 6 (monitor is an in-use desk scene)
- **Recorded source/author/licence:** 6 / 6

## Excluded records (preserved as DRAFT, not deleted)

**59 sample products archived**, including:

- the 12 original branded samples (Infinix, TECNO, HP, Dell, Ankara/Adire, etc.) — no authorised
  exact-model photography was available;
- every demo record whose photograph was editorial, internal, a museum display, mismatched, or whose
  reuse basis was not recorded (phones, fashion, groceries, power, gaming, kettle, charger, blender,
  cookware, keyboard, sunglasses, mouse, beans, tomatoes, rice, handbag, trainers, controller, tower,
  car battery, solar panel/lamp, face cream, clogs, shampoo).

Genuine inventory was not touched.

## Remaining gaps

1. Only Computers, Home & Kitchen and Beauty shelves remain populated. Phones, Fashion, Groceries,
   Power & Solar and Gaming are empty until suitable licensed photographs are sourced.
2. The monitor photograph is a desk scene rather than a packshot.
3. Exact branded merchandise still needs authorised manufacturer/seller media.
4. No KIE key is required for this approach; future AI imagery must remain non-branded editorial only.

## Safety controls

- `POST /api/checkout` returns **409 demo_inventory** when the cart contains demo records.
- Demo notice remains visible while demo rows are displayed.
- No reviews, ratings, discounts, sellers or verification claims were invented.

## Verification

- Playwright: **13/13** (`scripts/naijashop-e2e.mjs`).
- Desktop: `qa-artifacts/preview/final-curated-desktop.png`
- Mobile: `qa-artifacts/preview/final-curated-mobile.png`
- No broken images, no horizontal overflow, one footer, Escape closes the drawer.


## Expanded demo catalogue (2026-11-03, second pass)

**16 displayed products / 32 target (partial).** 10 new licensed demo3 photos added with
credits in `public/products/demo3/credits.json` and merged into `public/products/provenance.json`
(16 entries, one per displayed product).

### Coverage by department

| Department | Displayed | Target | Gap |
| --- | --- | --- | --- |
| Phones & Tablets | 0 | 4 | 4 |
| Computers | 4 | 4 | 0 |
| Home & Kitchen | 2 | 4 | 2 |
| Fashion | 2 | 4 | 2 |
| Beauty | 2 | 4 | 2 |
| Groceries | 3 | 4 | 1 |
| Power & Solar | 2 | 4 | 2 |
| Gaming | 1 | 4 | 3 |
| **Total** | **16** | **32** | **16** |

### Acceptance fields (kept separate)

- Images load: **16/16**
- Image accurately matches listing: **16/16**
- Suitable presentation: **14/16** — worn sneakers and desk-scene monitor photos are informative
  but not studio packshots.
- Source/author/licence recorded: **16/16**

### Monitor photograph review

The "27-inch LED Monitor" photo is an in-use desk workstation, not a neutral-background packshot.
It accurately depicts a monitor and is acceptable for development, but it does not meet the strict
"packshot on neutral background" presentation criterion. "Desktop Monitor Setup" is likewise a desk
scene. Both are documented as presentation-limited, not mismatches.

### Why 59 records are DRAFT

75 sample records total across five batches:

| Batch | Total | Active | Draft |
| --- | --- | --- | --- |
| Original branded samples | 12 | 0 | 12 |
| First demo batch (demo-) | 17 | 2 | 15 |
| seed-catalog products (sample-) | 20 | 0 | 20 |
| Second demo batch (demo2-) | 16 | 4 | 12 |
| New licensed batch (demo3-) | 10 | 10 | 0 |
| **Total** | **75** | **16** | **59** |

The earlier "65 active" figure counted 12+17+20+16; the 10 demo3 records were added afterwards.
59 = every sample record not selected for the provenanced showcase. Records are archived, not deleted.

## Remaining work

Phones, Fashion, Home, Beauty, Power and Gaming still need licensed, accurately matching photographs
to reach four each. No branded lookalikes, AI impersonations, ratings or sellers were introduced.


## Final four-per-department pass (2026-11-03)

**32 displayed products, 4 per department, 32 unique local images, 0 broken.**

| Department | Displayed |
| --- | --- |
| Phones & Tablets | 4 |
| Computers | 4 |
| Home & Kitchen | 4 |
| Fashion | 4 |
| Beauty | 4 |
| Groceries | 4 |
| Power & Solar | 4 |
| Gaming | 4 |
| **Total** | **32** |

Acceptance fields: loads 32/32; accurate image-to-listing 32/32 (names written to the photographed
object, including "Red Patent Leather Baby Shoes", "Assorted Leather Handbags" and "Apple iPhone 6
(Silver) 16GB"); suitable presentation approximately 26/32 (some in-use/editorial-style scenes);
source/author/licence recorded 32/32 in public/products/provenance.json.

Monitor review unchanged: both monitor images are desk scenes, accurate but not studio packshots.

DRAFT reconciliation after this pass: 91 sample records total = 12 branded + 17 demo1 + 20 seed-catalog
+ 16 demo2 + 10 demo3 + 8 demo4 + 8 demo5. Active 32; DRAFT 59. Nothing deleted.


## Presentation replacement pass (2026-11-03)

Six weaker photos replaced with licensed packshots, provenance updated in place:

| Listing | Replacement |
| --- | --- |
| Asics Gel-Cumulus 22 Running Shoes | Asics shoe packshot |
| Vintage Prada Leather Handbag | single handbag photo |
| Blackview A60 Android Smartphone | device/case product photo |
| EIZO Foris FG2421 Monitor | monitor test-pattern packshot |
| Mechanical Keyboard | keyboard packshot |
| PS4 and Xbox One Controllers | controller pair photo |

Specification corrections: "16GB" removed from the iPhone 6 listing (photo cannot establish storage) and
"(Refurbished)" removed from the iPhone 5s listing. Remaining specification claims are limited to what
the source title/photo supports.

Presentation now approximately 28/32; the "27-inch LED Monitor" desk scene remains the weakest.
Images load 32/32, accuracy 32/32, provenance 32/32. DRAFT remains 59 of 91 sample records.
