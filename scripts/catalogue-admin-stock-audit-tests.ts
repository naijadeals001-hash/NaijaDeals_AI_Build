/**
 * REVIEW-only Control Center catalogue stock/audit acceptance.
 *
 * Proves:
 *   - a stock quantity below units reserved by open orders is refused by the
 *     authoritative in-transaction guard, with no partial stock or audit write;
 *   - when an update omits `variants`, the audit records the actual unchanged
 *     variant before/after snapshots instead of null;
 *   - create audits record meaningful before/after state.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=... npx tsx scripts/catalogue-admin-stock-audit-tests.ts
 *
 * REVIEW_DATABASE_URL is mandatory; .env/DATABASE_URL are never used as a
 * fallback. The guard verifies the actual database name and REVIEW
 * classification before the first write. Run-owned rows are removed in
 * `finally`; accepted catalogue rows are never altered.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";

const DB_URL = (process.env.REVIEW_DATABASE_URL || "").trim();
const EXPECTED_DB = (process.env.REVIEW_EXPECTED_DATABASE || "naijadeals_review").trim();
const IMAGE = "/generated/shop/category-home-kitchen.webp";
const ADMIN_CREDENTIAL = "qa-artifacts/review-basket/.admin-credential";

if (!DB_URL) throw new Error("REVIEW_DATABASE_URL is required; DATABASE_URL and .env are never used as a fallback.");

type CheckResult = { name: string; ok: boolean; detail: string };
const results: CheckResult[] = [];

function check(name: string, ok: unknown, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 600) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${String(detail).slice(0, 600)}` : ""}`);
}

function readAdminEmail() {
  const lines = readFileSync(ADMIN_CREDENTIAL, "utf8").trim().split(/\r?\n/);
  if (!lines[0]) throw new Error("admin credential email missing");
  return lines[0].trim().toLowerCase();
}

async function main() {
  const parsed = new URL(DB_URL);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (dbName !== EXPECTED_DB) throw new Error(`refusing database ${dbName}; expected ${EXPECTED_DB}`);
  const guard = new Client({ connectionString: DB_URL });
  await guard.connect();
  try {
    const identity = await guard.query<{ db: string }>("select current_database() as db");
    if (identity.rows[0]?.db !== EXPECTED_DB) {
      throw new Error(`current_database() is ${identity.rows[0]?.db ?? "unknown"}; refusing to continue`);
    }
    const classification = await guard.query<{ classification: string }>(
      'select classification from "DatabaseClassification"'
    );
    if (!classification.rows.some((row) => row.classification === "REVIEW")) {
      throw new Error("refusing: database is not classified REVIEW");
    }
  } finally {
    await guard.end();
  }

  process.env.DATABASE_URL = DB_URL;
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const { createProduct, updateProduct } = await import("../lib/services/core/catalogue-admin.service");
  const { listEligiblePublicCategoryIds } = await import("../lib/services/core/catalog.service");
  type SessionUser = import("../lib/auth/session").SessionUser;

  const runId = `STOCKAUDIT-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const stamp = runId.replace(/[^A-Z0-9]/gi, "").toLowerCase().slice(-12);
  const createdIds: string[] = [];

  try {
    const eligibleCategoryIds = await listEligiblePublicCategoryIds("NG");
    if (eligibleCategoryIds.length === 0) throw new Error("no eligible NG category is available for the fixture");
    const categoryId = eligibleCategoryIds[0];
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: { attributes: true }
    });
    if (!category) throw new Error("eligible fixture category was not found");
    const attributes: Record<string, string | number | boolean> = {};
    for (const attribute of category.attributes.filter((entry) => entry.required)) {
      if (attribute.type === "TEXT") {
        attributes[attribute.key] = `Review ${attribute.label}`;
      } else if (attribute.type === "NUMBER") {
        attributes[attribute.key] = 1;
      } else if (attribute.type === "BOOLEAN") {
        attributes[attribute.key] = true;
      } else if (attribute.type === "SELECT") {
        const options = Array.isArray(attribute.options)
          ? attribute.options.filter((option): option is string => typeof option === "string" && option.trim() !== "")
          : [];
        if (options.length === 0) throw new Error(`category attribute ${attribute.key} has no selectable options`);
        attributes[attribute.key] = options[0];
      }
    }
    const admin = await prisma.user.findFirst({ where: { email: readAdminEmail() }, select: { id: true } });
    if (!admin) throw new Error("review admin user was not found");
    const actor = { id: admin.id, scopeCountryCode: null, scopeCityCode: null } as unknown as SessionUser;

    // --- Transactional refusal below reservations --------------------------
    const simple = await createProduct({
      actor,
      name: `Review stock guard fixture ${runId}`,
      slug: `review-stock-guard-${stamp}`,
      description: "Run-owned stock-below-reserved fixture; removed by the test.",
      priceKobo: "100000",
      currency: "NGN",
      countryCode: "NG",
      categoryId,
      attributes,
      quantity: 10,
      images: [{ url: IMAGE, alt: "Review stock guard fixture" }],
      isDemo: true
    });
    createdIds.push(simple.id);
    await prisma.inventoryStock.update({ where: { productId: simple.id }, data: { reserved: 5 } });

    const updatesBefore = await prisma.auditLog.count({
      where: { entityId: simple.id, action: "catalogue.product.updated" }
    });
    let refusal: unknown = null;
    try {
      await updateProduct({ actor, id: simple.id, quantity: 4 });
    } catch (error) {
      refusal = error;
    }
    const refusalStatus = typeof refusal === "object" && refusal !== null ? (refusal as { status?: number }).status : null;
    const refusalCode = typeof refusal === "object" && refusal !== null ? (refusal as { code?: string }).code : null;
    check(
      "stock below open-order reservations is refused by the transactional guard",
      refusalStatus === 409 && refusalCode === "stock_below_reserved",
      `status=${refusalStatus} code=${refusalCode}`
    );
    const stockAfterRefusal = await prisma.inventoryStock.findUnique({ where: { productId: simple.id } });
    check(
      "the refused update leaves stock and reservations unchanged",
      stockAfterRefusal?.quantity === 10 && stockAfterRefusal?.reserved === 5,
      JSON.stringify(stockAfterRefusal)
    );
    const updatesAfter = await prisma.auditLog.count({
      where: { entityId: simple.id, action: "catalogue.product.updated" }
    });
    check(
      "the refused update writes no update audit row",
      updatesAfter === updatesBefore,
      `before=${updatesBefore} after=${updatesAfter}`
    );

    // --- Unchanged-variant audit snapshots ---------------------------------
    const variantProduct = await createProduct({
      actor,
      name: `Review variant audit fixture ${runId}`,
      slug: `review-variant-audit-${stamp}`,
      description: "Run-owned unchanged-variant audit fixture; removed by the test.",
      priceKobo: "120000",
      currency: "NGN",
      countryCode: "NG",
      categoryId,
      attributes,
      quantity: 0,
      images: [{ url: IMAGE, alt: "Review variant audit fixture" }],
      variants: [
        {
          name: "Small",
          sku: `STOCKAUDIT-${stamp}-S`,
          priceKobo: "120000",
          stock: 2,
          isActive: true,
          attributes: { Size: "Small" }
        },
        {
          name: "Large",
          sku: `STOCKAUDIT-${stamp}-L`,
          priceKobo: "140000",
          stock: 0,
          isActive: true,
          attributes: { Size: "Large" }
        }
      ],
      isDemo: true
    });
    createdIds.push(variantProduct.id);

    const createAudit = await prisma.auditLog.findFirst({
      where: { entityId: variantProduct.id, action: "catalogue.product.created" },
      orderBy: { createdAt: "desc" }
    });
    const createMetadata = (createAudit?.metadata ?? null) as {
      before?: unknown;
      after?: { name?: string };
      variants?: { before?: unknown[]; after?: unknown[] };
    } | null;
    check(
      "create audit records meaningful before/after product state",
      createMetadata?.before === null &&
        typeof createMetadata?.after?.name === "string" &&
        createMetadata.after.name.includes(runId),
      `before=${JSON.stringify(createMetadata?.before)} afterName=${createMetadata?.after?.name ?? "missing"}`
    );
    check(
      "create audit records the created variant rows",
      Array.isArray(createMetadata?.variants?.before) &&
        createMetadata?.variants?.before?.length === 0 &&
        Array.isArray(createMetadata?.variants?.after) &&
        createMetadata?.variants?.after?.length === 2,
      JSON.stringify(createMetadata?.variants ?? null)
    );

    const renamed = `${variantProduct.name} renamed`;
    await updateProduct({ actor, id: variantProduct.id, name: renamed });

    const updateAudit = await prisma.auditLog.findFirst({
      where: { entityId: variantProduct.id, action: "catalogue.product.updated" },
      orderBy: { createdAt: "desc" }
    });
    const updateMetadata = (updateAudit?.metadata ?? null) as {
      before?: { name?: string };
      after?: { name?: string };
      variants?: {
        before?: Array<{ id: string; sku: string; stock: number; isActive: boolean }>;
        after?: Array<{ id: string; sku: string; stock: number; isActive: boolean }>;
      };
    } | null;
    const actualVariants = await prisma.productVariant.findMany({
      where: { productId: variantProduct.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    const auditBefore = updateMetadata?.variants?.before ?? [];
    const auditAfter = updateMetadata?.variants?.after ?? [];
    check(
      "update without a variants payload audits the actual unchanged rows, not null",
      auditBefore.length === actualVariants.length &&
        auditAfter.length === actualVariants.length &&
        auditBefore.length === 2 &&
        auditBefore.every((row, index) => row.id === actualVariants[index].id && row.sku === actualVariants[index].sku) &&
        auditAfter.every((row, index) => row.id === actualVariants[index].id && row.stock === actualVariants[index].stock),
      `before=${auditBefore.map((row) => row.sku).join(",")} after=${auditAfter.map((row) => row.sku).join(",")}`
    );
    check(
      "update audit keeps meaningful product before/after names",
      updateMetadata?.before?.name === variantProduct.name && updateMetadata?.after?.name === renamed,
      `before=${updateMetadata?.before?.name ?? "missing"} after=${updateMetadata?.after?.name ?? "missing"}`
    );
    const variantRowsAfter = await prisma.productVariant.findMany({
      where: { productId: variantProduct.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    check(
      "the unchanged-variant update leaves every variant row intact",
      variantRowsAfter.length === 2 &&
        variantRowsAfter[0].sku === `STOCKAUDIT-${stamp.toUpperCase()}-S` &&
        variantRowsAfter[0].stock === 2 &&
        variantRowsAfter[1].sku === `STOCKAUDIT-${stamp.toUpperCase()}-L` &&
        variantRowsAfter[1].stock === 0,
      variantRowsAfter.map((row) => `${row.sku}:${row.stock}`).join(",")
    );
  } catch (error) {
    results.push({ name: "suite completed", ok: false, detail: error instanceof Error ? error.message : String(error) });
    console.error(`FAIL suite completed — ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    try {
      if (createdIds.length > 0) {
        await prisma.auditLog.deleteMany({ where: { entityId: { in: createdIds } } });
        await prisma.searchSyncEvent.deleteMany({ where: { entityId: { in: createdIds } } });
        await prisma.cartItem.deleteMany({ where: { productId: { in: createdIds } } });
        await prisma.savedItem.deleteMany({ where: { productId: { in: createdIds } } });
        await prisma.productVariant.deleteMany({ where: { productId: { in: createdIds } } });
        await prisma.inventoryStock.deleteMany({ where: { productId: { in: createdIds } } });
        await prisma.productImage.deleteMany({ where: { productId: { in: createdIds } } });
        await prisma.product.deleteMany({ where: { id: { in: createdIds } } });
      }
      const remaining = await prisma.product.count({ where: { id: { in: createdIds } } });
      check("run-owned stock/audit fixtures removed", remaining === 0, `remaining=${remaining}`);
    } catch (error) {
      results.push({
        name: "fixture cleanup",
        ok: false,
        detail: error instanceof Error ? error.message : String(error)
      });
      console.error(`FAIL fixture cleanup — ${error instanceof Error ? error.message : error}`);
    }
    await prisma.$disconnect();
  }

  const failures = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failures.length}/${results.length} checks passed.`);
  if (failures.length > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
