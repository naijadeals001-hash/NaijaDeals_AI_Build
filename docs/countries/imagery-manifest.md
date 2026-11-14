# Discover Africa — imagery manifest

Date: 2026-11-14. Model: `gpt-image-2-5-flare-text-to-image` via the connected Kie.ai MCP, `flare`, `1K`, `1:1`. Price recorded by the MCP plan: **6 credits per image** (rate card `2026-10-28`; USD conversion shown by the tool was $0.03 at the tool's published $0.005/credit basis). **No credits were purchased and no top-up was performed.**

## Generated photography (12 images, 72 credits)

Every prompt excluded baked-in text, logos, flags, landmarks, brands and people. Assets were downloaded from the provider result URL, resized/cropped to 900×900 and encoded as WebP (quality 82). Each is illustrative editorial imagery; none is evidence of actual NaijaDeals stock or a specific country's product.

| Asset | Theme association | Task ID | Credits | Prompt summary | Review outcome |
|---|---|---|---|---|---|
| `public/generated/countries/theme-coffee.webp` | Coffee | `f216230f73d4644678b13013ec2871aa` | 6 | Green/roasted beans in a ceramic bowl, neutral linen | Accepted; no text/people/landmark |
| `public/generated/countries/theme-tea.webp` | Tea | `0d3c5d72eca5b24027c9e24663e0a063` | 6 | Tea leaves and a glass of brewed tea | Accepted |
| `public/generated/countries/theme-cotton.webp` | Cotton | `4540b202cca865e454d6afb2fbaa2e57` | 6 | Open cotton bolls in a woven tray | Accepted |
| `public/generated/countries/theme-honey.webp` | Honey / beeswax | `8a3c7ef893c901820baaea0c43f8a0c4` | 6 | Honey jar and honeycomb | Accepted |
| `public/generated/countries/theme-timber.webp` | Timber | `1c8dcb391a1dc2bf0dd499064ef57319` | 6 | Stacked sawn hardwood planks | Accepted |
| `public/generated/countries/theme-sugar.webp` | Sugar / cane sugar | `17fa2c0b8f5af60c9d678101b59e6b33` | 6 | Raw sugar and sugarcane | Accepted |
| `public/generated/countries/theme-gold.webp` | Gold | `e7faa7c13e5a4a1c93b2373608fdf4e3` | 6 | Raw gold nuggets in a dark dish | Accepted |
| `public/generated/countries/theme-sesame.webp` | Sesame | `c2bd3ae561d0b9fd742f3f23de6d50fc` | 6 | Sesame seeds in a ceramic bowl | Accepted |
| `public/generated/countries/theme-palm-oil.webp` | Palm oil | `0354d3f3987773898a6b8af06a36e038` | 6 | Red palm oil bottle and palm fruit | Accepted |
| `public/generated/countries/theme-gum-resin.webp` | Gum arabic / frankincense | `48782fae4e460f11876c26e4c213db37` | 6 | Amber resin lumps in a wooden bowl | Accepted |
| `public/generated/countries/theme-cattle.webp` | Livestock / beef | `7fbfc398332a57b34d70fed90daa75e9` | 6 | Small cattle herd on dry grassland | Accepted; no people/brands |
| `public/generated/countries/theme-figs-dates.webp` | Figs / dates | `1336d109ba1fc457ce6a594e167de8a1` | 6 | Figs and dates in a ceramic bowl | Accepted |

**Actual Discover Africa spend: 72 credits.** 12 provider tasks completed successfully; all 12 assets are integrated.

The host approval path for further `prepare_media_generation` calls timed out and returned no plan; no provider task was created for those attempts, so no additional credits were consumed. The implementation does **not** bypass that approval through another interface. Themes without an accurate generated photograph use approved existing project photography or an original code-native vector illustration.

## Reused approved assets

127 tiles use approved existing project photography and 96 use original vector illustrations. Of the 324 tiles, 101 use the 12 generated photographs (all 12 are now referenced). Matching is explicit in `scripts/seed-country-discovery.ts`; examples: cocoa, vanilla, cloves, cashew, shea, rice, maize, millet, plantain, cassava, avocado, mango, citrus, pineapple, fish, poultry, spices, textiles, baskets and solar. These are illustrative project assets; they are not country-specific product photography and do not assert origin.

## Original vector illustrations (24 assets, 0 credits)

When no accurate photograph was available, the implementation uses original SVG illustrations generated from `scripts/generate-country-illustrations.mjs`. They are code-native, text-free and explicitly recorded as illustrations in `CountryTheme.imageKind` / `imageProvenance`:

- minerals, energy, tourism, pottery, furniture, fruit, grain, wool, leaf/tobacco, flower, bottle/wine-oil, water, automotive components, factory, boat, hydropower, gas, carpet, handloom, carved sculpture, candles, wild mushrooms, leather and rubber tapping.

They are **not** photographs, do not depict a specific country landmark or product, and are labelled by the real HTML theme label on the card.

## Flags

54 SVG flags were downloaded from `https://flagcdn.com/<code>.svg` on 2026-11-14. Flags are public-domain national symbols. Western Sahara is not included because it is documented separately as a disputed/non-self-governing territory rather than a 55th country page.

## Remaining imagery gaps

After the independent imagery review, the material fallback mismatches were remapped: rubber, irrigated farming, agri-food, island/blue-economy, hydropower, natural gas, coconut palm, fine-flavour cocoa, agroforestry, swakara, macadamia, carpets, traditional woven cloth, stone sculpture, candles, mushrooms, date palm and leatherwork. A final focused recheck is recorded in the handoff; the remaining tiles are broad-but-related, not material. Broad-but-related tiles remain visible in the Control Center (`imageKind`) and can be replaced through the country theme editor. No stock image was substituted for a required original asset, and no country name, product label or brand is baked into a generated image.
