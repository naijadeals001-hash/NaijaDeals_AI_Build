/**
 * Kie.ai taxonomy DEPARTMENT banner images.
 *
 * Generates one original wide (16:9, 1K) banner photograph for each approved
 * department whose Category.imageUrl is still NULL. The six departments are
 * generated in bounded groups (A/B) so every image is inspected on a contact
 * sheet before the next group is submitted.
 *
 * What this script owns:
 *  - public/generated/taxonomy/department-<key>.webp  (published WebP derivative)
 *  - docs/taxonomy/generation-ledger.json              (appended entries only)
 *  - qa-artifacts/taxonomy-departments/                (gitignored PNG originals,
 *    contact sheets and retired attempts)
 *
 * It never touches app code, taxonomy seed data, the database or products.
 * Applying the resulting imageUrl/imageAlt to Category rows is a separate,
 * guarded script: scripts/apply-department-images.ts.
 *
 * Usage:
 *   node --env-file=.env scripts/generate-taxonomy-department-images.mjs --plan
 *   node --env-file=.env scripts/generate-taxonomy-department-images.mjs --group=a
 *   node --env-file=.env scripts/generate-taxonomy-department-images.mjs --group=b
 *   node --env-file=.env scripts/generate-taxonomy-department-images.mjs --only=department-health-wellness
 *   node --env-file=.env scripts/generate-taxonomy-department-images.mjs --group=a --contact-sheet
 *   node --env-file=.env scripts/generate-taxonomy-department-images.mjs --retry=department-books-stationery --reason="subject mismatch"
 *   node --env-file=.env scripts/generate-taxonomy-department-images.mjs --reviewed=department-health-wellness --note="contact-sheet-a.png: accurate"
 *
 * Safe retry rules (same as the approved product batches):
 *  - a task that is still processing is polled, never re-submitted;
 *  - a retry needs an explicit id and reason, normally only after inspecting
 *    the contact sheet;
 *  - a createTask transport error is recorded as submit_uncertain and is not
 *    retried automatically (reconcile the provider task list first).
 *
 * Model, parameters and price were verified in the current Kie catalogue on
 * 2026-11-13 (MCP prepare_media_generation, exact quote): model
 * gpt-image-2-5-flare-text-to-image, resolution 1K, aspect_ratio 16:9,
 * 6 credits / USD 0.03 per image (kie.ai/pricing, rate card verified 2026-10-27).
 * Credits are read back from every job and from /chat/credit before and after.
 * No credits are purchased and no other provider is called.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = "gpt-image-2-5-flare-text-to-image";
const SIZE = "1K";
const ASPECT_RATIO = "16:9";
const BATCH = "taxonomy-departments";
const OUT_DIR = path.join(process.cwd(), "public", "generated", "taxonomy");
const QA_DIR = path.join(process.cwd(), "qa-artifacts", "taxonomy-departments");
const ORIGINALS_DIR = path.join(QA_DIR, "originals");
const RETIRED_DIR = path.join(QA_DIR, "retired");
const LEDGER = path.join(process.cwd(), "docs", "taxonomy", "generation-ledger.json");
/** Batches 1 + 2 are preserved exactly and never re-counted as new spend. */
const PRIOR_CREDITS = 96;
const PRICE = {
  creditsPerImage: 6,
  usdPerImage: 0.03,
  usdPerCredit: 0.005,
  sourceUrl: "https://kie.ai/pricing",
  rateCardVerifiedAt: "2026-10-27",
  quotedVia: "Kie.ai MCP prepare_media_generation (exact quote, 2026-11-13)"
};

const STYLE =
  "Photorealistic wide editorial department banner photograph for an African online marketplace, warm neutral studio backdrop, soft natural light, subject group arranged across the full width with generous breathing room, accurate materials, colours and textures, premium commercial catalogue quality, no people, no hands, no text, no letters, no numbers, no logos, no brand names, no watermark";

const DEPARTMENTS = [
  {
    id: "department-health-wellness",
    categoryKey: "health-wellness",
    categorySlug: "health-wellness",
    alt: "First-aid kit with bandages, gauze, plasters, antiseptic bottle and a digital thermometer beside a folded towel and potted aloe",
    prompt:
      "an open white first-aid kit holding rolled bandages, gauze pads and adhesive plasters, a small unlabelled amber antiseptic bottle, a digital thermometer and stainless steel scissors, next to a folded cotton towel, a reusable stainless steel water bottle and a small potted aloe vera plant"
  },
  {
    id: "department-baby-kids-toys",
    categoryKey: "baby-kids-toys",
    categorySlug: "baby-kids-toys",
    alt: "Two glass baby bottles, a folded cotton blanket, wooden stacking rings, a plush teddy bear and a silicone teether on a neutral surface",
    prompt:
      "two clear glass baby bottles with plain teats and caps, a folded soft cotton baby blanket, a wooden stacking-ring toy, a small plush teddy bear, a silicone teether and a pair of soft knitted baby booties"
  },
  {
    id: "department-sports-outdoors",
    categoryKey: "sports-outdoors",
    categorySlug: "sports-outdoors",
    alt: "Football, basketball, badminton racket, rolled yoga mat, dumbbells, hiking backpack and water bottle arranged on a neutral backdrop",
    prompt:
      "a plain size-5 football, a basketball, a badminton racket with two shuttlecocks, a rolled yoga mat, a pair of adjustable dumbbells, a canvas hiking backpack and a stainless steel water bottle"
  },
  {
    id: "department-automotive-motorcycle",
    categoryKey: "automotive-motorcycle",
    categorySlug: "automotive-motorcycle",
    alt: "Car-care kit with folded microfibre cloths, spray bottle, bucket and tyre gauge beside riding gloves and a plain open-face motorcycle helmet",
    prompt:
      "car care and motorcycle accessories: neatly folded microfibre cloths, a sponge, an unlabelled spray bottle, a plastic wash bucket, an analogue tyre pressure gauge and coiled jumper cables, beside a pair of leather riding gloves and a plain unmarked open-face motorcycle helmet"
  },
  {
    id: "department-tools-building-materials",
    categoryKey: "tools-building",
    categorySlug: "tools-building-materials",
    alt: "Claw hammer, screwdrivers, adjustable spanner, measuring tape and safety goggles beside stacked timber and plain cement bag",
    prompt:
      "hand tools and building materials: a claw hammer, a set of screwdrivers, an adjustable spanner, a measuring tape, safety goggles and work gloves, beside stacked timber offcuts, a plain sealed cement bag with no markings and a small stack of clay building bricks"
  },
  {
    id: "department-books-stationery",
    categoryKey: "books-stationery",
    categorySlug: "books-stationery",
    alt: "Stack of blank hardback books and notebooks with pencils in a cup, pens, a wooden ruler and a geometry set",
    prompt:
      "a stack of plain hardback books and spiral notebooks with blank unmarked covers, an open blank notebook, pencils in a metal cup, ballpoint pens, a wooden ruler, a geometry set and a pencil sharpener"
  }
];

const GROUPS = {
  a: DEPARTMENTS.slice(0, 3),
  b: DEPARTMENTS.slice(3)
};

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
  const generated = batchEntries.filter((entry) => entry.status === "generated" && entry.webpPath);
  ledger.model = ledger.model ?? MODEL;
  ledger.size = ledger.size ?? SIZE;
  ledger.priorCredits = PRIOR_CREDITS;
  ledger.newCredits = newCredits;
  ledger.cumulativeCredits = PRIOR_CREDITS + newCredits;
  ledger.creditBatches = ledger.creditBatches ?? {};
  ledger.creditBatches[BATCH] = {
    ...(ledger.creditBatches[BATCH] ?? {}),
    images: generated.length,
    credits: newCredits,
    model: MODEL,
    size: SIZE,
    aspectRatio: ASPECT_RATIO,
    status: generated.length === DEPARTMENTS.length ? "complete" : "in_progress"
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

async function createTask(department, apiKey) {
  let response;
  try {
    response = await fetch(`${API_BASE}/jobs/createTask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        input: {
          prompt: `${department.prompt}. ${STYLE}.`,
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

async function downloadAndOptimise(department, url, taskId) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`image download failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
  const pngPath = path.join(ORIGINALS_DIR, `${department.id}-${taskId}.png`);
  fs.writeFileSync(pngPath, buffer);

  const source = await sharp(buffer).metadata();
  let pipeline = sharp(buffer);
  // Downscale only; never upscale or claim a resolution the provider did not return.
  if ((source.width ?? 0) > 1600) {
    pipeline = pipeline.resize({ width: 1600, withoutEnlargement: true });
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const webpPath = path.join(OUT_DIR, `${department.id}.webp`);
  await pipeline.webp({ quality: 86, effort: 5 }).toFile(webpPath);
  const output = await sharp(webpPath).metadata();
  return {
    pngOriginalPath: path.relative(process.cwd(), pngPath).replaceAll("\\", "/"),
    webpPath: `/generated/taxonomy/${department.id}.webp`,
    sourceWidth: source.width ?? null,
    sourceHeight: source.height ?? null,
    width: output.width ?? null,
    height: output.height ?? null,
    webpBytes: fs.statSync(webpPath).size
  };
}

function retireAttempt(entry, department) {
  if (!entry?.webpPath) return null;
  fs.mkdirSync(RETIRED_DIR, { recursive: true });
  const current = path.join(process.cwd(), "public", entry.webpPath.replace(/^\//, ""));
  if (!fs.existsSync(current)) return null;
  const retiredPath = path.join(RETIRED_DIR, `${department.id}-${entry.taskId ?? "unknown"}.webp`);
  fs.copyFileSync(current, retiredPath);
  return path.relative(process.cwd(), retiredPath).replaceAll("\\", "/");
}

async function generateDepartment(department, ledger, apiKey, options) {
  let entry = ledger.assets.find((candidate) => candidate.id === department.id);
  const webpOnDisk = entry?.webpPath
    ? fs.existsSync(path.join(process.cwd(), "public", entry.webpPath.replace(/^\//, "")))
    : false;

  if (entry?.status === "generated" && webpOnDisk && !options.retryIds.has(department.id)) {
    console.log(JSON.stringify({ id: department.id, skipped: "already generated", credits: entry.credits }));
    return;
  }

  if (!entry) {
    entry = {
      id: department.id,
      batch: BATCH,
      categoryKey: department.categoryKey,
      categorySlug: department.categorySlug,
      kind: "department-banner",
      prompt: department.prompt,
      model: MODEL,
      size: SIZE,
      aspectRatio: ASPECT_RATIO,
      price: PRICE,
      status: "pending",
      taskId: null,
      credits: null,
      attempts: []
    };
    ledger.assets.push(entry);
  }

  if (options.retryIds.has(department.id)) {
    if (!options.reason) throw new Error(`--retry=${department.id} requires --reason="why"`);
    const retired = retireAttempt(entry, department);
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

  if (!entry.taskId && ["submit_uncertain", "submitting"].includes(entry.status) && !options.retryIds.has(department.id)) {
    throw new Error(
      `${department.id}: previous createTask outcome is uncertain; reconcile the provider task list and use --retry=${department.id} --reason="..." only after confirming no task was created`
    );
  }

  if (!entry.taskId) {
    entry.status = "submitting";
    entry.submitIntentAt = new Date().toISOString();
    writeLedger(ledger);
    try {
      entry.taskId = await createTask(department, apiKey);
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
    console.log(JSON.stringify({ id: department.id, submitted: true, taskId: entry.taskId }));
  } else {
    console.log(JSON.stringify({ id: department.id, resumed: true, taskId: entry.taskId, status: entry.status }));
  }

  const result = await pollTask(entry.taskId, apiKey);
  if (result.status === "timeout") {
    entry.status = "timeout";
    entry.lastPolledAt = new Date().toISOString();
    entry.lastError = "still processing after 10 minutes; task id retained";
    writeLedger(ledger);
    console.error(JSON.stringify({ id: department.id, timeout: true, taskId: entry.taskId }));
    return;
  }
  if (result.status === "failed") {
    entry.status = "failed";
    entry.credits = result.credits ?? 0;
    entry.lastError = result.failMsg;
    writeLedger(ledger);
    console.error(JSON.stringify({ id: department.id, failed: true, taskId: entry.taskId, failMsg: result.failMsg }));
    return;
  }

  const files = await downloadAndOptimise(department, result.url, entry.taskId);
  Object.assign(entry, files, {
    status: "generated",
    credits: result.credits,
    alt: department.alt,
    generatedAt: new Date().toISOString(),
    review: "pending contact-sheet inspection",
    lastError: null
  });
  ledger.creditBatches[BATCH] = ledger.creditBatches[BATCH] ?? {};
  ledger.creditBatches[BATCH].balanceAfter = await readCredits(apiKey).catch(() => null);
  writeLedger(ledger);
  console.log(
    JSON.stringify({
      id: department.id,
      credits: entry.credits,
      webpPath: entry.webpPath,
      source: `${entry.sourceWidth}x${entry.sourceHeight}`,
      output: `${entry.width}x${entry.height}`,
      kb: Math.round(entry.webpBytes / 1024)
    })
  );
}

async function buildContactSheet(entries, label) {
  const available = entries.filter(
    (entry) => entry.webpPath && fs.existsSync(path.join(process.cwd(), "public", entry.webpPath.replace(/^\//, "")))
  );
  if (available.length === 0) throw new Error("no generated department banners available for contact sheet");
  const tileWidth = 480;
  const tileHeight = 270;
  const labelHeight = 46;
  const columns = 2;
  const rows = Math.ceil(available.length / columns);
  const width = columns * tileWidth;
  const height = rows * (tileHeight + labelHeight);
  const composites = [];
  for (let index = 0; index < available.length; index += 1) {
    const entry = available[index];
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    const image = await sharp(path.join(process.cwd(), "public", entry.webpPath.replace(/^\//, "")))
      .resize(tileWidth, tileHeight, { fit: "cover" })
      .toBuffer();
    composites.push({ input: image, left, top });
    const caption = `${entry.categorySlug} · ${entry.credits ?? "?"} credits · ${entry.width}x${entry.height}`;
    const svg = Buffer.from(
      `<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f5f1e8"/><text x="12" y="29" font-family="Arial, sans-serif" font-size="16" fill="#14241b">${caption.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</text></svg>`
    );
    composites.push({ input: svg, left, top: top + tileHeight });
  }
  fs.mkdirSync(QA_DIR, { recursive: true });
  const output = path.join(QA_DIR, `contact-sheet-${label}.png`);
  await sharp({ create: { width, height, channels: 3, background: "#f5f1e8" } })
    .composite(composites)
    .png()
    .toFile(output);
  console.log(
    JSON.stringify({
      contactSheet: path.relative(process.cwd(), output).replaceAll("\\", "/"),
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

  let selected = DEPARTMENTS;
  if (groupArg) {
    const group = groupArg.slice("--group=".length).toLowerCase();
    if (!GROUPS[group]) throw new Error("--group must be a or b");
    selected = GROUPS[group];
  }
  if (onlyArg) {
    const only = new Set(onlyArg.slice("--only=".length).split(",").map((value) => value.trim()));
    selected = selected.filter((department) => only.has(department.id));
    if (selected.length === 0) throw new Error("--only matched no department id");
  }

  if (process.argv.includes("--contact-sheet")) {
    const label = groupArg ? groupArg.slice("--group=".length).toLowerCase() : "all";
    await buildContactSheet(ledger.assets.filter((entry) => entry.batch === BATCH), label);
    return;
  }

  const reviewedArg = process.argv.find((argument) => argument.startsWith("--reviewed="));
  if (reviewedArg) {
    const noteArg = process.argv.find((argument) => argument.startsWith("--note="));
    const note = noteArg ? noteArg.slice("--note=".length).trim() : "";
    if (!note) fail("--reviewed requires --note=\"what the inspection found\"");
    const ids = reviewedArg
      .slice("--reviewed=".length)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const reviewedAt = new Date().toISOString();
    for (const id of ids) {
      const entry = ledger.assets.find((candidate) => candidate.id === id && candidate.batch === BATCH);
      if (!entry || entry.status !== "generated") fail(`${id} has no generated department banner to review`);
      entry.review = `visually inspected ${reviewedAt}: ${note}`;
      entry.reviewedAt = reviewedAt;
    }
    writeLedger(ledger);
    console.log(JSON.stringify({ reviewed: ids, reviewedAt, note }));
    return;
  }

  if (process.argv.includes("--plan")) {
    const pending = selected.filter((department) => {
      const entry = ledger.assets.find((candidate) => candidate.id === department.id);
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
          expectedCredits: pending.length * PRICE.creditsPerImage,
          expectedUsd: Number((pending.length * PRICE.usdPerImage).toFixed(2)),
          price: PRICE,
          pending: pending.map((department) => department.id),
          note: "credits are read back from each job; the account balance is read before and after; no purchase"
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
  ledger.creditBatches[BATCH].price = PRICE;
  writeLedger(ledger);
  console.log(JSON.stringify({ creditsBefore: balanceBefore, selected: selected.map((department) => department.id) }));

  for (const department of selected) {
    await generateDepartment(department, ledger, apiKey, options);
  }

  ledger.creditBatches[BATCH].balanceAfter = await readCredits(apiKey).catch(() => null);
  const generated = ledger.assets.filter((entry) => entry.batch === BATCH && entry.status === "generated");
  if (generated.length === DEPARTMENTS.length) {
    ledger.creditBatches[BATCH].completedAt = new Date().toISOString();
  }
  writeLedger(ledger);
  console.log(
    JSON.stringify(
      {
        newCredits: ledger.newCredits,
        priorCredits: ledger.priorCredits,
        cumulativeCredits: ledger.cumulativeCredits,
        balanceBefore,
        balanceAfter: ledger.creditBatches[BATCH].balanceAfter,
        generated: generated.map((entry) => entry.id)
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error("DEPARTMENT BANNER GENERATION ERROR", error.message);
  process.exit(1);
});
