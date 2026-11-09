/**
 * Regenerate the NaijaStay category tiles. The original batch shared a
 * "warm golden daylight" prompt and all ten came out sepia; these use a neutral
 * daylight brief and distinct, clearly different subjects.
 */
import fs from "node:fs";
import path from "node:path";
const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = "flux-3/klein-text-to-image";
const CR = 1.6, USD = 0.005;
const REGISTRY = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT = path.join(process.cwd(), "public", "generated", "stay");
const N = "Photorealistic architectural and interior photography, bright neutral daylight, accurate white balance, true-to-life colours, crisp detail, no text, no watermark";
const ASSETS = [
  { id: "stay-cat-hotels", prompt: `${N}. Exterior of a modern Nigerian hotel at midday: white facade, glass entrance, swimming pool, palm trees, blue sky` },
  { id: "stay-cat-serviced", prompt: `${N}. Bright serviced apartment living room: white walls, grey sofa, wooden floor, plants, large window with daylight` },
  { id: "stay-cat-short-term", prompt: `${N}. Cosy short-let bedroom with patterned African throw on a white bed, rattan chair, soft natural light` },
  { id: "stay-cat-long-term", prompt: `${N}. Family house exterior with a tidy garden and paved driveway in a Nigerian neighbourhood, clear day` },
  { id: "stay-cat-land", prompt: `${N}. Green land plot with white survey markers, mown grass, an access road, bright sky` },
  { id: "stay-cat-student", prompt: `${N}. Student room with a single bed, desk, bookshelf and a window with daylight` },
  { id: "stay-cat-corporate", prompt: `${N}. Corporate apartment with a work desk, laptop, neutral furniture and a city view` },
  { id: "stay-cat-vacation", prompt: `${N}. White beach house with a pool and palm trees, bright clear day` },
  { id: "stay-cat-event", prompt: `${N}. Bright hotel conference room with rows of chairs, natural light from tall windows` }
];
const reg = fs.existsSync(REGISTRY) ? JSON.parse(fs.readFileSync(REGISTRY, "utf8")) : { assets: [] };
if (process.argv.includes("--plan")) { console.log(JSON.stringify({ pending: ASSETS.length, costUsd: +(ASSETS.length * CR * USD).toFixed(2) })); process.exit(0); }
const key = process.env.KIE_API_KEY;
if (!key) { console.error("KIE_API_KEY missing"); process.exit(2); }
for (const asset of ASSETS) {
  const create = await fetch(`${API_BASE}/jobs/createTask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: MODEL, input: { prompt: `${asset.prompt}. Landscape 4:3 orientation.`, size: "1K" } }) });
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
  fs.writeFileSync(path.join(OUT, `${asset.id}.png`), Buffer.from(await (await fetch(url)).arrayBuffer()));
  const entry = { id: asset.id, vertical: "stay", kind: "category", component: "category tile", prompt: asset.prompt, model: MODEL, size: "1K", status: "generated", storagePath: `generated/stay/${asset.id}.png`, resultUrl: url, generatedAt: new Date().toISOString(), creditsConsumed: CR, costUsd: +(CR * USD).toFixed(2), qualityReview: "pending-owner-review", usageReferences: ["components/stay/stay-home.tsx"] };
  const i = reg.assets.findIndex((a) => a.id === asset.id);
  if (i >= 0) reg.assets[i] = entry; else reg.assets.push(entry);
  fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2));
  console.log(`regenerated ${asset.id}`);
}
