/**
 * Extra hero imagery for NaijaStay — a rotating carousel needs several distinct
 * scenes. FLUX 3 Klein 1K (1.6 credits ≈ $0.008). --plan to preview cost.
 */
import fs from "node:fs";
import path from "node:path";
const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = "flux-3/klein-text-to-image";
const SIZE = "1K";
const CR = 1.6;
const USD = 0.005;
const REGISTRY_PATH = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT_DIR = path.join(process.cwd(), "public", "generated", "stay");
const STYLE = "Photorealistic premium African hospitality photography, golden-hour natural light, editorial travel-magazine quality, rich saturated colours, no text, no words, no watermark, no logo";
const ASSETS = [
  { id: "stay-hero-2", prompt: `${STYLE}. Wide hero: a modern glass-walled beach villa in Ghana with an infinity edge pool, palm trees and tropical garden, warm sunset light reflecting on the water, a woman in a sun hat relaxing on a lounger, no people facing the camera` },
  { id: "stay-hero-3", prompt: `${STYLE}. Wide hero: a luxurious African safari lodge deck at dusk overlooking savannah and acacia trees, lanterns glowing, an inviting plunge pool, warm interior light through glass doors` },
  { id: "stay-hero-4", prompt: `${STYLE}. Wide hero: an elegant Nairobi city rooftop apartment terrace with a pool and skyline at blue hour, warm lamps and lounge seating, lush plants` }
];
const reg = fs.existsSync(REGISTRY_PATH) ? JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8")) : { assets: [] };
const have = new Set(reg.assets.filter((a) => a.storagePath).map((a) => a.id));
const missing = ASSETS.filter((a) => !have.has(a.id));
if (process.argv.includes("--plan")) {
  console.log(JSON.stringify({ pending: missing.length, costUsd: Number((missing.length * CR * USD).toFixed(2)) }));
  process.exit(0);
}
const key = process.env.KIE_API_KEY;
if (!key) { console.error("KIE_API_KEY missing"); process.exit(2); }
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const asset of missing) {
  const create = await fetch(`${API_BASE}/jobs/createTask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: MODEL, input: { prompt: `${asset.prompt}. Wide 16:9 orientation.`, size: SIZE } }) });
  const made = await create.json();
  if (made?.code !== 200) { console.error("create failed", asset.id, made?.msg); continue; }
  const taskId = made.data.taskId;
  let url = null;
  for (let i = 0; i < 40 && !url; i++) {
    await new Promise((r) => setTimeout(r, 15000));
    const info = await (await fetch(`${API_BASE}/jobs/recordInfo?taskId=${taskId}`, { headers: { Authorization: `Bearer ${key}` } })).json().catch(() => null);
    if (info?.data?.state === "success") url = JSON.parse(info.data.resultJson ?? "{}")?.resultUrls?.[0] ?? null;
    if (info?.data?.state === "fail") { console.error("job failed", asset.id); break; }
  }
  if (!url) continue;
  fs.writeFileSync(path.join(OUT_DIR, `${asset.id}.png`), Buffer.from(await (await fetch(url)).arrayBuffer()));
  const entry = { id: asset.id, vertical: "stay", kind: "hero", component: "homepage hero carousel", prompt: asset.prompt, model: MODEL, size: SIZE, status: "generated", storagePath: `generated/stay/${asset.id}.png`, resultUrl: url, generatedAt: new Date().toISOString(), creditsConsumed: CR, costUsd: Number((CR * USD).toFixed(2)), qualityReview: "pending-owner-review", usageReferences: ["components/stay/stay-home.tsx"] };
  const idx = reg.assets.findIndex((a) => a.id === asset.id);
  if (idx >= 0) reg.assets[idx] = entry; else reg.assets.push(entry);
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
  console.log(`generated ${asset.id}`);
}
