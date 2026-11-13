/**
 * Kie.ai taxonomy product images (authorized batch). Creates one original photo
 * per DEMO product in the approved taxonomy, records provenance and credits.
 * Usage: node --env-file=.env scripts/generate-taxonomy-images.mjs --plan
 *        node --env-file=.env scripts/generate-taxonomy-images.mjs --only=<id>
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = "gpt-image-2-5-flare-text-to-image";
const OUT_DIR = path.join(process.cwd(), "public", "generated", "taxonomy");
const LEDGER = path.join(process.cwd(), "docs", "taxonomy", "generation-ledger.json");
const STYLE = "Photorealistic catalogue product photograph, warm neutral studio background, soft natural light, centered square composition, accurate materials and colours, premium African marketplace quality, no text, no watermark, no logo, no hands";

const ASSETS = [
  { id: "teff-flour", prompt: "a small wooden bowl of fine ivory teff flour beside a plain woven jute sack and scattered teff grains" },
  { id: "african-print-fabrics", prompt: "neatly folded stack of vibrant African wax-print cotton fabrics in indigo, gold and green geometric patterns" },
  { id: "kente-cloth", prompt: "folded handwoven kente cloth with narrow strips in gold, green, red and black geometric patterns" },
  { id: "shea-butter", prompt: "raw unrefined ivory shea butter in a shallow carved calabash bowl with a few shea nuts beside it" },
  { id: "black-soap", prompt: "three rustic dark-brown African black soap bars stacked on a plain wooden tray with a small bowl of shea butter" },
  { id: "cassava-grater", prompt: "small stainless-steel motorised cassava grating machine on a clean workshop floor, industrial but compact, no branding" },
  { id: "maize-meal", prompt: "a heap of fine white maize meal in a woven basket with a few dried maize cobs beside it" },
  { id: "woven-baskets", prompt: "set of three nested handwoven storage baskets in natural straw with dark geometric bands" }
];

function readLedger() {
  if (!fs.existsSync(LEDGER)) return { model: MODEL, size: "1K", assets: [] };
  return JSON.parse(fs.readFileSync(LEDGER, "utf8"));
}
function writeLedger(ledger) { fs.mkdirSync(path.dirname(LEDGER), { recursive: true }); fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2)); }

async function createTask(asset, apiKey) {
  const res = await fetch(`${API_BASE}/jobs/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, input: { prompt: `${asset.prompt}. ${STYLE}.`, resolution: "1K", aspect_ratio: "1:1" } })
  });
  const body = await res.json();
  if (body?.code !== 200 || !body?.data?.taskId) throw new Error(`createTask failed: HTTP ${res.status} ${String(body?.msg ?? "").slice(0, 160)}`);
  return body.data.taskId;
}

async function waitFor(taskId, apiKey) {
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 15000));
    const body = await (await fetch(`${API_BASE}/jobs/recordInfo?taskId=${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } })).json().catch(() => null);
    const data = body?.data;
    if (!data) continue;
    if (data.state === "success") {
      const url = JSON.parse(data.resultJson ?? "{}")?.resultUrls?.[0];
      if (!url) throw new Error("job succeeded without result URL");
      return { url, credits: data.creditsConsumed ?? null };
    }
    if (data.state === "fail" || data.state === "error") throw new Error(`job failed: ${data.failMsg ?? data.state}`);
  }
  throw new Error("job timed out");
}

(async () => {
  const ledger = readLedger();
  const apiKey = process.env.KIE_API_KEY;
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? new Set(onlyArg.slice(7).split(",")) : null;
  const pending = ASSETS.filter((a) => {
    const existing = ledger.assets.find((e) => e.id === a.id);
    return !(existing?.webpPath && fs.existsSync(path.join(process.cwd(), "public", existing.webpPath)));
  }).filter((a) => !only || only.has(a.id));

  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify({ model: MODEL, count: pending.length, estimatedCredits: pending.length * 3, note: "credit count read back per task", pending: pending.map((a) => a.id) }, null, 2));
    return;
  }
  if (!apiKey) { console.error("blocked: KIE_API_KEY missing"); process.exit(2); }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const asset of pending) {
    let entry = ledger.assets.find((e) => e.id === asset.id);
    if (!entry) { entry = { id: asset.id, prompt: asset.prompt, model: MODEL, size: "1K", status: "pending", taskId: null, credits: null }; ledger.assets.push(entry); }
    if (!entry.taskId) {
      entry.taskId = await createTask(asset, apiKey);
      entry.status = "submitted";
      entry.submittedAt = new Date().toISOString();
      writeLedger(ledger);
    }
    const { url, credits } = await waitFor(entry.taskId, apiKey);
    const png = path.join(OUT_DIR, `${asset.id}.png`);
    fs.writeFileSync(png, Buffer.from(await (await fetch(url)).arrayBuffer()));
    const webp = path.join(OUT_DIR, `${asset.id}.webp`);
    await sharp(png).resize(1024, 1024, { fit: "cover" }).webp({ quality: 86 }).toFile(webp);
    entry = {
      ...entry,
      status: "generated",
      credits,
      pngPath: `/generated/taxonomy/${asset.id}.png`,
      webpPath: `/generated/taxonomy/${asset.id}.webp`,
      alt: asset.prompt,
      generatedAt: new Date().toISOString(),
      review: "pending visual inspection"
    };
    ledger.assets = ledger.assets.map((e) => (e.id === asset.id ? entry : e));
    writeLedger(ledger);
    console.log(JSON.stringify({ id: asset.id, credits, webpPath: entry.webpPath }));
  }
  const total = ledger.assets.reduce((sum, e) => sum + (e.credits ?? 0), 0);
  console.log(JSON.stringify({ generated: pending.length, cumulativeCredits: total }, null, 2));
})().catch((error) => { console.error("GENERATION ERROR", error.message); process.exit(1); });
