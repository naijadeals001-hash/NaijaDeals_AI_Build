/**
 * App icon for the NaijaDeals PWA and Android shell. Kie.ai FLUX 3 Klein.
 * The prompt asks for a flat vector-style mark with no text, because app icons
 * must read at 48px and AI text rendering is unreliable.
 */
import fs from "node:fs";
import path from "node:path";
const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = "flux-3/klein-text-to-image";
const REGISTRY = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT = path.join(process.cwd(), "public", "icons");
const PROMPT = "Flat vector app icon, deep green (#006d38) rounded square background, a bold stylised white letter N formed from two upward chevrons, a small amber (#f2a41a) sun dot at the top right, centred composition with generous padding, crisp edges, no text, no letters other than the N mark, no gradients, no shadows, high contrast, 1:1";
const reg = fs.existsSync(REGISTRY) ? JSON.parse(fs.readFileSync(REGISTRY, "utf8")) : { assets: [] };
if (process.argv.includes("--plan")) { console.log(JSON.stringify({ pending: 1, costUsd: 0.01 })); process.exit(0); }
const key = process.env.KIE_API_KEY;
if (!key) { console.error("KIE_API_KEY missing"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const create = await fetch(`${API_BASE}/jobs/createTask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: MODEL, input: { prompt: PROMPT, size: "1K" } }) });
const made = await create.json();
if (made?.code !== 200) { console.error("create failed", made?.msg); process.exit(1); }
let url = null;
for (let i = 0; i < 40 && !url; i++) {
  await new Promise((r) => setTimeout(r, 15000));
  const info = await (await fetch(`${API_BASE}/jobs/recordInfo?taskId=${made.data.taskId}`, { headers: { Authorization: `Bearer ${key}` } })).json().catch(() => null);
  if (info?.data?.state === "success") url = JSON.parse(info.data.resultJson ?? "{}")?.resultUrls?.[0] ?? null;
}
if (!url) { console.error("no result"); process.exit(1); }
fs.writeFileSync(path.join(OUT, "icon-source.png"), Buffer.from(await (await fetch(url)).arrayBuffer()));
const entry = { id: "platform-app-icon", vertical: "platform", kind: "icon", component: "PWA + Android app icon", prompt: PROMPT, model: MODEL, size: "1K", status: "generated", storagePath: "icons/icon-source.png", resultUrl: url, generatedAt: new Date().toISOString(), creditsConsumed: 1.6, costUsd: 0.01, qualityReview: "pending-owner-review", usageReferences: ["public/manifest.webmanifest"] };
const i = reg.assets.findIndex((a) => a.id === entry.id);
if (i >= 0) reg.assets[i] = entry; else reg.assets.push(entry);
fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2));
console.log("generated icon-source");
