/**
 * Kie.ai taxonomy batch 2 images.
 *
 * Generates one original 1K square image per approved batch-2 DEMO product.
 * Runs in bounded groups (A/B) so every image can be inspected before the next
 * group. The ledger records the exact model, settings, task id, credits read
 * back from the job, local paths and review state. Prior batch-1 credits (48)
 * are kept in a separate creditBatches entry.
 *
 * Usage:
 *   node --env-file=.env scripts/generate-taxonomy-batch2-images.mjs --plan
 *   node --env-file=.env scripts/generate-taxonomy-batch2-images.mjs --group=a
 *   node --env-file=.env scripts/generate-taxonomy-batch2-images.mjs --group=b
 *   node --env-file=.env scripts/generate-taxonomy-batch2-images.mjs --only=garri
 *   node --env-file=.env scripts/generate-taxonomy-batch2-images.mjs --group=a --contact-sheet
 *   node --env-file=.env scripts/generate-taxonomy-batch2-images.mjs --retry=garri --reason="subject mismatch"
 *
 * Safe retry rules: a task that is still processing is polled, never
 * re-submitted. A retry requires an explicit id and reason (normally only after
 * contact-sheet inspection). A createTask network error is recorded as
 * submit_uncertain and is not retried automatically.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import batch2 from "./taxonomy-batch2-products.cjs";

const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = "gpt-image-2-5-flare-text-to-image";
const SIZE = "1K";
const ASPECT_RATIO = "1:1";
const OUT_DIR = path.join(process.cwd(), "public", "generated", "taxonomy");
const QA_DIR = path.join(process.cwd(), "qa-artifacts", "taxonomy-batch2");
const RETIRED_DIR = path.join(QA_DIR, "retired");
const LEDGER = path.join(process.cwd(), "docs", "taxonomy", "generation-ledger.json");
const STYLE =
  "Photorealistic catalogue product photograph, warm neutral studio background, soft natural light, centered square composition, accurate materials and colours, premium African marketplace quality, no text, no watermark, no logo, no hands";
const ASSETS = batch2.PRODUCTS;
const GROUPS = { a: ASSETS.slice(0, 4), b: ASSETS.slice(4) };

function readLedger() {
  if (!fs.existsSync(LEDGER)) {
    return { model: MODEL, size: SIZE, assets: [], priorCredits: 0, newCredits: 0, cumulativeCredits: 0, creditBatches: {} };
  }
  return JSON.parse(fs.readFileSync(LEDGER, "utf8"));
}

function writeLedger(ledger) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  ledger.assets = ledger.assets ?? [];
  ledger.priorCredits = 48;
  ledger.newCredits = ledger.assets
    .filter((entry) => entry.batch === "taxonomy-batch2")
    .reduce((sum, entry) => sum + (entry.credits ?? 0), 0);
  ledger.cumulativeCredits = ledger.assets.reduce((sum, entry) => sum + (entry.credits ?? 0), 0);
  ledger.creditBatches = ledger.creditBatches ?? {};
  ledger.creditBatches["taxonomy-batch1"] = {
    images: 8,
    credits: 48,
    note: "prior batch, preserved; not re-counted as new spend"
  };
  ledger.creditBatches["taxonomy-batch2"] = {
    images: ledger.assets.filter((entry) => entry.batch === "taxonomy-batch2" && entry.status === "generated").length,
    credits: ledger.newCredits,
    model: MODEL,
    size: SIZE,
    aspectRatio: ASPECT_RATIO,
    balanceBefore: ledger.creditBatches["taxonomy-batch2"]?.balanceBefore ?? null,
    balanceAfter: ledger.creditBatches["taxonomy-batch2"]?.balanceAfter ?? null,
    firstSubmittedAt: ledger.creditBatches["taxonomy-batch2"]?.firstSubmittedAt ?? null,
    completedAt: ledger.creditBatches["taxonomy-batch2"]?.completedAt ?? null
  };
  fs.writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
}

async function readCredits(apiKey) {
  const response = await fetch(`${API_BASE}/chat/credit`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30000)
  });
  const body = await response.json();
  if (body?.code !== 200 || typeof body?.data !== "number") {
    throw new Error(`credit read-back failed: HTTP ${response.status} code=${body?.code} ${String(body?.msg ?? "").slice(0, 120)}`);
  }
  return body.data;
}

async function createTask(asset, apiKey) {
  let response;
  try {
    response = await fetch(`${API_BASE}/jobs/createTask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        input: {
          prompt: `${asset.prompt}. ${STYLE}.`,
          resolution: SIZE,
          aspect_ratio: ASPECT_RATIO
        }
      }),
      signal: AbortSignal.timeout(60000)
    });
  } catch (error) {
    throw new Error(`createTask transport error (do not auto-retry): ${error.message}`);
  }
  const body = await response.json().catch(() => null);
  if (body?.code !== 200 || !body?.data?.taskId) {
    throw new Error(`createTask failed: HTTP ${response.status} code=${body?.code} ${String(body?.msg ?? "").slice(0, 160)}`);
  }
  return body.data.taskId;
}

async function pollTask(taskId, apiKey) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 15000));
    const response = await fetch(`${API_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(30000)
    });
    const body = await response.json().catch(() => null);
    const data = body?.data;
    if (!data) continue;
    if (data.state === "success") {
      let url = null;
      try {
        url = JSON.parse(data.resultJson ?? "{}")?.resultUrls?.[0] ?? null;
      } catch {
        url = null;
      }
      if (!url) throw new Error("task succeeded without a result URL");
      return { status: "success", url, credits: data.creditsConsumed ?? null };
    }
    if (data.state === "fail" || data.state === "error") {
      return {
        status: "failed",
        credits: data.creditsConsumed ?? 0,
        failMsg: String(data.failMsg ?? data.state).slice(0, 300)
      };
    }
  }
  return { status: "timeout" };
}

async function downloadAndOptimise(asset, url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`image download failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const pngPath = path.join(OUT_DIR, `${asset.assetId}.png`);
  const webpPath = path.join(OUT_DIR, `${asset.assetId}.webp`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(pngPath, buffer);
  const metadata = await sharp(buffer).metadata();
  await sharp(buffer).resize(1024, 1024, { fit: "cover" }).webp({ quality: 86 }).toFile(webpPath);
  const output = await sharp(webpPath).metadata();
  return {
    pngPath: `/generated/taxonomy/${asset.assetId}.png`,
    webpPath: `/generated/taxonomy/${asset.assetId}.webp`,
    sourceWidth: metadata.width ?? null,
    sourceHeight: metadata.height ?? null,
    width: output.width ?? null,
    height: output.height ?? null,
    webpBytes: fs.statSync(webpPath).size
  };
}

function retireAttempt(entry, asset) {
  if (!entry?.webpPath) return null;
  fs.mkdirSync(RETIRED_DIR, { recursive: true });
  const current = path.join(process.cwd(), "public", entry.webpPath.replace(/^\//, ""));
  if (!fs.existsSync(current)) return null;
  const retiredName = `${asset.assetId}-${entry.taskId ?? "unknown"}.webp`;
  const retiredPath = path.join(RETIRED_DIR, retiredName);
  fs.copyFileSync(current, retiredPath);
  return path.relative(process.cwd(), retiredPath).replaceAll("\\", "/");
}

async function generateAsset(asset, ledger, apiKey, options) {
  let entry = ledger.assets.find((candidate) => candidate.id === asset.assetId);
  const webpOnDisk = entry?.webpPath
    ? fs.existsSync(path.join(process.cwd(), "public", entry.webpPath.replace(/^\//, "")))
    : false;

  if (entry?.status === "generated" && webpOnDisk && !options.retryIds.has(asset.assetId)) {
    console.log(JSON.stringify({ id: asset.assetId, skipped: "already generated", credits: entry.credits }));
    return;
  }

  if (!entry) {
    entry = {
      id: asset.assetId,
      leafKey: asset.leafKey,
      batch: "taxonomy-batch2",
      prompt: asset.prompt,
      model: MODEL,
      size: SIZE,
      aspectRatio: ASPECT_RATIO,
      status: "pending",
      taskId: null,
      credits: null,
      attempts: []
    };
    ledger.assets.push(entry);
  }

  if (options.retryIds.has(asset.assetId)) {
    if (!options.reason) throw new Error(`--retry=${asset.assetId} requires --reason="why"`);
    const retired = retireAttempt(entry, asset);
    entry.attempts = [
      ...(entry.attempts ?? []),
      {
        taskId: entry.taskId ?? null,
        status: entry.status ?? null,
        credits: entry.credits ?? null,
        generatedAt: entry.generatedAt ?? null,
        review: entry.review ?? null,
        retiredWebpPath: retired
      }
    ];
    entry.status = "retry_pending";
    entry.taskId = null;
    entry.credits = null;
    entry.generatedAt = null;
    entry.review = `retry requested ${new Date().toISOString()}: ${options.reason}`;
    entry.pngPath = null;
    entry.webpPath = null;
    writeLedger(ledger);
  }

  if (!entry.taskId && ["submit_uncertain", "submitting"].includes(entry.status) && !options.retryIds.has(asset.assetId)) {
    throw new Error(
      `${asset.assetId}: previous createTask outcome is uncertain; reconcile the provider task list and use --retry=${asset.assetId} --reason="..." only after confirming no task was created`
    );
  }

  if (!entry.taskId) {
    entry.status = "submitting";
    entry.submitIntentAt = new Date().toISOString();
    writeLedger(ledger);
    try {
      entry.taskId = await createTask(asset, apiKey);
    } catch (error) {
      entry.status = "submit_uncertain";
      entry.lastError = error.message;
      writeLedger(ledger);
      throw error;
    }
    entry.status = "submitted";
    entry.submittedAt = new Date().toISOString();
    ledger.creditBatches["taxonomy-batch2"].firstSubmittedAt ??= entry.submittedAt;
    writeLedger(ledger);
    console.log(JSON.stringify({ id: asset.assetId, submitted: true, taskId: entry.taskId }));
  } else {
    console.log(JSON.stringify({ id: asset.assetId, resumed: true, taskId: entry.taskId, status: entry.status }));
  }

  const result = await pollTask(entry.taskId, apiKey);
  if (result.status === "timeout") {
    entry.status = "timeout";
    entry.lastPolledAt = new Date().toISOString();
    entry.lastError = "still processing after 10 minutes; task id retained";
    writeLedger(ledger);
    console.error(JSON.stringify({ id: asset.assetId, timeout: true, taskId: entry.taskId }));
    return;
  }
  if (result.status === "failed") {
    entry.status = "failed";
    entry.credits = result.credits ?? 0;
    entry.lastError = result.failMsg;
    writeLedger(ledger);
    console.error(JSON.stringify({ id: asset.assetId, failed: true, taskId: entry.taskId, failMsg: result.failMsg }));
    return;
  }

  const files = await downloadAndOptimise(asset, result.url);
  Object.assign(entry, files, {
    status: "generated",
    credits: result.credits,
    alt: asset.alt,
    generatedAt: new Date().toISOString(),
    review: "pending visual inspection",
    lastError: null
  });
  ledger.creditBatches["taxonomy-batch2"].balanceAfter = await readCredits(apiKey).catch(() => null);
  writeLedger(ledger);
  console.log(JSON.stringify({ id: asset.assetId, credits: entry.credits, webpPath: entry.webpPath, width: entry.width, height: entry.height }));
}

async function buildContactSheet(entries, label) {
  const available = entries.filter(
    (entry) => entry.webpPath && fs.existsSync(path.join(process.cwd(), "public", entry.webpPath.replace(/^\//, "")))
  );
  if (available.length === 0) throw new Error("no generated images available for contact sheet");
  const tile = 360;
  const labelHeight = 42;
  const columns = 4;
  const rows = Math.ceil(available.length / columns);
  const width = columns * tile;
  const height = rows * (tile + labelHeight);
  const composites = [];
  for (let index = 0; index < available.length; index += 1) {
    const entry = available[index];
    const left = (index % columns) * tile;
    const top = Math.floor(index / columns) * (tile + labelHeight);
    const image = await sharp(path.join(process.cwd(), "public", entry.webpPath.replace(/^\//, "")))
      .resize(tile, tile, { fit: "cover" })
      .toBuffer();
    composites.push({ input: image, left, top });
    const caption = `${entry.id} · ${entry.credits ?? "?"} credits`;
    const svg = Buffer.from(
      `<svg width="${tile}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f5f1e8"/><text x="10" y="27" font-family="Arial, sans-serif" font-size="16" fill="#14241b">${caption.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</text></svg>`
    );
    composites.push({ input: svg, left, top: top + tile });
  }
  fs.mkdirSync(QA_DIR, { recursive: true });
  const output = path.join(QA_DIR, `contact-sheet-${label}.png`);
  await sharp({ create: { width, height, channels: 3, background: "#f5f1e8" } })
    .composite(composites)
    .png()
    .toFile(output);
  console.log(JSON.stringify({ contactSheet: path.relative(process.cwd(), output).replaceAll("\\", "/"), images: available.map((entry) => entry.id) }));
}

(async () => {
  const ledger = readLedger();
  const apiKey = process.env.KIE_API_KEY;
  const onlyArg = process.argv.find((argument) => argument.startsWith("--only="));
  const groupArg = process.argv.find((argument) => argument.startsWith("--group="));
  const retryArg = process.argv.find((argument) => argument.startsWith("--retry="));
  const reasonArg = process.argv.find((argument) => argument.startsWith("--reason="));
  const retryIds = new Set(
    retryArg
      ? retryArg
          .slice("--retry=".length)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : []
  );
  const reason = reasonArg ? reasonArg.slice("--reason=".length) : "";
  const options = { retryIds, reason };

  let selected = ASSETS;
  if (groupArg) {
    const group = groupArg.slice("--group=".length).toLowerCase();
    if (!GROUPS[group]) throw new Error("--group must be a or b");
    selected = GROUPS[group];
  }
  if (onlyArg) {
    const only = new Set(onlyArg.slice("--only=".length).split(",").map((value) => value.trim()));
    selected = selected.filter((asset) => only.has(asset.assetId));
  }
  if (process.argv.includes("--contact-sheet")) {
    const label = groupArg ? groupArg.slice("--group=".length).toLowerCase() : "all";
    await buildContactSheet(ledger.assets.filter((entry) => entry.batch === "taxonomy-batch2"), label);
    return;
  }
  if (process.argv.includes("--plan")) {
    const pending = selected.filter((asset) => {
      const entry = ledger.assets.find((candidate) => candidate.id === asset.assetId);
      const exists = entry?.webpPath
        ? fs.existsSync(path.join(process.cwd(), "public", entry.webpPath.replace(/^\//, "")))
        : false;
      return !(entry?.status === "generated" && exists);
    });
    console.log(
      JSON.stringify(
        {
          model: MODEL,
          size: SIZE,
          aspectRatio: ASPECT_RATIO,
          group: groupArg ? groupArg.slice("--group=".length) : "all",
          count: pending.length,
          expectedCredits: pending.length * 6,
          note: "price verified in the Kie MCP plan: 6 credits / $0.03 per 1K image; credits read back from each job",
          pending: pending.map((asset) => asset.assetId)
        },
        null,
        2
      )
    );
    return;
  }
  if (!apiKey) {
    console.error("blocked: KIE_API_KEY missing");
    process.exit(2);
  }

  const balanceBefore = await readCredits(apiKey);
  ledger.creditBatches = ledger.creditBatches ?? {};
  ledger.creditBatches["taxonomy-batch2"] = ledger.creditBatches["taxonomy-batch2"] ?? {};
  ledger.creditBatches["taxonomy-batch2"].balanceBefore ??= balanceBefore;
  ledger.creditBatches["taxonomy-batch2"].balanceAfter = balanceBefore;
  writeLedger(ledger);
  console.log(JSON.stringify({ creditsBefore: balanceBefore, selected: selected.map((asset) => asset.assetId) }));

  for (const asset of selected) {
    await generateAsset(asset, ledger, apiKey, options);
  }

  ledger.creditBatches["taxonomy-batch2"].balanceAfter = await readCredits(apiKey).catch(() => null);
  if (ledger.assets.filter((entry) => entry.batch === "taxonomy-batch2" && entry.status === "generated").length === ASSETS.length) {
    ledger.creditBatches["taxonomy-batch2"].completedAt = new Date().toISOString();
  }
  writeLedger(ledger);
  console.log(
    JSON.stringify(
      {
        newCredits: ledger.newCredits,
        priorCredits: ledger.priorCredits,
        cumulativeCredits: ledger.cumulativeCredits,
        balanceAfter: ledger.creditBatches["taxonomy-batch2"].balanceAfter,
        generated: ledger.assets.filter((entry) => entry.batch === "taxonomy-batch2" && entry.status === "generated").map((entry) => entry.id)
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error("BATCH2 GENERATION ERROR", error.message);
  process.exit(1);
});
