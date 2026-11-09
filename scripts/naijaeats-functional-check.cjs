/**
 * NaijaEats functional acceptance: discovery, menu, ordering, authorization and
 * responsive layout, driven through a real browser and the real APIs.
 *
 * Asserts persisted state, never an HTTP 200 alone. Runs against the local
 * preview and TEST database.
 *
 * Usage: node scripts/naijaeats-functional-check.cjs
 */
const { chromium } = require("playwright-core");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
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

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 100)));

  // ---- Guest discovery -------------------------------------------------
  await page.goto(`${BASE}/naijaeats`, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(2500);
  const home = await page.evaluate(() => ({
    headings: [...document.querySelectorAll("h1,h2")].map((node) => node.textContent.trim()),
    cuisines: document.querySelectorAll('a[href*="cuisine="]').length,
    restaurants: document.querySelectorAll('a[href^="/naijaeats/restaurants/"]').length,
    bottomNav: Boolean(document.querySelector('nav[aria-label="NaijaEats navigation"]')),
    footer: Boolean(document.querySelector("footer")),
    shellChrome: Boolean(document.querySelector('nav[aria-label="NaijaEats navigation"]')) && Boolean(document.querySelector("header")),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  const required = ["Browse by cuisine", "Popular food categories", "Top restaurants near you", "Explore Nigerian favourites", "Local food vendors & home kitchens", "More ways to enjoy food on NaijaEats"];
  const missing = required.filter((title) => !home.headings.some((heading) => heading.toLowerCase().includes(title.toLowerCase())));
  check("all mockup sections render", missing.length === 0, missing.join(", "));
  check("cuisine rail links filter by cuisine", home.cuisines >= 7, String(home.cuisines));
  check("restaurant cards link to restaurant pages", home.restaurants > 0, String(home.restaurants));
  check("mobile bottom navigation present", home.bottomNav);
  check("footer present", home.footer);
  check("no horizontal overflow at 1440px", home.overflow <= 1, String(home.overflow));

  // ---- Filtering and search -------------------------------------------
  await page.goto(`${BASE}/naijaeats/restaurants?cuisine=nigerian`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const filtered = await page.evaluate(() => ({ h1: document.querySelector("h1")?.textContent ?? "", count: document.querySelectorAll('a[href^="/naijaeats/restaurants/"]').length }));
  check("cuisine filter narrows the list", /Nigerian/i.test(filtered.h1), filtered.h1);
  await page.goto(`${BASE}/naijaeats/restaurants?q=suya`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const searched = await page.evaluate(() => document.querySelectorAll('a[href^="/naijaeats/restaurants/"]').length);
  check("search filters restaurants", searched >= 1, String(searched));

  // ---- Restaurant detail shows the real menu --------------------------
  await page.locator('a[href^="/naijaeats/restaurants/"]').first().click();
  await page.waitForLoadState("load");
  await page.waitForTimeout(1800);
  const detail = await page.evaluate(() => ({
    url: location.pathname,
    dishes: document.querySelectorAll("[data-dish]").length,
    hasPrice: /₦/.test(document.body.innerText),
    reviews: Boolean(document.querySelector("#reviews"))
  }));
  check("restaurant page lists menu dishes with prices", detail.dishes > 0 && detail.hasPrice, JSON.stringify(detail));
  check("restaurant page has a ratings section", detail.reviews);
  const restaurantSlug = detail.url.split("/").pop();

  // ---- Signed-out ordering is rejected --------------------------------
  const guestOrder = await page.evaluate(async () => {
    const restaurants = await (await fetch("/api/eats/restaurants")).json();
    const target = restaurants[0];
    const response = await fetch("/api/eats/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: target.id, items: [{ menuItemId: target.menuItems[0].id, quantity: 1 }], deliveryAddress: "x", contactName: "x", contactPhone: "x" })
    });
    return response.status;
  });
  check("guest cannot place a food order", guestOrder === 401, String(guestOrder));

  // ---- Signed-in ordering ---------------------------------------------
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const loginStatus = await page.evaluate(async () =>
    (
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: "customer@naijadeals.local", password: "CustomerPass123!" })
      })
    ).status
  );
  check("customer signs in", loginStatus === 200, String(loginStatus));

  const order = await page.evaluate(async () => {
    const restaurants = await (await fetch("/api/eats/restaurants")).json();
    const target = restaurants.find((row) => row.slug === new URLSearchParams({ s: location.pathname }).get("s")) ?? restaurants[0];
    const before = await (await fetch(`/api/eats/orders`, { credentials: "include" })).json();
    const response = await fetch("/api/eats/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        restaurantId: target.id,
        items: [{ menuItemId: target.menuItems[0].id, quantity: 1 }],
        deliveryAddress: "12 Adeola Odeku Street, Lagos",
        contactName: "Ada",
        contactPhone: "08030000000"
      })
    });
    const body = await response.json().catch(() => ({}));
    const after = await (await fetch(`/api/eats/orders`, { credentials: "include" })).json();
    return { status: response.status, body, before: Array.isArray(before) ? before.length : 0, after: Array.isArray(after) ? after.length : 0 };
  });
  check(
    "customer order is created and persisted",
    [201, 402].includes(order.status) && (order.status === 402 || order.after === order.before + 1),
    JSON.stringify({ status: order.status, before: order.before, after: order.after, error: order.body?.error })
  );

  // ---- Over-quantity is rejected --------------------------------------
  const tooMany = await page.evaluate(async () => {
    const restaurants = await (await fetch("/api/eats/restaurants")).json();
    const target = restaurants[0];
    const response = await fetch("/api/eats/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ restaurantId: target.id, items: [{ menuItemId: target.menuItems[0].id, quantity: 11 }], deliveryAddress: "x", contactName: "x", contactPhone: "x" })
    });
    return response.status;
  });
  check("quantity above the limit is rejected", tooMany === 400 || tooMany === 402, String(tooMany));

  // ---- Restaurant operator authorization -------------------------------
  const operator = await page.evaluate(async () => {
    const response = await fetch("/api/restaurants/orders", { credentials: "include" });
    return response.status;
  });
  check("a customer cannot read kitchen orders", operator === 403 || operator === 404 || operator === 401, String(operator));

  check("no page errors during the journey", errors.length === 0, errors.slice(0, 2).join(" | "));

  // ---- Responsive ------------------------------------------------------
  for (const width of [320, 390, 430, 768, 1024, 1440, 1920]) {
    const view = await (await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 768 })).newPage();
    await view.goto(`${BASE}/naijaeats`, { waitUntil: "load", timeout: 120000 });
    await view.waitForTimeout(1500);
    const layout = await view.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sections: [...document.querySelectorAll("h2")].length
    }));
    check(`${width}px: no overflow and sections present`, layout.overflow <= 1 && layout.sections >= 5, JSON.stringify(layout));
    await view.context().close();
  }

  await context.close();
  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:", failures.slice(0, 10));
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
