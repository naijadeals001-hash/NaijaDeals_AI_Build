#!/usr/bin/env node
/**
 * Staging Shop acceptance journey (Playwright, real UI + real staging API).
 *
 * Covers, against the running staging app and the prepared demo catalogue:
 *   - tester02 sign-in through the real form;
 *   - Shop shell, search/browse, product detail and DEMO labelling;
 *   - variant selection (in-stock vs disabled out-of-stock option);
 *   - a simple product that is honestly out of stock;
 *   - saved items (save, account list, remove);
 *   - cart add / quantity update / save for later / move back / remove;
 *   - checkout field validation (browser required fields + server 400);
 *   - a successful WALLET payment and order creation;
 *   - duplicate checkout and duplicate payment submission;
 *   - order history and order ownership;
 *   - cancellation of a paid order with a full refund through the supported UI;
 *   - tester03 insufficient-balance refusal and unpaid order cancellation;
 *   - cross-account order denial;
 *   - seller-persona denial on demo products and on the demo vendor's order;
 *   - the passwordless catalogue fixture actor cannot log in;
 *   - a 390x844 responsive spot-check.
 *
 * Payment verification level: wallet only. Funding is prepared separately by
 * scripts/staging/fund-shop-testers.ts through the local test top-up provider.
 * This script never edits a balance, never calls a payment provider, never
 * changes an environment file and never deletes an order, payment, refund or
 * ledger row.
 *
 * Tester credentials are read from the ACL-protected activation file and typed
 * into the real login form. Emails, passwords and cookies are never printed.
 *
 * Run (local staging app already running):
 *   node scripts/staging/shop-tester-journey.cjs
 * Optional:
 *   STAGING_BASE_URL=http://localhost:3200
 *
 * Evidence and screenshots: qa-artifacts/staging-shop/
 * Exit: 0 all PASS/DEFERRED, 1 any FAIL, 2 any BLOCKED (or app unavailable).
 */
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const BASE = (process.env.STAGING_BASE_URL || "http://localhost:3200").replace(/\/$/, "");
const BASE_ORIGIN = (() => {
  try {
    return new URL(BASE).origin;
  } catch {
    return "configured base URL (invalid)";
  }
})();
const ACTIVATION_FILE = "C:/NaijaDeals-Staging/secrets/tester-activation.json";
const BUILD_ID_FILE = "C:/NaijaDeals-Staging/app/.next/BUILD_ID";
const BUILD_ID = fs.existsSync(BUILD_ID_FILE) ? fs.readFileSync(BUILD_ID_FILE, "utf8").trim() : null;
const OUT_DIR = path.join(ROOT, "qa-artifacts", "staging-shop");
const RUN_ID = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(3).toString("hex")}`;
const TIMEOUT_MS = Number(process.env.SHOP_JOURNEY_TIMEOUT_MS || 30_000);
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const FIXTURE_EMAIL = "staging.shop.fixture@staging.invalid";
const DEMO_SLUGS = {
  phone: "staging-demo-simple-instock-phone",
  variant: "staging-demo-variant-sneakers",
  outOfStock: "staging-demo-out-of-stock-blender"
};
const DEMO_DEPARTMENTS = [
  "staging-demo-phones-tablets",
  "staging-demo-fashion",
  "staging-demo-home-kitchen"
];
const BLOCKABLE_STEPS = [
  ["S1", "Demo catalogue fixtures are published"],
  ["S2", "Wallet payment method is offered"],
  ["A1", "Tester02 signs in through the real UI"],
  ["A2", "Shop shell renders"],
  ["A3", "Search finds the demo catalogue"],
  ["A4", "Product detail is clearly labelled DEMO"],
  ["A5", "Variant selection exposes one in-stock and one out-of-stock option"],
  ["A6", "Simple out-of-stock product cannot be added"],
  ["A7", "Saved items save, list and remove"],
  ["A8", "Cart add, quantity update, save for later, move and remove"],
  ["A9", "Checkout validates required fields on client and server"],
  ["A10", "Successful wallet checkout creates one order"],
  ["A11", "Duplicate checkout submission is refused without a second order"],
  ["A12", "Wallet payment completes the order"],
  ["A13", "Duplicate payment confirmation is idempotent"],
  ["A14", "Order history shows the paid order for its owner"],
  ["A15", "Paid order cancellation refunds the wallet"],
  ["A16", "Duplicate cancellation/refund is refused without a second refund"],
  ["A17", "Return eligibility state is honest"],
  ["B1", "Tester03 signs in and reaches their own account"],
  ["B2", "Insufficient-balance payment is refused"],
  ["B3", "Unpaid order cancellation releases the reservation"],
  ["B4", "Tester03 cannot read tester02's order"],
  ["C1", "Seller persona sees only their own empty overview"],
  ["C2", "Seller persona cannot modify a demo product"],
  ["C3", "Seller persona cannot read the demo vendor's order"],
  ["D1", "Catalogue fixture actor cannot log in"],
  ["M1", "Mobile search has no horizontal overflow"]
];
const DEMO_PREFIX = "staging-demo-";

fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
const state = {
  fixturesReady: false,
  walletMethodReady: false,
  tester02Usable: false,
  checkoutOrder: null,
  paymentReference: null,
  tester02PrePaymentWallet: null,
  tester03Order: null,
  tester03OrderActive: false,
  health: null,
  persistentOrders: [],
  cleanup: { tester02: null, tester03: null },
  baseline: { tester02: null, tester03: null },
  runCartItemIds: new Set(),
  runSavedProductIds: new Set()
};

class Blocked extends Error {}
class Deferred extends Error {}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(status, id, title, detail) {
  results.push({ id, title, status, detail: String(detail || "") });
  console.log(`${status.padEnd(8)} ${id} ${title}${detail ? ` — ${detail}` : ""}`);
}

async function step(id, title, fn) {
  try {
    const detail = await fn();
    record("PASS", id, title, detail);
    return true;
  } catch (error) {
    if (error instanceof Blocked) record("BLOCKED", id, title, error.message);
    else if (error instanceof Deferred) record("DEFERRED", id, title, error.message);
    else record("FAIL", id, title, error instanceof Error ? error.message : String(error));
    return false;
  }
}

function blockedFor(id, title, reason) {
  record("BLOCKED", id, title, reason);
}

function safeDetail(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "postgresql://[redacted]").slice(0, 600);
}

async function screenshot(page, label) {
  const file = path.join(OUT_DIR, `${RUN_ID}-${label}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

async function api(context, method, urlPath, body) {
  const response = await context.request.fetch(`${BASE}${urlPath}`, {
    method,
    headers: { Origin: BASE_ORIGIN },
    data: body,
    failOnStatusCode: false
  });
  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 300) };
    }
  }
  return { status: response.status(), body: payload };
}

async function getJson(context, urlPath) {
  const response = await api(context, "GET", urlPath);
  if (response.status !== 200) {
    const code = response.body && (response.body.code || response.body.error);
    throw new Error(`GET ${urlPath} returned HTTP ${response.status}${code ? ` (${String(code).slice(0, 120)})` : ""}`);
  }
  return response.body;
}

function loadActivationAccounts() {
  if (!fs.existsSync(ACTIVATION_FILE)) throw new Error("the protected tester activation file is missing");
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(ACTIVATION_FILE, "utf8"));
  } catch {
    // Never surface JSON.parse's input excerpt: it can contain a credential.
    throw new Error("the protected tester activation file is not valid JSON; repair it locally");
  }
  if (!Array.isArray(parsed.accounts)) throw new Error("the tester activation file has no accounts array");
  return parsed.accounts;
}

function findPrimaryTester(accounts, label) {
  const normalise = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
  const needle = normalise(label);
  const primary = accounts.filter((account) => !account.ownerTester);
  const labelled = primary.filter((account) =>
    normalise([account.displayName, account.email].filter(Boolean).join(" ")).includes(needle)
  );
  const matches =
    labelled.length === 1
      ? labelled
      : primary.filter((account) => {
          const purpose = Array.isArray(account.purpose) ? account.purpose.join(" ") : account.purpose || "";
          return normalise(purpose).includes(needle);
        });
  if (matches.length !== 1) throw new Error(`the activation file does not resolve exactly one ${label} account`);
  if (!matches[0].password) throw new Error(`the ${label} activation entry has no password`);
  return matches[0];
}

async function signIn(page, account, label) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) => candidate.url().endsWith("/api/auth/login") && candidate.request().method() === "POST"
    ),
    page.getByRole("button", { name: /^sign in$/i }).first().click()
  ]);
  assert(response.status() === 200, `${label} sign-in returned HTTP ${response.status()}`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function newAccountPage(browser, account, label, viewport = DESKTOP) {
  const context = await browser.newContext({ viewport, locale: "en-NG" });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);
  await signIn(page, account, label);
  return { context, page };
}

async function walletSnapshot(context) {
  const wallet = await getJson(context, "/api/wallet");
  return {
    availableKobo: BigInt(wallet.availableKobo || 0),
    heldKobo: BigInt(wallet.heldKobo || 0),
    escrowHolds: Array.isArray(wallet.escrowHolds) ? wallet.escrowHolds : []
  };
}

async function orderCount(context) {
  const orders = await getJson(context, "/api/orders");
  return Array.isArray(orders) ? orders.length : 0;
}

async function captureBaseline(context) {
  const cart = await getJson(context, "/api/cart");
  const saved = await getJson(context, "/api/account/saved?country=NG");
  const items = Array.isArray(cart.items) ? cart.items : [];
  const savedItems = Array.isArray(saved) ? saved : [];
  return {
    itemCount: items.length,
    activeCount: items.filter((item) => !item.savedForLater).length,
    savedCount: savedItems.length
  };
}

/**
 * Remove only records this run created. The baseline snapshot is never
 * deleted, so a tester's pre-existing cart or saved items survive an
 * interrupted journey.
 */
async function cleanupRunOwned(context) {
  const cart = await getJson(context, "/api/cart");
  const items = Array.isArray(cart.items) ? cart.items : [];
  let removedCart = 0;
  for (const item of items) {
    if (!state.runCartItemIds.has(item.id)) continue;
    const removed = await api(context, "DELETE", `/api/cart/items/${item.id}`);
    if (removed.status !== 200) throw new Error(`could not remove a run-owned cart line (HTTP ${removed.status})`);
    removedCart += 1;
  }
  const saved = await getJson(context, "/api/account/saved?country=NG");
  let removedSaved = 0;
  for (const item of Array.isArray(saved) ? saved : []) {
    const productId = item.product && item.product.id;
    if (!productId || !state.runSavedProductIds.has(productId)) continue;
    const toggled = await api(context, "POST", "/api/account/saved", { productId });
    if (toggled.status !== 200) throw new Error(`could not remove a run-owned saved item (HTTP ${toggled.status})`);
    removedSaved += 1;
  }
  return { removedCart, removedSaved };
}

async function discoverFixtures(context) {
  // Read through category browse, not the search index. Search relevance is
  // exercised separately; fixture discovery must not depend on a worker having
  // indexed the new demo products yet.
  const bySlug = new Map();
  for (const categorySlug of DEMO_DEPARTMENTS) {
    const raw = await getJson(context, `/api/products?category=${encodeURIComponent(categorySlug)}`);
    const products = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : [];
    for (const product of products) bySlug.set(product.slug, product);
  }
  const missing = Object.values(DEMO_SLUGS).filter((slug) => !bySlug.has(slug));
  if (missing.length > 0) {
    return { ready: false, missing, products: bySlug };
  }
  return {
    ready: true,
    missing: [],
    products: bySlug,
    phone: bySlug.get(DEMO_SLUGS.phone),
    variant: bySlug.get(DEMO_SLUGS.variant),
    outOfStock: bySlug.get(DEMO_SLUGS.outOfStock)
  };
}

async function main() {
  console.log(`Staging Shop journey ${RUN_ID}`);
  console.log(`Base ${BASE_ORIGIN}`);
  if (BUILD_ID) console.log(`Build ${BUILD_ID}`);

  const health = await (async () => {
    try {
      const response = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(15_000) });
      const body = await response.json().catch(() => null);
      const database = body && Array.isArray(body.checks) ? body.checks.find((check) => check.name === "database") : null;
      return {
        ok: response.status === 200 && Boolean(body) && (!database || database.ok !== false),
        status: response.status,
        database: database ? { name: database.name, ok: database.ok === true } : null
      };
    } catch (error) {
      return { ok: false, status: 0, error: safeDetail(error) };
    }
  })();
  state.health = { status: health.status, database: health.database ?? null };
  if (!health.ok) {
    record("BLOCKED", "S0", "Staging app and database are reachable", `health check failed (status=${health.status})`);
    for (const [id, title] of BLOCKABLE_STEPS) {
      blockedFor(id, title, "staging app health check did not pass; no browser journey was run");
    }
    await finish();
    return;
  }
  record("PASS", "S0", "Staging app and database are reachable", `HTTP ${health.status}`);

  const accounts = loadActivationAccounts();
  const tester02 = findPrimaryTester(accounts, "tester02");
  const tester03 = findPrimaryTester(accounts, "tester03");
  const sellerPersona = accounts.find((account) => Array.isArray(account.roles) && account.roles.includes("vendor"));
  if (!sellerPersona || !sellerPersona.password) {
    throw new Error("the activation file does not contain a usable seller persona account");
  }

  const browser = await chromium.launch({ headless: process.env.SHOP_JOURNEY_HEADED !== "1" });
  let anonContext = null;
  let t2 = null;
  let t3 = null;
  let seller = null;
  let mobileContext = null;
  try {
    anonContext = await browser.newContext({ viewport: DESKTOP });
    const anonPage = await anonContext.newPage();
    anonPage.setDefaultTimeout(TIMEOUT_MS);

    const fixtures = await discoverFixtures(anonContext).catch((error) => ({
      ready: false,
      missing: [`catalogue API unavailable: ${safeDetail(error)}`],
      products: new Map()
    }));
    state.fixturesReady = fixtures.ready;
    await step("S1", "Demo catalogue fixtures are published", async () => {
      if (!fixtures.ready) {
        throw new Blocked(
          `missing demo product slug(s): ${fixtures.missing.join(", ")}. Run scripts/staging/prepare-shop-fixtures.ts first.`
        );
      }
      return `found ${fixtures.products.size} STAGING DEMO listing(s)`;
    });

    const methods = await getJson(anonContext, "/api/payments/methods?country=NG").catch(() => ({ methods: [] }));
    const walletMethod = (methods.methods || []).find((method) => method.id === "wallet");
    state.walletMethodReady = Boolean(walletMethod);
    await step("S2", "Wallet payment method is offered", async () => {
      assert(walletMethod, "the running app does not offer the wallet payment method");
      return "wallet offered";
    });

    if (!state.fixturesReady) {
      for (const [id, title] of BLOCKABLE_STEPS) {
        if (id === "S1" || id === "S2" || id === "D1") continue;
        blockedFor(id, title, "demo catalogue fixtures are not published; run prepare-shop-fixtures.ts");
      }
      await step("D1", "Catalogue fixture actor cannot log in", async () => {
        const response = await api(anonContext, "POST", "/api/auth/login", {
          email: FIXTURE_EMAIL,
          password: "this-account-has-no-password"
        });
        assert(response.status === 401, `the passwordless fixture actor login returned HTTP ${response.status}`);
        return "HTTP 401 (passwordless account)";
      });
      await finish();
      return;
    }

    // ---------------------------------------------------------------- tester02
    t2 = await newAccountPage(browser, tester02, "tester02");
    state.tester02Usable = true;
    await step("A1", "Tester02 signs in through the real UI", async () => {
      await t2.page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
      assert(!t2.page.url().includes("/login"), "tester02 was redirected back to /login");
      return t2.page.url().replace(BASE, "");
    });

    state.baseline.tester02 = await captureBaseline(t2.context);
    state.cleanup.tester02 = { baseline: state.baseline.tester02, removedRunOwned: null };

    await step("A2", "Shop shell renders", async () => {
      const response = await t2.page.goto(`${BASE}/naijashop`, { waitUntil: "domcontentloaded" });
      assert(response && response.status() === 200, `shop shell returned HTTP ${response ? response.status() : "none"}`);
      await t2.page.getByRole("search", { name: "Search the NaijaDeals marketplace" }).first().waitFor({ state: "visible" });
      return "marketplace header, search and location render";
    });

    await step("A3", "Search finds the demo catalogue", async () => {
      await Promise.all([
        t2.page.waitForResponse(
          (response) => response.url().includes("/api/products") && response.request().method() === "GET"
        ),
        t2.page.goto(`${BASE}/naijashop/search?q=${encodeURIComponent("STAGING DEMO")}`, { waitUntil: "domcontentloaded" })
      ]);
      for (const slug of Object.values(DEMO_SLUGS)) {
        await t2.page.locator(`[data-product="${slug}"]`).first().waitFor({ state: "visible" });
      }
      const evidence = await screenshot(t2.page, "01-search-demo-results");
      return `3 demo listings visible; ${evidence}`;
    });

    await step("A4", "Product detail is clearly labelled DEMO", async () => {
      const fixture = fixtures.phone;
      await t2.page.goto(`${BASE}/product/${fixture.slug}`, { waitUntil: "domcontentloaded" });
      const title = await t2.page.locator('[data-testid="product-title"]').innerText();
      assert(title.includes("STAGING DEMO"), "the product title does not say STAGING DEMO");
      await t2.page.locator('[data-testid="demo-badge"]').waitFor({ state: "visible" });
      const notice = await t2.page.locator('[data-testid="demo-notice"]').innerText();
      assert(/demonstration|illustrative/i.test(notice), "the demo notice does not identify the listing as demonstration data");
      const availability = await t2.page.locator('[data-testid="product-availability"]').innerText();
      assert(!/out of stock/i.test(availability), "the in-stock fixture unexpectedly reports out of stock");
      const evidence = await screenshot(t2.page, "02-product-detail-demo");
      return `title, DEMO badge, demo notice and availability rendered; ${evidence}`;
    });

    await step("A5", "Variant selection exposes one in-stock and one out-of-stock option", async () => {
      const fixture = fixtures.variant;
      await t2.page.goto(`${BASE}/product/${fixture.slug}`, { waitUntil: "domcontentloaded" });
      const select = t2.page.locator('[data-testid="product-variant"]');
      await select.waitFor({ state: "visible" });
      const options = await select.locator("option").evaluateAll((rows) =>
        rows.map((row) => ({ value: row.value, label: row.textContent || "", disabled: row.disabled }))
      );
      assert(options.length === 2, `expected 2 variant options, saw ${options.length}`);
      assert(options.some((option) => option.disabled && /out of stock/i.test(option.label)), "no disabled out-of-stock option is present");
      const purchasable = options.find((option) => !option.disabled);
      assert(purchasable, "no purchasable variant option is present");
      await select.selectOption(purchasable.value);
      await t2.page.waitForTimeout(250);
      const availability = await t2.page.locator('[data-testid="product-availability"]').innerText();
      assert(/shown for demonstration/i.test(availability), `variant availability did not update: ${availability}`);
      const add = t2.page.locator('[data-testid="add-to-cart"]');
      await add.click();
      await t2.page.locator('[data-testid="cart-added-notice"]').waitFor({ state: "visible" });
      const cart = await getJson(t2.context, "/api/cart");
      const line = (cart.items || []).find((item) => item.productId === fixture.id && item.variantId);
      assert(line, "the selected variant was not added to the cart");
      state.runCartItemIds.add(line.id);
      assert(line.variant && /Blue/i.test(line.variant.name), "the cart line is missing the selected variant name");
      const evidence = await screenshot(t2.page, "03-variant-selected");
      return `2 options (1 disabled out-of-stock); selected ${purchasable.label}; ${evidence}`;
    });

    await step("A6", "Simple out-of-stock product cannot be added", async () => {
      const fixture = fixtures.outOfStock;
      await t2.page.goto(`${BASE}/product/${fixture.slug}`, { waitUntil: "domcontentloaded" });
      const availability = await t2.page.locator('[data-testid="product-availability"]').innerText();
      assert(/out of stock/i.test(availability), `expected Out of stock, saw: ${availability}`);
      const add = t2.page.locator('[data-testid="add-to-cart"]');
      assert(await add.isDisabled(), "the out-of-stock Add to cart control is not disabled");
      const panel = await t2.page.locator('[data-testid="purchase-panel"]').innerText();
      assert(/cannot be added to the basket/i.test(panel), "the out-of-stock explanation is missing");
      const evidence = await screenshot(t2.page, "04-out-of-stock");
      return `availability and disabled control verified; ${evidence}`;
    });

    await step("A7", "Saved items save, list and remove", async () => {
      const fixture = fixtures.variant;
      await t2.page.goto(`${BASE}/product/${fixture.slug}`, { waitUntil: "domcontentloaded" });
      const save = t2.page.getByRole("button", { name: /^save for later$/i });
      await save.waitFor({ state: "visible" });
      const [saveResponse] = await Promise.all([
        t2.page.waitForResponse((response) => response.url().endsWith("/api/account/saved") && response.request().method() === "POST"),
        save.click()
      ]);
      assert(saveResponse.status() === 200, `saving an item returned HTTP ${saveResponse.status()}`);
      state.runSavedProductIds.add(fixture.id);
      await t2.page.getByRole("button", { name: /^saved for later$/i }).waitFor({ state: "visible" });
      const saved = await getJson(t2.context, "/api/account/saved?country=NG");
      assert((saved || []).some((item) => item.product && item.product.slug === fixture.slug), "the saved item is absent from the account API");
      await t2.page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
      const savedSection = t2.page.locator("#saved");
      await savedSection.waitFor({ state: "visible" });
      await savedSection.getByText(fixture.name).first().waitFor({ state: "visible" });
      const evidence = await screenshot(t2.page, "05-saved-items");
      const removed = await api(t2.context, "POST", "/api/account/saved", { productId: fixture.id });
      assert(removed.status === 200, `removing the saved item returned HTTP ${removed.status}`);
      state.runSavedProductIds.delete(fixture.id);
      return `saved, listed under Account, removed; ${evidence}`;
    });

    await step("A8", "Cart add, quantity update, save for later, move and remove", async () => {
      if ((state.baseline.tester02?.activeCount ?? 0) > 0) {
        throw new Blocked("tester02 has pre-existing active cart lines; this run will not delete them. Clear them manually, then rerun");
      }
      const fixture = fixtures.variant;
      let cart = await getJson(t2.context, "/api/cart");
      let line = (cart.items || []).find((item) => item.productId === fixture.id && !item.savedForLater && item.variantId);
      if (!line) {
        await t2.page.goto(`${BASE}/product/${fixture.slug}`, { waitUntil: "domcontentloaded" });
        const select = t2.page.locator('[data-testid="product-variant"]');
        const options = await select.locator("option").evaluateAll((rows) =>
          rows.map((row) => ({ value: row.value, disabled: row.disabled }))
        );
        await select.selectOption(options.find((option) => !option.disabled).value);
        await t2.page.locator('[data-testid="add-to-cart"]').click();
        await t2.page.locator('[data-testid="cart-added-notice"]').waitFor({ state: "visible" });
        cart = await getJson(t2.context, "/api/cart");
        line = (cart.items || []).find((item) => item.productId === fixture.id && !item.savedForLater && item.variantId);
      }
      assert(line, "the variant line is not in the cart");
      state.runCartItemIds.add(line.id);

      await t2.page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });
      const article = t2.page.locator("article").filter({ hasText: fixture.name }).first();
      await article.waitFor({ state: "visible" });
      const [increaseResponse] = await Promise.all([
        t2.page.waitForResponse((response) => response.url().includes(`/api/cart/items/${line.id}`) && response.request().method() === "PATCH"),
        article.getByRole("button", { name: "Increase quantity" }).click()
      ]);
      assert(increaseResponse.status() === 200, `quantity increase returned HTTP ${increaseResponse.status()}`);
      cart = await getJson(t2.context, "/api/cart");
      assert((cart.items || []).some((item) => item.id === line.id && item.quantity === 2), "quantity did not become 2");

      const [decreaseResponse] = await Promise.all([
        t2.page.waitForResponse((response) => response.url().includes(`/api/cart/items/${line.id}`) && response.request().method() === "PATCH"),
        article.getByRole("button", { name: "Decrease quantity" }).click()
      ]);
      assert(decreaseResponse.status() === 200, `quantity decrease returned HTTP ${decreaseResponse.status()}`);
      cart = await getJson(t2.context, "/api/cart");
      assert((cart.items || []).some((item) => item.id === line.id && item.quantity === 1), "quantity did not return to 1");

      const [saveForLaterResponse] = await Promise.all([
        t2.page.waitForResponse((response) => response.url().includes(`/api/cart/items/${line.id}`) && response.request().method() === "PATCH"),
        article.getByRole("button", { name: "Save for later" }).click()
      ]);
      assert(saveForLaterResponse.status() === 200, `save-for-later returned HTTP ${saveForLaterResponse.status()}`);
      await t2.page.getByText(/Saved for later \(1\)/).waitFor({ state: "visible" });
      cart = await getJson(t2.context, "/api/cart");
      assert((cart.items || []).some((item) => item.id === line.id && item.savedForLater), "the line was not marked saved for later");

      const [moveResponse] = await Promise.all([
        t2.page.waitForResponse((response) => response.url().includes(`/api/cart/items/${line.id}`) && response.request().method() === "PATCH"),
        t2.page.getByRole("button", { name: "Move to cart" }).click()
      ]);
      assert(moveResponse.status() === 200, `move-to-cart returned HTTP ${moveResponse.status()}`);
      cart = await getJson(t2.context, "/api/cart");
      assert((cart.items || []).some((item) => item.id === line.id && !item.savedForLater), "the line did not return to the active cart");

      const [removeResponse] = await Promise.all([
        t2.page.waitForResponse((response) => response.url().includes(`/api/cart/items/${line.id}`) && response.request().method() === "DELETE"),
        t2.page.getByRole("button", { name: /^Remove$/ }).first().click()
      ]);
      assert(removeResponse.status() === 200, `cart remove returned HTTP ${removeResponse.status()}`);
      await t2.page.getByText("Your cart is empty").first().waitFor({ state: "visible" });
      const evidence = await screenshot(t2.page, "06-cart-empty-after-remove");
      return `add/update/save/move/remove verified; ${evidence}`;
    });

    // Add the variant again for checkout.
    await t2.page.goto(`${BASE}/product/${fixtures.variant.slug}`, { waitUntil: "domcontentloaded" });
    {
      const select = t2.page.locator('[data-testid="product-variant"]');
      const options = await select.locator("option").evaluateAll((rows) =>
        rows.map((row) => ({ value: row.value, disabled: row.disabled }))
      );
      await select.selectOption(options.find((option) => !option.disabled).value);
      await t2.page.locator('[data-testid="add-to-cart"]').click();
      await t2.page.locator('[data-testid="cart-added-notice"]').waitFor({ state: "visible" });
      const addedCart = await getJson(t2.context, "/api/cart");
      const addedLine = (addedCart.items || []).find(
        (item) => item.productId === fixtures.variant.id && !item.savedForLater && item.variantId
      );
      if (addedLine) state.runCartItemIds.add(addedLine.id);
    }

    const stagingAddress = {
      label: "Staging demo",
      contactName: "STAGING TESTER02",
      contactPhone: "08030000002",
      countryCode: "NG",
      state: "FCT",
      city: "Wuse",
      line1: "STAGING DEMO 1 Test Close",
      line2: `RUN ${RUN_ID}`
    };

    await step("A9", "Checkout validates required fields on client and server", async () => {
      await t2.page.goto(`${BASE}/checkout`, { waitUntil: "domcontentloaded" });
      const submit = t2.page.getByRole("button", { name: /Review order and choose payment/i });
      await submit.waitFor({ state: "visible" });
      await t2.page.waitForFunction(() => {
        const button = [...document.querySelectorAll("button")].find((candidate) =>
          /Review order and choose payment/i.test(candidate.textContent || "")
        );
        return button && !button.disabled;
      });

      let checkoutPosts = 0;
      const counter = (request) => {
        if (request.method() === "POST" && request.url().endsWith("/api/checkout")) checkoutPosts += 1;
      };
      t2.page.on("request", counter);
      await submit.click();
      await t2.page.waitForTimeout(800);
      t2.page.off("request", counter);
      const invalid = await t2.page.evaluate(() => document.querySelectorAll("form input:invalid").length);
      assert(invalid > 0, "the browser did not block an empty required checkout field");
      assert(checkoutPosts === 0, "the browser submitted the checkout form despite invalid required fields");
      assert(t2.page.url().includes("/checkout"), "the page navigated away from checkout after invalid input");

      const serverValidation = await api(t2.context, "POST", "/api/checkout", {
        address: { countryCode: "NG", state: "FCT", city: "Wuse", line1: "STAGING DEMO" },
        saveAddress: false
      });
      assert(serverValidation.status === 400, `server-side validation returned HTTP ${serverValidation.status}`);
      assert(
        serverValidation.body && serverValidation.body.code === "validation_error",
        `server-side validation did not return validation_error: ${JSON.stringify(serverValidation.body || {}).slice(0, 200)}`
      );
      const evidence = await screenshot(t2.page, "07-checkout-validation");
      return `browser blocked ${invalid} invalid field(s); server returned 400 validation_error; ${evidence}`;
    });

    await step("A10", "Successful wallet checkout creates one order", async () => {
      if (!state.walletMethodReady) throw new Blocked("wallet is not offered by the running app; checkout cannot complete");
      if ((state.baseline.tester02?.activeCount ?? 0) > 0) {
        throw new Blocked("tester02 has pre-existing active cart lines; this run will not delete or purchase them");
      }
      const beforeOrders = await orderCount(t2.context);
      await t2.page.getByLabel("Full name").fill(stagingAddress.contactName);
      await t2.page.getByLabel("Phone number").fill(stagingAddress.contactPhone);
      await t2.page.getByLabel("Street address").fill(stagingAddress.line1);
      await t2.page.getByLabel("Apartment / landmark (optional)").fill(stagingAddress.line2);
      await t2.page.getByLabel("City", { exact: true }).fill(stagingAddress.city);
      await t2.page.getByLabel("State", { exact: true }).fill(stagingAddress.state);
      await t2.page.getByLabel("Address label").fill(stagingAddress.label);
      const saveAddress = t2.page.getByLabel("Save this address to my account");
      if (await saveAddress.isChecked()) await saveAddress.uncheck();

      const [checkoutResponse] = await Promise.all([
        t2.page.waitForResponse(
          (response) => response.url().endsWith("/api/checkout") && response.request().method() === "POST"
        ),
        t2.page.getByRole("button", { name: /Review order and choose payment/i }).click()
      ]);
      const checkoutBody = await checkoutResponse.json().catch(() => null);
      assert(
        checkoutResponse.status() === 201,
        `checkout returned HTTP ${checkoutResponse.status()}${checkoutBody && checkoutBody.code ? ` (${checkoutBody.code})` : ""}`
      );
      assert(checkoutBody && Array.isArray(checkoutBody.orders) && checkoutBody.orders.length === 1, "checkout did not create exactly one order");
      const order = checkoutBody.orders[0];
      assert(order.totalKobo && BigInt(order.totalKobo) > 0n, "the created order has no positive total");
      assert(
        Array.isArray(checkoutBody.paymentMethods) && checkoutBody.paymentMethods.some((method) => method.id === "wallet"),
        "the checkout did not offer the wallet payment method"
      );
      await t2.page.getByRole("heading", { name: "Pay for your order" }).waitFor({ state: "visible" });
      const afterOrders = await orderCount(t2.context);
      assert(afterOrders === beforeOrders + 1, `order count moved from ${beforeOrders} to ${afterOrders}, expected +1`);
      state.checkoutOrder = {
        id: order.orderId,
        number: order.orderNumber,
        totalKobo: BigInt(order.totalKobo),
        vendorName: order.vendorName
      };
      state.persistentOrders.push({
        role: "tester02",
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        purpose: "successful wallet payment, then customer cancellation/refund"
      });
      const evidence = await screenshot(t2.page, "08-checkout-wallet-ready");
      return `${order.orderNumber} created with a positive total; ${evidence}`;
    });

    await step("A11", "Duplicate checkout submission is refused without a second order", async () => {
      if (!state.checkoutOrder) throw new Blocked("no checkout order was created");
      const before = await orderCount(t2.context);
      const duplicate = await api(t2.context, "POST", "/api/checkout", {
        address: stagingAddress,
        saveAddress: false
      });
      assert(duplicate.status === 409, `duplicate checkout returned HTTP ${duplicate.status}`);
      assert(
        duplicate.body && ["checkout_already_completed", "empty_cart", "checkout_conflict"].includes(duplicate.body.code),
        `duplicate checkout returned an unexpected code: ${String(duplicate.body && duplicate.body.code).slice(0, 80)}`
      );
      const after = await orderCount(t2.context);
      assert(after === before, `duplicate checkout created another order (${before} -> ${after})`);
      return `HTTP 409 ${duplicate.body.code}; order count stayed ${after}`;
    });

    await step("A12", "Wallet payment completes the order", async () => {
      if (!state.checkoutOrder) throw new Blocked("no checkout order was created");
      const beforeWallet = await walletSnapshot(t2.context);
      if (!state.walletMethodReady) throw new Blocked("wallet is not offered; funding and payment cannot run");
      if (beforeWallet.availableKobo < state.checkoutOrder.totalKobo) {
        await api(t2.context, "POST", `/api/orders/${state.checkoutOrder.id}/cancel`, {
          reason: "Tester02 wallet funding was not prepared"
        });
        const cancelledRecord = state.persistentOrders.find((entry) => entry.orderId === state.checkoutOrder.id);
        if (cancelledRecord) cancelledRecord.purpose = "unpaid checkout order cancelled because tester02 funding was not prepared";
        state.checkoutOrder = null;
        throw new Blocked(
          `tester02 wallet has ${beforeWallet.availableKobo} kobo, below the order total; the unpaid order was cancelled. Run fund-shop-testers.ts`
        );
      }
      state.tester02PrePaymentWallet = beforeWallet;

      const walletRadio = t2.page.locator('input[type="radio"][value="wallet"]');
      if ((await walletRadio.count()) > 0) await walletRadio.first().check();
      const payButton = t2.page.getByRole("button", { name: /^Pay from wallet$/i }).first();
      await payButton.waitFor({ state: "visible" });
      const initPromise = t2.page.waitForResponse(
        (response) => response.url().endsWith("/api/payments/initialize") && response.request().method() === "POST"
      );
      const confirmPromise = t2.page.waitForResponse(
        (response) => response.url().endsWith("/api/payments/confirm") && response.request().method() === "POST"
      );
      await payButton.click();
      const initResponse = await initPromise;
      const initBody = await initResponse.json().catch(() => null);
      assert(initResponse.status() === 201, `payment initialize returned HTTP ${initResponse.status()}`);
      assert(initBody && initBody.reference && initBody.provider === "wallet", "payment initialize did not return a wallet reference");
      state.paymentReference = initBody.reference;
      const confirmResponse = await confirmPromise;
      const confirmBody = await confirmResponse.json().catch(() => null);
      assert(
        confirmResponse.status() === 200,
        `payment confirm returned HTTP ${confirmResponse.status()}${confirmBody && confirmBody.code ? ` (${confirmBody.code})` : ""}`
      );
      assert(confirmBody && confirmBody.status === "COMPLETED", "payment confirm did not report COMPLETED");
      await t2.page.waitForURL(/\/orders\?paid=1/, { timeout: TIMEOUT_MS });

      const paidOrder = await getJson(t2.context, `/api/orders/${state.checkoutOrder.id}`);
      assert(paidOrder.paymentStatus === "paid", `order paymentStatus is ${paidOrder.paymentStatus}, expected paid`);
      assert(paidOrder.status === "vendor_notified", `order status is ${paidOrder.status}, expected vendor_notified`);
      assert(
        (paidOrder.payments || []).some((payment) => payment.provider === "wallet" && payment.status === "COMPLETED"),
        "no COMPLETED wallet payment is attached to the order"
      );
      assert((paidOrder.deliveries || []).length === 1, "a paid order must create exactly one delivery");
      assert((paidOrder.escrowHolds || []).length === 1, "a paid order must create exactly one escrow hold");

      const afterWallet = await walletSnapshot(t2.context);
      assert(
        afterWallet.availableKobo === beforeWallet.availableKobo - state.checkoutOrder.totalKobo,
        `wallet available did not decrease by the order total (${beforeWallet.availableKobo} -> ${afterWallet.availableKobo})`
      );
      assert(
        afterWallet.heldKobo === beforeWallet.heldKobo + state.checkoutOrder.totalKobo,
        `wallet held did not increase by the order total (${beforeWallet.heldKobo} -> ${afterWallet.heldKobo})`
      );
      const evidence = await screenshot(t2.page, "09-order-paid");
      return `reference confirmed; order paid, escrow held, wallet moved by ${state.checkoutOrder.totalKobo} kobo; ${evidence}`;
    });

    await step("A13", "Duplicate payment confirmation is idempotent", async () => {
      if (!state.checkoutOrder || !state.paymentReference) throw new Blocked("no completed payment to replay");
      const beforeWallet = await walletSnapshot(t2.context);
      const replay = await api(t2.context, "POST", "/api/payments/confirm", {
        reference: state.paymentReference,
        provider: "wallet"
      });
      assert(replay.status === 200, `duplicate confirmation returned HTTP ${replay.status}`);
      assert(replay.body && replay.body.status === "COMPLETED" && replay.body.duplicate === true, "duplicate confirmation did not report a duplicate");
      const paidOrder = await getJson(t2.context, `/api/orders/${state.checkoutOrder.id}`);
      assert((paidOrder.deliveries || []).length === 1, "duplicate confirmation created a second delivery");
      assert((paidOrder.escrowHolds || []).length === 1, "duplicate confirmation created a second escrow hold");
      const afterWallet = await walletSnapshot(t2.context);
      assert(
        afterWallet.availableKobo === beforeWallet.availableKobo && afterWallet.heldKobo === beforeWallet.heldKobo,
        "duplicate confirmation moved wallet funds"
      );
      return "HTTP 200 duplicate=true; no second delivery, escrow or balance movement";
    });

    await step("A14", "Order history shows the paid order for its owner", async () => {
      if (!state.checkoutOrder) throw new Blocked("no order was created");
      await t2.page.goto(`${BASE}/orders`, { waitUntil: "domcontentloaded" });
      await t2.page.getByText(state.checkoutOrder.number).first().waitFor({ state: "visible" });
      const orderArticle = t2.page
        .locator("article")
        .filter({ hasText: state.checkoutOrder.number })
        .filter({ has: t2.page.getByRole("button", { name: "Cancel order" }) })
        .first();
      await orderArticle.waitFor({ state: "visible" });
      assert(/Payment: Paid/i.test(await orderArticle.innerText()), "the order article does not show the paid payment state");
      const detail = await getJson(t2.context, `/api/orders/${state.checkoutOrder.id}`);
      assert(detail.customerId, "the order detail did not include the customer identity");
      const ownDetail = await api(t2.context, "GET", `/api/orders/${state.checkoutOrder.id}`);
      assert(ownDetail.status === 200, `the owner could not read their own order (HTTP ${ownDetail.status})`);
      const evidence = await screenshot(t2.page, "10-orders-history");
      return `order number and paid state visible; ${evidence}`;
    });

    await step("A15", "Paid order cancellation refunds the wallet", async () => {
      if (!state.checkoutOrder || !state.tester02PrePaymentWallet) {
        throw new Blocked("no paid order or pre-payment wallet snapshot is available");
      }
      await t2.page.goto(`${BASE}/orders`, { waitUntil: "domcontentloaded" });
      const target = t2.page
        .locator("article")
        .filter({ hasText: state.checkoutOrder.number })
        .filter({ has: t2.page.getByRole("button", { name: "Cancel order" }) })
        .first();
      await target.waitFor({ state: "visible" });
      t2.page.once("dialog", (dialog) => dialog.accept());
      const [cancelResponse] = await Promise.all([
        t2.page.waitForResponse(
          (response) => response.url().includes(`/api/orders/${state.checkoutOrder.id}/cancel`) && response.request().method() === "POST"
        ),
        target.getByRole("button", { name: "Cancel order" }).click()
      ]);
      const cancelBody = await cancelResponse.json().catch(() => null);
      assert(cancelResponse.status() === 200, `cancellation returned HTTP ${cancelResponse.status()}`);
      assert(cancelBody && cancelBody.cancelled === true && cancelBody.refunded === true, "the paid cancellation did not report a refund");
      await t2.page.getByText(/Order cancelled and refunded/i).first().waitFor({ state: "visible" });

      const refunded = await getJson(t2.context, `/api/orders/${state.checkoutOrder.id}`);
      assert(refunded.status === "refunded", `refunded order status is ${refunded.status}, expected refunded`);
      assert(refunded.paymentStatus === "refunded", `refunded paymentStatus is ${refunded.paymentStatus}`);
      assert(
        BigInt(refunded.refundedKobo || 0) === state.checkoutOrder.totalKobo,
        `refundedKobo ${refunded.refundedKobo} does not equal the order total ${state.checkoutOrder.totalKobo}`
      );
      const wallet = await walletSnapshot(t2.context);
      assert(wallet.availableKobo === state.tester02PrePaymentWallet.availableKobo, "the refund did not restore available funds");
      assert(wallet.heldKobo === state.tester02PrePaymentWallet.heldKobo, "the refund did not release the held funds");
      assert(
        !wallet.escrowHolds.some((hold) => hold.orderId === state.checkoutOrder.id && hold.status === "held"),
        "a held escrow row remains for the refunded order"
      );
      const evidence = await screenshot(t2.page, "11-order-refunded");
      return `full refund, wallet restored, escrow released; ${evidence}`;
    });

    await step("A16", "Duplicate cancellation/refund is refused without a second refund", async () => {
      if (!state.checkoutOrder) throw new Blocked("no order was created to cancel twice");
      const beforeWallet = await walletSnapshot(t2.context);
      const duplicate = await api(t2.context, "POST", `/api/orders/${state.checkoutOrder.id}/cancel`, {
        reason: "Duplicate cancellation probe"
      });
      assert(duplicate.status === 409, `duplicate cancellation returned HTTP ${duplicate.status}`);
      assert(
        duplicate.body && ["not_cancellable", "already_refunded", "refund_conflict"].includes(duplicate.body.code),
        `duplicate cancellation returned an unexpected code: ${String(duplicate.body && duplicate.body.code).slice(0, 80)}`
      );
      const afterWallet = await walletSnapshot(t2.context);
      assert(
        afterWallet.availableKobo === beforeWallet.availableKobo && afterWallet.heldKobo === beforeWallet.heldKobo,
        "duplicate cancellation moved wallet funds"
      );
      return `HTTP 409 ${duplicate.body.code}; wallet unchanged`;
    });

    await step("A17", "Return eligibility state is honest", async () => {
      await t2.page.goto(`${BASE}/returns`, { waitUntil: "domcontentloaded" });
      await t2.page.getByText(/No orders are ready to return/i).waitFor({ state: "visible" });
      const evidence = await screenshot(t2.page, "12-returns-empty");
      throw new Deferred(
        `No delivered/completed order exists, so a return-request case cannot be opened. The honest empty eligibility state was verified. ${evidence}`
      );
    });

    // ---------------------------------------------------------------- tester03
    t3 = await newAccountPage(browser, tester03, "tester03");
    state.baseline.tester03 = await captureBaseline(t3.context);
    state.cleanup.tester03 = { baseline: state.baseline.tester03, removedRunOwned: null };

    await step("B1", "Tester03 signs in and reaches their own account", async () => {
      await t3.page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
      assert(!t3.page.url().includes("/login"), "tester03 was redirected back to /login");
      return t3.page.url().replace(BASE, "");
    });

    let t3WalletReadable = false;
    let t3Wallet = null;
    await step("B2", "Insufficient-balance payment is refused", async () => {
      if ((state.baseline.tester03?.activeCount ?? 0) > 0) {
        throw new Blocked("tester03 has pre-existing active cart lines; this run will not delete or purchase them");
      }
      const fixture = fixtures.phone;
      const before = await getJson(t3.context, `/api/products/${fixture.id}`);
      const availableBefore = Number(before.available || 0);
      await t3.page.goto(`${BASE}/product/${fixture.slug}`, { waitUntil: "domcontentloaded" });
      await t3.page.locator('[data-testid="add-to-cart"]').click();
      await t3.page.locator('[data-testid="cart-added-notice"]').waitFor({ state: "visible" });
      const addedCart = await getJson(t3.context, "/api/cart");
      const addedLine = (addedCart.items || []).find(
        (item) => item.productId === fixture.id && !item.savedForLater && !item.variantId
      );
      if (addedLine) state.runCartItemIds.add(addedLine.id);
      await t3.page.goto(`${BASE}/checkout`, { waitUntil: "domcontentloaded" });
      await t3.page.getByLabel("Full name").fill("STAGING TESTER03");
      await t3.page.getByLabel("Phone number").fill("08030000003");
      await t3.page.getByLabel("Street address").fill("STAGING DEMO 3 Test Close");
      await t3.page.getByLabel("Apartment / landmark (optional)").fill(`RUN ${RUN_ID}`);
      await t3.page.getByLabel("City", { exact: true }).fill("Wuse");
      await t3.page.getByLabel("State", { exact: true }).fill("FCT");
      await t3.page.getByLabel("Address label").fill("Staging demo");
      const saveAddress = t3.page.getByLabel("Save this address to my account");
      if (await saveAddress.isChecked()) await saveAddress.uncheck();

      const [checkoutResponse] = await Promise.all([
        t3.page.waitForResponse(
          (response) => response.url().endsWith("/api/checkout") && response.request().method() === "POST"
        ),
        t3.page.getByRole("button", { name: /Review order and choose payment/i }).click()
      ]);
      const checkoutBody = await checkoutResponse.json().catch(() => null);
      assert(checkoutResponse.status() === 201, `tester03 checkout returned HTTP ${checkoutResponse.status()}`);
      assert(checkoutBody && checkoutBody.orders && checkoutBody.orders[0], "tester03 checkout created no order");
      const order = checkoutBody.orders[0];
      state.tester03Order = {
        id: order.orderId,
        number: order.orderNumber,
        totalKobo: BigInt(order.totalKobo)
      };
      state.tester03OrderActive = true;
      state.persistentOrders.push({
        role: "tester03",
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        purpose: "insufficient-balance refusal then unpaid cancellation"
      });

      try {
        t3Wallet = await walletSnapshot(t3.context);
        t3WalletReadable = true;
      } catch (error) {
        t3WalletReadable = false;
      }
      if (!t3WalletReadable) {
        await api(t3.context, "POST", `/api/orders/${order.orderId}/cancel`, { reason: "Journey could not verify the tester03 wallet balance" });
        const record = state.persistentOrders.find((entry) => entry.orderId === order.orderId);
        if (record) record.purpose = "unpaid order cancelled because the tester03 wallet balance could not be verified";
        state.tester03OrderActive = false;
        throw new Blocked("tester03's wallet balance could not be read, so insufficient balance cannot be proven; the unpaid order was cancelled");
      }
      if (t3Wallet.availableKobo >= state.tester03Order.totalKobo) {
        await api(t3.context, "POST", `/api/orders/${order.orderId}/cancel`, { reason: "Insufficient-balance case not reproducible" });
        const record = state.persistentOrders.find((entry) => entry.orderId === order.orderId);
        if (record) record.purpose = "unpaid order cancelled because tester03 already held test funds";
        state.tester03OrderActive = false;
        throw new Blocked(
          `tester03 already has ${t3Wallet.availableKobo} kobo (order total ${state.tester03Order.totalKobo}); the unpaid order was cancelled`
        );
      }

      const walletRadio = t3.page.locator('input[type="radio"][value="wallet"]');
      if ((await walletRadio.count()) > 0) await walletRadio.first().check();
      const payButton = t3.page.getByRole("button", { name: /^Pay from wallet$/i }).first();
      await payButton.waitFor({ state: "visible" });
      const [confirmResponse] = await Promise.all([
        t3.page.waitForResponse(
          (response) => response.url().endsWith("/api/payments/confirm") && response.request().method() === "POST"
        ),
        payButton.click()
      ]);
      const confirmBody = await confirmResponse.json().catch(() => null);
      assert(confirmResponse.status() === 402, `insufficient-balance payment returned HTTP ${confirmResponse.status()}`);
      assert(confirmBody && confirmBody.code === "insufficient_wallet", `unexpected refusal code: ${String(confirmBody && confirmBody.code)}`);
      const alert = t3.page.getByRole("alert").first();
      await alert.waitFor({ state: "visible" });
      assert(/insufficient/i.test(await alert.innerText()), "the insufficient-balance error is not visible");
      const evidence = await screenshot(t3.page, "13-insufficient-wallet");
      const pending = await getJson(t3.context, `/api/orders/${order.orderId}`);
      assert(pending.paymentStatus !== "paid", "the refused payment marked the order paid");
      const after = await getJson(t3.context, `/api/products/${fixture.id}`);
      assert(Number(after.available) === availableBefore - 1, "the unpaid order did not reserve one unit while pending");
      return `HTTP 402 insufficient_wallet; stock reserved while unpaid; ${evidence}`;
    });

    await step("B3", "Unpaid order cancellation releases the reservation", async () => {
      if (!state.tester03Order) throw new Blocked("no tester03 order was created");
      if (!state.tester03OrderActive) {
        throw new Blocked("the tester03 order was already cancelled while proving the insufficient-balance prerequisite");
      }
      const fixture = fixtures.phone;
      const beforeCancel = await getJson(t3.context, `/api/products/${fixture.id}`);
      const availableWithReservation = Number(beforeCancel.available);
      await t3.page.goto(`${BASE}/orders`, { waitUntil: "domcontentloaded" });
      const target = t3.page
        .locator("article")
        .filter({ hasText: state.tester03Order.number })
        .filter({ has: t3.page.getByRole("button", { name: "Cancel order" }) })
        .first();
      await target.waitFor({ state: "visible" });
      t3.page.once("dialog", (dialog) => dialog.accept());
      const [cancelResponse] = await Promise.all([
        t3.page.waitForResponse(
          (response) => response.url().includes(`/api/orders/${state.tester03Order.id}/cancel`) && response.request().method() === "POST"
        ),
        target.getByRole("button", { name: "Cancel order" }).click()
      ]);
      const cancelBody = await cancelResponse.json().catch(() => null);
      assert(cancelResponse.status() === 200, `unpaid cancellation returned HTTP ${cancelResponse.status()}`);
      assert(cancelBody && cancelBody.cancelled === true && cancelBody.refunded === false, "unpaid cancellation did not report stock release only");
      const cancelled = await getJson(t3.context, `/api/orders/${state.tester03Order.id}`);
      assert(cancelled.status === "cancelled", `unpaid order status is ${cancelled.status}`);
      assert(
        (cancelled.payments || []).some((payment) => payment.status === "FAILED"),
        "the pending payment attempt was not marked FAILED on cancellation"
      );
      const after = await getJson(t3.context, `/api/products/${fixture.id}`);
      assert(Number(after.available) === availableWithReservation + 1, "cancellation did not release the reserved unit");
      await t3.page.getByText(/Order cancelled and stock released/i).first().waitFor({ state: "visible" });
      state.tester03OrderActive = false;
      const evidence = await screenshot(t3.page, "14-unpaid-order-cancelled");
      return `cancelled without refund, reservation released; ${evidence}`;
    });

    await step("B4", "Tester03 cannot read tester02's order", async () => {
      if (!state.checkoutOrder) throw new Blocked("no tester02 order exists");
      const denied = await api(t3.context, "GET", `/api/orders/${state.checkoutOrder.id}`);
      assert(denied.status === 403, `cross-account order read returned HTTP ${denied.status}`);
      await t3.page.goto(`${BASE}/orders/${state.checkoutOrder.id}`, { waitUntil: "domcontentloaded" });
      await t3.page.getByRole("alert").first().waitFor({ state: "visible" });
      const bodyText = await t3.page.locator("body").innerText();
      assert(!bodyText.includes(state.checkoutOrder.number), "the cross-account order page leaked the order number");
      const evidence = await screenshot(t3.page, "15-cross-account-denied");
      return `HTTP 403 and the order number is not rendered; ${evidence}`;
    });

    // ------------------------------------------------------------ seller persona
    seller = await newAccountPage(browser, sellerPersona, "seller persona");
    await step("C1", "Seller persona sees only their own empty overview", async () => {
      const response = await seller.page.goto(`${BASE}/seller`, { waitUntil: "domcontentloaded" });
      assert(response && response.status() === 200, `seller overview returned HTTP ${response ? response.status() : "none"}`);
      await seller.page.getByText("Seller hub").first().waitFor({ state: "visible" });
      const overview = await getJson(seller.context, "/api/seller/overview");
      assert(Array.isArray(overview.products), "seller overview did not return a products array");
      assert(
        !overview.products.some((product) => String(product.slug || "").startsWith(DEMO_PREFIX)),
        "the tester02 seller persona can see demo-catalogue products"
      );
      const demoLinks = await seller.page.locator('a[href^="/product/staging-demo-"]').count();
      assert(demoLinks === 0, "the seller page renders links to demo-catalogue products");
      const evidence = await screenshot(seller.page, "16-seller-overview");
      return `no demo products in the seller projection; ${evidence}`;
    });

    await step("C2", "Seller persona cannot modify a demo product", async () => {
      if (!fixtures.variant || !fixtures.variant.id) throw new Blocked("the variant demo product is not published");
      const denied = await api(seller.context, "PATCH", `/api/seller/products/${fixtures.variant.id}`, {
        name: "STAGING DEMO — attempted takeover"
      });
      assert(denied.status === 403, `seller product update returned HTTP ${denied.status}`);
      assert(denied.body && denied.body.code === "forbidden", `unexpected seller denial code: ${String(denied.body && denied.body.code)}`);
      const unchanged = await getJson(anonContext, `/api/products/${fixtures.variant.id}`);
      assert(unchanged.name.includes("Sneakers with two options"), "the demo product name changed after the refused seller update");
      return "HTTP 403 forbidden; demo product unchanged";
    });

    await step("C3", "Seller persona cannot read the demo vendor's order", async () => {
      if (!state.checkoutOrder) throw new Blocked("no tester02 order exists");
      const denied = await api(seller.context, "GET", `/api/orders/${state.checkoutOrder.id}`);
      assert(denied.status === 403, `seller order read returned HTTP ${denied.status}`);
      return "HTTP 403 forbidden";
    });

    // ------------------------------------------------------------- non-login + mobile
    await step("D1", "Catalogue fixture actor cannot log in", async () => {
      const response = await api(anonContext, "POST", "/api/auth/login", {
        email: FIXTURE_EMAIL,
        password: "this-account-has-no-password"
      });
      assert(response.status === 401, `the passwordless fixture actor login returned HTTP ${response.status}`);
      return "HTTP 401 (passwordless account)";
    });

    mobileContext = await browser.newContext({ viewport: MOBILE, locale: "en-NG" });
    const mobilePage = await mobileContext.newPage();
    mobilePage.setDefaultTimeout(TIMEOUT_MS);
    await step("M1", "Mobile search has no horizontal overflow", async () => {
      await Promise.all([
        mobilePage.waitForResponse(
          (response) => response.url().includes("/api/products") && response.request().method() === "GET"
        ),
        mobilePage.goto(`${BASE}/naijashop/search?q=${encodeURIComponent("STAGING DEMO")}`, { waitUntil: "domcontentloaded" })
      ]);
      await mobilePage.locator(`[data-product="${DEMO_SLUGS.phone}"]`).first().waitFor({ state: "visible" });
      const metrics = await mobilePage.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      }));
      assert(
        metrics.scrollWidth <= metrics.innerWidth + 1,
        `horizontal overflow at 390x844 (${metrics.scrollWidth} > ${metrics.innerWidth})`
      );
      const evidence = await screenshot(mobilePage, "17-mobile-search");
      return `390x844, scrollWidth ${metrics.scrollWidth} <= ${metrics.innerWidth}; ${evidence}`;
    });
  } finally {
    // Remove only this run's disposable cart/saved demo lines. Orders, payments,
    // refunds, escrow and ledger rows are financial records and are retained.
    for (const [label, session] of [["tester02", t2], ["tester03", t3]]) {
      if (!session) continue;
      try {
        const removed = await cleanupRunOwned(session.context);
        state.cleanup[label] = { ...(state.cleanup[label] || {}), removedRunOwned: removed };
      } catch (error) {
        console.warn(`cleanup ${label} incomplete: ${safeDetail(error)}`);
      }
    }
    for (const context of [anonContext, t2 && t2.context, t3 && t3.context, seller && seller.context, mobileContext]) {
      if (context) await context.close().catch(() => undefined);
    }
    await browser.close().catch(() => undefined);
  }

  await finish();
}

async function finish() {
  const counts = results.reduce(
    (total, row) => {
      total[row.status] = (total[row.status] || 0) + 1;
      return total;
    },
    { PASS: 0, FAIL: 0, BLOCKED: 0, DEFERRED: 0 }
  );
  const report = {
    runId: RUN_ID,
    base: BASE_ORIGIN,
    buildId: BUILD_ID,
    health: state.health,
    executedAt: new Date().toISOString(),
    counts,
    fixtures: {
      mode: "persistent staged demonstration catalogue",
      demoProductSlugs: DEMO_SLUGS,
      note: "Persistent fixtures are prepared by scripts/staging/prepare-shop-fixtures.ts and are not removed by the journey."
    },
    runOwnedRecords: {
      note: "Only this run's cart lines and saved demo items are cleaned up. Orders/payments/refunds are financial records and are retained.",
      persistentOrders: state.persistentOrders,
      cleanup: state.cleanup
    },
    results
  };
  fs.writeFileSync(path.join(OUT_DIR, `report-${RUN_ID}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("\nRESULT " + JSON.stringify(counts));
  console.log(`Evidence ${path.relative(ROOT, OUT_DIR).replace(/\\/g, "/")}/report-${RUN_ID}.json`);
  if (counts.FAIL > 0) process.exitCode = 1;
  else if (counts.BLOCKED > 0) process.exitCode = 2;
  else process.exitCode = 0;
}

main().catch(async (error) => {
  record("FAIL", "X0", "Journey stopped unexpectedly", safeDetail(error));
  await finish();
  process.exitCode = process.exitCode || 1;
});
