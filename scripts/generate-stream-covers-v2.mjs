/**
 * NaijaStream cover/hero regeneration (approved Option B, $0.18 cap = 6 images).
 * Text-free graphic artwork so titles can be typeset accurately in code.
 * Reuses the verified Kie.ai contract (gpt-image-2-text-to-image, 1K, ~$0.03).
 *
 * Usage: node --env-file=.env scripts/generate-stream-covers-v2.mjs [--status]
 */
import fs from "node:fs";
import path from "node:path";

const API = "https://api.kie.ai/api/v1";
const MODEL = "gpt-image-2-text-to-image";
const CREDITS = 6;
const USD_PER_CREDIT = 0.005;
const BUDGET_USD = 0.18;
const REGISTRY = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT = path.join(process.cwd(), "public", "generated", "stream", "opt-v2");

// Mockup palette: deep charcoal, emerald, warm amber, violet, gold.
const ASSETS = [
  {
    id: "stream-v2-cover-afrobeats",
    prompt: "Bold abstract square cover art for an Afrobeats playlist: dense emerald green and warm amber geometric shapes with subtle African textile pattern, deep charcoal background, high energy, flat graphic design, absolutely no text, no letters, no logos, no watermark"
  },
  {
    id: "stream-v2-cover-amapiano",
    prompt: "Contemporary Amapiano cover art: deep indigo and neon violet gradient waves with glowing light streaks, minimal geometric accents, dark nightclub mood, flat graphic design, absolutely no text, no letters, no logos, no watermark"
  },
  {
    id: "stream-v2-cover-gospel",
    prompt: "Uplifting premium gospel cover art: warm gold radial light rays over deep navy, subtle dove-like abstract arch shape, calm and hopeful, flat graphic design, absolutely no text, no letters, no logos, no watermark"
  },
  {
    id: "stream-v2-cover-hiphop",
    prompt: "Bold urban hip-hop cover art: high-contrast crimson red and black clash with concrete texture and gritty halftone, street energy, flat graphic design, absolutely no text, no letters, no logos, no watermark"
  },
  {
    id: "stream-v2-cover-chill",
    prompt: "Atmospheric minimal chill playlist cover: soft teal and sage gradient mist with a single thin gold horizon line, lots of negative space, serene, flat graphic design, absolutely no text, no letters, no logos, no watermark"
  },
  {
    id: "stream-v2-hero",
    prompt: "Cinematic wide banner: silhouette of an African artist on stage holding a microphone, dramatic emerald green stage lighting and haze, crowd silhouettes low in frame, dark negative space on the left third for a headline, absolutely no text, no letters, no logos, no watermark",
    size: "2K"
  }
];

function registry() {
  return JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
}

function streamSpend(reg) {
  return reg.assets.filter((a) => a.vertical === "stream").reduce((sum, a) => sum + (a.costUsd ?? 0), 0);
}

async function generate(asset, apiKey) {
  const create = await fetch(`${API}/jobs/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, input: { prompt: asset.prompt, size: "1K" } })
  });
  const created = await create.json();
  if (created?.code !== 200 || !created?.data?.taskId) throw new Error(`createTask HTTP ${create.status}`);
  const taskId = created.data.taskId;
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 15000));
    const poll = await fetch(`${API}/jobs/recordInfo?taskId=${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const body = await poll.json().catch(() => null);
    const d = body?.data;
    if (!d) continue;
    if (d.state === "success") {
      const url = JSON.parse(d.resultJson ?? "{}")?.resultUrls?.[0];
      if (!url) throw new Error("no url");
      return { url, taskId, credits: d.creditsConsumed ?? CREDITS };
    }
    if (d.state === "fail" || d.state === "error") throw new Error(d.failMsg ?? d.state);
  }
  throw new Error("timeout");
}

(async () => {
  const apiKey = process.env.KIE_API_KEY;
  const reg = registry();
  const baseline = streamSpend(reg);

  if (process.argv.includes("--status")) {
    console.log(JSON.stringify({ baseline, budget: BUDGET_USD, remaining: Number((BUDGET_USD - (baseline - 0.42)).toFixed(2)), v2: reg.assets.filter((a) => a.id.startsWith("stream-v2-")).map((a) => a.id) }, null, 1));
    process.exit(0);
  }
  if (!apiKey) {
    console.error(JSON.stringify({ blocked: "missing_credentials" }));
    process.exit(2);
  }

  fs.mkdirSync(OUT, { recursive: true });
  let thisRun = 0;
  const results = [];

  for (const asset of ASSETS) {
    if (thisRun + 0.03 > BUDGET_USD + 1e-9) {
      console.error(`BUDGET STOP before ${asset.id}`);
      break;
    }
    const existing = reg.assets.find((a) => a.id === asset.id);
    if (existing?.storagePath && fs.existsSync(path.join(process.cwd(), "public", existing.storagePath))) {
      console.log(`reuse ${asset.id}`);
      continue;
    }
    try {
      const { url, taskId, credits } = await generate(asset, apiKey);
      const file = path.join(OUT, `${asset.id}.png`);
      fs.writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
      const record = {
        id: asset.id,
        vertical: "stream",
        component: asset.id.includes("hero") ? "homepage hero" : `playlist cover (${asset.id.split("-").pop()})`,
        prompt: asset.prompt,
        model: MODEL,
        size: "1K",
        status: "generated",
        storagePath: path.join("generated", "stream", "opt-v2", `${asset.id}.png`),
        taskId,
        creditsConsumed: credits,
        costUsd: Number((credits * USD_PER_CREDIT).toFixed(2)),
        generatedAt: new Date().toISOString(),
        qualityReview: "pending-owner-review",
        note: "Text-free by instruction; titles typeset in application code."
      };
      const idx = reg.assets.findIndex((a) => a.id === asset.id);
      if (idx >= 0) reg.assets[idx] = record;
      else reg.assets.push(record);
      fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2));
      thisRun += record.costUsd;
      results.push({ id: asset.id, cost: record.costUsd, credits });
      console.log(`generated ${asset.id} ($${record.costUsd})`);
    } catch (error) {
      console.error(`FAILED ${asset.id}: ${error}`);
    }
  }

  console.log(JSON.stringify({ generated: results.length, costThisRun: Number(thisRun.toFixed(2)), streamTotal: Number((streamSpend(registry())).toFixed(2)) }, null, 1));
})();
