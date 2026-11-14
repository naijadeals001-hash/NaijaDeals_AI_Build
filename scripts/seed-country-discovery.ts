/**
 * Seed the reviewed Discover Africa editorial registry into a database.
 *
 * Usage (REVIEW database only):
 *   DATABASE_URL=<review-url> npx tsx scripts/seed-country-discovery.ts
 *
 * The script is intentionally not part of the application runtime. It refuses
 * any database whose name is not an explicitly REVIEW/test database so a
 * production or daily-development database cannot be seeded by accident.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Source = { title: string; url: string; accessedAt: string; publisher?: string };
type Theme = { key: string; label: string; association: string; sources: Source[] };
type Country = {
  code: string;
  slug: string;
  name: string;
  region: string;
  localizedNames?: Record<string, string>;
  introduction: string;
  themes: Theme[];
  editorialStatus?: string;
};
type RegionFile = { region: string; countries: Country[] };

const REGION_ORDER = ["North Africa", "West Africa", "Central Africa", "East Africa", "Southern Africa"];
const RESEARCH_FILES = [
  "north-africa.json",
  "west-africa.json",
  "central-africa.json",
  "east-africa.json",
  "southern-africa.json"
];

const TAXONOMY = "/generated/taxonomy";
const FRESH = "/generated/fresh";
const SHOP = "/generated/shop";
const COUNTRIES = "/generated/countries";

const EXISTING: Record<string, { url: string; alt: string }> = {
  cocoa: { url: `${FRESH}/prod-cocoa-pods.webp`, alt: "Cocoa pods and beans" },
  vanilla: { url: `${FRESH}/prod-vanilla-pods.webp`, alt: "Cured vanilla pods" },
  cloves: { url: `${FRESH}/prod-zanzibar-cloves.webp`, alt: "Dried cloves" },
  cashew: { url: `${FRESH}/prod-raw-cashew-nuts.webp`, alt: "Raw cashew nuts" },
  shea: { url: `${TAXONOMY}/shea-butter.webp`, alt: "Shea butter" },
  rice: { url: `${FRESH}/prod-local-rice.webp`, alt: "Local rice" },
  maize: { url: `${FRESH}/prod-maize.webp`, alt: "Maize cobs" },
  millet: { url: `${FRESH}/prod-millet.webp`, alt: "Millet grain" },
  teff: { url: `${FRESH}/prod-white-teff.webp`, alt: "White teff grain" },
  plantain: { url: `${FRESH}/prod-plantain.webp`, alt: "Plantain" },
  banana: { url: `${FRESH}/prod-sweet-bananas.webp`, alt: "Sweet bananas" },
  cassava: { url: `${FRESH}/prod-cassava.webp`, alt: "Cassava tubers" },
  avocado: { url: `${FRESH}/prod-hass-avocado.webp`, alt: "Avocado" },
  mango: { url: `${FRESH}/prod-mangoes.webp`, alt: "Mangoes" },
  citrus: { url: `${FRESH}/prod-oranges.webp`, alt: "Citrus fruit" },
  pineapple: { url: `${FRESH}/prod-pineapple.webp`, alt: "Pineapple" },
  groundnut: { url: `${FRESH}/prod-groundnuts.webp`, alt: "Groundnuts" },
  soybean: { url: `${FRESH}/prod-soya-beans.webp`, alt: "Soybeans" },
  fish: { url: `${FRESH}/prod-tilapia.webp`, alt: "Fresh fish" },
  seafood: { url: `${FRESH}/cat-fish-seafood.webp`, alt: "Seafood" },
  poultry: { url: `${FRESH}/prod-live-broiler-chicken.webp`, alt: "Live poultry" },
  potato: { url: `${FRESH}/prod-irish-potatoes.webp`, alt: "Potatoes" },
  beans: { url: `${FRESH}/prod-brown-beans.webp`, alt: "Beans" },
  coconut: { url: `${FRESH}/prod-fresh-coconuts.webp`, alt: "Fresh coconuts" },
  spices: { url: `${FRESH}/farm-demo-tunde-spices.webp`, alt: "Spices" },
  pepper: { url: `${FRESH}/prod-scotch-bonnet-pepper.webp`, alt: "Pepper" },
  herbs: { url: `${FRESH}/cat-herbs-spices.webp`, alt: "Herbs and spices" },
  crafts: { url: `${TAXONOMY}/category-art-craft.webp`, alt: "Handcrafted goods" },
  baskets: { url: `${TAXONOMY}/woven-baskets.webp`, alt: "Woven baskets" },
  textiles: { url: `${TAXONOMY}/african-print-fabrics.webp`, alt: "Printed textiles" },
  fashion: { url: `${SHOP}/category-fashion.webp`, alt: "Apparel" },
  leather: { url: `${SHOP}/product-red-patent-leather-baby-shoes.webp`, alt: "Leather goods" },
  soap: { url: `${TAXONOMY}/black-soap.webp`, alt: "Soap" },
  solar: { url: `${SHOP}/product-rooftop-solar-panel-array.webp`, alt: "Solar panels" },
  laptop: { url: `${SHOP}/product-14-inch-business-laptop.webp`, alt: "Laptop workspace" },
  port: { url: `/generated/home/home-hero-send.webp`, alt: "Freight trucks and warehouse" },
  "illustration-minerals": { url: `${COUNTRIES}/illustration-minerals.svg`, alt: "Vector illustration of mineral specimens" },
  "illustration-energy": { url: `${COUNTRIES}/illustration-energy.svg`, alt: "Vector illustration of energy infrastructure" },
  "illustration-tourism": { url: `${COUNTRIES}/illustration-tourism.svg`, alt: "Vector illustration of an African savanna landscape" },
  "illustration-pottery": { url: `${COUNTRIES}/illustration-pottery.svg`, alt: "Vector illustration of handmade pottery" },
  "illustration-furniture": { url: `${COUNTRIES}/illustration-furniture.svg`, alt: "Vector illustration of wooden furniture" },
  "illustration-fruit": { url: `${COUNTRIES}/illustration-fruit.svg`, alt: "Vector illustration of fruit in a bowl" },
  "illustration-grain": { url: `${COUNTRIES}/illustration-grain.svg`, alt: "Vector illustration of grain in a basket" },
  "illustration-wool": { url: `${COUNTRIES}/illustration-wool.svg`, alt: "Vector illustration of a ball of wool" },
  "illustration-leaf": { url: `${COUNTRIES}/illustration-leaf.svg`, alt: "Vector illustration of a tobacco leaf" },
  "illustration-flower": { url: `${COUNTRIES}/illustration-flower.svg`, alt: "Vector illustration of a flower" },
  "illustration-bottle": { url: `${COUNTRIES}/illustration-bottle.svg`, alt: "Vector illustration of a bottle and glass" },
  "illustration-water": { url: `${COUNTRIES}/illustration-water.svg`, alt: "Vector illustration of a water bottle" },
  "illustration-auto": { url: `${COUNTRIES}/illustration-auto.svg`, alt: "Vector illustration of automotive components" },
  "illustration-factory": { url: `${COUNTRIES}/illustration-factory.svg`, alt: "Vector illustration of a factory" },
  "illustration-boat": { url: `${COUNTRIES}/illustration-boat.svg`, alt: "Vector illustration of a boat under construction" },
  "illustration-hydropower": { url: `${COUNTRIES}/illustration-hydropower.svg`, alt: "Vector illustration of a hydropower dam" },
  "illustration-gas": { url: `${COUNTRIES}/illustration-gas.svg`, alt: "Vector illustration of a gas pipeline and flame" },
  "illustration-carpet": { url: `${COUNTRIES}/illustration-carpet.svg`, alt: "Vector illustration of a woven carpet" },
  "illustration-weaving": { url: `${COUNTRIES}/illustration-weaving.svg`, alt: "Vector illustration of a handloom" },
  "illustration-craft": { url: `${COUNTRIES}/illustration-craft.svg`, alt: "Vector illustration of a carved stone sculpture" },
  "illustration-imigongo": { url: `${COUNTRIES}/illustration-imigongo.svg`, alt: "Vector illustration of a geometric Imigongo panel" },
  "illustration-candle": { url: `${COUNTRIES}/illustration-candle.svg`, alt: "Vector illustration of handcrafted candles" },
  "illustration-mushroom": { url: `${COUNTRIES}/illustration-mushroom.svg`, alt: "Vector illustration of wild mushrooms" },
  "illustration-leather": { url: `${COUNTRIES}/illustration-leather.svg`, alt: "Vector illustration of a leather hide and tool" },
  "illustration-rubber": { url: `${COUNTRIES}/illustration-rubber.svg`, alt: "Vector illustration of rubber tapping" },
  "figs-dates": { url: `${COUNTRIES}/theme-figs-dates.webp`, alt: "Figs and dates" },
  irrigation: { url: `${FRESH}/farm-demo-casamance-rice.webp`, alt: "Irrigated rice fields" },
  produce: { url: `${FRESH}/cat-fruits.webp`, alt: "Fresh fruit and produce" },
  island: { url: `/generated/home/home-hero-stay.webp`, alt: "Coastal hospitality and tourism" }
};

function generated(name: string, alt: string) {
  const file = `${COUNTRIES}/theme-${name}.webp`;
  if (!existsSync(path.join(process.cwd(), "public", file))) return null;
  return { url: file, alt, kind: "GENERATED", provenance: `Kie.ai gpt-image-2-5-flare, 1K, generated 2026-11-14; task/prompt in docs/countries/imagery-manifest.md` };
}

/**
 * Theme imagery is editorial illustration, never a stock/supply claim. Matching
 * is by theme key first and visible label second. Every association still has a
 * source record; the image only illustrates the stated theme.
 */
function themeImage(key: string, label: string): { url: string; alt: string; kind: string; provenance: string } {
  const generatedCandidates: Array<[RegExp, { url: string; alt: string; kind?: string; provenance?: string } | null]> = [
    [/coffee|fogo-coffee/i, generated("coffee", "Green and roasted coffee beans")],
    [/tea|rooibos/i, generated("tea", "Tea leaves and brewed tea")],
    [/cotton/i, generated("cotton", "Cotton bolls")],
    [/honey|beeswax/i, generated("honey", "Honey and honeycomb")],
    [/(^|[^a-z])(timber|wood|forestry)([^a-z]|$)/i, generated("timber", "Stacked hardwood planks")],
    [/sugar|cane-sugar/i, generated("sugar", "Raw cane sugar and sugarcane")],
    [/gold/i, generated("gold", "Raw gold nuggets")],
    [/sesame/i, generated("sesame", "Sesame seeds")],
    [/palm-oil|palm-kernel/i, generated("palm-oil", "Red palm oil and palm fruit")],
    [/gum-arabic|frankincense|olibanum|myrrh/i, generated("gum-resin", "Amber gum resin")],
    [/livestock|beef|pastoral|hides/i, generated("cattle", "Cattle in dry grassland")],
    [/olive-oil|olive/i, generated("olive-oil", "Olive oil and olives")],
    [/sorghum|millet|fonio|teff|cereals|coarse-grains/i, generated("grains", "Small grains")],
    [/groundnuts|peanut/i, generated("groundnuts", "Groundnuts")],
    [/diamond/i, generated("diamonds", "Rough diamond crystals")],
    [/iron-ore/i, generated("iron-ore", "Iron ore rocks")],
    [/bauxite/i, generated("bauxite", "Bauxite ore")],
    [/rubber/i, generated("rubber", "Natural rubber sheets")],
    [/wool|mohair|swakara/i, generated("wool", "Wool fleece and yarn")],
    [/tobacco/i, generated("tobacco", "Tobacco leaves")],
    [/macadamia/i, generated("macadamia", "Macadamia nuts")],
    [/uranium/i, generated("uranium", "Mineral ore sample")],
    [/horticulture|vegetable|potato/i, generated("vegetables", "Fresh vegetables")],
    [/tourism|ecotourism|heritage|island|blue-economy/i, generated("tourism", "Broad African landscape")],
    [/salt/i, generated("salt", "Salt crystals")],
    [/port|transit|logistics|free-zone/i, generated("port", "Container port")],
    [/flower/i, generated("flowers", "Cut flowers")],
    [/litchi|lychee/i, generated("litchi", "Lychee fruit")],
    [/raffia|doum|mat/i, generated("raffia", "Woven raffia fibre")],
    [/rum|spirits/i, generated("rum", "Rum bottle")],
    [/cinnamon/i, generated("cinnamon", "Cinnamon sticks")],
    [/boat|marine/i, generated("boat", "Wooden boat under construction")],
    [/sisal/i, generated("sisal", "Sisal fibre")],
    [/figs|dates?|deglet|date-palm/i, generated("figs-dates", "Figs and dates")],
    [/couscous/i, generated("couscous", "Couscous")],
    [/carpet/i, generated("carpets", "Woven carpet")],
    [/pottery|ceramic|gharyan/i, generated("pottery", "Ceramic pottery")],
    [/furniture/i, generated("furniture", "Wooden furniture")],
    [/argan/i, generated("argan", "Argan nuts and oil")],
    [/henna/i, generated("henna", "Henna powder")],
    [/tamarind/i, generated("tamarind", "Tamarind pods")],
    [/harissa/i, generated("harissa", "Red chilli paste")],
    [/chechia/i, generated("chechia", "Red felt cap")],
    [/soda-ash/i, generated("soda-ash", "White mineral powder")],
    [/wiring|automotive/i, generated("wiring", "Automotive wiring")],
    [/copper/i, generated("copper", "Copper ore and cathode")],
    [/candle/i, generated("candles", "Handcrafted candles")],
    [/coal/i, generated("coal", "Coal")],
    [/aluminium/i, generated("aluminium", "Aluminium ingots")],
    [/wine/i, generated("wine", "Wine bottle and glass")],
    [/stone-sculpture|sculpture/i, generated("stone-sculpture", "Carved stone")],
    [/phosphate/i, generated("phosphate", "Phosphate rock")],
    [/lithium/i, generated("lithium", "Lithium ore")],
    [/oil-and-gas|natural-gas|hydrocarbon|oil\b|gas\b/i, generated("oil-gas", "Oil and gas infrastructure")],
    [/hydropower/i, generated("hydropower", "Hydropower turbine")],
    [/manufacturing|factory|export-manufacturing/i, generated("manufacturing", "Manufacturing workshop")],
    [/chocolate/i, generated("chocolate", "Chocolate bars")],
    [/ylang-ylang/i, generated("ylang-ylang", "Ylang-ylang flowers")],
    [/bottled-water|highland-water/i, generated("bottled-water", "Bottled water")],
    [/digital|export-services|services\b/i, generated("digital-services", "Digital work")],
    [/apparel|garment|ready-made/i, EXISTING.textiles],
    [/basket|agaseke/i, EXISTING.baskets],
    [/footwear/i, EXISTING.leather],
    [/cosmetic|perfume/i, EXISTING.soap],
    [/renewable|solar/i, EXISTING.solar]
  ];

  const needle = `${key} ${label}`;
  for (const [pattern, image] of generatedCandidates) {
    if (!pattern.test(needle) || !image) continue;
    return {
      url: image.url,
      alt: image.alt,
      kind: image.kind ?? "APPROVED_EXISTING",
      provenance: image.provenance ?? "Approved project asset reused; provenance in docs/countries/imagery-manifest.md"
    };
  }

  const families: Array<[RegExp, string]> = [
    [/rubber/i, "illustration-rubber"],
    [/hydropower/i, "illustration-hydropower"],
    [/natural-gas|gas/i, "illustration-gas"],
    [/irrigated/i, "irrigation"],
    [/agri-food|agro-food|agroforestry|food-crops/i, "produce"],
    [/blue-economy/i, "seafood"],
    [/island|ecotourism|bijag[oó]s/i, "island"],
    [/cocoa|chocolate/i, "cocoa"],
    [/coconut|copra/i, "coconut"],
    [/macadamia/i, "cashew"],
    [/swakara/i, "illustration-leather"],
    [/carpet|flat-weave/i, "illustration-carpet"],
    [/imigongo/i, "illustration-imigongo"],
    [/doum-palm/i, "illustration-fruit"],
    [/chechia|fugu|bogolan|barkcloth|woven|handwoven|raffia|doum|mat/i, "illustration-weaving"],
    [/stone-sculpture|sculpture/i, "illustration-craft"],
    [/candle/i, "illustration-candle"],
    [/mushroom/i, "illustration-mushroom"],
    [/date-palm|dates|deglet/i, "figs-dates"],
    [/leather|hides|skins|footwear/i, "illustration-leather"],
    [/mineral|diamond|copper|iron-ore|bauxite|uranium|lithium|phosphate|soda-ash|coal|aluminium|rutile|jewellery|gemstone/i, "illustration-minerals"],
    [/tourism|ecotourism|island|blue-economy|heritage/i, "illustration-tourism"],
    [/pottery|ceramic|gharyan/i, "illustration-pottery"],
    [/furniture/i, "illustration-furniture"],
    [/litchi|carob|tamarind|breadfruit|coco-de-mer|wild-fruits|wild-edible|cactus|mushroom|doum-palm/i, "illustration-fruit"],
    [/couscous|cereals|bran|fonio|teff|sorghum|millet|coarse-grains/i, "illustration-grain"],
    [/wool|mohair|swakara/i, "illustration-wool"],
    [/tobacco/i, "illustration-leaf"],
    [/flower|ylang|henna/i, "illustration-flower"],
    [/wine|rum|spirits|olive|argan/i, "illustration-bottle"],
    [/(oil|gas|hydrocarbon|hydropower)/i, "illustration-energy"],
    [/bottled-water|highland-water/i, "illustration-water"],
    [/automotive|wiring|electric/i, "illustration-auto"],
    [/manufacturing|factory|export-manufacturing/i, "illustration-factory"],
    [/boat|marine/i, "illustration-boat"],
    [/basket|agaseke|imigongo|palm-crafts|stone-sculpture|raffia|doum|mat|craft|handicraft/i, "baskets"],
    [/textile|apparel|garment|woven|barkcloth|bogolan|fugu|chechia/i, "textiles"],
    [/spice|pepper|cinnamon|harissa|flavour|cardamom|ginger|berbere/i, "spices"],
    [/macadamia|groundnut|peanut|nut/i, "groundnut"],
    [/port|transit|logistics|free-zone|shipping/i, "port"],
    [/(digital|export-services|services)/i, "laptop"],
    [/cocoa|chocolate/i, "cocoa"],
    [/vanilla/i, "vanilla"],
    [/clove/i, "cloves"],
    [/cashew/i, "cashew"],
    [/shea/i, "shea"],
    [/rice/i, "rice"],
    [/maize|corn/i, "maize"],
    [/plantain|matoke/i, "plantain"],
    [/banana/i, "banana"],
    [/cassava|gari/i, "cassava"],
    [/avocado/i, "avocado"],
    [/mango/i, "mango"],
    [/citrus|orange/i, "citrus"],
    [/pineapple/i, "pineapple"],
    [/soy/i, "soybean"],
    [/tuna|fish|fisher|seafood|trout|aquaculture/i, "fish"],
    [/poultry|egg/i, "poultry"],
    [/potato|horticulture|vegetable/i, "potato"],
    [/bean|pulse/i, "beans"],
    [/coconut|copra/i, "coconut"],
    [/herb|medicinal|aromatic/i, "herbs"],
    [/leather|hides|skins|footwear/i, "leather"],
    [/soap|cosmetic|perfume/i, "soap"],
    [/solar|renewable|energy/i, "solar"],
    [/timber|wood|forestry|rubber|sisal/i, "timber"],
    [/honey|beeswax/i, "honey"],
    [/cotton/i, "cotton"],
    [/sugar|cane/i, "sugar"],
    [/sesame/i, "sesame"],
    [/palm/i, "palm-oil"],
    [/gum|frankincense|olibanum|myrrh/i, "gum-resin"],
    [/livestock|beef|pastoral/i, "cattle"],
    [/salt/i, "illustration-minerals"]
  ];
  const match = families.find(([pattern]) => pattern.test(needle));
  const existingKey = match ? match[1] : "baskets";
  const image = EXISTING[existingKey] ?? EXISTING.baskets;
  const illustration = image.url.includes("/illustration-");
  return {
    ...image,
    kind: illustration ? "ILLUSTRATION" : "APPROVED_EXISTING",
    provenance: illustration
      ? "Original code-native NaijaDeals vector illustration; not a photograph or country-specific product claim"
      : "Approved project asset reused; provenance in docs/countries/imagery-manifest.md"
  };
}

function loadCountries(): Country[] {
  const all: Country[] = [];
  for (const file of RESEARCH_FILES) {
    const raw = JSON.parse(readFileSync(path.join(process.cwd(), "docs", "countries", "research", file), "utf8")) as RegionFile;
    all.push(...raw.countries);
  }
  return all;
}

function assertReviewDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  let name = "";
  try {
    name = new URL(url).pathname.replace(/^\//, "");
  } catch {
    // handled below
  }
  if (!name || !/(review|test)/i.test(name)) {
    throw new Error(`Refusing to seed ${name || "an unidentified database"}: set DATABASE_URL to an isolated REVIEW/test database.`);
  }
}

async function assertReviewClassification() {
  const rows = await prisma.databaseClassification.findMany({ select: { classification: true } });
  if (!rows.some((row) => row.classification === "REVIEW")) {
    throw new Error("Refusing to seed: the database is not classified REVIEW.");
  }
}

async function main() {
  assertReviewDatabase();
  await assertReviewClassification();
  const countries = loadCountries();
  if (countries.length !== 54) throw new Error(`Expected 54 countries, found ${countries.length}.`);
  const codes = new Set(countries.map((country) => country.code));
  if (codes.size !== countries.length) throw new Error("Duplicate country codes in research files.");

  for (const country of countries) {
    if (country.themes.length !== 6) throw new Error(`${country.code} has ${country.themes.length} themes, expected 6.`);
    for (const theme of country.themes) {
      if (theme.sources.length === 0) throw new Error(`${country.code}/${theme.key} has no source.`);
    }
  }

  let published = 0;
  let themes = 0;
  let sources = 0;
  const created: string[] = [];

  for (const [index, country] of countries.entries()) {
    if (country.editorialStatus !== "reviewed") {
      throw new Error(`${country.code} is not editorially reviewed; refusing to publish an unreviewed country.`);
    }
    const regionIndex = REGION_ORDER.indexOf(country.region);
    const sortOrder = (regionIndex < 0 ? REGION_ORDER.length : regionIndex) * 1000 + index;
    const profile = await prisma.countryProfile.upsert({
      where: { code: country.code },
      create: {
        code: country.code,
        slug: country.slug,
        name: country.name,
        region: country.region,
        localizedNames: country.localizedNames ?? { en: country.name },
        introduction: country.introduction,
        editorialStatus: "REVIEWED",
        publicationStatus: "PUBLISHED",
        homeFeatured: false,
        sortOrder,
        publishedAt: new Date(),
        publishedBy: "system:seed"
      },
      update: {
        slug: country.slug,
        name: country.name,
        region: country.region,
        localizedNames: country.localizedNames ?? { en: country.name },
        introduction: country.introduction,
        editorialStatus: "REVIEWED",
        sortOrder
      }
    });
    created.push(profile.code);
    published += 1;

    for (const [themeIndex, theme] of country.themes.entries()) {
      const image = themeImage(theme.key, theme.label);
      const row = await prisma.countryTheme.upsert({
        where: { countryCode_key: { countryCode: country.code, key: theme.key } },
        create: {
          countryCode: country.code,
          key: theme.key,
          label: theme.label,
          association: theme.association,
          imageUrl: image.url,
          imageAlt: `${image.alt}. Illustrative image for the ${theme.label} theme.`,
          imageKind: image.kind,
          imageProvenance: image.provenance,
          sortOrder: themeIndex,
          editorialStatus: "REVIEWED"
        },
        update: {
          label: theme.label,
          association: theme.association,
          imageUrl: image.url,
          imageAlt: `${image.alt}. Illustrative image for the ${theme.label} theme.`,
          imageKind: image.kind,
          imageProvenance: image.provenance,
          sortOrder: themeIndex,
          editorialStatus: "REVIEWED"
        }
      });
      themes += 1;
      await prisma.countryThemeSource.deleteMany({ where: { themeId: row.id } });
      for (const [sourceIndex, source] of theme.sources.entries()) {
        await prisma.countryThemeSource.create({
          data: {
            themeId: row.id,
            title: source.title,
            publisher: source.publisher ?? null,
            url: source.url,
            accessedAt: new Date(`${source.accessedAt}T00:00:00.000Z`),
            sortOrder: sourceIndex
          }
        });
        sources += 1;
      }
    }
  }

  const counts = {
    countries: await prisma.countryProfile.count(),
    published: await prisma.countryProfile.count({ where: { publicationStatus: "PUBLISHED" } }),
    themes: await prisma.countryTheme.count(),
    sources: await prisma.countryThemeSource.count(),
    unreviewed: await prisma.countryProfile.count({ where: { editorialStatus: "NEEDS_REVIEW" } })
  };
  console.log(JSON.stringify({ seeded: { countries: created.length, published, themes, sources }, counts }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
