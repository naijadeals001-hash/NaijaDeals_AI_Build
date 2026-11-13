# Taxonomy coverage and product-leaf mapping — 2026-11-13

REVIEW target: `naijadeals_review` (`DatabaseClassification` = REVIEW). The reviewed
plan has been applied with audited `Product.categoryId` writes. Current numbers are
computed by `scripts/taxonomy-coverage-report.ts`; the plan and taxonomy source remain
`docs/taxonomy/product-leaf-mapping.json` and `lib/data/taxonomy.ts`. This document
records the applied state and the remaining gaps, not a future-only plan.

The 16 example areas used to size this taxonomy are illustrative coverage targets, **not
the full requested marketplace scope**. Additional departments, leaves, country rules and
listing types require a separately authorised slice.

## 1. Extended taxonomy (seeded and verified)

161 nodes: **11 departments / 37 active categories / 113 selectable subcategories**.
The original 73 nodes (5 departments, 17 categories, 51 subcategories) keep their keys
and ids. The nine existing active catalogue categories keep their ids, slugs, names,
images, `isDemo` flag and demo descriptions.

| Department | Key | Level-1 categories | Selectable leaves | NG-blocked leaves |
|---|---|---|---|---|
| Electronics & Technology | `electronics` | 4 | 12 | 0 |
| Home & Living | `home` | 3 | 9 | 0 |
| Fashion & Beauty | `fashion` | 4 | 11 | 0 |
| Food & Everyday Essentials | `food` | 3 | 9 | 0 |
| Agriculture & Business | `agriculture` | 3 | 11 | 3 |
| Health & Wellness | `health-wellness` | 3 | 6 | 5 |
| Baby, Kids & Toys | `baby-kids-toys` | 3 | 11 | 2 |
| Sports & Outdoors | `sports-outdoors` | 4 | 10 | 0 |
| Automotive & Motorcycle | `automotive-motorcycle` | 3 | 13 | 6 |
| Tools & Building Materials | `tools-building` | 4 | 11 | 1 |
| Books & Stationery | `books-stationery` | 3 | 10 | 0 |
| **Total** | 11 | **37** | **113** | **17** |

Added nodes: 6 departments + 20 categories + 62 subcategories = 88 new nodes.
Vocabulary seeded: 969 aliases (`en`/`fr`/`pt`/`ar`/`sw`), 353 attributes and 18 country
rules. Wholesale stays a purchasing mode (`allowedListingTypes` + minimum-order
attributes); origin, material, style and technique stay attributes, not departments.
Children's clothing and footwear stay under Fashion & Accessories to avoid duplicate
leaves; school textbooks sit under Books & Stationery.

The six added departments currently have no approved department image (`imageUrl` null).
The storefront falls back to a neutral tile rather than using unrelated imagery; original
assets are a separate, unauthorised-here task.

## 2. Regulated leaves — not publishable

Seventeen leaves set `canPublish=false` for NG and remain gated by `reviewRequired=true`.
No regulated leaf is publishable in NG.

| Area | Leaves |
|---|---|
| Medicines | `otc-medicines-treatments` |
| Supplements and herbal claims | `vitamins-minerals-supplements`, `herbal-traditional-remedies` |
| Medical devices and aids | `health-monitors`, `mobility-support-aids` |
| Child safety | `car-seats-boosters` |
| Infant feeding | `infant-formula` |
| Car safety parts | `brake-system-parts`, `suspension-steering-parts`, `tyres-tubes` |
| Motorcycle safety | `motorcycle-brakes-safety`, `motorcycle-tyres-wheels`, `motorcycle-helmets-protection` |
| Fixed electrical installation | `electrical-installation-materials` |
| Farm chemicals | `pesticides-crop-protection` |
| Pre-existing regulated leaves | `seeds-seedlings`, `fertilizers-crop-nutrition` |

`cycling-helmets-protection` is publishable but `reviewRequired=true` and carries an NG
note requiring a recognised standards marking. Other countries have no rule yet; they
must add their own country review before any restricted leaf is enabled there.

## 3. Product-leaf mapping (57 active products, applied)

| Measure | Count |
|---|---|
| Active products covered | 57 |
| On a most-specific selectable leaf (`map` + `keep`) | 50 |
| — audited moves applied (`map`) | 34 |
| — already on the proposed leaf (`keep`) | 16 |
| Ambiguous, retained on selectable level-1 categories (`review`) | 7 |
| Selectable leaves populated | 30 of 96 publishable |
| `Product.categoryId` writes | **34 audited moves; 7 re-applied after a revert (41 audit rows)** |

The 30 populated leaves hold 50 active products; the 7 ambiguous products are not counted
as leaf coverage. The seven re-applied products (diced onions, red bell peppers, green
beans, rooftop solar panel array, solar inverter, wireless game controllers, coloured-button
controller) are each on the leaf named in their latest `AuditLog`
(`taxonomy.product.reclassified`) `afterCategoryId`; the coverage script verifies this from
the database rather than a hardcoded list.

Populated leaves and their active-product counts, computed from `naijadeals_review` on
2026-11-13 (30 leaves / 50 products; the 7 ambiguous products are excluded):

| Populated leaf | Active products |
|---|---:|
| Agriculture & Business / Processing Equipment / Cassava Processing Equipment | 1 |
| Automotive & Motorcycle / Car Care & Accessories / Car Care & Cleaning | 1 |
| Baby, Kids & Toys / Baby Feeding & Care / Bottles, Teats & Sterilisers | 1 |
| Books & Stationery / Stationery & Office / Notebooks & Paper | 1 |
| Electronics & Technology / Computers / Computer Accessories | 3 |
| Electronics & Technology / Computers / Laptops | 2 |
| Electronics & Technology / Electronics & Appliances / Small Appliances | 4 |
| Electronics & Technology / Gaming / Gaming Accessories | 2 |
| Electronics & Technology / Phones & Tablets / Phone Accessories | 1 |
| Electronics & Technology / Phones & Tablets / Smartphones | 4 |
| Electronics & Technology / Phones & Tablets / Tablets | 1 |
| Fashion & Beauty / Beauty & Personal Care / Hair Care | 1 |
| Fashion & Beauty / Beauty & Personal Care / Skincare | 1 |
| Fashion & Beauty / Fabrics & Textiles / African-Print Fabrics | 1 |
| Fashion & Beauty / Fabrics & Textiles / Handwoven & Dyed Fabrics | 1 |
| Fashion & Beauty / Fashion & Accessories / Bags & Accessories | 3 |
| Fashion & Beauty / Fashion & Accessories / Footwear | 2 |
| Fashion & Beauty / Natural & Traditional Beauty / Shea & Natural Butters | 1 |
| Fashion & Beauty / Natural & Traditional Beauty / Traditional Cleansers & Black Soap | 1 |
| Food & Everyday Essentials / Grains & Flours / Cassava Products | 1 |
| Food & Everyday Essentials / Grains & Flours / Maize Meal & Porridge | 1 |
| Food & Everyday Essentials / Grains & Flours / Teff Flour | 1 |
| Food & Everyday Essentials / Groceries & Household Essentials / Fresh Produce | 8 |
| Health & Wellness / Medical Devices & Aids / First-Aid Supplies | 1 |
| Home & Living / Home & Kitchen / Cookware & Bakeware | 1 |
| Home & Living / Home & Kitchen / Storage & Organisation | 1 |
| Home & Living / Power & Solar / Inverters & Batteries | 1 |
| Home & Living / Power & Solar / Solar Panels | 1 |
| Sports & Outdoors / Ball & Racquet Sports / Football & Basketball | 1 |
| Tools & Building Materials / Power Tools / Drills & Drivers | 1 |
| **Total** | **50** |

## 4. Ambiguous products — classification review required

These keep their current category; no mapping is proposed.

| Product | Current category | Gap |
|---|---|---|
| `cmwdynxdd0018v4q00rd1lw3x` DEMO — Over-ear headphones | Electronics & Appliances | No personal-audio/headphone leaf |
| `cmwdynxds002fv4q0puj39gxq` DEMO — Eau de parfum, 50ml | Beauty & Personal Care | No fragrance leaf |
| `cmwdynxdy002yv4q0n19qj5vm` DEMO — Perfume gift set | Beauty & Personal Care | No fragrance leaf |
| `cmwdynxe6003mv4q0y9hwt5ha` DEMO — Wired gaming mouse | Computers | Fits Computer Accessories (Mouse) and Gaming Accessories (Gaming mouse) |
| `cmwe3jm0b00j9v4u0e5zzgkjw` DEMO — Portable solar battery charging station | Power & Solar | Inverters & Batteries vs Generators & Backup Power (low confidence) |
| `cmwf0qnsr007yv4aw6ym23yet` DEMO — Digital SLR camera with zoom lens | Electronics & Appliances | No cameras/photography leaf |
| `cmwf0qnto008cv4awngcofj2x` DEMO — Smartwatch with black silicone strap | Electronics & Appliances | No wearables leaf; Smartphones excludes smartwatches |

## 5. Missing leaves to add in a later authorised slice

1. Personal audio / headphones (parent candidate: `electronics-appliances`).
2. Fragrance / perfume (parent candidate: `beauty-personal-care`).
3. Cameras and photography (parent candidate: `electronics-appliances`).
4. Smartwatches and wearables (parent candidate: `phones-tablets`).
5. Portable power stations, distinct from inverters/batteries (parent candidate: `power-solar`).
6. A primary-use rule for peripherals that fit both Computer and Gaming Accessories
   (no new leaf necessarily; a classification rule may suffice).

## 6. Exceptions and limits

- The mapping has been applied. The 34 audited moves were applied on 2026-11-13 and the
  seven reverted moves were re-applied; the computed state is **57 active products, 50 on
  selectable leaves and 7 on selectable level-1 categories**. The live counts are derived
  by `scripts/taxonomy-coverage-report.ts`, not asserted from this paragraph.
- `CategoryRequest` is **4**, not 0: three APPROVED and one REJECTED run-tagged synthetic
  requests created by the taxonomy review flows. Destructive cleanup was not authorised and
  was not performed. CRF names in `Category.name` and `CategoryRequest.suggestedName`: 0.
- Acceptance fixtures are not active: 2 fixture-like DRAFT rows and 76 fixture-like
  ARCHIVED rows (including acceptance lifecycle probes) remain excluded. ACTIVE
  fixture-like rows: 0. The archived count grows as the workflow archives its run-owned
  fixtures instead of deleting them; the count above is the final 2026-11-13 check.
- The taxonomy seed was not re-run in this slice. Its REVIEW expectations are re-baselined
  to the 57-active state, but the coverage report and reconciliation script are the current
  count authority. The seed does not move products.
- 83 selectable leaves are empty: 66 publishable and 17 NG-regulated. Empty publishable
  leaves render honest empty states and are deliberately not padded with duplicate
  products. Populating them needs original imagery and reviewed listings.
- Six departments have no approved banner art (`imageUrl = NULL`): Health & Wellness;
  Baby, Kids & Toys; Sports & Outdoors; Automotive & Motorcycle; Tools & Building
  Materials; Books & Stationery. No accurate approved asset exists for them, so no
  unrelated image was substituted and none was generated in this slice.

## 7. Verification commands

```bash
REVIEW_DATABASE_URL=… npx tsx scripts/taxonomy-coverage-report.ts --expect-db=naijadeals_review --images
REVIEW_DATABASE_URL=… npx tsx scripts/taxonomy-reconcile-products.ts --expect-db=naijadeals_review
REVIEW_DATABASE_URL=… npx tsx scripts/taxonomy-apply-mapping.ts --expect-db=naijadeals_review --apply
npx tsc --noEmit
```

The coverage report and reconciliation scripts open `BEGIN READ ONLY`, confirm
`transaction_read_only = on`, and compare a `(Product.id, Product.categoryId)` fingerprint
before and after their checks (`fingerprint stable: true`). The coverage report exits PASS
with `57 active / 50 on leaves / 7 ambiguous / 30 of 96 populated / 66 gaps` and, with
`--images`, `62/62` image URLs passing HEAD 200 and Chromium `naturalWidth > 0`. The guarded
apply script refuses to re-apply a plan already marked `applied: true`; that refusal is the
expected double-apply protection, not a failed move. `scripts/taxonomy-product-mapping.ts`
and `scripts/taxonomy-mapping-dry-run.ts` were written for the pre-apply plan and are not
the post-apply count authority.
