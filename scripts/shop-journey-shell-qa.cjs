/**
 * Marketplace shell and journey acceptance probe.
 *
 * Drives the real Shop routes against a production build:
 *   shop -> search -> product -> cart -> checkout
 *   department -> product -> cart
 *   signed-out cart -> sign in -> return to cart with the basket intact
 *   orders -> order detail -> back
 *   saved address / browsing city behaviour
 *
 * It fails on duplicate legacy chrome, missing Shop shell, lost search scope,
 * lost basket contents or wrong location labels, and captures screenshots for
 * visual inspection. Consequential actions (payment, cancel, return, confirm
 * delivery) are inspected for presence but never executed.
 *
 * Usage: QA_BASE_URL=http://localhost:3141 node scripts/shop-journey-shell-qa.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3141";
const OUT = path.join(process.cwd(), "qa-artifacts", "shop-journey-shell");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const EMAIL = "customer@naijadeals.local";
const PASSWORD = "CustomerPass123!";
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const evidence = { base: BASE, startedAt: new Date().toISOString(), screenshots: [] };

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function screenshot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  evidence.screenshots.push(path.relative(process.cwd(), file).replaceAll("\\", "/"));
}

async function shellState(page) {
  return page.evaluate(() => {
    const text = (node) => node?.innerText.replace(/\s+/g, " ").trim() ?? "";
    const location = [...document.querySelectorAll("[data-shop-header] button")].find((node) =>
      (node.getAttribute("aria-label") ?? "").toLowerCase().includes("delivery location")
    );
    return {
      shopHeaders: document.querySelectorAll("[data-shop-header]").length,
      shopShells: document.querySelectorAll("[data-shop-shell]").length,
      shopMains: document.querySelectorAll("main#shop-main").length,
      headers: document.querySelectorAll("header").length,
      footers: document.querySelectorAll("footer").length,
      legacyMain: document.querySelectorAll("#main-content").length,
      legacyBottomNav: document.querySelectorAll('nav[aria-label="Mobile"]').length,
      legacySidebar: document.querySelectorAll("aside.fixed").length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      locationText: text(location),
      locationAria: location?.getAttribute("aria-label") ?? "",
      cartAria: document.querySelector('a[aria-label^="Cart,"]')?.getAttribute("aria-label") ?? ""
    };
  });
}

async function assertShell(page, label) {
  const state = await shellState(page);
  record(
    `${label}: exactly one Marketplace shell/header/main`,
    state.shopHeaders === 1 && state.shopShells === 1 && state.shopMains === 1,
    JSON.stringify({ headers: state.shopHeaders, shells: state.shopShells, mains: state.shopMains })
  );
  record(
    `${label}: legacy ecosystem chrome absent`,
    state.legacyMain === 0 && state.legacyBottomNav === 0 && state.legacySidebar === 0,
    JSON.stringify({ main: state.legacyMain, bottomNav: state.legacyBottomNav, aside: state.legacySidebar })
  );
  record(`${label}: no horizontal overflow`, state.scrollWidth - state.clientWidth <= 1, `${state.scrollWidth - state.clientWidth}px`);
  return state;
}

async function login(context) {
  const response = await context.request.post(`${BASE}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
    headers: { Origin: BASE }
  });
  record("auth fixture: customer signs in", response.ok(), String(response.status()));
  return response.ok();
}

async function cartSnapshot(context) {
  const response = await context.request.get(`${BASE}/api/cart`);
  if (!response.ok()) return { itemIds: [], active: 0 };
  const cart = await response.json();
  const items = Array.isArray(cart.items) ? cart.items : [];
  return {
    itemIds: items.map((item) => item.id),
    active: items.filter((item) => !item.savedForLater).reduce((sum, item) => sum + item.quantity, 0)
  };
}

async function createAddress(context) {
  const response = await context.request.post(`${BASE}/api/account/addresses`, {
    data: {
      label: "QA shell journey",
      countryCode: "NG",
      state: "Lagos",
      city: "Ikeja",
      line1: "1 QA Shell Street",
      phone: "08030000000",
      isDefault: true
    },
    headers: { Origin: BASE }
  });
  const body = await response.json().catch(() => null);
  record("saved-address fixture: address created", response.ok() && Boolean(body?.id), String(response.status()));
  return body?.id ?? null;
}

async function otherCustomerOrderId() {
  try {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    const row = await prisma.order.findFirst({
      where: { customer: { email: { not: EMAIL } } },
      select: { id: true, orderNumber: true }
    });
    await prisma.$disconnect();
    return row;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function browseJourney(browser, width) {
  const height = width < 768 ? 844 : 1000;
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 768,
    hasTouch: width < 768,
    deviceScaleFactor: width < 768 ? 2 : 1
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 200)));
  try {
    // Guest with no chosen location.
    await page.goto(`${BASE}/naijashop`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(600);
    const landing = await assertShell(page, `${width}px landing`);
    record(
      `${width}px guest: unknown location asks for a delivery location`,
      /choose delivery location/i.test(landing.locationText),
      landing.locationAria
    );
    const cookies = await context.cookies();
    record(`${width}px guest: browsing does not write a city`, !cookies.some((cookie) => cookie.name === "nd_city"));
    await screenshot(page, `landing-${width}`);

    // The one Shop search field drives the canonical browse results.
    await page.fill("#shop-search-input", "mouse");
    await page.press("#shop-search-input", "Enter");
    await page.waitForURL(/\/naijashop\/search\?q=mouse/, { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1000);
    record(`${width}px header search: submits to Shop results`, page.url().includes("/naijashop/search?q=mouse"), page.url());
    record(`${width}px header search: shell stays single`, (await shellState(page)).shopHeaders === 1);
    record(`${width}px header search: results render`, (await page.locator('a[href^="/product/"]').count()) > 0);
    await screenshot(page, `shop-search-${width}`);

    // Department -> product -> back.
    await page.goto(`${BASE}/naijashop/c/phones-tablets`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(900);
    await assertShell(page, `${width}px department`);
    const productLinks = page.locator('a[href^="/product/"]');
    const productCount = await productLinks.count();
    record(`${width}px department: products are listed`, productCount > 0, `${productCount} product links`);
    await screenshot(page, `department-${width}`);
    if (productCount > 0) {
      const productHref = await productLinks.first().getAttribute("href");
      await productLinks.first().click();
      await page.waitForURL(/\/product\//, { timeout: 30000 });
      await page.waitForTimeout(600);
      record(`${width}px product: detail loads the chosen product`, page.url().includes(productHref ?? "/product/"), page.url());
      await screenshot(page, `product-${width}`);
      await page.goBack({ waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      record(`${width}px browser back: returns to the department`, page.url().includes("/naijashop/c/phones-tablets"), page.url());
    }

    // Search scope survives refresh and back.
    await page.goto(`${BASE}/search?q=mouse`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(900);
    const search = await assertShell(page, `${width}px search`);
    record(`${width}px search: shared field carries the query`, (await page.locator("#shop-search-input").inputValue()) === "mouse");
    const resultRows = page.locator('button:has-text("Add to cart")');
    record(`${width}px search: results render`, (await resultRows.count()) > 0, `${await resultRows.count()} rows`);
    record(
      `${width}px search: no hardcoded Lagos delivery claim`,
      !(await page.locator("body").innerText()).includes("Delivery to Lagos")
    );
    await screenshot(page, `search-${width}`);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    record(`${width}px search refresh: query kept`, (await page.locator("#shop-search-input").inputValue()) === "mouse", page.url());
    record(`${width}px search refresh: shell intact`, (await shellState(page)).shopHeaders === 1);
    await screenshot(page, `search-refresh-${width}`);

    await page.goto(`${BASE}/search?q=zzzznotfound`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(900);
    record(
      `${width}px search empty state: no-results message is real`,
      (await page.locator("body").innerText()).includes("No products matched your filters")
    );
    await screenshot(page, `search-empty-${width}`);

    await page.goto(`${BASE}/naijashop/help`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(500);
    await assertShell(page, `${width}px support help`);

    // Guest is sent to sign in from the cart and returns to the cart.
    await page.goto(`${BASE}/cart`, { waitUntil: "networkidle", timeout: 120000 });
    record(`${width}px guest cart: redirected to sign in with next`, page.url().includes("/login") && /next=/.test(page.url()), page.url());

    record(`${width}px: no uncaught page errors`, pageErrors.length === 0, pageErrors.join(" | "));
  } finally {
    await context.close();
  }
}

async function signedInJourney(browser, width) {
  const height = width < 768 ? 844 : 1000;
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 768,
    hasTouch: width < 768,
    deviceScaleFactor: width < 768 ? 2 : 1
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 200)));
  let addressId = null;
  let baselineItemIds = [];
  try {
    if (!(await login(context))) return;
    addressId = await createAddress(context);
    baselineItemIds = (await cartSnapshot(context)).itemIds;
    const startingItemIds = new Set(baselineItemIds);
    if ((await cartSnapshot(context)).active === 0) {
      await page.goto(`${BASE}/cart`, { waitUntil: "networkidle", timeout: 120000 });
      await page.waitForTimeout(800);
      await assertShell(page, `${width}px empty cart`);
      record(
        `${width}px cart empty state: honest empty state without dead checkout control`,
        (await page.locator("body").innerText()).includes("Your cart is empty") &&
          (await page.getByRole("button", { name: /Proceed to checkout/i }).count()) === 0
      );
      await screenshot(page, `cart-empty-${width}`);
    }

    // Known location: chosen browsing city is visible to a guest.
    await page.goto(`${BASE}/naijashop`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(900);
    const known = await assertShell(page, `${width}px signed-in shop`);
    record(
      `${width}px signed-in: saved address is shown, not Lagos-by-default`,
      /Ikeja, Lagos/.test(known.locationText) && !/choose delivery location/i.test(known.locationText),
      known.locationText
    );
    const cookieBefore = await context.cookies();
    record(`${width}px signed-in: no browsing city overwrites the saved address`, !cookieBefore.some((cookie) => cookie.name === "nd_city"));
    await screenshot(page, `signed-in-landing-${width}`);

    // Shop -> shared search -> product detail -> add to cart.
    await page.fill("#shop-search-input", "mouse");
    await page.press("#shop-search-input", "Enter");
    await page.waitForURL(/\/naijashop\/search\?q=mouse/, { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1000);
    record(`${width}px journey: Shop search opens results`, page.url().includes("/naijashop/search?q=mouse"), page.url());
    const productLink = page.locator('a[href^="/product/"]').first();
    record(`${width}px journey: search results link to products`, (await productLink.count()) > 0);
    if (await productLink.count()) {
      await productLink.click();
      await page.waitForURL(/\/product\//, { timeout: 30000 });
      await page.waitForTimeout(700);
      const addOnProduct = page.locator('[data-testid="add-to-cart"]');
      record(`${width}px journey: product detail offers add to cart`, await addOnProduct.isVisible().catch(() => false));
      if (await addOnProduct.isVisible().catch(() => false)) {
        await addOnProduct.click();
        await page.waitForTimeout(1000);
      }
      await screenshot(page, `journey-product-${width}`);
      await page.goBack({ waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      record(
        `${width}px browser back: returns to the Shop search results`,
        page.url().includes("/naijashop/search") && (await page.locator("#shop-search-input").inputValue()) === "mouse",
        page.url()
      );
    }

    // Search -> add to cart from a live result row.
    await page.goto(`${BASE}/search?q=mouse`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(900);
    await assertShell(page, `${width}px signed-in search`);
    const addButton = page.locator('button:has-text("Add to cart")').first();
    record(`${width}px search: add-to-cart control present`, (await addButton.isVisible().catch(() => false)) === true);
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
      await page.waitForTimeout(1200);
    }
    const afterAdd = await cartSnapshot(context);
    record(`${width}px cart: item was added`, afterAdd.active > 0, `active=${afterAdd.active}`);
    const headerAfterAdd = await shellState(page);
    record(
      `${width}px cart badge: header reflects the authoritative total`,
      headerAfterAdd.cartAria.includes(String(afterAdd.active)),
      headerAfterAdd.cartAria
    );
    await screenshot(page, `search-added-${width}`);

    // Cart page.
    await page.goto(`${BASE}/cart`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(900);
    await assertShell(page, `${width}px cart`);
    record(`${width}px cart: line item rendered`, (await page.locator("article").count()) > 0);
    const cartText = await page.locator("body").innerText();
    record(`${width}px cart: no hardcoded Lagos delivery claim`, !/Delivery to Lagos/.test(cartText));
    await screenshot(page, `cart-${width}`);
    const plus = page.getByRole("button", { name: "Increase quantity" }).first();
    if (await plus.isVisible().catch(() => false)) {
      const before = (await cartSnapshot(context)).active;
      await plus.click();
      await page.waitForTimeout(900);
      const after = (await cartSnapshot(context)).active;
      record(`${width}px cart: quantity update persists on the server`, after > before, `${before} -> ${after}`);
      record(
        `${width}px cart: header badge follows quantity`,
        (await shellState(page)).cartAria.includes(String(after)),
        (await shellState(page)).cartAria
      );
    }

    // Checkout via the cart's own control, then saved address and validation.
    await page.getByRole("link", { name: "Proceed to checkout" }).click();
    await page.waitForURL(/\/checkout/, { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1100);
    record(`${width}px journey: cart proceeds to checkout`, page.url().includes("/checkout"), page.url());
    await assertShell(page, `${width}px checkout`);
    record(`${width}px checkout: no Lagos/Ikeja default prefilled`, (await page.getByLabel("City").inputValue()) === "" && (await page.getByLabel("State").inputValue()) === "");
    const savedSection = page.getByRole("heading", { name: "Saved delivery addresses" });
    const savedVisible = await savedSection.isVisible().catch(() => false);
    record(`${width}px checkout: saved-address source is offered`, savedVisible);
    await screenshot(page, `checkout-${width}`);
    if (savedVisible) {
      await page.getByRole("button", { name: /QA shell journey/i }).first().click();
      await page.waitForTimeout(400);
      record(
        `${width}px checkout: saved address fills the form without being edited`,
        (await page.getByLabel("City").inputValue()) === "Ikeja" && (await page.getByLabel("State").inputValue()) === "Lagos"
      );
      const after = await context.request.get(`${BASE}/api/account/addresses`);
      const list = await after.json().catch(() => []);
      record(
        `${width}px checkout: saved address unchanged after choosing it`,
        Array.isArray(list) && list.filter((row) => row.id === addressId && row.city === "Ikeja" && row.state === "Lagos").length === 1,
        JSON.stringify(Array.isArray(list) ? list.map((row) => `${row.id}:${row.city}`) : list)
      );
      const valid = await page.evaluate(() => {
        const form = [...document.querySelectorAll("form")].find((node) =>
          node.querySelector('input[placeholder="Delivery city"]')
        );
        return form ? form.checkValidity() : false;
      });
      record(`${width}px checkout: filled form is valid`, valid === true);
      await page.getByLabel("City").fill("");
      const invalid = await page.evaluate(() => {
        const form = [...document.querySelectorAll("form")].find((node) =>
          node.querySelector('input[placeholder="Delivery city"]')
        );
        return form ? form.checkValidity() : false;
      });
      record(`${width}px checkout: missing city fails validation without submitting`, invalid === false);
      await page.getByLabel("City").fill("Ikeja");
      await screenshot(page, `checkout-address-${width}`);
    }

    // Orders -> detail -> back, and read-only ownership rejection.
    await page.goto(`${BASE}/orders`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(900);
    await assertShell(page, `${width}px orders`);
    const detailLinks = page.locator('a[href^="/orders/"]');
    const detailCount = await detailLinks.count();
    record(`${width}px orders: order detail links render`, detailCount > 0, `${detailCount} links`);
    const actionText = await page.locator("body").innerText();
    record(`${width}px orders: status-appropriate actions are present`,
      /Cancel order|Confirm delivery|Request return|Review /.test(actionText)
    );
    record(`${width}px orders: fabricated "Delivered today" label is absent`, !/Delivered today/.test(actionText));
    await screenshot(page, `orders-${width}`);
    if (detailCount > 0) {
      const href = await detailLinks.first().getAttribute("href");
      await detailLinks.first().click();
      await page.waitForURL(/\/orders\//, { timeout: 30000 });
      await page.waitForTimeout(900);
      await assertShell(page, `${width}px order detail`);
      record(`${width}px order detail: order number heading`, /Order ND-/.test(await page.locator("h1").first().innerText()));
      await screenshot(page, `order-detail-${width}`);
      await page.goBack({ waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      record(`${width}px browser back: returns to orders`, page.url().endsWith("/orders"), page.url());
      void href;
    }

    await page.goto(`${BASE}/returns`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(800);
    await assertShell(page, `${width}px returns`);
    record(`${width}px returns: returns view renders under the Shop shell`, /Returns & Orders/i.test(await page.locator("h1").first().innerText()));
    await screenshot(page, `returns-${width}`);

    const other = await otherCustomerOrderId();
    if (other?.id) {
      await page.goto(`${BASE}/orders/${other.id}`, { waitUntil: "networkidle", timeout: 120000 });
      await page.waitForTimeout(1100);
      const forbidden = page
        .getByRole("alert")
        .filter({ hasText: /do not have access|not found/i })
        .first();
      const visible = await forbidden.isVisible().catch(() => false);
      const text = await forbidden.innerText().catch(() => "");
      record(
        `${width}px order ownership: another customer's order is rejected`,
        visible && /do not have access|not found/i.test(text),
        text
      );
      await screenshot(page, `order-forbidden-${width}`);
    }

    // Tracking from the customer's own order data.
    const ordersResponse = await context.request.get(`${BASE}/api/orders`);
    const orders = await ordersResponse.json().catch(() => []);
    const tracked = Array.isArray(orders)
      ? orders.find((order) => Array.isArray(order.deliveries) && order.deliveries.length > 0)
      : null;
    if (tracked) {
      const delivery = tracked.deliveries[0];
      await page.goto(`${BASE}/tracking/${delivery.id}`, { waitUntil: "networkidle", timeout: 120000 });
      await page.waitForTimeout(900);
      await assertShell(page, `${width}px tracking`);
      record(`${width}px tracking: events/timeline rendered`, (await page.locator("ol li").count()) > 0);
      await screenshot(page, `tracking-${width}`);
    } else {
      record(`${width}px tracking: SKIPPED - fixture customer has no delivery`, false, "no delivered order");
    }

    // Signed-out cart -> sign-in -> return with basket intact.
    await context.request.post(`${BASE}/api/auth/logout`, { headers: { Origin: BASE } });
    await page.goto(`${BASE}/cart`, { waitUntil: "networkidle", timeout: 120000 });
    record(`${width}px signed-out cart: login next points at cart`, page.url().includes("/login") && /next=/.test(page.url()), page.url());
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/cart/, { timeout: 30000 }).catch(() => undefined);
    await page.waitForTimeout(1100);
    const restored = await cartSnapshot(context);
    record(
      `${width}px sign-in: returns to the cart with the basket intact`,
      page.url().includes("/cart") && restored.active > 0,
      `${page.url()} active=${restored.active}`
    );
    await screenshot(page, `cart-after-signin-${width}`);

    record(`${width}px signed-in: no uncaught page errors`, pageErrors.length === 0, pageErrors.join(" | "));

    // Remove only the items this run added; saved address removed below.
    const finalCart = await cartSnapshot(context);
    for (const id of finalCart.itemIds) {
      if (!startingItemIds.has(id)) {
        await context.request.delete(`${BASE}/api/cart/items/${id}`, { headers: { Origin: BASE } }).catch(() => undefined);
      }
    }
  } finally {
    if (addressId) {
      await context.request.delete(`${BASE}/api/account/addresses/${addressId}`, { headers: { Origin: BASE } }).catch(() => undefined);
    }
    await context.close();
  }
}

async function knownLocationJourney(browser, width) {
  const height = width < 768 ? 844 : 1000;
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 768,
    hasTouch: width < 768,
    deviceScaleFactor: width < 768 ? 2 : 1
  });
  await context.addCookies([{ name: "nd_city", value: "Abuja", domain: "localhost", path: "/" }]);
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/naijashop`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(800);
    const landing = await assertShell(page, `${width}px known location`);
    record(
      `${width}px guest known city: header shows the chosen browsing city`,
      /abuja/i.test(landing.locationText) && /Deliver to Abuja/i.test(landing.locationAria),
      landing.locationAria
    );
    await screenshot(page, `known-location-${width}`);
    await page.goto(`${BASE}/search?q=mouse`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(800);
    const search = await shellState(page);
    record(`${width}px known city: browsing city persists across Shop routes`, /abuja/i.test(search.locationText), search.locationText);
    record(`${width}px known city: no delivery address is invented`, !/Lagos/.test(search.locationAria), search.locationAria);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    for (const width of [390, 1440]) {
      await browseJourney(browser, width);
      await signedInJourney(browser, width);
      await knownLocationJourney(browser, width);
    }
  } finally {
    await browser.close();
    const failed = results.filter((result) => !result.ok);
    evidence.finishedAt = new Date().toISOString();
    evidence.results = results;
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(evidence, null, 2));
    console.log(`\n${results.length - failed.length}/${results.length} checks passed; ${failed.length} failed.`);
    if (failed.length > 0) process.exitCode = 1;
  }
})();
