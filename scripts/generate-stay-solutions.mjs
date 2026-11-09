/**
 * Solution-card imagery for NaijaStay, matching the mockup's five photo cards.
 * FLUX 3 Klein 1K. Neutral daylight, distinct subjects, people facing camera.
 */
import fs from "node:fs";
import path from "node:path";
const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = "flux-3/klein-text-to-image";
const CR = 1.6, USD = 0.005;
const REGISTRY = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT = path.join(process.cwd(), "public", "generated", "stay");
const BASEC = "Photorealistic editorial portrait photography, bright natural daylight, true-to-life colour, warm but neutral white balance, sharp detail, premium travel marketplace quality, no text, no watermark";
const ASSETS = [
  { id: "stay-sol-travelers", prompt: `${BASEC}. A smiling Black African woman traveller in a beige sun hat holding a suitcase, outdoors in a sunny city street with a hotel behind her` },
  { id: "stay-sol-tenants", prompt: `${BASEC}. A Black African man in a smart casual shirt holding house keys, standing inside a bright modern apartment with boxes behind him, smiling` },
  { id: "stay-sol-buyers", prompt: `${BASEC}. A young Black African couple smiling together while looking at a house key in their hands, bright modern home interior background` },
  { id: "stay-sol-owners", prompt: `${BASEC}. A confident Black African woman property owner in a blazer holding a tablet, standing in front of a modern apartment building, smiling at the camera` },
  { id: "stay-sol-business", prompt: `${BASEC}. A Black African businessman in a navy suit smiling in a bright modern corporate lobby, glass and light wood interior` }
];
const reg = fs.existsSync(REGISTRY) ? JSON.parse(fs.readFileSync(REGISTRY, "utf8")) : { assets: [] };
const have = new Set(reg.assets.filter((a) => a.storagePath).map((a) => a.id));
const missing = ASSETS.filter((a) => !have.has(a.id));
if (process.argv.includes("--plan")) { console.log(JSON.stringify({ pending: missing.length, costUsd: +(missing.length * CR * USD).toFixed(2) })); process.exit(0); }
const key = process.env.KIE_API_KEY;
if (!key) { console.error("KIE_API_KEY missing"); process.exit(2); }
for (const asset of missing) {
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
  const entry = { id: asset.id, vertical: "stay", kind: "solution", component: "Solutions for Everyone", prompt: asset.prompt, model: MODEL, size: "1K", status: "generated", storagePath: `generated/stay/${asset.id}.png`, resultUrl: url, generatedAt: new Date().toISOString(), creditsConsumed: CR, costUsd: +(CR * USD).toFixed(2), qualityReview: "pending-owner-review", usageReferences: ["components/stay/stay-home.tsx"] };
  const i = reg.assets.findIndex((a) => a.id === asset.id);
  if (i >= 0) reg.assets[i] = entry; else reg.assets.push(entry);
  fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2));
  console.log(`generated ${asset.id}`);
}
