/**
 * NaijaShop campaign and product photography via the verified Kie.ai GPT Image 2
 * pipeline (1K, 6 credits ≈ $0.03 per image).
 *
 * Owner approved the imagery spend ("both web and mobile MUST be exact as the
 * mockup... use both kie.ai images and REA").
 *
 * Rules applied:
 * - Product images show the correct product type and attributes; no invented
 *   specifications, no fabricated brand logos, no counterfeit-looking branded
 *   merchandise for listings that name a third-party brand.
 * - Campaign imagery reflects Nigerian households, streets and shoppers.
 * - Every asset is recorded in scripts/image-registry.json with provenance.
 *
 * Usage:
 *   node --env-file=.env scripts/naijashop-images.mjs --queue
 *   node --env-file=.env scripts/naijashop-images.mjs --run [--only=slug]
 */
import fs from "node:fs";
import path from "node:path";

const API_BASE = "https://api.kie.ai/api/v1";
const MODEL = "gpt-image-2-text-to-image";
const SIZE = "1K";
const CREDITS_PER_IMAGE = 6;
const USD_PER_CREDIT = 0.005;
const REGISTRY_PATH = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT_DIR = path.join(process.cwd(), "public", "generated", "shop");

const STUDIO = "clean seamless soft-grey studio product photography, even diffused lighting, subtle reflection, no text, no watermark, no logo, no people";
const SCENE = "photorealistic editorial commercial photography, natural warm light, clean composition with clear space for overlaid text, no text, no lettering, no watermark, no logo";

export const ASSETS = [
  // ---- Campaign heroes -------------------------------------------------
  {
    slug: "hero-desktop",
    kind: "hero banner",
    component: "Desktop hero — Big deals on African brands",
    prompt: `Wide editorial photograph of a joyful Nigerian woman in a bold ankara headwrap and matching blouse holding paper shopping bags on a sunlit Lagos street, warm golden light, soft background bokeh, clear empty dark space on the left third for headline text. ${SCENE}`
  },
  {
    slug: "hero-mobile",
    kind: "hero banner (mobile crop)",
    component: "Mobile hero — Big deals on African brands",
    prompt: `Portrait-orientation photograph of a joyful Nigerian woman in a vivid ankara headwrap smiling while carrying paper shopping bags in a bright Lagos market, soft natural light, negative space at the top for headline text. ${SCENE}`
  },
  {
    slug: "hero-electronics",
    kind: "hero banner",
    component: "Desktop hero — Electronics hub",
    prompt: `Modern photograph of a young Nigerian man and woman comparing smartphones and a laptop at a bright electronics counter in Lagos, teal and amber accents, shallow depth of field, clear space on the left for text. ${SCENE}`
  },
  {
    slug: "hero-fashion",
    kind: "hero banner",
    component: "Desktop hero — Fashion",
    prompt: `Editorial fashion photograph of a stylish Nigerian woman in sunglasses and a patterned blouse standing confidently outdoors against warm terracotta tones, generous empty space on the left for headline text. ${SCENE}`
  },
  // ---- Lower-page banners ----------------------------------------------
  {
    slug: "banner-electronics",
    kind: "promo banner",
    component: "Promo — Electronics hub",
    prompt: `Flat-lay photograph of consumer electronics arranged neatly on a deep indigo surface: smartphone, laptop, headphones, smartwatch and power bank, purple accent lighting at the edges. ${SCENE}`
  },
  {
    slug: "banner-delivery",
    kind: "promo banner",
    component: "Promo — Fast delivery",
    prompt: `Photograph of a smiling delivery rider in a green uniform and helmet on a motorbike with a parcel box, moving through a Lagos street at golden hour, motion blur background. ${SCENE}`
  },
  {
    slug: "banner-sellers",
    kind: "promo banner",
    component: "Promo — Support Nigerian sellers",
    prompt: `Warm portrait photograph of a confident Nigerian small-business owner in an apron smiling in their tidy shop stocked with goods, natural window light. ${SCENE}`
  },
  // ---- Category tiles ---------------------------------------------------
  { slug: "category-phones-tablets", kind: "category tile", component: "Category — Phones & Tablets", prompt: `Two modern unbranded smartphones and a tablet arranged on a pale mint background, seen at a slight angle, soft shadows. ${STUDIO}` },
  { slug: "category-computers", kind: "category tile", component: "Category — Computers", prompt: `A slim silver laptop open beside a wireless mouse and compact monitor on a light grey background. ${STUDIO}` },
  { slug: "category-home-kitchen", kind: "category tile", component: "Category — Home & Kitchen", prompt: `Stainless steel cooking pots, a wooden spoon and a ceramic mug on a soft warm beige background. ${STUDIO}` },
  { slug: "category-fashion", kind: "category tile", component: "Category — Fashion", prompt: `Folded African wax-print fabric in orange, green and gold beside a pair of neutral sneakers on a light taupe background. ${STUDIO}` },
  { slug: "category-beauty", kind: "category tile", component: "Category — Beauty & Personal Care", prompt: `Unbranded skincare bottles and jars in soft pink and white on a light blush background with a few green leaves. ${STUDIO}` },
  { slug: "category-groceries", kind: "category tile", component: "Category — Groceries & Food", prompt: `A woven basket of fresh tomatoes, peppers, leafy greens and onions on a warm cream background. ${STUDIO}` },
  { slug: "category-power-solar", kind: "category tile", component: "Category — Power & Solar", prompt: `A compact solar panel, an inverter unit and a portable power bank on a cool light blue background. ${STUDIO}` },
  { slug: "category-gaming", kind: "category tile", component: "Category — Gaming", prompt: `Cream-coloured game controller, mechanical keyboard and headset on a dark charcoal background with soft rim light. ${STUDIO}` },
  // ---- Products (type-accurate, unbranded) ------------------------------
  { slug: "product-apple-iphone-6-silver", kind: "product photo", component: "Apple iPhone 6 (Silver)", prompt: `Front view of a slim silver aluminium smartphone with a 4.7-inch screen and rounded corners, screen on showing a plain blue gradient wallpaper, standing upright. ${STUDIO}` },
  { slug: "product-blackview-a60-android-smartphone", kind: "product photo", component: "Blackview A60 Android Smartphone", prompt: `Front and back view of a modern unbranded black Android smartphone with a 6.1-inch waterdrop-notch display and a dark blue rear panel with a dual camera. ${STUDIO}` },
  { slug: "product-smartphone-on-desk", kind: "product photo", component: "Smartphone on Desk", prompt: `A modern unbranded black smartphone lying on a light oak desk beside a charging cable and notebook. ${STUDIO}` },
  { slug: "product-apple-iphone-5s", kind: "product photo", component: "Apple iPhone 5s", prompt: `Front view of a compact gold smartphone with a 4-inch screen, a round home button and sharp aluminium edges, screen off. ${STUDIO}` },
  { slug: "product-14-inch-business-laptop", kind: "product photo", component: "14-inch Business Laptop", prompt: `A modern slim black 14-inch business laptop open at 110 degrees showing a neutral grey desktop, keyboard visible, three-quarter angle. ${STUDIO}` },
  { slug: "product-15-6-inch-laptop", kind: "product photo", component: "15.6-inch Laptop", prompt: `A modern silver 15.6-inch laptop open, showing a clean blue abstract desktop, subtle perspective. ${STUDIO}` },
  { slug: "product-led-monitor", kind: "product photo", component: "LED Monitor", prompt: `A slim frameless 24-inch computer monitor on a metal stand showing a soft colour gradient, slight right angle. ${STUDIO}` },
  { slug: "product-eizo-foris-fg2421-monitor", kind: "product photo", component: "EIZO Foris FG2421 Monitor", prompt: `A 24-inch gaming monitor with a thin black bezel and adjustable stand on a matte black desk, screen showing an abstract purple gradient. ${STUDIO}` },
  { slug: "product-2-slice-toaster", kind: "product photo", component: "2-Slice Toaster", prompt: `A retro-style cream and chrome two-slice toaster, three-quarter angle, cord tucked behind. ${STUDIO}` },
  { slug: "product-stainless-steel-cookware-set", kind: "product photo", component: "Stainless Steel Cookware Set", prompt: `A stainless steel cookware set: two saucepans with glass lids and a frying pan arranged together, reflective finish. ${STUDIO}` },
  { slug: "product-coffee-maker", kind: "product photo", component: "Coffee Maker", prompt: `A black filter coffee maker with a glass carafe partly filled with coffee, three-quarter angle. ${STUDIO}` },
  { slug: "product-retro-kitchen-blender", kind: "product photo", component: "Retro Kitchen Blender", prompt: `A retro mint-green kitchen blender with a glass jug, curved chrome accents, three-quarter angle. ${STUDIO}` },
  { slug: "product-automatic-wristwatch", kind: "product photo", component: "Automatic Wristwatch", prompt: `A men's automatic wristwatch with a stainless steel case, white dial and brown leather strap, resting on a soft shadow, close macro. ${STUDIO}` },
  { slug: "product-red-patent-leather-baby-shoes", kind: "product photo", component: "Red Patent Leather Baby Shoes", prompt: `A pair of small red patent-leather baby shoes with soft soles and a velcro strap, side by side, delicate scale. ${STUDIO}` },
  { slug: "product-asics-gel-cumulus-22-running-shoes", kind: "product photo", component: "Asics Gel-Cumulus 22 Running Shoes", prompt: `A single modern grey and navy running shoe with thick cushioned white sole, mesh upper, three-quarter view. ${STUDIO}` },
  { slug: "product-prada-tooled-leather-handbag", kind: "product photo", component: "Prada Tooled Leather Handbag", prompt: `A structured tan tooled-leather women's handbag with a top handle and gold clasp, no logos or branding, three-quarter view. ${STUDIO}` },
  { slug: "product-perfume-gift-set", kind: "product photo", component: "Perfume Gift Set", prompt: `A fragrance gift set: three unbranded glass perfume bottles of different shapes and amber liquid in an open presentation box. ${STUDIO}` },
  { slug: "product-eau-de-parfum-50ml", kind: "product photo", component: "Eau de Parfum 50ml", prompt: `A single clear glass 50ml eau de parfum bottle with a gold cap and pale amber liquid, dramatic soft shadow. ${STUDIO}` },
  { slug: "product-moisturiser-jar-100ml", kind: "product photo", component: "Moisturiser Jar 100ml", prompt: `A white ceramic 100ml moisturiser jar with an open lid showing rich cream, on a pale blush background. ${STUDIO}` },
  { slug: "product-handmade-shampoo-bars", kind: "product photo", component: "Handmade Shampoo Bars", prompt: `Three handmade solid shampoo bars in cream, oatmeal and charcoal tones stacked on a wooden dish with dried herbs. ${STUDIO}` },
  { slug: "product-fresh-tomatoes-1kg", kind: "product photo", component: "Fresh Tomatoes 1kg", prompt: `A punnet of ripe red plum tomatoes with green stems, fresh and glossy. ${STUDIO}` },
  { slug: "product-red-bell-pepper-500g", kind: "product photo", component: "Red Bell Pepper 500g", prompt: `Three glossy red bell peppers with green stems arranged together. ${STUDIO}` },
  { slug: "product-diced-onions-500g", kind: "product photo", component: "Diced Onions 500g", prompt: `Freshly diced white onions piled in a shallow bowl with a whole onion beside it. ${STUDIO}` },
  { slug: "product-green-beans-500g", kind: "product photo", component: "Green Beans 500g", prompt: `A heap of fresh trimmed green beans, vibrant and crisp, scattered neatly. ${STUDIO}` },
  { slug: "product-solar-power-inverter", kind: "product photo", component: "Solar Power Inverter", prompt: `A compact modern solar inverter unit in grey with a small LCD panel and sockets, isolated front three-quarter view. ${STUDIO}` },
  { slug: "product-portable-power-bank", kind: "product photo", component: "Portable Power Bank", prompt: `A slim 20000mAh power bank in matte black with a small LED display and USB-C port, angled view. ${STUDIO}` },
  { slug: "product-rooftop-solar-panel-array", kind: "product photo", component: "Rooftop Solar Panel Array", prompt: `A small array of three monocrystalline solar panels on an aluminium mounting frame, angled toward light, no room scene. ${STUDIO}` },
  { slug: "product-solar-battery-charging-station", kind: "product photo", component: "Solar Battery Charging Station", prompt: `A portable solar battery charging station with a carry handle, two small foldable panels and USB ports, compact and modern. ${STUDIO}` },
  { slug: "product-ps4-and-xbox-one-controllers", kind: "product photo", component: "PS4 and Xbox One Controllers", prompt: `Two modern wireless game controllers in black and white, generic unbranded design, side by side. ${STUDIO}` },
  { slug: "product-wired-gaming-mouse", kind: "product photo", component: "Wired Gaming Mouse", prompt: `A black ergonomic wired gaming mouse with a subtle red accent light, three-quarter view. ${STUDIO}` },
  { slug: "product-mechanical-keyboard", kind: "product photo", component: "Mechanical Keyboard", prompt: `A compact tenkeyless mechanical keyboard with white keycaps and a silver frame, slight angle. ${STUDIO}` },
  { slug: "product-xbox-360-controller", kind: "product photo", component: "Xbox 360 Controller", prompt: `A classic grey-and-white wireless game controller with two analogue sticks and colourful face buttons, generic unbranded, three-quarter view. ${STUDIO}` }
];

/** Extra assets live on globalThis, so their declaration order never matters. */
function ALL_ASSETS() {
  return [...ASSETS, ...(globalThis.__shopExtraAssets ?? [])];
}

const readRegistry = () => JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const writeRegistry = (registry) => fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);

function planned(registry) {
  const done = new Set(registry.assets.map((asset) => asset.id));
  return ALL_ASSETS().filter((asset) => !done.has(`shop-${asset.slug}`));
}

async function generate(asset, apiKey) {
  const create = await fetch(`${API_BASE}/jobs/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, input: { prompt: asset.prompt, size: SIZE } })
  });
  const created = await create.json();
  if (created?.code !== 200 || !created?.data?.taskId) throw new Error(`createTask HTTP ${create.status}: ${JSON.stringify(created).slice(0, 140)}`);
  const taskId = created.data.taskId;
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 15000));
    const poll = await fetch(`${API_BASE}/jobs/recordInfo?taskId=${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const data = (await poll.json().catch(() => null))?.data;
    if (!data) continue;
    if (data.state === "success") {
      const url = JSON.parse(data.resultJson ?? "{}")?.resultUrls?.[0] ?? null;
      if (!url) throw new Error("no result url");
      return { url, taskId, credits: data.creditsConsumed ?? CREDITS_PER_IMAGE };
    }
    if (data.state === "fail" || data.state === "error") throw new Error(data.failMsg ?? "failed");
  }
  throw new Error("timed out");
}

async function run() {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error("KIE_API_KEY missing; run with node --env-file=.env");
  const queue = planned(readRegistry());
  if (queue.length === 0) {
    console.log(JSON.stringify({ status: "complete" }));
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let spent = 0;
  let generated = 0;
  for (const [index, asset] of queue.entries()) {
    process.stdout.write(`[${index + 1}/${queue.length}] shop-${asset.slug} … `);
    try {
      const result = await generate(asset, apiKey);
      const response = await fetch(result.url);
      if (!response.ok) throw new Error(`download HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(path.join(OUT_DIR, `${asset.slug}.png`), bytes);
      const costUsd = result.credits * USD_PER_CREDIT;
      spent += costUsd;
      generated += 1;
      const registry = readRegistry();
      registry.assets.push({
        id: `shop-${asset.slug}`,
        vertical: "shop",
        kind: asset.kind,
        component: asset.component,
        prompt: asset.prompt,
        model: MODEL,
        size: SIZE,
        status: "generated",
        provenance: "AI-generated product/campaign illustration (Kie.ai GPT Image 2). Not a photograph of the listed real-world product.",
        history: [],
        taskId: result.taskId,
        storagePath: `generated\\shop\\${asset.slug}.png`,
        publicPath: `/generated/shop/${asset.slug}.webp`,
        resultUrl: result.url,
        generatedAt: new Date().toISOString(),
        creditsConsumed: result.credits,
        costUsd,
        qualityReview: "pending-owner-review",
        usageReferences: []
      });
      writeRegistry(registry);
      process.stdout.write(`ok (${Math.round(bytes.length / 1024)} KB)\n`);
    } catch (error) {
      process.stdout.write(`FAILED ${String(error.message).slice(0, 120)}\n`);
    }
  }
  console.log(JSON.stringify({ generated, failed: queue.length - generated, spentUsd: Number(spent.toFixed(3)), remaining: planned(readRegistry()).length }));
}

/**
 * Additional coverage so no stock or illustration file survives on any
 * storefront surface: page background texture and the extra product types the
 * mockup shelves show (over-ear headphones, a tablet, a digital camera, the
 * seller/support banner and the app-download banner).
 */
globalThis.__shopExtraAssets = [
  { slug: "bg-texture", kind: "background texture", component: "Storefront page background", prompt: "Very subtle seamless light grey paper texture with an extremely faint warm tint, almost flat, low contrast, no pattern edges, no objects, no text. Studio product photography background" },
  { slug: "product-over-ear-headphones", kind: "product photo", component: "Over-ear headphones", prompt: "A pair of matte black wireless over-ear headphones, generic unbranded design, three-quarter view, leather ear cushions. clean seamless soft-grey studio product photography, even diffused lighting, no text, no watermark, no logo, no people" },
  { slug: "product-tablet-10-inch", kind: "product photo", component: "10-inch tablet", prompt: "A modern unbranded 10-inch tablet in dark grey, screen showing an abstract light gradient, standing at a slight angle. clean seamless soft-grey studio product photography, even diffused lighting, no text, no watermark, no logo, no people" },
  { slug: "product-digital-camera-dslr", kind: "product photo", component: "Digital camera", prompt: "A black APS-C DSLR camera with a fixed zoom lens, generic unbranded design, three-quarter view. clean seamless soft-grey studio product photography, even diffused lighting, no text, no watermark, no logo, no people" },
  { slug: "product-smartwatch", kind: "product photo", component: "Smartwatch", prompt: "A modern smartwatch with a black silicone strap and a square screen showing a simple clock face, generic unbranded. clean seamless soft-grey studio product photography, even diffused lighting, no text, no watermark, no logo, no people" },
  { slug: "product-air-fryer-5-5l", kind: "product photo", component: "5.5L Air Fryer", prompt: "A black 5.5-litre digital air fryer with a pull-out basket and touch panel, generic unbranded, three-quarter view. clean seamless soft-grey studio product photography, even diffused lighting, no text, no watermark, no logo, no people" },
  { slug: "banner-app", kind: "promo banner", component: "Promo — Download the NaijaShop app", prompt: "A smartphone held in a hand showing a clean shopping app grid on screen (no real text or logos), teal and amber brand colours on a deep green background. photorealistic editorial commercial photography, no text, no lettering, no watermark, no logo" },
  { slug: "banner-seller-portrait", kind: "promo banner", component: "Promo — Support Nigerian sellers (portrait)", prompt: "Vertical portrait of a Nigerian market trader smiling in a bright fabric shop, folded ankara cloth behind, warm sunlight. photorealistic editorial commercial photography, no text, no lettering, no watermark, no logo" }
];

// CLI dispatch runs last so every asset constant is initialised first.
const args = process.argv.slice(2);
if (args.includes("--queue")) {
  const queue = planned(readRegistry());
  console.log(JSON.stringify({ pending: queue.length, model: MODEL, size: SIZE, estimatedCostUsd: Number((queue.length * CREDITS_PER_IMAGE * USD_PER_CREDIT).toFixed(2)) }, null, 2));
} else if (args.includes("--run")) {
  const onlyArg = args.find((arg) => arg.startsWith("--only="));
  if (onlyArg) {
    const only = new Set(onlyArg.slice(7).split(","));
    const keep = ALL_ASSETS().filter((asset) => only.has(asset.slug));
    ASSETS.splice(0, ASSETS.length, ...keep);
  }
  await run();
} else {
  console.log("Usage: --queue | --run [--only=slug]");
}
