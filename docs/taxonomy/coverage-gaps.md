# Taxonomy coverage and product-leaf mapping — 2026-11-13

REVIEW target: `naijadeals_review` (`DatabaseClassification` = REVIEW). Read-only plan: no
`Product.categoryId` was written. Source of truth: `lib/data/taxonomy.ts` and
`docs/taxonomy/product-leaf-mapping.json`.

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

## 3. Product-leaf mapping plan (49 active products)

| Measure | Count |
|---|---|
| Active products covered | 49 |
| Mapped to a most-specific selectable leaf | 42 |
| — already on the proposed leaf (`keep`) | 8 |
| — proposed moves (`map`, **applied on 2026-11-13**) | 34 |
| Ambiguous, retained on current assignment (`review`) | 7 |
| Selectable leaves currently populated | 30 of 96 publishable |
| Selectable leaves after the proposed mapping | 30 of 96 publishable |
| `Product.categoryId` writes | **0** |

Current 8 populated leaves are the taxonomy batch (one product each): Teff Flour; Maize
Meal & Porridge; African-Print Fabrics; Handwoven & Dyed Fabrics; Shea & Natural Butters;
Traditional Cleansers & Black Soap; Cassava Processing Equipment; Storage & Organisation.

Proposed populated leaves and counts after mapping (applied on 2026-11-13):

| Proposed leaf | Active products |
|---|---|
| Groceries & Household Essentials / Fresh Produce | 8 |
| Electronics & Appliances / Small Appliances | 4 |
| Phones & Tablets / Smartphones | 4 |
| Computers / Computer Accessories | 3 |
| Computers / Laptops | 2 |
| Gaming / Gaming Accessories | 2 |
| Fashion & Accessories / Bags & Accessories | 2 |
| Fashion & Accessories / Footwear | 2 |
| Beauty & Personal Care / Skincare | 1 |
| Beauty & Personal Care / Hair Care | 1 |
| Phones & Tablets / Tablets | 1 |
| Phones & Tablets / Phone Accessories | 1 |
| Home & Kitchen / Cookware & Bakeware | 1 |
| Power & Solar / Solar Panels | 1 |
| Power & Solar / Inverters & Batteries | 1 |
| The 8 taxonomy-batch leaves above | 1 each |

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

- The mapping is a plan only. The 34 proposed moves are **applied on 2026-11-13**; the live
  catalogue still has 41 active products on the nine existing level-1 categories and 8
  on the taxonomy leaves.
- `CategoryRequest` is **2**, not 0: two APPROVED, run-tagged synthetic requests
  (`cmwf3aalh0004v4rcmix619ij`, `cmwf4er0d00slv40wlisfrtj9`) created by the earlier
  taxonomy review flow. The seed preserves them and creates none (`created: 0`).
  Destructive cleanup was not authorised and was not performed.
- Acceptance fixtures are not active: 2 fixture-like DRAFT rows (`Final acceptance
  blender …`) and 56 fixture-like ARCHIVED rows (including acceptance lifecycle probes)
  remain excluded. ACTIVE fixture-like rows: 0.
- Re-running the seed is idempotent: second run created 0 nodes, updated 160, kept 49
  active products, 41 on existing categories, 148 image rows and 140 inventory rows
  unchanged, and changed 0 `Product.categoryId` values.
- 105 selectable leaves are still empty. They render honest empty states and are
  deliberately not padded with duplicate products. Populating them needs original
  imagery and reviewed listings.

## 7. Verification commands

```bash
REVIEW_DATABASE_URL=… npx tsx scripts/taxonomy-seed.ts --expect-db=naijadeals_review
REVIEW_DATABASE_URL=… npx tsx scripts/taxonomy-reconcile-products.ts --expect-db=naijadeals_review
REVIEW_DATABASE_URL=… npx tsx scripts/taxonomy-product-mapping.ts --expect-db=naijadeals_review
REVIEW_DATABASE_URL=… npx tsx scripts/taxonomy-mapping-dry-run.ts --expect-db=naijadeals_review
npx tsc --noEmit
```

All four scripts print `Result: PASS`. The mapping and reconciliation scripts open
`BEGIN READ ONLY`, confirm `transaction_read_only = on`, and the mapping script also
compares a `(Product.id, Product.categoryId)` fingerprint before and after its checks
(`fingerprint stable: true`).
