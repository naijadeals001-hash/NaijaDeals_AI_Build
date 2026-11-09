/**
 * NaijaFresh image generator (Kie.ai GPT Image 2, 1K tier).
 *
 * Standing directive: every NaijaFresh image is generated via Kie.ai — no stock
 * photography, no placeholders. This covers the hero, all nine category tiles,
 * every produce listing card, every farm portrait and the promotional bands.
 *
 * Verified live API (2026-11-08): POST /api/v1/jobs/createTask with model
 * "gpt-image-2-text-to-image" + input.size "1K"; results polled via
 * /api/v1/jobs/recordInfo; observed cost 6 credits ≈ $0.03 per image.
 *
 * Usage:
 *   node --env-file=.env scripts/generate-fresh-images.mjs --plan      # manifest + cost estimate, no spend
 *   node --env-file=.env scripts/generate-fresh-images.mjs --only hero,cat-tomatoes
 *   node --env-file=.env scripts/generate-fresh-images.mjs             # generate everything pending
 */
import fs from "node:fs";
import path from "node:path";

const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = process.env.KIE_MODEL ?? "gpt-image-2-text-to-image";
const SIZE = process.env.KIE_IMAGE_SIZE ?? "1K";
const CREDITS_PER_IMAGE = 6;
const USD_PER_CREDIT = 0.005;
const POLL_INTERVAL_MS = 15000;
const MAX_POLLS = 40;
const MAX_RETRIES = 2;
const REGISTRY_PATH = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT_DIR = path.join(process.cwd(), "public", "generated", "fresh");

const STYLE =
  "Photorealistic editorial food-marketplace photography, natural golden daylight, rich authentic colours, shallow depth of field, premium African farm-to-table campaign quality, no text, no words, no watermark, no logo";

/** Produce shots: one per listing. Keyed by listing slug. */
const PRODUCE = {
  "fresh-tomatoes": "a shallow wooden crate of ripe red Roma tomatoes freshly picked with green stems, on rough sackcloth",
  "fresh-red-pepper": "a heap of glossy ripe red tatashe peppers in a woven basket",
  "scotch-bonnet-pepper": "a mound of small fiery orange-red Scotch bonnet peppers in a calabash bowl",
  "ugu-leaves": "fresh green fluted pumpkin leaves tied in neat bundles with raffia on a farm bench",
  "scent-leaf": "a bundle of fresh scent leaf herb tied with twine beside a wooden bowl",
  waterleaf: "tender waterleaf bunches, vibrant green, laid out on a wet wooden cutting board",
  cocoyam: "fresh cocoyam (taro) corms with hairy brown skin piled in a woven basket",
  "kontomire-cocoyam-leaves": "fresh cocoyam leaves (kontomire) tied in bunches on a wet market bench",
  cucumbers: "fresh green cucumbers stacked on a wet market table",
  "green-amaranth": "fresh green amaranth leaf bunches stacked neatly in a basket",
  "white-yam": "several large white yam tubers with pale skin resting on dry soil and straw",
  "white-yam-big-tubers": "very large white yam tubers stacked upright in a farm shed",
  "cassava-tubers": "fresh cassava roots with bark peeled back at the ends, in a basket",
  "irish-potatoes": "washed Irish potatoes piled in an open burlap sack",
  "rwandan-irish-potatoes": "fresh Irish potatoes spilling from a woven basket onto dark soil",
  "local-rice": "cleaned white local rice overflowing from an open 50kg jute bag",
  "brown-beans": "oloyin brown beans piled in a shallow woven tray",
  maize: "dried yellow maize kernels heaped in a woven basket",
  white: "white maize",
  eggs: "farm eggs",
  "farm-eggs": "a full tray of fresh brown farm eggs on a rustic wooden table",
  "live-broiler-chicken": "a healthy live broiler chicken standing in a sunlit farm pen",
  oranges: "oranges spilling from a raffia basket onto a farm table",
  "kenyan-oranges": "juicy oranges stacked in a wooden crate",
  "navel-oranges": "navel oranges piled high in a wooden crate in bright orchard light",
  mangoes: "ripe yellow-red mangoes arranged in a shallow basket",
  "apple-mangoes": "sweet apple mangoes heaped in a crate in warm orchard sunlight",
  pineapple: "whole ripe pineapples with leafy crowns arranged in a basket",
  "fresh-ginger": "fresh ginger rhizomes with earthy knobbly texture piled on a wooden board",
  garlic: "dried white garlic bulbs in a small woven basket",
  "ethiopian-garlic": "aromatic garlic bulbs bursting from a burlap sack",
  "ginger-root": "fresh ginger root pieces scattered on a dark wooden surface",
  "locust-bean": "dark fermented locust bean (iru) packed into a small wooden bowl",
  "locust-bean-iru": "dark fermented locust bean (iru) packed into a small wooden bowl",
  "apem-plantain": "green Apem plantain bunches stacked on a wooden pallet",
  "unripe-plantain": "green unripe plantain bunches piled on a farm barrow",
  plantain: "mixed ripe and green plantain bunches in a farm courtyard",
  "cassava-gari-variety": "fresh cassava roots for gari processing bundled in a jute sack",
  cassava: "fresh cassava roots with pale flesh in a woven basket",
  "cocoa-pods": "fresh yellow and orange cocoa pods split open showing white beans",
  "garden-eggs": "white and green garden eggs heaped in a raffia basket",
  "kpakpo-shito-pepper": "small hot kpakpo shito green peppers in a calabash bowl",
  "sukuma-wiki-kale": "fresh green kale bunches tied together on a market bench",
  "roma-tomatoes": "Roma tomatoes piled in a wooden crate, one split open showing fresh flesh",
  "hass-avocado": "Hass avocados with dark textured skin stacked in a wooden bowl",
  "fuerte-avocado": "smooth green Fuerte avocados arranged in a shallow basket",
  "kilimanjaro-avocado": "firm green avocados piled beside a mountain farm vista",
  "passion-fruit": "purple passion fruit cut and whole, arranged on a wooden board",
  "table-grapes": "bunches of seedless table grapes in a vineyard crate",
  "white-maize": "milled white maize in a burlap sack with grain spilling out",
  "zambian-white-maize": "white maize grain heaped in a wide woven basket",
  "ndol-leaves": "washed ndolé leaves tied in neat bundles on a wet stone sink",
  "cocoyam-taro": "fresh cocoyam tubers with hairy brown skin in a basket",
  "bitter-leaf": "fresh bittersweet green bitter leaf bunches tied with twine",
  "cameroon-tomatoes": "plump tomatoes filling a woven market crate",
  "p-b-pepper": "aromatic small dark-red Cameroonian pepper heaped in a calabash",
  "white-teff": "fine white teff grain piled in a woven tray beside a traditional injera flatbread",
  "red-lentils": "red lentils filling a wooden bowl",
  chickpeas: "dried golden chickpeas piled on a dark wooden board",
  "berbere-peppers": "dried deep-red berbere chillies in a woven basket",
  "senegalese-onions": "sweet onions filling a 25kg burlap sack",
  "red-onions": "red onions piled in a wooden crate",
  "egyptian-onions": "yellow onions in a jute bag with loose ones beside it",
  carrots: "fresh orange carrots with leafy tops bunched together",
  cabbage: "firm green cabbage heads stacked in a market basket",
  "casamance-rice": "local rice grain in a wooden bowl beside rice paddies",
  "zanzibar-cloves": "whole dried cloves heaped in a small brass bowl on a spice table",
  "vanilla-pods": "cured black vanilla pods fanned on a wooden board",
  cardamom: "green cardamom pods in a small wooden scoop",
  "cooking-bananas": "green cooking banana bunches stacked in a farm store",
  "yellow-beans": "yellow beans filling a wide basket",
  "matooke-bunches": "green matooke banana bunches piled under a thatched shed",
  "nambale-beans": "nambale beans heaped in a woven tray",
  "ugandan-groundnuts": "shelled groundnuts filling a woven bowl",
  groundnuts: "shelled groundnuts spilling from a jute sack",
  "soya-beans": "dried soya beans piled in a wide basket",
  "climbing-beans": "climbing beans filling a shallow wooden tray",
  "sweet-bananas": "small sweet bananas in a woven basket",
  "raw-cashew-nuts": "raw cashew nuts in burlap sacks, one spilling onto the ground",
  "fresh-coconuts": "green coconuts piled with one cut open showing white flesh",
  "delta-tomatoes": "firm tomatoes stacked in a wooden crate under bright delta light",
  "live-catfish": "live catfish in a clear concrete pond, water glistening",
  tilapia: "fresh tilapia fish on crushed ice on a wet market table",
  millet: "pearl millet grain heaped in a shallow bowl",
  default: "a colourful assortment of fresh African farm produce arranged in a basket"
};

/** Category tiles — one per FreshCategorySlug. */
const CATEGORIES = {
  "tomatoes-peppers": "a vivid pile of red tomatoes, peppers and garden eggs at a African market stand",
  "vegetables-ugu": "a bright arrangement of leafy African vegetables: ugu, kale, waterleaf and spinach",
  "fruits": "a colourful spread of African fruits: oranges, mangoes, avocado and pineapple",
  "yam-cassava": "African yam tubers and cassava roots stacked at a farm gate",
  "grains-beans": "open sacks of African grains and beans: rice, maize, millet and beans",
  plantain: "fresh green and ripe plantain bunches stacked at a farm stall",
  "poultry-eggs": "trays of farm eggs beside a healthy free-range chicken",
  "fish-seafood": "fresh African farm fish on ice at a market counter",
  "herbs-spices": "African spices and herbs: cloves, cardamom, ginger, garlic and chillies in small bowls"
};

/** Farm portraits — one per demo farm, shown on farmer cards and profiles. */
const FARMS = {
  "demo-alabi-farm": ["Nigerian", "man", "tomato farm rows", "Nigeria"],
  "demo-chioma-agro": ["Nigerian", "woman", "leafy vegetable beds", "Nigeria"],
  "demo-danladi-farms": ["Nigerian", "man", "yam and cassava field", "Nigeria"],
  "demo-aisha-grains": ["Nigerian", "woman", "rice and grain bags in a store", "Nigeria"],
  "demo-bassey-fish": ["Nigerian", "man", "fish ponds", "Nigeria"],
  "demo-ifeoma-poultry": ["Nigerian", "woman", "poultry pen with chickens", "Nigeria"],
  "demo-ezinne-fruits": ["Nigerian", "woman", "orchard with mango and orange trees", "Nigeria"],
  "demo-tunde-spices": ["Nigerian", "man", "ginger and spice drying racks", "Nigeria"],
  "demo-kumasi-cocoa-farm": ["Ghanaian", "man", "cocoa and plantain farm", "Ghana"],
  "demo-accra-greens": ["Ghanaian", "woman", "vegetable market garden", "Ghana"],
  "demo-nakuru-fresh": ["Kenyan", "woman", "kale and tomato farm in the Rift Valley", "Kenya"],
  "demo-machakos-mango": ["Kenyan", "man", "mango orchard", "Kenya"],
  "demo-limpopo-citrus": ["South African", "woman", "citrus orchard and maize field", "South Africa"],
  "demo-western-cape-produce": ["South African", "man", "vineyard and onion field", "South Africa"],
  "demo-buea-highlands": ["Cameroonian", "man", "highland vegetable farm on a volcanic slope", "Cameroon"],
  "demo-douala-riverside": ["Cameroonian", "woman", "riverside vegetable garden", "Cameroon"],
  "demo-rift-valley-teff": ["Ethiopian", "woman", "teff field on the Rift Valley plain", "Ethiopia"],
  "demo-ethiopian-berbere": ["Ethiopian", "man", "chilli drying racks", "Ethiopia"],
  "demo-senegal-niayes": ["Senegalese", "woman", "onion and carrot market garden", "Senegal"],
  "demo-casamance-rice": ["Senegalese", "man", "rice paddies", "Senegal"],
  "demo-zanzibar-spice": ["Tanzanian", "man", "clove and spice garden", "Tanzania"],
  "demo-kilimanjaro-fresh": ["Tanzanian", "woman", "banana and avocado plot near Mount Kilimanjaro", "Tanzania"],
  "demo-kampala-matooke": ["Ugandan", "woman", "matooke banana plantation", "Uganda"],
  "demo-lusaka-maize": ["Zambian", "man", "maize and groundnut field", "Zambia"],
  "demo-kigali-hills": ["Rwandan", "woman", "terraced hillside vegetable farm", "Rwanda"],
  "demo-maputo-cashew": ["Mozambican", "man", "cashew and coconut trees", "Mozambique"],
  "demo-cairo-delta": ["Egyptian", "woman", "irrigated tomato field in the Nile Delta", "Egypt"]
};

function buildAssets() {
  const assets = [];
  assets.push({
    id: "hero",
    kind: "scene",
    component: "homepage hero (FreshHero)",
    prompt: `${STYLE}. Wide editorial hero image of a joyful African woman farmer in a bright patterned headwrap holding a woven basket overflowing with fresh tomatoes, peppers and leafy greens, with a smiling male farmer carrying a market crate behind her, green hills and a farm truck in the soft-focus background, warm morning light, generous negative space on the left for headline text`
  });
  assets.push({
    id: "promo-home",
    kind: "scene",
    component: "Buy for Your Home banner",
    prompt: `${STYLE}. Warm home kitchen scene with a woven basket of fresh African vegetables and fruits on a family table, soft window light, sense of healthy home cooking`
  });
  assets.push({
    id: "promo-business",
    kind: "scene",
    component: "Buy for Your Business banner",
    prompt: `${STYLE}. A busy African restaurant kitchen receiving crates of fresh vegetables from a delivery of sacks and baskets, chef in apron inspecting produce, warm commercial kitchen light`
  });
  assets.push({
    id: "promo-farmer",
    kind: "scene",
    component: "Are You a Farmer? banner",
    prompt: `${STYLE}. Portrait of a smiling African woman farmer in a colourful headwrap holding a hoe in a green field at golden hour, horizon and open sky to the right`
  });
  assets.push({
    id: "promo-seasonal",
    kind: "scene",
    component: "Seasonal Harvest Calendar banner",
    prompt: `${STYLE}. Overhead spread of African seasonal produce — maize, mangoes, plantain, peppers and greens — arranged on a textured wooden table like a harvest calendar`
  });
  assets.push({
    id: "promo-app",
    kind: "scene",
    component: "NaijaFresh App banner",
    prompt: `${STYLE}. A young African woman holding a smartphone showing a fresh produce shopping interface (abstract UI shapes, no readable text) while standing beside baskets of vegetables at a bright farm market`
  });
  for (const [slug, prompt] of Object.entries(CATEGORIES)) {
    assets.push({ id: `cat-${slug}`, kind: "category", component: `category tile ${slug}`, prompt: `${STYLE}. Square close-up showing ${prompt}, shallow depth of field, produce filling the frame` });
  }
  for (const [slug, prompt] of Object.entries(PRODUCE)) {
    if (slug === "default") continue;
    assets.push({ id: `prod-${slug}`, kind: "produce", listingSlug: slug, component: `produce card ${slug}`, prompt: `${STYLE}. ${prompt}, shot from a slight overhead angle filling a square frame` });
  }
  for (const [slug, [nationality, gender, scene, country]] of Object.entries(FARMS)) {
    assets.push({
      id: `farm-${slug}`,
      kind: "farm",
      farmSlug: slug,
      component: `farmer portrait ${slug}`,
      prompt: `${STYLE}. Portrait of a proud ${nationality} ${gender} farmer from ${country} standing in ${scene}, smiling warmly at the camera, authentic work clothes, natural skin texture. This is an illustrative generated portrait, not a real identifiable person`
    });
  }
  return assets;
}

function readRegistry() {
  if (fs.existsSync(REGISTRY_PATH)) return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  return { currency: "USD", model: MODEL, creditsPerImage: CREDITS_PER_IMAGE, usdPerCredit: USD_PER_CREDIT, assets: [] };
}

const ASSETS = buildAssets();

function plan(registry) {
  const have = new Map(registry.assets.filter((a) => a.vertical === "fresh" && a.storagePath).map((a) => [a.id, a]));
  const missing = ASSETS.filter((asset) => !have.has(asset.id));
  const byKind = {};
  for (const asset of ASSETS) {
    byKind[asset.kind] = byKind[asset.kind] ?? { total: 0, have: 0 };
    byKind[asset.kind].total += 1;
    if (have.has(asset.id)) byKind[asset.kind].have += 1;
  }
  return {
    totalAssets: ASSETS.length,
    alreadyGenerated: ASSETS.length - missing.length,
    pending: missing.length,
    byKind,
    costEstimate: {
      model: MODEL,
      size: SIZE,
      creditsPerImage: CREDITS_PER_IMAGE,
      usdPerCredit: USD_PER_CREDIT,
      estimatedCredits: missing.length * CREDITS_PER_IMAGE,
      estimatedUsd: Number((missing.length * CREDITS_PER_IMAGE * USD_PER_CREDIT).toFixed(2)),
      note: "Kie.ai list price, not an invoice. Actual credits are read back from each job response."
    },
    missing: missing.map((a) => a.id)
  };
}

async function createTask(asset, apiKey) {
  const res = await fetch(`${API_BASE}/jobs/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, input: { prompt: `${asset.prompt}. Square 1:1 orientation.`, size: SIZE } })
  });
  const body = await res.json();
  if (body?.code !== 200 || !body?.data?.taskId) throw new Error(`createTask failed: HTTP ${res.status} ${String(body?.msg ?? "").slice(0, 120)}`);
  return body.data.taskId;
}

async function waitFor(taskId, apiKey) {
  for (let i = 0; i < MAX_POLLS; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const body = await (await fetch(`${API_BASE}/jobs/recordInfo?taskId=${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } })).json().catch(() => null);
    const data = body?.data;
    if (!data) continue;
    if (data.state === "success") {
      const url = JSON.parse(data.resultJson ?? "{}")?.resultUrls?.[0];
      if (!url) throw new Error("Job succeeded without a result URL");
      return { url, credits: data.creditsConsumed ?? CREDITS_PER_IMAGE };
    }
    if (data.state === "fail" || data.state === "error") throw new Error(`Kie.ai job failed: ${data.failMsg ?? data.state}`);
  }
  throw new Error("Kie.ai job timed out");
}

(async () => {
  const registry = readRegistry();
  const apiKey = process.env.KIE_API_KEY;
  const summary = plan(registry);

  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  }
  if (!apiKey) {
    console.error(JSON.stringify({ blocked: "missing_credentials", missingInput: "KIE_API_KEY (run with node --env-file=.env …)", ...summary }));
    process.exit(2);
  }

  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const byId = new Map(registry.assets.map((asset) => [asset.id, asset]));
  let generated = 0;
  let failed = 0;
  for (const asset of ASSETS) {
    if (only && !only.has(asset.id)) continue;
    const existing = byId.get(asset.id);
    if (existing?.storagePath && fs.existsSync(path.join(process.cwd(), "public", existing.storagePath))) continue;

    let entry = existing ?? {
      id: asset.id,
      vertical: "fresh",
      kind: asset.kind,
      component: asset.component,
      prompt: asset.prompt,
      model: MODEL,
      size: SIZE,
      status: "pending",
      history: []
    };
    // Reuse an already-billed task rather than paying twice for the same image.
    if (!entry.taskId) entry.taskId = await createTask(asset, apiKey).catch((error) => {
      entry.status = "failed";
      entry.history = [...(entry.history ?? []), { at: new Date().toISOString(), error: String(error).slice(0, 200) }];
      return null;
    });
    const idx0 = registry.assets.findIndex((a) => a.id === asset.id);
    if (idx0 >= 0) registry.assets[idx0] = entry; else registry.assets.push(entry);
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
    if (!entry.taskId) { failed += 1; console.error(`FAILED ${asset.id}`); continue; }

    try {
      const { url, credits } = await waitFor(entry.taskId, apiKey);
      const file = path.join(OUT_DIR, `${asset.id}.png`);
      fs.writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
      entry = {
        ...entry,
        status: "generated",
        storagePath: `generated/fresh/${asset.id}.png`,
        resultUrl: url,
        generatedAt: new Date().toISOString(),
        creditsConsumed: credits,
        costUsd: Number((credits * USD_PER_CREDIT).toFixed(2)),
        qualityReview: "pending-owner-review",
        usageReferences: asset.listingSlug ? [`ProduceListing ${asset.listingSlug}`] : asset.farmSlug ? [`Farm ${asset.farmSlug}`] : ["app/naijafresh"]
      };
      generated += 1;
      console.log(`generated ${asset.id} (${credits} credits)`);
    } catch (error) {
      entry.status = "failed";
      entry.history = [...(entry.history ?? []).slice(-4), { at: new Date().toISOString(), error: String(error).slice(0, 200) }];
      failed += 1;
      console.error(`FAILED ${asset.id}: ${error}`);
    }
    const idx = registry.assets.findIndex((a) => a.id === asset.id);
    registry.assets[idx] = entry;
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  }
  console.log(JSON.stringify({ generated, failed, summary: plan(readRegistry()) }, null, 2));
})();
