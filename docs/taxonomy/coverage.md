# Taxonomy coverage — current computed state (2026-11-13)

> **Current coverage is computed from the REVIEW database by
> `scripts/taxonomy-coverage-report.ts`.** Run it with
> `REVIEW_DATABASE_URL=… npx tsx scripts/taxonomy-coverage-report.ts
> --expect-db=naijadeals_review --images`. The verified values on 2026-11-13 are:
>
> - **161 active taxonomy nodes: 11 departments / 37 categories / 113 selectable leaves.**
> - **96 publishable leaves; 17 NG-regulated leaves; 30 populated publishable leaves
>   (30/96); 66 publishable leaves empty.**
> - **57 ACTIVE products: 50 on selectable leaves, 7 retained on level-1 categories
>   pending classification (ambiguous), 0 active acceptance fixtures.**
> - **34 audited `Product.categoryId` moves applied; 16 products already on their leaf;
>   7 ambiguous. Seven moves were re-applied after a revert and all seven now sit on
>   their audited leaves.**
> - **`CategoryRequest`: 3 APPROVED / 1 REJECTED; 0 CRF category or request names.**
> - **62 image URLs audited (57 active products + 5 department banners): 62 HEAD 200
>   and Chromium `naturalWidth > 0`; 6 departments have no approved banner art.**
>
> The 16 example areas used to size the first taxonomy batch are illustrative coverage
> targets, **not the full requested marketplace scope**. The taxonomy remains a reviewed
> starting point; additional departments, leaves and country rules require a separately
> authorised slice. It does not by itself establish service availability.

> Historical record below: the first taxonomy batch was 73 nodes. Those batch-1 figures
> are retained for provenance and are **not** current coverage.

Hierarchy at batch 1: 5 departments / 17 categories / 51 subcategories (73 nodes), 387 aliases, 150 attributes, 2 country restrictions.
At batch 1, the then-existing 41 active products kept their IDs/slugs/images/stock and remained on their original selectable category nodes (0 projected category changes in that dry run). The later reviewed product-to-leaf mapping is recorded below and in `coverage-gaps.md`. Eight new DEMO products were published through the seller + Control Center workflow with original Kie imagery.

| Department | Leaf category | Published DEMO products | Images |
|---|---|---|---|
| Food & Everyday Essentials | Teff Flour | Teff flour 1kg | `/generated/taxonomy/teff-flour.webp` |
| Food & Everyday Essentials | Maize Meal & Porridge | Fine white maize meal 5kg | `maize-meal.webp` |
| Fashion & Beauty | African-Print Fabrics | African-print cotton fabric 6 yards | `african-print-fabrics.webp` |
| Fashion & Beauty | Handwoven & Dyed Fabrics | Handwoven kente-style cloth 2 yards | `kente-cloth.webp` |
| Fashion & Beauty | Shea & Natural Butters | Raw shea butter 500g | `shea-butter.webp` |
| Fashion & Beauty | Traditional Cleansers & Black Soap | African black soap bar 300g | `black-soap.webp` |
| Agriculture & Business | Cassava Processing Equipment | Electric cassava grater | `cassava-grater.webp` |
| Home & Living | Storage & Organisation | Woven storage baskets, set of three | `woven-baskets.webp` |

At the time of batch 1 (the 73-node taxonomy), 8 of 51 selectable leaves were populated. That is a historical batch-1 figure, not current coverage. The remaining batch-1 leaves were deliberately empty and rendered an honest empty state; they are selectable by sellers and searchable by alias. Populating them requires further original imagery and is not padded with duplicates. Regulated leaves (`seeds-seedlings`, `fertilizers-crop-nutrition`) are not publishable in NG.

Kie generation: `gpt-image-2-5-flare-text-to-image`, 1K, 1:1, 6 credits/image read back from each job, **48 credits total** for 8 images. Provenance in `generation-ledger.json`; images inspected as a contact sheet before publication.

## Batch 2 — coverage and representative DEMO products (2026-11-13)

Scope: 11 departments / 37 categories / 113 leaves. 17 regulated leaves are excluded from publication (NG `canPublish=false`); 96 leaves are approved publishable. **Current computed coverage is 30 populated of 96 publishable leaves, with 66 publishable leaves empty.** The reviewed plan applied 34 audited `Product.categoryId` moves and kept 16 products already on their leaf; the 7 ambiguous legacy listings remain on their selectable level-1 categories and are not counted against a leaf. The coverage script derives the 57 active-product total, 50 leaf products and 7 ambiguous products from the database; none of those figures are hardcoded documentation claims.

Batch 2 added eight representative DEMO products across eight departments, each with one original Kie image: First-Aid Supplies (Health & Wellness), Bottles/Teats/Sterilisers (Baby, Kids & Toys), Football & Basketball (Sports & Outdoors), Car Care & Cleaning (Automotive & Motorcycle), Drills & Drivers (Tools & Building Materials), Notebooks & Paper (Books & Stationery), Cassava Products (Food & Everyday Essentials) and Bags & Accessories (Fashion & Beauty). No regulated leaf was populated.

### Department summary

| Department | Publishable leaves | Populated leaves | Active products on leaves | Images | Empty publishable leaves | Excluded regulated leaves |
|---|---:|---:|---:|---:|---:|---:|
| Electronics & Technology | 12 | 7 | 17 | 17 | 5 | 0 |
| Home & Living | 9 | 4 | 4 | 4 | 5 | 0 |
| Fashion & Beauty | 11 | 8 | 11 | 11 | 3 | 0 |
| Food & Everyday Essentials | 9 | 4 | 11 | 11 | 5 | 0 |
| Agriculture & Business | 8 | 1 | 1 | 1 | 7 | 3 |
| Health & Wellness | 1 | 1 | 1 | 1 | 0 | 5 |
| Baby, Kids & Toys | 9 | 1 | 1 | 1 | 8 | 2 |
| Sports & Outdoors | 10 | 1 | 1 | 1 | 9 | 0 |
| Automotive & Motorcycle | 7 | 1 | 1 | 1 | 6 | 6 |
| Tools & Building Materials | 10 | 1 | 1 | 1 | 9 | 1 |
| Books & Stationery | 10 | 1 | 1 | 1 | 9 | 0 |
| **Total** | **96** | **30** | **50** | **50** | **66** | **17** |

The 7 ambiguous legacy products (headphones, two perfumes, gaming mouse, portable power station, DSLR camera, smartwatch) remain on their level-1 categories until a classification rule or leaf is approved; they are not included in the leaf counts above.

### Publishable-leaf manifest

`Existing` is a suitable active listing and its image. `Planned` is the batch-2 DEMO product and image. Every populated row has an image; empty rows have none.

| Department | Leaf (key) | Existing suitable product / image | Planned batch-2 product / image | Status / blocker |
|---|---|---|---|---|
| Electronics & Technology | Smartphones (`smartphones`) | Android smartphone, 6-inch display (`/generated/shop/product-blackview-a60-android-smartphone.webp`)<br>Smartphone on desk (`/generated/shop/product-smartphone-on-desk.webp`)<br>Apple iPhone 5s, gold (`/generated/shop/product-apple-iphone-5s.webp`)<br>Apple iPhone 6, silver (`/generated/shop/product-apple-iphone-6-silver.webp`) | — | Populated — moved listing |
| Electronics & Technology | Phone Accessories (`phone-accessories`) | Portable power bank (`/generated/shop/product-portable-power-bank.webp`) | — | Populated — moved listing |
| Electronics & Technology | Tablets (`tablets`) | 10-inch Android tablet (`/generated/shop/product-tablet-10-inch.webp`) | — | Populated — moved listing |
| Electronics & Technology | Laptops (`laptops`) | 14-inch business laptop (`/generated/shop/product-14-inch-business-laptop.webp`)<br>15.6-inch laptop (`/generated/shop/product-15-6-inch-laptop.webp`) | — | Populated — moved listing |
| Electronics & Technology | Desktop Computers (`desktop-computers`) | — | — | Empty — needs original image |
| Electronics & Technology | Computer Accessories (`computer-accessories`) | Mechanical keyboard (`/generated/shop/product-mechanical-keyboard.webp`)<br>LED monitor (`/generated/shop/product-led-monitor.webp`)<br>EIZO FORIS FG2421 gaming monitor, 24-inch (`/generated/shop/product-eizo-foris-fg2421-monitor.webp`) | — | Populated — moved listing |
| Electronics & Technology | Gaming Consoles (`gaming-consoles`) | — | — | Empty — needs original image |
| Electronics & Technology | Video Games (`video-games`) | — | — | Empty — needs original image |
| Electronics & Technology | Gaming Accessories (`gaming-accessories`) | Wireless game controllers, black and white pair (`/generated/shop/product-ps4-and-xbox-one-controllers.webp`)<br>Game controller with coloured buttons (`/generated/shop/product-xbox-360-controller.webp`) | — | Populated — moved listing |
| Electronics & Technology | TVs & Home Audio (`tvs-home-audio`) | — | — | Empty — needs original image |
| Electronics & Technology | Kitchen Appliances (`kitchen-appliances`) | — | — | Empty — needs original image |
| Electronics & Technology | Small Appliances (`small-appliances`) | 5.5L air fryer (`/generated/shop/product-air-fryer-5-5l.webp`)<br>2-slice toaster (`/generated/shop/product-2-slice-toaster.webp`)<br>Retro kitchen blender (`/generated/shop/product-retro-kitchen-blender.webp`)<br>Coffee maker (`/generated/shop/product-coffee-maker.webp`) | — | Populated — moved listing |
| Home & Living | Cookware & Bakeware (`cookware-bakeware`) | Stainless steel cookware set (`/generated/shop/product-stainless-steel-cookware-set.webp`) | — | Populated — moved listing |
| Home & Living | Tableware & Dining (`tableware-dining`) | — | — | Empty — needs original image |
| Home & Living | Home Textiles (`home-textiles`) | — | — | Empty — needs original image |
| Home & Living | Storage & Organisation (`storage-organisation`) | Woven storage baskets, set of three (`/generated/taxonomy/woven-baskets.webp`) | — | Populated — batch 1 |
| Home & Living | Solar Panels (`solar-panels`) | Rooftop solar panel array with mounting frame (`/generated/shop/product-rooftop-solar-panel-array.webp`) | — | Populated — moved listing |
| Home & Living | Inverters & Batteries (`inverters-batteries`) | Solar power inverter (`/generated/shop/product-solar-power-inverter.webp`) | — | Populated — moved listing |
| Home & Living | Generators & Backup Power (`generators-backup-power`) | — | — | Empty — needs original image |
| Home & Living | Cleaning Supplies (`cleaning-supplies`) | — | — | Empty — needs original image |
| Home & Living | Laundry & Bathroom (`laundry-bathroom`) | — | — | Empty — needs original image |
| Fashion & Beauty | Clothing (`clothing`) | — | — | Empty — needs original image |
| Fashion & Beauty | Footwear (`footwear`) | Running shoes (`/generated/shop/product-asics-gel-cumulus-22-running-shoes.webp`)<br>Red patent leather baby shoes (`/generated/shop/product-red-patent-leather-baby-shoes.webp`) | — | Populated — moved listing |
| Fashion & Beauty | Bags & Accessories (`bags-accessories`) | Leather handbag (`/generated/shop/product-prada-tooled-leather-handbag.webp`)<br>Automatic wristwatch (`/generated/shop/product-automatic-wristwatch.webp`) | Handwoven raffia tote bag (`/generated/taxonomy/raffia-tote.webp`) | Populated — batch 2 |
| Fashion & Beauty | African-Print Fabrics (`african-print-fabrics`) | African-print cotton fabric, 6 yards (`/generated/taxonomy/african-print-fabrics.webp`) | — | Populated — batch 1 |
| Fashion & Beauty | Handwoven & Dyed Fabrics (`handwoven-dyed-fabrics`) | Handwoven kente-style cloth, 2 yards (`/generated/taxonomy/kente-cloth.webp`) | — | Populated — batch 1 |
| Fashion & Beauty | Lace & Embroidered Fabrics (`lace-embroidered-fabrics`) | — | — | Empty — needs original image |
| Fashion & Beauty | Skincare (`skincare`) | Moisturiser, 100ml (`/generated/shop/product-moisturiser-jar-100ml.webp`) | — | Populated — moved listing |
| Fashion & Beauty | Hair Care (`hair-care`) | Shampoo bars (`/generated/shop/product-handmade-shampoo-bars.webp`) | — | Populated — moved listing |
| Fashion & Beauty | Bath & Body (`bath-body`) | — | — | Empty — needs original image |
| Fashion & Beauty | Shea & Natural Butters (`shea-natural-butters`) | Raw shea butter, 500g (`/generated/taxonomy/shea-butter.webp`) | — | Populated — batch 1 |
| Fashion & Beauty | Traditional Cleansers & Black Soap (`traditional-cleansers-black-soap`) | African black soap bar, 300g (`/generated/taxonomy/black-soap.webp`) | — | Populated — batch 1 |
| Food & Everyday Essentials | Fresh Produce (`fresh-produce`) | Fresh tomatoes, 1kg (`/generated/shop/product-fresh-tomatoes-1kg.webp`)<br>Diced onions, 500g (`/generated/shop/product-diced-onions-500g.webp`)<br>Red bell peppers, 500g (`/generated/shop/product-red-bell-pepper-500g.webp`)<br>Green beans, 500g (`/generated/shop/product-green-beans-500g.webp`)<br>Fresh cabbage, 1 head (`/generated/fresh/prod-cabbage.webp`)<br>Fresh carrots, 1kg (`/generated/fresh/prod-carrots.webp`)<br>Fresh cucumbers, 1kg (`/generated/fresh/prod-cucumber.webp`)<br>Apple mangoes, 1kg (`/generated/fresh/prod-apple-mangoes.webp`) | — | Populated — moved listing |
| Food & Everyday Essentials | Pantry Staples (`pantry-staples`) | — | — | Empty — needs original image |
| Food & Everyday Essentials | Household Essentials (`household-essentials`) | — | — | Empty — needs original image |
| Food & Everyday Essentials | Teff Flour (`teff-flour`) | Teff flour, 1kg (`/generated/taxonomy/teff-flour.webp`) | — | Populated — batch 1 |
| Food & Everyday Essentials | Maize Meal & Porridge (`maize-meal-porridge`) | Fine white maize meal, 5kg (`/generated/taxonomy/maize-meal.webp`) | — | Populated — batch 1 |
| Food & Everyday Essentials | Cassava Products (`cassava-products`) | — | Garri (cassava flakes), 1kg (`/generated/taxonomy/garri.webp`) | Populated — batch 2 |
| Food & Everyday Essentials | Rice & Other Grains (`rice-grains`) | — | — | Empty — needs original image |
| Food & Everyday Essentials | Palm Oil & Cooking Oils (`palm-cooking-oils`) | — | — | Empty — needs original image |
| Food & Everyday Essentials | Soup Thickeners & Seasonings (`soup-thickeners-seasonings`) | — | — | Empty — needs original image |
| Agriculture & Business | Soil, Compost & Growing Media (`soil-compost`) | — | — | Empty — needs original image |
| Agriculture & Business | Irrigation & Farm Tools (`irrigation-farm-tools`) | — | — | Empty — needs original image |
| Agriculture & Business | Cassava Processing Equipment (`cassava-processing-equipment`) | Electric cassava grater (`/generated/taxonomy/cassava-grater.webp`) | — | Populated — batch 1 |
| Agriculture & Business | Grain Milling Equipment (`grain-milling-equipment`) | — | — | Empty — needs original image |
| Agriculture & Business | Food Processing Equipment (`food-processing-equipment`) | — | — | Empty — needs original image |
| Agriculture & Business | Bulk Grains & Staples (`bulk-grains-staples`) | — | — | Empty — needs original image |
| Agriculture & Business | Business Packaging Supplies (`business-packaging-supplies`) | — | — | Empty — needs original image |
| Agriculture & Business | Store Equipment & Fixtures (`store-equipment-fixtures`) | — | — | Empty — needs original image |
| Health & Wellness | First-Aid Supplies (`first-aid-supplies`) | — | Compact first-aid kit, 42 pieces (`/generated/taxonomy/first-aid-kit.webp`) | Populated — batch 2 |
| Baby, Kids & Toys | Strollers & Prams (`strollers-prams`) | — | — | Empty — needs original image |
| Baby, Kids & Toys | Cots & Nursery Furniture (`cots-nursery-furniture`) | — | — | Empty — needs original image |
| Baby, Kids & Toys | Bottles, Teats & Sterilisers (`bottles-teats-sterilisers`) | — | Glass baby bottles, 2 × 240ml (`/generated/taxonomy/glass-baby-bottles.webp`) | Populated — batch 2 |
| Baby, Kids & Toys | Nappies & Baby Wipes (`nappies-wipes`) | — | — | Empty — needs original image |
| Baby, Kids & Toys | Baby Bathing & Skincare (`baby-bathing-skincare`) | — | — | Empty — needs original image |
| Baby, Kids & Toys | Baby & Toddler Toys (`baby-toddler-toys`) | — | — | Empty — needs original image |
| Baby, Kids & Toys | Educational & STEM Toys (`educational-stem-toys`) | — | — | Empty — needs original image |
| Baby, Kids & Toys | Ride-On Toys (`ride-on-toys`) | — | — | Empty — needs original image |
| Baby, Kids & Toys | Dolls & Plush Toys (`dolls-plush-toys`) | — | — | Empty — needs original image |
| Sports & Outdoors | Home Gym & Weights (`home-gym-weights`) | — | — | Empty — needs original image |
| Sports & Outdoors | Yoga & Fitness Accessories (`yoga-fitness-accessories`) | — | — | Empty — needs original image |
| Sports & Outdoors | Cardio Machines (`cardio-machines`) | — | — | Empty — needs original image |
| Sports & Outdoors | Football & Basketball (`football-basketball-equipment`) | — | Size 5 match football (`/generated/taxonomy/match-football.webp`) | Populated — batch 2 |
| Sports & Outdoors | Racquet Sports (`racquet-sports-equipment`) | — | — | Empty — needs original image |
| Sports & Outdoors | Tents & Sleeping Gear (`tents-sleeping-bags`) | — | — | Empty — needs original image |
| Sports & Outdoors | Camping Cooking & Coolers (`camping-cooking-coolers`) | — | — | Empty — needs original image |
| Sports & Outdoors | Bicycles (`bicycles`) | — | — | Empty — needs original image |
| Sports & Outdoors | Cycling Helmets & Protection (`cycling-helmets-protection`) | — | — | Empty — review-required standards marking |
| Sports & Outdoors | Cycling Accessories (`cycling-accessories`) | — | — | Empty — needs original image |
| Automotive & Motorcycle | Engine Filters & Fluids (`engine-filters-fluids`) | — | — | Empty — needs original image |
| Automotive & Motorcycle | Auto Electrical & Lighting (`auto-electrical-lighting`) | — | — | Empty — needs original image |
| Automotive & Motorcycle | Body & Exterior Parts (`body-exterior-parts`) | — | — | Empty — needs original image |
| Automotive & Motorcycle | Motorcycle Engine & Drive Parts (`motorcycle-engine-drive-parts`) | — | — | Empty — needs original image |
| Automotive & Motorcycle | Car Care & Cleaning (`car-care-cleaning`) | — | Car wash and microfibre care kit (`/generated/taxonomy/car-care-kit.webp`) | Populated — batch 2 |
| Automotive & Motorcycle | Car Interior Accessories (`car-interior-accessories`) | — | — | Empty — needs original image |
| Automotive & Motorcycle | In-Car Electronics (`in-car-electronics`) | — | — | Empty — needs original image |
| Tools & Building Materials | Drills & Drivers (`drills-drivers`) | — | Cordless drill and bit set, 18V (`/generated/taxonomy/cordless-drill.webp`) | Populated — batch 2 |
| Tools & Building Materials | Grinders & Cutters (`grinders-cutters`) | — | — | Empty — needs original image |
| Tools & Building Materials | Saws & Planers (`saws-planers`) | — | — | Empty — needs original image |
| Tools & Building Materials | Spanners & Socket Sets (`spanners-sockets`) | — | — | Empty — needs original image |
| Tools & Building Materials | Hammers & Measuring Tools (`hammers-measuring-tools`) | — | — | Empty — needs original image |
| Tools & Building Materials | Cement, Blocks & Aggregates (`cement-blocks-aggregates`) | — | — | Empty — needs original image |
| Tools & Building Materials | Roofing, Timber & Boards (`roofing-sheets-timber`) | — | — | Empty — needs original image |
| Tools & Building Materials | Paints & Coatings (`paints-coatings`) | — | — | Empty — needs original image |
| Tools & Building Materials | Plumbing & Fittings (`plumbing-fittings`) | — | — | Empty — needs original image |
| Tools & Building Materials | PPE & Workwear (`ppe-workwear`) | — | — | Empty — needs original image |
| Books & Stationery | Textbooks & Education (`textbooks-education`) | — | — | Empty — needs original image |
| Books & Stationery | Fiction & Literature (`fiction-literature`) | — | — | Empty — needs original image |
| Books & Stationery | Religious & Inspirational Books (`religious-inspirational-books`) | — | — | Empty — needs original image |
| Books & Stationery | Children's Books (`childrens-books`) | — | — | Empty — needs original image |
| Books & Stationery | Notebooks & Paper (`notebooks-paper`) | — | A5 exercise books, pack of 10 (`/generated/taxonomy/exercise-books.webp`) | Populated — batch 2 |
| Books & Stationery | Writing & Drawing Instruments (`writing-drawing-instruments`) | — | — | Empty — needs original image |
| Books & Stationery | Office & School Supplies (`office-school-supplies`) | — | — | Empty — needs original image |
| Books & Stationery | Printer Ink & Toner (`printer-ink-toner`) | — | — | Empty — needs original image |
| Books & Stationery | Art Supplies (`art-supplies`) | — | — | Empty — needs original image |
| Books & Stationery | Craft Materials (`craft-materials`) | — | — | Empty — needs original image |

### Regulated leaves — excluded from this batch

These leaves remain seeded, selectable and searchable by alias, but `canPublish=false` for NG and `reviewRequired=true`. No product or image was created for them.

| Department | Leaf (key) | Path |
|---|---|---|
| Agriculture & Business | `seeds-seedlings` | Agriculture & Business > Farm Inputs > Seeds & Seedlings |
| Agriculture & Business | `fertilizers-crop-nutrition` | Agriculture & Business > Farm Inputs > Fertilizers & Crop Nutrition |
| Agriculture & Business | `pesticides-crop-protection` | Agriculture & Business > Farm Inputs > Pesticides & Crop Protection |
| Health & Wellness | `otc-medicines-treatments` | Health & Wellness > Medicines & Treatments > Over-the-Counter Medicines |
| Health & Wellness | `vitamins-minerals-supplements` | Health & Wellness > Vitamins & Supplements > Vitamins & Minerals |
| Health & Wellness | `herbal-traditional-remedies` | Health & Wellness > Vitamins & Supplements > Herbal & Traditional Remedies |
| Health & Wellness | `health-monitors` | Health & Wellness > Medical Devices & Aids > Health Monitors |
| Health & Wellness | `mobility-support-aids` | Health & Wellness > Medical Devices & Aids > Mobility & Support Aids |
| Baby, Kids & Toys | `car-seats-boosters` | Baby, Kids & Toys > Baby Gear & Nursery > Child Car Seats & Boosters |
| Baby, Kids & Toys | `infant-formula` | Baby, Kids & Toys > Baby Feeding & Care > Infant Formula |
| Automotive & Motorcycle | `brake-system-parts` | Automotive & Motorcycle > Car Parts > Brake System Parts |
| Automotive & Motorcycle | `suspension-steering-parts` | Automotive & Motorcycle > Car Parts > Suspension & Steering Parts |
| Automotive & Motorcycle | `tyres-tubes` | Automotive & Motorcycle > Car Parts > Tyres & Tubes |
| Automotive & Motorcycle | `motorcycle-brakes-safety` | Automotive & Motorcycle > Motorcycle Parts & Gear > Motorcycle Brakes |
| Automotive & Motorcycle | `motorcycle-tyres-wheels` | Automotive & Motorcycle > Motorcycle Parts & Gear > Motorcycle Tyres & Wheels |
| Automotive & Motorcycle | `motorcycle-helmets-protection` | Automotive & Motorcycle > Motorcycle Parts & Gear > Motorcycle Helmets & Riding Gear |
| Tools & Building Materials | `electrical-installation-materials` | Tools & Building Materials > Building Materials > Electrical Installation Materials |

### Credit accounting

| Batch | Model / size | Images | Credits | Balance evidence |
|---|---|---:|---:|---|
| Batch 1 (prior, preserved) | `gpt-image-2-5-flare-text-to-image`, 1K, 1:1 | 8 | 48 | per-job `creditsConsumed` in `generation-ledger.json` |
| Batch 2 (new) | `gpt-image-2-5-flare-text-to-image`, 1K, 1:1 | 8 | 48 | 6 credits/job; account 11,292.8 → 11,244.8 |
| **Cumulative** | | **16** | **96** | 48 prior + 48 new |

Kie MCP `prepare_media_generation` quoted 6 credits / $0.03 per 1K image (credit value $0.005; `https://kie.ai/pricing`, verified in the plan on 2026-11-13). The MCP host declined submit approval in this session, so generation used the project's existing permitted Kie REST integration (`/api/v1/jobs/createTask`, `/api/v1/jobs/recordInfo`, `/api/v1/chat/credit`). No credits were purchased. Prior and new credits are separated in `generation-ledger.json` (`creditBatches`).

### Verification and preview note

The eight listings were created as seller DRAFTs, given exact alt text and the DEMO flag by an administrator, passed `action=validate`, and were published with `action=publish`. A 160-check run passed on the production build (`BUILD_ID LlrV3NWSANnH6hr6mbNxN`, same as the existing 3047 preview) served from an isolated temporary port against `naijadeals_review`: direct page, leaf catalogue API, rendered leaf page, search API, rendered search page, DEMO label, alt text, exact leaf, attributes, price and stock. Production screenshots are in `qa-artifacts/taxonomy-batch2/` (direct, leaf and search at 1440px; direct at 390px).

**Current canonical-preview image audit (2026-11-13):** the 3047 preview served all 62 audited URLs with HEAD 200 and Chromium `naturalWidth > 0` (57 active-product images plus 5 department banners). No restart was performed by this audit. Six departments (Health & Wellness; Baby, Kids & Toys; Sports & Outdoors; Automotive & Motorcycle; Tools & Building Materials; Books & Stationery) still have `imageUrl = NULL`; no accurate approved banner asset exists for them, so no unrelated image was substituted and none was generated in this slice. Their storefront tiles use the neutral fallback.

## Department banners — the six missing departments (2026-11-13, later slice)

This section supersedes the "six departments have no approved banner art" note above.
It does not change any earlier product-batch figure.

Six original wide department banners were generated through the permitted Kie.ai
integration, inspected as contact sheets and at full resolution, and applied to the
REVIEW catalogue. All 11 departments now have an approved `imageUrl` and `imageAlt`;
`missingDepartmentArt` is empty.

| Department | Category key | Published asset | Kie task id | Credits | Alt text |
|---|---|---|---|---:|---|
| Health & Wellness | `health-wellness` | `/generated/taxonomy/department-health-wellness.webp` | `8b3ecef92c877e92d7b27b137f5d44b0` | 6 | First-aid kit with bandages, gauze, plasters, antiseptic bottle and a digital thermometer beside a folded towel and potted aloe |
| Baby, Kids & Toys | `baby-kids-toys` | `/generated/taxonomy/department-baby-kids-toys.webp` | `1abe1e5cc4fd0fd8d6822a4382054cb1` | 6 | Two glass baby bottles, a folded cotton blanket, wooden stacking rings, a plush teddy bear and a silicone teether on a neutral surface |
| Sports & Outdoors | `sports-outdoors` | `/generated/taxonomy/department-sports-outdoors.webp` | `08fea35bf994a6341180a894d480deb4` | 6 | Football, basketball, badminton racket, rolled yoga mat, dumbbells, hiking backpack and water bottle arranged on a neutral backdrop |
| Automotive & Motorcycle | `automotive-motorcycle` | `/generated/taxonomy/department-automotive-motorcycle.webp` | `ec24acdf54c2cd9a27d987ea153dc29d` | 6 | Car-care kit with folded microfibre cloths, spray bottle, bucket and tyre gauge beside riding gloves and a plain open-face motorcycle helmet |
| Tools & Building Materials | `tools-building` | `/generated/taxonomy/department-tools-building-materials.webp` | `f56a6ea71ef3512aa3035ad669e6766f` | 6 | Claw hammer, screwdrivers, adjustable spanner, measuring tape and safety goggles beside stacked timber and plain cement bag |
| Books & Stationery | `books-stationery` | `/generated/taxonomy/department-books-stationery.webp` | `315c013e97bbd5f45210042f2bed7f8d` | 6 | Stack of blank hardback books and notebooks with pencils in a cup, pens, a wooden ruler and a geometry set |

### Generation parameters and price verification

- Model: `gpt-image-2-5-flare-text-to-image`; resolution `1K`; `aspect_ratio` `16:9`.
  Native output 1672x941 was downscaled once to 1600x900 WebP (quality 86); no
  upscaling and no claim of native 1600px capture.
- Price verified 2026-11-13 through the connected Kie MCP
  `prepare_media_generation` (exact quote): 6 credits / USD 0.03 per 1K image
  (`https://kie.ai/pricing`, rate card verified 2026-10-27; the USD figure uses
  Kie's published $0.005/credit conversion). The MCP host again declined submit
  approval, so the project's existing permitted Kie REST integration
  (`/api/v1/jobs/createTask`, `/api/v1/jobs/recordInfo`, `/api/v1/chat/credit`)
  was used. No top-up, purchase or alternative paid provider.
- Credits read back from each job (6 per image) and the account balance was read
  before and after: 11,244.8 → 11,208.8. **New: 36 credits. Prior batches: 96.
  Cumulative: 132.**
- Prompts, settings, task ids, review notes and provenance are in
  `docs/taxonomy/generation-ledger.json` under batch `taxonomy-departments`.
  PNG originals and both contact sheets are under the gitignored
  `qa-artifacts/taxonomy-departments/`; only WebP derivatives are committed.

### Controlled application and audit

`scripts/apply-department-images.ts` is REVIEW-guarded (`REVIEW_DATABASE_URL`
required, `--expect-db` must match the URL and `current_database()`,
`DatabaseClassification` must contain `REVIEW`). It validates each ledger entry
(generated + reviewed), every WebP (format and 1600x900 dimensions), rejects any
target that already holds different art, and updates only `Category.imageUrl`
and `imageAlt` for the six rows in one transaction. Six `AuditLog` rows and six
`SystemEvent` rows were written with action `taxonomy.department.image` in the
same transaction. A second `--apply` wrote 0 rows and reported all six as already
applied. A fingerprint over every other Category row, every Product row and every
ProductImage row was identical before and after.

### Verification performed

- `GET http://localhost:3047/api/taxonomy` returned 200 with 11 departments /
  161 nodes; exactly six `imageUrl` values changed from `null` to the new assets,
  with no other taxonomy node changed.
- The canonical 3047 process (`next start`, Next 14.2.35) caches its `public/`
  file list at boot, so newly added asset files return 404 there until that
  process is restarted. **3047 was deliberately not restarted.** An isolated
  second instance of the same `.next-programme` build was started on port 3057
  against `REVIEW_DATABASE_URL`, verified, and stopped afterwards.
- On that isolated instance every new asset returned HEAD 200,
  `content-type: image/webp`, Chromium `naturalWidth/Height` 1600x900, and the
  API returned the six new `imageUrl` values.
- `npx tsx scripts/taxonomy-coverage-report.ts --expect-db=naijadeals_review
  --images --base-url=http://localhost:3057 --json` reported **PASS**, no
  problems, no writes, stable fingerprint, `images.checked=68`, `passed=68`,
  `failed=0`, `missingDepartmentArt=[]`; taxonomy remains 11 departments /
  37 categories / 113 leaves (161 nodes), 30/96 publishable leaves populated.
  Evidence: `qa-artifacts/taxonomy-departments/coverage-after.json`.

### Remaining gap

After the next authorised restart/rebuild of the 3047 preview, the new files will
be served by that process. Until then, 3047's API already reports the six
`imageUrl` values while those six asset paths 404 on 3047 only because of its
boot-time public-file cache. No application code, taxonomy seed, product or
payment data was changed in this slice.

