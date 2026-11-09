/**
 * Regenerate the six demonstration-property images.
 *
 * The first batch failed review: every prompt ended with "warm golden-hour
 * light", so all six came out with the same sepia cast. These prompts instead
 * specify neutral, bright daytime light with distinct, verifiable subjects
 * (a Lagos hotel forecourt, a modern apartment interior, a villa exterior, etc.)
 * so the cards read as different real places.
 */
import fs from "node:fs";
import path from "node:path";
const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = "flux-3/klein-text-to-image";
const SIZE = "1K";
const CR = 1.6;
const USD = 0.005;
const REGISTRY = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT = path.join(process.cwd(), "public", "generated", "stay");
const NEUTRAL = "Photorealistic architectural photography, bright neutral daylight, accurate white balance, true-to-life colours, clean sharp detail, editorial real-estate quality, no text, no watermark";
const ASSETS = [
  { id: "stay-demo-hotel", prompt: `${NEUTRAL}. Front facade of a modern mid-rise hotel in Lagos at midday: white and dark grey stone cladding, glass entrance canopy, palm trees, a car in the driveway, blue sky with light clouds` },
  { id: "stay-demo-apartment", prompt: `${NEUTRAL}. Interior of a contemporary Lagos apartment living room: light oak floor, cream sofa, large window with city view, indoor plants, neutral daytime light` },
  { id: "stay-demo-villa", prompt: `${NEUTRAL}. Exterior of a modern white villa in Abuja with a flat roof, timber slat screens, a small garden and paved driveway, clear daylight` },
  { id: "stay-demo-cozy", prompt: `${NEUTRAL}. Small tidy two-bedroom apartment interior in Port Harcourt: compact kitchen, dining table for two, bright natural light from a window, light walls` },
  { id: "stay-demo-land", prompt: `${NEUTRAL}. Surveyed residential land plot in Enugu: mown grass, a cleared boundary with white survey markers, access road and neighbouring houses in the distance, bright overcast sky` },
  { id: "stay-demo-duplex", prompt: `${NEUTRAL}. Exterior of a three-bedroom duplex house in Ibadan: cream walls, dark roof, gated compound, paved frontage and small trees, clear blue sky` }
];
const reg = fs.existsSync(REGISTRY) ? JSON.parse(fs.readFileSync(REGISTRY, "utf8")) : { assets: [] };
if (process.argv.includes("--plan")) {
  console.log(JSON.stringify({ count: ASSETS.length, costUsd: Number((ASSETS.length * CR * USD).toFixed(2)) }));
  process.exit(0);
}
const key = process.env.KIE_API_KEY;
if (!key) { console.error("KIE_API_KEY missing"); process.exit(2); }
for (const asset of ASSETS) {
  const create = await fetch(`${API_BASE}/jobs/createTask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: MODEL, input: { prompt: `${asset.prompt}. Landscape 3:2 orientation.`, size: SIZE } }) });
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
  const entry = { id: asset.id, vertical: "stay", kind: "demo-property", component: "demo property card", prompt: asset.prompt, model: MODEL, size: SIZE, status: "generated", storagePath: `generated/stay/${asset.id}.png`, resultUrl: url, generatedAt: new Date().toISOString(), creditsConsumed: CR, costUsd: Number((CR * USD).toFixed(2)), qualityReview: "pending-owner-review", usageReferences: ["prisma/naijastay-seed.cjs"] };
  const i = reg.assets.findIndex((a) => a.id === asset.id);
  if (i >= 0) reg.assets[i] = entry; else reg.assets.push(entry);
  fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2));
  console.log(`regenerated ${asset.id}`);
}
