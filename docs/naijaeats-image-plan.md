# NaijaEats — image manifest and generation plan

Status: **awaiting owner approval. No spend has been made for these assets.**

## What exists

| Source | Count | Notes |
| --- | --- | --- |
| Owner-approved NaijaEats artwork | 10 | Heroes, buka banner, breakfast, dessert, family and fast-food feasts, plus heroes. Reused as WebP (1280px heroes, 640px cards). |
| Existing `/public/food/naijaeats` photos | 9 | Generic food photography used by the previous landing page. |
| Dishes with accurate art | 19 of 298 | Only where an approved image genuinely shows that dish. |

**279 documented dishes have no accurate image.** They render a "Pending photo"
state. A Nigerian jollof photo was deliberately *not* reused for Ethiopian,
Moroccan or Congolese dishes — the brief forbids it, and it would misrepresent
the cuisine.

## What the pages currently need most

Priority order, highest visitor impact first:

1. **Seven cuisine rail cards** (homepage + cuisine pages). Six of the seven
   reuse a Nigerian-set image today; each should show food that actually belongs
   to its region.
2. **Dishes served by a kitchen** (35 menu items across 7 demo kitchens) —
   these appear on orderable menus, so wrong art is a live accuracy risk.
3. **Homepage category tiles** (11 dish categories).
4. Remaining catalogue dishes (documentation value only, not orderable yet).

## Generation plan (Kie.ai GPT Image 2, 1K, ~$0.03/image)

| # | Group | Qty | Purpose |
| --- | --- | --- | --- |
| 1 | Cuisine cards for the six non-Nigerian regions | 6 | One accurate food scene per region |
| 2 | Menu items without art | 0 | All 35 current menu items already have matched art |
| 3 | Dish categories | 11 | One hero per category, matched to its food |
| 4 | Highest-traffic catalogue dishes (served first) | 40 | The dishes linked from cuisine pages |
| 5 | Remaining catalogue dishes | ~223 | Full coverage, documentation value |

**Priority 1–4 total: 57 images × $0.03 ≈ $1.71.**
Full catalogue coverage including priority 5: ~280 images ≈ $8.40.

## Rules that would apply to any approved run

- One image per *dish*, not per cuisine — no repeated generic plate.
- Generated food must depict the named dish accurately (injera must not look
  like jollof).
- No generated "restaurant premises" presented as a real business.
- Every asset recorded in `scripts/image-registry.json` with prompt, model, task
  id, cost and provenance.
- Dishes without approved art keep the honest "Pending photo" state until then.
