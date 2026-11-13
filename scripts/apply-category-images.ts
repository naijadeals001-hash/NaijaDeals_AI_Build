#!/usr/bin/env node
/**
 * Guarded application of the approved level-1 CATEGORY tile images.
 *
 * Sets Category.imageUrl and Category.imageAlt for exactly the 26 active
 * level-1 categories that have no approved image and a suitable visual:
 *   - 19 newly generated Kie category tiles (batch `taxonomy-categories`);
 *   - 7 reused approved product photographs whose subject represents the
 *     category (recorded with zero credits in the same ledger batch).
 * It also adds the missing imageAlt to six of the nine level-1 categories that
 * already had approved art (phones-tablets, computers, electronics-appliances,
 * home-kitchen, fashion-accessories, beauty-personal-care). Those six writes
 * change only imageAlt; the approved imageUrl is verified unchanged and a
 * different image blocks the run. The remaining three pre-existing tiles
 * (gaming, power-solar, groceries-household) already had alt text and are not
 * targets.
 *
 * The two level-1 categories whose entire subtree is NG-restricted
 * (medicines-treatments, vitamins-supplements) are deliberately skipped and
 * documented in docs/taxonomy/coverage.md.
 *
 * Default is a dry run: it validates the generated assets, the ledger review
 * state and the live REVIEW rows, then prints the before -> after report.
 *
 * `--apply` updates the rows in ONE transaction and writes an AuditLog row and
 * a SystemEvent row for each change in that same transaction. Re-running is
 * safe: a row already holding the approved imageUrl/imageAlt is reported as
 * already applied and skipped. If any fingerprint of the other Category rows,
 * Product rows or ProductImage rows changes during the transaction, the whole
 * transaction is rolled back and the script fails.
 *
 * Safety rules:
 *  - REVIEW_DATABASE_URL is mandatory; DATABASE_URL is never a fallback.
 *  - --expect-db must match the URL database and the live current_database().
 *  - DatabaseClassification must explicitly contain REVIEW.
 *  - Every target must be an active, non-demo, level-1 Category with the
 *    expected unique key and slug and an active level-0 department parent.
 *  - A target is only written when imageUrl is NULL (or already equal). Any
 *    other existing image is treated as unknown art and blocks the run; it is
 *    never overwritten. An alt-only target requires the exact approved imageUrl
 *    and only fills a NULL (or equal) imageAlt.
 *  - imageAlt must be 1..220 characters; imageUrl must resolve to an existing
 *    WebP inside public/ with the published 1024x1024 dimensions.
 *  - Generated assets need ledger status=generated and reviewedAt. An
 *    unreviewed or retried asset blocks the run.
 *  - Reused assets must be the first ProductImage of an ACTIVE product inside
 *    the target category's own subtree, and the URL must equal the recorded
 *    source path.
 *  - Only Category.imageUrl / imageAlt change for the targets.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/apply-category-images.ts --expect-db=naijadeals_review
 *
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/apply-category-images.ts --expect-db=naijadeals_review --apply
 *
 *   Optional: --json
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import sharp from "sharp";

const LEDGER_PATH = path.resolve(process.cwd(), "docs", "taxonomy", "generation-ledger.json");
const BATCH = "taxonomy-categories";
const ACTION = "taxonomy.category.image";
const MAX_ALT = 220;
const EXPECTED_WIDTH = 1024;
const EXPECTED_HEIGHT = 1024;

type Target = {
  key: string;
  slug: string;
  mode: "generated" | "reused" | "alt-only";
  sourceProductSlug?: string;
  sourcePath?: string;
  expectedImageUrl?: string;
  alt?: string;
};

/** 19 generated tiles. Their image URL and alt come from the ledger. */
const GENERATED_TARGETS: Target[] = [
  "baby-gear-nursery",
  "books",
  "car-parts",
  "farm-inputs",
  "fitness-strength",
  "hand-tools",
  "motorcycle-parts",
  "art-craft",
  "building-materials",
  "car-care-accessories",
  "household-cleaning",
  "oils-soups-seasonings",
  "outdoor-camping",
  "toys-play",
  "wholesale-business-supplies",
  "cycling-scooters",
  "workplace-safety",
  "ball-racquet-sports",
  "grains-flours"
].map((key) => ({ key, slug: key, mode: "generated" as const }));

/** 7 reused approved product photographs (zero credits). */
const REUSED_TARGETS: Target[] = [
  {
    key: "fabrics-textiles",
    slug: "fabrics-textiles",
    mode: "reused",
    sourceProductSlug: "demo-african-print-cotton-fabric-6-yards-xggck",
    sourcePath: "/generated/taxonomy/african-print-fabrics.webp",
    alt: "Stacked African-print cotton fabrics in indigo, green and gold patterns"
  },
  {
    key: "natural-traditional-beauty",
    slug: "natural-traditional-beauty",
    mode: "reused",
    sourceProductSlug: "demo-african-black-soap-bar-300g-40xqk",
    sourcePath: "/generated/taxonomy/black-soap.webp",
    alt: "Stacked bars of African black soap beside a bowl of raw shea butter"
  },
  {
    key: "power-tools",
    slug: "power-tools",
    mode: "reused",
    sourceProductSlug: "demo-cordless-drill-and-bit-set-18v-dlbqn",
    sourcePath: "/generated/taxonomy/cordless-drill.webp",
    alt: "Cordless drill with a bit set, two batteries and a charger"
  },
  {
    key: "processing-equipment",
    slug: "processing-equipment",
    mode: "reused",
    sourceProductSlug: "demo-electric-cassava-grater-bo1z9",
    sourcePath: "/generated/taxonomy/cassava-grater.webp",
    alt: "Electric stainless-steel cassava grating machine on a stand"
  },
  {
    key: "stationery-office",
    slug: "stationery-office",
    mode: "reused",
    sourceProductSlug: "demo-a5-exercise-books-pack-of-10-m3ss1",
    sourcePath: "/generated/taxonomy/exercise-books.webp",
    alt: "Stack of A5 exercise books with plain green and blue covers"
  },
  {
    key: "baby-feeding-care",
    slug: "baby-feeding-care",
    mode: "reused",
    sourceProductSlug: "demo-glass-baby-bottles-2-240ml-vz8lq",
    sourcePath: "/generated/taxonomy/glass-baby-bottles.webp",
    alt: "Two clear glass baby bottles with plain teats and caps"
  },
  {
    key: "medical-devices-aids",
    slug: "medical-devices-aids",
    mode: "reused",
    sourceProductSlug: "demo-compact-first-aid-kit-42-pieces-5x8ln",
    sourcePath: "/generated/taxonomy/first-aid-kit.webp",
    alt: "Open first-aid kit with bandages, gauze pads, plasters and scissors"
  }
];

/**
 * Six pre-existing approved tiles have imageUrl but imageAlt = NULL. Only the
 * missing alt text is added; the approved imageUrl is never changed and any
 * different image blocks the run.
 */
const ALT_ONLY_TARGETS: Target[] = [
  {
    key: "phones-tablets",
    slug: "phones-tablets",
    mode: "alt-only",
    expectedImageUrl: "/generated/shop/category-phones-tablets.webp",
    alt: "Two smartphones and a tablet on a pale mint background"
  },
  {
    key: "computers",
    slug: "computers",
    mode: "alt-only",
    expectedImageUrl: "/generated/shop/category-computers.webp",
    alt: "Open laptop, desktop monitor, keyboard and mouse on a light desk"
  },
  {
    key: "electronics-appliances",
    slug: "electronics-appliances",
    mode: "alt-only",
    expectedImageUrl: "/generated/shop/banner-electronics.webp",
    alt: "Gaming headset, keyboard, controller, phone, smartwatch and laptop on a neon-lit desk"
  },
  {
    key: "home-kitchen",
    slug: "home-kitchen",
    mode: "alt-only",
    expectedImageUrl: "/generated/shop/category-home-kitchen.webp",
    alt: "Stainless steel cookware set with a kettle and wooden utensils"
  },
  {
    key: "fashion-accessories",
    slug: "fashion-accessories",
    mode: "alt-only",
    expectedImageUrl: "/generated/shop/category-fashion.webp",
    alt: "Stack of African-print fabric beside white sneakers"
  },
  {
    key: "beauty-personal-care",
    slug: "beauty-personal-care",
    mode: "alt-only",
    expectedImageUrl: "/generated/shop/category-beauty.webp",
    alt: "Pink skincare bottles and jars with green leaves"
  }
];

const TARGETS: Target[] = [...GENERATED_TARGETS, ...REUSED_TARGETS, ...ALT_ONLY_TARGETS];

type LedgerEntry = {
  id: string;
  batch: string;
  categoryKey: string;
  categorySlug: string;
  status: string;
  taskId: string | null;
  credits: number | null;
  model: string;
  size: string;
  aspectRatio: string;
  generatedAt: string | null;
  reviewedAt?: string;
  review?: string;
  alt?: string;
  webpPath?: string;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  width?: number | null;
  height?: number | null;
  webpBytes?: number;
};

type Ledger = {
  model: string;
  size: string;
  assets: Array<LedgerEntry & { batch?: string }>;
  creditBatches?: Record<string, { reuse?: Array<Record<string, unknown>> }>;
};

type CategoryRow = {
  id: string;
  key: string | null;
  name: string;
  slug: string;
  parentId: string | null;
  level: number;
  isActive: boolean;
  isDemo: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
};

type Prepared = {
  target: Target;
  category: CategoryRow;
  ledger: LedgerEntry | null;
  imageUrl: string;
  imageAlt: string;
  bytes: number;
  provenance: {
    mode: "generated" | "reused" | "alt-only";
    sourceProductSlug?: string;
    sourceProductId?: string;
    taskId?: string | null;
    credits?: number | null;
    reviewedAt?: string;
    model?: string;
    size?: string;
    aspectRatio?: string;
  };
  alreadyApplied: boolean;
};

function fail(message: string): never {
  console.error(`BLOCKED: ${message}`);
  process.exit(2);
}

function sanitize(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://[redacted]")
    .replace(/\b(password|passwd|pwd)\s*=\s*[^;\s"'`]+/gi, "$1=[redacted]")
    .slice(0, 800);
}

function argvValue(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = argv.find((value) => value.startsWith(prefix));
  return arg?.slice(prefix.length).trim() || undefined;
}

function parseExpectedDatabase(argv: string[]): string {
  const expected = argvValue(argv, "expect-db");
  if (!expected) fail("--expect-db=<database-name> is required so the target cannot be guessed");
  if (!/^[A-Za-z0-9_]+$/.test(expected)) fail("--expect-db must contain only letters, digits and underscores");
  return expected;
}

function resolveReviewUrl(expectedDb: string): string {
  const url = process.env.REVIEW_DATABASE_URL;
  if (!url) fail("REVIEW_DATABASE_URL is required; DATABASE_URL is never used as a fallback");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail("REVIEW_DATABASE_URL is not a valid URL");
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) fail("REVIEW_DATABASE_URL must be a postgresql:// connection");
  const urlDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (urlDatabase !== expectedDb) {
    fail(`REVIEW_DATABASE_URL points at ${urlDatabase || "(no database)"} but --expect-db=${expectedDb}`);
  }
  return url;
}

function loadLedger(): Ledger {
  if (!existsSync(LEDGER_PATH)) fail("docs/taxonomy/generation-ledger.json is missing");
  let ledger: Ledger;
  try {
    ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Ledger;
  } catch (error) {
    fail(`cannot read generation ledger: ${sanitize(String(error))}`);
  }
  if (!Array.isArray(ledger.assets)) fail("generation ledger has no assets array");
  return ledger;
}

async function prepare(): Promise<{
  expectedDb: string;
  reviewUrl: string;
  ledger: Ledger;
  prepared: Prepared[];
}> {
  const argv = process.argv.slice(2);
  const expectedDb = parseExpectedDatabase(argv);
  const reviewUrl = resolveReviewUrl(expectedDb);
  const ledger = loadLedger();
  const prepared: Prepared[] = [];

  for (const target of TARGETS) {
    let imageUrl: string;
    let imageAlt: string;
    let bytes: number;
    let ledgerEntry: LedgerEntry | null = null;
    let provenance: Prepared["provenance"];

    if (target.mode === "generated") {
      const entry = ledger.assets.find(
        (candidate) =>
          candidate.batch === BATCH && candidate.categoryKey === target.key && candidate.id === `category-${target.key}`
      ) as LedgerEntry | undefined;
      if (!entry) fail(`${target.key}: no ${BATCH} ledger entry`);
      if (entry.status !== "generated") fail(`${target.key}: ledger status is ${entry.status}, not generated`);
      if (!entry.reviewedAt) fail(`${target.key}: asset has not been visually reviewed (reviewedAt missing)`);
      if (!entry.alt || entry.alt.trim().length === 0) fail(`${target.key}: ledger entry has no alt text`);
      if (entry.alt.length > MAX_ALT) fail(`${target.key}: alt text exceeds ${MAX_ALT} characters`);
      if (entry.categorySlug !== target.slug) {
        fail(`${target.key}: ledger slug ${entry.categorySlug} != expected ${target.slug}`);
      }
      const expectedPath = `/generated/taxonomy/category-${target.key}.webp`;
      if (entry.webpPath !== expectedPath) {
        fail(`${target.key}: ledger webpPath ${entry.webpPath} != expected ${expectedPath}`);
      }
      if (entry.webpBytes === undefined || entry.webpBytes <= 0) fail(`${target.key}: ledger has no WebP byte size`);
      imageUrl = entry.webpPath;
      imageAlt = entry.alt.trim();
      bytes = entry.webpBytes;
      ledgerEntry = entry;
      provenance = {
        mode: "generated",
        taskId: entry.taskId,
        credits: entry.credits,
        reviewedAt: entry.reviewedAt,
        model: entry.model,
        size: entry.size,
        aspectRatio: entry.aspectRatio
      };
    } else if (target.mode === "reused") {
      if (!target.sourceProductSlug || !target.sourcePath || !target.alt) {
        fail(`${target.key}: incomplete reuse definition`);
      }
      if (target.alt.length > MAX_ALT) fail(`${target.key}: alt text exceeds ${MAX_ALT} characters`);
      imageUrl = target.sourcePath;
      imageAlt = target.alt;
      bytes = 0;
      provenance = { mode: "reused", sourceProductSlug: target.sourceProductSlug };
    } else {
      if (!target.expectedImageUrl || !target.alt) {
        fail(`${target.key}: incomplete alt-only definition`);
      }
      if (target.alt.length > MAX_ALT) fail(`${target.key}: alt text exceeds ${MAX_ALT} characters`);
      imageUrl = target.expectedImageUrl;
      imageAlt = target.alt;
      bytes = 0;
      provenance = { mode: "alt-only" };
    }

    if (target.mode === "alt-only") {
      if (!imageUrl.startsWith("/generated/")) fail(`${target.key}: image path is not an approved project path`);
    } else if (!imageUrl.startsWith("/generated/taxonomy/")) {
      fail(`${target.key}: image path is not an approved taxonomy path`);
    }
    const absolute = path.resolve(process.cwd(), "public", imageUrl.replace(/^\/+/, ""));
    const publicRoot = path.resolve(process.cwd(), "public");
    if (!absolute.startsWith(`${publicRoot}${path.sep}`)) fail(`${target.key}: asset escapes public/`);
    if (!existsSync(absolute)) fail(`${target.key}: asset ${imageUrl} is missing from public/`);
    const meta = await sharp(absolute).metadata();
    if (meta.format !== "webp") fail(`${target.key}: ${imageUrl} is ${meta.format}, not WebP`);
    if (target.mode !== "alt-only" && (meta.width !== EXPECTED_WIDTH || meta.height !== EXPECTED_HEIGHT)) {
      fail(
        `${target.key}: ${imageUrl} is ${meta.width}x${meta.height}, expected ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}`
      );
    }
    if (bytes === 0) bytes = (await sharp(absolute).toBuffer()).byteLength;

    prepared.push({
      target,
      category: {} as CategoryRow,
      ledger: ledgerEntry,
      imageUrl,
      imageAlt,
      bytes,
      provenance,
      alreadyApplied: false
    });
  }
  return { expectedDb, reviewUrl, ledger, prepared };
}

async function loadCategories(client: Client, prepared: Prepared[]): Promise<void> {
  const keys = prepared.map((item) => item.target.key);
  const result = await client.query<CategoryRow>(
    `select id, key, name, slug, "parentId", level, "isActive", "isDemo", "imageUrl", "imageAlt"
       from "Category"
      where key = any($1::text[])`,
    [keys]
  );
  for (const item of prepared) {
    const matches = result.rows.filter((row) => row.key === item.target.key);
    if (matches.length !== 1) {
      fail(`${item.target.key}: expected exactly one Category with that key, found ${matches.length}`);
    }
    const category = matches[0];
    if (category.slug !== item.target.slug) {
      fail(`${item.target.key}: live slug is ${category.slug}, expected ${item.target.slug}`);
    }
    if (category.level !== 1) fail(`${item.target.key}: live level is ${category.level}, expected 1 (category)`);
    if (!category.isActive) fail(`${item.target.key}: category is inactive`);
    if (category.isDemo && item.target.mode !== "alt-only") {
      fail(`${item.target.key}: category is flagged isDemo; refusing to treat it as a real category`);
    }
    if (!category.parentId) fail(`${item.target.key}: category has no department parent`);
    const parent = await client.query<{ level: number; isActive: boolean; isDemo: boolean }>(
      'select level, "isActive", "isDemo" from "Category" where id = $1',
      [category.parentId]
    );
    const parentRow = parent.rows[0];
    if (!parentRow) fail(`${item.target.key}: department parent is missing`);
    if (parentRow.level !== 0) fail(`${item.target.key}: parent level is ${parentRow.level}, expected 0 (department)`);
    if (!parentRow.isActive) fail(`${item.target.key}: department parent is inactive`);
    if (parentRow.isDemo) fail(`${item.target.key}: department parent is flagged isDemo`);
    if (item.target.mode === "alt-only") {
      if (category.imageUrl !== item.imageUrl) {
        fail(
          `${item.target.key}: approved art is ${category.imageUrl}; expected ${item.imageUrl}. Alt text is not applied to different art`
        );
      }
      if (category.imageAlt && category.imageAlt !== item.imageAlt) {
        fail(`${item.target.key}: already has different alt text (${category.imageAlt}); refusing to overwrite`);
      }
      item.alreadyApplied = category.imageAlt === item.imageAlt;
    } else {
      if (category.imageUrl && category.imageUrl !== item.imageUrl) {
        fail(
          `${item.target.key}: already has different art (${category.imageUrl}); refusing to overwrite unknown imagery`
        );
      }
      item.alreadyApplied = category.imageUrl === item.imageUrl && category.imageAlt === item.imageAlt;
    }
    item.category = category;
  }
}

async function verifyReuse(client: Client, item: Prepared): Promise<void> {
  if (item.target.mode !== "reused") return;
  const slug = item.target.sourceProductSlug;
  const result = await client.query<{
    productId: string;
    productStatus: string;
    categoryId: string;
    imageUrl: string;
    inSubtree: boolean;
    isFirstImage: boolean;
  }>(
    `with recursive subtree as (
        select id from "Category" where id = $1
        union all
        select child.id from "Category" child join subtree parent on child."parentId" = parent.id
      )
      select p.id as "productId", p.status::text as "productStatus", p."categoryId",
             pi.url as "imageUrl",
             (p."categoryId" in (select id from subtree)) as "inSubtree",
             (pi."sortOrder" = (select min(pi2."sortOrder") from "ProductImage" pi2 where pi2."productId" = p.id)
              and pi.id = (select pi3.id from "ProductImage" pi3 where pi3."productId" = p.id
                           order by pi3."sortOrder" asc, pi3.id asc limit 1)) as "isFirstImage"
        from "Product" p
        join "ProductImage" pi on pi."productId" = p.id
       where p.slug = $2`,
    [item.category.id, slug]
  );
  if (result.rows.length !== 1) {
    fail(`${item.target.key}: reuse source product ${slug} must have exactly one image row, found ${result.rows.length}`);
  }
  const row = result.rows[0];
  if (row.productStatus !== "ACTIVE") fail(`${item.target.key}: reuse source product ${slug} is ${row.productStatus}`);
  if (!row.inSubtree) fail(`${item.target.key}: reuse source product ${slug} is outside the category subtree`);
  if (!row.isFirstImage) fail(`${item.target.key}: reuse source ${slug} image is not the product's first image`);
  if (row.imageUrl !== item.imageUrl) {
    fail(`${item.target.key}: live product image ${row.imageUrl} != recorded source ${item.imageUrl}`);
  }
  item.provenance.sourceProductId = row.productId;
}

type Fingerprints = {
  otherCategories: string;
  activeLevelOne: number;
  totalLevelOne: number;
  products: string;
  productImages: string;
};

async function fingerprints(client: Client, targetIds: string[]): Promise<Fingerprints> {
  const value = async (sql: string, params: unknown[]): Promise<string> => {
    const result = await client.query<{ value: string | null }>(sql, params);
    return result.rows[0]?.value ?? "";
  };
  const counts = await client.query<{ active: number; total: number }>(
    `select count(*) filter (where "isActive")::int as active, count(*)::int as total
       from "Category" where level = 1`
  );
  return {
    otherCategories: await value(
      `select md5(coalesce(string_agg(
          id || ':' || coalesce(key, '') || ':' || slug || ':' || name || ':' || coalesce("parentId", '') || ':' ||
          level::text || ':' || "isActive"::text || ':' || "isSelectable"::text || ':' || coalesce("imageUrl", '') || ':' ||
          coalesce("imageAlt", ''), '|' order by id), '')) as value
         from "Category"
        where not (id = any($1::text[]))`,
      [targetIds]
    ),
    activeLevelOne: counts.rows[0]?.active ?? 0,
    totalLevelOne: counts.rows[0]?.total ?? 0,
    products: await value(
      `select md5(coalesce(string_agg(
          id || ':' || slug || ':' || status || ':' || "categoryId" || ':' || "priceKobo"::text || ':' ||
          "isDemo"::text, '|' order by id), '')) as value
         from "Product"`,
      []
    ),
    productImages: await value(
      `select md5(coalesce(string_agg(id || ':' || "productId" || ':' || url || ':' || coalesce(alt, ''), '|' order by id), '')) as value
         from "ProductImage"`,
      []
    )
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const jsonOutput = argv.includes("--json");
  const { expectedDb, reviewUrl, prepared } = await prepare();

  const client = new Client({
    connectionString: reviewUrl,
    connectionTimeoutMillis: 8000,
    application_name: "naijadeals-apply-category-images"
  });

  let inTransaction = false;
  try {
    await client.connect();
    const identity = await client.query<{ database: string }>("select current_database() as database");
    const actualDb = identity.rows[0]?.database ?? "";
    if (actualDb !== expectedDb) fail(`connected to ${actualDb || "(unknown)"} instead of ${expectedDb}`);
    const classification = await client.query<{ classification: string }>(
      'select classification from "DatabaseClassification"'
    );
    if (!classification.rows.some((row) => row.classification === "REVIEW")) {
      fail(`${actualDb} is not classified REVIEW`);
    }

    await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
    inTransaction = true;
    const readOnly = await client.query<{ transaction_read_only: string }>("show transaction_read_only");
    if (!apply && readOnly.rows[0]?.transaction_read_only !== "on") {
      fail("dry run transaction is not read-only; refusing to continue");
    }

    await loadCategories(client, prepared);
    for (const item of prepared) {
      await verifyReuse(client, item);
    }
    const targetIds = prepared.map((item) => item.category.id);
    const before = await fingerprints(client, targetIds);

    const writes: Array<{ id: string; key: string; imageUrl: string; imageAlt: string }> = [];
    if (apply) {
      for (const item of prepared) {
        if (item.alreadyApplied) continue;
        const updated =
          item.target.mode === "alt-only"
            ? await client.query<{ id: string }>(
                `update "Category"
                    set "imageAlt" = $2
                  where id = $1
                    and "imageUrl" = $3
                    and ("imageAlt" is null or "imageAlt" = $2)
                  returning id`,
                [item.category.id, item.imageAlt, item.imageUrl]
              )
            : await client.query<{ id: string }>(
                `update "Category"
                    set "imageUrl" = $2, "imageAlt" = $3
                  where id = $1
                    and ("imageUrl" is null or "imageUrl" = $2)
                    and ("imageAlt" is null or "imageAlt" = $3)
                  returning id`,
                [item.category.id, item.imageUrl, item.imageAlt]
              );
        if (updated.rowCount !== 1) {
          throw new Error(`${item.target.key}: conditional update matched ${updated.rowCount} rows`);
        }
        const metadata = {
          categoryKey: item.target.key,
          categorySlug: item.target.slug,
          categoryName: item.category.name,
          mode: item.target.mode,
          previous: { imageUrl: item.category.imageUrl, imageAlt: item.category.imageAlt },
          next: { imageUrl: item.imageUrl, imageAlt: item.imageAlt },
          asset: {
            webpPath: item.imageUrl,
            width: item.target.mode === "alt-only" ? null : EXPECTED_WIDTH,
            height: item.target.mode === "alt-only" ? null : EXPECTED_HEIGHT,
            dimensions: item.target.mode === "alt-only" ? "pre-existing approved art; unchanged" : `${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}`,
            bytes: item.bytes,
            sourceWidth: item.ledger?.sourceWidth ?? null,
            sourceHeight: item.ledger?.sourceHeight ?? null
          },
          provenance: item.provenance,
          generation:
            item.target.mode === "generated" && item.ledger
              ? {
                  batch: BATCH,
                  ledgerId: item.ledger.id,
                  model: item.ledger.model,
                  size: item.ledger.size,
                  aspectRatio: item.ledger.aspectRatio,
                  taskId: item.ledger.taskId,
                  credits: item.ledger.credits,
                  generatedAt: item.ledger.generatedAt,
                  reviewedAt: item.ledger.reviewedAt
                }
              : null,
          source: "scripts/apply-category-images.ts",
          database: expectedDb
        };
        await client.query(
          `insert into "AuditLog" (id, "actorId", action, entity, "entityId", metadata, "createdAt")
           values ($1, null, $2, 'Category', $3, $4::jsonb, now())`,
          [randomUUID(), ACTION, item.category.id, JSON.stringify(metadata)]
        );
        await client.query(
          `insert into "SystemEvent" (id, "actorId", type, entity, "entityId", payload, "createdAt")
           values ($1, null, $2, 'Category', $3, $4::jsonb, now())`,
          [randomUUID(), ACTION, item.category.id, JSON.stringify(metadata)]
        );
        writes.push({
          id: item.category.id,
          key: item.target.key,
          imageUrl: item.imageUrl,
          imageAlt: item.imageAlt
        });
      }
    }

    const after = await fingerprints(client, targetIds);
    const drift =
      before.otherCategories !== after.otherCategories ||
      before.activeLevelOne !== after.activeLevelOne ||
      before.totalLevelOne !== after.totalLevelOne ||
      before.products !== after.products ||
      before.productImages !== after.productImages;

    if (drift) {
      await client.query("ROLLBACK");
      inTransaction = false;
      fail("unrelated Category/Product/ProductImage rows changed during the transaction; rolled back");
    }

    const report = {
      database: expectedDb,
      mode: apply ? "apply" : "dry-run",
      batch: BATCH,
      targets: prepared.map((item) => ({
        key: item.target.key,
        id: item.category.id,
        name: item.category.name,
        slug: item.category.slug,
        mode: item.target.mode,
        before: { imageUrl: item.category.imageUrl, imageAlt: item.category.imageAlt },
        after: { imageUrl: item.imageUrl, imageAlt: item.imageAlt },
        state: item.alreadyApplied ? "already applied" : apply ? "updated" : "would update",
        provenance: item.provenance
      })),
      counts: {
        targets: prepared.length,
        generated: prepared.filter((item) => item.target.mode === "generated").length,
        reused: prepared.filter((item) => item.target.mode === "reused").length,
        altOnly: prepared.filter((item) => item.target.mode === "alt-only").length,
        alreadyApplied: prepared.filter((item) => item.alreadyApplied).length
      },
      writeCount: writes.length,
      fingerprints: {
        otherCategories: before.otherCategories,
        activeLevelOne: before.activeLevelOne,
        totalLevelOne: before.totalLevelOne,
        products: before.products,
        productImages: before.productImages,
        unchangedDuringTransaction: !drift
      }
    };

    await client.query(apply ? "COMMIT" : "ROLLBACK");
    inTransaction = false;

    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`database: ${expectedDb} (${apply ? "APPLY" : "DRY RUN — no writes"})`);
      for (const row of report.targets) {
        console.log(`${row.state.padEnd(13)} ${row.mode.padEnd(9)} ${row.key.padEnd(30)} -> ${row.after.imageUrl}`);
      }
      console.log(
        `targets: ${report.counts.targets} (generated ${report.counts.generated}, reused ${report.counts.reused}, alt-only ${report.counts.altOnly}, already applied ${report.counts.alreadyApplied})`
      );
      console.log(`rows written: ${report.writeCount}; other rows unchanged: ${report.fingerprints.unchangedDuringTransaction}`);
    }
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`FAIL: ${sanitize(error instanceof Error ? error.message : String(error))}`);
  process.exit(1);
});
