#!/usr/bin/env node
/**
 * REVIEW taxonomy image-persistence acceptance tests.
 *
 * Proves, against an explicit REVIEW database:
 *   - seed image defaults are create-only: applying a seed update to a category
 *     that carries administrator image A/alt A leaves A/A untouched, and the
 *     same update applied twice is idempotent;
 *   - a seed update never initialises an image on an existing row that has
 *     none, while the create data does initialise the definition's default;
 *   - an admin update that omits image fields preserves both stored values;
 *   - an explicit clear (`imageUrl: ""` or null) clears the URL and the alt;
 *   - replacing the image with a different non-empty URL without alt text
 *     fails 400 `image_alt_required` and changes nothing;
 *   - an unchanged URL keeps its alt, alt-only edits update only the alt, and
 *     a new URL plus alt sets both;
 *   - a fingerprint of every other Category id/imageUrl/imageAlt and of the
 *     Product distribution is unchanged by the run-owned operations.
 *
 * Safety rules, matching the other REVIEW acceptance scripts:
 *  - REVIEW_DATABASE_URL is mandatory; DATABASE_URL is never a fallback.
 *  - --expect-db must match the URL database and the live current_database().
 *  - DatabaseClassification must explicitly contain REVIEW.
 *  - Only run-owned category rows are created and mutated. They are removed in
 *    a finally block; the append-only AuditLog/SystemEvent evidence is retained.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/taxonomy-image-persistence-tests.ts \
 *       --expect-db=naijadeals_review
 */
import { createHash, randomBytes } from "node:crypto";
import { Client } from "pg";
import type { SessionUser } from "../lib/auth/session";
import type { SeedNodeSource } from "../lib/services/taxonomy/seed-update";

let failures = 0;
let passes = 0;

function fail(message: string): never {
  console.error(`FAIL: ${sanitize(message)}`);
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

async function step(name: string, fn: () => Promise<void>) {
  const started = Date.now();
  try {
    await fn();
    passes += 1;
    console.log(`PASS  ${name} — ${Date.now() - started}ms`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name} — ${sanitize(error instanceof Error ? error.message : String(error))}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectApiError(run: () => Promise<unknown>, status: number, code: string, label: string) {
  try {
    await run();
  } catch (error) {
    const api = error as { status?: unknown; code?: unknown; message?: unknown };
    assert(api.status === status, `${label}: expected HTTP ${status}, got ${String(api.status)} (${String(api.message)})`);
    assert(api.code === code, `${label}: expected code ${code}, got ${String(api.code)}`);
    return;
  }
  throw new Error(`${label}: expected ApiError ${status}/${code}, but the call succeeded`);
}

type ImageRow = { imageUrl: string | null; imageAlt: string | null };

function assertImage(actual: ImageRow, expected: ImageRow, label: string) {
  assert(
    actual.imageUrl === expected.imageUrl && actual.imageAlt === expected.imageAlt,
    `${label}: expected (${String(expected.imageUrl)}, ${String(expected.imageAlt)}), got (${String(
      actual.imageUrl
    )}, ${String(actual.imageAlt)})`
  );
}

function definition(
  seed: Pick<SeedNodeSource, "key" | "name" | "slug"> & Partial<SeedNodeSource>
): SeedNodeSource {
  return {
    description: null,
    level: 0,
    isSelectable: false,
    showOnHomepage: false,
    sortOrder: 9_999,
    isExisting: false,
    ...seed
  };
}

type ImageFingerprint = {
  categories: Map<string, string>;
  products: Map<string, number>;
  totalProducts: number;
};

async function imageFingerprint(client: Client, excludeIds: Set<string>): Promise<ImageFingerprint> {
  const categoryRows = await client.query<{ id: string; imageUrl: string | null; imageAlt: string | null }>(
    `select id, "imageUrl", "imageAlt" from "Category" order by id`
  );
  const categories = new Map<string, string>();
  for (const row of categoryRows.rows) {
    if (excludeIds.has(row.id)) continue;
    categories.set(row.id, JSON.stringify([row.imageUrl, row.imageAlt]));
  }
  const productRows = await client.query<{ categoryId: string; count: string }>(
    `select "categoryId", count(*)::text as count from "Product" group by "categoryId" order by "categoryId"`
  );
  const products = new Map(productRows.rows.map((row) => [row.categoryId, Number(row.count)]));
  const totalProducts = productRows.rows.reduce((sum, row) => sum + Number(row.count), 0);
  return { categories, products, totalProducts };
}

function hashEntries(entries: Array<[string, string]>): string {
  return createHash("sha256")
    .update(JSON.stringify(entries.sort(([left], [right]) => left.localeCompare(right))))
    .digest("hex")
    .slice(0, 16);
}

function diffMaps(before: Map<string, string>, after: Map<string, string>): string {
  const keys = new Set([...before.keys(), ...after.keys()]);
  const changes: string[] = [];
  for (const key of keys) {
    const left = before.get(key);
    const right = after.get(key);
    if (left !== right) changes.push(`${key}: ${String(left)} -> ${String(right)}`);
  }
  return changes.slice(0, 5).join("; ");
}

function assertFingerprintUnchanged(before: ImageFingerprint, after: ImageFingerprint, label: string) {
  assert(
    before.categories.size === after.categories.size,
    `${label}: category count ${after.categories.size} != ${before.categories.size} (${diffMaps(
      before.categories,
      after.categories
    )})`
  );
  const beforeHash = hashEntries([...before.categories.entries()]);
  const afterHash = hashEntries([...after.categories.entries()]);
  assert(
    beforeHash === afterHash,
    `${label}: category id/imageUrl/imageAlt fingerprint ${afterHash} != ${beforeHash} (${diffMaps(
      before.categories,
      after.categories
    )})`
  );
  const productBefore = hashEntries(
    [...before.products.entries()].map(([key, value]) => [key, String(value)] as [string, string])
  );
  const productAfter = hashEntries(
    [...after.products.entries()].map(([key, value]) => [key, String(value)] as [string, string])
  );
  assert(
    before.totalProducts === after.totalProducts && productBefore === productAfter,
    `${label}: product distribution changed (${before.totalProducts} -> ${after.totalProducts})`
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const expectedDb = parseExpectedDatabase(argv);
  const reviewUrl = resolveReviewUrl(expectedDb);
  const runId = `TXIMG-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
  const runLower = runId.toLowerCase();
  const keyPrefix = `txtimg_${runLower}`;
  const createdCategoryIds: string[] = [];
  const excludedIds = new Set<string>();

  const client = new Client({
    connectionString: reviewUrl,
    connectionTimeoutMillis: 8000,
    application_name: "naijadeals-taxonomy-image-persistence-tests"
  });

  let prisma: import("@prisma/client").PrismaClient | null = null;

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
    const columns = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'Category'
          and column_name in ('imageUrl','imageAlt')`
    );
    if (columns.rowCount !== 2) fail("Category image columns are missing from the REVIEW schema");

    const actorRow = await client.query<{ id: string; scopeCountryCode: string | null }>(
      `select id, "scopeCountryCode" from "User" where email = 'review-admin@review.invalid'`
    );
    const actorRowValue = actorRow.rows[0];
    if (!actorRowValue) fail("review-admin@review.invalid is missing from the REVIEW database");
    const actor = {
      id: actorRowValue.id,
      scopeCountryCode: actorRowValue.scopeCountryCode
    } as SessionUser;

    const before = await imageFingerprint(client, excludedIds);

    // Point Prisma at the verified REVIEW database before importing it.
    process.env.DATABASE_URL = reviewUrl;
    const prismaModule = await import("../lib/prisma");
    const seedUpdate = await import("../lib/services/taxonomy/seed-update");
    const nodes = await import("../lib/services/taxonomy/nodes");
    prisma = prismaModule.prisma;
    const { buildSeedCreateData, buildSeedUpdateData } = seedUpdate;
    const { createCategoryNode, updateCategoryNode } = nodes;

    const createFixture = async (source: SeedNodeSource): Promise<string> => {
      const row = await prisma!.category.create({
        data: buildSeedCreateData(source, null),
        select: { id: true }
      });
      createdCategoryIds.push(row.id);
      excludedIds.add(row.id);
      return row.id;
    };

    const readImage = async (categoryId: string): Promise<ImageRow> =>
      prisma!.category.findUniqueOrThrow({
        where: { id: categoryId },
        select: { imageUrl: true, imageAlt: true }
      });

    const imageA = `/qa-fixtures/${runLower}-admin-a.webp`;
    const altA = `${runId} administrator image A`;
    const imageB = `/qa-fixtures/${runLower}-definition-b.webp`;
    const altB = `${runId} definition image B`;
    const imageC = `/qa-fixtures/${runLower}-admin-c.webp`;
    const altC = `${runId} administrator image C`;

    const baseDefinition = definition({
      key: `${keyPrefix}_base`,
      name: `${runId} Base`,
      slug: `${runLower}-base`
    });
    const defaultDefinition = definition({
      ...baseDefinition,
      key: `${keyPrefix}_default`,
      name: `${runId} Default`,
      slug: `${runLower}-default`,
      imageUrl: imageB,
      imageAlt: altB
    });

    const preserveDefinition = definition({
      ...baseDefinition,
      key: `${keyPrefix}_preserve`,
      name: `${runId} Preserve`,
      slug: `${runLower}-preserve`,
      imageUrl: imageB,
      imageAlt: altB
    });

    let preserveId = "";
    await step("seed update preserves an administrator image and alt", async () => {
      preserveId = await createFixture(baseDefinition);
      await updateCategoryNode(actor, preserveId, { imageUrl: imageA, imageAlt: altA });
      assertImage(await readImage(preserveId), { imageUrl: imageA, imageAlt: altA }, "fixture after admin set");

      const updateData = buildSeedUpdateData(preserveDefinition, null);
      assert(!("imageUrl" in updateData), "seed update data contains imageUrl");
      assert(!("imageAlt" in updateData), "seed update data contains imageAlt");
      await prisma!.category.update({ where: { id: preserveId }, data: updateData });
      assertImage(
        await readImage(preserveId),
        { imageUrl: imageA, imageAlt: altA },
        "administrator image after seed update"
      );
    });

    await step("the same seed update is idempotent and never touches image/alt", async () => {
      assert(preserveId, "preserve fixture is missing");
      const first = buildSeedUpdateData(preserveDefinition, null);
      const second = buildSeedUpdateData(preserveDefinition, null);
      assert(JSON.stringify(first) === JSON.stringify(second), "seed update payload is not deterministic");
      await prisma!.category.update({ where: { id: preserveId }, data: second });
      assertImage(
        await readImage(preserveId),
        { imageUrl: imageA, imageAlt: altA },
        "administrator image after second seed update"
      );
    });

    await step("seed defaults initialise create data only", async () => {
      const createWithDefault = buildSeedCreateData(defaultDefinition, null);
      assert(createWithDefault.imageUrl === imageB, `create imageUrl ${String(createWithDefault.imageUrl)}`);
      assert(createWithDefault.imageAlt === altB, `create imageAlt ${String(createWithDefault.imageAlt)}`);

      const createWithout = buildSeedCreateData(baseDefinition, null);
      assert(!Object.prototype.hasOwnProperty.call(createWithout, "imageUrl"), "no-image definition set imageUrl on create");
      assert(!Object.prototype.hasOwnProperty.call(createWithout, "imageAlt"), "no-image definition set imageAlt on create");

      const created = await createFixture(
        definition({
          ...defaultDefinition,
          key: `${keyPrefix}_created`,
          name: `${runId} Created`,
          slug: `${runLower}-created`
        })
      );
      assertImage(await readImage(created), { imageUrl: imageB, imageAlt: altB }, "seed-created default image");

      const empty = await createFixture(
        definition({
          ...baseDefinition,
          key: `${keyPrefix}_empty`,
          name: `${runId} Empty`,
          slug: `${runLower}-empty`
        })
      );
      assertImage(await readImage(empty), { imageUrl: null, imageAlt: null }, "seed-created category without art");
      await prisma!.category.update({
        where: { id: empty },
        data: buildSeedUpdateData(defaultDefinition, null)
      });
      assertImage(
        await readImage(empty),
        { imageUrl: null, imageAlt: null },
        "existing no-image category after seed update with a default"
      );
    });

    await step("admin update omitting image fields preserves both", async () => {
      assert(preserveId, "preserve fixture is missing");
      await prisma!.category.update({ where: { id: preserveId }, data: { imageUrl: imageA, imageAlt: altA } });
      const updated = await updateCategoryNode(actor, preserveId, { sortOrder: 4_242 });
      assert(updated.sortOrder === 4_242, `sortOrder ${updated.sortOrder}`);
      assertImage(
        await readImage(preserveId),
        { imageUrl: imageA, imageAlt: altA },
        "administrator image after an unrelated admin update"
      );
    });

    await step("an unchanged URL keeps the stored alt", async () => {
      assert(preserveId, "preserve fixture is missing");
      await prisma!.category.update({ where: { id: preserveId }, data: { imageUrl: imageA, imageAlt: altA } });
      await updateCategoryNode(actor, preserveId, { imageUrl: imageA });
      assertImage(
        await readImage(preserveId),
        { imageUrl: imageA, imageAlt: altA },
        "unchanged URL without alt"
      );
    });

    await step("an alt-only update changes only the alt", async () => {
      assert(preserveId, "preserve fixture is missing");
      const revised = `${altA} revised`;
      await prisma!.category.update({ where: { id: preserveId }, data: { imageUrl: imageA, imageAlt: altA } });
      await updateCategoryNode(actor, preserveId, { imageAlt: revised });
      assertImage(await readImage(preserveId), { imageUrl: imageA, imageAlt: revised }, "alt-only update");
      await prisma!.category.update({ where: { id: preserveId }, data: { imageAlt: altA } });
    });

    await step("alt text without an existing image is refused", async () => {
      const noImageId = await createFixture(
        definition({
          ...baseDefinition,
          key: `${keyPrefix}_no_image`,
          name: `${runId} No Image`,
          slug: `${runLower}-no-image`
        })
      );
      await expectApiError(
        () => updateCategoryNode(actor, noImageId, { imageAlt: `${runId} orphan alt` }),
        400,
        "image_required_for_alt",
        "alt-only update without image"
      );
      assertImage(await readImage(noImageId), { imageUrl: null, imageAlt: null }, "no-image fixture after refused alt");
    });

    await step("creating a category image without alt is refused", async () => {
      let createdId: string | null = null;
      try {
        const created = await createCategoryNode(actor, {
          parentId: null,
          key: `${keyPrefix}_create_no_alt`,
          name: `${runId} Create No Alt`,
          slug: `${runLower}-create-no-alt`,
          imageUrl: imageA
        });
        createdId = created.id;
      } catch (error) {
        const api = error as { status?: unknown; code?: unknown; message?: unknown };
        assert(api.status === 400, `create without alt: expected HTTP 400, got ${String(api.status)} (${String(api.message)})`);
        assert(api.code === "image_alt_required", `create without alt: expected image_alt_required, got ${String(api.code)}`);
      }
      assert(!createdId, "create without alt unexpectedly created a category");
    });

    await step("explicit empty-string clear removes both image and alt", async () => {
      assert(preserveId, "preserve fixture is missing");
      await prisma!.category.update({ where: { id: preserveId }, data: { imageUrl: imageA, imageAlt: altA } });
      await updateCategoryNode(actor, preserveId, { imageUrl: "" });
      assertImage(await readImage(preserveId), { imageUrl: null, imageAlt: null }, "explicit clear via empty string");
    });

    await step("a new URL without alt fails 400 image_alt_required and changes nothing", async () => {
      assert(preserveId, "preserve fixture is missing");
      await prisma!.category.update({ where: { id: preserveId }, data: { imageUrl: imageA, imageAlt: altA } });
      await expectApiError(
        () => updateCategoryNode(actor, preserveId, { imageUrl: imageC }),
        400,
        "image_alt_required",
        "new URL without alt"
      );
      assertImage(
        await readImage(preserveId),
        { imageUrl: imageA, imageAlt: altA },
        "image after rejected URL-only update"
      );
      await expectApiError(
        () => updateCategoryNode(actor, preserveId, { imageUrl: imageC, imageAlt: "   " }),
        400,
        "image_alt_required",
        "new URL with blank alt"
      );
      assertImage(
        await readImage(preserveId),
        { imageUrl: imageA, imageAlt: altA },
        "image after rejected blank-alt update"
      );
    });

    await step("a new URL plus alt sets both", async () => {
      assert(preserveId, "preserve fixture is missing");
      await prisma!.category.update({ where: { id: preserveId }, data: { imageUrl: imageA, imageAlt: altA } });
      await updateCategoryNode(actor, preserveId, { imageUrl: imageC, imageAlt: altC });
      assertImage(await readImage(preserveId), { imageUrl: imageC, imageAlt: altC }, "new URL with alt");
    });

    await step("an explicit null clear also removes both", async () => {
      assert(preserveId, "preserve fixture is missing");
      await prisma!.category.update({ where: { id: preserveId }, data: { imageUrl: imageC, imageAlt: altC } });
      await updateCategoryNode(actor, preserveId, { imageUrl: null });
      assertImage(await readImage(preserveId), { imageUrl: null, imageAlt: null }, "explicit clear via null");
    });

    await step("no other category image or product row changed", async () => {
      const after = await imageFingerprint(client, excludedIds);
      assertFingerprintUnchanged(before, after, "run-owned operations");
      console.log(
        `      fingerprint: ${before.categories.size} other categories stable, ` +
          `${before.totalProducts} products across ${before.products.size} categories stable`
      );
    });

    console.log("");
    console.log(`REVIEW taxonomy image-persistence tests — ${actualDb} (REVIEW)`);
    console.log(`Run fixtures: ${runId}; run-owned categories ${createdCategoryIds.length}`);
    console.log(`Checks: ${passes} passed, ${failures} failed`);
    if (failures > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`FAIL: ${sanitize(error instanceof Error ? error.message : String(error))}`);
    process.exitCode = 2;
  } finally {
    // Remove run-owned fixtures. A partially created row that failed before its
    // id was recorded is still findable by its run-tagged key/name.
    for (const categoryId of createdCategoryIds) {
      await client.query(`delete from "Category" where id = $1`, [categoryId]).catch(() => undefined);
    }
    await client
      .query(`delete from "Category" where key like $1 or name like $2`, [`${keyPrefix}%`, `${runId}%`])
      .catch(() => undefined);
    await client.end().catch(() => undefined);
    if (prisma) await prisma.$disconnect().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(`FAIL: ${sanitize(error instanceof Error ? error.message : String(error))}`);
  process.exit(2);
});
