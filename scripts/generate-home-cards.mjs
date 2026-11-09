/**
 * Card imagery for the four dashboards, matching each mockup card subject.
 * FLUX 3 Klein 1K (1.6 credits ≈ $0.008).
 */
import fs from "node:fs";
import path from "node:path";
const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = "flux-3/klein-text-to-image";
const CR = 1.6, USD = 0.005;
const REG = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT = path.join(process.cwd(), "public", "generated", "home");
const N = "Photorealistic premium editorial photography, bright natural daylight, accurate white balance, true-to-life colour, no text, no watermark";
const ASSETS = [
  { id: "home-card-shop", prompt: `${N}. A stack of kraft shopping boxes and a red NaijaDeals-style paper bag on a warm wooden counter, a few folded garments beside them` },
  { id: "home-card-eats", prompt: `${N}. A takeaway bowl of Nigerian jollof rice with grilled chicken and fried plantain, steam rising, dark table` },
  { id: "home-card-fresh", prompt: `${N}. A woven basket overflowing with tomatoes, peppers, yams, plantains and leafy greens on a farm table` },
  { id: "home-card-drive", prompt: `${N}. A shiny green sedan car parked on a sunny African city street, three-quarter front view` },
  { id: "home-card-send", prompt: `${N}. A large white and green box truck parked at a logistics depot with stacked pallets` },
  { id: "home-card-gigs", prompt: `${N}. A confident African electrician in a yellow hard hat and hi-vis vest, arms folded, smiling` },
  { id: "home-card-stay", prompt: `${N}. A modern multistorey hotel building with lit balconies at dusk` },
  { id: "home-card-stream", prompt: `${N}. A smiling young African woman wearing purple headphones, listening to music, bright purple background` },
  { id: "home-card-pay", prompt: `${N}. A hand holding a smartphone showing an abstract green payment screen with a QR code, market background` },
  { id: "home-card-aura", prompt: `${N}. A friendly white and green humanoid AI robot assistant with expressive eyes, purple gradient background, friendly and welcoming` }
];
const reg = fs.existsSync(REG) ? JSON.parse(fs.readFileSync(REG, "utf8")) : { assets: [] };
const have = new Set(reg.assets.filter((a) => a.storagePath).map((a) => a.id));
const missing = ASSETS.filter((a) => !have.has(a.id));
if (process.argv.includes("--plan")) { console.log(JSON.stringify({ pending: missing.length, usd: +(missing.length * CR * USD).toFixed(2) })); process.exit(0); }
const key = process.env.KIE_API_KEY;
if (!key) { console.error("KIE_API_KEY missing"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
for (const asset of missing) {
  const create = await fetch(`${API_BASE}/jobs/createTask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: MODEL, input: { prompt: `${asset.prompt}. Landscape 4:3 orientation.`, size: "1K" } }) });
  const made = await create.json();
  if (made?.code !== 200) { console.error("create failed", asset.id, made?.msg); continue; }
  let url = null;
  for (let i = 0; i < 40 && !url; i++) {
    await new Promise((r) => setTimeout(r, 15000));
    const info = await (await fetch(`${API_BASE}/jobs/recordInfo?taskId=${made.data.taskId}`, { headers: { Authorization: `Bearer ${key}` } })).json().catch(() => null);
    if (info?.data?.state === "success") url = JSON.parse(info.data.resultJson ?? "{}")?.resultUrls?.[0] ?? null;
    if (info?.data?.state === "fail") { console.error("job failed", asset.id); break; }
  }
  if (!url) continue;
  fs.writeFileSync(path.join(OUT, `${asset.id}.png`), Buffer.from(await (await fetch(url)).arrayBuffer()));
  const entry = { id: asset.id, vertical: "home", kind: "card", component: "dashboard vertical card", prompt: asset.prompt, model: MODEL, size: "1K", status: "generated", storagePath: `generated/home/${asset.id}.png`, resultUrl: url, generatedAt: new Date().toISOString(), creditsConsumed: CR, costUsd: +(CR * USD).toFixed(2), qualityReview: "pending-owner-review", usageReferences: ["lib/home/designs.ts"] };
  const i = reg.assets.findIndex((a) => a.id === asset.id);
  if (i >= 0) reg.assets[i] = entry; else reg.assets.push(entry);
  fs.writeFileSync(REG, JSON.stringify(reg, null, 2));
  console.log(`generated ${asset.id}`);
}
