/**
 * Kie.ai taxonomy batch 3 product photographs.
 *
 * Generates exactly six original 1K square images, one per approved batch-3
 * DEMO product. They are submitted in bounded groups (A/B, three each) so every
 * image can be inspected on a contact sheet before the next group is
 * submitted. No task is ever re-submitted automatically.
 *
 * What this script owns:
 *  - public/generated/taxonomy/<assetId>.webp   (six new, published WebP files)
 *  - docs/taxonomy/generation-ledger.json       (appended batch-3 entries only)
 *  - qa-artifacts/taxonomy-batch3/              (gitignored PNG originals,
 *    contact sheets, review manifest and retired attempts)
 *
 * It never touches app code, taxonomy seed/activation files, the database,
 * products or any pre-existing asset. Publication is a separate mode in
 * scripts/taxonomy-batch3-products.cjs (`--preflight`, `--publish`).
 *
 * Model verification (host UTC 2026-11-14):
 *  - docs https://docs.kie.ai/market/gpt/gpt-image-2-5-flare-text-to-image
 *    lists model id gpt-image-2-5-flare-text-to-image, resolution 1K with
 *    aspect_ratio 1:1, output delivered as image URLs via resultJson.
 *  - a prior task queried through /jobs/recordInfo returned state=success,
 *    creditsConsumed=6 and model=gpt-image-2-5-flare-text-to-image.
 *  - the page publishes no per-image price, so the ledger records the actual
 *    creditsConsumed per job and the account balance before/after instead of
 *    asserting a rate card.
 *
 * Usage:
 *   node --env-file=.env scripts/generate-taxonomy-batch3-images.mjs --plan
 *   node --env-file=.env scripts/generate-taxonomy-batch3-images.mjs --group=a
 *   node --env-file=.env scripts/generate-taxonomy-batch3-images.mjs --group=b
 *   node --env-file=.env scripts/generate-taxonomy-batch3-images.mjs --only=yoga-mat-set
 *   node --env-file=.env scripts/generate-taxonomy-batch3-images.mjs --group=a --contact-sheet
 *   node --env-file=.env scripts/generate-taxonomy-batch3-images.mjs --reviewed=<ids> --note="what the inspection found"
 *   node --env-file=.env scripts/generate-taxonomy-batch3-images.mjs --retry=<id> --reason="why"
 *
 * Safe retry rules:
 *  - a task that is still processing is polled, never re-submitted;
 *  - a retry needs an explicit id and reason, normally only after inspecting
 *    the contact sheet at full resolution;
 *  - a createTask transport error is recorded as submit_uncertain and is not
 *    retried automatically (reconcile the provider task list first).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import batch3 from "./taxonomy-batch3-products.cjs";

const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = "gpt-image-2-5-flare-text-to-image";
const MODEL_DOCS_URL = "https://docs.kie.ai/market/gpt/gpt-image-2-5-flare-text-to-image";
const SIZE = "1K";
const ASPECT_RATIO = "1:1";
const BATCH = "taxonomy-batch3";
const OUT_DIR = path.join(process.cwd(), "public", "generated", "taxonomy");
const QA_DIR = path.join(process.cwd(), "qa-artifacts", "taxonomy-batch3");
const ORIGINALS_DIR = path.join(QA_DIR, "originals");
const RETIRED_DIR = path.join(QA_DIR, "retired");
const LEDGER = path.join(process.cwd(), "docs", "taxonomy", "generation-ledger.json");
const PRICE_NOTE = {
  creditsPerImageObserved: 6,
  modelDocsUrl: MODEL_DOCS_URL,
  docsCheckedAt: "2026-11-14",
  note: "The model docs page publishes no per-image price. Actual creditsConsumed is read from every job and the account balance is read before and after; no credits are purchased."
};
const MODEL_RATIONALE =
  "Supported 1K 1:1 text-to-image catalogue photography; identical to the approved batch-1/2 product model so crop, review and publication workflow stay comparable, and the observed 6-credit debit matches the earlier approved batches.";

const STYLE =
  "Photorealistic catalogue product photograph, warm neutral studio background, soft natural daylight, centered square composition with generous margin, accurate materials, colours and textures, premium African marketplace quality, no text, no letters, no numbers, no logos, no brand names, no watermark, no people, no hands";

const ASSETS = batch3.PRODUCTS;
const GROUPS = { a: ASSETS.slice(0, 3), b: ASSETS.slice(3) };

function fail(message) {
  console.error(`BLOCKED: ${message}`);
  process.exit(2);
}

function readLedger() {
  if (!fs.existsSync(LEDGER)) {
    return { model: MODEL, size: SIZE, assets: [], creditBatches: {} };
  }
  return JSON.parse(fs.readFileSync(LEDGER, "utf8"));
}

function writeLedger(ledger) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  ledger.assets = ledger.assets ?? [];
  const batchEntries = ledger.assets.filter((entry) => entry.batch === BATCH);
  const newCredits = batchEntries.reduce((sum, entry) => sum + (entry.credits ?? 0), 0);
  const totalCredits = ledger.assets.reduce((sum, entry) => sum + (entry.credits ?? 0), 0);
  const generated = batchEntries.filter((entry) => entry.status === "generated" && entry.webpPath);
  ledger.model = ledger.model ?? MODEL;
  ledger.size = ledger.size ?? SIZE;
  // Prior batches are preserved exactly; batch 3 is the only new spend.
  ledger.priorCredits = totalCredits - newCredits;
  ledger.newCredits = newCredits;
  ledger.cumulativeCredits = totalCredits;
  ledger.creditBatches = ledger.creditBatches ?? {};
  const previous = ledger.creditBatches[BATCH] ?? {};
  const balanceBefore = previous.balanceBefore ?? null;
  const balanceAfter = previous.balanceAfter ?? null;
  ledger.creditBatches[BATCH] = {
    ...previous,
    images: generated.length,
    credits: newCredits,
    model: MODEL,
    modelDocsUrl: MODEL_DOCS_URL,
    modelRationale: MODEL_RATIONALE,
    size: SIZE,
    aspectRatio: ASPECT_RATIO,
    price: PRICE_NOTE,
    status: generated.length === ASSETS.length ? "complete" : "in_progress",
    firstSubmittedAt: previous.firstSubmittedAt ?? null,
    completedAt: previous.completedAt ?? null,
    balanceBefore,
    balanceAfter,
    invoice: {
      images: generated.length,
      creditsConsumedSum: newCredits,
      balanceBefore,
      balanceAfter,
      balanceDebit:
        typeof balanceBefore === "number" && typeof balanceAfter === "number"
          ? Number((balanceBefore - balanceAfter).toFixed(2))
          : null,
      note: "The billable batch figure is creditsConsumedSum. balanceDebit is informational and may include unrelated concurrent Kie work."
    }
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
      return { status: "success", url, credits: data.creditsConsumed ?? null, jobModel: data.model ?? null };
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

async function downloadAndOptimise(asset, url, taskId) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`image download failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
  const pngPath = path.join(ORIGINALS_DIR, `${asset.assetId}-${taskId}.png`);
  fs.writeFileSync(pngPath, buffer);

  const source = await sharp(buffer).metadata();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const webpPath = path.join(OUT_DIR, `${asset.assetId}.webp`);
  await sharp(buffer)
    .resize(1024, 1024, { fit: "cover", withoutEnlargement: true })
    .webp({ quality: 86, effort: 5 })
    .toFile(webpPath);
  const output = await sharp(webpPath).metadata();
  return {
    pngOriginalPath: path.relative(process.cwd(), pngPath).replaceAll("\\", "/"),
    webpPath: `/generated/taxonomy/${asset.assetId}.webp`,
    sourceWidth: source.width ?? null,
    sourceHeight: source.height ?? null,
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
  const retiredPath = path.join(RETIRED_DIR, `${asset.assetId}-${entry.taskId ?? "unknown"}.webp`);
  fs.copyFileSync(current, retiredPath);
  return path.relative(process.cwd(), retiredPath).replaceAll("\\", "/");
}

function assertOwnedTargets(ledger, selected) {
  for (const asset of selected) {
    const target = path.join(OUT_DIR, `${asset.assetId}.webp`);
    const owned = ledger.assets.some((entry) => entry.id === asset.assetId && entry.batch === BATCH);
    if (fs.existsSync(target) && !owned) {
      fail(`refusing to overwrite existing unowned asset public/generated/taxonomy/${asset.assetId}.webp`);
    }
  }
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
      batch: BATCH,
      leafKey: asset.leafKey,
      kind: "product-photograph",
      prompt: asset.prompt,
      model: MODEL,
      modelDocsUrl: MODEL_DOCS_URL,
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
    entry.pngOriginalPath = null;
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
    ledger.creditBatches[BATCH] = ledger.creditBatches[BATCH] ?? {};
    ledger.creditBatches[BATCH].firstSubmittedAt ??= entry.submittedAt;
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

  const files = await downloadAndOptimise(asset, result.url, entry.taskId);
  Object.assign(entry, files, {
    status: "generated",
    credits: result.credits,
    jobModel: result.jobModel,
    alt: asset.alt,
    generatedAt: new Date().toISOString(),
    review: "pending full-resolution and contact-sheet inspection",
    lastError: null
  });
  ledger.creditBatches[BATCH] = ledger.creditBatches[BATCH] ?? {};
  ledger.creditBatches[BATCH].balanceAfter = await readCredits(apiKey).catch(() => null);
  writeLedger(ledger);
  console.log(
    JSON.stringify({
      id: asset.assetId,
      taskId: entry.taskId,
      credits: entry.credits,
      webpPath: entry.webpPath,
      source: `${entry.sourceWidth}x${entry.sourceHeight}`,
      output: `${entry.width}x${entry.height}`,
      kb: Math.round(entry.webpBytes / 1024)
    })
  );
}

function writeReviewManifest(entries) {
  fs.mkdirSync(QA_DIR, { recursive: true });
  const manifest = {
    batch: BATCH,
    generatedAt: new Date().toISOString(),
    model: MODEL,
    modelDocsUrl: MODEL_DOCS_URL,
    size: SIZE,
    aspectRatio: ASPECT_RATIO,
    reviewCriteria: [
      "subject matches the intended product and listing attributes",
      "no text, letters, numbers, logos, brand names or watermarks",
      "no people or hands",
      "plausible materials, colours and construction",
      "safe square crop with the subject fully inside the frame"
    ],
    assets: entries.map((entry) => ({
      id: entry.id,
      leafKey: entry.leafKey ?? null,
      alt: entry.alt ?? null,
      taskId: entry.taskId ?? null,
      credits: entry.credits ?? null,
      webpPath: entry.webpPath ?? null,
      source: entry.sourceWidth ? `${entry.sourceWidth}x${entry.sourceHeight}` : null,
      output: entry.width ? `${entry.width}x${entry.height}` : null,
      review: entry.review ?? null,
      reviewedAt: entry.reviewedAt ?? null
    }))
  };
  const output = path.join(QA_DIR, "review-manifest.json");
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  return path.relative(process.cwd(), output).replaceAll("\\", "/");
}

async function buildContactSheet(entries, label) {
  const available = entries.filter(
    (entry) => entry.webpPath && fs.existsSync(path.join(process.cwd(), "public", entry.webpPath.replace(/^\//, "")))
  );
  if (available.length === 0) throw new Error("no generated batch-3 images available for contact sheet");
  const tile = 400;
  const labelHeight = 52;
  const columns = 3;
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
    const caption = `${entry.id} · ${entry.credits ?? "?"} cr · ${entry.width ?? "?"}x${entry.height ?? "?"}`;
    const svg = Buffer.from(
      `<svg width="${tile}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f5f1e8"/><text x="12" y="24" font-family="Arial, sans-serif" font-size="15" fill="#14241b">${caption.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</text><text x="12" y="44" font-family="Arial, sans-serif" font-size="13" fill="#4a5a50">${String(entry.leafKey ?? "")}</text></svg>`
    );
    composites.push({ input: svg, left, top: top + tile });
  }
  fs.mkdirSync(QA_DIR, { recursive: true });
  const output = path.join(QA_DIR, `contact-sheet-${label}.png`);
  await sharp({ create: { width, height, channels: 3, background: "#f5f1e8" } })
    .composite(composites)
    .png()
    .toFile(output);
  const manifest = writeReviewManifest(entries.filter((entry) => entry.batch === BATCH));
  console.log(
    JSON.stringify({
      contactSheet: path.relative(process.cwd(), output).replaceAll("\\", "/"),
      reviewManifest: manifest,
      images: available.map((entry) => entry.id)
    })
  );
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
  const options = { retryIds, reason: reasonArg ? reasonArg.slice("--reason=".length) : "" };

  let selected = ASSETS;
  if (groupArg) {
    const group = groupArg.slice("--group=".length).toLowerCase();
    if (!GROUPS[group]) throw new Error("--group must be a or b");
    selected = GROUPS[group];
  }
  if (onlyArg) {
    const only = new Set(onlyArg.slice("--only=".length).split(",").map((value) => value.trim()));
    selected = selected.filter((asset) => only.has(asset.assetId));
    if (selected.length === 0) throw new Error("--only matched no batch-3 asset id");
  }

  assertOwnedTargets(ledger, selected);

  if (process.argv.includes("--contact-sheet")) {
    const label = groupArg ? groupArg.slice("--group=".length).toLowerCase() : "all";
    const batchEntries = ledger.assets.filter((entry) => entry.batch === BATCH);
    const groupEntries = groupArg
      ? batchEntries.filter((entry) => GROUPS[label].some((asset) => asset.assetId === entry.id))
      : batchEntries;
    await buildContactSheet(groupEntries, label);
    return;
  }

  const reviewedArg = process.argv.find((argument) => argument.startsWith("--reviewed="));
  if (reviewedArg) {
    const noteArg = process.argv.find((argument) => argument.startsWith("--note="));
    const note = noteArg ? noteArg.slice("--note=".length).trim() : "";
    if (!note) fail('--reviewed requires --note="what the inspection found"');
    const ids = reviewedArg
      .slice("--reviewed=".length)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const reviewedAt = new Date().toISOString();
    for (const id of ids) {
      const entry = ledger.assets.find((candidate) => candidate.id === id && candidate.batch === BATCH);
      if (!entry || entry.status !== "generated") fail(`${id} has no generated batch-3 image to review`);
      entry.review = `visually inspected ${reviewedAt}: ${note}`;
      entry.reviewedAt = reviewedAt;
    }
    writeLedger(ledger);
    const manifest = writeReviewManifest(ledger.assets.filter((entry) => entry.batch === BATCH));
    console.log(JSON.stringify({ reviewed: ids, reviewedAt, note, reviewManifest: manifest }));
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
          modelDocsUrl: MODEL_DOCS_URL,
          size: SIZE,
          aspectRatio: ASPECT_RATIO,
          group: groupArg ? groupArg.slice("--group=".length) : "all",
          count: pending.length,
          expectedCredits: pending.length * PRICE_NOTE.creditsPerImageObserved,
          price: PRICE_NOTE,
          pending: pending.map((asset) => asset.assetId),
          note: "actual creditsConsumed is read from each job; the account balance is read before and after; no purchase"
        },
        null,
        2
      )
    );
    return;
  }

  if (!apiKey) fail("KIE_API_KEY missing");

  const balanceBefore = await readCredits(apiKey);
  ledger.creditBatches = ledger.creditBatches ?? {};
  ledger.creditBatches[BATCH] = ledger.creditBatches[BATCH] ?? {};
  ledger.creditBatches[BATCH].balanceBefore ??= balanceBefore;
  ledger.creditBatches[BATCH].balanceAfter = balanceBefore;
  ledger.creditBatches[BATCH].price = PRICE_NOTE;
  writeLedger(ledger);
  console.log(JSON.stringify({ creditsBefore: balanceBefore, selected: selected.map((asset) => asset.assetId) }));

  for (const asset of selected) {
    await generateAsset(asset, ledger, apiKey, options);
  }

  ledger.creditBatches[BATCH].balanceAfter = await readCredits(apiKey).catch(() => null);
  const generated = ledger.assets.filter((entry) => entry.batch === BATCH && entry.status === "generated");
  if (generated.length === ASSETS.length) {
    ledger.creditBatches[BATCH].completedAt = new Date().toISOString();
  }
  writeLedger(ledger);
  const manifest = writeReviewManifest(ledger.assets.filter((entry) => entry.batch === BATCH));
  console.log(
    JSON.stringify(
      {
        newCredits: ledger.newCredits,
        priorCredits: ledger.priorCredits,
        cumulativeCredits: ledger.cumulativeCredits,
        balanceBefore,
        balanceAfter: ledger.creditBatches[BATCH].balanceAfter,
        reviewManifest: manifest,
        generated: generated.map((entry) => ({ id: entry.id, taskId: entry.taskId, credits: entry.credits, webpPath: entry.webpPath }))
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error("BATCH3 GENERATION ERROR", error.message);
  process.exit(1);
});
