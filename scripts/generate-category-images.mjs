/**
 * Kie.ai NaijaShop level-1 CATEGORY tile images.
 *
 * Generates one original square (1:1, 1K) category tile for each active
 * level-1 Category that has no approved `imageUrl` and no truly representative
 * existing product photograph. Categories whose only publishable content is
 * NG-restricted (medicines-treatments, vitamins-supplements) are deliberately
 * absent and documented in docs/taxonomy/coverage.md.
 *
 * What this script owns:
 *  - public/generated/taxonomy/category-<key>.webp   (published WebP derivative)
 *  - docs/taxonomy/generation-ledger.json            (appended entries only)
 *  - qa-artifacts/category-tiles/                    (gitignored PNG originals,
 *    contact sheets and retired attempts)
 *
 * It never touches app code, taxonomy seed data, the database or products.
 * Applying the resulting imageUrl/imageAlt to Category rows is a separate,
 * guarded script: scripts/apply-category-images.ts.
 *
 * Usage:
 *   node --env-file=.env scripts/generate-category-images.mjs --plan
 *   node --env-file=.env scripts/generate-category-images.mjs --group=a
 *   node --env-file=.env scripts/generate-category-images.mjs --group=b
 *   node --env-file=.env scripts/generate-category-images.mjs --group=c
 *   node --env-file=.env scripts/generate-category-images.mjs --only=category-books
 *   node --env-file=.env scripts/generate-category-images.mjs --group=a --contact-sheet
 *   node --env-file=.env scripts/generate-category-images.mjs --retry=category-farm-inputs --reason="subject mismatch"
 *   node --env-file=.env scripts/generate-category-images.mjs --reviewed=category-books --note="contact-sheet-a.png: accurate"
 *
 * Safe retry rules (same as the approved product/department batches):
 *  - a task that is still processing is polled, never re-submitted;
 *  - a retry needs an explicit id and reason, normally only after inspecting
 *    the contact sheet;
 *  - a createTask transport error is recorded as submit_uncertain and is not
 *    retried automatically (reconcile the provider task list first).
 *
 * Model, parameters and price were verified in the current Kie catalogue on
 * 2026-11-13 (MCP prepare_media_generation, exact quote): model
 * gpt-image-2-5-flare-text-to-image, resolution 1K, aspect_ratio 1:1,
 * 6 credits / USD 0.03 per image (kie.ai/pricing, rate card 2026-10-28).
 * Credits are read back from every job and from /chat/credit before and after.
 * No credits are purchased and no other provider is called.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const API_BASE = process.env.KIE_API_BASE ?? "https://api.kie.ai/api/v1";
const MODEL = "gpt-image-2-5-flare-text-to-image";
const SIZE = "1K";
const ASPECT_RATIO = "1:1";
const TILE = 1024;
const BATCH = "taxonomy-categories";
const OUT_DIR = path.join(process.cwd(), "public", "generated", "taxonomy");
const QA_DIR = path.join(process.cwd(), "qa-artifacts", "category-tiles");
const ORIGINALS_DIR = path.join(QA_DIR, "originals");
const RETIRED_DIR = path.join(QA_DIR, "retired");
const LEDGER = path.join(process.cwd(), "docs", "taxonomy", "generation-ledger.json");
/** Batches 1, 2 and the department banners are preserved exactly and never re-counted. */
const PRIOR_CREDITS = 132;
const PRICE = {
  creditsPerImage: 6,
  usdPerImage: 0.03,
  usdPerCredit: 0.005,
  sourceUrl: "https://kie.ai/pricing",
  rateCardVerifiedAt: "2026-10-27",
  rateCardVersion: "2026-10-28",
  quotedVia: "Kie.ai MCP prepare_media_generation (exact quote, 2026-11-13)"
};

const STYLE =
  "Photorealistic compact category tile photograph for an African online marketplace, warm neutral studio backdrop, soft diffused natural light, centred group composition with generous margin on every side so the subject survives a circular crop, accurate materials, colours and textures, premium commercial catalogue quality, no people, no hands, no text, no letters, no numbers, no logos, no brand names, no watermark, no clutter";

/*
 * Reused approved product photographs. These are verified against the live
 * REVIEW catalogue by scripts/apply-category-images.ts (the source URL must
 * belong to an ACTIVE product inside the target category's subtree).
 * They are recorded in the ledger with zero credits.
 */
const REUSE = [
  {
    id: "category-fabrics-textiles",
    categoryKey: "fabrics-textiles",
    categorySlug: "fabrics-textiles",
    sourcePath: "/generated/taxonomy/african-print-fabrics.webp",
    sourceProductSlug: "demo-african-print-cotton-fabric-6-yards-xggck",
    alt: "Stacked African-print cotton fabrics in indigo, green and gold patterns",
    reason: "Both populated leaves are fabrics; the African-print stack is the category archetype."
  },
  {
    id: "category-natural-traditional-beauty",
    categoryKey: "natural-traditional-beauty",
    categorySlug: "natural-traditional-beauty",
    sourcePath: "/generated/taxonomy/black-soap.webp",
    sourceProductSlug: "demo-african-black-soap-bar-300g-40xqk",
    alt: "Stacked bars of African black soap beside a bowl of raw shea butter",
    reason: "The frame shows both populated leaves: black soap and shea butter."
  },
  {
    id: "category-power-tools",
    categoryKey: "power-tools",
    categorySlug: "power-tools",
    sourcePath: "/generated/taxonomy/cordless-drill.webp",
    sourceProductSlug: "demo-cordless-drill-and-bit-set-18v-dlbqn",
    alt: "Cordless drill with a bit set, two batteries and a charger",
    reason: "The drill is the archetypal power tool; the other two leaves are empty."
  },
  {
    id: "category-processing-equipment",
    categoryKey: "processing-equipment",
    categorySlug: "processing-equipment",
    sourcePath: "/generated/taxonomy/cassava-grater.webp",
    sourceProductSlug: "demo-electric-cassava-grater-bo1z9",
    alt: "Electric stainless-steel cassava grating machine on a stand",
    reason: "Processing machinery is the category subject; cassava processing is the only populated leaf."
  },
  {
    id: "category-stationery-office",
    categoryKey: "stationery-office",
    categorySlug: "stationery-office",
    sourcePath: "/generated/taxonomy/exercise-books.webp",
    sourceProductSlug: "demo-a5-exercise-books-pack-of-10-m3ss1",
    alt: "Stack of A5 exercise books with plain green and blue covers",
    reason: "Exercise books are the archetypal stationery item; notebooks/paper is the only populated leaf."
  },
  {
    id: "category-baby-feeding-care",
    categoryKey: "baby-feeding-care",
    categorySlug: "baby-feeding-care",
    sourcePath: "/generated/taxonomy/glass-baby-bottles.webp",
    sourceProductSlug: "demo-glass-baby-bottles-2-240ml-vz8lq",
    alt: "Two clear glass baby bottles with plain teats and caps",
    reason: "Bottles are the archetype of the only populated, publishable feeding leaf."
  },
  {
    id: "category-medical-devices-aids",
    categoryKey: "medical-devices-aids",
    categorySlug: "medical-devices-aids",
    sourcePath: "/generated/taxonomy/first-aid-kit.webp",
    sourceProductSlug: "demo-compact-first-aid-kit-42-pieces-5x8ln",
    alt: "Open first-aid kit with bandages, gauze pads, plasters and scissors",
    reason: "First-aid supplies are the only publishable leaf; health monitors and mobility aids are NG-restricted."
  }
];

const TILES = [
  {
    id: "category-baby-gear-nursery",
    categoryKey: "baby-gear-nursery",
    categorySlug: "baby-gear-nursery",
    alt: "Lightweight baby stroller beside a wooden nursery cot with folded blankets",
    prompt:
      "a modern lightweight baby stroller with a plain grey canopy, a wooden nursery cot with a folded cotton blanket and a neat stack of folded baby clothes, and a soft knitted blanket draped over the cot rail"
  },
  {
    id: "category-books",
    categoryKey: "books",
    categorySlug: "books",
    alt: "Neat stack of plain hardback books with an open book, bookmark and reading glasses",
    prompt:
      "a neat stack of plain hardback books with unmarked covers in deep green, ochre and navy, an open book resting against the stack, a simple leather bookmark and a pair of round reading glasses"
  },
  {
    id: "category-car-parts",
    categoryKey: "car-parts",
    categorySlug: "car-parts",
    alt: "Car oil filter, pleated air filter, headlight assembly and side wing mirror",
    prompt:
      "a car engine oil filter, a pleated air filter, a rectangular headlight assembly and a side wing mirror with a plain black housing, arranged together on a neutral surface"
  },
  {
    id: "category-farm-inputs",
    categoryKey: "farm-inputs",
    categorySlug: "farm-inputs",
    alt: "Sack of potting soil, compost, watering can, hand trowel and drip irrigation tubing",
    prompt:
      "a sealed plain sack of potting soil with no markings, a pile of dark compost, a galvanised watering can, a hand trowel and a length of black drip-irrigation tubing with emitters"
  },
  {
    id: "category-fitness-strength",
    categoryKey: "fitness-strength",
    categorySlug: "fitness-strength",
    alt: "Hexagonal dumbbells, kettlebell, resistance band and skipping rope",
    prompt:
      "a pair of black hexagonal dumbbells, a kettlebell, a rolled resistance band and a coiled skipping rope arranged on a neutral surface"
  },
  {
    id: "category-hand-tools",
    categoryKey: "hand-tools",
    categorySlug: "hand-tools",
    alt: "Claw hammer, combination spanners, socket set, measuring tape and screwdriver",
    prompt:
      "a claw hammer, a set of combination spanners fanned out, a socket set in an open case, a measuring tape and a screwdriver with interchangeable bits"
  },
  {
    id: "category-motorcycle-parts",
    categoryKey: "motorcycle-parts",
    categorySlug: "motorcycle-parts",
    alt: "Motorcycle drive chain, steel sprocket, spark plug, lever and engine side cover",
    prompt:
      "a motorcycle drive chain coiled beside a steel sprocket, a spark plug, a chrome handlebar lever and a plain engine side cover, arranged on a neutral surface"
  },
  {
    id: "category-art-craft",
    categoryKey: "art-craft",
    categorySlug: "art-craft",
    alt: "Acrylic paint tubes, paintbrushes, blank canvas, coloured pencils and beads",
    prompt:
      "tubes of acrylic paint, a set of paintbrushes standing in a jar, a blank stretched canvas, a tin of coloured pencils and a small tray of assorted beads"
  },
  {
    id: "category-building-materials",
    categoryKey: "building-materials",
    categorySlug: "building-materials",
    alt: "Plain cement bag, concrete blocks, roofing sheets, timber planks and paint bucket",
    prompt:
      "a plain sealed cement bag with no markings, a small stack of grey concrete blocks, corrugated roofing sheets, sawn timber planks and a plain paint bucket"
  },
  {
    id: "category-car-care-accessories",
    categoryKey: "car-care-accessories",
    categorySlug: "car-care-accessories",
    alt: "Microfibre cloths, wash bucket, spray bottle, seat cover and windscreen sunshade",
    prompt:
      "neatly folded microfibre cloths, a plastic wash bucket, an unlabelled spray bottle, a folded fabric car seat cover and a windscreen sunshade, arranged together"
  },
  {
    id: "category-household-cleaning",
    categoryKey: "household-cleaning",
    categorySlug: "household-cleaning",
    alt: "Mop and bucket, broom, unlabelled cleaner spray, cloths, sponge and laundry basket",
    prompt:
      "a mop and bucket, a stiff broom, a spray bottle of cleaner with no label, folded cleaning cloths, a sponge and a woven laundry basket"
  },
  {
    id: "category-oils-soups-seasonings",
    categoryKey: "oils-soups-seasonings",
    categorySlug: "oils-soups-seasonings",
    alt: "Palm oil bottle, ground egusi seeds, ground crayfish, dried chillies and stock cubes",
    prompt:
      "a glass bottle of red palm oil, a bowl of ground egusi melon seeds, a bowl of ground crayfish, dried red chillies and a small pile of plain stock cubes"
  },
  {
    id: "category-outdoor-camping",
    categoryKey: "outdoor-camping",
    categorySlug: "outdoor-camping",
    alt: "Dome tent, rolled sleeping bag, camping lantern, cooler box and folding stool",
    prompt:
      "a compact dome tent, a rolled sleeping bag, a battery camping lantern, a small cooler box and a folding camp stool"
  },
  {
    id: "category-toys-play",
    categoryKey: "toys-play",
    categorySlug: "toys-play",
    alt: "Wooden stacking-ring toy, plush teddy bear, building blocks and a toy car",
    prompt:
      "a wooden stacking-ring toy, a plush teddy bear, a set of colourful wooden building blocks and a small die-cast toy car"
  },
  {
    id: "category-wholesale-business-supplies",
    categoryKey: "wholesale-business-supplies",
    categorySlug: "wholesale-business-supplies",
    alt: "Plain cardboard shipping boxes, packing tape, paper bags, grain sacks and shelving",
    prompt:
      "a stack of plain cardboard shipping boxes, rolls of packing tape, brown paper bags, a stack of plain grain sacks and a metal shelving unit"
  },
  {
    id: "category-cycling-scooters",
    categoryKey: "cycling-scooters",
    categorySlug: "cycling-scooters",
    alt: "City bicycle, plain vented cycling helmet, cycling gloves and water bottle",
    prompt:
      "a city bicycle with a plain frame, a vented cycling helmet with no branding, a pair of cycling gloves and a stainless steel water bottle"
  },
  {
    id: "category-workplace-safety",
    categoryKey: "workplace-safety",
    categorySlug: "workplace-safety",
    alt: "High-visibility vest, hard hat, work gloves, safety goggles and steel-toe boots",
    prompt:
      "a high-visibility yellow safety vest, a white hard hat, leather work gloves, clear safety goggles and a pair of steel-toe work boots"
  },
  {
    id: "category-ball-racquet-sports",
    categoryKey: "ball-racquet-sports",
    categorySlug: "ball-racquet-sports",
    alt: "Football, basketball, tennis racket and ball, badminton racket and shuttlecocks",
    prompt:
      "a plain football, a basketball, a tennis racket with a tennis ball, a badminton racket and two shuttlecocks"
  },
  {
    id: "category-grains-flours",
    categoryKey: "grains-flours",
    categorySlug: "grains-flours",
    alt: "Woven bowls of rice, maize kernels, garri and white flour with a jute grain sack",
    prompt:
      "woven bowls filled with white rice, yellow maize kernels, garri cassava flakes and fine white flour, with a small plain jute sack of grain behind them"
  }
];

const GROUPS = {
  a: TILES.slice(0, 7),
  b: TILES.slice(7, 13),
  c: TILES.slice(13)
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

function syncReuse(ledger) {
  ledger.creditBatches = ledger.creditBatches ?? {};
  ledger.creditBatches[BATCH] = ledger.creditBatches[BATCH] ?? {};
  ledger.creditBatches[BATCH].reuse = REUSE.map((entry) => ({
    id: entry.id,
    categoryKey: entry.categoryKey,
    categorySlug: entry.categorySlug,
    sourcePath: entry.sourcePath,
    sourceProductSlug: entry.sourceProductSlug,
    alt: entry.alt,
    reason: entry.reason,
    credits: 0,
    kind: "reused-product-photograph"
  }));
}

function writeLedger(ledger) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  ledger.assets = ledger.assets ?? [];
  syncReuse(ledger);
  const batchEntries = ledger.assets.filter((entry) => entry.batch === BATCH);
  const newCredits = batchEntries.reduce((sum, entry) => sum + (entry.credits ?? 0), 0);
  const generated = batchEntries.filter((entry) => entry.status === "generated" && entry.webpPath);
  ledger.model = ledger.model ?? MODEL;
  ledger.size = ledger.size ?? SIZE;
  ledger.priorCredits = PRIOR_CREDITS;
  ledger.newCredits = newCredits;
  ledger.cumulativeCredits = PRIOR_CREDITS + newCredits;
  ledger.creditBatches[BATCH] = {
    ...(ledger.creditBatches[BATCH] ?? {}),
    images: generated.length,
    reused: REUSE.length,
    credits: newCredits,
    model: MODEL,
    size: SIZE,
    aspectRatio: ASPECT_RATIO,
    price: PRICE,
    status: generated.length === TILES.length ? "complete" : "in_progress"
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
    throw new Error(
      `credit read-back failed: HTTP ${response.status} code=${body?.code} ${String(body?.msg ?? "").slice(0, 120)}`
    );
  }
  return body.data;
}

async function createTask(tile, apiKey) {
  let response;
  try {
    response = await fetch(`${API_BASE}/jobs/createTask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        input: {
          prompt: `${tile.prompt}. ${STYLE}.`,
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
    throw new Error(
      `createTask failed: HTTP ${response.status} code=${body?.code} ${String(body?.msg ?? "").slice(0, 160)}`
    );
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

async function downloadAndOptimise(tile, url, taskId) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`image download failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
  const pngPath = path.join(ORIGINALS_DIR, `${tile.id}-${taskId}.png`);
  fs.writeFileSync(pngPath, buffer);

  const source = await sharp(buffer).metadata();
  if ((source.width ?? 0) < TILE || (source.height ?? 0) < TILE) {
    throw new Error(
      `provider returned ${source.width}x${source.height}, smaller than the ${TILE}x${TILE} published tile; refusing to upscale`
    );
  }
  let pipeline = sharp(buffer);
  if (source.width !== TILE || source.height !== TILE) {
    // Centre crop to the published square; never upscale (source is >= TILE).
    pipeline = pipeline.resize({ width: TILE, height: TILE, fit: "cover", position: "centre" });
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const webpPath = path.join(OUT_DIR, `${tile.id}.webp`);
  await pipeline.webp({ quality: 86, effort: 5 }).toFile(webpPath);
  const output = await sharp(webpPath).metadata();
  if (output.width !== TILE || output.height !== TILE) {
    throw new Error(`published tile is ${output.width}x${output.height}, expected ${TILE}x${TILE}`);
  }
  return {
    pngOriginalPath: path.relative(process.cwd(), pngPath).replaceAll("\\", "/"),
    webpPath: `/generated/taxonomy/${tile.id}.webp`,
    sourceWidth: source.width ?? null,
    sourceHeight: source.height ?? null,
    width: output.width ?? null,
    height: output.height ?? null,
    webpBytes: fs.statSync(webpPath).size,
    cropped: source.width !== TILE || source.height !== TILE
  };
}

function retireAttempt(entry, tile) {
  if (!entry?.webpPath) return null;
  fs.mkdirSync(RETIRED_DIR, { recursive: true });
  const current = path.join(process.cwd(), "public", entry.webpPath.replace(/^\//, ""));
  if (!fs.existsSync(current)) return null;
  const retiredPath = path.join(RETIRED_DIR, `${tile.id}-${entry.taskId ?? "unknown"}.webp`);
  fs.copyFileSync(current, retiredPath);
  return path.relative(process.cwd(), retiredPath).replaceAll("\\", "/");
}

async function generateTile(tile, ledger, apiKey, options) {
  let entry = ledger.assets.find((candidate) => candidate.id === tile.id);
  const webpOnDisk = entry?.webpPath
    ? fs.existsSync(path.join(process.cwd(), "public", entry.webpPath.replace(/^\//, "")))
    : false;

  if (entry?.status === "generated" && webpOnDisk && !options.retryIds.has(tile.id)) {
    console.log(JSON.stringify({ id: tile.id, skipped: "already generated", credits: entry.credits }));
    return;
  }

  if (!entry) {
    entry = {
      id: tile.id,
      batch: BATCH,
      categoryKey: tile.categoryKey,
      categorySlug: tile.categorySlug,
      kind: "category-tile",
      prompt: tile.prompt,
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

  if (options.retryIds.has(tile.id)) {
    if (!options.reason) throw new Error(`--retry=${tile.id} requires --reason="why"`);
    const retired = retireAttempt(entry, tile);
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

  if (
    !entry.taskId &&
    ["submit_uncertain", "submitting"].includes(entry.status) &&
    !options.retryIds.has(tile.id)
  ) {
    throw new Error(
      `${tile.id}: previous createTask outcome is uncertain; reconcile the provider task list and use --retry=${tile.id} --reason="..." only after confirming no task was created`
    );
  }

  if (!entry.taskId) {
    entry.status = "submitting";
    entry.submitIntentAt = new Date().toISOString();
    writeLedger(ledger);
    try {
      entry.taskId = await createTask(tile, apiKey);
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
    console.log(JSON.stringify({ id: tile.id, submitted: true, taskId: entry.taskId }));
  } else {
    console.log(JSON.stringify({ id: tile.id, resumed: true, taskId: entry.taskId, status: entry.status }));
  }

  const result = await pollTask(entry.taskId, apiKey);
  if (result.status === "timeout") {
    entry.status = "timeout";
    entry.lastPolledAt = new Date().toISOString();
    entry.lastError = "still processing after 10 minutes; task id retained";
    writeLedger(ledger);
    console.error(JSON.stringify({ id: tile.id, timeout: true, taskId: entry.taskId }));
    return;
  }
  if (result.status === "failed") {
    entry.status = "failed";
    entry.credits = result.credits ?? 0;
    entry.lastError = result.failMsg;
    writeLedger(ledger);
    console.error(
      JSON.stringify({ id: tile.id, failed: true, taskId: entry.taskId, failMsg: result.failMsg })
    );
    return;
  }

  const files = await downloadAndOptimise(tile, result.url, entry.taskId);
  Object.assign(entry, files, {
    status: "generated",
    credits: result.credits,
    alt: tile.alt,
    generatedAt: new Date().toISOString(),
    review: "pending contact-sheet inspection",
    lastError: null
  });
  ledger.creditBatches[BATCH] = ledger.creditBatches[BATCH] ?? {};
  ledger.creditBatches[BATCH].balanceAfter = await readCredits(apiKey).catch(() => null);
  writeLedger(ledger);
  console.log(
    JSON.stringify({
      id: tile.id,
      credits: entry.credits,
      webpPath: entry.webpPath,
      source: `${entry.sourceWidth}x${entry.sourceHeight}`,
      output: `${entry.width}x${entry.height}`,
      cropped: entry.cropped,
      kb: Math.round(entry.webpBytes / 1024)
    })
  );
}

async function buildContactSheet(entries, label) {
  const available = entries.filter(
    (entry) =>
      entry.batch === BATCH &&
      entry.webpPath &&
      fs.existsSync(path.join(process.cwd(), "public", entry.webpPath.replace(/^\//, "")))
  );
  if (available.length === 0) throw new Error("no generated category tiles available for contact sheet");
  const tileWidth = 400;
  const tileHeight = 400;
  const labelHeight = 34;
  const columns = 3;
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
      `<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f5f1e8"/><text x="10" y="23" font-family="Arial, sans-serif" font-size="14" fill="#14241b">${caption
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")}</text></svg>`
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
  syncReuse(ledger);
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

  let selected = TILES;
  if (groupArg) {
    const group = groupArg.slice("--group=".length).toLowerCase();
    if (!GROUPS[group]) throw new Error("--group must be a, b or c");
    selected = GROUPS[group];
  }
  if (onlyArg) {
    const only = new Set(
      onlyArg
        .slice("--only=".length)
        .split(",")
        .map((value) => value.trim())
    );
    selected = selected.filter((tile) => only.has(tile.id));
    if (selected.length === 0) throw new Error("--only matched no category tile id");
  }

  if (process.argv.includes("--contact-sheet")) {
    const label = groupArg ? groupArg.slice("--group=".length).toLowerCase() : "all";
    const scope = groupArg ? GROUPS[label.toLowerCase()]?.map((tile) => tile.id) : null;
    const entries = ledger.assets.filter(
      (entry) => entry.batch === BATCH && (!scope || scope.includes(entry.id))
    );
    await buildContactSheet(entries, label);
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
      if (!entry || entry.status !== "generated") fail(`${id} has no generated category tile to review`);
      entry.review = `visually inspected ${reviewedAt}: ${note}`;
      entry.reviewedAt = reviewedAt;
    }
    writeLedger(ledger);
    console.log(JSON.stringify({ reviewed: ids, reviewedAt, note }));
    return;
  }

  if (process.argv.includes("--plan")) {
    const pending = selected.filter((tile) => {
      const entry = ledger.assets.find((candidate) => candidate.id === tile.id);
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
          batch: BATCH,
          group: groupArg ? groupArg.slice("--group=".length) : "all",
          count: pending.length,
          expectedCredits: pending.length * PRICE.creditsPerImage,
          expectedUsd: Number((pending.length * PRICE.usdPerImage).toFixed(2)),
          price: PRICE,
          pending: pending.map((tile) => tile.id),
          reuse: REUSE.map((entry) => ({
            category: entry.categoryKey,
            source: entry.sourcePath,
            credits: 0
          })),
          skippedRegulated: ["medicines-treatments", "vitamins-supplements"],
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
  writeLedger(ledger);
  console.log(JSON.stringify({ creditsBefore: balanceBefore, selected: selected.map((tile) => tile.id) }));

  for (const tile of selected) {
    await generateTile(tile, ledger, apiKey, options);
  }

  ledger.creditBatches[BATCH].balanceAfter = await readCredits(apiKey).catch(() => null);
  const generated = ledger.assets.filter((entry) => entry.batch === BATCH && entry.status === "generated");
  if (generated.length === TILES.length) {
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
        generated: generated.map((entry) => entry.id),
        reused: REUSE.length
      },
      null,
      2
    )
  );
})().catch((error) => {
  console.error("CATEGORY TILE GENERATION ERROR", error.message);
  process.exit(1);
});
