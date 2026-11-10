/**
 * Aura AI imagery — generated with Kie.ai.
 *
 * AGENTS.md prefers the connected Kie MCP. That server is registered and verified
 * (v5.6.2, 39 tools — see docs/aura-tooling-evidence.md) but its tools are not
 * exposed to this agent session, so the project's documented authorized fallback
 * is used: the same REST API the other vertical generators call.
 *
 * Model: flux-3/klein-text-to-image, 1.6 credits (≈ $0.008) per 1K image — the
 * cheapest verified text-to-image option. `--plan` prints the cost first.
 */
import fs from "node:fs";
import path from "node:path";

const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = "flux-3/klein-text-to-image";
const SIZE = "1K";
const CR = 1.6;
const USD = 0.005;
const REGISTRY_PATH = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT_DIR = path.join(process.cwd(), "public", "generated", "aura");

const STYLE =
  "Photorealistic premium Nigerian editorial photography, natural light, rich saturated colour, shallow depth of field, no text, no words, no letters, no watermark, no logo, no user interface";

const ASSETS = [
  {
    id: "aura-orb",
    kind: "brand",
    component: "Aura AI ribbon orb (hero, desktop and mobile)",
    prompt:
      "A luminous abstract sphere made of interwoven emerald-green glass ribbons edged in polished gold, floating against a near-black forest-green background, soft rim light, subtle glow, premium 3D render, centred, generous negative space around it, elegant and modern brand mark"
  },
  {
    id: "aura-orbit-backdrop",
    kind: "brand",
    component: "Discover hero backdrop",
    prompt:
      "An abstract dark background of fine concentric arcs and concentric rings in very dark emerald green, with two thin glowing mint and gold light trails, minimal, cinematic, no subject, wide landscape"
  },
  {
    id: "aura-abuja-stay",
    kind: "vertical",
    component: "Abuja stay recommendation card",
    prompt: `${STYLE}. A peaceful upscale short-let terrace in Abuja with tall palms, warm outdoor lounge seating, lanterns and a lit pool at dusk, elegant cream-coloured architecture with arched balconies`
  },
  {
    id: "aura-abuja-meal",
    kind: "vertical",
    component: "Nigerian meal recommendation card",
    prompt: `${STYLE}. Overhead close shot of Nigerian party jollof rice with grilled suya skewers, red onion rings and fried plantain on a dark ceramic plate, rich orange and red tones, steam rising, restaurant-quality plating`
  },
  {
    id: "aura-abuja-ride",
    kind: "vertical",
    component: "Ride recommendation card",
    prompt: `${STYLE}. A clean dark sedan parked on a wide Abuja road with the National Mosque's golden dome and minarets softly visible in the background under warm late-afternoon light, palm trees along the road`
  },
  {
    id: "aura-abuja-city",
    kind: "vertical",
    component: "Explore Abuja discovery panel",
    prompt: `${STYLE}. Abuja skyline at golden hour with the Aso Rock outcrop in the background, wide avenues, greenery and modern buildings, warm light, cinematic wide landscape`
  },
  {
    id: "aura-professional",
    kind: "vertical",
    component: "Gigs professional card",
    prompt: `${STYLE}. A confident Nigerian electrician in a clean navy work shirt holding tools outside a modern Lagos home, friendly expression, bright daylight, portrait crop`
  },
  {
    id: "aura-shopping",
    kind: "vertical",
    component: "Shop recommendation card / Explore",
    prompt: `${STYLE}. A Nigerian woman comparing two smartphones in a bright modern electronics shop in Lagos, warm wood shelves, natural light, candid and editorial`
  },
  {
    id: "aura-mockup-abuja-stay",
    kind: "vertical",
    component: "Aura mobile/desktop stay card (mockup subject)",
    prompt: `${STYLE}. A serene Abuja boutique hotel courtyard at dusk: cream two-storey colonial-style building with arched balconies, tall palm trees, warm lanterns, cushioned wicker lounge chairs and a small lit fountain, lush tropical planting, cosy golden evening light`
  },
  {
    id: "aura-mockup-jollof",
    kind: "vertical",
    component: "Aura mobile/desktop meal card (mockup subject)",
    prompt: `${STYLE}. Close overhead shot of a large plate of Nigerian jollof rice with charred beef suya skewers on top, a small bowl of red pepper sauce and sliced red onions, fried plantain at the edge, dark rustic table, rich warm colour, appetising steam`
  },
  {
    id: "aura-mockup-ride",
    kind: "vertical",
    component: "Aura desktop ride card (mockup subject)",
    prompt: `${STYLE}. A dark grey executive sedan parked on a tree-lined Abuja boulevard, the golden National Mosque dome and slender minarets visible in the background, wide clean road, bright late-afternoon light, three-quarter front view`
  },
  {
    id: "aura-hero-wash",
    kind: "brand",
    component: "Aura hero background wash (mobile + desktop)",
    prompt:
      "An abstract very dark forest-green gradient background with a faint soft emerald light bloom in the upper right and subtle diagonal silk-like folds, almost black at the edges, no objects, no text, cinematic and subtle, wide"
  },
  {
    id: "aura-orb-v3",
    kind: "brand",
    component: "Aura AI orb — matched to the owner's reference image",
    prompt:
      "A glossy abstract orb built from only THREE wide, thick, flat ribbon bands that loop around it in broad sweeping arcs, vivid luminous emerald green ribbons with bright mint highlights on their inner curves, dark near-black gaps between the bands, thin warm golden light spilling along a few ribbon edges near the top-left and lower-right, translucent glassy material, soft green glow halo behind the orb, plain very dark green background with no texture, gently organic slightly irregular silhouette rather than a perfect sphere, square composition with generous margin, premium 3D render, no text"
  },
];

const reg = fs.existsSync(REGISTRY_PATH) ? JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8")) : { assets: [] };
const have = new Set(reg.assets.filter((a) => a.storagePath && a.status === "generated").map((a) => a.id));
const missing = ASSETS.filter((a) => !have.has(a.id));

if (process.argv.includes("--plan")) {
  console.log(
    JSON.stringify(
      { model: MODEL, pending: missing.map((a) => a.id), count: missing.length, credits: Number((missing.length * CR).toFixed(1)), costUsd: Number((missing.length * CR * USD).toFixed(2)) },
      null,
      1
    )
  );
  process.exit(0);
}

const key = process.env.KIE_API_KEY;
if (!key) {
  console.error("KIE_API_KEY is not set in this environment.");
  process.exit(2);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

async function generate(asset) {
  const orientation = asset.id === "aura-orb" ? "Square composition." : asset.id === "aura-professional" ? "Tall 4:5 portrait orientation." : "Wide 16:9 orientation.";
  const create = await fetch(`${API_BASE}/jobs/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, input: { prompt: `${asset.prompt}. ${orientation}`, size: SIZE } })
  });
  const made = await create.json().catch(() => null);
  if (made?.code !== 200) {
    console.error(`create failed ${asset.id}: ${made?.msg ?? "unknown"}`);
    return false;
  }
  const taskId = made.data.taskId;
  let url = null;
  for (let i = 0; i < 40 && !url; i += 1) {
    await new Promise((r) => setTimeout(r, 15000));
    const info = await fetch(`${API_BASE}/jobs/recordInfo?taskId=${taskId}`, { headers: { Authorization: `Bearer ${key}` } })
      .then((r) => r.json())
      .catch(() => null);
    if (info?.data?.state === "success") url = JSON.parse(info.data.resultJson ?? "{}")?.resultUrls?.[0] ?? null;
    if (info?.data?.state === "fail") {
      console.error(`job failed ${asset.id}`);
      return false;
    }
  }
  if (!url) {
    console.error(`timed out ${asset.id}`);
    return false;
  }
  fs.writeFileSync(path.join(OUT_DIR, `${asset.id}.png`), Buffer.from(await (await fetch(url)).arrayBuffer()));
  const entry = {
    id: asset.id,
    vertical: "aura",
    kind: asset.kind,
    component: asset.component,
    prompt: asset.prompt,
    model: MODEL,
    size: SIZE,
    status: "generated",
    storagePath: `generated/aura/${asset.id}.png`,
    taskId,
    resultUrl: url,
    generatedAt: new Date().toISOString(),
    creditsConsumed: CR,
    costUsd: Number((CR * USD).toFixed(2)),
    qualityReview: "pending-owner-review",
    usageReferences: ["components/aura"]
  };
  const idx = reg.assets.findIndex((a) => a.id === asset.id);
  if (idx >= 0) reg.assets[idx] = entry;
  else reg.assets.push(entry);
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
  console.log(`generated ${asset.id}`);
  return true;
}

let ok = 0;
for (const asset of missing) if (await generate(asset)) ok += 1;
console.log(JSON.stringify({ generated: ok, attempted: missing.length, costUsd: Number((ok * CR * USD).toFixed(2)) }));
