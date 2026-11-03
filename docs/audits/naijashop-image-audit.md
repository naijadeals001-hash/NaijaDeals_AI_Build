# NaijaShop demo product image audit

Date: 2026-11-03. Catalogue: 32 demo products, 4 per department. Preview: http://localhost:3010/naijashop.

## Summary

- **Displayed products:** 32 (all flagged `isSample`, vendor "Demo Inventory (preview only)").
- **Images with complete provenance in the repository:** **13** files have credit records
  (4 under `public/products/catalog/credits.json`, 9 under `public/products/demo2/credits.json`).
- **Images lacking recorded source/licence:** **19** (7 in `public/products/demo/` with no credits file,
  6 catalog images without entries, 6 more demo2 files added after the credits file was written).
- **Accurate match cannot be certified for the whole catalogue.** Several records were renamed to fit
  the photographed object, but some photographs are not suitable product packshots.

## Known mismatches / poor fits still displayed

| Product | Image | Issue |
| --- | --- | --- |
| 5G Android Smartphone / Dual-SIM Smartphone / Android Smartphone 128GB | phone-a/b/c | Flickr editorial/street photos, not packshots |
| Electric Kettle 1.7L | demo2/kettle.jpg | photograph is dominated by a toaster reflection |
| Universal Battery Charger | demo2/charger.jpg | photograph shows charger internals, not the product |
| Copper Cookware Set | demo/cookware.jpg | museum display case, not a product shot |
| Countertop Blender 1.5L | catalog/home-better.jpg | object reads as a lamp/immersion blender, ambiguous |
| 27-inch LED Monitor | demo2/monitor-led.jpg | workstation scene rather than a monitor packshot |
| 2-Slice Toaster | demo2/toaster.jpg | acceptable but not studio packshot |

Products renamed to match their actual photo (not fixed imagery): **Vintage Desktop Computer**,
**12V Car Battery**, **Gaming PC Tower**.

## Excluded from the showcase

The 12 original branded sample records (TECNO Spark 20, Infinix Hot 40i, HP EliteBook, Dell monitor,
Ankara sneakers, Adire cushions, etc.) are archived as `DRAFT`. No authorised exact-model photographs
were found, so they are not shown rather than being illustrated with unrelated images.

## Provenance gaps

1. `public/products/demo/` has no credits file — 7 used images have no recorded source, author or licence.
2. `public/products/catalog/credits.json` covers only 4 files; home/beauty/fashion/groceries/gaming/solar
   files lack entries.
3. `public/products/demo2/credits.json` was written before 6 later files (phone-a/b/c, sunglasses-a,
   kettle, charger/solar-lamp/tomatoes/beans/shampoo/mouse additions) and does not cover them.
4. Manual Flickr downloads have URLs but no recorded creator/licence in the repository.

## Safety controls completed

- Demo checkout is blocked server-side: `POST /api/checkout` returns **409 demo_inventory** for any cart
  containing `isSample` products (verified 12/12 suite).
- Demo notice is conditional on the visible catalogue containing demo rows.
- No reviews, ratings, sales counts or verified badges were invented.

## Next required work

- Replace or exclude the 19 unprovenanced images and the phone/kettle/charger mismatches.
- Record source URL, author and licence per displayed image in one canonical manifest.
- Re-run the Playwright suite and visual screenshots afterwards.
