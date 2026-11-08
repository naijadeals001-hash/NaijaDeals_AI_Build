/**
 * NaijaDeals original image-generation pipeline (Kie.ai GPT Image 2, 1K tier).
 *
 * Standing directive: all new photographic/illustrative assets for NaijaDeals
 * verticals are generated via Kie.ai — never stock photography or placeholders.
 * Verified live API (2026-11-08): POST /api/v1/jobs/createTask with model
 * "gpt-image-2-text-to-image" + input.size "1K"; results polled via
 * /api/v1/jobs/recordInfo; cost observed 6 credits per image (~$0.03 at the
 * owner-quoted rate).
 *
 * Requires KIE_API_KEY in the environment (run with: node --env-file=.env).
 * Assets are written to public/generated/gigs/ and registered in
 * scripts/image-registry.json with prompt, model, date, credits, USD cost and
 * review status. Approved images are never regenerated.
 *
 * Usage:
 *   node --env-file=.env scripts/generate-gigs-images.mjs    # generate pending
 *   node scripts/generate-gigs-images.mjs --status           # summary only
 */
import fs from "node:fs";
import path from "node:path";

const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = process.env.KIE_MODEL ?? "gpt-image-2-text-to-image";
const SIZE = process.env.KIE_IMAGE_SIZE ?? "1K";
const CREDITS_PER_IMAGE = 6; // observed 2026-11-08
const USD_PER_CREDIT = 0.005; // 6 credits ≈ $0.03/image, per the owner-quoted price
const POLL_INTERVAL_MS = 15000;
const MAX_POLLS = 40; // 10 minutes per image
const MAX_RETRIES = 2;
const REGISTRY_PATH = path.join(process.cwd(), "scripts", "image-registry.json");
const OUT_DIR = path.join(process.cwd(), "public", "generated");

/** Asset manifest: every UI image the verticals need, with prompts. */
const ASSETS = [
  { id: "gigs-hero-electrician", vertical: "gigs", component: "homepage hero collage (centre)", aspect: "portrait", prompt: "Photorealistic editorial portrait of a confident Nigerian electrician in a yellow hard hat and green work overalls, arms folded, smiling warmly, standing in a bright modern interior with soft daylight, natural skin texture, premium services-marketplace campaign photography, no text, no watermark" },
  { id: "gigs-hero-hairdresser", vertical: "gigs", component: "homepage hero collage (hair salon)", aspect: "square", prompt: "Photorealistic image of a Nigerian hairdresser styling a client's braids in a warm modern Lagos salon, natural lighting, authentic salon details, premium editorial quality, no text, no watermark" },
  { id: "gigs-hero-ac-technician", vertical: "gigs", component: "homepage hero collage (AC install)", aspect: "square", prompt: "Photorealistic image of a Nigerian technician in blue overalls installing a white wall-mounted split air conditioner in a clean living room, holding tools, natural light, premium editorial quality, no text, no watermark" },
  { id: "gigs-hero-photographer", vertical: "gigs", component: "homepage hero collage (photographer)", aspect: "square", prompt: "Photorealistic image of a Nigerian photographer holding a professional DSLR camera at an indoor celebration, warm bokeh lights in the background, premium editorial quality, no text, no watermark" },
  { id: "gigs-card-ac-installation", vertical: "gigs", component: "popular service card (AC installation)", aspect: "landscape", prompt: "Photorealistic image of a Nigerian technician on a small ladder installing a white wall-mounted split air conditioner in a clean bright living room, toolbag on the floor, natural light, no text, no watermark" },
  { id: "gigs-card-deep-cleaning", vertical: "gigs", component: "popular service card (home cleaning)", aspect: "landscape", prompt: "Photorealistic image of a Nigerian professional cleaner in a green uniform actively mopping a bright modern home floor with a cleaning caddy nearby, no text, no watermark" },
  { id: "gigs-card-generator-repair", vertical: "gigs", component: "popular service card (generator repair)", aspect: "landscape", prompt: "Photorealistic image of a Nigerian generator technician servicing an outdoor petrol generator with a toolbox open beside him, realistic Nigerian compound setting, golden light, no text, no watermark" },
  { id: "gigs-card-web-development", vertical: "gigs", component: "popular service card (web development)", aspect: "landscape", prompt: "Photorealistic image of a Nigerian software developer writing code for a website on a laptop at a tidy modern desk, code editor visible on the laptop screen, soft window light, no text overlays, no watermark" },
  { id: "gigs-card-wedding-photography", vertical: "gigs", component: "popular service card (wedding photography)", aspect: "landscape", prompt: "Photorealistic image of a Nigerian wedding photographer with a professional camera photographing a joyful Nigerian couple in traditional aso-ebi wedding attire, soft celebration lighting, no text, no watermark" },
  { id: "gigs-card-interior-painting", vertical: "gigs", component: "popular service card (interior painting)", aspect: "landscape", prompt: "Photorealistic image of a Nigerian painter on a step ladder painting an interior wall white with a roller and drop cloth on the floor, natural window light, no text, no watermark" },
  { id: "gigs-band-post-a-job", vertical: "gigs", component: "Post a Job panel", aspect: "portrait", prompt: "Photorealistic portrait of a smiling young Nigerian woman holding a smartphone, seated in a bright modern space with green plants, premium marketplace campaign quality, no text, no watermark" },
  { id: "gigs-band-become-provider", vertical: "gigs", component: "Become a Provider band", aspect: "landscape", prompt: "Photorealistic image of a proud Nigerian tradesman in a work apron smiling with arms crossed against a deep green studio background, premium campaign photography, no text, no watermark" },
  // --- Spotlight imagery (service-accurate, matches curated spotlight rows) ---
  { id: "gigs-spot-solar", vertical: "gigs", component: "spotlight (solar installation)", aspect: "landscape", prompt: "Photorealistic image of a Nigerian solar technician in a hard hat installing rooftop solar panels on a residential house, bright blue sky, realistic equipment, no text, no watermark" },
  { id: "gigs-spot-wiring", vertical: "gigs", component: "spotlight (electrical wiring)", aspect: "landscape", prompt: "Photorealistic image of a Nigerian electrician wiring a distribution board with colour-coded cables, using insulated screwdrivers, focused work, realistic interior, no text, no watermark" },
  { id: "gigs-spot-video", vertical: "gigs", component: "spotlight (video production)", aspect: "landscape", prompt: "Photorealistic image of a Nigerian videographer operating a professional cinema camera on a gimbal during an indoor production, soft studio lighting, no text, no watermark" },
  { id: "gigs-spot-catering", vertical: "gigs", component: "spotlight (catering)", aspect: "landscape", prompt: "Photorealistic image of a Nigerian caterer in apron arranging jollof rice, grilled chicken and salads on a buffet table for an event, warm appetising lighting, no text, no watermark" }
];

const ASPECT_HINTS = { portrait: "Vertical portrait orientation.", square: "Square 1:1 orientation.", landscape: "Horizontal landscape 3:2 orientation." };

function readRegistry() {
  if (fs.existsSync(REGISTRY_PATH)) return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  return { currency: "USD", model: MODEL, creditsPerImage: CREDITS_PER_IMAGE, usdPerCredit: USD_PER_CREDIT, assets: [] };
}

function statusSummary(registry) {
  const counts = {};
  for (const asset of registry.assets) counts[asset.status] = (counts[asset.status] ?? 0) + 1;
  const spent = registry.assets.reduce((sum, a) => sum + (a.costUsd ?? 0), 0);
  return { total: ASSETS.length, registered: registry.assets.length, counts, spentUsd: Number(spent.toFixed(2)), model: registry.model };
}

async function createTask(asset, apiKey) {
  const create = await fetch(`${API_BASE}/jobs/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, input: { prompt: `${asset.prompt}. ${ASPECT_HINTS[asset.aspect]}`, size: SIZE } })
  });
  const created = await create.json();
  if (created?.code !== 200 || !created?.data?.taskId) {
    throw new Error(`createTask failed: HTTP ${create.status} ${String(created?.msg ?? "").slice(0, 120)}`);
  }
  return created.data.taskId;
}

async function generateAsset(asset, apiKey, existingTaskId) {
  // Reuse a recorded taskId when present so an interrupted run can re-download
  // an already-billed image instead of generating (and paying) again.
  const taskId = existingTaskId ?? (await createTask(asset, apiKey));
  for (let poll = 0; poll < MAX_POLLS; poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const pollRes = await fetch(`${API_BASE}/jobs/recordInfo?taskId=${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const body = await pollRes.json().catch(() => null);
    const data = body?.data;
    if (!data) continue;
    if (data.state === "success") {
      let url = null;
      try {
        url = JSON.parse(data.resultJson)?.resultUrls?.[0] ?? null;
      } catch {
        url = null;
      }
      if (!url) throw new Error("Job succeeded without a result URL");
      return { url, taskId, credits: data.creditsConsumed ?? CREDITS_PER_IMAGE };
    }
    if (data.state === "generating") {
      await new Promise((resolve) => setTimeout(resolve, 0)); // continue polling
    }
    if (data.state === "fail" || data.state === "error") {
      throw new Error(`Kie.ai job failed: ${data.failMsg ?? data.state}`);
    }
  }
  throw new Error("Kie.ai job timed out");
}

(async () => {
  const registry = readRegistry();
  const apiKey = process.env.KIE_API_KEY;

  if (process.argv.includes("--status")) {
    console.log(JSON.stringify(statusSummary(registry), null, 2));
    process.exit(0);
  }

  if (!apiKey) {
    console.error(JSON.stringify({
      blocked: "missing_credentials",
      missingInput: "KIE_API_KEY environment variable (run with: node --env-file=.env scripts/generate-gigs-images.mjs)",
      note: "No images were generated and no costs incurred."
    }, null, 2));
    process.exit(2);
  }

  const byId = new Map(registry.assets.map((asset) => [asset.id, asset]));
  let generated = 0;
  let failures = 0;
  for (const asset of ASSETS) {
    const existing = byId.get(asset.id);
    if (existing?.storagePath && fs.existsSync(path.join(OUT_DIR, existing.storagePath))) {
      continue; // an image already exists for this asset — reuse it, never regenerate
    }
    let entry = existing ?? {
      id: asset.id,
      vertical: asset.vertical,
      component: asset.component,
      prompt: asset.prompt,
      model: MODEL,
      size: SIZE,
      status: "pending",
      history: []
    };
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
      // Persist the taskId before polling so a crash can resume without re-billing.
      entry.taskId = entry.taskId ?? (await createTask(asset, apiKey).catch(() => null));
      const index0 = registry.assets.findIndex((a) => a.id === asset.id);
      if (index0 >= 0) registry.assets[index0] = entry;
      else registry.assets.push(entry);
      fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
      try {
        const { url, taskId, credits } = await generateAsset(asset, apiKey, entry.taskId);
        entry.taskId = taskId;
        const dir = path.join(OUT_DIR, asset.vertical);
        fs.mkdirSync(dir, { recursive: true });
        const storagePath = path.join("generated", asset.vertical, `${asset.id}.png`);
        const binary = Buffer.from(await (await fetch(url)).arrayBuffer());
        fs.writeFileSync(path.join(OUT_DIR, asset.vertical, `${asset.id}.png`), binary);
        entry = {
          ...entry,
          status: "generated",
          storagePath,
          resultUrl: url,
          generatedAt: new Date().toISOString(),
          creditsConsumed: credits,
          costUsd: Number((credits * USD_PER_CREDIT).toFixed(2)),
          qualityReview: "pending-owner-review",
          usageReferences: [`components/gigs/landing.tsx (${asset.component})`]
        };
        generated += 1;
        console.log(`generated ${asset.id} (credits ${credits})`);
        break;
      } catch (error) {
        entry.history = [...(entry.history ?? []).slice(-4), { at: new Date().toISOString(), attempt, error: String(error).slice(0, 200) }];
        if (attempt > MAX_RETRIES || entry.taskId) {
          // A billed task exists for this asset: do not create another one.
          entry.status = "failed";
          failures += 1;
          console.error(`FAILED ${asset.id}: ${error}`);
          break;
        }
      }
    }
    const index = registry.assets.findIndex((a) => a.id === asset.id);
    if (index >= 0) registry.assets[index] = entry;
    else registry.assets.push(entry);
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  }
  console.log(JSON.stringify({ generated, failures, summary: statusSummary(registry) }, null, 2));
})();
