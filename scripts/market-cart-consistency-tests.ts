#!/usr/bin/env node
/**
 * REVIEW market/cart consistency acceptance.
 *
 * Proves that one market decision governs discovery, product detail, the
 * related rail, new cart additions and new checkout:
 *   - `queryCatalogProducts` returns only the selected market's eligible
 *     listings and excludes another market plus restricted/regulated nodes;
 *   - search follows the same market;
 *   - `getPublicProductDetail` is a hard market boundary and regulated nodes
 *     fail closed in both countries;
 *   - `listRelatedProducts` receives and forwards country/city and never shows
 *     another market or a restricted subtree;
 *   - `addCartItem` accepts an eligible home-market listing and rejects a
 *     cross-market or regulated listing with 409 `product_market_unavailable`
 *     before creating a cart row;
 *   - `checkout` rejects a cart line that is not eligible for the delivery
 *     market with 409 `item_market_unavailable` (or the pre-existing
 *     `item_market_mismatch` for another country) before any order or stock
 *     reservation exists.
 *
 * Usage:
 *   REVIEW_DATABASE_URL=postgresql://... \
 *     npx tsx scripts/market-cart-consistency-tests.ts \
 *       --expect-db=naijadeals_review \
 *       [--base-url=http://localhost:3047]
 *
 * `DATABASE_URL` is never used as a fallback. The optional `--base-url` adds
 * real HTTP cart checks; without it those checks are reported as SKIPPED.
 * Run-owned users, vendors, categories, products, stock, rules, carts, cart
 * items and sessions are removed in `finally`. Audit/SystemEvent rows are the
 * only evidence that may remain (this run creates none by design).
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

type Json = Record<string, unknown>;

const RUN_PREFIX = "mktcart";
let passes = 0;
let failures = 0;

function sanitize(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://[redacted]")
    .replace(/\b(password|passwd|pwd)\s*=\s*[^;\s"'`]+/gi, "$1=[redacted]")
    .slice(0, 900);
}

function fail(message: string): never {
  console.error(`FAIL: ${sanitize(message)}`);
  process.exit(2);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

function parseExpectedDatabase(argv: string[]): string {
  const arg = argv.find((value) => value.startsWith("--expect-db="));
  const expected = arg?.slice("--expect-db=".length).trim();
  if (!expected) fail("--expect-db=naijadeals_review is required so the target cannot be guessed");
  if (expected !== "naijadeals_review") {
    fail(`this acceptance only runs against naijadeals_review, not ${expected}`);
  }
  return expected;
}

function parseBaseUrl(argv: string[]): string | null {
  const arg = argv.find((value) => value.startsWith("--base-url="));
  if (!arg) return null;
  const value = arg.slice("--base-url=".length).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) fail("--base-url must be an http(s) URL");
  return value;
}

function resolveReviewUrl(expectedDb: string): string {
  const url = process.env.REVIEW_DATABASE_URL?.trim();
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

function asRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function expectStatus(result: { status: number; body: unknown }, expected: number, label: string) {
  assert(
    result.status === expected,
    `${label}: expected HTTP ${expected}, got ${result.status} ${JSON.stringify(result.body).slice(0, 300)}`
  );
}

class Http {
  constructor(private readonly base: string) {}

  async request(
    pathName: string,
    options: { method?: "GET" | "POST"; cookie?: string; body?: unknown } = {}
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = { Origin: this.base };
    if (options.cookie) headers.Cookie = options.cookie;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${this.base}${pathName}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store"
    });
    const text = await response.text();
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text.slice(0, 300) };
    }
    return { status: response.status, body };
  }

  get(pathName: string, cookie?: string) {
    return this.request(pathName, { cookie });
  }

  post(pathName: string, body: unknown, cookie?: string) {
    return this.request(pathName, { method: "POST", body, cookie });
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readSource(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

async function expectApiError(
  fn: () => Promise<unknown>,
  expectedStatus: number,
  expectedCode: string,
  messageIncludes?: string
) {
  try {
    await fn();
  } catch (error) {
    const known = error as { status?: number; code?: string; message?: string };
    assert(
      known.status === expectedStatus && known.code === expectedCode,
      `expected ${expectedStatus} ${expectedCode}, got ${known.status} ${known.code}: ${known.message ?? ""}`
    );
    if (messageIncludes) {
      assert(
        String(known.message ?? "").includes(messageIncludes),
        `error message did not name ${messageIncludes}: ${known.message ?? ""}`
      );
    }
    return known;
  }
  throw new Error(`expected ${expectedStatus} ${expectedCode}, but the call succeeded`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const expectedDb = parseExpectedDatabase(argv);
  const baseUrl = parseBaseUrl(argv);
  const reviewUrl = resolveReviewUrl(expectedDb);

  // Guard the REVIEW database with a direct connection before any service is
  // imported: Prisma reads DATABASE_URL at construction time.
  const guard = new Client({
    connectionString: reviewUrl,
    connectionTimeoutMillis: 8000,
    application_name: "naijadeals-market-cart-tests-guard"
  });
  try {
    await guard.connect();
    const identity = await guard.query<{ database: string }>("select current_database() as database");
    const actual = identity.rows[0]?.database ?? "";
    if (actual !== expectedDb) fail(`connected to ${actual || "(unknown)"} instead of ${expectedDb}`);
    const classification = await guard.query<{ classification: string }>(
      'select classification from "DatabaseClassification"'
    );
    if (!classification.rows.some((row) => row.classification === "REVIEW")) {
      fail(`${actual} is not classified REVIEW`);
    }
    const column = await guard.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_name = 'Category' and column_name = 'isRegulated'`
    );
    if (column.rows.length === 0) fail("Category.isRegulated is not migrated in REVIEW");
  } finally {
    await guard.end().catch(() => undefined);
  }

  process.env.DATABASE_URL = reviewUrl;
  const { prisma } = await import("../lib/prisma");
  const catalog = await import("../lib/services/core/catalog.service");
  const cartService = await import("../lib/services/core/cart.service");
  const checkoutService = await import("../lib/services/core/checkout.service");
  const activation = await import("../lib/services/core/vertical-activation.service");
  const countries = await import("../lib/services/core/country.service");
  const commerce = await import("../lib/config/commerce");

  const runId = `${RUN_PREFIX.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${randomBytes(2)
    .toString("hex")
    .toUpperCase()}`;
  const runSlug = runId.toLowerCase();
  const userIds: string[] = [];
  const vendorIds: string[] = [];
  const categoryIds: string[] = [];
  const productIds: string[] = [];
  const sessionIds: string[] = [];
  const cartIds: string[] = [];
  const fixtureCounts = { users: 0, vendors: 0, categories: 0, products: 0, sessions: 0, carts: 0 };
  let leftoverSummary = "not run";
  let browserSummary = "not requested";

  try {
    // ---- activation preflight -------------------------------------------
    for (const [country, city] of [
      ["NG", "Lagos"],
      ["GH", "Accra"]
    ] as const) {
      const access = await activation.verticalAccess("shop", { countryCode: country, cityCode: city });
      assert(
        access.effective.status === "LIVE",
        `REVIEW Shop activation for ${country}/${city} is ${access.effective.status}; public market acceptance requires LIVE`
      );
    }
    const ngConfig = commerce.getCountry("NG");
    const ngOverride = await countries.activationFor("NG");
    const checkoutEnabled = ngOverride?.enabled ?? ngConfig.enabled;
    const deliveryEnabled = ngOverride?.deliveryEnabled ?? ngConfig.deliveryEnabled;
    assert(
      checkoutEnabled && deliveryEnabled,
      `REVIEW checkout for NG is enabled=${checkoutEnabled} delivery=${deliveryEnabled}; checkout refusal checks require an open market`
    );

    // ---- run-owned fixtures ---------------------------------------------
    const ngOwner = await prisma.user.create({
      data: {
        email: `${runSlug}-ng-owner@review.invalid`,
        name: `MktCart NG owner ${runId}`,
        actorType: "VENDOR",
        countryCode: "NG"
      }
    });
    userIds.push(ngOwner.id);
    const ghOwner = await prisma.user.create({
      data: {
        email: `${runSlug}-gh-owner@review.invalid`,
        name: `MktCart GH owner ${runId}`,
        actorType: "VENDOR",
        countryCode: "GH"
      }
    });
    userIds.push(ghOwner.id);
    const ngCustomer = await prisma.user.create({
      data: {
        email: `${runSlug}-ng-buyer@review.invalid`,
        name: `MktCart NG buyer ${runId}`,
        actorType: "CUSTOMER",
        countryCode: "NG"
      }
    });
    userIds.push(ngCustomer.id);
    const ghCustomer = await prisma.user.create({
      data: {
        email: `${runSlug}-gh-buyer@review.invalid`,
        name: `MktCart GH buyer ${runId}`,
        actorType: "CUSTOMER",
        countryCode: "GH"
      }
    });
    userIds.push(ghCustomer.id);
    const regulatedBuyer = await prisma.user.create({
      data: {
        email: `${runSlug}-regulated-buyer@review.invalid`,
        name: `MktCart regulated buyer ${runId}`,
        actorType: "CUSTOMER",
        countryCode: "NG"
      }
    });
    userIds.push(regulatedBuyer.id);
    const crossBuyer = await prisma.user.create({
      data: {
        email: `${runSlug}-cross-buyer@review.invalid`,
        name: `MktCart cross-market buyer ${runId}`,
        actorType: "CUSTOMER",
        countryCode: "NG"
      }
    });
    userIds.push(crossBuyer.id);
    fixtureCounts.users = userIds.length;

    const ngVendor = await prisma.vendor.create({
      data: {
        ownerId: ngOwner.id,
        name: `MktCart NG vendor ${runId}`,
        slug: `${runSlug}-ng-vendor`,
        market: "Lagos",
        pickupAddress: "Run-owned pickup address, Lagos",
        pickupPhone: "+2348000000000",
        countryCode: "NG",
        status: "VERIFIED"
      }
    });
    vendorIds.push(ngVendor.id);
    const ghVendor = await prisma.vendor.create({
      data: {
        ownerId: ghOwner.id,
        name: `MktCart GH vendor ${runId}`,
        slug: `${runSlug}-gh-vendor`,
        market: "Accra",
        pickupAddress: "Run-owned pickup address, Accra",
        pickupPhone: "+233200000000",
        countryCode: "GH",
        status: "VERIFIED"
      }
    });
    vendorIds.push(ghVendor.id);
    fixtureCounts.vendors = vendorIds.length;

    const eligibleCategory = await prisma.category.create({
      data: {
        name: `MktCart eligible category ${runId}`,
        slug: `${runSlug}-eligible`,
        level: 0,
        isActive: true,
        isSelectable: true,
        isRegulated: false,
        sortOrder: 990_001
      }
    });
    categoryIds.push(eligibleCategory.id);
    const regulatedCategory = await prisma.category.create({
      data: {
        name: `MktCart regulated category ${runId}`,
        slug: `${runSlug}-regulated`,
        parentId: eligibleCategory.id,
        level: 1,
        isActive: true,
        isSelectable: true,
        isRegulated: true,
        sortOrder: 990_002
      }
    });
    categoryIds.push(regulatedCategory.id);
    fixtureCounts.categories = categoryIds.length;
    await prisma.categoryCountryRule.create({
      data: {
        categoryId: regulatedCategory.id,
        countryCode: "NG",
        canPublish: false,
        note: `Run-owned NG deny for ${runId}.`
      }
    });

    const ngProduct = await prisma.product.create({
      data: {
        vendorId: ngVendor.id,
        categoryId: eligibleCategory.id,
        name: `MktCart NG eligible ${runId}`,
        slug: `${runSlug}-ng-eligible`,
        description: "Run-owned NG product proving market-scoped discovery and cart acceptance.",
        priceKobo: BigInt(250_000),
        countryCode: "NG",
        status: "ACTIVE",
        isSample: false,
        saleMode: "escrow",
        stock: { create: { quantity: 5, reserved: 0 } }
      }
    });
    productIds.push(ngProduct.id);
    const ghProduct = await prisma.product.create({
      data: {
        vendorId: ghVendor.id,
        categoryId: eligibleCategory.id,
        name: `MktCart GH eligible ${runId}`,
        slug: `${runSlug}-gh-eligible`,
        description: "Run-owned GH product proving the selected market is a hard boundary.",
        priceKobo: BigInt(310_000),
        countryCode: "GH",
        status: "ACTIVE",
        isSample: false,
        saleMode: "escrow",
        stock: { create: { quantity: 5, reserved: 0 } }
      }
    });
    productIds.push(ghProduct.id);
    const regulatedProduct = await prisma.product.create({
      data: {
        vendorId: ngVendor.id,
        categoryId: regulatedCategory.id,
        name: `MktCart NG regulated ${runId}`,
        slug: `${runSlug}-ng-regulated`,
        description: "Run-owned NG product in a regulated node denied for NG.",
        priceKobo: BigInt(420_000),
        countryCode: "NG",
        status: "ACTIVE",
        isSample: false,
        saleMode: "escrow",
        stock: { create: { quantity: 5, reserved: 0 } }
      }
    });
    productIds.push(regulatedProduct.id);
    fixtureCounts.products = productIds.length;

    const sessions = new Map<string, { id: string; token: string }>();
    for (const [label, userId] of [
      ["ng", ngCustomer.id],
      ["gh", ghCustomer.id]
    ] as const) {
      const token = randomBytes(32).toString("base64url");
      const session = await prisma.session.create({
        data: {
          userId,
          tokenHash: tokenHash(token),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });
      sessions.set(label, { id: session.id, token });
      sessionIds.push(session.id);
    }
    fixtureCounts.sessions = sessionIds.length;

    const baseQuery = (country: string, q: string | null = null) => ({
      q,
      category: null,
      market: null,
      country,
      vendor: null,
      price: null,
      maxPriceKobo: null,
      sort: "name" as const,
      page: 1,
      pageSize: null
    });
    const idsOf = (items: Array<{ id: string }>) => new Set(items.map((item) => item.id));

    // ---- catalogue and search -------------------------------------------
    await step("catalogue: NG returns its eligible listing and excludes GH/regulated", async () => {
      const page = await catalog.queryCatalogProducts(baseQuery("NG"), { cityCode: "Lagos" });
      const ids = idsOf(page.items);
      assert(ids.has(ngProduct.id), "NG catalogue omitted the run-owned NG eligible listing");
      assert(!ids.has(ghProduct.id), "NG catalogue leaked the run-owned GH listing");
      assert(!ids.has(regulatedProduct.id), "NG catalogue leaked a regulated listing with an NG deny rule");
    });

    await step("catalogue: GH returns its eligible listing and excludes NG/regulated", async () => {
      const page = await catalog.queryCatalogProducts(baseQuery("GH"), { cityCode: "Accra" });
      const ids = idsOf(page.items);
      assert(ids.has(ghProduct.id), "GH catalogue omitted the run-owned GH eligible listing");
      assert(!ids.has(ngProduct.id), "GH catalogue leaked the run-owned NG listing");
      assert(
        !ids.has(regulatedProduct.id),
        "GH catalogue leaked a regulated listing whose GH eligibility is unresolved"
      );
    });

    await step("search: q follows the same selected market", async () => {
      const ng = await catalog.queryCatalogProducts(baseQuery("NG", runId), { cityCode: "Lagos" });
      const ngIds = idsOf(ng.items);
      assert(ngIds.has(ngProduct.id), "NG search omitted the run-owned NG listing");
      assert(ngIds.size === 1 && !ngIds.has(ghProduct.id) && !ngIds.has(regulatedProduct.id), "NG search was not market-scoped");

      const gh = await catalog.queryCatalogProducts(baseQuery("GH", runId), { cityCode: "Accra" });
      const ghIds = idsOf(gh.items);
      assert(ghIds.has(ghProduct.id), "GH search omitted the run-owned GH listing");
      assert(ghIds.size === 1 && !ghIds.has(ngProduct.id) && !ghIds.has(regulatedProduct.id), "GH search was not market-scoped");
    });

    // ---- public detail ---------------------------------------------------
    await step("detail: market boundary and regulated nodes fail closed", async () => {
      const ngOwn = await catalog.getPublicProductDetail(ngProduct.id, { countryCode: "NG", cityCode: "Lagos" });
      assert(ngOwn?.id === ngProduct.id, "NG eligible detail did not resolve in NG");

      const ghOwn = await catalog.getPublicProductDetail(ghProduct.id, { countryCode: "GH", cityCode: "Accra" });
      assert(ghOwn?.id === ghProduct.id, "GH eligible detail did not resolve in GH");

      const ghInNg = await catalog.getPublicProductDetail(ghProduct.id, { countryCode: "NG", cityCode: "Lagos" });
      assert(ghInNg === null, "GH listing resolved for an NG visitor");

      const regulatedInNg = await catalog.getPublicProductDetail(regulatedProduct.id, {
        countryCode: "NG",
        cityCode: "Lagos"
      });
      assert(regulatedInNg === null, "regulated listing with an NG deny rule resolved in NG");

      const regulatedInGh = await catalog.getPublicProductDetail(regulatedProduct.id, {
        countryCode: "GH",
        cityCode: "Accra"
      });
      assert(regulatedInGh === null, "regulated listing resolved in GH without an explicit rule");
    });

    // ---- related rail ----------------------------------------------------
    await step("related: selected market and restricted subtree are excluded", async () => {
      const ngRelated = await catalog.listRelatedProducts(eligibleCategory.slug, ngProduct.id, 50, {
        countryCode: "NG",
        cityCode: "Lagos"
      });
      const ngIds = idsOf(ngRelated);
      assert(!ngIds.has(ngProduct.id), "related rail included the current product");
      assert(!ngIds.has(ghProduct.id), "NG related rail leaked the GH listing");

      const ngWithoutExclude = await catalog.listRelatedProducts(eligibleCategory.slug, "not-a-product", 50, {
        countryCode: "NG",
        cityCode: "Lagos"
      });
      const ngAllIds = idsOf(ngWithoutExclude);
      assert(ngAllIds.has(ngProduct.id), "NG related rail omitted the eligible same-market listing");
      assert(!ngAllIds.has(regulatedProduct.id), "NG related rail leaked the restricted child category");
      assert(!ngAllIds.has(ghProduct.id), "NG related rail leaked the GH listing");

      const ghRelated = await catalog.listRelatedProducts(eligibleCategory.slug, "not-a-product", 50, {
        countryCode: "GH",
        cityCode: "Accra"
      });
      const ghIds = idsOf(ghRelated);
      assert(ghIds.has(ghProduct.id), "GH related rail omitted the eligible same-market listing");
      assert(!ghIds.has(ngProduct.id), "GH related rail leaked the NG listing");
      assert(!ghIds.has(regulatedProduct.id), "GH related rail leaked an unresolved regulated listing");

      // City is accepted and forwarded; this REVIEW has no city-scoped Shop
      // rule, so the observable set is intentionally identical. The source
      // assertion below proves the parameter is not dropped.
      const ngNoCity = await catalog.listRelatedProducts(eligibleCategory.slug, "not-a-product", 50, {
        countryCode: "NG"
      });
      assert(
        [...idsOf(ngNoCity)].sort().join(",") === [...ngAllIds].sort().join(","),
        "related rail changed when only the (rule-free) city was supplied"
      );
    });

    await step("source: market context is forwarded through every reviewed path", async () => {
      const catalogSource = readSource("lib/services/core/catalog.service.ts");
      assert(
        /listRelatedProducts[\s\S]*?cityCode: access\.cityCode/.test(catalogSource),
        "listRelatedProducts does not forward cityCode"
      );
      const pageSource = readSource("app/product/[id]/page.tsx");
      assert(pageSource.includes("readLocale()"), "product page does not use readLocale()");
      assert(!pageSource.includes('store.get("nd_country")'), "product page still parses the country cookie directly");
      assert(pageSource.includes("cityCode: market.cityCode"), "product page does not pass cityCode to related products");
      const apiSource = readSource("app/api/products/[id]/route.ts");
      assert(apiSource.includes("readLocale()"), "product detail API does not use readLocale()");
      assert(!apiSource.includes('request.cookies.get("nd_country")'), "product detail API still parses cookies directly");
      const clientSource = readSource("components/functional/product-detail-client.tsx");
      assert(clientSource.includes("useLocale()"), "product detail client does not read the locale");
      assert(clientSource.includes("country: market.country"), "related retry omits country");
      assert(clientSource.includes("...(market.city ? { city: market.city } : {})"), "related retry omits city");
      const cartRouteSource = readSource("app/api/cart/items/route.ts");
      assert(cartRouteSource.includes("readLocale()"), "cart route does not use readLocale()");
      assert(!cartRouteSource.includes('cookieStore.get("nd_country")'), "cart route still parses cookies directly");
      assert(
        cartRouteSource.includes("market: { countryCode: visitorCountry, cityCode: visitorCity }"),
        "cart route does not pass the validated market to addCartItem"
      );
      const checkoutSource = readSource("lib/services/core/checkout.service.ts");
      const guardIndex = checkoutSource.indexOf('"item_market_unavailable"');
      const orderIndex = checkoutSource.indexOf("tx.order.create");
      assert(guardIndex > 0, "checkout has no item_market_unavailable guard");
      assert(orderIndex > guardIndex, "checkout eligibility guard is not before order creation");
    });

    // ---- cart service ----------------------------------------------------
    await step("cart service: GH visitor accepts an eligible GH listing", async () => {
      const cart = await cartService.addCartItem({
        userId: ghCustomer.id,
        productId: ghProduct.id,
        quantity: 1,
        market: { countryCode: "GH", cityCode: "Accra" }
      });
      cartIds.push(cart.id);
      assert(
        cart.items.some((item) => item.productId === ghProduct.id),
        "accepted GH cart does not contain the run-owned GH listing"
      );
    });

    await step("cart service: NG visitor accepts an eligible NG listing", async () => {
      const cart = await cartService.addCartItem({
        userId: ngCustomer.id,
        productId: ngProduct.id,
        quantity: 1,
        market: { countryCode: "NG", cityCode: "Lagos" }
      });
      cartIds.push(cart.id);
      assert(
        cart.items.some((item) => item.productId === ngProduct.id),
        "accepted NG cart does not contain the run-owned NG listing"
      );
    });

    await step("cart service: NG visitor rejects a GH listing without writing a cart row", async () => {
      const before = await prisma.cartItem.count({ where: { cart: { userId: ngCustomer.id } } });
      await expectApiError(
        () =>
          cartService.addCartItem({
            userId: ngCustomer.id,
            productId: ghProduct.id,
            quantity: 1,
            market: { countryCode: "NG", cityCode: "Lagos" }
          }),
        409,
        "product_market_unavailable"
      );
      const after = await prisma.cartItem.count({ where: { cart: { userId: ngCustomer.id } } });
      assert(after === before, `cross-market cart rejection wrote a row (${before} -> ${after})`);
    });

    await step("cart service: NG visitor rejects a regulated NG listing without writing a cart row", async () => {
      const before = await prisma.cartItem.count({ where: { cart: { userId: ngCustomer.id } } });
      const error = await expectApiError(
        () =>
          cartService.addCartItem({
            userId: ngCustomer.id,
            productId: regulatedProduct.id,
            quantity: 1,
            market: { countryCode: "NG", cityCode: "Lagos" }
          }),
        409,
        "product_market_unavailable"
      );
      assert(
        !/not sold in your selected market/.test(String(error.message)),
        "regulated rejection reused the country-mismatch message instead of the eligibility message"
      );
      const after = await prisma.cartItem.count({ where: { cart: { userId: ngCustomer.id } } });
      assert(after === before, `regulated cart rejection wrote a row (${before} -> ${after})`);
    });

    await step("cart service: existing cart remains readable", async () => {
      const cart = await cartService.getOrCreateActiveCart(ghCustomer.id);
      cartIds.push(cart.id);
      assert(
        cart.items.some((item) => item.productId === ghProduct.id),
        "existing GH cart no longer contains the accepted listing"
      );
    });

    // ---- checkout refusals ----------------------------------------------
    const ngAddress = {
      contactName: "Run-owned market buyer",
      contactPhone: "+2348000000000",
      countryCode: "NG",
      state: "Lagos",
      city: "Lagos",
      line1: "1 Run-owned Market Way"
    };

    const regulatedCart = await prisma.cart.create({
      data: {
        userId: regulatedBuyer.id,
        status: "ACTIVE",
        items: { create: { productId: regulatedProduct.id, quantity: 1 } }
      }
    });
    cartIds.push(regulatedCart.id);
    const crossCart = await prisma.cart.create({
      data: {
        userId: crossBuyer.id,
        status: "ACTIVE",
        items: { create: { productId: ghProduct.id, quantity: 1 } }
      }
    });
    cartIds.push(crossCart.id);

    await step("checkout: regulated NG line is refused before any order or reservation", async () => {
      const stockBefore = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: regulatedProduct.id } });
      const error = await expectApiError(
        () => checkoutService.checkout({ userId: regulatedBuyer.id, address: ngAddress }),
        409,
        "item_market_unavailable",
        regulatedProduct.name
      );
      assert(Boolean(error.message), "item_market_unavailable did not carry a message");
      const orders = await prisma.order.count({ where: { customerId: regulatedBuyer.id } });
      const stockAfter = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: regulatedProduct.id } });
      const cart = await prisma.cart.findUniqueOrThrow({ where: { id: regulatedCart.id } });
      assert(orders === 0, `refused regulated checkout created ${orders} order(s)`);
      assert(stockAfter.reserved === stockBefore.reserved, "refused regulated checkout reserved stock");
      assert(cart.status === "ACTIVE", `refused regulated checkout left the cart in ${cart.status}`);
    });

    await step("checkout: cross-market line keeps item_market_mismatch and creates no order", async () => {
      const stockBefore = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: ghProduct.id } });
      await expectApiError(
        () => checkoutService.checkout({ userId: crossBuyer.id, address: ngAddress }),
        409,
        "item_market_mismatch"
      );
      const orders = await prisma.order.count({ where: { customerId: crossBuyer.id } });
      const stockAfter = await prisma.inventoryStock.findUniqueOrThrow({ where: { productId: ghProduct.id } });
      const cart = await prisma.cart.findUniqueOrThrow({ where: { id: crossCart.id } });
      assert(orders === 0, `refused cross-market checkout created ${orders} order(s)`);
      assert(stockAfter.reserved === stockBefore.reserved, "refused cross-market checkout reserved stock");
      assert(cart.status === "ACTIVE", `refused cross-market checkout left the cart in ${cart.status}`);
    });

    // ---- optional HTTP cart contract ------------------------------------
    if (!baseUrl) {
      browserSummary = "SKIPPED: --base-url not supplied; HTTP cart checks were not exercised";
      console.log(`SKIP  HTTP cart acceptance — {${browserSummary}}`);
    } else {
      const http = new Http(baseUrl);
      const ngSession = sessions.get("ng");
      const ghSession = sessions.get("gh");
      assert(ngSession && ghSession, "run-owned sessions are missing");
      const ngCookie = `nd_session=${ngSession.token}; nd_country=NG; nd_city=Lagos`;
      const ghCookie = `nd_session=${ghSession.token}; nd_country=GH; nd_city=Accra`;

      await step("HTTP: server shares the REVIEW fixture database", async () => {
        const tree = await http.get("/api/taxonomy?country=NG&city=Lagos");
        expectStatus(tree, 200, "GET /api/taxonomy");
        const serialized = JSON.stringify(asRecord(tree.body));
        assert(serialized.includes(eligibleCategory.slug), "HTTP server does not see the run-owned REVIEW category");
      });

      await step("HTTP cart: GH visitor accepts an eligible GH listing", async () => {
        const result = await http.post("/api/cart/items", { productId: ghProduct.id, quantity: 1 }, ghCookie);
        expectStatus(result, 201, "POST GH cart item");
        const items = asArray(asRecord(result.body).items).map((item) => asRecord(item));
        assert(
          items.some((item) => item.productId === ghProduct.id),
          "HTTP GH cart response does not contain the accepted listing"
        );
      });

      await step("HTTP cart: invalid country cookie falls back to the home market", async () => {
        // `ZZ` is not an enabled country, and Accra is not an NG city. The
        // validated locale must fall back to NG/null, so an NG listing is
        // accepted; the former raw-cookie parser would have compared NG to ZZ.
        const cookie = `nd_session=${ngSession.token}; nd_country=ZZ; nd_city=Accra`;
        const result = await http.post("/api/cart/items", { productId: ngProduct.id, quantity: 1 }, cookie);
        expectStatus(result, 201, "POST cart item with an invalid country cookie");
        const items = asArray(asRecord(result.body).items).map((item) => asRecord(item));
        assert(
          items.some((item) => item.productId === ngProduct.id),
          "invalid country did not fall back to the home market for cart acceptance"
        );
      });

      await step("HTTP cart: NG visitor rejects a GH listing with product_market_unavailable", async () => {
        const result = await http.post("/api/cart/items", { productId: ghProduct.id, quantity: 1 }, ngCookie);
        expectStatus(result, 409, "POST cross-market cart item");
        assert(
          asRecord(result.body).code === "product_market_unavailable",
          `cross-market HTTP cart code ${String(asRecord(result.body).code)}`
        );
      });

      await step("HTTP cart: NG visitor rejects a regulated NG listing with product_market_unavailable", async () => {
        const result = await http.post("/api/cart/items", { productId: regulatedProduct.id, quantity: 1 }, ngCookie);
        expectStatus(result, 409, "POST regulated cart item");
        assert(
          asRecord(result.body).code === "product_market_unavailable",
          `regulated HTTP cart code ${String(asRecord(result.body).code)}`
        );
      });

      await step("HTTP cart: existing cart view remains readable", async () => {
        const result = await http.get("/api/cart", ghCookie);
        expectStatus(result, 200, "GET /api/cart");
        const items = asArray(asRecord(result.body).items).map((item) => asRecord(item));
        assert(
          items.some((item) => item.productId === ghProduct.id),
          "HTTP cart view lost the accepted GH listing"
        );
      });
      browserSummary = `EXERCISED against ${new URL(baseUrl).host}`;
    }
  } finally {
    try {
      const runUserIds = userIds;
      fixtureCounts.carts = await prisma.cart.count({ where: { userId: { in: runUserIds } } });
      // A refused checkout must not leave orders; remove any run-owned order
      // defensively so a future regression cannot contaminate REVIEW.
      const orders = await prisma.order.findMany({
        where: { customerId: { in: runUserIds } },
        select: { id: true }
      });
      if (orders.length > 0) {
        const orderIds = orders.map((order) => order.id);
        await prisma.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
        await prisma.orderItemRestock.deleteMany({ where: { orderId: { in: orderIds } } });
        await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
        await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      }
      if (runUserIds.length > 0) {
        await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: runUserIds } } } });
        await prisma.cart.deleteMany({ where: { userId: { in: runUserIds } } });
      }
      if (sessionIds.length > 0) await prisma.session.deleteMany({ where: { id: { in: sessionIds } } });
      if (productIds.length > 0) {
        await prisma.inventoryStock.deleteMany({ where: { productId: { in: productIds } } });
        await prisma.product.deleteMany({ where: { id: { in: productIds } } });
      }
      if (categoryIds.length > 0) {
        await prisma.categoryCountryRule.deleteMany({ where: { categoryId: { in: categoryIds } } });
        // Delete children before parents so the self-referencing tree FK stays satisfied.
        const rows = await prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, parentId: true }
        });
        const present = new Set(rows.map((row) => row.id));
        const childIds = rows.filter((row) => row.parentId && present.has(row.parentId)).map((row) => row.id);
        const parentIds = rows.filter((row) => !childIds.includes(row.id)).map((row) => row.id);
        if (childIds.length > 0) await prisma.category.deleteMany({ where: { id: { in: childIds } } });
        if (parentIds.length > 0) await prisma.category.deleteMany({ where: { id: { in: parentIds } } });
      }
      if (vendorIds.length > 0) await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
      if (runUserIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: runUserIds } } });

      const leftovers = {
        users: await prisma.user.count({ where: { id: { in: runUserIds } } }),
        vendors: await prisma.vendor.count({ where: { id: { in: vendorIds } } }),
        categories: await prisma.category.count({ where: { id: { in: categoryIds } } }),
        products: await prisma.product.count({ where: { id: { in: productIds } } }),
        carts: await prisma.cart.count({ where: { id: { in: cartIds } } }),
        cartItems: await prisma.cartItem.count({ where: { cartId: { in: cartIds } } }),
        sessions: await prisma.session.count({ where: { id: { in: sessionIds } } }),
        orders: await prisma.order.count({ where: { customerId: { in: runUserIds } } })
      };
      const remaining = Object.values(leftovers).reduce((sum, value) => sum + value, 0);
      leftoverSummary = `remaining ${JSON.stringify(leftovers)}`;
      console.log(`CLEANUP ${leftoverSummary}`);
      if (remaining > 0) {
        failures += 1;
        console.error("FAIL cleanup left run-owned rows in REVIEW");
      }
    } catch (error) {
      failures += 1;
      leftoverSummary = `cleanup error: ${sanitize(error instanceof Error ? error.message : String(error))}`;
      console.error(`CLEANUP FAIL ${leftoverSummary}`);
    }
    await prisma.$disconnect().catch(() => undefined);
  }

  console.log("");
  console.log(`RESULT ${passes}/${passes + failures} checks passed (run ${runId}).`);
  console.log(`FIXTURES ${JSON.stringify(fixtureCounts)}`);
  console.log(`HTTP ${browserSummary}`);
  console.log(`CLEANUP ${leftoverSummary}`);
  if (failures > 0) {
    console.error(`FAILED ${failures} check(s).`);
    process.exit(1);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
