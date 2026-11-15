/**
 * REVIEW-only product-detail gap acceptance.
 *
 * Covers the bounded gaps left open by the shop acceptance runs:
 *   1. variant selection changes price/stock in the UI and the server rejects
 *      missing, foreign, inactive and out-of-stock combinations;
 *   2. approved reviews render while pending/rejected reviews stay hidden;
 *   3. a failed related-products request never breaks the main product page;
 *   4. gallery keyboard operation, quantity cap, add-to-cart badge continuity
 *      and the anonymous sign-in return journey;
 *   5. admin/seller gallery order/alt, category attributes, draft preview,
 *      publish/unpublish/archive and the public render of the published row;
 *   6. unauthorized and out-of-country rejection; archived product returns 404;
 *   7. the seller-location wording (no "dispatches from" claim).
 *
 * Every record this run creates carries the run ID in its name/slug/order
 * number and is deleted in `finally`. The accepted REVIEW catalogue is
 * snapshotted before the first fixture and compared afterwards; the run never
 * edits shared departments, taxonomy, payments or schema.
 *
 * Usage:
 *   REVIEW_BASE_URL=http://localhost:3059 node scripts/product-detail-gap-tests.cjs
 *
 * The database is selected by REVIEW_DATABASE_URL when set; otherwise the
 * connection string in .env is reused with the database name replaced by
 * REVIEW_EXPECTED_DATABASE (default naijadeals_review). The script refuses to
 * write unless the database reports the REVIEW classification. The connection
 * string is never printed.
 */
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { chromium } = require("playwright");
const { PrismaClient } = require("@prisma/client");

const BASE = (process.env.REVIEW_BASE_URL || "http://localhost:3059").replace(/\/+$/, "");
const EXPECTED_DB = process.env.REVIEW_EXPECTED_DATABASE || "naijadeals_review";
const EVIDENCE_FILE = path.join("qa-artifacts", "review-basket", "product-detail-gap.json");
const SHOT_DIR = path.join("qa-artifacts", "visual", "product-detail-gap");
const ADMIN_CREDENTIAL = path.join("qa-artifacts", "review-basket", ".admin-credential");
const CUSTOMER_CREDENTIAL = path.join("qa-artifacts", "review-basket", ".credential");
const SELLER_CREDENTIAL = path.join("qa-artifacts", "review-basket", ".seller-credential");
const GH_ADMIN_CREDENTIAL = path.join("qa-artifacts", "review-basket", ".gh-admin-credential");

const IMAGE_A = {
  url: "/generated/shop/product-stainless-steel-cookware-set.webp",
  alt: "PDG fixture image one: stainless steel cookware set"
};
const IMAGE_B = {
  url: "/generated/shop/product-retro-kitchen-blender.webp",
  alt: "PDG fixture image two: retro kitchen blender"
};
const IMAGE_C = {
  url: "/generated/shop/category-home-kitchen.webp",
  alt: "PDG fixture image three: home and kitchen category artwork"
};
const IMAGE_D = {
  url: "/generated/shop/product-air-fryer-5-5l.webp",
  alt: "PDG fixture image four: 5.5 litre air fryer"
};

function reviewDatabaseUrl() {
  if (process.env.REVIEW_DATABASE_URL) return process.env.REVIEW_DATABASE_URL;
  const envText = fs.readFileSync(".env", "utf8");
  const line = envText.split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL is not configured in .env");
  let raw = line.slice("DATABASE_URL=".length).trim();
  if (raw.startsWith('"')) raw = raw.slice(1, -1);
  const url = new URL(raw);
  url.pathname = `/${EXPECTED_DB}`;
  return url.toString();
}

const prisma = new PrismaClient({ datasources: { db: { url: reviewDatabaseUrl() } } });

const results = [];
const screenshots = [];
const fixture = {
  runId: "",
  categoryId: null,
  vendorId: null,
  reviewerId: null,
  variantProductId: null,
  galleryProductId: null,
  adminProductId: null,
  sellerProductId: null,
  variantProductSlug: null,
  galleryProductSlug: null,
  adminProductSlug: null,
  sellerProductSlug: null,
  orderIds: [],
  variantIds: {}
};

function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 500) });
  return Boolean(ok);
}

function credentials(file) {
  if (!fs.existsSync(file)) throw new Error(`credential file missing: ${file}`);
  return fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
}

async function guard() {
  const rows = await prisma.$queryRawUnsafe("select current_database() as name");
  const name = rows[0]?.name ?? "";
  if (name !== EXPECTED_DB) {
    throw new Error(`refusing: connected to ${name}, expected ${EXPECTED_DB}`);
  }
  const classification = await prisma.databaseClassification.findMany({ select: { classification: true } });
  if (!classification.some((row) => row.classification === "REVIEW")) {
    throw new Error("refusing: database is not classified REVIEW");
  }
  return { database: name, classification: classification.map((row) => row.classification) };
}

async function baselineSnapshot() {
  const products = await prisma.product.findMany({
    select: { id: true, slug: true, status: true, priceKobo: true, vendorId: true }
  });
  const counts = {
    products: await prisma.product.count(),
    activeProducts: await prisma.product.count({ where: { status: "ACTIVE" } }),
    departments: await prisma.category.count(),
    activeDepartments: await prisma.category.count({ where: { isActive: true } }),
    orders: await prisma.order.count()
  };
  return {
    counts,
    products: products.map((row) => ({
      id: row.id,
      slug: row.slug,
      status: row.status,
      priceKobo: row.priceKobo.toString(),
      vendorId: row.vendorId
    }))
  };
}

async function createImageSet(images) {
  return images.map((image, index) => ({ url: image.url, alt: image.alt, sortOrder: index }));
}

async function createFixtureProduct(input) {
  return prisma.product.create({
    data: {
      vendorId: fixture.vendorId,
      categoryId: fixture.categoryId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      priceKobo: BigInt(input.priceKobo),
      countryCode: "NG",
      status: "ACTIVE",
      isDemo: true,
      attributes: input.attributes,
      images: { create: await createImageSet(input.images) },
      stock: { create: { quantity: input.quantity, lowStockLevel: 2 } }
    },
    include: { images: true, stock: true, variants: true }
  });
}

async function createReviewFixture(product, status, rating, label) {
  const order = await prisma.order.create({
    data: {
      orderNumber: `PDG-${fixture.runId}-${label}`,
      customerId: fixture.reviewerId,
      vendorId: fixture.vendorId,
      status: "delivered",
      paymentStatus: "pending",
      subtotalKobo: product.priceKobo,
      totalKobo: product.priceKobo,
      deliveryAddress: "REVIEW PDG fixture address",
      contactName: "PDG Fixture",
      contactPhone: "+2340000000000",
      items: {
        create: {
          productId: product.id,
          quantity: 1,
          unitKobo: product.priceKobo,
          totalKobo: product.priceKobo,
          productName: product.name
        }
      }
    }
  });
  fixture.orderIds.push(order.id);
  return prisma.review.create({
    data: {
      productId: product.id,
      userId: fixture.reviewerId,
      orderId: order.id,
      rating,
      title: `PDG ${label.toLowerCase()} review ${fixture.runId}`,
      body: `Fixture review body for ${label.toLowerCase()} moderation state (${fixture.runId}).`,
      status,
      verifiedPurchase: true
    }
  });
}

async function shot(page, name, options = {}) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const file = path.join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: options.fullPage ?? false });
  screenshots.push(path.relative(process.cwd(), file).replace(/\\/g, "/"));
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 90000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/auth/login"), { timeout: 60000 }).catch(() => null),
    page.getByRole("button", { name: /sign in/i }).first().click()
  ]);
  await page.waitForFunction(() => !location.pathname.startsWith("/login"), null, { timeout: 60000 });
  await page.waitForLoadState("networkidle").catch(() => null);
}

async function api(context, method, route, data) {
  const response = await context.request.fetch(`${BASE}${route}`, {
    method,
    data: data === undefined ? undefined : data,
    headers: { Origin: BASE }
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 300);
  }
  return { status: response.status(), body };
}

async function cartTotals(context) {
  const response = await context.request.get(`${BASE}/api/cart`);
  const body = await response.json();
  const items = Array.isArray(body.items) ? body.items : [];
  return {
    status: response.status(),
    count: items.filter((item) => !item.savedForLater).reduce((sum, item) => sum + item.quantity, 0),
    items
  };
}

async function cleanupFixtures() {
  const productIds = [
    fixture.variantProductId,
    fixture.galleryProductId,
    fixture.adminProductId,
    fixture.sellerProductId
  ].filter(Boolean);
  const cleanup = { products: 0, images: 0, stock: 0, variants: 0, cartItems: 0, reviews: 0, orders: 0, orderItems: 0, users: 0 };
  if (productIds.length) {
    cleanup.cartItems = (await prisma.cartItem.deleteMany({ where: { productId: { in: productIds } } })).count;
    cleanup.orderItems = (await prisma.orderItem.deleteMany({ where: { productId: { in: productIds } } })).count;
  }
  if (fixture.reviewerId) {
    cleanup.reviews = (await prisma.review.deleteMany({ where: { userId: fixture.reviewerId } })).count;
    if (fixture.reviewerId) {
      cleanup.reviews += (await prisma.review.deleteMany({ where: { productId: { in: productIds } } })).count;
    }
  } else if (productIds.length) {
    cleanup.reviews = (await prisma.review.deleteMany({ where: { productId: { in: productIds } } })).count;
  }
  if (fixture.reviewerId) {
    cleanup.orders = (await prisma.order.deleteMany({ where: { customerId: fixture.reviewerId } })).count;
  }
  if (productIds.length) {
    cleanup.variants = (await prisma.productVariant.deleteMany({ where: { productId: { in: productIds } } })).count;
    cleanup.images = (await prisma.productImage.deleteMany({ where: { productId: { in: productIds } } })).count;
    cleanup.stock = (await prisma.inventoryStock.deleteMany({ where: { productId: { in: productIds } } })).count;
    cleanup.products = (await prisma.product.deleteMany({ where: { id: { in: productIds } } })).count;
  }
  if (fixture.reviewerId) {
    cleanup.users = (await prisma.user.deleteMany({ where: { id: fixture.reviewerId } })).count;
  }
  return cleanup;
}

async function verifyPreserved(baseline) {
  const after = {
    products: await prisma.product.count(),
    activeProducts: await prisma.product.count({ where: { status: "ACTIVE" } }),
    departments: await prisma.category.count(),
    activeDepartments: await prisma.category.count({ where: { isActive: true } }),
    orders: await prisma.order.count()
  };
  const changed = [];
  for (const before of baseline.products) {
    const row = await prisma.product.findUnique({
      where: { id: before.id },
      select: { slug: true, status: true, priceKobo: true, vendorId: true }
    });
    if (!row) {
      changed.push({ id: before.id, issue: "missing" });
      continue;
    }
    if (
      row.slug !== before.slug ||
      row.status !== before.status ||
      row.priceKobo.toString() !== before.priceKobo ||
      row.vendorId !== before.vendorId
    ) {
      changed.push({ id: before.id, issue: "changed", before, after: { ...row, priceKobo: row.priceKobo.toString() } });
    }
  }
  const leftoverFixtures = await prisma.product.count({ where: { slug: { contains: fixture.runId } } });
  return { counts: after, baselineCounts: baseline.counts, changedAcceptedRows: changed, leftoverFixtures };
}

function optionsSummary(options) {
  return options.map((option) => ({ value: option.value, label: option.label, disabled: option.disabled }));
}

async function main() {
  const guardInfo = await guard();
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  fixture.runId = `pdg-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const runId = fixture.runId;
  const baseline = await baselineSnapshot();

  const category = await prisma.category.findFirst({ where: { slug: "cookware-bakeware", isActive: true } });
  const vendor = await prisma.vendor.findFirst({ where: { slug: "demo-catalogue-review" } });
  if (!category || !vendor) throw new Error("review category or demo vendor is missing");
  fixture.categoryId = category.id;
  fixture.vendorId = vendor.id;

  const reviewer = await prisma.user.create({
    data: {
      email: `${runId}@review.invalid`,
      name: `PDG Reviewer ${runId}`,
      actorType: "CUSTOMER",
      countryCode: "NG"
    }
  });
  fixture.reviewerId = reviewer.id;

  const variantProduct = await createFixtureProduct({
    name: `PDG Variant probe ${runId}`,
    slug: `pdg-variant-probe-${runId}`,
    description: "Run-owned product-detail variant fixture. Price and stock are test data, not a live offer.",
    priceKobo: 1250000,
    quantity: 6,
    attributes: { material: "Stainless steel", piece_count: 3 },
    images: [IMAGE_A, IMAGE_B, IMAGE_C]
  });
  fixture.variantProductId = variantProduct.id;
  fixture.variantProductSlug = variantProduct.slug;
  const variants = await prisma.$transaction([
    prisma.productVariant.create({
      data: { productId: variantProduct.id, name: "Standard set", sku: `${runId}-std`.toUpperCase(), priceKobo: 1250000n, stock: 5, imageUrl: IMAGE_A.url }
    }),
    prisma.productVariant.create({
      data: { productId: variantProduct.id, name: "Large set", sku: `${runId}-large`.toUpperCase(), priceKobo: 1800000n, stock: 2, imageUrl: IMAGE_B.url }
    }),
    prisma.productVariant.create({
      data: { productId: variantProduct.id, name: "Sold out set", sku: `${runId}-sold`.toUpperCase(), priceKobo: 2100000n, stock: 0 }
    })
  ]);
  fixture.variantIds = {
    standard: variants.find((variant) => variant.name === "Standard set").id,
    large: variants.find((variant) => variant.name === "Large set").id,
    soldOut: variants.find((variant) => variant.name === "Sold out set").id
  };

  const galleryProduct = await createFixtureProduct({
    name: `PDG Gallery quantity probe ${runId}`,
    slug: `pdg-gallery-probe-${runId}`,
    description: "Run-owned gallery, quantity and review fixture. Not a live offer.",
    priceKobo: 950000,
    quantity: 12,
    attributes: { material: "Aluminium", piece_count: 2 },
    images: [IMAGE_A, IMAGE_B, IMAGE_C]
  });
  fixture.galleryProductId = galleryProduct.id;
  fixture.galleryProductSlug = galleryProduct.slug;

  await createReviewFixture(galleryProduct, "APPROVED", 5, "APPROVED");
  await createReviewFixture(galleryProduct, "PENDING", 1, "PENDING");
  await createReviewFixture(galleryProduct, "REJECTED", 2, "REJECTED");

  await prisma.cartItem.deleteMany({ where: { productId: { in: [variantProduct.id, galleryProduct.id] } } });
  const baselineCart = await prisma.cartItem.findMany({ select: { cartId: true } });

  const browser = await chromium.launch();
  let cleanup = null;
  try {
    const customer = credentials(CUSTOMER_CREDENTIAL);
    const admin = credentials(ADMIN_CREDENTIAL);
    const seller = credentials(SELLER_CREDENTIAL);
    const ghAdmin = credentials(GH_ADMIN_CREDENTIAL);

    /* ------------------------------------------------------------------ */
    /* A. Variant selection + wording                                      */
    /* ------------------------------------------------------------------ */
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      const response = await page.goto(`${BASE}/product/${variantProduct.slug}`, { waitUntil: "networkidle", timeout: 90000 });
      await page.locator('[data-testid="product-title"]').waitFor();
      check("variant fixture public page status", response && response.status() === 200, `status=${response && response.status()}`);
      check("variant fixture title renders", (await page.locator('[data-testid="product-title"]').innerText()).includes("PDG Variant probe"), "");

      const priceText = await page.locator('[data-testid="product-price"]').innerText();
      const availabilityText = await page.locator('[data-testid="product-availability"]').innerText();
      check("default purchasable variant selected", (await page.locator('[data-testid="product-variant"]').inputValue()) === fixture.variantIds.large, priceText);
      check("default variant price is the variant price", /18,?000/.test(priceText), priceText);
      check("default variant stock is used", /2 units shown for demonstration|2 available/.test(availabilityText), availabilityText);

      const variantOptions = await page.locator('[data-testid="product-variant"] option').evaluateAll((nodes) =>
        nodes.map((node) => ({ value: node.value, label: node.textContent || "", disabled: node.disabled }))
      );
      check("all three variant options render", variantOptions.length === 3, JSON.stringify(optionsSummary(variantOptions)));
      const soldOut = variantOptions.find((option) => option.value === fixture.variantIds.soldOut);
      check("out-of-stock variant option is disabled", soldOut && soldOut.disabled === true, soldOut && soldOut.label);

      const quantityCountDefault = await page.locator('[data-testid="product-quantity"] option').count();
      check("quantity cap follows selected variant stock", quantityCountDefault === 2, `options=${quantityCountDefault}`);

      await page.locator('[data-testid="product-variant"]').selectOption(fixture.variantIds.standard);
      await page.waitForTimeout(200);
      const standardPrice = await page.locator('[data-testid="product-price"]').innerText();
      const standardAvailability = await page.locator('[data-testid="product-availability"]').innerText();
      check("switching variant changes price", /12,?500/.test(standardPrice), standardPrice);
      check("switching variant changes stock", /5 units shown for demonstration|5 available/.test(standardAvailability), standardAvailability);
      const quantityCountStandard = await page.locator('[data-testid="product-quantity"] option').count();
      check("quantity cap updates with variant stock", quantityCountStandard === 5, `options=${quantityCountStandard}`);
      check(
        "selected variant leaves the product-level gallery unchanged",
        (await page.locator('[data-testid="product-main-image"]').getAttribute("src")) === IMAGE_A.url,
        await page.locator('[data-testid="product-main-image"]').getAttribute("src")
      );
      await page.locator('[data-testid="product-variant"]').selectOption(fixture.variantIds.large);
      await page.waitForTimeout(300);
      check(
        "switching to a variant does not reintroduce the deferred per-variant image contract",
        (await page.locator('[data-testid="product-main-image"]').getAttribute("src")) === IMAGE_A.url,
        await page.locator('[data-testid="product-main-image"]').getAttribute("src")
      );

      const sectionText = await page.locator('[data-testid="purchase-panel"]').innerText();
      const sellerText = await page.locator('section[aria-labelledby="seller-heading"]').innerText();
      check("seller location wording replaces dispatch claims", sellerText.includes("Seller location:") && sellerText.includes("not a confirmed dispatch address"), sellerText.slice(0, 120));
      check("no dispatches-from claim on the page", !(await page.content()).includes("Dispatches from"), "");
      check("no ships-from-market claim on the page", !(await page.content()).includes("Ships from the seller"), "");
      check("review environment explains checkout is disabled", sectionText.includes("REVIEW catalogue") && !(await page.locator('button', { hasText: "Buy now" }).count()), "no Buy now in REVIEW");
      await shot(page, "variant-desktop");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(250);
      await shot(page, "variant-mobile");
      await context.close();
    } catch (error) {
      check("variant UI section completed", false, error.message);
    }

    /* ------------------------------------------------------------------ */
    /* B. Server variant rejection + quantity cap                          */
    /* ------------------------------------------------------------------ */
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      await signIn(page, customer[0], customer[1]);
      check("customer sign-in for cart API", !page.url().includes("/login"), page.url());

      const foreign = await api(context, "POST", "/api/cart/items", {
        productId: galleryProduct.id,
        variantId: fixture.variantIds.large,
        quantity: 1
      });
      check("server rejects a variant from another product", foreign.status === 400 && foreign.body?.code === "variant_unavailable", `status=${foreign.status} code=${foreign.body?.code}`);

      const soldOut = await api(context, "POST", "/api/cart/items", {
        productId: variantProduct.id,
        variantId: fixture.variantIds.soldOut,
        quantity: 1
      });
      check("server rejects an out-of-stock variant", soldOut.status === 409 && soldOut.body?.code === "insufficient_stock", `status=${soldOut.status} code=${soldOut.body?.code}`);

      const missing = await api(context, "POST", "/api/cart/items", {
        productId: variantProduct.id,
        quantity: 1
      });
      check("server requires a variant when one is sold", missing.status === 400 && missing.body?.code === "variant_required", `status=${missing.status} code=${missing.body?.code}`);

      const unknown = await api(context, "POST", "/api/cart/items", {
        productId: variantProduct.id,
        variantId: "pdg-not-a-real-variant",
        quantity: 1
      });
      check("server rejects an unknown variant id", unknown.status === 400 && unknown.body?.code === "variant_unavailable", `status=${unknown.status} code=${unknown.body?.code}`);

      const overCap = await api(context, "POST", "/api/cart/items", {
        productId: galleryProduct.id,
        quantity: 11
      });
      check("server rejects quantity above the cap", overCap.status === 400 && overCap.body?.code === "validation_error", `status=${overCap.status} code=${overCap.body?.code}`);

      const valid = await api(context, "POST", "/api/cart/items", {
        productId: variantProduct.id,
        variantId: fixture.variantIds.large,
        quantity: 2
      });
      const validItem = (valid.body?.items || []).find((item) => item.variantId === fixture.variantIds.large);
      check("server accepts a valid variant combination", valid.status === 201 && validItem?.quantity === 2, `status=${valid.status} quantity=${validItem?.quantity}`);
      check("variant cart total uses the variant price", valid.body?.totals?.subtotalKobo === "3600000", JSON.stringify(valid.body?.totals ?? {}));
      await context.close();
    } catch (error) {
      check("server variant section completed", false, error.message);
    }

    /* ------------------------------------------------------------------ */
    /* C. Gallery keyboard, quantity cap, reviews, related isolation       */
    /* ------------------------------------------------------------------ */
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      await page.goto(`${BASE}/product/${galleryProduct.slug}`, { waitUntil: "networkidle", timeout: 90000 });
      await page.locator('[data-testid="product-title"]').waitFor();

      const stageCount = await page.locator('[data-testid="product-image-stage"]').getAttribute("data-image-count");
      check("gallery renders three images", stageCount === "3", `count=${stageCount}`);
      check("main image alt text comes from the first stored image", (await page.locator('[data-testid="product-main-image"]').getAttribute("alt")) === IMAGE_A.alt, "");
      const thumbSources = await page.locator('[data-testid="product-thumbnail"] img').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src")));
      check("gallery order matches stored sort order", JSON.stringify(thumbSources) === JSON.stringify([IMAGE_A.url, IMAGE_B.url, IMAGE_C.url]), JSON.stringify(thumbSources));

      await page.locator('[data-testid="product-thumbnail"]').nth(0).focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(250);
      const activeAfterRight = await page.locator('[data-testid="product-thumbnail"][aria-pressed="true"]').getAttribute("aria-label");
      const mainAltAfterRight = await page.locator('[data-testid="product-main-image"]').getAttribute("alt");
      const focusedLabel = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
      check("gallery arrow key changes image", mainAltAfterRight === IMAGE_B.alt, mainAltAfterRight);
      check("gallery arrow key updates aria-pressed", activeAfterRight === "Show image 2 of 3", activeAfterRight);
      check("gallery arrow key moves focus", focusedLabel === "Show image 2 of 3", focusedLabel);
      await page.keyboard.press("End");
      await page.waitForTimeout(200);
      check("gallery End key selects the last image", (await page.locator('[data-testid="product-main-image"]').getAttribute("alt")) === IMAGE_C.alt, "");
      await page.keyboard.press("Home");
      await page.waitForTimeout(200);
      check("gallery Home key returns to the first image", (await page.locator('[data-testid="product-main-image"]').getAttribute("alt")) === IMAGE_A.alt, "");

      await page.locator('[data-testid="product-image-stage"] button[aria-haspopup="dialog"]').focus();
      await page.keyboard.press("Enter");
      await page.locator('[role="dialog"][aria-modal="true"]').waitFor();
      const closeFocused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
      check("viewer opens from the keyboard and focuses Close", closeFocused === "Close image viewer", closeFocused);
      check("viewer shows the current image counter", (await page.locator('[role="dialog"]').innerText()).includes("Image 1 of 3"), "");
      await shot(page, "gallery-viewer");
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(200);
      check("viewer arrow key advances the image", (await page.locator('[role="dialog"]').innerText()).includes("Image 2 of 3"), "");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      check("Escape closes the viewer", (await page.locator('[role="dialog"]').count()) === 0, "");
      const restoredFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
      check("viewer returns focus to its trigger", typeof restoredFocus === "string" && restoredFocus.startsWith("Open full-screen image viewer"), restoredFocus);
      check("viewer unlocks body scrolling", await page.evaluate(() => document.body.style.overflow !== "hidden"), "");

      const quantityOptions = await page.locator('[data-testid="product-quantity"] option').count();
      check("quantity selector caps at ten", quantityOptions === 10, `options=${quantityOptions}`);
      check("quantity cap helper text renders", (await page.getByText("Maximum 10 per order.").count()) > 0, "");
      await page.locator('[data-testid="product-quantity"]').selectOption("10");
      check("quantity ten can be selected", (await page.locator('[data-testid="product-quantity"]').inputValue()) === "10", "");

      const reviewsText = await page.locator('[data-testid="product-reviews"]').innerText();
      check("approved review renders", reviewsText.includes(`PDG approved review ${runId}`), "");
      check("rejected review stays hidden", !reviewsText.includes(`PDG rejected review ${runId}`), "");
      check("pending review stays hidden", !reviewsText.includes(`PDG pending review ${runId}`), "");
      check("review summary counts only approved rows", reviewsText.includes("1 approved review") && reviewsText.includes("5 out of 5"), reviewsText.split("\n").slice(0, 4).join(" | "));
      await page.locator('[data-testid="product-reviews"]').scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await shot(page, "reviews-section");
      await context.close();
    } catch (error) {
      check("gallery/review section completed", false, error.message);
    }

    /* ------------------------------------------------------------------ */
    /* D. Server-side related failure → unavailable/retry state             */
    /* ------------------------------------------------------------------ */
    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        extraHTTPHeaders: { "x-nd-related-failure": "1" }
      });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      let relatedRequests = 0;
      const abortRelated = async (route) => {
        relatedRequests += 1;
        await route.abort();
      };
      await page.route("**/api/products?*", abortRelated);
      const response = await page.goto(`${BASE}/product/${galleryProduct.slug}`, { waitUntil: "networkidle", timeout: 90000 });
      await page.locator('[data-testid="product-title"]').waitFor();
      check("server related failure leaves the product page 200", response?.status() === 200, `status=${response?.status()}`);
      check("server related failure is marked on the rendered page", (await page.locator('[data-related-initial-unavailable="true"]').count()) === 1, "");
      check("server related failure leaves no seeded related rail", (await page.locator('[data-testid="related-products"]').count()) === 0, "");
      check("product title/price/purchase survive the server related failure", (await page.locator('[data-testid="product-price"]').count()) === 1 && (await page.locator('[data-testid="purchase-panel"]').count()) === 1, "");
      await page.locator('[data-testid="related-products-unavailable"]').waitFor({ timeout: 60000 });
      check("failed client retry shows the unavailable state", (await page.getByText("Related listings could not be loaded").count()) === 1 && relatedRequests > 0, `requests=${relatedRequests}`);
      const retryButton = page.getByRole("button", { name: "Try related listings again" });
      check("unavailable state offers a retry control", (await retryButton.count()) === 1, "");
      await shot(page, "related-server-failure-unavailable");
      await page.unroute("**/api/products?*", abortRelated);
      await retryButton.click();
      await page.locator('[data-testid="related-products"]').waitFor({ timeout: 60000 });
      check("retry restores the related rail", (await page.locator('[data-testid="related-products"]').count()) === 1, "");
      await shot(page, "related-retry-restored");
      await context.close();
    } catch (error) {
      check("related failure isolation section completed", false, error.message);
    }

    /* ------------------------------------------------------------------ */
    /* E. Anonymous add-to-cart → sign-in return → badge                   */
    /* ------------------------------------------------------------------ */
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      await page.goto(`${BASE}/product/${galleryProduct.slug}`, { waitUntil: "networkidle", timeout: 90000 });
      await page.locator('[data-testid="add-to-cart"]').click();
      await page.waitForFunction(() => location.pathname.startsWith("/login"), null, { timeout: 60000 });
      const next = new URL(page.url()).searchParams.get("next") || "";
      check("anonymous add redirects to sign-in with return path", next === `/product/${galleryProduct.slug}`, `next=${next}`);

      const loginEmail = customer[0];
      const loginPassword = customer[1];
      await page.locator('input[type="email"]').fill(loginEmail);
      await page.locator('input[type="password"]').fill(loginPassword);
      await Promise.all([
        page.waitForResponse((response) => response.url().includes("/api/auth/login"), { timeout: 60000 }).catch(() => null),
        page.getByRole("button", { name: /sign in/i }).first().click()
      ]);
      await page.waitForFunction((expected) => location.pathname === expected, `/product/${galleryProduct.slug}`, { timeout: 60000 }).catch(() => null);
      await page.waitForLoadState("networkidle").catch(() => null);
      check("sign-in returns to the product page", page.url().includes(`/product/${galleryProduct.slug}`), page.url());

      await page.locator('[data-testid="product-quantity"]').waitFor();
      const before = await cartTotals(context);
      await page.locator('[data-testid="product-quantity"]').selectOption("10");
      await page.locator('[data-testid="add-to-cart"]').click();
      await page.locator('[data-testid="cart-added-notice"]').waitFor();
      const notice = await page.locator('[data-testid="cart-added-notice"]').innerText();
      check("add-to-cart confirms ten units", notice.includes("Added 10 to your basket"), notice.slice(0, 100));
      const after = await cartTotals(context);
      check("server cart total increased by ten", after.count === before.count + 10, `before=${before.count} after=${after.count}`);
      const badge = page.locator('a[aria-label^="Cart,"]').first();
      await badge.waitFor();
      const badgeLabel = await badge.getAttribute("aria-label");
      check("shop header badge matches the server total", badgeLabel === `Cart, ${after.count} ${after.count === 1 ? "item" : "items"}`, badgeLabel);
      await shot(page, "cart-badge-after-add");
      await context.close();
    } catch (error) {
      check("sign-in return/cart section completed", false, error.message);
    }

    /* ------------------------------------------------------------------ */
    /* F. Admin edit → save → preview → publish → public                   */
    /* ------------------------------------------------------------------ */
    const adminName = `PDG Admin catalogue probe ${runId}`;
    const adminSlug = `pdg-admin-catalogue-probe-${runId}`;
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(90000);
      await signIn(page, admin[0], admin[1]);
      check("admin sign-in", !page.url().includes("/login"), page.url());

      const created = await api(context, "POST", "/api/admin/catalogue/products", {
        name: adminName,
        slug: adminSlug,
        description: "Run-owned admin catalogue fixture for product-detail publication acceptance.",
        priceKobo: 129900,
        currency: "NGN",
        countryCode: "NG",
        categoryId: category.id,
        attributes: { material: "Stainless steel", piece_count: 2 },
        quantity: 7,
        lowStockLevel: 2,
        images: [
          { url: IMAGE_A.url, alt: IMAGE_A.alt, order: 0, primary: true },
          { url: IMAGE_B.url, alt: IMAGE_B.alt, order: 1 },
          { url: IMAGE_C.url, alt: IMAGE_C.alt, order: 2 }
        ],
        isDemo: true
      });
      fixture.adminProductId = created.body?.id ?? null;
      fixture.adminProductSlug = adminSlug;
      check("admin creates a run-owned draft", created.status === 201 && created.body?.status === "DRAFT", `status=${created.status} code=${created.body?.code ?? ""}`);

      const previewPage = await context.newPage();
      const draftResponse = await previewPage.goto(`${BASE}/admin/catalogue/products/${fixture.adminProductId}/preview`, { waitUntil: "networkidle", timeout: 90000 });
      check("authorized draft preview page renders", draftResponse && draftResponse.status() === 200 && (await previewPage.content()).includes(adminName), `status=${draftResponse && draftResponse.status()}`);
      await previewPage.close();

      await page.goto(`${BASE}/admin/catalogue`, { waitUntil: "networkidle", timeout: 90000 });
      const row = page.locator("tbody tr", { hasText: adminName }).first();
      await row.waitFor();
      check("admin catalogue lists the draft", (await row.innerText()).includes("DRAFT"), "");

      await row.getByRole("button", { name: "Edit", exact: true }).click();
      const priceInput = page.locator('label:has-text("Price (") input').first();
      await priceInput.waitFor();
      await priceInput.fill("149.50");
      await page.getByRole("button", { name: "Save product", exact: true }).click();
      await page.getByText("Product saved. Validate it before publishing.").waitFor();
      const savedRow = page.locator("tbody tr", { hasText: adminName }).first();
      await page.waitForFunction(
        (name) => {
          const rows = Array.from(document.querySelectorAll("tbody tr"));
          const target = rows.find((entry) => (entry.textContent || "").includes(name));
          return target ? (target.textContent || "").includes("149.50") : false;
        },
        adminName,
        { timeout: 60000 }
      );
      check("admin edit→save changes the stored price", (await savedRow.innerText()).includes("149.50"), "");

      await savedRow.getByRole("button", { name: "Preview", exact: true }).click();
      const previewPanel = page.locator('[data-testid="catalogue-preview"]');
      await previewPanel.waitFor();
      check("inline preview renders the saved draft", (await previewPanel.innerText()).includes(adminName) && (await previewPanel.innerText()).includes("149.50"), "");
      await previewPanel.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await shot(page, "admin-catalogue-preview");

      await savedRow.getByRole("button", { name: "Validate", exact: true }).click();
      const validationPanel = page.locator('[data-testid="catalogue-validation"]');
      await validationPanel.waitFor();
      await page.waitForFunction(
        () => {
          const panel = document.querySelector('[data-testid="catalogue-validation"]');
          return panel ? (panel.textContent || "").includes("Validation passed") : false;
        },
        { timeout: 60000 }
      );
      check("server validation passes", (await validationPanel.innerText()).includes("Validation passed"), (await validationPanel.innerText()).slice(0, 120));

      await savedRow.getByRole("button", { name: "Publish", exact: true }).click();
      await page.getByText("Product published. It is now publicly visible.").waitFor();
      await page.waitForFunction(
        (name) => {
          const rows = Array.from(document.querySelectorAll("tbody tr"));
          const target = rows.find((entry) => (entry.textContent || "").includes(name));
          return target ? (target.textContent || "").includes("ACTIVE") : false;
        },
        adminName,
        { timeout: 60000 }
      );
      check("admin publishes the fixture", true, "");

      const catalogue = await api(context, "GET", "/api/admin/catalogue");
      const listed = (catalogue.body?.products || []).find((entry) => entry.id === fixture.adminProductId);
      check("catalogue API returns stored gallery order and alt", listed && listed.images.length === 3 && listed.images[0].url === IMAGE_A.url && listed.images[1].alt === IMAGE_B.alt, JSON.stringify(listed?.images?.map((image) => ({ url: image.url, alt: image.alt, sortOrder: image.sortOrder }))));
      check("catalogue API reports category attributes", listed && listed.attributes?.material === "Stainless steel" && listed.attributes?.piece_count === 2, JSON.stringify(listed?.attributes));
      check("simple admin fixture has no variants", listed && Array.isArray(listed.variants) && listed.variants.length === 0, `variants=${listed?.variants?.length}`);

      const publicPage = await context.newPage();
      const published = await publicPage.goto(`${BASE}/product/${adminSlug}`, { waitUntil: "networkidle", timeout: 90000 });
      await publicPage.locator('[data-testid="product-title"]').waitFor();
      check("published fixture renders publicly", published && published.status() === 200 && (await publicPage.locator('[data-testid="product-title"]').innerText()).includes("PDG Admin catalogue probe"), `status=${published && published.status()}`);
      check("public price reflects the edit", /149\.5/.test(await publicPage.locator('[data-testid="product-price"]').innerText()), await publicPage.locator('[data-testid="product-price"]').innerText());
      const publicThumbs = await publicPage.locator('[data-testid="product-thumbnail"] img').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src")));
      check("public gallery preserves image order", JSON.stringify(publicThumbs) === JSON.stringify([IMAGE_A.url, IMAGE_B.url, IMAGE_C.url]), JSON.stringify(publicThumbs));
      check("public gallery preserves alt text", (await publicPage.locator('[data-testid="product-main-image"]').getAttribute("alt")) === IMAGE_A.alt, "");
      const attributesText = await publicPage.locator('[data-testid="product-attributes"]').innerText();
      check("public page renders category attributes", attributesText.includes("Material") && attributesText.includes("Stainless steel") && attributesText.includes("Number of pieces"), attributesText.replace(/\n/g, " | "));
      check("public page uses seller-location wording", (await publicPage.content()).includes("Seller location:") && !(await publicPage.content()).includes("Dispatches from"), "");
      await shot(publicPage, "published-public-desktop", { fullPage: true });
      await publicPage.setViewportSize({ width: 390, height: 844 });
      await publicPage.waitForTimeout(250);
      await shot(publicPage, "published-public-mobile");
      await publicPage.close();

      /* Authorization and scope on the same fixture. */
      const customerContext = await browser.newContext();
      const customerPage = await customerContext.newPage();
      await signIn(customerPage, customer[0], customer[1]);
      const customerList = await api(customerContext, "GET", "/api/admin/catalogue");
      check("customer cannot read the admin catalogue", customerList.status === 403, `status=${customerList.status}`);
      const customerEdit = await api(customerContext, "PATCH", "/api/admin/catalogue/products", { id: fixture.adminProductId, priceKobo: 1 });
      check("customer cannot edit a product", customerEdit.status === 403, `status=${customerEdit.status} code=${customerEdit.body?.code}`);
      await customerContext.close();

      const ghContext = await browser.newContext();
      const ghPage = await ghContext.newPage();
      await signIn(ghPage, ghAdmin[0], ghAdmin[1]);
      const ghEdit = await api(ghContext, "PATCH", "/api/admin/catalogue/products", { id: fixture.adminProductId, priceKobo: 1 });
      check("out-of-country admin cannot edit an NG product", ghEdit.status === 403, `status=${ghEdit.status} code=${ghEdit.body?.code}`);
      const ghList = await api(ghContext, "GET", "/api/admin/catalogue");
      const ghNames = (ghList.body?.products || []).map((entry) => entry.name);
      check("out-of-country admin list excludes the NG fixture", !ghNames.includes(adminName), `products=${ghNames.length}`);
      await ghContext.close();

      /* Unpublish and archive via the authorized controls. */
      await page.goto(`${BASE}/admin/catalogue`, { waitUntil: "networkidle", timeout: 90000 });
      const activeRow = page.locator("tbody tr", { hasText: adminName }).first();
      await activeRow.getByRole("button", { name: "Unpublish", exact: true }).click();
      await page.getByText("Product unpublished. It has been removed from public access.").waitFor();
      const unpublished = await context.request.get(`${BASE}/product/${adminSlug}`);
      check("unpublished product returns 404", unpublished.status() === 404, `status=${unpublished.status()}`);
      const archived = await api(context, "PATCH", "/api/admin/catalogue/products", { id: fixture.adminProductId, action: "archive" });
      check("draft can be archived", archived.status === 200 && archived.body?.status === "ARCHIVED", `status=${archived.status}`);
      const archivedPublic = await context.request.get(`${BASE}/product/${adminSlug}`);
      check("archived product returns 404", archivedPublic.status() === 404, `status=${archivedPublic.status()}`);
      await context.close();
    } catch (error) {
      check("admin publication section completed", false, error.message);
    }

    /* ------------------------------------------------------------------ */
    /* G. Seller create/edit → admin publish → public                      */
    /* ------------------------------------------------------------------ */
    const sellerName = `PDG Seller parity probe ${runId}`;
    try {
      const sellerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const sellerPage = await sellerContext.newPage();
      sellerPage.setDefaultTimeout(90000);
      await signIn(sellerPage, seller[0], seller[1]);
      check("seller sign-in", !sellerPage.url().includes("/login"), sellerPage.url());

      const create = await api(sellerContext, "POST", "/api/seller/products", {
        name: sellerName,
        description: "Run-owned seller parity fixture for publication and gallery acceptance.",
        categoryId: category.id,
        priceKobo: 250000,
        quantity: 4,
        lowStockLevel: 2,
        attributes: { material: "Stainless steel", piece_count: 4 },
        images: [
          { url: IMAGE_A.url, alt: `${IMAGE_A.alt} seller one` },
          { url: IMAGE_B.url, alt: `${IMAGE_B.alt} seller two` },
          { url: IMAGE_C.url, alt: `${IMAGE_C.alt} seller three` }
        ]
      });
      fixture.sellerProductId = create.body?.id ?? null;
      fixture.sellerProductSlug = create.body?.slug ?? null;
      check("seller creates a draft", create.status === 201 && create.body?.status === "DRAFT", `status=${create.status} code=${create.body?.code ?? ""}`);
      check("simple seller fixture has no variants", (create.body?.variants?.length ?? 0) === 0, `variants=${create.body?.variants?.length ?? "absent"}`);

      const sellerEdit = await api(sellerContext, "PATCH", `/api/seller/products/${fixture.sellerProductId}`, {
        priceKobo: 275000,
        quantity: 6,
        attributes: { material: "Aluminium", piece_count: 6 },
        images: [
          { url: IMAGE_B.url, alt: `${IMAGE_B.alt} seller primary now` },
          { url: IMAGE_A.url, alt: `${IMAGE_A.alt} seller secondary now` },
          { url: IMAGE_C.url, alt: `${IMAGE_C.alt} seller third now` }
        ]
      });
      check("seller edit→save succeeds", sellerEdit.status === 200, `status=${sellerEdit.status} code=${sellerEdit.body?.code}`);
      const overview = await api(sellerContext, "GET", "/api/seller/overview");
      const sellerProduct = (overview.body?.products || []).find((entry) => entry.id === fixture.sellerProductId);
      check("seller overview stores edited gallery order", sellerProduct && sellerProduct.images[0]?.url === IMAGE_B.url && sellerProduct.images[0]?.alt === `${IMAGE_B.alt} seller primary now`, JSON.stringify(sellerProduct?.images?.map((image) => ({ url: image.url, alt: image.alt, sortOrder: image.sortOrder }))));
      check("seller overview stores edited attributes", sellerProduct?.attributes?.material === "Aluminium" && sellerProduct?.attributes?.piece_count === 6, JSON.stringify(sellerProduct?.attributes));
      check("simple seller fixture still has no variants", Array.isArray(sellerProduct?.variants) && sellerProduct.variants.length === 0, `variants=${sellerProduct?.variants?.length}`);

      const sellerPublish = await api(sellerContext, "PATCH", `/api/seller/products/${fixture.sellerProductId}`, { status: "ACTIVE" });
      check("seller cannot publish without the Control Center", sellerPublish.status === 403 && sellerPublish.body?.code === "admin_publication_required", `status=${sellerPublish.status} code=${sellerPublish.body?.code}`);
      await sellerContext.close();

      const adminContext = await browser.newContext();
      const adminPage = await adminContext.newPage();
      await signIn(adminPage, admin[0], admin[1]);
      const adminCatalogue = await api(adminContext, "GET", "/api/admin/catalogue");
      const sellerInAdmin = (adminCatalogue.body?.products || []).find((entry) => entry.id === fixture.sellerProductId);
      check("admin sees the seller draft with its edited state", sellerInAdmin?.images?.[0]?.url === IMAGE_B.url && sellerInAdmin?.attributes?.material === "Aluminium", JSON.stringify(sellerInAdmin?.images?.[0] ?? {}));
      const publish = await api(adminContext, "PATCH", "/api/admin/catalogue/products", { id: fixture.sellerProductId, action: "publish" });
      check("admin publishes the seller draft", publish.status === 200 && publish.body?.status === "ACTIVE", `status=${publish.status} code=${publish.body?.code}`);

      const publicPage = await adminContext.newPage();
      const publicResponse = await publicPage.goto(`${BASE}/product/${fixture.sellerProductSlug}`, { waitUntil: "networkidle", timeout: 90000 });
      await publicPage.locator('[data-testid="product-title"]').waitFor();
      check("seller fixture renders publicly after admin publish", publicResponse && publicResponse.status() === 200, `status=${publicResponse && publicResponse.status()}`);
      check("public seller gallery starts with the edited primary image", (await publicPage.locator('[data-testid="product-main-image"]').getAttribute("alt")) === `${IMAGE_B.alt} seller primary now`, "");
      check("public seller attributes reflect the edit", (await publicPage.locator('[data-testid="product-attributes"]').innerText()).includes("Aluminium"), "");
      await shot(publicPage, "seller-product-public");

      const unpublish = await api(adminContext, "PATCH", "/api/admin/catalogue/products", { id: fixture.sellerProductId, action: "unpublish" });
      check("admin unpublishes the seller fixture", unpublish.status === 200, `status=${unpublish.status}`);
      const gone = await adminContext.request.get(`${BASE}/product/${fixture.sellerProductSlug}`);
      check("seller fixture returns 404 after unpublish", gone.status() === 404, `status=${gone.status()}`);
      await adminContext.close();
    } catch (error) {
      check("seller parity section completed", false, error.message);
    }

    cleanup = await cleanupFixtures();
    const preserved = await verifyPreserved(baseline);
    check("accepted catalogue rows are unchanged", preserved.changedAcceptedRows.length === 0, JSON.stringify(preserved.changedAcceptedRows).slice(0, 400));
    check("no run-owned product fixtures remain", preserved.leftoverFixtures === 0, `leftover=${preserved.leftoverFixtures}`);
    check("baseline counts restored", JSON.stringify(preserved.counts) === JSON.stringify(preserved.baselineCounts), `${JSON.stringify(preserved.baselineCounts)} -> ${JSON.stringify(preserved.counts)}`);

    const beforeCarts = new Set(baselineCart.map((row) => row.cartId));
    const unexpectedCarts = await prisma.cartItem.count({ where: { cartId: { in: [...beforeCarts] }, productId: { in: [variantProduct.id, galleryProduct.id] } } });
    check("run-owned cart items removed", unexpectedCarts === 0, `count=${unexpectedCarts}`);

    const failed = results.filter((entry) => !entry.ok);
    const evidence = {
      base: BASE,
      database: guardInfo.database,
      classification: guardInfo.classification,
      runId,
      fixtureIds: {
        variantProduct: variantProduct.id,
        galleryProduct: galleryProduct.id,
        adminProduct: fixture.adminProductId,
        sellerProduct: fixture.sellerProductId,
        reviewer: fixture.reviewerId
      },
      baselineCounts: baseline.counts,
      preserved,
      cleanup,
      screenshots,
      passed: results.length - failed.length,
      total: results.length,
      failed: failed.map((entry) => ({ name: entry.name, detail: entry.detail })),
      results
    };
    fs.mkdirSync(path.dirname(EVIDENCE_FILE), { recursive: true });
    fs.writeFileSync(EVIDENCE_FILE, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({
      base: BASE,
      database: guardInfo.database,
      passed: evidence.passed,
      total: evidence.total,
      failed: evidence.failed,
      cleanup,
      leftoverFixtures: preserved.leftoverFixtures,
      baselineRestored: JSON.stringify(preserved.counts) === JSON.stringify(preserved.baselineCounts),
      evidence: EVIDENCE_FILE,
      screenshots
    }, null, 2));
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    await browser.close().catch(() => undefined);
    if (!cleanup) {
      const late = await cleanupFixtures().catch((error) => ({ error: error.message }));
      console.error("LATE CLEANUP", JSON.stringify(late));
    }
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("PRODUCT DETAIL GAP TEST ERROR", error instanceof Error ? error.message : error);
  try {
    const cleanup = await cleanupFixtures();
    console.error("CLEANUP AFTER ERROR", JSON.stringify(cleanup));
  } catch (cleanupError) {
    console.error("CLEANUP FAILED", cleanupError instanceof Error ? cleanupError.message : cleanupError);
  }
  await prisma.$disconnect().catch(() => undefined);
  process.exit(2);
});
