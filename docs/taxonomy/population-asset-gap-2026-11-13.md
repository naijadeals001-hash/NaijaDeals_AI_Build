# Publishable-leaf population — asset gap and bounded batch proposal (2026-11-13)

Status: **COMPLETE (2026-11-14)** — six authorized images generated, reviewed and published as DEMO listings. Observed 6 credits/image, 36 credits total; no purchase or top-up.
Owner: catalogue/imagery specialist, NaijaDeals Shop increment. Run token: `TAXAMB-20261113`.

## 1. Why no listing was created in this slice

Task: populate a coherent bounded batch of the 65 empty publishable leaves, but only with
accurate existing approved assets or clearly justified new imagery, using the existing admin
publication workflow.

Asset audit against the live REVIEW catalogue (`ProductImage.url` + `Category.imageUrl`):

| Check | Result |
|---|---|
| Files under `public/generated` | 880 |
| Unused files under `public/generated/shop`, `/generated/taxonomy`, `/generated/fresh` | **0** |
| Batch-2 taxonomy product images (`docs/taxonomy/generation-ledger.json`) | 16 of 16 assigned to active products |
| Category / department artwork | all assigned to `Category.imageUrl` |
| Unused approved product photography elsewhere (`public/products`, `public/real-photography`, `public/brand-photography`, `public/food`) | 0 shop-product assets; these are other verticals' brand art or legacy SVG illustrations |

Every approved shop product image is already attached to an active product. Creating a new
listing with an existing image would duplicate an existing product; using a category banner,
brand photography or a legacy illustration would be filler that does not depict the item
sold. Both are excluded by the project's no-filler / no-duplicate rules, so no listing was
created.

## 2. Proposed bounded batch (requires coordinator authorization before any generation)

Six empty publishable leaves, chosen for honest, brand-free, low-risk imagery and spread
across departments. Each would become one `isDemo=true` listing that the existing UI labels
as demonstration stock.

| # | Leaf key | Department path | Proposed subject (unbranded) |
|---|---|---|---|
| 1 | `rice-grains` | Food & Everyday Essentials / Grains & Flours | Long-grain white rice in a split jute sack with a wooden bowl of rice |
| 2 | `palm-cooking-oils` | Food & Everyday Essentials / Oils, Soups & Seasonings | Glass bottle of red palm oil with fresh palm kernels |
| 3 | `cleaning-supplies` | Home & Living / Household & Cleaning | Bucket, spray bottle, sponges and cloth, blank labels |
| 4 | `writing-drawing-instruments` | Books & Stationery / Stationery & Office | Pens, pencils, ruler and eraser set, no branding |
| 5 | `baby-toddler-toys` | Baby, Kids & Toys / Toys & Play | Wooden stacking-ring toy and soft fabric ball |
| 6 | `yoga-fitness-accessories` | Sports & Outdoors / Fitness & Strength | Rolled yoga mat, cork block and resistance band |

Regulated leaves are excluded. No listing would claim certification, brand, exact
specification or real stock beyond the DEMO label.

## 3. Estimated generation cost

| Item | Value | Source |
|---|---|---|
| Model | `gpt-image-2-5-flare-text-to-image` | `docs/taxonomy/generation-ledger.json` (last used 2026-11-13) |
| Size | 1K | same ledger |
| Observed credits per image | 6 | ledger asset rows and `creditBatches.taxonomy-batch2` (8 images = 48 credits) |
| Proposed batch | 6 images | this document |
| **Estimated credits** | **36** | 6 × 6 |
| Reduced option | 4 images = 24 credits | drop entries 5–6 if a smaller batch is preferred |

The 6-credit rate is observed ledger evidence, not a verified current price. Kie model
availability and pricing must be re-checked before submission.

## 4. Executed after authorization (2026-11-14)

1. Confirm the current Kie model id, 1K price and commercial terms; record the checked date.
2. Create `scripts/taxonomy-batch3-products.cjs` by extending
   `scripts/taxonomy-batch2-products.cjs` (same data-only + `--publish` split, idempotent by
   exact product name, run token in every name/description).
3. Generate only the authorized images; verify each visually against the intended subject
   and reject any inaccurate output instead of publishing it.
4. Publish through the existing seller DRAFT → admin image/alt/DEMO → catalogue validation
   → admin publish workflow.
5. Re-run `scripts/taxonomy-coverage-report.ts` and `scripts/taxonomy-reconcile-products.ts`
   and extend the reconcile batch arithmetic before publishing more than six products.

The coordinator approved the existing-credit batch. `scripts/generate-taxonomy-batch3-images.mjs` generated the six
images; `scripts/taxonomy-batch3-products.cjs` published the six DEMO listings. The second `--publish` run reused all six
listings with no duplicates. Current coverage is computed, not copied: 63 active products, 41/100 publishable leaves
populated, 0 ambiguous products. See `coverage.md` and `product-leaf-mapping.json`.
