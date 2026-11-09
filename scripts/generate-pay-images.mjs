/**
 * NaijaPay photography. FLUX 3 Klein 1K (1.6 credits ≈ $0.008 per image).
 * `--plan` prints the cost for what is still missing; nothing paid happens without it.
 *
 * Every prompt states the scene the NaijaPay mockups ask for: Nigerian people in
 * green/gold and ankara, Lagos Third Mainland Bridge, market traders, and
 * business owners — no text, no logos, no watermarks, no invented UI.
 */
import fs from "node:fs";
import path from "node:path";

const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = "flux-3/klein-text-to-image";
const SIZE = "1K";
const CR = 1.6;
const USD = 0.005;
const REGISTRY_PATH = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT_DIR = path.join(process.cwd(), "public", "generated", "pay");

const STYLE =
  "Photorealistic premium Nigerian fintech brand photography, natural soft daylight, editorial advertising quality, rich saturated greens and warm gold accents, shallow depth of field, no text, no words, no letters, no watermark, no logo, no user interface";

const ASSETS = [
  {
    id: "pay-hero-woman",
    kind: "hero",
    component: "NaijaPay landing hero (desktop + mobile)",
    prompt: `${STYLE}. Portrait orientation hero: a joyful Nigerian woman in her late twenties wearing a green and gold ankara print headwrap and matching dress, smiling down at a black smartphone held in both hands, standing on Lagos waterfront at golden hour with the Third Mainland Bridge cable stays and city skyline softly out of focus behind her, warm rim light`
  },
  {
    id: "pay-hero-wide",
    kind: "hero",
    component: "NaijaPay landing hero (wide crops)",
    prompt: `${STYLE}. Wide landscape hero: a smiling Nigerian man in a crisp green shirt holding a phone at a Lagos market stall, crate of produce and fabric rolls around him, Third Mainland Bridge and lagoon in the background at sunset, warm golden light, generous empty space on the left for headline text`
  },
  {
    id: "pay-bills-card",
    kind: "section",
    component: "Pay Bills promo card",
    prompt: `${STYLE}. A young Nigerian woman in a mustard-yellow top sitting in a bright living room, smiling at her phone, a notebook and cup on the table, green potted plants behind her, soft window light, landscape crop focused on her upper body and hands`
  },
  {
    id: "pay-market-trader",
    kind: "section",
    component: "Market to Mainland section",
    prompt: `${STYLE}. A Nigerian market trader woman in a yellow and green gele headtie at her fabric stall, holding a phone and smiling confidently, colourful ankara fabrics stacked behind her, Lagos street market, warm afternoon light, portrait crop`
  },
  {
    id: "pay-business-owner",
    kind: "section",
    component: "NaijaPay for business section",
    prompt: `${STYLE}. A Nigerian small business owner in a green apron behind the counter of a modern phone and electronics shop, tablet and phone in hand, shelves of neatly arranged accessories behind, bright clean retail lighting, landscape crop`
  },
  {
    id: "pay-security",
    kind: "section",
    component: "Your security comes first card",
    prompt: `${STYLE}. A calm Nigerian man in a white shirt outdoors checking his smartphone, soft daylight, blurred green foliage behind him, trustworthy composed expression, portrait crop`
  },
  {
    id: "pay-skyline",
    kind: "section",
    component: "Same people, bigger possibilities card",
    prompt: `${STYLE}. Lagos skyline at blue hour from the lagoon, office towers lit warmly reflected in calm water, Third Mainland Bridge cable stays on the right, no people, cinematic wide landscape`
  },
  {
    id: "pay-scan-market",
    kind: "feature",
    component: "Scan and Pay at the market",
    prompt: `${STYLE}. Close view of a small printed QR code on a stand at a Nigerian market stall beside folded fabric, a hand holding a phone angled toward it, warm market lighting, shallow depth of field, landscape crop`
  },
  {
    id: "pay-send-screen",
    kind: "feature",
    component: "Send Money screen illustration",
    prompt: `${STYLE}. Two young Nigerian professionals laughing while one shows the other a phone screen, bright modern cafe in Lagos, plants and warm wood, landscape crop, friendly candid moment`
  },
  {
    id: "pay-receive-lemonade",
    kind: "feature",
    component: "Receive Money screen illustration",
    prompt: `${STYLE}. A small Nigerian street-food vendor smiling as a customer taps a phone to pay at her tidy stall, colourful umbrellas, warm evening light, landscape crop`
  },
  {
    id: "pay-hero-phone",
    kind: "hero",
    component: "NaijaPay hero — subject holding a phone with a payment confirmation",
    prompt: `${STYLE}. Portrait hero: a smiling Nigerian woman with long braided hair in a plain green blouse, holding a black smartphone in both hands and looking down at it warmly, standing on Lagos waterfront with the Third Mainland Bridge and skyline behind her, soft golden-hour light, shallow depth of field, generous headroom above her`
  },
  {
    id: "pay-bills-woman",
    kind: "feature",
    component: "Pay Bills card in the home screen preview",
    prompt: `${STYLE}. A Nigerian woman with braided hair in a mustard-yellow top smiling at her phone in a bright modern interior with green plants and a doorway, warm natural light, portrait crop, friendly and relaxed`
  },
  {
    id: "pay-phone-bills",
    kind: "feature",
    component: "Pay Bills preview tile",
    prompt: `${STYLE}. A Nigerian woman smiling while using her phone outdoors on a bright street, green foliage behind her, portrait crop, cheerful everyday moment`
  }
];

const reg = fs.existsSync(REGISTRY_PATH) ? JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8")) : { assets: [] };
const have = new Set(reg.assets.filter((a) => a.storagePath && a.status === "generated").map((a) => a.id));
const missing = ASSETS.filter((a) => !have.has(a.id));

if (process.argv.includes("--plan")) {
  console.log(
    JSON.stringify(
      {
        model: MODEL,
        pending: missing.map((a) => a.id),
        count: missing.length,
        credits: Number((missing.length * CR).toFixed(1)),
        costUsd: Number((missing.length * CR * USD).toFixed(2))
      },
      null,
      1
    )
  );
  process.exit(0);
}

const key = process.env.KIE_API_KEY;
if (!key) {
  console.error("KIE_API_KEY is not set in this environment.");
  process.exit(2);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

async function generate(asset) {
  const orientation = asset.kind === "hero" && asset.id.includes("woman") ? "Tall 4:5 portrait orientation." : "Wide 16:9 orientation.";
  const create = await fetch(`${API_BASE}/jobs/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, input: { prompt: `${asset.prompt}. ${orientation}`, size: SIZE } })
  });
  const made = await create.json().catch(() => null);
  if (made?.code !== 200) {
    console.error(`create failed ${asset.id}: ${made?.msg ?? "unknown"}`);
    return false;
  }
  const taskId = made.data.taskId;
  let url = null;
  for (let i = 0; i < 40 && !url; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 15000));
    const info = await fetch(`${API_BASE}/jobs/recordInfo?taskId=${taskId}`, { headers: { Authorization: `Bearer ${key}` } })
      .then((r) => r.json())
      .catch(() => null);
    if (info?.data?.state === "success") url = JSON.parse(info.data.resultJson ?? "{}")?.resultUrls?.[0] ?? null;
    if (info?.data?.state === "fail") {
      console.error(`job failed ${asset.id}`);
      return false;
    }
  }
  if (!url) {
    console.error(`timed out ${asset.id}`);
    return false;
  }
  fs.writeFileSync(path.join(OUT_DIR, `${asset.id}.png`), Buffer.from(await (await fetch(url)).arrayBuffer()));
  const entry = {
    id: asset.id,
    vertical: "pay",
    kind: asset.kind,
    component: asset.component,
    prompt: asset.prompt,
    model: MODEL,
    size: SIZE,
    status: "generated",
    storagePath: `generated/pay/${asset.id}.png`,
    resultUrl: url,
    generatedAt: new Date().toISOString(),
    creditsConsumed: CR,
    costUsd: Number((CR * USD).toFixed(2)),
    qualityReview: "pending-owner-review",
    usageReferences: ["components/pay/pay-landing.tsx"]
  };
  const idx = reg.assets.findIndex((a) => a.id === asset.id);
  if (idx >= 0) reg.assets[idx] = entry;
  else reg.assets.push(entry);
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
  console.log(`generated ${asset.id}`);
  return true;
}

let ok = 0;
for (const asset of missing) {
  if (await generate(asset)) ok += 1;
}
console.log(JSON.stringify({ generated: ok, attempted: missing.length, costUsd: Number((ok * CR * USD).toFixed(2)) }));
