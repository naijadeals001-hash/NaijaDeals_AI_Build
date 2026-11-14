#!/usr/bin/env node
/**
 * REVIEW-only variant management acceptance.
 *
 * Proves the shared variant contract across the seller API, admin API and
 * publication path:
 *   - product-level stock must be zero when active variants exist;
 *   - variant stock is the only stock source for variant products;
 *   - SKU/options/price/stock/currency/ownership validation;
 *   - unsupported payloads are rejected, never ignored; per-variant imageId and
 *     imageUrl are unsupported while product-level images remain supported;
 *   - seller drafts remain unpublished; admin preview/publish remains the only
 *     publication path;
 *   - public variant selection and cart use the variant stock.
 *
 * The suite takes the exclusive REVIEW acceptance lease so it cannot overlap an
 * activation or variant-concurrency run. The lease never writes activation rows.
 *
 * Run-owned rows are deleted in `finally`. Accepted catalogue rows are counted
 * before and after; the script refuses non-REVIEW databases.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=... REVIEW_BASE_URL=http://localhost:3047 \
 *     node scripts/variant-management-tests.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

function loadReviewTestLease() {
  try {
    return require("./lib/review-test-lease.ts");
  } catch (nativeError) {
    try {
      require("tsx/cjs");
      return require("./lib/review-test-lease.ts");
    } catch (fallbackError) {
      throw new Error(
        `the review test lease module could not be loaded: ${
          (fallbackError && fallbackError.message) || (nativeError && nativeError.message) || "unknown error"
        }`
      );
    }
  }
}

let leaseModule;
try {
  leaseModule = loadReviewTestLease();
} catch (error) {
  console.error(`REFUSED ${error.message}`);
  process.exit(2);
}
const { acquireReviewTestLease, describeReviewTestLease, formatReviewTestLeaseSummary } = leaseModule;

const BASE = (process.env.REVIEW_BASE_URL || "http://localhost:3047").replace(/\/+$/, "");
const EXPECTED_DB = process.env.REVIEW_EXPECTED_DATABASE || "naijadeals_review";
const prisma = new PrismaClient();

const ADMIN_CREDENTIAL = path.join("qa-artifacts", "review-basket", ".admin-credential");
const SELLER_CREDENTIAL = path.join("qa-artifacts", "review-basket", ".seller-credential");
const CUSTOMER_CREDENTIAL = path.join("qa-artifacts", "review-basket", ".credential");

const runId = `VARIANT-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const results = [];
const created = { productIds: [], cartIds: [] };
let lease = null;

function check(name, ok, detail = "") {
  const result = { name, ok: Boolean(ok), detail: String(detail).slice(0, 500) };
  results.push(result);
  console.log(`${result.ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${result.detail}` : ""}`);
}

function credentials(file) {
  if (!fs.existsSync(file)) throw new Error(`credential file missing: ${file}`);
  const [email, password] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  if (!email || !password) throw new Error(`credential file is incomplete: ${file}`);
  return [email, password];
}

async function guard() {
  const rows = await prisma.$queryRawUnsafe("select current_database() as name");
  const name = rows[0]?.name ?? "";
  if (name !== EXPECTED_DB) throw new Error(`refusing database ${name}, expected ${EXPECTED_DB}`);
  const classification = await prisma.databaseClassification.findMany({ select: { classification: true } });
  if (!classification.some((row) => row.classification === "REVIEW")) {
    throw new Error("refusing: database is not classified REVIEW");
  }
}

async function login(email, password) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { Origin: BASE, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error(`login failed for ${email}: HTTP ${response.status}`);
  const cookies = response.headers.getSetCookie?.() ?? [];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

async function api(cookie, method, endpoint, body) {
  const response = await fetch(`${BASE}${endpoint}`, {
    method,
    headers: {
      Origin: BASE,
      Cookie: cookie,
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000)
  });
  const text = await response.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text.slice(0, 300) };
  }
  return { status: response.status, body: parsed, text };
}

function variantsFixture(label, priceKobo, stock) {
  return [
    {
      name: `${label} Small`,
      sku: `${runId}-${label}-S`.replace(/[^A-Z0-9_-]/g, "").toUpperCase(),
      priceKobo: String(priceKobo),
      stock,
      attributes: { Size: "Small", Colour: "Green" }
    },
    {
      name: `${label} Large`,
      sku: `${runId}-${label}-L`.replace(/[^A-Z0-9_-]/g, "").toUpperCase(),
      priceKobo: String(priceKobo + 20000),
      stock: stock + 1,
      attributes: { Size: "Large", Colour: "Green" }
    }
  ];
}

async function createAdminProduct(cookie, suffix, priceKobo, stock, variants, quantity = 0) {
  return api(cookie, "POST", "/api/admin/catalogue/products", {
    name: `${runId} Admin variant ${suffix}`,
    slug: `${runId.toLowerCase()}-admin-${suffix}`,
    description: "Run-owned variant contract fixture for admin publication acceptance.",
    priceKobo,
    currency: "NGN",
    countryCode: "NG",
    categoryId: (await prisma.category.findFirstOrThrow({ where: { slug: "cookware-bakeware", isActive: true } })).id,
    attributes: { material: "Stainless steel", piece_count: 2 },
    quantity,
    lowStockLevel: 2,
    images: [
      { url: "/generated/shop/product-stainless-steel-cookware-set.webp", alt: "Stainless steel cookware set", order: 0, primary: true }
    ],
    variants,
    isDemo: true
  });
}

async function createSellerProduct(cookie, suffix, priceKobo, stock, variants, quantity = 0) {
  return api(cookie, "POST", "/api/seller/products", {
    name: `${runId} Seller variant ${suffix}`,
    description: "Run-owned variant contract fixture for seller draft acceptance.",
    categoryId: (await prisma.category.findFirstOrThrow({ where: { slug: "cookware-bakeware", isActive: true } })).id,
    priceKobo,
    quantity,
    attributes: { material: "Stainless steel", piece_count: 2 },
    images: [
      { url: "/generated/shop/product-stainless-steel-cookware-set.webp", alt: "Stainless steel cookware set", order: 0, primary: true }
    ],
    variants
  });
}

async function main() {
  await guard();
  try {
    lease = acquireReviewTestLease({
      owner: "variant-management-tests",
      runId,
      purpose: `Variant management acceptance on ${EXPECTED_DB}`,
      database: EXPECTED_DB,
      classification: "REVIEW"
    });
    console.log(`LEASE ${describeReviewTestLease(lease.path)}`);
    if (lease.takeover) console.log(`LEASE takeover from ${formatReviewTestLeaseSummary(lease.takeover)}`);
  } catch (error) {
    if (lease) lease.releaseSync();
    console.error(`REFUSED ${error.message}`);
    await prisma.$disconnect();
    process.exit(2);
  }

  const releaseLeaseSync = () => {
    try {
      return Boolean(lease && lease.releaseSync());
    } catch {
      return false;
    }
  };
  let signalHandled = false;
  const handleSignal = (signal) => {
    if (signalHandled) return;
    signalHandled = true;
    releaseLeaseSync();
    console.error(`\n${signal}: review test lease released; exiting.`);
    process.exit(130);
  };
  const onSigint = () => handleSignal("SIGINT");
  const onSigterm = () => handleSignal("SIGTERM");
  const onSigbreak = () => handleSignal("SIGBREAK");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  if (process.platform === "win32") process.once("SIGBREAK", onSigbreak);

  const [adminEmail, adminPassword] = credentials(ADMIN_CREDENTIAL);
  const [sellerEmail, sellerPassword] = credentials(SELLER_CREDENTIAL);
  const [customerEmail, customerPassword] = credentials(CUSTOMER_CREDENTIAL);
  const adminCookie = await login(adminEmail, adminPassword);
  const sellerCookie = await login(sellerEmail, sellerPassword);
  const customerCookie = await login(customerEmail, customerPassword);

  const baseline = {
    products: await prisma.product.count(),
    active: await prisma.product.count({ where: { status: "ACTIVE" } }),
    variants: await prisma.productVariant.count()
  };

  try {
    /* ---------------- unsupported / conflicting payloads ---------------- */
    const nonArray = await createAdminProduct(adminCookie, "nonarray", 100000, 1, "not-an-array", 0);
    check(
      "admin rejects a non-array variants payload",
      nonArray.status === 400 && nonArray.body?.code === "invalid_variants",
      `status=${nonArray.status} code=${nonArray.body?.code}`
    );

    const badSku = variantsFixture("BADSKU", 100000, 1);
    badSku[0].sku = "bad sku!";
    const invalidSku = await createAdminProduct(adminCookie, "badsku", 100000, 0, badSku, 0);
    check(
      "admin rejects an invalid variant SKU",
      invalidSku.status === 400 && invalidSku.body?.code === "invalid_variant_sku",
      `status=${invalidSku.status} code=${invalidSku.body?.code}`
    );

    const conflict = await createAdminProduct(adminCookie, "conflict", 100000, 1, variantsFixture("CONFLICT", 100000, 2), 1);
    check(
      "admin rejects product stock with active variants",
      conflict.status === 400 && conflict.body?.code === "variant_stock_conflict",
      `status=${conflict.status} code=${conflict.body?.code}`
    );

    const invalidImageUrl = variantsFixture("BADIMAGE", 100000, 1);
    invalidImageUrl[0].imageUrl = "/generated/shop/product-stainless-steel-cookware-set.webp";
    const badImageUrl = await createAdminProduct(adminCookie, "badimage", 100000, 0, invalidImageUrl, 0);
    check(
      "admin rejects a per-variant imageUrl as unsupported",
      badImageUrl.status === 400 &&
        badImageUrl.body?.code === "unsupported_variant_field" &&
        /imageUrl/.test(String(badImageUrl.body?.error ?? "")),
      `status=${badImageUrl.status} code=${badImageUrl.body?.code} error=${JSON.stringify(badImageUrl.body?.error ?? "")}`
    );

    const unsupported = variantsFixture("UNSUPPORTED", 100000, 1);
    unsupported[0].imageId = "some-image-id";
    const unsupportedField = await createAdminProduct(adminCookie, "unsupported", 100000, 0, unsupported, 0);
    check(
      "admin rejects a per-variant imageId as unsupported",
      unsupportedField.status === 400 &&
        unsupportedField.body?.code === "unsupported_variant_field" &&
        /imageId/.test(String(unsupportedField.body?.error ?? "")),
      `status=${unsupportedField.status} code=${unsupportedField.body?.code} error=${JSON.stringify(
        unsupportedField.body?.error ?? ""
      )}`
    );

    const duplicate = variantsFixture("DUP", 100000, 2);
    duplicate[1].sku = duplicate[0].sku;
    const duplicateSku = await createAdminProduct(adminCookie, "duplicate", 100000, 0, duplicate, 0);
    check(
      "admin rejects duplicate variant SKUs",
      duplicateSku.status === 400 && duplicateSku.body?.code === "duplicate_variant_sku",
      `status=${duplicateSku.status} code=${duplicateSku.body?.code}`
    );

    /* ---------------- one-save product-stock transition ---------------- */
    const transitionCreate = await createAdminProduct(adminCookie, "transition", 100000, 2, undefined, 2);
    const transitionId = transitionCreate.body?.id ?? null;
    if (transitionId) created.productIds.push(transitionId);
    const transition = transitionId
      ? await api(adminCookie, "PATCH", "/api/admin/catalogue/products", {
          id: transitionId,
          quantity: 0,
          variants: variantsFixture("TRANSITION", 100000, 2)
        })
      : { status: 0, body: {} };
    const transitionRow = (await api(adminCookie, "GET", "/api/admin/catalogue")).body?.products?.find(
      (entry) => entry.id === transitionId
    );
    check(
      "stocked product can become a variant product in one explicit save",
      transition.status === 200 && transitionRow?.stock?.quantity === 0 && transitionRow?.variants?.length === 2,
      `status=${transition.status} quantity=${transitionRow?.stock?.quantity} variants=${transitionRow?.variants?.length}`
    );

    /* ---------------- admin create → preview → publish ---------------- */
    const adminVariants = variantsFixture("ADMIN", 125000, 4);
    const adminCreate = await createAdminProduct(adminCookie, "main", 125000, 0, adminVariants, 0);
    const adminId = adminCreate.body?.id ?? null;
    if (adminId) created.productIds.push(adminId);
    check("admin creates a draft with variants", adminCreate.status === 201 && adminCreate.body?.status === "DRAFT", `status=${adminCreate.status} code=${adminCreate.body?.code ?? ""}`);
    check("admin create response returns the variants", adminCreate.body?.variants?.length === 2, `variants=${adminCreate.body?.variants?.length}`);

    const adminList = await api(adminCookie, "GET", "/api/admin/catalogue");
    const adminRow = (adminList.body?.products || []).find((entry) => entry.id === adminId);
    check("admin catalogue returns the created variants", adminRow?.variants?.length === 2, `variants=${adminRow?.variants?.length}`);
    check("admin catalogue returns variant options", adminRow?.variants?.[0]?.attributes?.Size === "Small", JSON.stringify(adminRow?.variants?.[0]?.attributes));
    const adminVariantImageKeys = (adminRow?.variants ?? []).flatMap((variant) =>
      ["imageUrl", "imageId"].filter((key) => key in variant)
    );
    const adminVariantImageClaims = (adminRow?.variants ?? []).flatMap((variant) =>
      ["imageUrl", "imageId"].filter((key) => variant[key] !== null && variant[key] !== undefined)
    );
    check(
      "admin catalogue variant rows expose no per-variant image claim",
      adminRow?.variants?.length === 2 && adminVariantImageClaims.length === 0,
      `variants=${adminRow?.variants?.length} keys=${JSON.stringify(
        adminVariantImageKeys
      )} claims=${JSON.stringify(adminVariantImageClaims)}`
    );
    check(
      "admin catalogue retains the product-level gallery",
      (adminRow?.images ?? []).some((image) => image.url === "/generated/shop/product-stainless-steel-cookware-set.webp"),
      `urls=${JSON.stringify((adminRow?.images ?? []).map((image) => image.url))}`
    );
    check("variant product keeps product-level stock at zero", adminRow?.stock?.quantity === 0, `quantity=${adminRow?.stock?.quantity}`);

    const preview = await api(adminCookie, "GET", `/admin/catalogue/products/${adminId}/preview`);
    check("authorized variant draft preview renders", preview.status === 200 && preview.text.includes(`${runId} Admin variant main`), `status=${preview.status}`);

    const variantUpdate = await api(adminCookie, "PATCH", "/api/admin/catalogue/products", {
      id: adminId,
      quantity: 0,
      variants: [
        { id: adminRow.variants[0].id, name: "Admin Small revised", sku: adminRow.variants[0].sku, priceKobo: "135000", stock: 6, isActive: true, attributes: { Size: "Small" } },
        { id: adminRow.variants[1].id, name: "Admin Large revised", sku: adminRow.variants[1].sku, priceKobo: "155000", stock: 3, isActive: true, attributes: { Size: "Large" } },
        { name: "Admin Medium", sku: `${runId}-ADMIN-M`, priceKobo: "145000", stock: 2, isActive: true, attributes: { Size: "Medium" } }
      ]
    });
    check("admin edits and adds variants", variantUpdate.status === 200, `status=${variantUpdate.status} code=${variantUpdate.body?.code}`);

    const stockManaged = await api(adminCookie, "PATCH", "/api/admin/catalogue/products", { id: adminId, quantity: 3 });
    check(
      "admin cannot set product-level stock while variants are active",
      stockManaged.status === 409 && stockManaged.body?.code === "variant_stock_managed",
      `status=${stockManaged.status} code=${stockManaged.body?.code}`
    );

    const validation = await api(adminCookie, "PATCH", "/api/admin/catalogue/products", { id: adminId, action: "validate" });
    check("variant draft validates", validation.status === 200 && validation.body?.valid === true, `status=${validation.status} issues=${JSON.stringify(validation.body?.issues ?? [])}`);

    const publish = await api(adminCookie, "PATCH", "/api/admin/catalogue/products", { id: adminId, action: "publish" });
    check("admin publishes the variant product", publish.status === 200 && publish.body?.status === "ACTIVE", `status=${publish.status} code=${publish.body?.code}`);

    const publicDetail = await api("", "GET", `/api/products/${adminRow.slug}`);
    check("public detail exposes active variants", publicDetail.status === 200 && publicDetail.body?.variants?.length === 3, `status=${publicDetail.status} variants=${publicDetail.body?.variants?.length}`);
    const publicVariant = publicDetail.body?.variants?.find((variant) => variant.name === "Admin Small revised");
    check("public variant price/stock comes from the variant", publicVariant?.priceKobo === "135000" && publicVariant?.stock === 6, JSON.stringify(publicVariant));
    const publicVariantImageKeys = ["imageUrl", "imageId"].filter((key) => publicVariant && key in publicVariant);
    const publicVariantImageClaims = ["imageUrl", "imageId"].filter(
      (key) => publicVariant && publicVariant[key] !== null && publicVariant[key] !== undefined
    );
    check(
      "public variant payload exposes no per-variant image claim",
      Boolean(publicVariant) && publicVariantImageClaims.length === 0,
      `keys=${JSON.stringify(publicVariantImageKeys)} claims=${JSON.stringify(publicVariantImageClaims)}`
    );
    check(
      "public product detail retains its product-level gallery",
      (publicDetail.body?.images ?? []).some(
        (image) => image.url === "/generated/shop/product-stainless-steel-cookware-set.webp"
      ),
      `urls=${JSON.stringify((publicDetail.body?.images ?? []).map((image) => image.url))}`
    );

    const cart = await api(customerCookie, "POST", "/api/cart/items", { productId: adminId, variantId: publicVariant?.id, quantity: 1 });
    check("cart accepts the selected variant", cart.status === 201 && cart.body?.items?.some((item) => item.variantId === publicVariant?.id), `status=${cart.status} code=${cart.body?.code ?? ""}`);

    /* ---------------- seller create/edit → admin publish ---------------- */
    const sellerCreate = await createSellerProduct(sellerCookie, "main", 95000, 0, variantsFixture("SELLER", 95000, 3), 0);
    const sellerId = sellerCreate.body?.id ?? null;
    if (sellerId) created.productIds.push(sellerId);
    check("seller creates a draft with variants", sellerCreate.status === 201 && sellerCreate.body?.status === "DRAFT", `status=${sellerCreate.status} code=${sellerCreate.body?.code ?? ""}`);
    check("seller create response returns the variants", sellerCreate.body?.variants?.length === 2, `variants=${sellerCreate.body?.variants?.length}`);

    const sellerOverview = await api(sellerCookie, "GET", "/api/seller/overview");
    const sellerRow = (sellerOverview.body?.products || []).find((entry) => entry.id === sellerId);
    check("seller overview returns the variants", sellerRow?.variants?.length === 2, `variants=${sellerRow?.variants?.length}`);

    const sellerEdit = await api(sellerCookie, "PATCH", `/api/seller/products/${sellerId}`, {
      variants: sellerRow.variants.map((variant, index) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        priceKobo: index === 0 ? "99000" : "119000",
        stock: index === 0 ? 5 : 1,
        isActive: true,
        attributes: variant.attributes
      }))
    });
    check("seller edits variant price and stock", sellerEdit.status === 200, `status=${sellerEdit.status} code=${sellerEdit.body?.code}`);

    const sellerStockManaged = await api(sellerCookie, "PATCH", `/api/seller/products/${sellerId}`, { quantity: 4 });
    check(
      "seller cannot set product-level stock while variants are active",
      sellerStockManaged.status === 409 && sellerStockManaged.body?.code === "variant_stock_managed",
      `status=${sellerStockManaged.status} code=${sellerStockManaged.body?.code}`
    );

    const sellerPublish = await api(sellerCookie, "PATCH", `/api/seller/products/${sellerId}`, { status: "ACTIVE" });
    check("seller still cannot publish", sellerPublish.status === 403 && sellerPublish.body?.code === "admin_publication_required", `status=${sellerPublish.status} code=${sellerPublish.body?.code}`);

    const adminPublishSeller = await api(adminCookie, "PATCH", "/api/admin/catalogue/products", { id: sellerId, action: "publish" });
    check("admin publishes the seller variant draft", adminPublishSeller.status === 200, `status=${adminPublishSeller.status} code=${adminPublishSeller.body?.code}`);

    /* ---------------- accepted rows unchanged ---------------- */
    const after = {
      products: await prisma.product.count(),
      active: await prisma.product.count({ where: { status: "ACTIVE" } }),
      variants: await prisma.productVariant.count()
    };
    check(
      "accepted catalogue counts remain unchanged by the suite",
      after.products === baseline.products + created.productIds.length &&
        after.active === baseline.active + 2 &&
        after.variants === baseline.variants + 7,
      `before=${JSON.stringify(baseline)} after=${JSON.stringify(after)}`
    );
  } finally {
    try {
      // A refusal assertion that unexpectedly succeeded (for example an older
      // runtime storing a per-variant imageUrl) persists a run-named product
      // that was never added to `created`. Sweep it so cleanup does not hide
      // the unexpected write.
      const strayProducts = await prisma.product.findMany({
        where: { name: { startsWith: runId } },
        select: { id: true }
      });
      for (const stray of strayProducts) {
        if (!created.productIds.includes(stray.id)) created.productIds.push(stray.id);
      }
      for (const productId of created.productIds) {
        await prisma.cartItem.deleteMany({ where: { productId } });
        await prisma.productVariant.deleteMany({ where: { productId } });
        await prisma.productImage.deleteMany({ where: { productId } });
        await prisma.inventoryStock.deleteMany({ where: { productId } });
        await prisma.product.delete({ where: { id: productId } });
      }
    } catch (error) {
      console.error(`CLEANUP ${error.message}`);
    }
    const released = releaseLeaseSync();
    if (!released) console.error(`LEASE WARN the review test lease was not released: ${describeReviewTestLease(lease ? lease.path : undefined)}`);
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    if (process.platform === "win32") process.off("SIGBREAK", onSigbreak);
    await prisma.$disconnect();
    const failed = results.filter((entry) => !entry.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed (run ${runId})`);
    process.exit(failed.length ? 1 : 0);
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
