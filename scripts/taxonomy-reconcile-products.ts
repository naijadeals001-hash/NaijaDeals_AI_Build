#!/usr/bin/env node
/**
 * READ-ONLY active-product reconciliation for the REVIEW catalogue.
 *
 * Proves the reviewed arithmetic:
 *   63 active = 31 accepted baseline + 6 Batch A + 4 Batch B + 8 taxonomy batch
 *              + 8 Batch 2
 *
 * The script opens an explicit READ ONLY transaction, prints every active
 * product with its id, creation time (UTC and local), department, category and
 * DEMO/legacy classification evidence, and fails when the batches, counts or
 * fixture rules do not match. It never inserts, updates or deletes anything:
 * there is no write statement in this file, and the transaction is read-only.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/taxonomy-reconcile-products.ts --expect-db=naijadeals_review
 *
 *   Add --json for a machine-readable summary.
 */
import { Client } from "pg";

/**
 * Accepted batches with their creation windows in UTC. The windows are wide
 * enough to tolerate clock skew between the seller and admin sessions that
 * produced them, and narrow enough to reject an unplanned product appearing in
 * any of them. Batch A and Batch B are only eight minutes apart, while the
 * accepted baseline contains two creation runs more than two hours apart, so
 * windows are used instead of gap clustering.
 *
 * Batch 2 is deliberately one batch, not a taxonomy batch alias: the label
 * must appear exactly once so the active-product arithmetic cannot double count it.
 */
const EXPECTED_BATCHES: ReadonlyArray<{
  label: string;
  expected: number;
  from: string | null;
  to: string | null;
}> = [
  { label: "accepted-baseline", expected: 31, from: null, to: "2026-11-13T18:00:00.000Z" },
  { label: "batch-a", expected: 6, from: "2026-11-13T18:00:00.000Z", to: "2026-11-13T18:40:00.000Z" },
  { label: "batch-b", expected: 4, from: "2026-11-13T18:40:00.000Z", to: "2026-11-13T19:30:00.000Z" },
  { label: "taxonomy-batch", expected: 8, from: "2026-11-13T19:30:00.000Z", to: "2026-11-13T21:00:00.000Z" },
  { label: "batch-2", expected: 8, from: "2026-11-13T21:00:00.000Z", to: "2026-11-15T01:39:59.000Z" },
  { label: "batch-3", expected: 6, from: "2026-11-15T01:39:59.000Z", to: null }
];

const EXPECTED_ACTIVE_TOTAL = 63;
const EXPECTED_PRE_BATCH2_TOTAL = 49;
const FIXTURE_PATTERN =
  /(^|[^a-z])(qa|test|fixture|acceptance|dummy|sample|placeholder|probe)([^a-z]|$)/i;
const CRF_PATTERN = /(^|[^a-z])crf([^a-z]|$)/i;

type CategoryRow = {
  id: string;
  key: string | null;
  name: string;
  slug: string;
  parentId: string | null;
  level: number;
  isSelectable: boolean;
  isDemo: boolean;
  isActive: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  status: string;
  isDemo: boolean;
  isSample: boolean;
  createdAt: Date;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  categoryKey: string | null;
  categorySelectable: boolean;
  images: number;
  stockRows: number;
  vendorName: string;
};

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(2);
}

function sanitize(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://[redacted]")
    .replace(/\b(password|passwd|pwd)\s*=\s*[^;\s"'`]+/gi, "$1=[redacted]")
    .slice(0, 800);
}

function parseExpectedDatabase(argv: string[]): string {
  const arg = argv.find((value) => value.startsWith("--expect-db="));
  const expected = arg?.slice("--expect-db=".length).trim();
  if (!expected) {
    fail("--expect-db=<database-name> is required so the target cannot be guessed");
  }
  if (!/^[A-Za-z0-9_]+$/.test(expected)) {
    fail("--expect-db must contain only letters, digits and underscores");
  }
  return expected;
}

function resolveReviewUrl(expectedDb: string): string {
  const url = process.env.REVIEW_DATABASE_URL;
  if (!url) {
    fail("REVIEW_DATABASE_URL is required; DATABASE_URL is never used as a fallback");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail("REVIEW_DATABASE_URL is not a valid URL");
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    fail("REVIEW_DATABASE_URL must be a postgresql:// connection");
  }
  const urlDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (urlDatabase !== expectedDb) {
    fail(`REVIEW_DATABASE_URL points at ${urlDatabase || "(no database)"} but --expect-db=${expectedDb}`);
  }
  return url;
}

function pathOf(category: CategoryRow | undefined, byId: Map<string, CategoryRow>): CategoryRow[] {
  const chain: CategoryRow[] = [];
  const seen = new Set<string>();
  let cursor = category;
  while (cursor) {
    if (seen.has(cursor.id)) throw new Error(`category cycle at ${cursor.slug}`);
    seen.add(cursor.id);
    chain.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return chain;
}

function formatLocal(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const pad = (value: number) => String(Math.abs(value)).padStart(2, "0");
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const minutes = Math.abs(offsetMinutes) % 60;
  return `${date.toISOString()} (local UTC${sign}${pad(hours)}:${pad(minutes)})`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const jsonOutput = argv.includes("--json");
  const expectedDb = parseExpectedDatabase(argv);
  const reviewUrl = resolveReviewUrl(expectedDb);

  const client = new Client({
    connectionString: reviewUrl,
    connectionTimeoutMillis: 8000,
    application_name: "naijadeals-taxonomy-reconcile"
  });
  let inTransaction = false;

  try {
    await client.connect();

    const identity = await client.query<{ database: string }>(
      "select current_database() as database"
    );
    const actualDb = identity.rows[0]?.database ?? "";
    if (actualDb !== expectedDb) {
      fail(`connected to ${actualDb || "(unknown)"} instead of ${expectedDb}`);
    }
    const classification = await client.query<{ classification: string }>(
      'select classification from "DatabaseClassification"'
    );
    if (!classification.rows.some((row) => row.classification === "REVIEW")) {
      fail(`${actualDb} is not classified REVIEW`);
    }

    await client.query("BEGIN READ ONLY");
    inTransaction = true;
    const readOnly = await client.query<{ transaction_read_only: string }>(
      "show transaction_read_only"
    );
    if (readOnly.rows[0]?.transaction_read_only !== "on") {
      fail("transaction is not read-only; refusing to continue");
    }

    const categories = await client.query<CategoryRow>(
      `select c.id, c.key, c.name, c.slug, c."parentId", c.level,
              c."isSelectable", c."isDemo", c."isActive"
         from "Category" c`
    );
    const byId = new Map(categories.rows.map((row) => [row.id, row]));

    const products = await client.query<{
      id: string;
      name: string;
      status: string;
      isDemo: boolean;
      isSample: boolean;
      createdAt: Date;
      categoryId: string;
      categoryName: string;
      categorySlug: string;
      categoryKey: string | null;
      categorySelectable: boolean;
      images: number;
      stockRows: number;
      vendorName: string;
    }>(
      `select p.id, p.name, p.status, p."isDemo", p."isSample", p."createdAt",
              c.id as "categoryId", c.name as "categoryName", c.slug as "categorySlug",
              c.key as "categoryKey", c."isSelectable" as "categorySelectable",
              (select count(*)::int from "ProductImage" i where i."productId" = p.id) as images,
              (select count(*)::int from "InventoryStock" s where s."productId" = p.id) as "stockRows",
              v.name as "vendorName"
         from "Product" p
         join "Category" c on c.id = p."categoryId"
         join "Vendor" v on v.id = p."vendorId"
        where p.status = 'ACTIVE'
        order by p."createdAt" asc, p.id asc`
    );

    const active = products.rows as ProductRow[];
    if (active.length !== EXPECTED_ACTIVE_TOTAL) {
      fail(`expected ${EXPECTED_ACTIVE_TOTAL} active products, found ${active.length}`);
    }

    const batchFor = (createdAt: Date): (typeof EXPECTED_BATCHES)[number] | undefined => {
      const time = createdAt.getTime();
      return EXPECTED_BATCHES.find((batch) => {
        const fromOk = batch.from === null || time >= Date.parse(batch.from);
        const toOk = batch.to === null || time < Date.parse(batch.to);
        return fromOk && toOk;
      });
    };

    const grouped = new Map<string, ProductRow[]>();
    for (const batch of EXPECTED_BATCHES) grouped.set(batch.label, []);
    const unbatched: ProductRow[] = [];
    for (const product of active) {
      const batch = batchFor(product.createdAt);
      if (!batch) unbatched.push(product);
      else grouped.get(batch.label)?.push(product);
    }

    const problems: string[] = [];
    if (unbatched.length > 0) {
      problems.push(
        `${unbatched.length} active product(s) fall outside every accepted batch: ` +
          unbatched.map((product) => `${product.id} @ ${product.createdAt.toISOString()}`).join(", ")
      );
    }

    const batches = EXPECTED_BATCHES.map((expected) => {
      const cluster = grouped.get(expected.label) ?? [];
      const first = cluster[0];
      const last = cluster[cluster.length - 1];
      if (cluster.length !== expected.expected) {
        problems.push(
          `${expected.label}: expected ${expected.expected} products, found ${cluster.length}`
        );
      }
      const departments = new Set<string>();
      for (const product of cluster) {
        const category = byId.get(product.categoryId);
        const chain = pathOf(category, byId);
        departments.add(chain[0]?.name ?? "(no department)");
      }
      return {
        label: expected.label,
        expected: expected.expected,
        count: cluster.length,
        window: `${expected.from ?? "(start)"} -> ${expected.to ?? "(open)"}`,
        firstCreatedAt: first ? formatLocal(first.createdAt) : "(none)",
        lastCreatedAt: last ? formatLocal(last.createdAt) : "(none)",
        departments: [...departments].sort()
      };
    });

    const batchLabels = EXPECTED_BATCHES.map((batch) => batch.label);
    if (new Set(batchLabels).size !== batchLabels.length) {
      problems.push("accepted batch labels are not unique");
    }
    if (batchLabels.filter((label) => /^batch-2$/.test(label)).length !== 1) {
      problems.push("Batch 2 must appear exactly once in the accepted batches");
    }

    const batch2Index = batches.findIndex((batch) => /^batch-2$/.test(batch.label));
    const preBatch2 = batches
      .slice(0, batch2Index < 0 ? batches.length : batch2Index)
      .reduce((sum, batch) => sum + batch.count, 0);
    if (preBatch2 !== EXPECTED_PRE_BATCH2_TOTAL) {
      problems.push(
        `pre-Batch-2 batches total ${preBatch2}; expected ${EXPECTED_PRE_BATCH2_TOTAL}`
      );
    }

    const rows = active.map((product) => {
      const category = byId.get(product.categoryId);
      const chain = pathOf(category, byId);
      const batchLabel = batchFor(product.createdAt)?.label ?? "(unbatched)";
      const fixtureLike = product.isSample || FIXTURE_PATTERN.test(product.name);
      if (fixtureLike) {
        problems.push(`active acceptance fixture or sample: ${product.id} "${product.name}"`);
      }
      if (!category?.isSelectable) {
        problems.push(`active product ${product.id} sits on non-selectable ${product.categorySlug}`);
      }
      if (product.images === 0) {
        problems.push(`active product ${product.id} has no image`);
      }
      if (product.stockRows === 0) {
        problems.push(`active product ${product.id} has no inventory row`);
      }
      return {
        batch: batchLabel,
        productId: product.id,
        name: product.name,
        createdAtUtc: product.createdAt.toISOString(),
        createdAtLocal: formatLocal(product.createdAt),
        department: chain[0]?.name ?? null,
        departmentKey: chain[0]?.key ?? null,
        category: product.categoryName,
        categorySlug: product.categorySlug,
        classification: product.isDemo ? "DEMO" : "LIVE",
        legacyDemoCatalogue: batchLabel === "accepted-baseline",
        isDemo: product.isDemo,
        isSample: product.isSample,
        images: product.images,
        stockRows: product.stockRows,
        vendor: product.vendorName,
        fixtureLike
      };
    });

    const statuses = await client.query<{ status: string; count: number; fixtures: number }>(
      `select status,
              count(*)::int as count,
              count(*) filter (
                where "isSample" or name ~* '(^|[^a-z])(qa|test|fixture|acceptance|dummy|sample|placeholder|probe)([^a-z]|$)'
              )::int as fixtures
         from "Product"
        group by status
        order by status`
    );
    const categoryRequests = await client.query<{ status: string; count: number }>(
      `select status, count(*)::int as count from "CategoryRequest" group by status order by status`
    );
    const crfCategories = await client.query<{ count: number }>(
      `select count(*)::int as count from "Category"
        where name ~* '(^|[^a-z])crf([^a-z]|$)'`
    );
    const crfRequests = await client.query<{ count: number }>(
      `select count(*)::int as count from "CategoryRequest"
        where "suggestedName" ~* '(^|[^a-z])crf([^a-z]|$)'`
    );
    const crfCategoryNames = crfCategories.rows[0]?.count ?? 0;
    const crfRequestNames = crfRequests.rows[0]?.count ?? 0;
    if (crfCategoryNames !== 0) {
      problems.push(`CRF category names present: ${crfCategoryNames}`);
    }
    if (crfRequestNames !== 0) {
      problems.push(`CRF category-request names present: ${crfRequestNames}`);
    }
    const imagesTotal = await client.query<{ total: number }>(
      'select count(*)::int as total from "ProductImage"'
    );
    const stockTotal = await client.query<{ total: number }>(
      'select count(*)::int as total from "InventoryStock"'
    );

    await client.query("ROLLBACK");
    inTransaction = false;

    const summary = {
      database: actualDb,
      classification: "REVIEW",
      readOnly: true,
      transactionReadOnly: readOnly.rows[0]?.transaction_read_only,
      writesAttempted: 0,
      productsWritten: 0,
      active: {
        total: active.length,
        expected: EXPECTED_ACTIVE_TOTAL,
        preBatch2: preBatch2,
        expectedPreBatch2: EXPECTED_PRE_BATCH2_TOTAL,
        taxonomyBatch: batches.find((batch) => batch.label === "taxonomy-batch")?.count ?? 0,
        batch2: batches.find((batch) => batch.label === "batch-2")?.count ?? 0,
        batch3: batches.find((batch) => batch.label === "batch-3")?.count ?? 0,
        demo: rows.filter((row) => row.isDemo).length,
        live: rows.filter((row) => !row.isDemo).length
      },
      batches: batches.map((batch, index) => ({
        ...batch,
        label: EXPECTED_BATCHES[index]?.label ?? batch.label
      })),
      batchLabels,
      statuses: statuses.rows,
      categoryRequests: categoryRequests.rows,
      crf: {
        categoryNames: crfCategoryNames,
        categoryRequestNames: crfRequestNames
      },
      nonPublic: {
        drafts: statuses.rows.find((row) => row.status === "DRAFT")?.count ?? 0,
        archived: statuses.rows.find((row) => row.status === "ARCHIVED")?.count ?? 0,
        draftFixtures: statuses.rows.find((row) => row.status === "DRAFT")?.fixtures ?? 0,
        archivedFixtures: statuses.rows.find((row) => row.status === "ARCHIVED")?.fixtures ?? 0
      },
      totals: {
        images: imagesTotal.rows[0]?.total ?? 0,
        stockRows: stockTotal.rows[0]?.total ?? 0
      },
      rows,
      result: problems.length === 0 ? "PASS" : "FAIL",
      problems
    };

    if (jsonOutput) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`REVIEW active-product reconciliation — ${actualDb} (classification REVIEW)`);
      console.log(
        `Read-only transaction: ${summary.transactionReadOnly}; writes attempted: 0; products written: 0`
      );
      console.log("");
      for (const batch of batches) {
        console.log(
          `${batch.label.padEnd(18)} ${String(batch.count).padStart(2)} (expected ${batch.expected})  ` +
            `${batch.firstCreatedAt} -> ${batch.lastCreatedAt}`
        );
        console.log(`  window: ${batch.window}`);
        console.log(`  departments: ${batch.departments.join(" | ")}`);
      }
      console.log("");
      console.log("Active products (department | category | classification | id | created | name):");
      for (const row of rows) {
        console.log(
          `${row.batch} | ${row.department} | ${row.category} | ${row.classification}` +
            `${row.legacyDemoCatalogue ? " (legacy demo catalogue)" : ""} | ${row.productId} | ` +
            `${row.createdAtLocal} | imgs=${row.images} stock=${row.stockRows} | ${row.name}`
        );
      }
      console.log("");
      console.log(
        `Totals: ${summary.active.total} active (${summary.active.demo} DEMO, ${summary.active.live} LIVE); ` +
          `pre-Batch-2 ${summary.active.preBatch2}; taxonomy batch ${summary.active.taxonomyBatch}; ` +
          `Batch 2 ${summary.active.batch2}; Batch 3 ${summary.active.batch3}`
      );
      console.log(
        `Product statuses: ${summary.statuses
          .map((row) => `${row.status}=${row.count} (fixture-like=${row.fixtures})`)
          .join(", ")}`
      );
      console.log(
        `Non-public rows: drafts=${summary.nonPublic.drafts} (fixture-like=${summary.nonPublic.draftFixtures}); ` +
          `archived=${summary.nonPublic.archived} (fixture-like=${summary.nonPublic.archivedFixtures})`
      );
      console.log(
        `Category requests: ${summary.categoryRequests
          .map((row) => `${row.status}=${row.count}`)
          .join(", ") || "(none)"}; CRF names=${summary.crf.categoryNames + summary.crf.categoryRequestNames}`
      );
      console.log(
        `Image rows: ${summary.totals.images}; inventory rows: ${summary.totals.stockRows}`
      );
      console.log("");
      if (problems.length > 0) {
        for (const problem of problems) console.error(`PROBLEM: ${problem}`);
        console.error("Result: FAIL");
      } else {
        console.log(
          `Result: PASS — ${summary.active.total} active = ${batches.map((batch) => `${batch.count} ${batch.label}`).join(" + ")}; ` +
            "Batch 2 appears once; no acceptance fixture is ACTIVE; " +
            "drafts and archived rows are reported separately; CRF category names = 0."
        );
      }
    }

    if (problems.length > 0) process.exitCode = 1;
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    fail(sanitize(error instanceof Error ? error.message : String(error)));
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(`FAIL: ${sanitize(error instanceof Error ? error.message : String(error))}`);
  process.exit(2);
});
