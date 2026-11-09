/**
 * NaijaStay imagery (Kie.ai). Uses FLUX 3 Klein 1K — verified 1.6 credits
 * (≈$0.008)/image via GET /api/v1/models on 2026-11-09, the cheapest tier that
 * renders quality 1K photographs.
 *
 * Honesty rule: destination and category art is illustrative. Property card art
 * is only ever attached to properties flagged `isDemo`, and the UI labels those.
 *
 * Usage: node --env-file=.env scripts/generate-stay-images.mjs [--plan] [--only=a,b]
 */
import fs from "node:fs";
import path from "node:path";

const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = process.env.KIE_MODEL ?? "flux-3/klein-text-to-image";
const SIZE = process.env.KIE_IMAGE_SIZE ?? "1K";
const CREDITS_PER_IMAGE = 1.6;
const USD_PER_CREDIT = 0.005;
const POLL_INTERVAL_MS = 15000;
const MAX_POLLS = 40;
const REGISTRY_PATH = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT_DIR = path.join(process.cwd(), "public", "generated", "stay");

const STYLE =
  "Photorealistic premium African hospitality photography, natural warm daylight, refined interior styling, authentic African context, editorial travel-magazine quality, no text, no words, no watermark, no logo";

const ASSETS = [
  { id: "stay-hero", kind: "hero", prompt: `${STYLE}. A joyful African couple in straw hats and summer clothes walking through a lush tropical resort garden beside an infinity pool, a modern glass villa with warm lit interiors behind them, palm trees, Lagos coastline light` },
  { id: "stay-cat-hotels", kind: "category", prompt: `${STYLE}. Elegant Nigerian hotel facade with an illuminated entrance, palms and a lit pool at dusk` },
  { id: "stay-cat-serviced", kind: "category", prompt: `${STYLE}. Bright modern serviced apartment living room with neutral sofa, plants and large windows` },
  { id: "stay-cat-short-term", kind: "category", prompt: `${STYLE}. Warm short-term rental interior with woven African textiles, rattan furniture and sunlight` },
  { id: "stay-cat-long-term", kind: "category", prompt: `${STYLE}. Spacious long-term rental house exterior with a tidy garden and paved driveway` },
  { id: "stay-cat-land", kind: "category", prompt: `${STYLE}. Open green land plot with a boundary survey marker on a red pin, hills behind, bright sky` },
  { id: "stay-cat-student", kind: "category", prompt: `${STYLE}. Simple tidy student room with a desk, bed and bookshelf near a campus window` },
  { id: "stay-cat-corporate", kind: "category", prompt: `${STYLE}. Contemporary corporate apartment with a desk, city view and neutral premium finish` },
  { id: "stay-cat-vacation", kind: "category", prompt: `${STYLE}. Beach vacation home with white walls and a palm-fringed pool` },
  { id: "stay-cat-event", kind: "category", prompt: `${STYLE}. Elegant hotel conference room set for an event, warm lighting and African geometric details` },
  { id: "stay-dest-lagos", kind: "destination", prompt: `${STYLE}. Lagos skyline with the Lekki-Ikoyi suspension bridge over the lagoon, boats and modern towers, golden late-afternoon light` },
  { id: "stay-dest-abuja", kind: "destination", prompt: `${STYLE}. Abuja cityscape with the golden domed National Mosque and modern towers against a clear sky` },
  { id: "stay-dest-accra", kind: "destination", prompt: `${STYLE}. Accra skyline with Independence Arch and coastal palm trees, bright daylight` },
  { id: "stay-dest-nairobi", kind: "destination", prompt: `${STYLE}. Nairobi skyline with modern high-rises and acacia trees in the foreground, clear afternoon light` },
  { id: "stay-dest-capetown", kind: "destination", prompt: `${STYLE}. Cape Town with Table Mountain behind the city and waterfront buildings, vivid blue sky` },
  { id: "stay-dest-kigali", kind: "destination", prompt: `${STYLE}. Kigali modern architecture with the Convention Centre dome on rolling green hills` },
  { id: "stay-demo-hotel", kind: "demo-property", prompt: `${STYLE}. Luxury hotel exterior at golden hour with a sign-free illuminated entrance, palm-lined driveway and pool reflection` },
  { id: "stay-demo-apartment", kind: "demo-property", prompt: `${STYLE}. Upscale Lagos apartment interior with an open-plan living area, warm lamps and city view` },
  { id: "stay-demo-villa", kind: "demo-property", prompt: `${STYLE}. Modern African villa exterior with flat roof, timber screens and landscaped garden in warm evening light` },
  { id: "stay-demo-cozy", kind: "demo-property", prompt: `${STYLE}. Compact cosy two-bedroom apartment interior with soft textiles, plants and afternoon light` },
  { id: "stay-demo-land", kind: "demo-property", prompt: `${STYLE}. Residential land plot with cleared grass, access road and neighbouring houses in the distance` },
  { id: "stay-demo-duplex", kind: "demo-property", prompt: `${STYLE}. Three-bedroom duplex house exterior with a clean facade and paved frontage` },
  { id: "stay-band-host", kind: "band", prompt: `${STYLE}. Modern African villa with pool at dusk, warm interior lights, inviting for guests` },
  { id: "stay-band-land", kind: "band", prompt: `${STYLE}. Aerial view of surveyed residential land plots with roads and scattered buildings, green landscape` }
];

function registry() {
  return fs.existsSync(REGISTRY_PATH) ? JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8")) : { assets: [] };
}
function plan(reg) {
  const have = new Set(reg.assets.filter((a) => a.storagePath).map((a) => a.id));
  const missing = ASSETS.filter((a) => !have.has(a.id));
  return {
    totalAssets: ASSETS.length,
    pending: missing.length,
    model: MODEL,
    costEstimate: { credits: missing.length * CREDITS_PER_IMAGE, usd: Number((missing.length * CREDITS_PER_IMAGE * USD_PER_CREDIT).toFixed(2)) }
  };
}

async function createTask(asset, key) {
  const res = await fetch(`${API_BASE}/jobs/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, input: { prompt: `${asset.prompt}. Square 1:1 orientation.`, size: SIZE } })
  });
  const body = await res.json();
  if (body?.code !== 200 || !body?.data?.taskId) throw new Error(`createTask HTTP ${res.status} ${String(body?.msg ?? "").slice(0, 100)}`);
  return body.data.taskId;
}

async function waitFor(taskId, key) {
  for (let i = 0; i < MAX_POLLS; i += 1) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const body = await (await fetch(`${API_BASE}/jobs/recordInfo?taskId=${taskId}`, { headers: { Authorization: `Bearer ${key}` } })).json().catch(() => null);
    const data = body?.data;
    if (!data) continue;
    if (data.state === "success") {
      const url = JSON.parse(data.resultJson ?? "{}")?.resultUrls?.[0];
      if (!url) throw new Error("no result URL");
      return { url, credits: data.creditsConsumed ?? CREDITS_PER_IMAGE };
    }
    if (data.state === "fail" || data.state === "error") throw new Error(`job failed: ${data.failMsg ?? data.state}`);
  }
  throw new Error("job timed out");
}

(async () => {
  const reg = registry();
  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify(plan(reg), null, 2));
    process.exit(0);
  }
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    console.error(JSON.stringify({ blocked: "missing_credentials", ...plan(reg) }));
    process.exit(2);
  }
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? new Set(onlyArg.slice(7).split(",")) : null;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let generated = 0;
  let failed = 0;
  const byId = new Map(reg.assets.map((a) => [a.id, a]));
  for (const asset of ASSETS) {
    if (only && !only.has(asset.id)) continue;
    const existing = byId.get(asset.id);
    if (existing?.storagePath && fs.existsSync(path.join(process.cwd(), "public", existing.storagePath))) continue;
    let entry = existing ?? { id: asset.id, vertical: "stay", kind: asset.kind, component: asset.id, prompt: asset.prompt, model: MODEL, size: SIZE, status: "pending", history: [] };
    if (!entry.taskId) entry.taskId = await createTask(asset, apiKey).catch((error) => {
      entry.status = "failed";
      entry.history = [...(entry.history ?? []), { at: new Date().toISOString(), error: String(error).slice(0, 200) }];
      return null;
    });
    const i0 = reg.assets.findIndex((a) => a.id === asset.id);
    if (i0 >= 0) reg.assets[i0] = entry; else reg.assets.push(entry);
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
    if (!entry.taskId) { failed += 1; console.error(`FAILED ${asset.id}`); continue; }
    try {
      const { url, credits } = await waitFor(entry.taskId, apiKey);
      fs.writeFileSync(path.join(OUT_DIR, `${asset.id}.png`), Buffer.from(await (await fetch(url)).arrayBuffer()));
      entry = { ...entry, status: "generated", storagePath: `generated/stay/${asset.id}.png`, resultUrl: url, generatedAt: new Date().toISOString(), creditsConsumed: credits, costUsd: Number((credits * USD_PER_CREDIT).toFixed(2)), qualityReview: "pending-owner-review", usageReferences: ["app/naijastay"] };
      generated += 1;
      console.log(`generated ${asset.id} (${credits} credits)`);
    } catch (error) {
      entry.status = "failed";
      entry.history = [...(entry.history ?? []).slice(-4), { at: new Date().toISOString(), error: String(error).slice(0, 200) }];
      failed += 1;
      console.error(`FAILED ${asset.id}: ${error}`);
    }
    const i = reg.assets.findIndex((a) => a.id === asset.id);
    reg.assets[i] = entry;
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
  }
  console.log(JSON.stringify({ generated, failed, summary: plan(registry()) }, null, 2));
})();
