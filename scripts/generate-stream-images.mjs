/**
 * NaijaStream original artwork via the verified Kie.ai pipeline (GPT Image 2, 1K,
 * ~$0.03/image). Reuses the same API contract and registry as the gigs script.
 * All figures are fictional demonstration artists — never real people.
 *
 * Usage: node --env-file=.env scripts/generate-stream-images.mjs [--status]
 */
import fs from "node:fs";
import path from "node:path";

const API_BASE = "https://api.kie.ai/api/v1";
const MODEL = "gpt-image-2-text-to-image";
const SIZE = "1K";
const CREDITS_PER_IMAGE = 6;
const USD_PER_CREDIT = 0.005;
const REGISTRY_PATH = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT_DIR = path.join(process.cwd(), "public", "generated", "stream");

const ART = [
  { id: "stream-artist-adaeze", kind: "artist portrait", prompt: "Editorial studio portrait of a confident young Nigerian female afrobeats singer with braided hair and gold jewellery, dramatic teal and green rim lighting, dark background, premium music-platform campaign photography, fictional person, no text, no watermark" },
  { id: "stream-artist-kunle", kind: "artist portrait", prompt: "Editorial studio portrait of a Nigerian male afrobeats artist wearing sunglasses and a patterned designer shirt, moody dark background with amber rim light, premium music campaign photography, fictional person, no text, no watermark" },
  { id: "stream-artist-amaka", kind: "artist portrait", prompt: "Editorial portrait of a Nigerian female gospel singer smiling warmly in a bright studio, soft green light, premium music-platform photography, fictional person, no text, no watermark" },
  { id: "stream-artist-tobi", kind: "artist portrait", prompt: "Editorial portrait of a young Nigerian male hip-hop artist with short dreadlocks in a recording studio, purple and blue lighting, fictional person, no text, no watermark" },
  { id: "stream-artist-zainab", kind: "artist portrait", prompt: "Editorial portrait of a Kenyan female amapiano DJ wearing headphones, warm sunset colours, fictional person, no text, no watermark" },
  { id: "stream-artist-kojo", kind: "artist portrait", prompt: "Editorial portrait of a Ghanaian male highlife guitarist with a classic guitar, golden warm lighting, fictional person, no text, no watermark" },
  { id: "stream-cover-afrobeats", kind: "playlist cover", prompt: "Bold abstract graphic album-style cover art for an Afrobeats playlist: vivid orange and green geometric shapes, African pattern motifs, dark background, editorial music artwork, no text, no logo, no watermark" },
  { id: "stream-cover-amapiano", kind: "playlist cover", prompt: "Abstract album-style artwork for an Amapiano playlist: deep indigo and neon purple wave patterns, nightclub light streaks, no text, no logo, no watermark" },
  { id: "stream-cover-gospel", kind: "playlist cover", prompt: "Uplifting abstract cover art for an African gospel playlist: warm gold light rays over deep navy, subtle rising sun motif, no text, no logo, no watermark" },
  { id: "stream-cover-hiphop", kind: "playlist cover", prompt: "Gritty abstract cover art for Nigerian hip-hop playlist: concrete textures, red and black clash, bold graffiti-free shapes, no text, no logo, no watermark" },
  { id: "stream-cover-chill", kind: "playlist cover", prompt: "Calm abstract cover art for an African chill playlist: soft green teal gradients, palm-leaf silhouettes, dusk mood, no text, no logo, no watermark" },
  { id: "stream-cover-podcast", kind: "podcast cover", prompt: "Studio microphone silhouette on a deep charcoal background with green accent glow, premium podcast cover art, no text, no logo, no watermark" },
  { id: "stream-hero", kind: "hero banner", prompt: "Cinematic wide banner of a Nigerian afrobeats artist silhouette performing on stage with green stage lights and a cheering crowd, dramatic haze, premium music platform hero image, fictional person, no text, no watermark" },
  { id: "stream-cover-live", kind: "live event art", prompt: "Energetic concert scene at a Lagos outdoor amphitheatre at dusk, stage lights and crowd silhouettes, cinematic, no text, no watermark" }
];

function readRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
}

async function generate(asset, apiKey) {
  const create = await fetch(`${API_BASE}/jobs/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, input: { prompt: `${asset.prompt}. Square 1:1 orientation.`, size: SIZE } })
  });
  const created = await create.json();
  if (created?.code !== 200 || !created?.data?.taskId) throw new Error(`createTask failed HTTP ${create.status}`);
  const taskId = created.data.taskId;
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 15000));
    const poll = await fetch(`${API_BASE}/jobs/recordInfo?taskId=${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const body = await poll.json().catch(() => null);
    const data = body?.data;
    if (!data) continue;
    if (data.state === "success") {
      const url = JSON.parse(data.resultJson ?? "{}")?.resultUrls?.[0] ?? null;
      if (!url) throw new Error("no result url");
      return { url, taskId, credits: data.creditsConsumed ?? CREDITS_PER_IMAGE };
    }
    if (data.state === "fail" || data.state === "error") throw new Error(data.failMsg ?? "failed");
  }
  throw new Error("timeout");
}

(async () => {
  const registry = readRegistry();
  const apiKey = process.env.KIE_API_KEY;
  if (process.argv.includes("--status")) {
    console.log(JSON.stringify(registry.assets.filter((a) => a.vertical === "stream").map((a) => ({ id: a.id, status: a.status, cost: a.costUsd })), null, 1));
    if (!apiKey) process.exit(0);
  }
  if (!apiKey) {
    console.error(JSON.stringify({ blocked: "missing_credentials", missingInput: "KIE_API_KEY (node --env-file=.env)" }));
    process.exit(2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let generated = 0;
  let failures = 0;
  for (const asset of ART) {
    const existing = registry.assets.find((a) => a.id === asset.id);
    if (existing?.storagePath && fs.existsSync(path.join(process.cwd(), "public", existing.storagePath))) continue;
    try {
      const { url, taskId, credits } = await generate(asset, apiKey);
      const file = path.join(OUT_DIR, `${asset.id}.png`);
      fs.writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
      const record = {
        id: asset.id,
        vertical: "stream",
        component: asset.kind,
        prompt: asset.prompt,
        model: MODEL,
        size: SIZE,
        status: "generated",
        storagePath: path.join("generated", "stream", `${asset.id}.png`),
        taskId,
        creditsConsumed: credits,
        costUsd: Number((credits * USD_PER_CREDIT).toFixed(2)),
        generatedAt: new Date().toISOString(),
        qualityReview: "pending-owner-review",
        note: "Fictional demonstration artist/release artwork — not a real person or release."
      };
      const index = registry.assets.findIndex((a) => a.id === asset.id);
      if (index >= 0) registry.assets[index] = record;
      else registry.assets.push(record);
      fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
      generated += 1;
      console.log(`generated ${asset.id}`);
    } catch (error) {
      failures += 1;
      console.error(`FAILED ${asset.id}: ${error}`);
    }
  }
  const streamCost = registry.assets.filter((a) => a.vertical === "stream").reduce((sum, a) => sum + (a.costUsd ?? 0), 0);
  console.log(JSON.stringify({ generated, failures, streamAssets: registry.assets.filter((a) => a.vertical === "stream").length, streamCostUsd: Number(streamCost.toFixed(2)) }));
})();
