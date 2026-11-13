# Marketplace taxonomy research and proposal notes

- Research date: 2026-11-13
- Target database: `naijadeals_review` (classification REVIEW)
- Scope: public category navigation, filters, seller/supplier category presentation, and
  African food/textile vocabulary used by the proposed taxonomy.
- Method: logged-out `WebFetch` of public pages, plus targeted `WebSearch` for regional
  names and informal market measures. No catalogue scraping, no authenticated seller
  journeys, no copied wording or assets.

The machine-readable proposal is `docs/taxonomy/proposal.json`; the authoritative source
is `lib/data/taxonomy.ts`. This note records what was observed, what was inferred, and
what could not be verified.

## 1. Access log

| Reference | URL | Access result | What was observable |
| --- | --- | --- | --- |
| Amazon | https://www.amazon.com/ | 200, logged out, location Bronx 10470 | Department selector with broad departments (Electronics, Computers, Cell Phones & Accessories, Home & Kitchen, Grocery & Gourmet Food, Fashion, Video Games, etc.); separate selling/service links; no storefront taxonomy. |
| Amazon site directory | https://www.amazon.com/gp/site-directory | 404 | The legacy full site directory was unavailable; deeper hierarchy could not be inspected. |
| Alibaba | https://www.alibaba.com/ | 200, logged out, truncated content | Products / Manufacturers / Worldwide tabs; MOQ per product; dedicated Request for Quotation; supplier verification and factory-direct cues; two visible functional levels plus deeper category pages not exposed in the capture. |
| Jumia Nigeria | https://www.jumia.com.ng/catalog/ | 200, logged out | Header category groups; left filter rail (Category, Express Delivery, Price, Discount, Brand, Size, Campaigns, Official Stores, Condition); sort options; seller cues such as "Official Store" and "Jumia Express"; no expandable multi-level tree. |
| Konga | https://www.konga.com/ | 200 but dynamic content largely absent | Promotional category tiles and inline category links; no rendered mega-menu, breadcrumb or filter rail in the capture. Seller cues limited to "Sell on Konga" and "Official Store". |
| Kilimall Kenya | https://www.kilimall.co.ke/ | 200, logged out | Category menu plus "Hot Category" groups (electronics, phones, home, beauty, appliances, computing, clothing, shoes, watches, kids, automotive); two visible levels; no filter rail; separate Seller Center login. |
| Takealot | https://www.takealot.com/ and https://www.takealot.com/all | 403 | Not observable in this session. No behaviour inferred. |

### Limitations

- No authenticated seller/partner category-management screens were inspected. Seller
  taxonomy claims below are limited to public cues.
- Amazon's full department tree, Jumia's expanded category pages, Alibaba category pages,
  Konga's client-rendered menus, and Takealot were not available.
- Public pages differ by country, locale, account state and experiment. The captures are a
  point-in-time observation, not a complete or stable specification.
- No product catalogue, pricing, stock, review text or proprietary imagery was extracted.
- The proposal adapts interaction patterns only. No reference wording or assets are reused.

## 2. Observed patterns

### 2.1 Department versus category versus listing

- Amazon exposes many broad departments in a selector, with seasonal/programme entries
  (deals, Prime, Whole Foods, pharmacy) mixed into navigation. The department list is not
  itself a clean three-level tree, and much merchandising is cross-category.
- Jumia and Kilimall use a shallower public model: a category menu or grouped header, then
  a listing page with filters. Hierarchy is carried by the listing context rather than an
  always-visible tree.
- Alibaba separates products from manufacturers/suppliers. Wholesale is expressed through
  MOQ, quotation requests and supplier verification rather than only a category tree.
- The observed marketplaces consistently allow zero-result or sparse categories to remain
  navigable; the category is a demand/merchandising concept, not proof of live inventory.

### 2.2 Filters

- Jumia's filter rail combines taxonomy (Category), fulfilment (Express Delivery), price,
  discount, brand, size, campaign flags, official stores and condition. Size values mix
  clothing, age, numeric and shoe systems, so a single "size" attribute is not portable
  across departments.
- Alibaba filters and merchandising are supplier/wholesale-oriented: MOQ, verification,
  customisation, samples and quotation.
- Amazon's logged-out page did not expose the full filter rail; no filter claims are made
  beyond the visible department structure.

### 2.3 Seller and supplier presentation

- Amazon, Jumia, Konga and Kilimall treat seller onboarding/management as a separate
  destination (Sell on..., Seller Center). Public category pages carry seller cues such as
  Official Store or express badges, not a seller-owned category tree.
- Alibaba elevates suppliers/manufacturers to a parallel top-level tab and adds RFQ,
  verification and factory-direct signals.
- Implication for NaijaDeals: keep one canonical category tree for customers and sellers;
  seller eligibility and `canPublish` are server-side rules, not separate category
  copies. Wholesale can be represented by listing type, minimum order quantity and
  quotation-oriented attributes within the same tree.

### 2.4 Reference-to-requirement matrix

| Requirement | Observed reference pattern | Proposal response |
| --- | --- | --- |
| Broad discovery | Amazon department selector; Jumia/Kilimall grouped headers | Five departments, each with clear scope and homepage visibility |
| Browsable depth without a heavy tree | Jumia/Kilimall shallow menus plus filters | Three levels: department, category, selectable leaf |
| Zero-inventory categories | Sparse categories remain navigable | Selectable leaves with honest empty states; no fake inventory |
| Seller picks a precise category | Separate seller centres; official-store cues | Seller picker searches names/aliases and publishes only to active selectable leaves |
| Wholesale | Alibaba MOQ, RFQ, supplier verification | `Agriculture & Business` bulk/wholesale nodes with explicit MOQ and metric weight attributes |
| Restricted goods | Not observable in public captures | `canPublish=false` country rules for seeds and fertilizers in NG until review |
| Local relevance | Market-specific navigation and vocabulary | Regional aliases and localized labels, without merging distinct products |

## 3. Proposed taxonomy shape

Counts are generated from `lib/data/taxonomy.ts` and repeated in `proposal.json`:

- 5 departments (level 0)
- 17 categories (level 1), including the nine existing active categories
- 51 subcategories (level 2), all selectable and all with zero seeded products
- 9 existing category ids/slugs/products preserved
- 41 active products remain attached to their current categories
- 2 restricted leaves: `seeds-seedlings`, `fertilizers-crop-nutrition`
- 2 NG `canPublish=false` rules
- 387 aliases (including localized labels), 150 attributes, 2 country rules

Department grouping of the existing nine categories:

| Department | Existing category | New level-1 categories | New level-2 examples |
| --- | --- | --- | --- |
| Electronics & Technology | Phones & Tablets; Computers; Gaming; Electronics & Appliances | — | Smartphones; Laptops; Gaming Consoles; TVs & Home Audio |
| Home & Living | Home & Kitchen; Power & Solar | Household & Cleaning | Cookware & Bakeware; Solar Panels; Inverters & Batteries; Cleaning Supplies |
| Fashion & Beauty | Fashion & Accessories; Beauty & Personal Care | Fabrics & Textiles; Natural & Traditional Beauty | African-Print Fabrics; Handwoven & Dyed Fabrics; Shea & Natural Butters; Traditional Cleansers & Black Soap |
| Food & Everyday Essentials | Groceries & Household Essentials | Grains & Flours; Oils, Soups & Seasonings | Teff Flour; Cassava Products; Maize Meal & Porridge; Palm Oil & Cooking Oils; Soup Thickeners & Seasonings |
| Agriculture & Business | — | Farm Inputs; Processing Equipment; Wholesale & Business Supplies | Seeds & Seedlings; Fertilizers & Crop Nutrition; Cassava Processing Equipment; Bulk Grains & Staples |

### 3.1 Mandated paths

- `food-everyday-essentials` → `grains-flours` → `teff-flour`
- `food-everyday-essentials` → `grains-flours` → `cassava-products`
- `fashion-beauty` → `fabrics-textiles` → `african-print-fabrics`
- `agriculture-business` → `farm-inputs` → `seeds-seedlings`
- `agriculture-business` → `processing-equipment` → `cassava-processing-equipment`
- Home power leaves are under `home-living` → `power-solar`: Solar Panels, Inverters &
  Batteries, Generators & Backup Power.

### 3.2 Existing catalogue preservation

The seed never writes `Product`. It updates only `Category.parentId`, `level`, `key`,
`sortOrder`, `isSelectable`, `showOnHomepage`, `isActive` and `deprecatedAt` for the
existing nine categories. Name, slug, description, imageUrl, imageAlt and isDemo are
preserved. The seed's post-check compares ids, names, presentation fields and per-category
product counts before/after and fails if any change occurred.

## 4. Regional names and inclusion boundaries

Aliases are search vocabulary and localized labels. They are not a claim that two
products are interchangeable.

### 4.1 Grains, cassava and maize

| Term | Observed meaning | Placement | Boundary recorded |
| --- | --- | --- | --- |
| Teff / tef | *Eragrostis tef*, Ethiopian/Eritrean grain used for injera; Amharic ጤፍ, Oromo taffi, Tigrinya taff | `teff-flour` aliases en/fr/pt/sw/ar | Flour leaf; whole teff grain and prepared injera are excluded |
| Garri / gari | Fermented, grated cassava that is pressed, sieved and roasted; eaten as eba or soaked | `cassava-products` aliases en/fr/pt | Distinct from attiéké and cassava flour |
| Attiéké | Fermented, grated cassava that is steamed; Ivorian origin and West African staple | `cassava-products` aliases en/fr | Not a substitute for garri; not wheat couscous |
| Fufu / foutou | Pounded or fermented cassava preparations with regional variants | `cassava-products` aliases en/fr | Product form must be stated; not merged with garri |
| Ugali / ugoli | Stiff maize meal staple in East/Southern Africa; consistency varies | `maize-meal-porridge` aliases en/sw | Different preparation/consistency from pap |
| Pap / ogi / akamu / koko | Fermented maize porridge/pudding, West African breakfast staple; koko is a regional name | `maize-meal-porridge` aliases en | Separate products remain separate listings |
| Sembe / uji | Swahili terms for maize meal and thin porridge | `maize-meal-porridge` aliases sw | Regional label only |

Sources consulted via search summaries: Wikipedia (Teff, Injera, Garri, Attiéké, Ugali,
Pap), FAO AGRIS/PROTA references surfaced in the teff summary, TRT Afrika and NKOSI for
the garri/attiéké processing distinction, and West African food references for pap/ogi/
koko. The search tool returned summaries rather than stable article URLs, so this note
does not assert exact article links.

### 4.2 Oils, thickeners and seasonings

| Term | Meaning | Placement | Boundary |
| --- | --- | --- | --- |
| Palm oil / red oil / zomi | Red palm fruit oil used in West African cooking | `palm-cooking-oils` aliases en | Excludes essential and cosmetic oils |
| Egusi | Ground melon seed used to thicken soup | `soup-thickeners-seasonings` aliases en | Different from ogbono |
| Ogbono | Ground wild mango (*Irvingia gabonensis*) seed; produces "draw" | `soup-thickeners-seasonings` aliases en | Different from egusi |
| Iru / dawadawa / daddawa | Fermented African locust bean (*Parkia biglobosa*) seasoning; Yoruba iru, Hausa dawadawa | `soup-thickeners-seasonings` aliases en | Not merged with ogiri or soumbala |
| Soumbala / néré / sumbala | West African fermented locust-bean condiment under French/West African names | `soup-thickeners-seasonings` aliases fr/pt/sw | Regional naming; product identity still declared by seller |

Search summaries referenced Wikipedia (Egusi, Irvingia gabonensis, Parkia biglobosa,
Iru food) and TasteAtlas/regional food references. No catalogue text was copied.

### 4.3 Shea and black soap

| Term | Meaning | Placement | Boundary |
| --- | --- | --- | --- |
| Shea / shea butter / karité / nkuto | Shea (*Vitellaria paradoxa*) butter; Twi nkuto, French karité | `shea-natural-butters` aliases en/fr/pt/sw/ar | Cosmetic-grade leaf; food-grade shea needs separate food-safety review |
| Black soap / ose dudu / alata samina / sabulun salo / ncha nkota | Traditional West African soaps made with plant ash and oils; regional names differ | `traditional-cleansers-black-soap` aliases en/fr/pt/sw/ar | Distinct soaps remain distinct listings; no therapeutic claims |

The search summary explicitly confirmed ose dudu (Yoruba), sabulun salo (Hausa), ncha
nkota (Igbo) and alata samina (Ghana). It noted that shea terms nkuto/karité are
well-established but were not all detailed in that capture; the proposal treats them as
search labels, not product equivalence claims.

### 4.4 African textiles

| Term | Production tradition | Placement | Boundary |
| --- | --- | --- | --- |
| Ankara | West African market term for printed cotton, often wax-resist or roller print | `african-print-fabrics` aliases en | Not every print is genuine wax print |
| Kitenge / chitenge | East African printed cotton, wax or roller print | `african-print-fabrics` aliases en | Regional name for printed cloth |
| Shweshwe | Southern African discharge-printed cotton, historically indigo | `african-print-fabrics` aliases en | Not a wax print |
| Kente | Ashanti/Ewe handwoven strip-weave, Ghana | `handwoven-dyed-fabrics` aliases en/pt | Not an industrial print |
| Aso-oke | Yoruba handwoven narrow-strip cloth, Nigeria | `handwoven-dyed-fabrics` aliases en | Not a print |
| Adire | Yoruba indigo resist-dyed cloth, Nigeria | `handwoven-dyed-fabrics` aliases en | Dyed, not printed |
| Bogolan / mud cloth | Bamana handwoven cotton with fermented mud/plant dyes, Mali | `handwoven-dyed-fabrics` aliases en/fr/pt | Distinct from wax print |

The search summary distinguished printed (ankara, kitenge, shweshwe), handwoven (kente,
aso-oke) and hand-dyed (adire, bogolan) traditions. The taxonomy keeps printed and
handwoven/dyed in separate leaves and records that the aliases are not synonyms.

## 5. Informal market measures

`mudu`, paint bucket ("paint rubber"), basket, bag and similar containers are used in
Nigerian markets, but their sizes are not standardized. Search summaries cited:

- World Bank LSMS conversion-factor work showing measured mudu weights varying by region
  (roughly 0.77–1.07 kg for small mudu and 1.20–1.41 kg for large mudu, with different
  national factors).
- Anecdotal rules of thumb such as 1 mudu ≈ 8 milk cups and 1 paint bucket ≈ 3 mudu,
  which conflict with other estimates and vary by city, commodity and whether the
  container is level or heaped.
- Evidence that the Kano mudu has been described as roughly twice the Kaduna/Abuja mudu.

Therefore the proposal does **not** encode any mudu/paint-bucket/basket/bag conversion.
`bulk-grains-staples` requires `net_weight_kg` and `minimum_order_quantity`, and its
description states that the seller must declare an explicit metric weight or volume. No
automatic conversion is assumed anywhere in the seed or APIs.

## 6. Regulated and uncertain leaves

| Leaf | Restriction | Reason |
| --- | --- | --- |
| `seeds-seedlings` | NG `canPublish=false`; `reviewRequired=true` | Seed certification and quality-control requirements; certification evidence must be reviewed |
| `fertilizers-crop-nutrition` | NG `canPublish=false`; `reviewRequired=true` | Fertilizer quality-control and registration requirements; registration evidence must be reviewed |

Other leaves are publishable by default. The proposal deliberately does not create
pesticides, veterinary medicines, herbal medicines or other regulated product leaves as
publishable categories. `natural-traditional-beauty` records a no-therapeutic-claims
review note but is not itself a regulated goods restriction.

Country rules are per country; only NG rules were researched and recorded. Default
`canPublish=true` for other countries does not assert regulatory clearance there. A market
launch must add its own rule after local review.

## 7. Zero-inventory and demo handling

- All 51 new level-2 leaves are selectable with zero seeded products.
- The existing nine categories remain selectable because their 41 active demo products
  stay attached. The seed does not move products into the new leaves.
- New taxonomy nodes are not marked `isDemo`; they are structural categories, not supply.
  Existing categories keep `isDemo=true` and their demo descriptions.
- Empty categories must render an honest empty state; no fabricated inventory, ratings or
  sales are introduced.

## 8. Open limitations and next verification

- Seller/partner category screens at Amazon, Jumia, Kilimall, Konga, Alibaba and Takealot
  were not authenticated and are not claimed as inspected.
- Alibaba's deeper category tree, Jumia's expanded category pages and Konga's
  client-rendered navigation were not observable.
- Takealot returned 403; its category model is not represented in this research.
- Marketplace category names and filter sets change by country, language and experiment.
  The proposal is a NaijaDeals design decision, not a claim of reference parity.
- Translation labels were researched selectively. They are search aliases, not a claim of
  complete professional localization; a locale review is still required before launch.
- No imagery was generated or changed. Approved existing category images are preserved.
