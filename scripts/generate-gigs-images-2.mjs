/**
 * NaijaGigs identity imagery for the approved mockup rebuild (Kie.ai GPT Image 2, 1K).
 *
 * Existing gigs assets were authored for an earlier layout and are reused where
 * they match; this manifest covers only what the approved mockup needs and does
 * not exist yet: the hero collage, the four missing service categories, and the
 * two audience bands.
 *
 * Usage:
 *   node scripts/generate-gigs-images-2.mjs --plan
 *   node --env-file=.env scripts/generate-gigs-images-2.mjs
 */
import fs from "node:fs";
import path from "node:path";

const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
// FLUX 3 Klein 1K: 1.6 credits/image (≈ $0.008), the cheapest tier Kie lists for
// quality 1K output. Verified via GET /api/v1/models on 2026-11-09.
const MODEL = process.env.KIE_MODEL ?? "flux-3/klein-text-to-image";
const SIZE = process.env.KIE_IMAGE_SIZE ?? "1K";
const CREDITS_PER_IMAGE = 1.6;
const USD_PER_CREDIT = 0.005;
const POLL_INTERVAL_MS = 15000;
const MAX_POLLS = 40;
const REGISTRY_PATH = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT_DIR = path.join(process.cwd(), "public", "generated", "gigs");

const STYLE =
  "Photorealistic editorial African professional-services photography, bright natural daylight, authentic African workplace context, confident real people at work, premium marketplace campaign quality, no text, no words, no watermark, no logo";

const ASSETS = [
  {
    id: "gigs2-hero-collage",
    kind: "scene",
    prompt: `${STYLE}. Five African professionals standing together and smiling at the camera: a construction engineer in a yellow hard hat and hi-vis vest, a nurse in blue scrubs, a young software developer in a green hoodie holding a laptop, a chef in a white chef jacket and toque, and a mechanic in dark blue overalls. Behind them the Lagos Third Mainland Bridge and city skyline with palm trees and a bright blue sky. Horizontal composition with the group on the right and open sky on the left`
  },
  { id: "gigs2-cat-plumbing", kind: "category", prompt: `${STYLE}. African plumber in a green work shirt tightening a chrome pipe under a modern kitchen sink, tools laid out beside` },
  { id: "gigs2-cat-business", kind: "category", prompt: `${STYLE}. African business consultant in a suit reviewing charts on a laptop with a small business owner in her shop, warm daylight` },
  { id: "gigs2-cat-transport", kind: "category", prompt: `${STYLE}. White box truck with its rear door open and two African workers loading cartons with a hand truck at a loading bay` },
  { id: "gigs2-cat-climbing", kind: "category", prompt: `${STYLE}. African technician in a harness and helmet climbing a telecom mast, blue sky, safety gear visible` },
  { id: "gigs2-band-individuals", kind: "band", prompt: `${STYLE}. Smiling young African woman with a laptop in a bright home office, plants and soft window light, looking confident at the camera` },
  { id: "gigs2-band-government", kind: "band", prompt: `${STYLE}. Modern African government building with columns and a flag in front, professionals in formal wear walking on the steps, clear daylight` },
  { id: "gigs2-band-business", kind: "band", prompt: `${STYLE}. Modern glass office building with African professionals meeting at a table by the window, city view` }
];

function readRegistry() {
  return fs.existsSync(REGISTRY_PATH) ? JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8")) : { assets: [] };
}

function plan(registry) {
  const have = new Set(registry.assets.filter((a) => a.storagePath).map((a) => a.id));
  const missing = ASSETS.filter((a) => !have.has(a.id));
  return {
    totalAssets: ASSETS.length,
    alreadyGenerated: ASSETS.length - missing.length,
    pending: missing.length,
    costEstimate: { model: MODEL, size: SIZE, creditsPerImage: CREDITS_PER_IMAGE, usdPerCredit: USD_PER_CREDIT, estimatedCredits: missing.length * CREDITS_PER_IMAGE, estimatedUsd: Number((missing.length * CREDITS_PER_IMAGE * USD_PER_CREDIT).toFixed(2)) }
  };
}

async function createTask(asset, apiKey) {
  const res = await fetch(`${API_BASE}/jobs/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, input: { prompt: `${asset.prompt}. Square 1:1 orientation.`, size: SIZE } })
  });
  const body = await res.json();
  if (body?.code !== 200 || !body?.data?.taskId) throw new Error(`createTask failed: HTTP ${res.status}`);
  return body.data.taskId;
}

async function waitFor(taskId, apiKey) {
  for (let i = 0; i < MAX_POLLS; i += 1) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const body = await (await fetch(`${API_BASE}/jobs/recordInfo?taskId=${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } })).json().catch(() => null);
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
  const registry = readRegistry();
  const apiKey = process.env.KIE_API_KEY;
  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify(plan(registry), null, 2));
    process.exit(0);
  }
  if (!apiKey) {
    console.error(JSON.stringify({ blocked: "missing_credentials", ...plan(registry) }));
    process.exit(2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const byId = new Map(registry.assets.map((a) => [a.id, a]));
  let generated = 0;
  let failed = 0;
  for (const asset of ASSETS) {
    const existing = byId.get(asset.id);
    if (existing?.storagePath && fs.existsSync(path.join(process.cwd(), "public", existing.storagePath))) continue;
    let entry = existing ?? { id: asset.id, vertical: "gigs", kind: asset.kind, component: asset.id, prompt: asset.prompt, model: MODEL, size: SIZE, status: "pending", history: [] };
    if (!entry.taskId) entry.taskId = await createTask(asset, apiKey).catch((error) => {
      entry.status = "failed";
      entry.history = [...(entry.history ?? []), { at: new Date().toISOString(), error: String(error).slice(0, 200) }];
      return null;
    });
    const i0 = registry.assets.findIndex((a) => a.id === asset.id);
    if (i0 >= 0) registry.assets[i0] = entry; else registry.assets.push(entry);
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
    if (!entry.taskId) { failed += 1; console.error(`FAILED ${asset.id}`); continue; }
    try {
      const { url, credits } = await waitFor(entry.taskId, apiKey);
      fs.writeFileSync(path.join(OUT_DIR, `${asset.id}.png`), Buffer.from(await (await fetch(url)).arrayBuffer()));
      entry = { ...entry, status: "generated", storagePath: `generated/gigs/${asset.id}.png`, resultUrl: url, generatedAt: new Date().toISOString(), creditsConsumed: credits, costUsd: Number((credits * USD_PER_CREDIT).toFixed(2)), qualityReview: "pending-owner-review", usageReferences: ["app/naijagigs"] };
      generated += 1;
      console.log(`generated ${asset.id} (${credits} credits)`);
    } catch (error) {
      entry.status = "failed";
      entry.history = [...(entry.history ?? []).slice(-4), { at: new Date().toISOString(), error: String(error).slice(0, 200) }];
      failed += 1;
      console.error(`FAILED ${asset.id}: ${error}`);
    }
    const i = registry.assets.findIndex((a) => a.id === asset.id);
    registry.assets[i] = entry;
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  }
  console.log(JSON.stringify({ generated, failed, summary: plan(readRegistry()) }, null, 2));
})();
