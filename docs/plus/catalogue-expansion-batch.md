# NaijaShop catalogue expansion batch — REVIEW

Prepared 2026-11-12 for publication through the Control Center catalogue workflow.
This document is a proposal only: **no catalogue rows were created, updated or published by this task.**

- Source repository: `C:\Users\User\Documents\naijadeals.com`
- Source HEAD: `cff0f0a498812c1307ed4892a01505eb87b78b66`
- Database: `naijadeals_review` (classification `REVIEW`, 74 applied migrations)
- Served review preview: `http://localhost:3047`, build `YS15nTxgRfMp-uylrbp_X`, REVIEW banner present
- Machine-readable companion: `docs/plus/asset-gap-manifest.json`

## 1. Independent audit results

### 1.1 Demonstration metadata

The audit inspected every `Category` and `Product` row, including inactive, draft and archived records, not only the public catalogue.

| Record | Total | ACTIVE / active | INACTIVE / draft | ARCHIVED | `isDemo=true` | `isDemo=false` | Mismatches |
|---|---:|---:|---:|---:|---:|---:|---:|
| Category | 21 | 7 active | 14 inactive | — | 21 | 0 | 0 |
| Product | 48 | 23 active | 8 draft | 17 archived | 48 | 0 | 0 |

Corroborating evidence used instead of the display name alone:

- **Categories:** 21/21 have a DEMO/Demonstration description. Name markers alone were not accepted for correction.
- **Products:** 48/48 belong to the demonstration seller `demo-catalogue-review`; 48/48 have a DEMO/Demonstration description; 47/48 also have a DEMO moderation note; 48/48 have a DEMO name marker.
- **0** demonstration records lack `isDemo=true`.
- **0** records carry `isDemo=true` without corroborating vendor, moderation-note or description evidence.

The guarded correction path was executed as an idempotency check:

```bash
DATABASE_URL=<REVIEW_DATABASE_URL> npx tsx scripts/review-demo-metadata-audit.ts \
  --expect-db=naijadeals_review --apply
```

Result: `eligible: 0`, `changed: 0`, `unchanged: 0`. The script refuses non-REVIEW databases, requires `--expect-db` for `--apply`, and changes only `isDemo` on corroborated rows whose flag is false.

### 1.2 Taxonomy and imagery

| Check | Result |
|---|---|
| Active departments | 7 |
| Active products | 23 |
| Product images | 23 |
| Product placement against the approved catalogue mapping | 0 mismatches |
| Duplicate active product names | 0 |
| Images shared across active departments | 0 |
| Local image files checked (products + departments) | 30 |
| Files missing or undecodable | 0 |
| Browser `naturalWidth > 0` (Chromium, 3047) | 30/30 |
| Product pages returning 200 with a rendered main image | 23/23 |
| Rendered product main-image alt text present | 23/23 |
| Department images rendered | 7/7 |

All 23 active product images were opened and visually reviewed during this audit; each depicts the item described by its product and alt text. The archived sunscreen remains correctly excluded because its image is a perfume bottle.

Advisories, not failures:

1. **Taxonomy alternatives:** the toaster and blender sit in Electronics & Appliances while the air fryer and coffee maker sit in Home & Kitchen; the LED monitor, keyboard, mouse, headphones and power bank could each also fit a proposed or adjacent department. Current placement is consistent with the approved seed and was not changed.
2. **Department `imageAlt`:** all 7 active departments have `imageAlt = null`. Their storefront images render with `alt=""` inside links whose visible text names the department, so this is a metadata gap rather than an inaccessible-image failure. This batch proposes backfilling the alt text for the three departments it touches; the same follow-up should cover the other four through the Control Center.

## 2. Proposed departments

| Action | Name | Slug | Sort order | Image | Image alt |
|---|---|---|---:|---|---|
| Create | Power & Solar | `power-solar` | 30 | `/generated/shop/category-power-solar.webp` | Solar panel, portable power station and power bank on a pale blue surface |
| Create | Gaming | `gaming` | 31 | `/generated/shop/category-gaming.webp` | Game controller, mechanical keyboard and headset on a dark surface |
| Update image alt | Groceries & Household Essentials | `groceries-household` | 20 | `/generated/shop/category-groceries.webp` | Basket of fresh tomatoes, peppers, leafy greens and onions |

Both new departments must be created with `isDemo=true`, `isActive=true` and the supplied DEMO description. Do not reactivate the 14 inactive workflow/probe departments in the REVIEW database.

## 3. Proposed products (8)

All prices are demonstration prices in integer kobo (`NGN`), for owner review only. They are not market quotes. No product requires a new image, and none of the eight image files is currently used by a Product or ProductImage row.

### Groceries & Household Essentials — add 3

| Product name | Slug | Price (kobo) | Image | Image alt | Asset registry |
|---|---|---:|---|---|---|
| DEMO — Red bell peppers, 500g | `demo-red-bell-peppers-500g` | 180000 | `/generated/shop/product-red-bell-pepper-500g.webp` | Demonstration product image of red bell peppers | `shop-product-red-bell-pepper-500g` |
| DEMO — Diced onions, 500g | `demo-diced-onions-500g` | 220000 | `/generated/shop/product-diced-onions-500g.webp` | Demonstration product image of diced onions | `shop-product-diced-onions-500g` |
| DEMO — Green beans, 500g | `demo-green-beans-500g` | 150000 | `/generated/shop/product-green-beans-500g.webp` | Demonstration product image of green beans | `shop-product-green-beans-500g` |

Descriptions (identical for the three):

> Demonstration listing. Representative produce image; grade, pack weight and availability are illustrative.

### Power & Solar — add 3

| Product name | Slug | Price (kobo) | Image | Image alt | Asset registry |
|---|---|---:|---|---|---|
| DEMO — Solar power inverter | `demo-solar-power-inverter` | 28500000 | `/generated/shop/product-solar-power-inverter.webp` | Demonstration product image of a solar power inverter with an LCD panel and power outlets | `shop-product-solar-power-inverter` |
| DEMO — Rooftop solar panel array with mounting frame | `demo-rooftop-solar-panel-array` | 42000000 | `/generated/shop/product-rooftop-solar-panel-array.webp` | Demonstration product image of three solar panels on a mounting frame | `shop-product-rooftop-solar-panel-array` |
| DEMO — Portable solar battery charging station | `demo-portable-solar-charging-station` | 19500000 | `/generated/shop/product-solar-battery-charging-station.webp` | Demonstration product image of a portable battery station with two fold-out solar panels | `shop-product-solar-battery-charging-station` |

Descriptions:

> **Inverter:** Demonstration listing. Representative inverter image; capacity, socket configuration and included accessories are illustrative and not a seller specification.
>
> **Panel array:** Demonstration listing. Representative solar array image; panel count and mounting configuration are illustrative and not a seller specification.
>
> **Battery station:** Demonstration listing. Representative portable battery image; capacity, ports and included panels are illustrative and not a seller specification.

### Gaming — add 2

| Product name | Slug | Price (kobo) | Image | Image alt | Asset registry |
|---|---|---:|---|---|---|
| DEMO — Wireless game controllers, black and white pair | `demo-wireless-game-controllers-pair` | 5200000 | `/generated/shop/product-ps4-and-xbox-one-controllers.webp` | Demonstration product image of two wireless game controllers, one black and one white | `shop-product-ps4-and-xbox-one-controllers` |
| DEMO — Game controller with coloured buttons | `demo-game-controller-coloured-buttons` | 2900000 | `/generated/shop/product-xbox-360-controller.webp` | Demonstration product image of a white and grey game controller with coloured action buttons | `shop-product-xbox-360-controller` |

Descriptions:

> **Controller pair:** Demonstration listing. Representative controller image; connectivity, compatibility and battery life are illustrative and not a seller specification.
>
> **Coloured-button controller:** Demonstration listing. Representative controller image; connectivity, compatibility and button layout are illustrative and not a seller specification.

The registry filenames for the two controller assets mention console families. The proposed names deliberately avoid compatibility claims because the images show generic, unbranded controllers.

## 4. Provenance and asset status

Every proposed image is an existing project asset recorded in `scripts/image-registry.json`; no image was generated, purchased or downloaded during this task.

| Registry ID | Model | Generated | Task ID | Source PNG | Served WebP | Dimensions | Review state |
|---|---|---|---|---|---|---|---|
| `shop-product-red-bell-pepper-500g` | gpt-image-2-text-to-image | 2026-11-08T23:29:28.373Z | `ba8feb3b0fe357deec67a6087c708f60` | `public/generated/shop/product-red-bell-pepper-500g.png` | `...webp` | 1024×768 | pending owner review |
| `shop-product-diced-onions-500g` | gpt-image-2-text-to-image | 2026-11-08T23:30:29.512Z | `61fe27a5390eb9d84a6faebf3b4db08b` | `public/generated/shop/product-diced-onions-500g.png` | `...webp` | 1024×1024 | pending owner review |
| `shop-product-green-beans-500g` | gpt-image-2-text-to-image | 2026-11-08T23:31:30.639Z | `1a0f8e34a4bade4d4b6a1933d6f33b8c` | `public/generated/shop/product-green-beans-500g.png` | `...webp` | 1024×1024 | pending owner review |
| `shop-product-solar-power-inverter` | gpt-image-2-text-to-image | 2026-11-08T23:32:31.756Z | `556a6b1d2fc7c8695371dca533b5595b` | `public/generated/shop/product-solar-power-inverter.png` | `...webp` | 1024×820 | pending owner review |
| `shop-product-rooftop-solar-panel-array` | gpt-image-2-text-to-image | 2026-11-08T23:34:33.916Z | `baea78f062e4938687fec6c1e559652f` | `public/generated/shop/product-rooftop-solar-panel-array.png` | `...webp` | 1024×682 | pending owner review |
| `shop-product-solar-battery-charging-station` | gpt-image-2-text-to-image | 2026-11-08T23:35:35.097Z | `d77faf6dbafaa6e61d0cadb52b259bc6` | `public/generated/shop/product-solar-battery-charging-station.png` | `...webp` | 1024×682 | pending owner review |
| `shop-product-ps4-and-xbox-one-controllers` | gpt-image-2-text-to-image | 2026-11-08T23:36:36.149Z | `025772a02ff543249f3ea69dfc20872e` | `public/generated/shop/product-ps4-and-xbox-one-controllers.png` | `...webp` | 1024×682 | pending owner review |
| `shop-product-xbox-360-controller` | gpt-image-2-text-to-image | 2026-11-08T23:39:39.921Z | `c7568d139e4acfa26f8845c216b8e857` | `public/generated/shop/product-xbox-360-controller.png` | `...webp` | 1024×682 | pending owner review |

`pending-owner-review` is the registry's actual quality-review state. This audit confirms subject accuracy and rendering; it does not grant owner approval.

## 5. Publication instructions for the Control Center agent

1. Publish only through the existing Control Center catalogue workflow. Do not insert rows directly with SQL.
2. Create `power-solar` and `gaming` first, with the exact names, slugs, descriptions, image paths, image alt text and sort orders above. Set `isDemo=true` and `isActive=true`.
3. Backfill `groceries-household.imageAlt` with the value above.
4. Create the eight products under the existing demonstration seller `demo-catalogue-review` with `status=ACTIVE`, `isDemo=true`, `isSample=false`, `saleMode=escrow`, `countryCode=NG`, the stated integer `priceKobo` and `currency=NGN`.
5. Attach exactly one image per product with the stated `imageUrl`, `imageAlt` and `sortOrder=0`. Do not reuse an image across products.
6. Leave inventory quantity to the Control Center's existing demo workflow. This batch does not claim real stock.
7. Verify `/naijashop`, each department page and each product URL on the REVIEW preview; then verify the review-only basket journey. Do not run checkout or any provider/payment action.
8. Record the resulting row ids and the preview build in the catalogue evidence/handoff maintained by the coordinator.

## 6. Missing assets

Three products are intentionally **not** proposed because no accurate approved image exists. They are recorded in `docs/plus/asset-gap-manifest.json`; nothing was generated.

| Gap id | Department | Intended product | Missing subject |
|---|---|---|---|
| `grocery-household-cleaning-supplies` | Groceries & Household Essentials | DEMO — Household cleaning supplies | Multi-surface cleaner bottle with cloth/sponge set |
| `gaming-headset` | Gaming | DEMO — Gaming headset | Over-ear gaming headset with boom microphone |
| `gaming-console` | Gaming | DEMO — Game console | Home game console with one controller |

`category-gaming.webp` contains a headset as part of a banner composition. It must not be cropped or reused as a product image.

## 7. Audit commands executed

```bash
npx tsc --noEmit --strict --skipLibCheck --esModuleInterop \
  --module esnext --moduleResolution bundler --target ES2020 \
  --lib ES2020,DOM,DOM.Iterable \
  scripts/review-demo-metadata-audit.ts scripts/review-catalogue-assets-audit.ts

DATABASE_URL=<REVIEW_DATABASE_URL> npx tsx scripts/review-demo-metadata-audit.ts \
  --expect-db=naijadeals_review
DATABASE_URL=<REVIEW_DATABASE_URL> npx tsx scripts/review-demo-metadata-audit.ts \
  --expect-db=naijadeals_review --apply
DATABASE_URL=<REVIEW_DATABASE_URL> npx tsx scripts/review-catalogue-assets-audit.ts \
  --expect-db=naijadeals_review --base-url=http://localhost:3047
```

The connection string was supplied through `DATABASE_URL` and was never printed. The audit output reports only `current_database()` and the classification marker.
