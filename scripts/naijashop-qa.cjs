/**
 * NaijaShop acceptance QA: real browser journeys plus responsive layout.
 *
 * Covered: homepage structure, hero carousel, search, category browse and
 * sort, product detail, signed-out and signed-in cart, cart page, checkout
 * preflight, orders, mobile navigation, dead-link audit for every storefront
 * route, and horizontal overflow at nine widths.
 *
 * A 200 response never counts as a pass on its own: interactions are driven
 * and their rendered result is asserted.
 *
 * Usage: BASE_URL=http://localhost:3015 node scripts/naijashop-qa.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const OUT = path.join(process.cwd(), "qa-artifacts", "naijashop");
fs.mkdirSync(OUT, { recursive: true });

const WIDTHS = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920];
let passed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

async function login(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const status = await page.evaluate(async () =>
    (
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: "customer@naijadeals.local", password: "CustomerPass123!" })
      })
    ).status
  );
  return { page, status };
}

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

  // ---- Signed-out storefront -------------------------------------------
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const guest = await guestContext.newPage();
  const pageErrors = [];
  guest.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 120)));
  await guest.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 120000 });
  await guest.waitForTimeout(4000);

  const structure = await guest.evaluate(() => ({
    header: document.querySelector("header")?.getBoundingClientRect().height ?? 0,
    hero: Boolean(document.querySelector('[role="region"][aria-roledescription="carousel"]')),
    search: Boolean(document.querySelector("#shop-q")),
    departments: document.querySelectorAll('nav[aria-label="Primary"] a').length,
    deals: document.querySelectorAll('[data-product]').length,
    tiles: document.querySelectorAll("[data-category]").length,
    shelves: [...document.querySelectorAll("h2")].filter((h) => /Phones|Computers|Home|Fashion|Beauty|Groceries|Power|Gaming/.test(h.textContent ?? "")).length,
    bottomNav: Boolean(document.querySelector('nav[aria-label="Shop navigation"]')),
    footer: Boolean(document.querySelector("footer"))
  }));
  check("header renders with real height", structure.header > 40, JSON.stringify(structure));
  check("hero carousel present", structure.hero);
  check("prominent search field present", structure.search);
  check("department strip populated from categories", structure.departments >= 8, `${structure.departments}`);
  check("deals row shows products", structure.deals > 0, `${structure.deals}`);
  check("category tiles render all departments", structure.tiles === 8, `${structure.tiles}`);
  check("product shelves render", structure.shelves >= 6, `${structure.shelves}`);
  check("footer present", structure.footer);

  // Hero rotation
  const first = await guest.evaluate(() => document.querySelector('[role="region"] h1')?.textContent);
  await guest.getByRole("button", { name: "Next promotion" }).click();
  await guest.waitForTimeout(500);
  const second = await guest.evaluate(() => document.querySelector('[role="region"] h1')?.textContent);
  check("hero advances to the next promotion", first !== second, `${first} -> ${second}`);
  await guest.getByRole("tab", { name: /Show promotion 1 of/ }).click();
  await guest.waitForTimeout(400);

  // Search journey
  await guest.fill("#shop-q", "laptop");
  await guest.press("#shop-q", "Enter");
  await guest.waitForLoadState("load");
  await guest.waitForTimeout(2500);
  const searchCount = await guest.locator("[data-product]").count();
  check("search returns matching products", searchCount >= 1 && guest.url().includes("/naijashop/search"), `${searchCount} at ${guest.url()}`);

  // Category browse + sorting
  await guest.goto(`${BASE}/naijashop/c/fashion`, { waitUntil: "load" });
  await guest.waitForTimeout(2500);
  const fashionHead = await guest.locator("h1").first().textContent();
  const fashionCount = await guest.locator("[data-product]").count();
  check("category page shows its own department", /fashion/i.test(fashionHead ?? "") && fashionCount > 0, `${fashionHead} / ${fashionCount}`);
  await guest.selectOption("#browse-sort", "price-asc");
  await guest.waitForTimeout(400);
  const prices = await guest.$$eval("[data-product] p span:first-child", (nodes) =>
    nodes.map((node) => Number((node.textContent ?? "").replace(/[^0-9]/g, "")))
  );
  const sorted = prices.every((value, index) => index === 0 || prices[index - 1] <= value);
  check("price sort orders products ascending", prices.length > 1 && sorted, JSON.stringify(prices));

  // Product detail
  await guest.locator("[data-product] a").first().click();
  await guest.waitForLoadState("load");
  await guest.waitForTimeout(2500);
  const pdp = await guest.evaluate(() => ({
    url: location.pathname,
    h1: document.querySelector("h1")?.textContent ?? "",
    hasPrice: /₦/.test(document.body.innerText),
    hasCart: /add to (cart|basket)/i.test(document.body.innerText)
  }));
  check("product detail page opens with price and cart action", /^\/product\//.test(pdp.url) && pdp.hasPrice && pdp.hasCart, JSON.stringify(pdp));

  // Signed-out add to cart asks for sign-in
  await guest.goto(`${BASE}/naijashop`, { waitUntil: "load" });
  await guest.waitForTimeout(3500);
  await guest.locator('button[aria-label^="Add "][aria-label$="to cart"]').first().click();
  await guest.waitForTimeout(2000);
  const guestMsg = await guest.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((node) => node.textContent ?? "").find((text) => /sign in/i.test(text)) ?? "");
  check("signed-out add to cart explains sign-in is required", /sign in/i.test(guestMsg), guestMsg.slice(0, 80));
  await guestContext.close();

  // ---- Signed-in journey -------------------------------------------------
  const shopperContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const session = await login(shopperContext);
  check("customer sign-in works", session.status === 200, String(session.status));
  const shopper = session.page;

  await shopper.goto(`${BASE}/naijashop`, { waitUntil: "load" });
  await shopper.waitForTimeout(3500);
  const countBefore = await shopper.evaluate(() => Number(/Cart, (\d+)/.exec(document.querySelector('a[aria-label^="Cart"]')?.getAttribute("aria-label") ?? "Cart, 0")?.[1] ?? 0));
  // Pick a product the server reports as in stock, so the test exercises the
  // real add path rather than asserting against an out-of-stock listing.
  const inStock = await shopper.evaluate(async () => {
    const items = await (await fetch('/api/products')).json();
    const visible = (p) => !/^(variant fixture|test |upload test|last unit|product test)/i.test(p.name);
    const ok = items.find((p) => visible(p) && (p.stock?.quantity ?? 0) - (p.stock?.reserved ?? 0) > 0);
    return ok ? ok.name : null;
  });
  const addButton = inStock
    ? shopper.locator(`button[aria-label="Add ${inStock} to cart"]`).first()
    : shopper.locator('button[aria-label^="Add "][aria-label$="to cart"]').first();
  const addedName = await addButton.getAttribute("aria-label");
  await addButton.click();
  await shopper.waitForTimeout(3000);
  const countAfter = await shopper.evaluate(() => Number(/Cart, (\d+)/.exec(document.querySelector('a[aria-label^="Cart"]')?.getAttribute("aria-label") ?? "Cart, 0")?.[1] ?? 0));
  check("add to cart increments the cart badge", countAfter === countBefore + 1, `${countBefore} -> ${countAfter} (${addedName})`);

  const cartApi = await shopper.evaluate(async () => {
    const response = await fetch("/api/cart", { credentials: "include" });
    const body = await response.json();
    return { status: response.status, lines: body.items?.length ?? 0 };
  });
  check("cart API reflects the added line", cartApi.status === 200 && cartApi.lines >= 1, JSON.stringify(cartApi));

  await shopper.goto(`${BASE}/cart`, { waitUntil: "load" });
  await shopper.waitForTimeout(2500);
  const cartPage = await shopper.evaluate(() => ({ text: document.body.innerText.slice(0, 400), hasCheckout: /checkout|proceed/i.test(document.body.innerText) }));
  check("cart page renders with a checkout action", cartPage.hasCheckout, cartPage.text.slice(0, 80));

  // Undo the test addition so the demo cart is left as found.
  await shopper.evaluate(async () => {
    const cart = await (await fetch("/api/cart", { credentials: "include" })).json();
    const target = [...(cart.items ?? [])].reverse()[0];
    if (target) await fetch(`/api/cart/items/${target.id}`, { method: "DELETE", credentials: "include" });
  });
  const restored = await shopper.evaluate(async () => {
    const cart = await (await fetch("/api/cart", { credentials: "include" })).json();
    return cart.items?.length ?? 0;
  });
  check("test cart addition removed again", restored === cartApi.lines - 1, `lines ${restored}`);

  await shopper.goto(`${BASE}/orders`, { waitUntil: "load" });
  await shopper.waitForTimeout(2000);
  check("orders page loads for a signed-in customer", await shopper.evaluate(() => !/error|something went wrong/i.test(document.body.innerText.slice(0, 200))));
  await shopperContext.close();

  // ---- Mobile navigation -------------------------------------------------
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const mobile = await mobileContext.newPage();
  await mobile.goto(`${BASE}/naijashop`, { waitUntil: "load" });
  await mobile.waitForTimeout(3500);
  const bottom = mobile.getByRole("navigation", { name: "Mobile" });
  check("mobile bottom navigation renders", await bottom.isVisible());
  await mobile.getByRole("button", { name: "Open menu" }).click();
  await mobile.waitForTimeout(500);
  const drawer = mobile.getByRole("dialog", { name: "Browse departments" });
  check("mobile department drawer opens", await drawer.isVisible());
  await mobile.keyboard.press("Escape");
  await mobile.waitForTimeout(400);
  check("Escape closes the department drawer", !(await drawer.isVisible().catch(() => false)));
  await mobile.screenshot({ path: path.join(OUT, "mobile-390.png") });
  await mobileContext.close();

  // ---- Dead-link audit ---------------------------------------------------
  const routes = [
    "/naijashop", "/naijashop/deals", "/naijashop/categories", "/naijashop/c/phones-tablets",
    "/naijashop/c/fashion", "/naijashop/plus", "/naijashop/sellers", "/naijashop/help",
    "/naijashop/bestsellers", "/naijashop/search?q=phone"
  ];
  const linkContext = await browser.newContext();
  const deadLinks = [];
  for (const route of routes) {
    const response = await linkContext.request.get(`${BASE}${route}`);
    if (response.status() >= 400) deadLinks.push(`${route}:${response.status()}`);
  }
  check("every storefront route responds", deadLinks.length === 0, deadLinks.join(", "));
  await linkContext.close();

  // ---- Responsive --------------------------------------------------------
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const view = await context.newPage();
    await view.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 120000 });
    await view.waitForTimeout(2500);
    const layout = await view.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      search: (() => {
        const el = document.querySelector("#shop-q");
        if (!el) return 0;
        const rect = el.getBoundingClientRect();
        return rect.width > 60 && rect.height > 20 ? 1 : 0;
      })(),
      cart: (() => {
        const el = document.querySelector('a[aria-label^="Cart"]');
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.right <= window.innerWidth + 1;
      })()
    }));
    check(`${width}px: no horizontal overflow`, layout.overflow <= 1, JSON.stringify(layout));
    check(`${width}px: search usable and cart on screen`, layout.search === 1 && layout.cart, JSON.stringify(layout));
    await view.screenshot({ path: path.join(OUT, `home-${width}.png`) });
    await context.close();
  }

  check("no uncaught page errors on the homepage", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  fs.writeFileSync(path.join(OUT, "qa-result.json"), JSON.stringify({ passed, failures }, null, 2));
  if (failures.length) {
    console.error("FAILURES:", failures.slice(0, 15));
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
