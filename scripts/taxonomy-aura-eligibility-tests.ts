#!/usr/bin/env node
/**
 * REVIEW taxonomy → Aura → market eligibility acceptance.
 *
 * Proves against an explicit REVIEW database (no HTTP server or model call):
 *   - Aura's `search_products` reads the canonical public catalogue, so a
 *     regulated category with an NG deny rule (and its ACTIVE listing) is never
 *     offered to a Nigerian visitor, while an eligible control listing is;
 *   - the same search in a market where the regulated category has no rule
 *     returns neither listing (unresolved market eligibility is fail-closed);
 *   - `compare_products` resolves ids through the public product detail: a
 *     regulated id is treated as absent and its name/price never appears;
 *   - a country-scoped administrator cannot change the platform-wide
 *     `isRegulated` flag on create or update (403 `region_forbidden`, no write),
 *     a platform administrator can, and the audit trail keeps before/after
 *     values plus the actor's scope decision.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/taxonomy-aura-eligibility-tests.ts --expect-db=naijadeals_review
 *
 * Run-owned vendors, categories, country rules and products are removed in a
 * finally block. AuditLog/SystemEvent rows are append-only evidence and are
 * retained. Nothing here seeds taxonomy or touches existing catalogue rows.
 */
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import type { SessionUser } from "../lib/auth/session";
import { REGULATED_CATEGORY_KEYS } from "../lib/taxonomy/regulated";

type Json = Record<string, unknown>;

const REQUIRED_DATABASE = "naijadeals_review";
const RUN_PREFIX = "taxaura_";
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
    .slice(0, 900);
}

function parseExpectedDatabase(argv: string[]): string {
  const arg = argv.find((value) => value.startsWith("--expect-db="));
  const expected = arg?.slice("--expect-db=".length).trim();
  if (!expected) fail("--expect-db=naijadeals_review is required so the target cannot be guessed");
  if (!/^[A-Za-z0-9_]+$/.test(expected)) fail("--expect-db must contain only letters, digits and underscores");
  if (expected !== REQUIRED_DATABASE) {
    fail(`this suite is restricted to ${REQUIRED_DATABASE}; --expect-db=${expected} was supplied`);
  }
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

function asRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function toolStatus(error: unknown): { status?: number; code?: string; message: string } {
  const record = error as { status?: unknown; code?: unknown; message?: unknown };
  return {
    status: typeof record?.status === "number" ? record.status : undefined,
    code: typeof record?.code === "string" ? record.code : undefined,
    message: error instanceof Error ? error.message : String(error)
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const expectedDb = parseExpectedDatabase(argv);
  const reviewUrl = resolveReviewUrl(expectedDb);
  const runId = `TAXAURA-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
  const runSlug = runId.toLowerCase();
  const runKey = `${RUN_PREFIX}${runId.toLowerCase().replace(/-/g, "_")}`;

  const client = new Client({
    connectionString: reviewUrl,
    connectionTimeoutMillis: 8000,
    application_name: "naijadeals-taxonomy-aura-tests"
  });

  const created = {
    vendorId: null as string | null,
    categoryIds: [] as string[],
    productIds: [] as string[],
    actorUserId: null as string | null
  };

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
          and column_name in ('isRegulated','browsingVisible','isSelectable')`
    );
    const columnNames = new Set(columns.rows.map((row) => row.column_name));
    assert(columnNames.has("isRegulated"), "Category.isRegulated is not migrated in REVIEW");
    assert(columnNames.has("isSelectable"), "Category.isSelectable is not migrated in REVIEW");

    // Read-only reconciliation: the established definition is 18 regulated
    // categories, of which 17 carry an NG deny rule. GH intentionally has no
    // rule, so its eligibility stays unresolved.
    await step("REVIEW regulated rows match the established definition (18 regulated / 17 NG deny)", async () => {
      const regulatedRows = await client.query<{ key: string | null }>(
        `select key from "Category" where "isRegulated" = true order by key`
      );
      const actualKeys = regulatedRows.rows
        .map((row) => row.key)
        .filter((key): key is string => typeof key === "string")
        .sort();
      const expectedKeys = [...REGULATED_CATEGORY_KEYS].sort();
      assert(
        JSON.stringify(actualKeys) === JSON.stringify(expectedKeys),
        `REVIEW regulated keys differ from the established set: expected ${expectedKeys.length}, found ${actualKeys.length}`
      );
      const ngDeny = await client.query<{ count: string }>(
        `select count(*)::text as count from "CategoryCountryRule"
          where "countryCode" = 'NG' and "canPublish" = false`
      );
      assert(ngDeny.rows[0]?.count === "17", `NG deny rules expected 17, found ${String(ngDeny.rows[0]?.count)}`);
      const ghRule = await client.query<{ count: string }>(
        `select count(*)::text as count from "CategoryCountryRule"
          where "countryCode" = 'GH'
            and "categoryId" in (select id from "Category" where "isRegulated" = true)`
      );
      assert(ghRule.rows[0]?.count === "0", "GH must have no rule for regulated categories (unresolved, not permitted)");
    });

    // ---- fixtures --------------------------------------------------------
    const owner = await client.query<{ id: string }>(`select id from "User" order by "createdAt" asc limit 1`);
    const actorUserId = owner.rows[0]?.id;
    assert(actorUserId, "no User row exists to own the run fixtures");
    created.actorUserId = actorUserId;

    const parent = await client.query<{ id: string }>(
      `select c.id from "Category" c
        where c.level = 1 and c."parentId" is not null and c."isActive" and c."deprecatedAt" is null
          and c."isRegulated" = false
          and not exists (
            select 1 from "CategoryCountryRule" r
             where r."categoryId" = c.id and r."countryCode" = 'NG' and r."canPublish" = false
          )
        order by c."sortOrder", c.name limit 1`
    );
    const parentId = parent.rows[0]?.id;
    assert(parentId, "no eligible canonical level-1 category exists to host the run fixtures");

    const vendorId = `taxaura_vendor_${randomBytes(8).toString("hex")}`;
    created.vendorId = vendorId;
    await client.query(
      `insert into "Vendor"
         (id, "ownerId", name, slug, market, "pickupAddress", "pickupPhone", "countryCode", status, "createdAt", "updatedAt")
       values ($1, $2, $3, $4, 'Lagos', 'Run-owned review fixture', '+2340000000000', 'NG', 'VERIFIED', now(), now())`,
      [vendorId, actorUserId, `${runId} Vendor`, `${runSlug}-vendor`]
    );

    const eligibleCategoryId = `taxaura_cat_${randomBytes(8).toString("hex")}`;
    const regulatedCategoryId = `taxaura_reg_${randomBytes(8).toString("hex")}`;
    created.categoryIds.push(eligibleCategoryId, regulatedCategoryId);

    await client.query(
      `insert into "Category"
         (id, key, name, slug, "parentId", level, "isActive", "isSelectable", "showOnHomepage",
          "browsingVisible", "isRegulated", "sortOrder", "createdAt")
       values ($1, $2, $3, $4, $5, 2, true, true, false, true, false, 100100, now())`,
      [eligibleCategoryId, `${runKey}_control`, `${runId} Control Leaf`, `${runSlug}-control-leaf`, parentId]
    );
    await client.query(
      `insert into "Category"
         (id, key, name, slug, "parentId", level, "isActive", "isSelectable", "showOnHomepage",
          "browsingVisible", "isRegulated", "sortOrder", "createdAt")
       values ($1, $2, $3, $4, $5, 2, true, true, false, true, true, 100101, now())`,
      [regulatedCategoryId, `${runKey}_regulated`, `${runId} Regulated Leaf`, `${runSlug}-regulated-leaf`, parentId]
    );
    await client.query(
      `insert into "CategoryCountryRule" ("categoryId", "countryCode", "canPublish", note)
       values ($1, 'NG', false, $2)`,
      [regulatedCategoryId, `Run-owned NG deny for ${runId}; regulated goods need review.`]
    );

    const productIds = {
      control: `taxaura_prod_${randomBytes(8).toString("hex")}`,
      control2: `taxaura_prod2_${randomBytes(8).toString("hex")}`,
      regulated: `taxaura_regprod_${randomBytes(8).toString("hex")}`,
      regulatedGh: `taxaura_regprodgh_${randomBytes(8).toString("hex")}`
    };
    created.productIds.push(
      productIds.control,
      productIds.control2,
      productIds.regulated,
      productIds.regulatedGh
    );
    const insertProduct = async (input: {
      id: string;
      categoryId: string;
      name: string;
      slug: string;
      priceKobo: number;
      countryCode: string;
    }) => {
      await client.query(
        `insert into "Product"
           (id, "vendorId", "categoryId", name, slug, description, "priceKobo", "countryCode",
            status, "isSample", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', false, now(), now())`,
        [
          input.id,
          vendorId,
          input.categoryId,
          input.name,
          input.slug,
          `Run-owned acceptance fixture ${runId}.`,
          String(input.priceKobo),
          input.countryCode
        ]
      );
    };
    await insertProduct({
      id: productIds.control,
      categoryId: eligibleCategoryId,
      name: `${runId} Control Rice 5kg`,
      slug: `${runSlug}-control-rice`,
      priceKobo: 4_250_000,
      countryCode: "NG"
    });
    await insertProduct({
      id: productIds.control2,
      categoryId: eligibleCategoryId,
      name: `${runId} Control Beans 5kg`,
      slug: `${runSlug}-control-beans`,
      priceKobo: 6_100_000,
      countryCode: "NG"
    });
    await insertProduct({
      id: productIds.regulated,
      categoryId: regulatedCategoryId,
      name: `${runId} Regulated Medicine Pack`,
      slug: `${runSlug}-regulated-medicine`,
      priceKobo: 1_000_000,
      countryCode: "NG"
    });
    // The same regulated leaf has no GH rule. A GH-located listing proves the
    // GH search is empty because eligibility is unresolved, not merely because
    // the other fixtures are NG listings.
    await insertProduct({
      id: productIds.regulatedGh,
      categoryId: regulatedCategoryId,
      name: `${runId} Regulated Medicine Pack GH`,
      slug: `${runSlug}-regulated-medicine-gh`,
      priceKobo: 1_100_000,
      countryCode: "GH"
    });

    // The canonical services read DATABASE_URL. Point it at the verified REVIEW
    // URL only after the direct-pg identity guard above has passed.
    process.env.DATABASE_URL = reviewUrl;
    const [{ TOOLS }, { verticalAccess }, { createCategoryNode, updateCategoryNode }] = await Promise.all([
      import("../lib/aura/tools"),
      import("../lib/services/core/vertical-activation.service"),
      import("../lib/services/taxonomy/nodes")
    ]);

    const shop = await verticalAccess("shop", { countryCode: "NG" });
    assert(
      shop.accessible,
      `Shop must be publicly accessible in REVIEW for the canonical catalogue checks (status ${shop.effective.status})`
    );
    const shopGh = await verticalAccess("shop", { countryCode: "GH" });
    assert(
      shopGh.accessible,
      `Shop must be publicly accessible in GH for the unresolved-market check (status ${shopGh.effective.status})`
    );
    const ghRules = await client.query<{ count: string }>(
      `select count(*)::text as count from "CategoryCountryRule"
        where "categoryId" = $1 and "countryCode" = 'GH'`,
      [regulatedCategoryId]
    );
    assert(ghRules.rows[0]?.count === "0", "fixture precondition: the regulated leaf must have no GH rule");

    const cardsOf = (result: { cards?: Array<{ title: string; meta?: Record<string, string | number | null> }> }) =>
      result.cards ?? [];

    // ---- Aura catalogue eligibility -------------------------------------
    await step("Aura search for NG returns the eligible control and never the regulated listing", async () => {
      const result = await TOOLS.search_products(
        { userId: actorUserId, countryCode: "NG", city: "Lagos", previewAuthorized: false },
        { query: runId, take: 6 },
        "run-owned-aura-check"
      );
      const cards = cardsOf(result);
      const ids = cards.map((card) => String(card.meta?.id ?? ""));
      assert(ids.includes(productIds.control), "eligible control product is missing from Aura search");
      assert(ids.includes(productIds.control2), "second eligible control product is missing from Aura search");
      assert(!ids.includes(productIds.regulated), "Aura search leaked an NG product from an NG-regulated category");
      assert(!ids.includes(productIds.regulatedGh), "Aura search leaked a GH product into the NG market");
      assert(
        !cards.some((card) => card.title === `${runId} Regulated Medicine Pack`),
        "Aura search leaked the regulated product name"
      );
      assert(!result.summary.includes("Regulated Medicine"), "Aura summary leaked the regulated product name");
      assert(asRecord(result.data).countryCode === "NG", "Aura search did not report the NG market scope");
    });

    await step("Aura search in GH returns neither listing while the regulated market rule is unresolved", async () => {
      const result = await TOOLS.search_products(
        { userId: actorUserId, countryCode: "GH", city: "Accra", previewAuthorized: false },
        { query: runId, take: 6 },
        "run-owned-aura-check"
      );
      const ids = cardsOf(result).map((card) => String(card.meta?.id ?? ""));
      assert(!ids.includes(productIds.control), "GH search returned an NG-only control product");
      assert(
        !ids.includes(productIds.regulatedGh),
        "GH search returned a GH product from a regulated category whose GH rule is unresolved"
      );
      assert(!ids.includes(productIds.regulated), "GH search returned an NG-regulated product");
      assert(cardsOf(result).length === 0, `GH search returned ${cardsOf(result).length} unexpected card(s)`);
    });

    await step("Aura compare drops the regulated id and 404s when fewer than two eligible products remain", async () => {
      let refused: unknown = null;
      try {
        await TOOLS.compare_products(
          { userId: actorUserId, countryCode: "NG", city: "Lagos", previewAuthorized: false },
          { productIds: [productIds.regulated, productIds.control] },
          "run-owned-aura-check"
        );
      } catch (error) {
        refused = error;
      }
      assert(refused, "comparing a regulated id with one eligible product did not fail");
      const status = toolStatus(refused);
      assert(status.status === 404 && status.code === "not_found", `compare status=${String(status.status)} code=${String(status.code)}`);
      assert(
        !status.message.includes("Regulated Medicine"),
        "compare error message leaked the regulated product name"
      );

      const comparison = await TOOLS.compare_products(
        { userId: actorUserId, countryCode: "NG", city: "Lagos", previewAuthorized: false },
        { productIds: [productIds.control, productIds.control2, productIds.regulated] },
        "run-owned-aura-check"
      );
      const titles = cardsOf(comparison).map((card) => card.title);
      assert(titles.length === 2, `three ids with two eligible products produced ${titles.length} cards`);
      assert(titles.includes(`${runId} Control Rice 5kg`), "eligible control product is missing from the comparison");
      assert(titles.includes(`${runId} Control Beans 5kg`), "second eligible control product is missing from the comparison");
      assert(!titles.some((title) => title.includes("Regulated Medicine")), "comparison leaked the regulated product");
    });

    // ---- admin regulated-flag scope --------------------------------------
    const userRow = await client.query<Record<string, unknown>>(`select * from "User" where id = $1`, [actorUserId]);
    const baseActor = { ...(userRow.rows[0] ?? {}), roles: [], vendors: [] } as unknown as SessionUser;
    assert(baseActor.id === actorUserId, "run fixture actor user could not be loaded");
    const scopedActor = { ...baseActor, scopeCountryCode: "NG", scopeCityCode: null } as SessionUser;
    const platformActor = { ...baseActor, scopeCountryCode: null, scopeCityCode: null } as SessionUser;

    const adminSlug = `${runSlug}-admin-regulated`;
    const adminName = `${runId} Admin Regulated Fixture`;
    let adminCategoryId: string | null = null;

    await step("a country-scoped administrator cannot set isRegulated on create", async () => {
      let denied: unknown = null;
      try {
        await createCategoryNode(scopedActor, {
          parentId,
          key: `${runKey}_admin_denied`,
          name: `${runId} Denied Regulated Fixture`,
          slug: `${runSlug}-admin-denied`,
          isRegulated: true,
          countryRules: [{ countryCode: "NG", canPublish: true, note: `Run-owned allow ${runId}.` }]
        });
      } catch (error) {
        denied = error;
      }
      assert(denied, "country-scoped create with isRegulated=true was accepted");
      const status = toolStatus(denied);
      assert(
        status.status === 403 && status.code === "region_forbidden",
        `scoped create status=${String(status.status)} code=${String(status.code)}`
      );
      const rows = await client.query<{ count: string }>(
        `select count(*)::text as count from "Category" where slug = $1`,
        [`${runSlug}-admin-denied`]
      );
      assert(rows.rows[0]?.count === "0", "denied scoped create still wrote a category row");
    });

    await step("a platform administrator can create a regulated node and the audit records the scope decision", async () => {
      const node = await createCategoryNode(platformActor, {
        parentId,
        key: `${runKey}_admin`,
        name: adminName,
        slug: adminSlug,
        isRegulated: true,
        countryRules: [{ countryCode: "NG", canPublish: true, note: `Run-owned allow ${runId}.` }]
      });
      adminCategoryId = node.id;
      created.categoryIds.push(node.id);
      assert(node.isRegulated === true, "platform create did not persist isRegulated=true");

      const audit = await client.query<{ metadata: Json | null }>(
        `select metadata from "AuditLog"
          where "entityId" = $1 and action = 'taxonomy.category.created'
          order by "createdAt" desc limit 1`,
        [node.id]
      );
      const metadata = asRecord(audit.rows[0]?.metadata);
      const scope = asRecord(metadata.scope);
      assert(metadata.isRegulated === true, "created audit metadata lost isRegulated");
      assert(scope.isRegulatedFlagAuthority === "platform_admin", `scope authority ${String(scope.isRegulatedFlagAuthority)}`);
      assert(scope.scopeCountryCode === null, `platform scope country ${String(scope.scopeCountryCode)}`);
    });

    await step("a country-scoped administrator cannot toggle isRegulated and no audit write occurs", async () => {
      assert(adminCategoryId, "platform-created fixture category is missing");
      const before = await client.query<{ count: string }>(
        `select count(*)::text as count from "AuditLog"
          where "entityId" = $1 and action = 'taxonomy.category.updated'`,
        [adminCategoryId]
      );
      let denied: unknown = null;
      try {
        await updateCategoryNode(scopedActor, adminCategoryId, { isRegulated: false });
      } catch (error) {
        denied = error;
      }
      assert(denied, "country-scoped administrator toggled isRegulated");
      const status = toolStatus(denied);
      assert(
        status.status === 403 && status.code === "region_forbidden",
        `scoped update status=${String(status.status)} code=${String(status.code)}`
      );
      const row = await client.query<{ isRegulated: boolean }>(
        `select "isRegulated" from "Category" where id = $1`,
        [adminCategoryId]
      );
      assert(row.rows[0]?.isRegulated === true, "denied scoped update still changed isRegulated");
      const after = await client.query<{ count: string }>(
        `select count(*)::text as count from "AuditLog"
          where "entityId" = $1 and action = 'taxonomy.category.updated'`,
        [adminCategoryId]
      );
      assert(after.rows[0]?.count === before.rows[0]?.count, "denied scoped update wrote an audit row");
    });

    await step("a platform administrator can toggle isRegulated with before/after audit evidence", async () => {
      assert(adminCategoryId, "platform-created fixture category is missing");
      const updated = await updateCategoryNode(platformActor, adminCategoryId, { isRegulated: false });
      assert(updated.isRegulated === false, "platform update did not persist isRegulated=false");

      const audit = await client.query<{ metadata: Json | null }>(
        `select metadata from "AuditLog"
          where "entityId" = $1 and action = 'taxonomy.category.updated'
          order by "createdAt" desc limit 1`,
        [adminCategoryId]
      );
      const metadata = asRecord(audit.rows[0]?.metadata);
      const before = asRecord(metadata.before);
      const after = asRecord(metadata.after);
      const scope = asRecord(metadata.scope);
      assert(before.isRegulated === true, "audit before.isRegulated is not true");
      assert(after.isRegulated === false, "audit after.isRegulated is not false");
      assert(metadata.regulatedChangeRequested === true, "audit lost the regulated change request");
      assert(scope.isRegulatedFlagAuthority === "platform_admin", `scope authority ${String(scope.isRegulatedFlagAuthority)}`);
      assert(scope.scopeCountryCode === null, `platform scope country ${String(scope.scopeCountryCode)}`);
    });

    await step("a scoped editor resending an unchanged isRegulated value is allowed", async () => {
      assert(adminCategoryId, "platform-created fixture category is missing");
      const updated = await updateCategoryNode(scopedActor, adminCategoryId, {
        isRegulated: false,
        description: `Run-owned scope no-op ${runId}.`
      });
      assert(updated.isRegulated === false, "scoped no-op update changed isRegulated");
      const audit = await client.query<{ metadata: Json | null }>(
        `select metadata from "AuditLog"
          where "entityId" = $1 and action = 'taxonomy.category.updated'
          order by "createdAt" desc limit 1`,
        [adminCategoryId]
      );
      const scope = asRecord(asRecord(audit.rows[0]?.metadata).scope);
      assert(
        scope.isRegulatedFlagAuthority === "country_scoped_admin",
        `scoped audit authority ${String(scope.isRegulatedFlagAuthority)}`
      );
      assert(scope.scopeCountryCode === "NG", `scoped audit country ${String(scope.scopeCountryCode)}`);
    });
  } finally {
    try {
      if (created.productIds.length > 0) {
        await client.query(`delete from "Product" where id = any($1::text[])`, [created.productIds]);
      }
      if (created.vendorId) {
        await client.query(`delete from "Vendor" where id = $1`, [created.vendorId]);
      }
      if (created.categoryIds.length > 0) {
        await client.query(`delete from "CategoryCountryRule" where "categoryId" = any($1::text[])`, [
          created.categoryIds
        ]);
        await client.query(`delete from "Category" where id = any($1::text[])`, [created.categoryIds]);
      }
    } catch (error) {
      console.error(`CLEANUP: ${sanitize(error instanceof Error ? error.message : String(error))}`);
    }
    await client.end().catch(() => undefined);
  }

  console.log("");
  console.log(`RESULT ${passes}/${passes + failures} checks passed (run ${runId}).`);
  console.log("Audit/SystemEvent evidence for the platform/scoped decisions is retained (append-only).");
  if (failures > 0) {
    console.error(`FAILED ${failures} check(s).`);
    process.exit(1);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
