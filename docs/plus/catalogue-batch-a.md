# NaijaShop catalogue batch A — REVIEW

Executed 2026-11-13 against the canonical REVIEW preview.

- Repository: `C:\Users\User\Documents\naijadeals.com`
- Source HEAD: `ba30771`
- Preview: `http://localhost:3047`, build hint `0DLHlGYoId2XSLKSwcsLZ`
- Database: REVIEW (task-assigned; all reads and writes went through the preview's Control Center API, not direct SQL)
- Publication path: existing `POST /api/admin/catalogue/products` → `validate` → `publish`
- Script: `scripts/review-catalogue-batch-a.cjs`
- Evidence output: `qa-artifacts/review-basket/catalogue-batch-a.json` (the file now reflects the idempotency re-run; creation-run details are recorded below)

No application code, schema, migration, payment service or historical record was changed. No image was generated, no provider was charged and nothing was deployed or pushed.

## 1. Result

| Measure | Before | After |
|---|---:|---:|
| Active departments | 9 | 9 |
| Active products | 31 | 37 |
| New products created and published | — | 6 |
| Non-ACTIVE batch rows | — | 0 |
| Duplicate slugs or reused batch images | — | 0 |

All six rows are `ACTIVE`, `isDemo=true`, `countryCode=NG`, currency `NGN`, stock quantity `25` with `0` reserved, and carry the demonstration moderation note `DEMO — demonstration inventory, not live supply`.

## 2. Created products

| # | Product id | Name | Slug | Department | Price (kobo) | Price (NGN) | Image | Image alt |
|---:|---|---|---|---|---:|---:|---|---|
| 1 | `cmwf0qnp3006sv4awq7ihsyt4` | DEMO — Apple iPhone 5s, gold | `demo-apple-iphone-5s` | Phones & Tablets | 5500000 | ₦55,000 | `/generated/shop/product-apple-iphone-5s.webp` | Gold Apple iPhone 5s smartphone with a 4-inch screen and circular Home button |
| 2 | `cmwf0qnqf0076v4awuzap37j6` | DEMO — Apple iPhone 6, silver | `demo-apple-iphone-6-silver` | Phones & Tablets | 7200000 | ₦72,000 | `/generated/shop/product-apple-iphone-6-silver.webp` | Silver Apple iPhone 6 smartphone with a black bezel showing a blue gradient wallpaper |
| 3 | `cmwf0qnro007kv4aw1n6mals8` | DEMO — EIZO FORIS FG2421 gaming monitor, 24-inch | `demo-eizo-foris-fg2421-monitor` | Computers | 38500000 | ₦385,000 | `/generated/shop/product-eizo-foris-fg2421-monitor.webp` | Black EIZO FORIS FG2421 monitor with a thin bezel, purple gradient on screen and height-adjustable stand |
| 4 | `cmwf0qnsr007yv4aw6ym23yet` | DEMO — Digital SLR camera with zoom lens | `demo-digital-slr-camera-with-zoom-lens` | Electronics & Appliances | 65000000 | ₦650,000 | `/generated/shop/product-digital-camera-dslr.webp` | Black digital SLR camera with a zoom lens, optical viewfinder and top mode dial |
| 5 | `cmwf0qnto008cv4awngcofj2x` | DEMO — Smartwatch with black silicone strap | `demo-smartwatch-black-silicone-strap` | Electronics & Appliances | 8500000 | ₦85,000 | `/generated/shop/product-smartwatch.webp` | Black unbranded smartwatch with a square display and black silicone strap |
| 6 | `cmwf0qnum008qv4awn6sdh85d` | DEMO — Red patent leather baby shoes | `demo-red-patent-leather-baby-shoes` | Fashion & Accessories | 1850000 | ₦18,500 | `/generated/shop/product-red-patent-leather-baby-shoes.webp` | Pair of red patent leather baby shoes with hook-and-loop straps and pale soles |

Descriptions deliberately frame every specification as illustrative. The two phones are labelled older models and explicitly do not claim current stock, condition, storage capacity, battery health or network compatibility. No reviews, sales, discounts, compare-at prices or real-supply claims were added.

## 3. Provenance

All six files are existing project assets recorded in `scripts/image-registry.json`. Each was inspected visually before publication, confirmed to decode as WebP, and confirmed unused by any other product before the run. No generation or image spend occurred in this task.

| Asset | Registry ID | Used by | Model / size | Task ID | Generated (UTC) | Dimensions | Review state |
|---|---|---|---|---|---:|---:|---|
| `/generated/shop/product-apple-iphone-5s.webp` | `shop-product-apple-iphone-5s` | `demo-apple-iphone-5s` | gpt-image-2-text-to-image / 1K | `39911fa031597fcc79378897e4a72240` | 2026-11-08T23:09:06.028Z | 1024×1024 | pending-owner-review |
| `/generated/shop/product-apple-iphone-6-silver.webp` | `shop-product-apple-iphone-6-silver` | `demo-apple-iphone-6-silver` | gpt-image-2-text-to-image / 1K | `db63fec83b885b2cb72c907e618d3c3a` | 2026-11-08T23:05:47.357Z | 1024×1366 | pending-owner-review |
| `/generated/shop/product-eizo-foris-fg2421-monitor.webp` | `shop-product-eizo-foris-fg2421-monitor` | `demo-eizo-foris-fg2421-monitor` | gpt-image-2-text-to-image / 1K | `c594689b08d60a23606073e4f5f48227` | 2026-11-08T23:15:27.545Z | 1024×1120 | pending-owner-review |
| `/generated/shop/product-digital-camera-dslr.webp` | `shop-product-digital-camera-dslr` | `demo-digital-slr-camera-with-zoom-lens` | gpt-image-2-text-to-image / 1K | `2266ffb39fa647e997a5d067a62404f3` | 2026-11-08T23:47:22.703Z | 1024×768 | pending-owner-review |
| `/generated/shop/product-smartwatch.webp` | `shop-product-smartwatch` | `demo-smartwatch-black-silicone-strap` | gpt-image-2-text-to-image / 1K | `e316d6fb0d776ec3b004c93f9878a850` | 2026-11-08T23:48:23.818Z | 1024×682 | pending-owner-review |
| `/generated/shop/product-red-patent-leather-baby-shoes.webp` | `shop-product-red-patent-leather-baby-shoes` | `demo-red-patent-leather-baby-shoes` | gpt-image-2-text-to-image / 1K | `60b9333bad64806cbe0903af5c04feec` | 2026-11-08T23:21:19.038Z | 1024×1120 | pending-owner-review |

Cost status: the registry records `creditsConsumed: 6` and `costUsd: 0.03` per historical generation. Those are generation-time records, not charges made by this batch.

Permissions and provenance: the registry classifies each file as an AI-generated product illustration produced through Kie.ai GPT Image 2. They are not photographs of the listed real-world product. Registry prompts, verbatim:

- **iPhone 5s:** Front view of a compact gold smartphone with a 4-inch screen, a round home button and sharp aluminium edges, screen off. clean seamless soft-grey studio product photography, even diffused lighting, subtle reflection, no text, no watermark, no logo, no people
- **iPhone 6 silver:** Front view of a slim silver aluminium smartphone with a 4.7-inch screen and rounded corners, screen on showing a plain blue gradient wallpaper, standing upright. clean seamless soft-grey studio product photography, even diffused lighting, subtle reflection, no text, no watermark, no logo, no people
- **EIZO FORIS FG2421:** A 24-inch gaming monitor with a thin black bezel and adjustable stand on a matte black desk, screen showing an abstract purple gradient. clean seamless soft-grey studio product photography, even diffused lighting, subtle reflection, no text, no watermark, no logo, no people
- **Digital SLR:** A black APS-C DSLR camera with a fixed zoom lens, generic unbranded design, three-quarter view. clean seamless soft-grey studio product photography, even diffused lighting, subtle reflection, no text, no watermark, no logo, no people
- **Smartwatch:** A modern smartwatch with a black silicone strap and a square screen showing a simple clock face, generic unbranded. clean seamless soft-grey studio product photography, even diffused lighting, no text, no watermark, no logo, no people
- **Baby shoes:** A pair of small red patent-leather baby shoes with soft soles and a velcro strap, side by side, delicate scale. clean seamless soft-grey studio product photography, even diffused lighting, subtle reflection, no text, no watermark, no logo, no people

Only brands explicitly present in the approved asset identity were used: Apple (iPhone 5s / iPhone 6) and EIZO (FORIS FG2421). The camera and smartwatch remain unbranded because the images show generic unbranded products.

## 4. Verification executed

| Command | Result |
|---|---|
| `node --check scripts/review-catalogue-batch-a.cjs` | Syntax OK |
| `node scripts/review-catalogue-batch-a.cjs` (creation run) | Exit 0 · 166/166 checks pass · 6 created and published · active products 31 → 37 |
| `node scripts/review-catalogue-batch-a.cjs` (idempotency re-run) | Exit 0 · 160/160 checks pass · all 6 rows skipped as existing ACTIVE · active products 37 → 37 · no new ids |
| `curl /product/<slug>` for all six | HTTP 200 for all six |
| `curl /api/products?q=<term>&category=<dept>` for all six | HTTP 200, each row found with `total=1`, correct image URL, exact alt text, `isDemo=true`, stock 25 |
| `curl /naijashop/c/<department>` for all four departments | HTTP 200 for all four |
| Category API totals after the batch | Phones & Tablets 6 · Computers 5 · Electronics & Appliances 6 · Fashion & Accessories 4 |
| Asset HTTP checks | All six assets HTTP 200 with `Content-Type: image/webp` |
| Chromium 1440×1000 renders | Product image `naturalWidth > 0` with exact image alt; department card and search card images loaded and visible; no page errors |

The script verifies each product on four surfaces: the admin catalogue row, the direct public product page HTML, the public search/category API, and real Chromium renders of the product page, department page and Shop search page.

An earlier re-run attempt hit one transient Chromium `ERR_ABORTED` while navigating to a department page. The script was hardened with bounded document-navigation retries and per-surface failure isolation, then re-run successfully (160/160). No product was created twice.

## 5. Mismatches and follow-ups

1. **Stale repository baseline constants.** The live REVIEW baseline is now 9 active departments / 37 active products. `scripts/review-catalogue-workflow.cjs` still expects 9/31 (`EXPANDED_BASELINE`), and `docs/handoff.md` plus `docs/programme/completion-matrix.md` still record 31. Those files are outside this batch's ownership, so they were not edited. Their owners must update them before the catalogue workflow is used as a baseline gate.
2. **Registry review state.** All six assets remain `pending-owner-review` in the image registry. Publication confirms subject accuracy and rendering; it does not grant owner approval.
3. **iPhone 6 render.** The generated silver phone has an all-screen look without a visible circular Home button. The title and description therefore avoid claiming a Home button and describe only the visible finish, display and body. The asset is an illustration, not a photograph of a real device.
4. **Card alt text by design.** Department and search cards use the product name as their `img alt` (`components/shop/product-card.tsx`), while the product detail page uses the stored image alt. Both were verified; this is not a defect.
5. **Evidence file timing.** `qa-artifacts/review-basket/catalogue-batch-a.json` now holds the idempotency re-run output. The creation run's actions and ids are recorded in section 2 and in the executed-command results above.
