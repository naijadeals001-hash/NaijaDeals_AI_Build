/**
 * Homepage hero imagery for the four dashboard experiences.
 *
 * The Abuja slide must show four recognisable landmarks, so it is a composite
 * illustration rather than a fake documentary photograph — the prompt says so.
 *
 * FLUX 3 Klein 1K: 1.6 credits (≈$0.008) per image, verified 2026-11-09.
 * Usage: node --env-file=.env scripts/generate-home-heroes.mjs [--plan] [--only=a,b]
 */
import fs from "node:fs";
import path from "node:path";

const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = "flux-3/klein-text-to-image";
const CR = 1.6;
const USD = 0.005;
const REGISTRY = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT = path.join(process.cwd(), "public", "generated", "home");

const N = "Photorealistic premium editorial photography, natural daylight, accurate white balance, true-to-life colour, no text, no watermark, no logo";

const ASSETS = [
  {
    id: "home-hero-abuja",
    kind: "hero",
    prompt: `${N}. Wide panoramic composite illustration of Abuja, Nigeria: Aso Rock granite monolith rising behind the city, the golden domes and minarets of the Abuja National Mosque, the white A-frame spire and cross of the National Christian Centre, and the monumental Abuja City Gate arch, with modern roads, green trees and a bright blue sky. Clearly an artistic composite of landmarks, not a documentary photograph`
  },
  { id: "home-hero-drive", kind: "hero", prompt: `${N}. A premium dark green ride-hailing sedan with a smiling Nigerian driver at the wheel on a clean Lagos bridge at golden hour, city skyline behind, sense of motion` },
  { id: "home-hero-shop", kind: "hero", prompt: `${N}. A busy modern Nigerian marketplace scene: a smiling woman shop owner handing a package across a bright counter filled with electronics, clothing and household goods` },
  { id: "home-hero-eats", kind: "hero", prompt: `${N}. Overhead spread of authentic Nigerian dishes: a large bowl of jollof rice, egusi soup with pounded yam, suya skewers, moi moi and fried plantain, served on a patterned tablecloth` },
  { id: "home-hero-fresh", kind: "hero", prompt: `${N}. A smiling Nigerian farmer in a sun hat holding a woven basket of fresh tomatoes, peppers and leafy greens at sunrise on a smallholding` },
  { id: "home-hero-send", kind: "hero", prompt: `${N}. A large white and green freight truck with its trailer loaded at an African distribution depot, a cargo van beside it, workers in high-visibility vests` },
  { id: "home-hero-gigs", kind: "hero", prompt: `${N}. Three skilled African professionals together — an electrician in a hard hat, a software developer with a laptop, and a chef in white — confident and smiling` },
  { id: "home-hero-stay", kind: "hero", prompt: `${N}. A luxury modern African villa with an infinity pool, palm trees and warm interior lights at dusk` },
  { id: "home-hero-stream", kind: "hero", prompt: `${N}. An African singer in a recording studio with headphones and a microphone, purple and teal stage lighting, energetic performance` },
  { id: "home-hero-pay", kind: "hero", prompt: `${N}. A young Nigerian woman paying with her phone at a bright market stall, a small digital terminal on the counter, confident and modern` },
  { id: "home-hero-mobility", kind: "hero", prompt: `${N}. An African motorcycle courier and a ride-hailing car together on a bright modern African city street, riders in green uniforms, sense of fast service` },
  { id: "home-hero-commerce", kind: "hero", prompt: `${N}. Rich African lifestyle montage: a market stall with colourful fabrics and fresh produce, a woman shopping, warm inviting light` }
];

const reg = fs.existsSync(REGISTRY) ? JSON.parse(fs.readFileSync(REGISTRY, "utf8")) : { assets: [] };
const have = new Set(reg.assets.filter((a) => a.storagePath).map((a) => a.id));
const missing = ASSETS.filter((a) => !have.has(a.id));

if (process.argv.includes("--plan")) {
  console.log(JSON.stringify({ total: ASSETS.length, pending: missing.length, model: MODEL, estimatedCredits: missing.length * CR, estimatedUsd: Number((missing.length * CR * USD).toFixed(2)) }, null, 2));
  process.exit(0);
}
const key = process.env.KIE_API_KEY;
if (!key) { console.error(JSON.stringify({ blocked: "missing_credentials", pending: missing.length })); process.exit(2); }
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice(7).split(",")) : null;
fs.mkdirSync(OUT, { recursive: true });

for (const asset of missing) {
  if (only && !only.has(asset.id)) continue;
  const create = await fetch(`${API_BASE}/jobs/createTask`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: MODEL, input: { prompt: `${asset.prompt}. Wide 16:9 orientation.`, size: "1K" } }) });
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
  const entry = { id: asset.id, vertical: "home", kind: asset.kind, component: "homepage hero carousel", prompt: asset.prompt, model: MODEL, size: "1K", status: "generated", storagePath: `generated/home/${asset.id}.png`, resultUrl: url, generatedAt: new Date().toISOString(), creditsConsumed: CR, costUsd: Number((CR * USD).toFixed(2)), qualityReview: "pending-owner-review", usageReferences: ["lib/home/designs.ts"] };
  const i = reg.assets.findIndex((a) => a.id === asset.id);
  if (i >= 0) reg.assets[i] = entry; else reg.assets.push(entry);
  fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2));
  console.log(`generated ${asset.id}`);
}
