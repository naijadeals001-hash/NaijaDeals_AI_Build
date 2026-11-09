# NaijaShop — image inventory and generation plan

Status: **awaiting owner approval for spend**. No image-generation credits have
been spent for NaijaShop.

## What exists today

| Source | Count | Assessment |
| --- | --- | --- |
| `/products/demo2..demo5`, `/products/replacements` | ~40 files | Licensed or self-made, but generic: a red patent heel illustrates "Prada Tooled Leather Handbag", an IBM ThinkPad illustrates "14-inch Business Laptop", phone screenshots illustrate handsets. |
| `/products/catalog/*.jpg` | 5 | Wikimedia Commons, credits recorded in `catalog/credits.json` (CC BY-SA / CC0). Correct licensing, wrong product specificity. |
| `/products/*.svg` | 20 | Original studio illustrations — clean and correctly named, but line-art, not photographic. |
| `/generated/gigs`, `/generated/stream` | 79 | Other verticals; not reusable as product photography. |

**No NaijaShop hero, promotional or category artwork exists.** The storefront
composes its "hero" out of four coloured category cards.

## What the approved mockups require

- Desktop: one photographic hero banner (African brands / shopper), plus two
  lower-page promo banners, eight category tiles, six deal cards and roughly
  thirty product thumbnails, a seller-support banner and a brand strip.
- Mobile: its own hero crop, six service tiles, four deal cards, five category
  tiles and the rest of the shelf imagery.

## Generation plan (Kie.ai GPT Image 2, 1K, ~$0.03/image)

| # | Group | Qty | Purpose |
| --- | --- | --- | --- |
| 1 | Desktop hero banner | 1 | Wide editorial: Nigerian shopper with shopping bag, warm brand colours, clear left-hand text area |
| 2 | Mobile hero variant | 1 | Tighter crop of the same scene, portrait-safe |
| 3 | Lower-page banners (electronics, delivery, fashion) | 3 | Wide promo strips |
| 4 | Category tiles | 8 | Phones & Tablets, Computers, Home & Kitchen, Fashion, Beauty, Groceries, Power & Solar, Gaming |
| 5 | Service/seller banner | 2 | "Support Nigerian sellers", "Join NaijaShop Plus" |
| 6 | Product photography | 32 | One image per active listing, matched to its actual product type and attributes |

**Total: 47 images × $0.03 = $1.41.**

Reuse: the 20 original SVGs stay as list-page thumbnails where no photo is
needed; dated or mismatched stock photos are replaced rather than kept.

## Rules that apply to the generation run

- Product images depict the correct product type and attributes; no invented
  specifications or fabricated brand logos. Where a listing names a
  third-party brand (Prada, Asics, EIZO, Apple, Xbox), the image shows a
  generic product of that type and the listing is flagged for a rights
  decision — we do not generate counterfeit-looking branded merchandise.
- African market identity: Nigerian homes, streets and shoppers, not a generic
  continental collage.
- Every asset is recorded in `scripts/image-registry.json` with prompt, model,
  task id, cost, path and verification.

## Blocked until approved

Phase 6 (Kie.ai generation) only. Phases 4, 5 and 7–10 proceed with existing
assets, using clearly labelled placeholders where a mockup image has no
approved equivalent.
