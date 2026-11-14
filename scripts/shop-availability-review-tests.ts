/**
 * REVIEW-only shop availability and paused-storefront privacy acceptance.
 *
 * Proves, against the served review build and the REVIEW database:
 *   - the homepage rail selects variant products by variant availability and
 *     never falls back to product-level stock when active variants exist;
 *   - a deliberately non-empty run-owned rail is not present in anonymous
 *     HTML/RSC while Shop is PREVIEW or DISABLED (authorized staff keep the
 *     PREVIEW behaviour by design);
 *   - activation rows and every run-owned fixture are restored/removed.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=... REVIEW_BASE_URL=http://localhost:3047 \
 *     npx tsx scripts/shop-availability-review-tests.ts
 *
 * REVIEW_DATABASE_URL is mandatory; .env/DATABASE_URL are never used as a
 * fallback. The guard verifies the actual database name and the REVIEW
 * classification before the first write.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";

const BASE = (process.env.REVIEW_BASE_URL || "http://localhost:3047").replace(/\/+$/, "");
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || "nd_session";
const DB_URL = (process.env.REVIEW_DATABASE_URL || "").trim();
const EXPECTED_DB = (process.env.REVIEW_EXPECTED_DATABASE || "naijadeals_review").trim();
const ADMIN_CREDENTIAL = "qa-artifacts/review-basket/.admin-credential";
const IMAGE = "/generated/shop/category-home-kitchen.webp";
const ACTIVATION_WAIT_MS = 6_000;

if (!DB_URL) throw new Error("REVIEW_DATABASE_URL is required; DATABASE_URL and .env are never used as a fallback.");

type CheckResult = { name: string; ok: boolean; detail: string };
const results: CheckResult[] = [];

function check(name: string, ok: unknown, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 500) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${String(detail).slice(0, 500)}` : ""}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readAdminEmail() {
  const lines = readFileSync(ADMIN_CREDENTIAL, "utf8").trim().split(/\r?\n/);
  if (!lines[0]) throw new Error("admin credential email missing");
  return lines[0].trim().toLowerCase();
}

async function http(path: string, cookie?: string, rsc = false) {
  const response = await fetch(`${BASE}${path}`, {
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(rsc ? { RSC: "1" } : {})
    },
    redirect: "manual",
    signal: AbortSignal.timeout(60_000)
  });
  const text = await response.text();
  return { status: response.status, type: response.headers.get("content-type") ?? "", text };
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
  const { listEligiblePublicCategoryIds } = await import("../lib/services/core/catalog.service");

  const runId = `SHOPAVAIL-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const stamp = runId.replace(/[^A-Z0-9]/gi, "").toLowerCase().slice(-12);
  const created = {
    productIds: [] as string[],
    vendorId: null as string | null,
    ownerId: null as string | null,
    tokenHash: null as string | null
  };
  let activationCaptured = false;
  let activationSnapshot: Array<{
    id: string;
    verticalKey: string;
    scopeType: string;
    countryCode: string;
    cityCode: string;
    status: string;
    reason: string | null;
    updatedById: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  async function replaceShopActivation(status: "PREVIEW" | "DISABLED") {
    await prisma.verticalActivation.deleteMany({ where: { verticalKey: "shop" } });
    await prisma.verticalActivation.create({
      data: {
        verticalKey: "shop",
        scopeType: "GLOBAL",
        countryCode: "",
        cityCode: "",
        status,
        reason: `shop availability review ${runId}`
      }
    });
    // The served process caches activation rows for five seconds.
    await sleep(ACTIVATION_WAIT_MS);
  }

  async function restoreShopActivation() {
    await prisma.verticalActivation.deleteMany({ where: { verticalKey: "shop" } });
    for (const row of activationSnapshot) {
      await prisma.verticalActivation.create({
        data: {
          id: row.id,
          verticalKey: row.verticalKey,
          scopeType: row.scopeType,
          countryCode: row.countryCode,
          cityCode: row.cityCode,
          status: row.status as never,
          reason: row.reason,
          updatedById: row.updatedById,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt
        }
      });
    }
    await sleep(ACTIVATION_WAIT_MS);
  }

  function leaks(text: string, fixtures: Array<{ name: string; slug: string; image: string }>) {
    return fixtures.flatMap((fixture) =>
      [
        ["name", fixture.name],
        ["slug", fixture.slug],
        ["image", fixture.image]
      ]
        .filter(([, value]) => text.includes(value))
        .map(([kind, value]) => `${kind}:${value}`)
    );
  }

  try {
    const eligibleCategoryIds = await listEligiblePublicCategoryIds("NG");
    if (eligibleCategoryIds.length === 0) throw new Error("no eligible NG category is available for the fixture rail");
    const categoryId = eligibleCategoryIds[0];
    const adminEmail = readAdminEmail();
    const admin = await prisma.user.findFirst({ where: { email: adminEmail }, select: { id: true } });
    if (!admin) throw new Error("review admin user was not found");

    activationSnapshot = await prisma.verticalActivation.findMany({ where: { verticalKey: "shop" } });
    activationCaptured = true;

    const owner = await prisma.user.create({
      data: {
        email: `review-shop-availability-${stamp}@review.invalid`,
        name: `Review Shop Availability Seller ${stamp}`,
        actorType: "CUSTOMER"
      },
      select: { id: true }
    });
    created.ownerId = owner.id;
    const vendor = await prisma.vendor.create({
      data: {
        ownerId: owner.id,
        name: `Review Shop Availability Seller ${stamp}`,
        slug: `review-shop-availability-${stamp}`,
        market: "Lagos",
        description: "Run-owned availability fixture seller; removed by the test.",
        pickupAddress: "Review fixture pickup address",
        pickupPhone: "+2348000000000",
        countryCode: "NG",
        status: "VERIFIED",
        commissionBps: 0
      },
      select: { id: true }
    });
    created.vendorId = vendor.id;

    async function createProduct(input: {
      label: string;
      productStock: number;
      variants: Array<{ name: string; sku: string; priceKobo: bigint; stock: number; reserved: number; isActive: boolean }>;
    }) {
      const product = await prisma.product.create({
        data: {
          vendorId: vendor.id,
          categoryId,
          name: `Review availability ${input.label} ${runId}`,
          slug: `review-availability-${input.label.toLowerCase()}-${stamp}`,
          description: "Run-owned homepage availability fixture; removed by the test.",
          priceKobo: BigInt(500_000),
          countryCode: "NG",
          status: "ACTIVE",
          isSample: false,
          isDemo: false,
          images: {
            create: [
              {
                url: `${IMAGE}?review=${input.label.toLowerCase()}-${stamp}`,
                alt: `Availability fixture ${input.label}`,
                sortOrder: 0
              }
            ]
          },
          stock: { create: { quantity: input.productStock, reserved: 0 } },
          ...(input.variants.length > 0
            ? {
                variants: {
                  create: input.variants.map((variant) => ({
                    name: variant.name,
                    sku: variant.sku,
                    priceKobo: variant.priceKobo,
                    stock: variant.stock,
                    reserved: variant.reserved,
                    isActive: variant.isActive
                  }))
                }
              }
            : {})
        },
        include: { images: true }
      });
      created.productIds.push(product.id);
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        image: product.images[0].url
      };
    }

    const variantProduct = await createProduct({
      label: "Variant-Live",
      productStock: 0,
      variants: [
        { name: "Small", sku: `SHOPAVAIL-${stamp}-A1`, priceKobo: BigInt(500_000), stock: 4, reserved: 0, isActive: true }
      ]
    });
    const simpleProduct = await createProduct({
      label: "Simple-Live",
      productStock: 3,
      variants: []
    });
    const productStockOnlyVariant = await createProduct({
      label: "Variant-Empty",
      productStock: 9,
      variants: [
        { name: "Large", sku: `SHOPAVAIL-${stamp}-B1`, priceKobo: BigInt(500_000), stock: 0, reserved: 0, isActive: true }
      ]
    });
    const fixtures = [variantProduct, simpleProduct, productStockOnlyVariant];

    const token = randomBytes(32).toString("base64url");
    created.tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.session.create({
      data: {
        userId: admin.id,
        tokenHash: created.tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        userAgent: `shop-availability-review ${runId}`
      }
    });
    const adminCookie = `${SESSION_COOKIE}=${token}`;

    // --- Live Shop: homepage rail selection --------------------------------
    const liveAnon = await http("/");
    check("live anonymous homepage responds", liveAnon.status === 200, `status=${liveAnon.status}`);
    check(
      "homepage rail includes the run-owned variant and simple products",
      liveAnon.text.includes(variantProduct.name) && liveAnon.text.includes(simpleProduct.name),
      `variant=${liveAnon.text.includes(variantProduct.name)} simple=${liveAnon.text.includes(simpleProduct.name)}`
    );
    check(
      "homepage rail excludes a variant product whose product-level stock is not sellable variant stock",
      !liveAnon.text.includes(productStockOnlyVariant.name) && !liveAnon.text.includes(productStockOnlyVariant.slug),
      `name=${liveAnon.text.includes(productStockOnlyVariant.name)} slug=${liveAnon.text.includes(productStockOnlyVariant.slug)}`
    );

    // --- PREVIEW: anonymous must not receive rail data ---------------------
    await replaceShopActivation("PREVIEW");
    const previewAnon = await http("/");
    const previewLeaks = leaks(previewAnon.text, fixtures);
    check("PREVIEW anonymous homepage responds", previewAnon.status === 200, `status=${previewAnon.status}`);
    check(
      "PREVIEW anonymous HTML contains no run-owned product name, slug or image",
      previewLeaks.length === 0,
      previewLeaks.join(",") || "clean"
    );
    const previewRsc = await http(`/?_rsc=${stamp}`, undefined, true);
    const previewRscLeaks = leaks(previewRsc.text, fixtures);
    check(
      "PREVIEW anonymous RSC payload contains no run-owned product name, slug or image",
      previewRsc.status === 200 && previewRscLeaks.length === 0,
      `status=${previewRsc.status} type=${previewRsc.type} leaks=${previewRscLeaks.join(",") || "clean"}`
    );
    const previewStaff = await http("/", adminCookie);
    check(
      "authorized staff still see the PREVIEW rail as designed",
      previewStaff.status === 200 &&
        previewStaff.text.includes(variantProduct.name) &&
        previewStaff.text.includes(simpleProduct.name),
      `status=${previewStaff.status} variant=${previewStaff.text.includes(variantProduct.name)} simple=${previewStaff.text.includes(simpleProduct.name)}`
    );

    // --- DISABLED: neither anonymous nor staff receive rail data -----------
    await replaceShopActivation("DISABLED");
    const disabledAnon = await http("/");
    const disabledLeaks = leaks(disabledAnon.text, fixtures);
    check("DISABLED anonymous homepage responds", disabledAnon.status === 200, `status=${disabledAnon.status}`);
    check(
      "DISABLED anonymous HTML contains no run-owned product name, slug or image",
      disabledLeaks.length === 0,
      disabledLeaks.join(",") || "clean"
    );
    const disabledRsc = await http(`/?_rsc=${stamp}`, undefined, true);
    const disabledRscLeaks = leaks(disabledRsc.text, fixtures);
    check(
      "DISABLED anonymous RSC payload contains no run-owned product name, slug or image",
      disabledRsc.status === 200 && disabledRscLeaks.length === 0,
      `status=${disabledRsc.status} type=${disabledRsc.type} leaks=${disabledRscLeaks.join(",") || "clean"}`
    );
    const disabledStaff = await http("/", adminCookie);
    const disabledStaffLeaks = leaks(disabledStaff.text, fixtures);
    check(
      "DISABLED staff HTML contains no run-owned product name, slug or image",
      disabledStaff.status === 200 && disabledStaffLeaks.length === 0,
      `status=${disabledStaff.status} leaks=${disabledStaffLeaks.join(",") || "clean"}`
    );
  } catch (error) {
    results.push({ name: "suite completed", ok: false, detail: error instanceof Error ? error.message : String(error) });
    console.error(`FAIL suite completed — ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    try {
      if (activationCaptured) await restoreShopActivation();
    } catch (error) {
      results.push({
        name: "activation rows restored",
        ok: false,
        detail: error instanceof Error ? error.message : String(error)
      });
      console.error(`FAIL activation rows restored — ${error instanceof Error ? error.message : error}`);
    }
    try {
      if (created.tokenHash) await prisma.session.deleteMany({ where: { tokenHash: created.tokenHash } });
      if (created.productIds.length > 0) {
        await prisma.searchSyncEvent.deleteMany({ where: { entityId: { in: created.productIds } } });
        await prisma.cartItem.deleteMany({ where: { productId: { in: created.productIds } } });
        await prisma.savedItem.deleteMany({ where: { productId: { in: created.productIds } } });
        await prisma.productVariant.deleteMany({ where: { productId: { in: created.productIds } } });
        await prisma.inventoryStock.deleteMany({ where: { productId: { in: created.productIds } } });
        await prisma.productImage.deleteMany({ where: { productId: { in: created.productIds } } });
        await prisma.product.deleteMany({ where: { id: { in: created.productIds } } });
      }
      if (created.vendorId) {
        await prisma.vendor.deleteMany({ where: { id: created.vendorId } });
      }
      if (created.ownerId) {
        await prisma.user.deleteMany({ where: { id: created.ownerId } });
      }
      const remainingProducts = await prisma.product.count({ where: { id: { in: created.productIds } } });
      check("run-owned product fixtures removed", remainingProducts === 0, `remaining=${remainingProducts}`);
      const remainingShopRows = await prisma.verticalActivation.count({ where: { verticalKey: "shop" } });
      check(
        "shop activation rows restored to the captured state",
        !activationCaptured || remainingShopRows === activationSnapshot.length,
        `rows=${remainingShopRows} expected=${activationSnapshot.length} captured=${activationCaptured}`
      );
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
