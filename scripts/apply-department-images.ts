#!/usr/bin/env node
/**
 * Guarded application of the six approved department banner images.
 *
 * Sets Category.imageUrl and Category.imageAlt for exactly these departments:
 *   health-wellness, baby-kids-toys, sports-outdoors, automotive-motorcycle,
 *   tools-building (slug tools-building-materials), books-stationery
 *
 * Default is a dry run: it validates the generated assets, the ledger review
 * state and the live REVIEW rows, then prints the before -> after report.
 *
 * `--apply` updates the six rows in ONE transaction and writes an AuditLog row
 * and a SystemEvent row for each change in that same transaction. Re-running is
 * safe: a row already holding the approved imageUrl/imageAlt is reported as
 * already applied and skipped. If any fingerprint of the other Category rows,
 * Product rows or ProductImage rows changes during the transaction, the whole
 * transaction is rolled back and the script fails.
 *
 * Safety rules:
 *  - REVIEW_DATABASE_URL is mandatory; DATABASE_URL is never a fallback.
 *  - --expect-db must match the URL database and the live current_database().
 *  - DatabaseClassification must explicitly contain REVIEW.
 *  - Every target must be an active, non-demo, level-0 department with the
 *    expected unique key and slug.
 *  - A target is only written when imageUrl is NULL (or already equal). Any
 *    other existing image is treated as unknown art and blocks the run; it is
 *    never overwritten.
 *  - imageAlt must be 1..220 characters; imageUrl must resolve to an existing
 *    WebP inside public/ with the recorded 1600x900 dimensions.
 *  - The generation ledger entry must be status=generated and reviewed. An
 *    unreviewed or retried asset blocks the run.
 *  - Only Category.imageUrl / imageAlt change for the six targets.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/apply-department-images.ts --expect-db=naijadeals_review
 *
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/apply-department-images.ts --expect-db=naijadeals_review --apply
 *
 *   Optional: --json
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import sharp from "sharp";

const LEDGER_PATH = path.resolve(process.cwd(), "docs", "taxonomy", "generation-ledger.json");
const BATCH = "taxonomy-departments";
const ACTION = "taxonomy.department.image";
const MAX_ALT = 220;
const EXPECTED_WIDTH = 1600;
const EXPECTED_HEIGHT = 900;

type Target = {
  key: string;
  slug: string;
};

const TARGETS: Target[] = [
  { key: "health-wellness", slug: "health-wellness" },
  { key: "baby-kids-toys", slug: "baby-kids-toys" },
  { key: "sports-outdoors", slug: "sports-outdoors" },
  { key: "automotive-motorcycle", slug: "automotive-motorcycle" },
  { key: "tools-building", slug: "tools-building-materials" },
  { key: "books-stationery", slug: "books-stationery" }
];

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
  ledger: LedgerEntry;
  imageUrl: string;
  imageAlt: string;
  bytes: number;
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
    const entry = ledger.assets.find(
      (candidate) => candidate.batch === BATCH && candidate.categoryKey === target.key
    ) as LedgerEntry | undefined;
    if (!entry) fail(`${target.key}: no ${BATCH} ledger entry`);
    if (entry.status !== "generated") fail(`${target.key}: ledger status is ${entry.status}, not generated`);
    if (!entry.reviewedAt) fail(`${target.key}: asset has not been visually reviewed (reviewedAt missing)`);
    if (!entry.alt || entry.alt.trim().length === 0) fail(`${target.key}: ledger entry has no alt text`);
    if (entry.alt.length > MAX_ALT) fail(`${target.key}: alt text exceeds ${MAX_ALT} characters`);
    if (entry.categorySlug !== target.slug) fail(`${target.key}: ledger slug ${entry.categorySlug} != expected ${target.slug}`);
    if (!entry.webpPath || !entry.webpPath.startsWith("/generated/taxonomy/")) {
      fail(`${target.key}: ledger webpPath is not an approved taxonomy path`);
    }
    if (entry.webpBytes === undefined || entry.webpBytes <= 0) fail(`${target.key}: ledger has no WebP byte size`);
    const absolute = path.resolve(process.cwd(), "public", entry.webpPath.replace(/^\/+/, ""));
    const publicRoot = path.resolve(process.cwd(), "public");
    if (!absolute.startsWith(`${publicRoot}${path.sep}`)) fail(`${target.key}: asset escapes public/`);
    if (!existsSync(absolute)) fail(`${target.key}: asset ${entry.webpPath} is missing from public/`);
    const meta = await sharp(absolute).metadata();
    if (meta.format !== "webp") fail(`${target.key}: ${entry.webpPath} is ${meta.format}, not WebP`);
    if (meta.width !== EXPECTED_WIDTH || meta.height !== EXPECTED_HEIGHT) {
      fail(`${target.key}: ${entry.webpPath} is ${meta.width}x${meta.height}, expected ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}`);
    }
    prepared.push({
      target,
      category: {} as CategoryRow,
      ledger: entry,
      imageUrl: entry.webpPath,
      imageAlt: entry.alt.trim(),
      bytes: entry.webpBytes,
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
    if (category.slug !== item.target.slug) fail(`${item.target.key}: live slug is ${category.slug}, expected ${item.target.slug}`);
    if (category.level !== 0) fail(`${item.target.key}: live level is ${category.level}, expected 0 (department)`);
    if (!category.isActive) fail(`${item.target.key}: department is inactive`);
    if (category.isDemo) fail(`${item.target.key}: department is flagged isDemo; refusing to treat it as a real department`);
    if (category.parentId !== null) fail(`${item.target.key}: department has a parent`);
    if (category.imageUrl && category.imageUrl !== item.imageUrl) {
      fail(
        `${item.target.key}: already has different art (${category.imageUrl}); refusing to overwrite unknown imagery`
      );
    }
    item.category = category;
    item.alreadyApplied = category.imageUrl === item.imageUrl && category.imageAlt === item.imageAlt;
  }
}

type Fingerprints = {
  otherCategories: string;
  activeProducts: number;
  products: string;
  productImages: string;
};

async function fingerprints(client: Client, targetIds: string[]): Promise<Fingerprints> {
  const value = async (sql: string, params: unknown[]): Promise<string> => {
    const result = await client.query<{ value: string | null }>(sql, params);
    return result.rows[0]?.value ?? "";
  };
  const active = await client.query<{ count: number }>(
    `select count(*)::int as count from "Product" where status = 'ACTIVE'`
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
    activeProducts: active.rows[0]?.count ?? 0,
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
    application_name: "naijadeals-apply-department-images"
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
    const targetIds = prepared.map((item) => item.category.id);
    const before = await fingerprints(client, targetIds);

    const writes: Array<{ id: string; imageUrl: string; imageAlt: string }> = [];
    if (apply) {
      for (const item of prepared) {
        if (item.alreadyApplied) continue;
        const updated = await client.query<{ id: string }>(
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
          departmentKey: item.target.key,
          departmentSlug: item.target.slug,
          departmentName: item.category.name,
          previous: { imageUrl: item.category.imageUrl, imageAlt: item.category.imageAlt },
          next: { imageUrl: item.imageUrl, imageAlt: item.imageAlt },
          asset: {
            webpPath: item.imageUrl,
            width: EXPECTED_WIDTH,
            height: EXPECTED_HEIGHT,
            bytes: item.bytes,
            sourceWidth: item.ledger.sourceWidth ?? null,
            sourceHeight: item.ledger.sourceHeight ?? null
          },
          generation: {
            batch: BATCH,
            ledgerId: item.ledger.id,
            model: item.ledger.model,
            size: item.ledger.size,
            aspectRatio: item.ledger.aspectRatio,
            taskId: item.ledger.taskId,
            credits: item.ledger.credits,
            generatedAt: item.ledger.generatedAt,
            reviewedAt: item.ledger.reviewedAt
          },
          source: "scripts/apply-department-images.ts",
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
        writes.push({ id: item.category.id, imageUrl: item.imageUrl, imageAlt: item.imageAlt });
      }
    }

    const after = await fingerprints(client, targetIds);
    const drift =
      before.otherCategories !== after.otherCategories ||
      before.activeProducts !== after.activeProducts ||
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
      targets: prepared.map((item) => ({
        key: item.target.key,
        id: item.category.id,
        name: item.category.name,
        slug: item.category.slug,
        before: { imageUrl: item.category.imageUrl, imageAlt: item.category.imageAlt },
        after: { imageUrl: item.imageUrl, imageAlt: item.imageAlt },
        state: item.alreadyApplied ? "already applied" : apply ? "updated" : "would update",
        ledgerTaskId: item.ledger.taskId,
        credits: item.ledger.credits,
        reviewedAt: item.ledger.reviewedAt
      })),
      writeCount: writes.length,
      fingerprints: {
        otherCategories: before.otherCategories,
        activeProducts: before.activeProducts,
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
        console.log(
          `${row.state.padEnd(13)} ${row.key.padEnd(26)} -> ${row.after.imageUrl}  |  ${row.after.imageAlt}`
        );
      }
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
