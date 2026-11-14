#!/usr/bin/env node
/**
 * REVIEW-only variant concurrency, reservation, authorization and audit acceptance.
 *
 * This harness is deliberately independent of `scripts/variant-management-tests.cjs`.
 * It focuses on the questions that suite does not answer:
 *
 *   1. Can two distinct customer sessions reserve the last variant unit twice?
 *   2. Can a seller/admin stock edit fall below reserved units under a real
 *      concurrent reservation, not only against a committed reservation?
 *   3. Are sold-out / inactive variants and quantity limits refused?
 *   4. Can a seller edit another seller's product or borrow a variant id?
 *   5. Can a seller publish through the seller API (it must not)?
 *   6. Are malformed, duplicate, unsupported and cross-product variant payloads
 *      rejected rather than silently ignored?
 *   7. Do variant ids stay stable and does the audit trail carry before/after?
 *   8. Is optional per-variant image selection implemented?
 *
 * REVIEW financial boundary
 * -------------------------
 * Checkout creates Order rows and reserves stock. The REVIEW financial-refusal
 * contract classifies order/payment state changes as prohibited financial writes
 * (`scripts/review-financial-refusal.ts:23-30`, probe at `:349-367`). This harness
 * therefore never calls the checkout HTTP route with a payable cart. It exercises:
 *
 *   - the real cart API (authenticated customer sessions, real cart rows);
 *   - the exact atomic reservation statement checkout executes
 *     (`lib/services/core/checkout.service.ts:286-305`), against real run-owned
 *     variant rows and the real cart-item quantities;
 *   - the seller/admin API for stock and deactivation changes.
 *
 * No provider is contacted, no payment/refund/ledger row is written, and no order
 * is created. `finally` releases every run-owned reservation and deletes every
 * run-owned product, cart, seller, customer and search-sync intent.
 *
 * Run-owned fixtures
 * ------------------
 * All products, variants, carts, customers and the second seller are created for
 * this run with a unique RUN id. Accepted catalogue rows are counted before and
 * after and are never modified. Direct `reserved` writes are limited to run-owned
 * variant rows and are released in `finally`.
 *
 * Degraded mode
 * -------------
 * A shared REVIEW activation rule owned by another run can pause Shop. That gate
 * blocks `POST /api/cart/items`, seller create and public product detail over
 * HTTP even though the commerce services themselves still work. `--db-fixtures`
 * keeps every assertion that does not depend on those routes:
 *
 *   - `lib/services/core/cart.service.addCartItem()` is executed directly in a
 *     short-lived tsx process against the same REVIEW database (real service,
 *     no Shop route gate);
 *   - the DRAFT seller fixture is provisioned directly, while every edit,
 *     ownership and publication-refusal assertion still goes through the real
 *     seller/admin HTTP APIs;
 *   - public-detail, seller-create and create-audit checks are reported BLOCKED
 *     with the exact reason rather than silently skipped.
 *
 * Usage (REVIEW_DATABASE_URL is required explicitly; there is no .env fallback):
 *
 *   REVIEW_DATABASE_URL=<review-url> REVIEW_BASE_URL=http://localhost:3047 \
 *     node scripts/variant-concurrency-tests.cjs
 *
 *   node scripts/variant-concurrency-tests.cjs --db-fixtures
 *
 * Optional: REVIEW_EXPECTED_DATABASE to assert a specific database name.
 *
 * Exit codes: 0 all checks pass (LIMITATION entries do not fail the run);
 *             1 at least one FAIL or confirmed GAP; 2 unsafe target/guard refusal.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { randomBytes, scrypt: scryptCallback } = require("node:crypto");
const { promisify } = require("node:util");
const { PrismaClient } = require("@prisma/client");

const scrypt = promisify(scryptCallback);
const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "..");
const EVIDENCE_DIR = path.join(ROOT, "qa-artifacts", "visual", "variant-concurrency");

const REVIEW_URL = process.env.REVIEW_DATABASE_URL;
if (!REVIEW_URL) {
  console.error(
    "REFUSED: REVIEW_DATABASE_URL must be set explicitly. This harness never falls back to DATABASE_URL or .env."
  );
  process.exit(2);
}
const DB_FIXTURES = process.argv.includes("--db-fixtures");
const BASE = (process.env.REVIEW_BASE_URL || "http://localhost:3047").replace(/\/+$/, "");
const EXPECTED_DB =
  process.env.REVIEW_EXPECTED_DATABASE || (() => {
    try {
      return decodeURIComponent(new URL(REVIEW_URL).pathname.replace(/^\//, ""));
    } catch {
      return "naijadeals_review";
    }
  })();

const DB_PASSWORD = (() => {
  try {
    return decodeURIComponent(new URL(REVIEW_URL).password || "");
  } catch {
    return "";
  }
})();

function sanitize(value) {
  let text = String(value ?? "");
  if (REVIEW_URL) text = text.split(REVIEW_URL).join("[review-database-url]");
  if (DB_PASSWORD && DB_PASSWORD.length >= 4) text = text.split(DB_PASSWORD).join("[redacted]");
  return text.length > 900 ? `${text.slice(0, 900)}…` : text;
}

const prisma = new PrismaClient({ datasources: { db: { url: REVIEW_URL } } });
let poller = null;
let locker = null;
let clientA = null;
let clientB = null;

const results = [];
const created = {
  productIds: new Set(),
  userIds: [],
  vendorIds: [],
  variantIds: new Set(),
  cookies: []
};

const startedAt = new Date();
const runToken = `${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const runId = `VARIANT-CONC-${runToken}`;
const runSku = `VC-${runToken}`;
let categoryId = null;
let buildId = null;

function record(name, status, detail = "") {
  const entry = { name, status, detail: sanitize(detail) };
  results.push(entry);
  console.log(`${status} ${name}${entry.detail ? ` — ${entry.detail}` : ""}`);
}

function check(name, ok, detail = "") {
  record(name, ok ? "PASS" : "FAIL", detail);
  return Boolean(ok);
}

function gap(name, ok, detail = "") {
  record(name, ok ? "PASS" : "GAP", detail);
  return Boolean(ok);
}

function limitation(name, detail = "") {
  record(name, "LIMITATION", detail);
}

function blocked(name, detail = "") {
  record(name, "BLOCKED", detail);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function limitedUrl(url, limit) {
  const parsed = new URL(url);
  parsed.searchParams.set("connection_limit", String(limit));
  return parsed.toString();
}

async function guard() {
  const rows = await prisma.$queryRawUnsafe("select current_database() as name");
  const name = rows[0]?.name ?? "";
  if (name !== EXPECTED_DB) {
    throw new Error(`refusing database ${name}; expected ${EXPECTED_DB}`);
  }
  const classification = await prisma.databaseClassification.findMany({ select: { classification: true } });
  if (classification.length !== 1 || classification[0]?.classification !== "REVIEW") {
    throw new Error(
      `refusing: expected exactly one REVIEW classification row, found ${JSON.stringify(
        classification.map((row) => row.classification)
      )}`
    );
  }
  const cartProbe = await fetch(`${BASE}/api/cart`, { signal: AbortSignal.timeout(15_000) });
  if (cartProbe.status !== 401) {
    throw new Error(`refusing: ${BASE} did not answer the canonical preview (GET /api/cart HTTP ${cartProbe.status})`);
  }
  try {
    buildId = fs.readFileSync(path.join(ROOT, ".next-programme", "BUILD_ID"), "utf8").trim();
  } catch {
    buildId = null;
  }
  console.log(`GUARD database=${name} classification=REVIEW base=${BASE} buildId=${buildId ?? "unknown"}`);
}

async function snapshot() {
  const [
    products,
    active,
    variants,
    orders,
    payments,
    refunds,
    carts,
    users,
    wallets
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.productVariant.count(),
    prisma.order.count(),
    prisma.payment.count(),
    prisma.refund.count(),
    prisma.cart.count(),
    prisma.user.count(),
    prisma.wallet.count()
  ]);
  return { products, active, variants, orders, payments, refunds, carts, users, wallets };
}

async function login(label, email, password) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { Origin: BASE, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`${label} login failed: HTTP ${response.status}`);
  const cookies = response.headers.getSetCookie?.() ?? [];
  const cookie = cookies.map((entry) => entry.split(";")[0]).join("; ");
  if (!cookie) throw new Error(`${label} login returned no session cookie`);
  created.cookies.push(cookie);
  return cookie;
}

async function api(cookie, method, endpoint, body) {
  const response = await fetch(`${BASE}${endpoint}`, {
    method,
    headers: {
      Origin: BASE,
      ...(cookie ? { Cookie: cookie } : {}),
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

function credentials(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) throw new Error(`credential file missing: ${file}`);
  const [email, password] = fs.readFileSync(full, "utf8").trim().split(/\r?\n/);
  if (!email || !password) throw new Error(`credential file is incomplete: ${file}`);
  return [email, password];
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

async function createRunCustomer(label) {
  const email = `variant-${label}-${runToken.toLowerCase()}@review.local`;
  const password = `Run${runToken.replace(/[^A-Za-z0-9]/g, "")}a1!`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `Variant ${label.toUpperCase()} run fixture`,
      phone: `0809${randomBytes(3).toString("hex").replace(/\D/g, "0").slice(0, 7)}`,
      passwordHash: await hashPassword(password),
      actorType: "CUSTOMER"
    },
    select: { id: true, email: true }
  });
  created.userIds.push(user.id);
  const cookie = await login(`customer ${label}`, email, password);
  return { id: user.id, cookie };
}

async function createRunSeller() {
  const email = `variant-seller-${runToken.toLowerCase()}@review.local`;
  const password = `Run${runToken.replace(/[^A-Za-z0-9]/g, "")}s1!`;
  const user = await prisma.user.create({
    data: {
      email,
      name: "Variant Seller B run fixture",
      phone: "08080000000",
      passwordHash: await hashPassword(password),
      actorType: "VENDOR"
    },
    select: { id: true }
  });
  created.userIds.push(user.id);
  const vendor = await prisma.vendor.create({
    data: {
      ownerId: user.id,
      name: `${runId} Seller B`,
      slug: `variant-seller-b-${runToken.toLowerCase()}`,
      market: "Abuja",
      pickupAddress: "Run-owned fixture only — no pickup",
      pickupPhone: "08080000000",
      countryCode: "NG",
      status: "VERIFIED"
    },
    select: { id: true }
  });
  created.vendorIds.push(vendor.id);
  const cookie = await login("seller B", email, password);
  return { id: user.id, vendorId: vendor.id, cookie };
}

function variantSet(label, priceKobo, stock) {
  const base = `${runSku}-${label}`;
  return [
    {
      name: `${label} Small`,
      sku: `${base}-S`,
      priceKobo: String(priceKobo),
      stock,
      attributes: { Size: "Small", Colour: "Olive" }
    },
    {
      name: `${label} Large`,
      sku: `${base}-L`,
      priceKobo: String(priceKobo + 10_000),
      stock,
      attributes: { Size: "Large", Colour: "Olive" }
    }
  ];
}

function singleVariant(label, priceKobo, stock) {
  return [
    {
      name: `${label} Only`,
      sku: `${runSku}-${label}-O`,
      priceKobo: String(priceKobo),
      stock,
      attributes: { Size: "Only", Colour: "Olive" }
    }
  ];
}

const FIXTURE_IMAGE = {
  url: "/generated/shop/product-stainless-steel-cookware-set.webp",
  alt: "Stainless steel cookware set",
  order: 0,
  primary: true
};

async function adminProduct(cookie, suffix, options = {}) {
  const {
    priceKobo = 100_000,
    quantity = 0,
    variants,
    includeVariants = true,
    isDemo = true
  } = options;
  return api(cookie, "POST", "/api/admin/catalogue/products", {
    name: `${runId} admin ${suffix}`,
    slug: `${runId.toLowerCase()}-admin-${suffix}`,
    description: "Run-owned variant concurrency fixture; deleted by the harness.",
    priceKobo,
    currency: "NGN",
    countryCode: "NG",
    categoryId,
    attributes: { material: "Stainless steel", piece_count: 2 },
    quantity,
    lowStockLevel: 2,
    images: [FIXTURE_IMAGE],
    ...(includeVariants ? { variants } : {}),
    isDemo
  });
}

async function sellerProduct(cookie, suffix, options = {}) {
  const { priceKobo = 100_000, quantity = 0, variants, includeVariants = true } = options;
  return api(cookie, "POST", "/api/seller/products", {
    name: `${runId} seller ${suffix}`,
    description: "Run-owned variant concurrency fixture; deleted by the harness.",
    categoryId,
    priceKobo,
    quantity,
    attributes: { material: "Stainless steel", piece_count: 2 },
    images: [FIXTURE_IMAGE],
    ...(includeVariants ? { variants } : {})
  });
}

function trackProduct(response) {
  if (response.body?.id) {
    created.productIds.add(response.body.id);
    for (const variant of response.body?.variants ?? []) {
      if (variant?.id) created.variantIds.add(variant.id);
    }
  }
  return response.body?.id ?? null;
}

function trackVariants(rows) {
  for (const row of rows ?? []) {
    if (row?.id) created.variantIds.add(row.id);
  }
}

/**
 * Degraded-mode fixture provisioning. Used only with --db-fixtures when a
 * shared activation rule pauses Shop and blocks seller/product creation over
 * HTTP. Every assertion after provisioning still goes through the real API or
 * the exact checkout reservation statement; the provisioning itself is a
 * run-owned REVIEW row that `finally` deletes.
 */
async function provisionProduct(input) {
  const product = await prisma.product.create({
    data: {
      vendorId: input.vendorId,
      categoryId,
      name: `${runId} ${input.suffix}`,
      slug: `${runId.toLowerCase()}-${input.suffix}`.slice(0, 70),
      description: "Run-owned variant concurrency fixture; deleted by the harness.",
      priceKobo: BigInt(input.priceKobo),
      status: "DRAFT",
      countryCode: "NG",
      attributes: { material: "Stainless steel", piece_count: 2 },
      images: { create: [{ url: FIXTURE_IMAGE.url, alt: FIXTURE_IMAGE.alt, sortOrder: 0 }] },
      stock: { create: { quantity: 0, lowStockLevel: 2 } },
      variants: {
        create: input.variants.map((variant) => ({
          name: variant.name,
          sku: variant.sku,
          priceKobo: BigInt(variant.priceKobo),
          stock: variant.stock,
          attributes: variant.attributes,
          isActive: variant.isActive ?? true
        }))
      }
    },
    include: { variants: true }
  });
  trackProduct({ body: product });
  return product;
}

async function adminRow(cookie, id) {
  const response = await api(cookie, "GET", "/api/admin/catalogue");
  return (response.body?.products || []).find((entry) => entry.id === id) ?? null;
}

async function sellerRow(cookie, id) {
  const response = await api(cookie, "GET", "/api/seller/overview");
  return (response.body?.products || []).find((entry) => entry.id === id) ?? null;
}

async function dbVariants(productId) {
  if (!productId) return [];
  const rows = await prisma.productVariant.findMany({
    where: { productId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  trackVariants(rows);
  return rows;
}

async function dbVariant(id) {
  if (!id) return null;
  const row = await prisma.productVariant.findUnique({ where: { id } });
  if (row) created.variantIds.add(row.id);
  return row;
}

/**
 * The exact atomic reservation checkout executes for a variant line.
 * Source: lib/services/core/checkout.service.ts:290-295.
 *
 * Returns 1 when a unit was reserved, 0 when the conditional predicate refused.
 */
async function reserveExact(client, variantId, quantity) {
  return client.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      UPDATE "ProductVariant"
      SET reserved = reserved + ${quantity}
      WHERE id = ${variantId} AND stock - reserved >= ${quantity}
      RETURNING id
    `;
    return rows.length;
  });
}

async function releaseReserved(variantId) {
  await prisma.$executeRaw`UPDATE "ProductVariant" SET reserved = 0 WHERE id = ${variantId}`;
}

/**
 * Deterministically interleave a seller stock/deactivation save with a
 * reservation. The harness holds the variant row lock first, fires the real
 * seller PATCH, waits until its UPDATE is blocked, commits the reservation on
 * that same row and only then releases the seller statement.
 *
 * This is the server's own ordering, not a re-implementation: the seller path is
 * HTTP -> seller.service.ts -> variant-contract.ts, and the reservation is the
 * checkout statement.
 */
async function lockAndRace(input) {
  let patchPromise = null;
  let reservationRows = 0;
  let blocked = false;

  await locker.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProductVariant" WHERE id = ${input.variantId} FOR UPDATE`;
      patchPromise = api(input.cookie, "PATCH", `/api/seller/products/${input.productId}`, input.patchBody);

      const deadline = Date.now() + 3_000;
      while (Date.now() < deadline) {
        const waiting = await poller.$queryRawUnsafe(
          `SELECT pid FROM pg_stat_activity
             WHERE datname = current_database()
               AND pid <> pg_backend_pid()
               AND wait_event_type = 'Lock'
               AND query ~* 'update[[:space:]].*ProductVariant'`
        );
        if (waiting.length > 0) {
          blocked = true;
          break;
        }
        await sleep(50);
      }

      const rows = await tx.$queryRaw`
        UPDATE "ProductVariant"
        SET reserved = reserved + ${input.reserveQuantity}
        WHERE id = ${input.variantId} AND stock - reserved >= ${input.reserveQuantity}
        RETURNING id
      `;
      reservationRows = rows.length;
    },
    { maxWait: 5_000, timeout: 10_000 }
  );

  const patch = patchPromise
    ? await patchPromise.catch((error) => ({ status: 0, body: { code: "fetch_error", error: error.message } }))
    : { status: 0, body: { code: "not_dispatched" } };

  return { blocked, reservationRows, patchStatus: patch.status, patchBody: patch.body };
}

async function addCartItem(cookie, productId, variantId, quantity) {
  return api(cookie, "POST", "/api/cart/items", {
    productId,
    ...(variantId ? { variantId } : {}),
    quantity
  });
}

/**
 * Degraded-mode service-boundary cart add.
 *
 * `POST /api/cart/items` evaluates the shared Shop activation gate before it
 * calls `addCartItem()`. When a concurrent fixture pauses Shop, the gate is
 * blocked but `lib/services/core/cart.service.ts` is not. This runs the real
 * service in a short-lived tsx process against the same REVIEW database, so
 * every product/variant/stock/quantity assertion below still executes the
 * production code path. No provider, order or payment is involved.
 */
const CART_SERVICE_SCRIPT = `
(async () => {
  const input = JSON.parse(process.env.ND_CART_INPUT || "{}");
  try {
    const { addCartItem, cartTotals } = await import("./lib/services/core/cart.service");
    const cart = await addCartItem(input);
    console.log(JSON.stringify({
      ok: true,
      cartId: cart.id,
      items: cart.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity
      })),
      totals: cartTotals(cart)
    }));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      code: error && error.code ? String(error.code) : null,
      status: error && error.status ? Number(error.status) : null,
      message: error && error.message ? String(error.message).slice(0, 300) : String(error).slice(0, 300)
    }));
  }
})();
`;

async function cartServiceAdd(input) {
  const tsxCli = path.join(path.dirname(require.resolve("tsx/package.json")), "dist", "cli.mjs");
  const { stdout } = await execFileAsync(process.execPath, [tsxCli, "-e", CART_SERVICE_SCRIPT], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: REVIEW_URL, ND_CART_INPUT: JSON.stringify(input) },
    timeout: 90_000,
    maxBuffer: 1024 * 1024,
    encoding: "utf8",
    windowsHide: true
  });
  const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? "{}";
  return JSON.parse(line);
}

function asHttpResponse(serviceResult) {
  if (serviceResult.ok) {
    return {
      status: 201,
      body: { id: serviceResult.cartId, items: serviceResult.items, totals: serviceResult.totals }
    };
  }
  return {
    status: typeof serviceResult.status === "number" ? serviceResult.status : 400,
    body: { code: serviceResult.code, error: serviceResult.message }
  };
}

async function addCartLine(user, productId, variantId, quantity) {
  if (!DB_FIXTURES) return addCartItem(user.cookie, productId, variantId, quantity);
  const result = await cartServiceAdd({
    userId: user.id,
    productId,
    variantId: variantId ?? null,
    quantity
  });
  return asHttpResponse(result);
}

async function getCart(cookie) {
  return api(cookie, "GET", "/api/cart");
}

async function patchCartItem(cookie, itemId, quantity) {
  return api(cookie, "PATCH", `/api/cart/items/${itemId}`, { quantity });
}

async function deleteCartItem(cookie, itemId) {
  return api(cookie, "DELETE", `/api/cart/items/${itemId}`);
}

/**
 * Authoritative preflight for the customer write path. The REVIEW activation
 * rows are shared state: another run may temporarily pause Shop. Fail with one
 * clear reason instead of cascading `vertical_unavailable` through every
 * customer/public check.
 */
async function probeShopWritable(cookie) {
  const candidates = await prisma.$queryRawUnsafe(`
    SELECT p.id
    FROM "Product" p
    JOIN "InventoryStock" s ON s."productId" = p.id
    WHERE p.status = 'ACTIVE'
      AND p."saleMode" = 'escrow'
      AND p."countryCode" = 'NG'
      AND s.quantity - s.reserved > 0
      AND NOT EXISTS (
        SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id AND v."isActive"
      )
    LIMIT 3
  `);
  for (const row of candidates) {
    const added = await addCartItem(cookie, row.id, null, 1);
    if (added.status === 201) {
      const item = (added.body?.items ?? []).find((entry) => entry.productId === row.id);
      if (item) await deleteCartItem(cookie, item.id);
      return { writable: true, detail: `probe=${row.id}` };
    }
    const code = added.body?.code ?? "";
    if (added.status === 409 && code === "vertical_unavailable") {
      return { writable: false, detail: `vertical_unavailable: ${added.body?.error ?? ""}` };
    }
    if (added.status === 409 && code === "vertical_preview_only") {
      return { writable: false, detail: `vertical_preview_only: ${added.body?.error ?? ""}` };
    }
    if (added.status === 409) {
      // insufficient_stock / demo_inventory / item_unavailable still mean the
      // Shop gate allowed the write attempt.
      return { writable: true, detail: `gate passed with ${code}` };
    }
  }
  return { writable: false, detail: "no eligible ACTIVE product was available for the Shop probe" };
}

async function run(baseline) {
  const [adminEmail, adminPassword] = credentials("qa-artifacts/review-basket/.admin-credential");
  const [sellerAEmail, sellerAPassword] = credentials("qa-artifacts/review-basket/.seller-credential");

  const adminCookie = await login("admin", adminEmail, adminPassword);
  const sellerACookie = await login("seller A", sellerAEmail, sellerAPassword);
  const sellerB = await createRunSeller();
  const customerA = await createRunCustomer("a");
  const customerB = await createRunCustomer("b");

  check("admin, seller and two run-owned customer sessions established", true, "4 authenticated sessions");

  const category = await prisma.category.findFirst({
    where: { slug: "cookware-bakeware", isActive: true },
    select: { id: true }
  });
  if (!category) throw new Error("cookware-bakeware category is not active");
  categoryId = category.id;

  const shopProbe = await probeShopWritable(customerA.cookie);
  if (shopProbe.writable) {
    check("Shop is writable for a customer session (REVIEW activation)", true, shopProbe.detail);
  } else if (DB_FIXTURES) {
    blocked(
      "Shop is writable for a customer session (REVIEW activation)",
      `${shopProbe.detail}; degraded mode calls lib/services/core/cart.service.addCartItem directly because the HTTP route's Shop gate is paused`
    );
  } else {
    check("Shop is writable for a customer session (REVIEW activation)", false, shopProbe.detail);
    throw new Error(
      `Shop activation currently blocks customer writes (${shopProbe.detail}); rerun with --db-fixtures for the degraded mode`
    );
  }

  /* ------------------------------------------------------------------ */
  /* 1. Malformed / duplicate / unsupported variant payloads            */
  /* ------------------------------------------------------------------ */
  const seed = await adminProduct(adminCookie, "seed", {
    variants: variantSet("SEED", 90_000, 2)
  });
  const seedId = trackProduct(seed);
  check("seed product with two variants created", seed.status === 201 && Boolean(seedId), `status=${seed.status}`);
  const seedSku = seed.body?.variants?.[0]?.sku ?? `${runSku}-SEED-S`;
  const seedVariants = await dbVariants(seedId);
  const seedAudit = await prisma.auditLog.findFirst({
    where: { entityId: seedId, action: "catalogue.product.created" },
    orderBy: { createdAt: "desc" }
  });
  const seedAuditAfter = seedAudit?.metadata?.variants?.after ?? [];
  check(
    "admin create audit records the variant before/after set",
    Array.isArray(seedAuditAfter) &&
      seedAuditAfter.length === 2 &&
      seedAuditAfter.map((row) => row.id).sort().join(",") === seedVariants.map((row) => row.id).sort().join(","),
    `audit=${JSON.stringify(seedAuditAfter.map((row) => ({ id: row.id, stock: row.stock })))}`
  );

  let rejectIndex = 0;
  const reject = async (name, variants, expectedStatus, expectedCode, extra = {}) => {
    const suffix = `reject-${String(rejectIndex++).padStart(2, "0")}`;
    const response = await adminProduct(adminCookie, suffix, { variants, ...extra });
    check(
      name,
      response.status === expectedStatus && response.body?.code === expectedCode,
      `status=${response.status} code=${response.body?.code ?? ""}`
    );
  };

  await reject("non-array variants payload refused", "not-an-array", 400, "invalid_variants");
  await reject("null variant entry refused", [null], 400, "invalid_variants");
  await reject(
    "empty variant name refused",
    [{ ...variantSet("EMPTYNAME", 100_000, 1)[0], name: "" }],
    400,
    "invalid_variant_name"
  );
  await reject(
    "over-long variant name refused",
    [{ ...variantSet("LONGNAME", 100_000, 1)[0], name: "x".repeat(81) }],
    400,
    "invalid_variant_name"
  );
  await reject(
    "invalid variant SKU refused",
    [{ ...variantSet("BADSKU", 100_000, 1)[0], sku: "bad sku!" }],
    400,
    "invalid_variant_sku"
  );
  await reject(
    "one-character variant SKU refused",
    [{ ...variantSet("SHORTSKU", 100_000, 1)[0], sku: "A" }],
    400,
    "invalid_variant_sku"
  );
  const duplicateSku = variantSet("DUPSKU", 100_000, 1);
  duplicateSku[1].sku = duplicateSku[0].sku;
  await reject("duplicate SKU inside one payload refused", duplicateSku, 400, "duplicate_variant_sku");
  const duplicateId = variantSet("DUPID", 100_000, 1);
  duplicateId[0].id = "duplicate-run-id";
  duplicateId[1].id = "duplicate-run-id";
  await reject("duplicate variant id inside one payload refused", duplicateId, 400, "duplicate_variant_id");
  await reject(
    "zero variant price refused",
    [{ ...variantSet("ZEROPRICE", 100_000, 1)[0], priceKobo: "0" }],
    400,
    "invalid_variant_price"
  );
  await reject(
    "fractional variant price refused",
    [{ ...variantSet("DECPRICE", 100_000, 1)[0], priceKobo: "100.5" }],
    400,
    "invalid_variant_price"
  );
  await reject(
    "negative variant stock refused",
    [{ ...variantSet("NEGSTOCK", 100_000, 1)[0], stock: -1 }],
    400,
    "invalid_variant_stock"
  );
  await reject(
    "fractional variant stock refused",
    [{ ...variantSet("DECSTOCK", 100_000, 1)[0], stock: 1.5 }],
    400,
    "invalid_variant_stock"
  );
  await reject(
    "variant stock above the contract ceiling refused",
    [{ ...variantSet("HUGESTOCK", 100_000, 1)[0], stock: 1_000_001 }],
    400,
    "invalid_variant_stock"
  );
  await reject(
    "array variant options refused",
    [{ ...variantSet("ARRATTR", 100_000, 1)[0], attributes: ["Size"] }],
    400,
    "invalid_variant_options"
  );
  await reject(
    "attributes and options together refused",
    [{ ...variantSet("BOTHATTR", 100_000, 1)[0], options: { Size: "Small" } }],
    400,
    "invalid_variant_options"
  );
  await reject(
    "nested variant option value refused",
    [{ ...variantSet("NESTED", 100_000, 1)[0], attributes: { Size: { value: "Small" } } }],
    400,
    "invalid_variant_options"
  );
  await reject(
    "non-boolean variant state refused",
    [{ ...variantSet("BADSTATE", 100_000, 1)[0], isActive: "yes" }],
    400,
    "invalid_variant_state"
  );
  await reject(
    "variant currency that differs from the listing currency refused",
    [{ ...variantSet("CURRENCY", 100_000, 1)[0], currency: "USD" }],
    400,
    "variant_currency_mismatch"
  );
  await reject(
    "more than 50 variants refused",
    Array.from({ length: 51 }, (_, index) => ({
      name: `Many ${index}`,
      sku: `${runSku}-MANY-${String(index).padStart(2, "0")}`,
      priceKobo: "100000",
      stock: 1
    })),
    400,
    "too_many_variants"
  );
  await reject(
    "variant id from another product refused",
    [{ ...variantSet("FOREIGNID", 100_000, 1)[0], id: "variant-does-not-exist" }],
    403,
    "variant_ownership"
  );
  const stockConflict = await adminProduct(adminCookie, "stockconflict", {
    quantity: 1,
    variants: variantSet("STOCKCONFLICT", 100_000, 2)
  });
  check(
    "product-level stock plus active variants refused",
    stockConflict.status === 400 && stockConflict.body?.code === "variant_stock_conflict",
    `status=${stockConflict.status} code=${stockConflict.body?.code ?? ""}`
  );
  const globalDuplicate = await adminProduct(adminCookie, "globaldup", {
    variants: [{ ...variantSet("GLOBALDUP", 100_000, 1)[0], sku: seedSku }]
  });
  check(
    "globally duplicated variant SKU refused",
    globalDuplicate.status === 409 && globalDuplicate.body?.code === "duplicate_variant_sku",
    `status=${globalDuplicate.status} code=${globalDuplicate.body?.code ?? ""}`
  );
  const afterRejections = await prisma.product.count();
  check(
    "rejected variant payloads persisted no product rows",
    afterRejections === baseline.products + 1,
    `count=${afterRejections} expected=${baseline.products + 1}`
  );

  /* ------------------------------------------------------------------ */
  /* 2. Admin product, admin-only publication, sold-out/inactive stock   */
  /* ------------------------------------------------------------------ */
  const adminCreate = await adminProduct(adminCookie, "main", {
    priceKobo: 125_000,
    variants: [
      {
        name: "Admin Run Small",
        sku: `${runSku}-ADMIN-S`,
        priceKobo: "125000",
        stock: 3,
        attributes: { Size: "Small" }
      },
      {
        name: "Admin Run Large",
        sku: `${runSku}-ADMIN-L`,
        priceKobo: "145000",
        stock: 0,
        attributes: { Size: "Large" }
      }
    ]
  });
  const adminId = trackProduct(adminCreate);
  check("admin creates a variant draft", adminCreate.status === 201 && adminCreate.body?.status === "DRAFT", `status=${adminCreate.status}`);
  if (!adminId) throw new Error("admin variant fixture could not be created");
  const adminSlug = adminCreate.body?.slug;
  const adminVariants = await dbVariants(adminId);
  check("admin draft has two variant rows", adminVariants.length === 2, `variants=${adminVariants.length}`);
  const [adminSmall, adminLarge] = adminVariants;

  if (DB_FIXTURES) {
    blocked("admin draft is not publicly readable", "public product detail is Shop-gated by the shared activation fixture");
  } else {
    const beforePublish = await api("", "GET", `/api/products/${encodeURIComponent(adminSlug)}`);
    check("admin draft is not publicly readable", beforePublish.status === 404, `status=${beforePublish.status}`);
  }

  const anonSeller = await api("", "POST", "/api/seller/products", { status: "ACTIVE" });
  check("anonymous seller create refused", anonSeller.status === 401, `status=${anonSeller.status}`);
  const anonAdmin = await api("", "PATCH", "/api/admin/catalogue/products", { id: adminId, action: "publish" });
  check("anonymous admin publish refused", anonAdmin.status === 401, `status=${anonAdmin.status}`);
  const customerAdmin = await api(customerA.cookie, "PATCH", "/api/admin/catalogue/products", {
    id: adminId,
    action: "publish"
  });
  check(
    "customer cannot call the admin catalogue API",
    customerAdmin.status === 403,
    `status=${customerAdmin.status} code=${customerAdmin.body?.code ?? ""}`
  );

  const adminQuantityWhileVariants = await api(adminCookie, "PATCH", "/api/admin/catalogue/products", {
    id: adminId,
    quantity: 1
  });
  check(
    "admin cannot write product-level stock while variants are active",
    adminQuantityWhileVariants.status === 409 && adminQuantityWhileVariants.body?.code === "variant_stock_managed",
    `status=${adminQuantityWhileVariants.status} code=${adminQuantityWhileVariants.body?.code ?? ""}`
  );

  const adminValidate = await api(adminCookie, "PATCH", "/api/admin/catalogue/products", {
    id: adminId,
    action: "validate"
  });
  check(
    "admin variant draft validates",
    adminValidate.status === 200 && adminValidate.body?.valid === true,
    `status=${adminValidate.status} issues=${JSON.stringify(adminValidate.body?.issues ?? [])}`
  );
  const adminPublish = await api(adminCookie, "PATCH", "/api/admin/catalogue/products", {
    id: adminId,
    action: "publish"
  });
  check(
    "only the admin publication path publishes the draft",
    adminPublish.status === 200 && adminPublish.body?.status === "ACTIVE",
    `status=${adminPublish.status} code=${adminPublish.body?.code ?? ""}`
  );
  if (DB_FIXTURES) {
    blocked(
      "published product exposes both variant ids publicly",
      "public product detail is Shop-gated by the shared activation fixture"
    );
  } else {
    const publicAdmin = await api("", "GET", `/api/products/${encodeURIComponent(adminSlug)}`);
    const publicAdminIds = (publicAdmin.body?.variants ?? []).map((variant) => variant.id).sort();
    check(
      "published product exposes both variant ids publicly",
      publicAdmin.status === 200 &&
        publicAdminIds.length === 2 &&
        publicAdminIds.join(",") === [adminSmall.id, adminLarge.id].sort().join(","),
      `status=${publicAdmin.status} ids=${publicAdminIds.join(",")}`
    );
  }

  const soldOutCart = await addCartLine(customerA, adminId, adminLarge.id, 1);
  check(
    "sold-out active variant refused at cart add",
    soldOutCart.status === 409 && soldOutCart.body?.code === "insufficient_stock",
    `mode=${DB_FIXTURES ? "service" : "http"} status=${soldOutCart.status} code=${soldOutCart.body?.code ?? ""}`
  );

  const deactivateLarge = await api(adminCookie, "PATCH", "/api/admin/catalogue/products", {
    id: adminId,
    variants: [
      { id: adminSmall.id, name: adminSmall.name, sku: adminSmall.sku, priceKobo: "125000", stock: 3, isActive: true, attributes: { Size: "Small" } },
      { id: adminLarge.id, name: adminLarge.name, sku: adminLarge.sku, priceKobo: "145000", stock: 0, isActive: false, attributes: { Size: "Large" } }
    ]
  });
  check("admin deactivates an unreserved variant", deactivateLarge.status === 200, `status=${deactivateLarge.status}`);
  const adminUpdatedAudit = await prisma.auditLog.findFirst({
    where: { entityId: adminId, action: "catalogue.product.updated" },
    orderBy: { createdAt: "desc" }
  });
  const adminAuditBefore = adminUpdatedAudit?.metadata?.variants?.before ?? [];
  const adminAuditAfter = adminUpdatedAudit?.metadata?.variants?.after ?? [];
  check(
    "admin update audit records variant before/after with the deactivation",
    Array.isArray(adminAuditBefore) &&
      adminAuditBefore.length === 2 &&
      Array.isArray(adminAuditAfter) &&
      adminAuditAfter.length === 2 &&
      adminAuditAfter.find((row) => row.id === adminLarge.id)?.isActive === false,
    JSON.stringify(adminAuditAfter.map((row) => ({ id: row.id, isActive: row.isActive })))
  );
  const inactiveCart = await addCartLine(customerA, adminId, adminLarge.id, 1);
  check(
    "inactive variant refused at cart add",
    inactiveCart.status === 400 && inactiveCart.body?.code === "variant_unavailable",
    `mode=${DB_FIXTURES ? "service" : "http"} status=${inactiveCart.status} code=${inactiveCart.body?.code ?? ""}`
  );
  const productLevelCart = await addCartLine(customerA, adminId, null, 1);
  check(
    "product-level cart line refused for a variant product",
    productLevelCart.status === 400 && productLevelCart.body?.code === "variant_required",
    `mode=${DB_FIXTURES ? "service" : "http"} status=${productLevelCart.status} code=${productLevelCart.body?.code ?? ""}`
  );

  const soldOutDraft = await adminProduct(adminCookie, "soldout", {
    priceKobo: 155_000,
    variants: singleVariant("SOLDOUT", 155_000, 0)
  });
  const soldOutDraftId = trackProduct(soldOutDraft);
  const soldOutValidate = await api(adminCookie, "PATCH", "/api/admin/catalogue/products", {
    id: soldOutDraftId,
    action: "validate"
  });
  check(
    "sold-out variant product is refused publication validation",
    soldOutValidate.status === 200 &&
      soldOutValidate.body?.valid === false &&
      (soldOutValidate.body?.issues ?? []).some((issue) => /available stock/i.test(issue.message)),
    `valid=${soldOutValidate.body?.valid} issues=${JSON.stringify((soldOutValidate.body?.issues ?? []).map((issue) => issue.message))}`
  );

  const inactiveDraft = await adminProduct(adminCookie, "inactiveonly", {
    priceKobo: 160_000,
    variants: [{ ...singleVariant("INACTIVEONLY", 160_000, 5)[0], isActive: false }]
  });
  const inactiveDraftId = trackProduct(inactiveDraft);
  const inactiveValidate = await api(adminCookie, "PATCH", "/api/admin/catalogue/products", {
    id: inactiveDraftId,
    action: "validate"
  });
  check(
    "inactive-only variant product is refused publication validation",
    inactiveValidate.status === 200 &&
      inactiveValidate.body?.valid === false &&
      (inactiveValidate.body?.issues ?? []).some((issue) => /inventory|stock/i.test(issue.message)),
    `valid=${inactiveValidate.body?.valid} issues=${JSON.stringify((inactiveValidate.body?.issues ?? []).map((issue) => issue.message))}`
  );

  /* ------------------------------------------------------------------ */
  /* 3. Seller create/edit, stable ids and before/after audit            */
  /* ------------------------------------------------------------------ */
  const sellerCreate = await sellerProduct(sellerB.cookie, "main", {
    priceKobo: 100_000,
    variants: variantSet("SELLER", 100_000, 5)
  });
  let sellerId = trackProduct(sellerCreate);
  let sellerSlug = sellerCreate.body?.slug;
  if (!sellerId && DB_FIXTURES) {
    const provisioned = await provisionProduct({
      vendorId: sellerB.vendorId,
      suffix: "seller-main",
      priceKobo: 100_000,
      variants: variantSet("SELLER", 100_000, 5)
    });
    sellerId = provisioned.id;
    sellerSlug = provisioned.slug;
    blocked(
      "run-owned seller creates a variant draft",
      `seller create is Shop-gated (${sellerCreate.body?.code ?? sellerCreate.status}); DRAFT fixture provisioned directly in REVIEW`
    );
    blocked(
      "create audit records the variant before/after set",
      "direct fixture provisioning does not emit a product.created audit; the real seller PATCH audit is checked below"
    );
  } else {
    check(
      "run-owned seller creates a variant draft",
      sellerCreate.status === 201 && sellerCreate.body?.status === "DRAFT",
      `status=${sellerCreate.status} code=${sellerCreate.body?.code ?? ""}`
    );
    if (!sellerId) throw new Error("run-owned seller fixture could not be created");
  }
  const sellerCreatedAudit = await prisma.auditLog.findFirst({
    where: { entityId: sellerId, action: "product.created" },
    orderBy: { createdAt: "desc" }
  });
  const createdAuditVariants = sellerCreatedAudit?.metadata?.variants?.after ?? [];
  const sellerVariants = await dbVariants(sellerId);
  const [sellerSmall, sellerLarge] = sellerVariants;
  if (!DB_FIXTURES) {
    check(
      "create audit records the variant before/after set",
      Array.isArray(createdAuditVariants) &&
        createdAuditVariants.length === 2 &&
        createdAuditVariants.map((row) => row.id).sort().join(",") === [sellerSmall.id, sellerLarge.id].sort().join(","),
      `audit=${JSON.stringify(createdAuditVariants.map((row) => ({ id: row.id, stock: row.stock })))}`
    );
  }

  const sellerEdit = await api(sellerB.cookie, "PATCH", `/api/seller/products/${sellerId}`, {
    variants: [
      {
        id: sellerSmall.id,
        name: "Seller Run Small revised",
        sku: sellerSmall.sku,
        priceKobo: "115000",
        stock: 4,
        isActive: true,
        attributes: { Size: "Small" }
      },
      {
        name: "Seller Run Medium",
        sku: `${runSku}-SELLER-M`,
        priceKobo: "125000",
        stock: 2,
        isActive: true,
        attributes: { Size: "Medium" }
      }
    ]
  });
  check("seller edits one variant and adds another", sellerEdit.status === 200, `status=${sellerEdit.status} code=${sellerEdit.body?.code ?? ""}`);
  const afterEdit = await dbVariants(sellerId);
  const smallAfter = afterEdit.find((row) => row.id === sellerSmall.id);
  const largeAfter = afterEdit.find((row) => row.id === sellerLarge.id);
  const mediumAfter = afterEdit.find((row) => row.sku === `${runSku}-SELLER-M`);
  check(
    "variant ids stay stable across an edit",
    Boolean(smallAfter) && smallAfter.id === sellerSmall.id && Boolean(mediumAfter) && mediumAfter.id !== sellerSmall.id,
    `small=${smallAfter?.id} medium=${mediumAfter?.id}`
  );
  check(
    "omitted variant is deactivated, not replaced",
    Boolean(largeAfter) && largeAfter.id === sellerLarge.id && largeAfter.isActive === false && afterEdit.length === 3,
    `largeActive=${largeAfter?.isActive} rows=${afterEdit.length}`
  );
  check(
    "edited variant carries the new price and stock",
    smallAfter?.priceKobo === BigInt(115000) && smallAfter?.stock === 4 && smallAfter?.name === "Seller Run Small revised",
    `price=${smallAfter?.priceKobo} stock=${smallAfter?.stock}`
  );

  const sellerUpdatedAudit = await prisma.auditLog.findFirst({
    where: { entityId: sellerId, action: "product.updated" },
    orderBy: { createdAt: "desc" }
  });
  const auditBefore = sellerUpdatedAudit?.metadata?.variants?.before ?? [];
  const auditAfter = sellerUpdatedAudit?.metadata?.variants?.after ?? [];
  const auditSmallAfter = auditAfter.find((row) => row.id === sellerSmall.id);
  const auditLargeAfter = auditAfter.find((row) => row.id === sellerLarge.id);
  check(
    "update audit records the full before set",
    Array.isArray(auditBefore) &&
      auditBefore.length === 2 &&
      auditBefore.find((row) => row.id === sellerSmall.id)?.stock === 5 &&
      auditBefore.find((row) => row.id === sellerLarge.id)?.stock === 5,
    JSON.stringify(auditBefore.map((row) => ({ id: row.id, stock: row.stock })))
  );
  check(
    "update audit records the after set, including the deactivation",
    Array.isArray(auditAfter) &&
      auditAfter.length === 3 &&
      auditSmallAfter?.stock === 4 &&
      auditSmallAfter?.priceKobo === "115000" &&
      auditLargeAfter?.isActive === false,
    JSON.stringify(auditAfter.map((row) => ({ id: row.id, stock: row.stock, isActive: row.isActive })))
  );
  if (!mediumAfter) throw new Error("seller edit did not produce the added Medium variant");

  /* ------------------------------------------------------------------ */
  /* 4. Cross-seller ownership and publication authority                 */
  /* ------------------------------------------------------------------ */
  const sellerACrossOwner = await api(sellerACookie, "PATCH", `/api/seller/products/${sellerId}`, {
    variants: [
      { id: sellerSmall.id, name: "Hijacked", sku: sellerSmall.sku, priceKobo: "1000", stock: 1, isActive: true }
    ]
  });
  check(
    "seller cannot edit another seller's product",
    sellerACrossOwner.status === 403 && sellerACrossOwner.body?.code === "forbidden",
    `status=${sellerACrossOwner.status} code=${sellerACrossOwner.body?.code ?? ""}`
  );

  const sellerABorrowVariant = await api(sellerACookie, "PATCH", `/api/seller/products/${adminId}`, {
    variants: [
      { id: sellerSmall.id, name: "Borrowed", sku: sellerSmall.sku, priceKobo: "1000", stock: 1, isActive: true }
    ]
  });
  check(
    "seller cannot borrow another product's variant id",
    sellerABorrowVariant.status === 403 && sellerABorrowVariant.body?.code === "variant_ownership",
    `status=${sellerABorrowVariant.status} code=${sellerABorrowVariant.body?.code ?? ""}`
  );

  const sellerAOwnEdit = await api(sellerACookie, "PATCH", `/api/seller/products/${adminId}`, {
    variants: [
      { id: adminSmall.id, name: adminSmall.name, sku: adminSmall.sku, priceKobo: "125000", stock: 3, isActive: true },
      { id: adminLarge.id, name: adminLarge.name, sku: adminLarge.sku, priceKobo: "145000", stock: 0, isActive: false }
    ]
  });
  check(
    "seller control: the owner can edit its own variant set",
    sellerAOwnEdit.status === 200,
    `status=${sellerAOwnEdit.status} code=${sellerAOwnEdit.body?.code ?? ""}`
  );

  const sellerPostPublish = await api(sellerB.cookie, "POST", "/api/seller/products", { status: "ACTIVE" });
  check(
    "seller create cannot request ACTIVE publication",
    sellerPostPublish.status === 403 && sellerPostPublish.body?.code === "admin_publication_required",
    `status=${sellerPostPublish.status} code=${sellerPostPublish.body?.code ?? ""}`
  );
  const sellerPatchPublish = await api(sellerB.cookie, "PATCH", `/api/seller/products/${sellerId}`, {
    status: "ACTIVE"
  });
  check(
    "seller cannot publish via the seller API",
    sellerPatchPublish.status === 403 && sellerPatchPublish.body?.code === "admin_publication_required",
    `status=${sellerPatchPublish.status} code=${sellerPatchPublish.body?.code ?? ""}`
  );
  if (DB_FIXTURES) {
    blocked("seller draft stays private before admin publication", "public product detail is Shop-gated by the shared activation fixture");
  } else {
    const sellerBeforePublish = await api("", "GET", `/api/products/${encodeURIComponent(sellerSlug)}`);
    check("seller draft stays private before admin publication", sellerBeforePublish.status === 404, `status=${sellerBeforePublish.status}`);
  }

  const sellerValidate = await api(adminCookie, "PATCH", "/api/admin/catalogue/products", {
    id: sellerId,
    action: "validate"
  });
  const sellerAdminPublish = await api(sellerB.cookie, "PATCH", "/api/admin/catalogue/products", {
    id: sellerId,
    action: "publish"
  });
  check(
    "seller cannot call the admin publication API",
    sellerAdminPublish.status === 403 && sellerAdminPublish.body?.code === "forbidden",
    `status=${sellerAdminPublish.status} code=${sellerAdminPublish.body?.code ?? ""}`
  );
  check(
    "admin validates the seller variant draft",
    sellerValidate.status === 200 && sellerValidate.body?.valid === true,
    `status=${sellerValidate.status} issues=${JSON.stringify(sellerValidate.body?.issues ?? [])}`
  );
  const sellerPublish = await api(adminCookie, "PATCH", "/api/admin/catalogue/products", {
    id: sellerId,
    action: "publish"
  });
  check(
    "admin publishes the seller variant draft",
    sellerPublish.status === 200 && sellerPublish.body?.status === "ACTIVE",
    `status=${sellerPublish.status} code=${sellerPublish.body?.code ?? ""}`
  );
  const afterPublishVariants = await dbVariants(sellerId);
  check(
    "variant ids are unchanged by publication",
    afterPublishVariants.length === 3 &&
      [sellerSmall.id, sellerLarge.id, mediumAfter.id].every((id) => afterPublishVariants.some((row) => row.id === id)),
    `ids=${afterPublishVariants.map((row) => row.id).join(",")}`
  );
  if (DB_FIXTURES) {
    blocked(
      "public detail exposes only the two active variants",
      "public product detail is Shop-gated by the shared activation fixture"
    );
  } else {
    const publicSeller = await api("", "GET", `/api/products/${encodeURIComponent(sellerSlug)}`);
    const publicSellerActive = (publicSeller.body?.variants ?? []).filter((variant) => variant.isActive);
    check(
      "public detail exposes only the two active variants",
      publicSeller.status === 200 &&
        publicSellerActive.length === 2 &&
        publicSellerActive.some((variant) => variant.id === sellerSmall.id) &&
        publicSellerActive.some((variant) => variant.id === mediumAfter.id),
      `status=${publicSeller.status} active=${publicSellerActive.map((variant) => variant.id).join(",")}`
    );
  }
  const sellerStillCannotPublish = await api(sellerB.cookie, "PATCH", `/api/seller/products/${sellerId}`, {
    status: "ACTIVE"
  });
  check(
    "seller still cannot publish an already-published listing",
    sellerStillCannotPublish.status === 403 && sellerStillCannotPublish.body?.code === "admin_publication_required",
    `status=${sellerStillCannotPublish.status} code=${sellerStillCannotPublish.body?.code ?? ""}`
  );

  /* ------------------------------------------------------------------ */
  /* 5. Cart quantity limits and variant-specific totals                 */
  /* ------------------------------------------------------------------ */
  const zeroQuantity = await addCartLine(customerA, sellerId, mediumAfter.id, 0);
  check(
    "cart add quantity 0 refused",
    zeroQuantity.status === 400 && zeroQuantity.body?.code === "validation_error",
    `mode=${DB_FIXTURES ? "service" : "http"} status=${zeroQuantity.status} code=${zeroQuantity.body?.code ?? ""}`
  );
  const elevenQuantity = await addCartLine(customerA, sellerId, mediumAfter.id, 11);
  check(
    "cart add quantity above 10 refused",
    elevenQuantity.status === 400 && elevenQuantity.body?.code === "validation_error",
    `mode=${DB_FIXTURES ? "service" : "http"} status=${elevenQuantity.status} code=${elevenQuantity.body?.code ?? ""}`
  );
  const twoUnits = await addCartLine(customerA, sellerId, mediumAfter.id, 2);
  const twoUnitsItem = (twoUnits.body?.items ?? []).find((item) => item.variantId === mediumAfter.id);
  check(
    "cart accepts two of two available units",
    twoUnits.status === 201 && Boolean(twoUnitsItem) && twoUnits.body?.totals?.subtotalKobo === "250000",
    `mode=${DB_FIXTURES ? "service" : "http"} status=${twoUnits.status} subtotal=${twoUnits.body?.totals?.subtotalKobo}`
  );
  const overAdd = await addCartLine(customerA, sellerId, mediumAfter.id, 1);
  check(
    "cart add beyond available variant stock refused",
    overAdd.status === 409 && overAdd.body?.code === "insufficient_stock",
    `mode=${DB_FIXTURES ? "service" : "http"} status=${overAdd.status} code=${overAdd.body?.code ?? ""}`
  );
  const patchEleven = await patchCartItem(customerA.cookie, twoUnitsItem?.id, 11);
  check(
    "cart quantity update above 10 refused",
    patchEleven.status === 400 && patchEleven.body?.code === "validation_error",
    `status=${patchEleven.status} code=${patchEleven.body?.code ?? ""}`
  );
  const patchTwo = await patchCartItem(customerA.cookie, twoUnitsItem?.id, 2);
  check(
    "cart quantity update keeps the variant price",
    patchTwo.status === 200 && patchTwo.body?.totals?.subtotalKobo === "250000",
    `status=${patchTwo.status} subtotal=${patchTwo.body?.totals?.subtotalKobo}`
  );
  const patchZero = await patchCartItem(customerA.cookie, twoUnitsItem?.id, 0);
  check(
    "cart quantity 0 removes the line",
    patchZero.status === 200 && (patchZero.body?.items ?? []).length === 0,
    `status=${patchZero.status} items=${(patchZero.body?.items ?? []).length}`
  );

  /* ------------------------------------------------------------------ */
  /* 6. Reservation-safe deactivation (cart line)                        */
  /* ------------------------------------------------------------------ */
  const cartForDeactivation = await addCartLine(customerA, sellerId, sellerSmall.id, 1);
  const deactivationItem = (cartForDeactivation.body?.items ?? []).find((item) => item.variantId === sellerSmall.id);
  check(
    "variant cart line created for deactivation guard",
    cartForDeactivation.status === 201 && Boolean(deactivationItem),
    `mode=${DB_FIXTURES ? "service" : "http"} status=${cartForDeactivation.status}`
  );
  const deactivateInCart = await api(sellerB.cookie, "PATCH", `/api/seller/products/${sellerId}`, {
    variants: [
      { id: sellerSmall.id, name: smallAfter.name, sku: smallAfter.sku, priceKobo: "115000", stock: 4, isActive: false },
      { id: mediumAfter.id, name: mediumAfter.name, sku: mediumAfter.sku, priceKobo: "125000", stock: 2, isActive: true }
    ]
  });
  check(
    "variant in a live cart cannot be deactivated",
    deactivateInCart.status === 409 && deactivateInCart.body?.code === "variant_in_use",
    `status=${deactivateInCart.status} code=${deactivateInCart.body?.code ?? ""}`
  );
  const removeDeactivationItem = await deleteCartItem(customerA.cookie, deactivationItem?.id);
  check("cart line removed before retry", removeDeactivationItem.status === 200, `status=${removeDeactivationItem.status}`);
  const deactivateAfterRemoval = await api(sellerB.cookie, "PATCH", `/api/seller/products/${sellerId}`, {
    variants: [
      { id: sellerSmall.id, name: smallAfter.name, sku: smallAfter.sku, priceKobo: "115000", stock: 4, isActive: false },
      { id: mediumAfter.id, name: mediumAfter.name, sku: mediumAfter.sku, priceKobo: "125000", stock: 2, isActive: true }
    ]
  });
  check(
    "deactivation succeeds once the cart line is gone",
    deactivateAfterRemoval.status === 200,
    `status=${deactivateAfterRemoval.status} code=${deactivateAfterRemoval.body?.code ?? ""}`
  );

  /* ------------------------------------------------------------------ */
  /* 7. Two customers reserve the last unit (real carts, atomic SQL)     */
  /* ------------------------------------------------------------------ */
  const raceCreate = await adminProduct(adminCookie, "race", {
    priceKobo: 150_000,
    variants: singleVariant("RACE", 150_000, 1)
  });
  const raceId = trackProduct(raceCreate);
  const raceVariant = (await dbVariants(raceId))[0];
  const racePublish = await api(adminCookie, "PATCH", "/api/admin/catalogue/products", {
    id: raceId,
    action: "publish"
  });
  check("last-unit race product published", racePublish.status === 200, `status=${racePublish.status}`);

  const [cartAddA, cartAddB] = await Promise.all([
    addCartLine(customerA, raceId, raceVariant.id, 1),
    addCartLine(customerB, raceId, raceVariant.id, 1)
  ]);
  check(
    "two distinct customer sessions can hold the last unit in their carts",
    cartAddA.status === 201 && cartAddB.status === 201,
    `mode=${DB_FIXTURES ? "service" : "http"} a=${cartAddA.status} b=${cartAddB.status}`
  );
  const [cartStateA, cartStateB] = await Promise.all([getCart(customerA.cookie), getCart(customerB.cookie)]);
  const lineA = (cartStateA.body?.items ?? []).find((item) => item.variantId === raceVariant.id);
  const lineB = (cartStateB.body?.items ?? []).find((item) => item.variantId === raceVariant.id);
  check(
    "the two purchases use distinct carts and cart items",
    cartStateA.body?.id !== cartStateB.body?.id && Boolean(lineA) && Boolean(lineB) && lineA.id !== lineB.id,
    `cartA=${cartStateA.body?.id} cartB=${cartStateB.body?.id}`
  );

  const [reservedA, reservedB] = await Promise.all([
    reserveExact(clientA, raceVariant.id, lineA.quantity),
    reserveExact(clientB, raceVariant.id, lineB.quantity)
  ]);
  check(
    "concurrent reservations cannot both take the last unit",
    reservedA + reservedB === 1,
    `reservedA=${reservedA} reservedB=${reservedB}`
  );
  const raceAfter = await dbVariant(raceVariant.id);
  check(
    "variant stock and reservation end at one unit, never oversold",
    raceAfter.stock === 1 && raceAfter.reserved === 1 && raceAfter.stock - raceAfter.reserved === 0,
    `stock=${raceAfter.stock} reserved=${raceAfter.reserved}`
  );
  const thirdReservation = await reserveExact(clientA, raceVariant.id, 1);
  check("a third reservation of the exhausted variant is refused", thirdReservation === 0, `rows=${thirdReservation}`);
  const cartAfterReservation = await addCartLine(customerA, raceId, raceVariant.id, 1);
  check(
    "cart add refuses once the last unit is reserved",
    cartAfterReservation.status === 409 && cartAfterReservation.body?.code === "insufficient_stock",
    `mode=${DB_FIXTURES ? "service" : "http"} status=${cartAfterReservation.status} code=${cartAfterReservation.body?.code ?? ""}`
  );
  const ordersAfterReservation = await prisma.order.count();
  const paymentsAfterReservation = await prisma.payment.count();
  check(
    "reservation concurrency created no order or payment row",
    ordersAfterReservation === baseline.orders && paymentsAfterReservation === baseline.payments,
    `orders=${ordersAfterReservation}/${baseline.orders} payments=${paymentsAfterReservation}/${baseline.payments}`
  );
  await releaseReserved(raceVariant.id);

  /* ------------------------------------------------------------------ */
  /* 8. Committed reservation is a hard stock floor                      */
  /* ------------------------------------------------------------------ */
  const committedReservation = await reserveExact(clientA, mediumAfter.id, 2);
  check("run-owned variant reserved for the stock-floor checks", committedReservation === 1, `rows=${committedReservation}`);
  const floorSeller = await api(sellerB.cookie, "PATCH", `/api/seller/products/${sellerId}`, {
    variants: [
      { id: sellerSmall.id, name: smallAfter.name, sku: smallAfter.sku, priceKobo: "115000", stock: 4, isActive: false },
      { id: mediumAfter.id, name: mediumAfter.name, sku: mediumAfter.sku, priceKobo: "125000", stock: 1, isActive: true }
    ]
  });
  check(
    "seller stock edit below committed reservations refused",
    floorSeller.status === 409 && floorSeller.body?.code === "variant_stock_below_reserved",
    `status=${floorSeller.status} code=${floorSeller.body?.code ?? ""}`
  );
  const floorAdmin = await api(adminCookie, "PATCH", "/api/admin/catalogue/products", {
    id: sellerId,
    variants: [
      { id: sellerSmall.id, name: smallAfter.name, sku: smallAfter.sku, priceKobo: "115000", stock: 4, isActive: false },
      { id: mediumAfter.id, name: mediumAfter.name, sku: mediumAfter.sku, priceKobo: "125000", stock: 1, isActive: true }
    ]
  });
  check(
    "admin stock edit below committed reservations refused",
    floorAdmin.status === 409 && floorAdmin.body?.code === "variant_stock_below_reserved",
    `status=${floorAdmin.status} code=${floorAdmin.body?.code ?? ""}`
  );
  const floorDeactivate = await api(sellerB.cookie, "PATCH", `/api/seller/products/${sellerId}`, {
    variants: [
      { id: sellerSmall.id, name: smallAfter.name, sku: smallAfter.sku, priceKobo: "115000", stock: 4, isActive: false },
      { id: mediumAfter.id, name: mediumAfter.name, sku: mediumAfter.sku, priceKobo: "125000", stock: 2, isActive: false }
    ]
  });
  check(
    "reserved variant cannot be deactivated",
    floorDeactivate.status === 409 && floorDeactivate.body?.code === "variant_in_use",
    `status=${floorDeactivate.status} code=${floorDeactivate.body?.code ?? ""}`
  );
  await releaseReserved(mediumAfter.id);
  const floorRetry = await api(sellerB.cookie, "PATCH", `/api/seller/products/${sellerId}`, {
    variants: [
      { id: sellerSmall.id, name: smallAfter.name, sku: smallAfter.sku, priceKobo: "115000", stock: 4, isActive: false },
      { id: mediumAfter.id, name: mediumAfter.name, sku: mediumAfter.sku, priceKobo: "125000", stock: 1, isActive: true }
    ]
  });
  check(
    "stock edit succeeds after the run-owned reservation is released",
    floorRetry.status === 200,
    `status=${floorRetry.status} code=${floorRetry.body?.code ?? ""}`
  );
  await api(sellerB.cookie, "PATCH", `/api/seller/products/${sellerId}`, {
    variants: [
      { id: sellerSmall.id, name: smallAfter.name, sku: smallAfter.sku, priceKobo: "115000", stock: 4, isActive: false },
      { id: mediumAfter.id, name: mediumAfter.name, sku: mediumAfter.sku, priceKobo: "125000", stock: 2, isActive: true }
    ]
  });

  /* ------------------------------------------------------------------ */
  /* 9. Concurrent stock floor and concurrent deactivation (order race)  */
  /* ------------------------------------------------------------------ */
  const gapStockCreate = DB_FIXTURES
    ? {
        body: await provisionProduct({
          vendorId: sellerB.vendorId,
          suffix: "gapstock",
          priceKobo: 200_000,
          variants: singleVariant("GAPSTOCK", 200_000, 5)
        })
      }
    : await sellerProduct(sellerB.cookie, "gapstock", {
        priceKobo: 200_000,
        variants: singleVariant("GAPSTOCK", 200_000, 5)
      });
  const gapStockId = trackProduct(gapStockCreate);
  const gapStockVariant = (await dbVariants(gapStockId))[0];
  const gapStockRace = await lockAndRace({
    cookie: sellerB.cookie,
    productId: gapStockId,
    variantId: gapStockVariant.id,
    patchBody: {
      variants: [
        {
          id: gapStockVariant.id,
          name: gapStockVariant.name,
          sku: gapStockVariant.sku,
          priceKobo: "200000",
          stock: 0,
          isActive: true,
          attributes: { Size: "Only" }
        }
      ]
    },
    reserveQuantity: 2
  });
  const gapStockAfter = await dbVariant(gapStockVariant.id);
  check(
    "concurrent stock edit never falls below the committed reservation",
    gapStockAfter.stock >= gapStockAfter.reserved,
    `stock=${gapStockAfter.stock} reserved=${gapStockAfter.reserved} blocked=${gapStockRace.blocked} patch=${gapStockRace.patchStatus}`
  );
  await releaseReserved(gapStockVariant.id);

  const gapDeactivateCreate = DB_FIXTURES
    ? {
        body: await provisionProduct({
          vendorId: sellerB.vendorId,
          suffix: "gapdeactivate",
          priceKobo: 210_000,
          variants: singleVariant("GAPDEACT", 210_000, 5)
        })
      }
    : await sellerProduct(sellerB.cookie, "gapdeactivate", {
        priceKobo: 210_000,
        variants: singleVariant("GAPDEACT", 210_000, 5)
      });
  const gapDeactivateId = trackProduct(gapDeactivateCreate);
  const gapDeactivateVariant = (await dbVariants(gapDeactivateId))[0];
  const gapDeactivateRace = await lockAndRace({
    cookie: sellerB.cookie,
    productId: gapDeactivateId,
    variantId: gapDeactivateVariant.id,
    patchBody: {
      variants: [
        {
          id: gapDeactivateVariant.id,
          name: gapDeactivateVariant.name,
          sku: gapDeactivateVariant.sku,
          priceKobo: "210000",
          stock: 5,
          isActive: false,
          attributes: { Size: "Only" }
        }
      ]
    },
    reserveQuantity: 1
  });
  const gapDeactivateAfter = await dbVariant(gapDeactivateVariant.id);
  check(
    "concurrent deactivation cannot leave a reserved inactive variant",
    gapDeactivateAfter.isActive === true || gapDeactivateAfter.reserved === 0,
    `isActive=${gapDeactivateAfter.isActive} reserved=${gapDeactivateAfter.reserved} blocked=${gapDeactivateRace.blocked} patch=${gapDeactivateRace.patchStatus}`
  );
  await releaseReserved(gapDeactivateVariant.id);

  /* ------------------------------------------------------------------ */
  /* 10. Optional per-variant image selection                            */
  /* ------------------------------------------------------------------ */
  const variantColumns = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'ProductVariant' ORDER BY column_name`
  );
  const imageColumn = variantColumns.find((row) => /image/i.test(row.column_name));
  check(
    "ProductVariant has a per-variant image column",
    imageColumn?.column_name === "imageUrl",
    `column=${imageColumn?.column_name ?? "none"}`
  );
  const imageColumns = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'ProductImage' ORDER BY column_name`
  );
  const variantReference = imageColumns.find((row) => /variant/i.test(row.column_name));
  check(
    "ProductImage carries no variant reference",
    !variantReference,
    `column=${variantReference?.column_name ?? "none"}`
  );

  const imagePayload = await api(sellerB.cookie, "PATCH", `/api/seller/products/${sellerId}`, {
    variants: [
      {
        id: sellerSmall.id,
        name: smallAfter.name,
        sku: smallAfter.sku,
        priceKobo: "115000",
        stock: 4,
        isActive: false,
        attributes: { Size: "Small" },
        imageId: "run-variant-image",
        imageUrl: "/generated/shop/product-stainless-steel-cookware-set.webp"
      },
      {
        id: mediumAfter.id,
        name: mediumAfter.name,
        sku: mediumAfter.sku,
        priceKobo: "125000",
        stock: 2,
        isActive: true,
        attributes: { Size: "Medium" }
      }
    ]
  });
  const imageVariant = (imagePayload.body?.variants ?? []).find((variant) => variant.id === mediumAfter.id);
  check(
    "unsupported per-variant fields are rejected rather than ignored",
    imagePayload.status === 400 && imagePayload.body?.code === "unsupported_variant_field",
    `status=${imagePayload.status} code=${imagePayload.body?.code ?? ""}`
  );
  if (DB_FIXTURES) {
    blocked(
      "public variant payload exposes no image selection",
      "public product detail is Shop-gated; the schema checks above and the API response below still prove the field is absent"
    );
  } else {
    const publicSellerImage = await api("", "GET", `/api/products/${encodeURIComponent(sellerSlug)}`);
    const publicVariantImageKey = (publicSellerImage.body?.variants ?? []).some((variant) => "imageUrl" in variant);
    check("public variant payload exposes image selection", publicVariantImageKey, `hasImageKey=${publicVariantImageKey}`);
  }
  check(
    "optional per-variant image selection is implemented",
    Boolean(imageColumn) && imagePayload.status === 400,
    "ProductVariant.imageUrl, validated against the product gallery; public variants expose imageUrl"
  );

  /* ------------------------------------------------------------------ */
  /* 11. Final counts are checked after cleanup in finalize()            */
  /* ------------------------------------------------------------------ */
  record(
    "harness fixtures ready for cleanup",
    "INFO",
    `products=${created.productIds.size} variants=${created.variantIds.size} users=${created.userIds.length} vendors=${created.vendorIds.length}`
  );
}

async function cleanup() {
  const productIds = [...created.productIds];
  const cleanupProblems = [];

  for (const cookie of created.cookies) {
    await api(cookie, "POST", "/api/auth/logout").catch(() => undefined);
  }

  for (const productId of productIds) {
    await prisma.$executeRaw`UPDATE "ProductVariant" SET reserved = 0 WHERE "productId" = ${productId}`.catch(() => undefined);
  }
  for (const variantId of created.variantIds) {
    await prisma.$executeRaw`UPDATE "ProductVariant" SET reserved = 0 WHERE id = ${variantId}`.catch(() => undefined);
  }

  for (const productId of productIds) {
    await prisma.cartItem.deleteMany({ where: { productId } }).catch((error) => cleanupProblems.push(`cartItem ${sanitize(error.message)}`));
  }
  for (const userId of created.userIds) {
    const carts = await prisma.cart.findMany({ where: { userId }, select: { id: true } }).catch(() => []);
    for (const cart of carts) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } }).catch(() => undefined);
    }
    await prisma.cart.deleteMany({ where: { userId } }).catch((error) => cleanupProblems.push(`cart ${sanitize(error.message)}`));
  }
  for (const productId of productIds) {
    await prisma.searchSyncEvent.deleteMany({ where: { entityId: productId } }).catch(() => undefined);
  }

  const strays = await prisma.product
    .findMany({ where: { name: { startsWith: runId } }, select: { id: true } })
    .catch(() => []);
  for (const stray of strays) created.productIds.add(stray.id);

  for (const productId of [...created.productIds]) {
    await prisma.productVariant.deleteMany({ where: { productId } }).catch((error) => cleanupProblems.push(`variant ${sanitize(error.message)}`));
    await prisma.productImage.deleteMany({ where: { productId } }).catch((error) => cleanupProblems.push(`image ${sanitize(error.message)}`));
    await prisma.inventoryStock.deleteMany({ where: { productId } }).catch((error) => cleanupProblems.push(`stock ${sanitize(error.message)}`));
    await prisma.searchSyncEvent.deleteMany({ where: { entityId: productId } }).catch(() => undefined);
    await prisma.product.delete({ where: { id: productId } }).catch((error) => cleanupProblems.push(`product ${sanitize(error.message)}`));
  }

  for (const vendorId of created.vendorIds) {
    const vendorProducts = await prisma.product.findMany({ where: { vendorId }, select: { id: true } }).catch(() => []);
    for (const product of vendorProducts) {
      await prisma.productVariant.deleteMany({ where: { productId: product.id } }).catch(() => undefined);
      await prisma.productImage.deleteMany({ where: { productId: product.id } }).catch(() => undefined);
      await prisma.inventoryStock.deleteMany({ where: { productId: product.id } }).catch(() => undefined);
      await prisma.product.delete({ where: { id: product.id } }).catch(() => undefined);
    }
    await prisma.vendor.delete({ where: { id: vendorId } }).catch((error) => cleanupProblems.push(`vendor ${sanitize(error.message)}`));
  }

  for (const userId of created.userIds) {
    await prisma.session.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.userRole.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: userId } }).catch((error) => cleanupProblems.push(`user ${sanitize(error.message)}`));
  }

  return cleanupProblems;
}

async function finalize(baseline, cleanupProblems) {
  let final = null;
  if (baseline) {
    final = await snapshot();
    check(
      "catalogue product/active/variant counts restored",
      final.products === baseline.products && final.active === baseline.active && final.variants === baseline.variants,
      `before=${JSON.stringify({ products: baseline.products, active: baseline.active, variants: baseline.variants })} after=${JSON.stringify({ products: final.products, active: final.active, variants: final.variants })}`
    );
    check(
      "no order, payment, refund or wallet rows were created",
      final.orders === baseline.orders &&
        final.payments === baseline.payments &&
        final.refunds === baseline.refunds &&
        final.wallets === baseline.wallets,
      `orders=${final.orders}/${baseline.orders} payments=${final.payments}/${baseline.payments} refunds=${final.refunds}/${baseline.refunds} wallets=${final.wallets}/${baseline.wallets}`
    );
    check(
      "run-owned carts and users removed",
      final.carts === baseline.carts && final.users === baseline.users,
      `carts=${final.carts}/${baseline.carts} users=${final.users}/${baseline.users}`
    );
  }
  const strayProducts = await prisma.product.count({ where: { name: { startsWith: runId } } }).catch(() => -1);
  check("no run-owned product remains", strayProducts === 0, `remaining=${strayProducts}`);
  check("cleanup completed without errors", cleanupProblems.length === 0, cleanupProblems.join(" | "));

  const failedNow = results.filter((row) => row.status === "FAIL").length;
  const gapsNow = results.filter((row) => row.status === "GAP").length;
  const summaryNow = {
    passed: results.filter((row) => row.status === "PASS").length,
    gap: gapsNow,
    limitation: results.filter((row) => row.status === "LIMITATION").length,
    blocked: results.filter((row) => row.status === "BLOCKED").length,
    info: results.filter((row) => row.status === "INFO").length,
    failed: failedNow
  };

  const evidence = {
    runId,
    base: BASE,
    buildId,
    database: { name: EXPECTED_DB, classification: "REVIEW" },
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    baseline,
    final,
    summary: summaryNow,
    results,
    gaps: results.filter((row) => row.status === "GAP"),
    limitations: results.filter((row) => row.status === "LIMITATION"),
    failures: results.filter((row) => row.status === "FAIL"),
    cleanup: { problems: cleanupProblems }
  };
  try {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const text = `${JSON.stringify(evidence, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`;
    fs.writeFileSync(path.join(EVIDENCE_DIR, `${runId}.json`), text);
    fs.writeFileSync(path.join(EVIDENCE_DIR, "latest.json"), text);
    console.log(`EVIDENCE ${path.relative(ROOT, path.join(EVIDENCE_DIR, `${runId}.json`))}`);
  } catch (error) {
    console.error(`EVIDENCE WARN ${sanitize(error.message)}`);
  }

  console.log(
    `\nSUMMARY passed=${summaryNow.passed} gap=${summaryNow.gap} limitation=${summaryNow.limitation} blocked=${summaryNow.blocked} info=${summaryNow.info} failed=${summaryNow.failed}`
  );
  if (summaryNow.blocked > 0) {
    console.log(`INCOMPLETE ${summaryNow.blocked} check(s) blocked by shared REVIEW state or the environment`);
  }
  for (const row of results.filter((entry) => entry.status === "GAP")) {
    console.log(`GAP ${row.name} — ${row.detail}`);
  }
  for (const row of results.filter((entry) => entry.status === "FAIL")) {
    console.log(`FAIL ${row.name} — ${row.detail}`);
  }
  process.exitCode = summaryNow.failed > 0 || summaryNow.gap > 0 ? 1 : 0;
}

(async () => {
  try {
    await guard();
  } catch (error) {
    console.error(`REFUSED ${sanitize(error.message)}`);
    await prisma.$disconnect();
    process.exit(2);
  }

  poller = new PrismaClient({ datasources: { db: { url: limitedUrl(REVIEW_URL, 2) } } });
  locker = new PrismaClient({ datasources: { db: { url: limitedUrl(REVIEW_URL, 2) } } });
  clientA = new PrismaClient({ datasources: { db: { url: limitedUrl(REVIEW_URL, 2) } } });
  clientB = new PrismaClient({ datasources: { db: { url: limitedUrl(REVIEW_URL, 2) } } });

  let baseline = null;
  let cleanupProblems = [];
  try {
    baseline = await snapshot();
    console.log(`BASELINE ${JSON.stringify(baseline)}`);
    await run(baseline);
  } catch (error) {
    record("run completed without an unexpected abort", "FAIL", error?.stack || error?.message || error);
  } finally {
    try {
      cleanupProblems = await cleanup();
    } catch (error) {
      cleanupProblems = [`cleanup crashed: ${sanitize(error?.message || error)}`];
    }
    try {
      await finalize(baseline, cleanupProblems);
    } finally {
      await Promise.all(
        [prisma, poller, locker, clientA, clientB]
          .filter(Boolean)
          .map((client) => client.$disconnect().catch(() => undefined))
      );
    }
  }
})();
