/**
 * NaijaShop mobile layout acceptance.
 *
 * Locks in the two corrections the owner reported:
 *  A. the header adapts to every phone width — menu, logo, delivery, account and
 *     cart on one line, search on its own line, departments in a swipeable strip;
 *  B. the three promotional banners stay in ONE horizontal, swipeable track
 *     below md and become three columns from md up — never a vertical stack.
 * Also checks the mobile Shop by Category grid shows all eight categories.
 *
 * Usage: BASE_URL=http://localhost:3015 node scripts/naijashop-mobile-qa.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const OUT = path.join(process.cwd(), "qa-artifacts", "naijashop", "mobile-fix");
fs.mkdirSync(OUT, { recursive: true });

const PHONES = [320, 360, 375, 390, 412, 430, 600];
const TABLETS = [768, 1024];
const DESKTOP = [1440];

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

  const measure = async (width, height) => {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768, deviceScaleFactor: width < 768 ? 2 : 1 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error).slice(0, 100)));
    await page.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(2500);
    const result = await page.evaluate(() => {
      const header = document.querySelector("header");
      const row = header?.querySelector("div");
      const rectOf = (node) => {
        const box = node.getBoundingClientRect();
        return { top: Math.round(box.top), left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width), height: Math.round(box.height) };
      };
      // The whole control (input + submit button) is what must fit the viewport.
      const search = document.querySelector('form[action="/naijashop/search"]');
      const cart = document.querySelector('a[aria-label^="Cart"]');
      const account = document.querySelector('a[aria-label="Account"]');
      const menu = document.querySelector('header button[aria-label="Open menu"]');
      const promo = document.querySelector('section[aria-label="Promotions"]');
      const promoChildren = promo ? [...promo.children].map((child) => Math.round(child.getBoundingClientRect().top)) : [];
      const deptNav = document.querySelector('nav[aria-label="Primary"]');
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        rowWrap: row ? getComputedStyle(row).flexWrap : null,
        search: search ? rectOf(search) : null,
        cart: cart ? rectOf(cart) : null,
        account: account ? rectOf(account) : null,
        menu: menu ? rectOf(menu) : null,
        headerTop: header ? Math.round(header.getBoundingClientRect().top) : null,
        promoRows: new Set(promoChildren).size,
        promoScrollable: promo ? promo.scrollWidth > promo.clientWidth + 2 : null,
        promoOverflowX: promo ? getComputedStyle(promo).overflowX : null,
        deptScrollable: deptNav ? deptNav.scrollWidth >= deptNav.clientWidth : null,
        deptSingleRow: deptNav ? Math.max(...[...deptNav.querySelectorAll("a,button")].map((n) => Math.round(n.getBoundingClientRect().top))) - Math.min(...[...deptNav.querySelectorAll("a,button")].map((n) => Math.round(n.getBoundingClientRect().top))) < 40 : null,
        categories: document.querySelectorAll("[data-category]").length,
        categoryImages: [...document.querySelectorAll("[data-category] img")].filter((img) => img.naturalWidth > 0).length
      };
    });
    await page.screenshot({ path: path.join(OUT, `qa-${width}x${height}.png`), fullPage: false });
    await context.close();
    return { ...result, errors };
  };

  for (const width of PHONES) {
    const m = await measure(width, 800);
    check(`${width}px: no horizontal page overflow`, m.overflow <= 1, JSON.stringify(m.overflow));
    check(`${width}px: menu, account and cart on the first line`, Boolean(m.menu && m.account && m.cart) && Math.abs(m.menu.top - m.cart.top) <= 12 && Math.abs(m.cart.top - m.account.top) <= 12, JSON.stringify({ menu: m.menu?.top, account: m.account?.top, cart: m.cart?.top }));
    check(`${width}px: search on its own line and inside the viewport`, Boolean(m.search) && m.search.right <= width && m.search.width >= width - 48, JSON.stringify(m.search));
    check(`${width}px: department strip is one swipeable row`, m.deptSingleRow === true && m.deptScrollable === true, JSON.stringify({ row: m.deptSingleRow, scroll: m.deptScrollable }));
    check(`${width}px: promos share one horizontal track`, m.promoRows === 1 && m.promoScrollable === true, JSON.stringify({ rows: m.promoRows, scrollable: m.promoScrollable }));
    check(`${width}px: all eight category images render`, m.categories === 8 && m.categoryImages === 8, JSON.stringify({ categories: m.categories, images: m.categoryImages }));
    check(`${width}px: no page errors`, m.errors.length === 0, m.errors.join(" | "));
  }

  // Landscape phone
  const landscape = await measure(844, 390);
  check("844x390 landscape: no overflow, promos in one row", landscape.overflow <= 1 && landscape.promoRows === 1, JSON.stringify({ overflow: landscape.overflow, rows: landscape.promoRows }));

  // Tablets and desktop: three columns, no horizontal promo scrolling
  for (const width of [...TABLETS, ...DESKTOP]) {
    const m = await measure(width, 900);
    check(`${width}px: promos form three columns`, m.promoRows === 1 && m.promoScrollable === false, JSON.stringify({ rows: m.promoRows, scrollable: m.promoScrollable }));
    check(`${width}px: all eight categories render`, m.categories === 8 && m.categoryImages === 8, JSON.stringify({ categories: m.categories, images: m.categoryImages }));
    check(`${width}px: no horizontal page overflow`, m.overflow <= 1, JSON.stringify(m.overflow));
  }

  // Interaction: swipe the promo track and open the menu on a phone.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(2500);
  const promo = page.locator('section[aria-label="Promotions"]');
  await promo.scrollIntoViewIfNeeded();
  const before = await promo.evaluate((node) => node.scrollLeft);
  await promo.evaluate((node) => node.scrollBy({ left: 260, behavior: "smooth" }));
  await page.waitForTimeout(900);
  const after = await promo.evaluate((node) => node.scrollLeft);
  check("promo track scrolls horizontally on swipe", after > before + 100, `${before} -> ${after}`);

  const menuButton = page.getByRole("button", { name: "Open menu" });
  await menuButton.click();
  await page.waitForTimeout(500);
  const drawerOpen = await page.getByRole("dialog", { name: "Browse departments" }).isVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const drawerClosed = !(await page.getByRole("dialog", { name: "Browse departments" }).isVisible().catch(() => false));
  check("menu opens and Escape closes it", drawerOpen && drawerClosed);

  const cartBefore = await page.getByRole("link", { name: /^Cart, \d+ items/ }).getAttribute("aria-label");
  check("cart exposes its real item count", /Cart, \d+ items/.test(cartBefore ?? ""), cartBefore ?? "");

  const firstCategory = await page.locator("[data-category]").first().getAttribute("href");
  check("category cards link to real category pages", /^\/naijashop\/c\//.test(firstCategory ?? ""), firstCategory ?? "");

  const promoHrefs = await page.$$eval('section[aria-label="Promotions"] a', (nodes) => nodes.map((node) => node.getAttribute("href")));
  check("all three promo banners carry destinations", promoHrefs.length === 3 && promoHrefs.every(Boolean), JSON.stringify(promoHrefs));

  await context.close();
  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error("FAILURES:", failures.slice(0, 12));
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
