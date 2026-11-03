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
