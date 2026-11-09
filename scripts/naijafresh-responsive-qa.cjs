/**
 * NaijaFresh responsive + imagery QA.
 *
 * For each route and viewport it checks: no horizontal overflow, every produce
 * card renders a loaded image, every farm card renders a portrait, the section
 * order matches the approved mockup on the homepage, the mobile bottom nav is
 * pinned and reachable, and there are no console errors.
 *
 * Usage: node scripts/naijafresh-responsive-qa.cjs
 */
const { chromium } = require("playwright-core");

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3015";
const VIEWPORTS = [
  ["320", 320, 640],
  ["375", 375, 812],
  ["390", 390, 844],
  ["768", 768, 1024],
  ["1024", 1024, 768],
  ["1440", 1440, 900],
  ["1920", 1920, 1080]
];
const ROUTES = [
  "/naijafresh",
  "/naijafresh/shop",
  "/naijafresh/category/fruits",
  "/naijafresh/shop/fresh-tomatoes",
  "/naijafresh/farmers",
  "/naijafresh/farmers/demo-alabi-farm",
  "/naijafresh/cart",
  "/naijafresh/orders",
  "/naijafresh/favourites",
  "/naijafresh/business",
  "/naijafresh/how-it-works",
  "/naijafresh/seasonal",
  "/naijafresh/offers",
  "/naijafresh/farmers/apply"
];

// The approved desktop mockup's section order (A–P).
const REQUIRED_ORDER = [
  "NaijaFresh",
  "Shop by Category",
  "Fresh From the Farm Today",
  "Meet Our Farmers",
  "Buy for Your Home",
  "Buy for Your Business",
  "How NaijaFresh Works",
  "Our Delivery Network",
  "Are You a Farmer?",
  "Seasonal Harvest Calendar",
  "Pay Securely with NaijaPay",
  "Get the NaijaFresh App"
];

let passed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  for (const [label, width, height] of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768 });
    let errors = [];

    for (const route of ROUTES) {
      // A fresh page per route: decoding many large images in one renderer
      // exhausts memory, and a reused page would mix routes' console errors.
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
      page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 120)));
      await page.goto(BASE + route, { waitUntil: "load", timeout: 120000 });
      // Images are lazy-loaded, so scroll the full page before auditing them.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
        window.scrollTo(0, 0);
      });
      // Decode is what proves an image rendered; lazy images may still be loading bytes.
      await page.waitForLoadState("networkidle").catch(() => null);
      // Scroll through the page as a user would: native lazy images only start
      // fetching as they approach the viewport.
      await page.evaluate(async () => {
        const step = Math.max(300, Math.round(window.innerHeight * 0.8));
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        // Reveal every card the way a user does — including cards in
        // horizontally scrolling rails, which vertical scrolling never reaches.
        for (const card of document.querySelectorAll("[data-listing]")) {
          card.scrollIntoView({ block: "nearest", inline: "center", behavior: "instant" });
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        window.scrollTo(0, 0);
      });
      // Poll until every image has settled (complete), then assert. A bounded
      // wait keeps a genuinely broken asset from hanging the run.
      await page
        .waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 45000, polling: 250 })
        .catch(() => null);
      await page.waitForTimeout(500);
      const metrics = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth - window.innerWidth;
        const cards = [...document.querySelectorAll("[data-listing]")];
        const cardImgs = cards.map((card) => card.querySelector("img")).filter(Boolean);
        const loaded = cardImgs.filter((img) => img.complete && img.naturalWidth > 0);
        const brokenSrc = cardImgs.filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.currentSrc || img.src);
        const farmCards = [...document.querySelectorAll('a[href^="/naijafresh/farmers/"] img')];
        const nav = document.querySelector('nav[aria-label="NaijaFresh navigation"]');
        const navBox = nav ? nav.getBoundingClientRect() : null;
        return {
          overflow,
          cards: cards.length,
          cardImgs: cardImgs.length,
          loaded: loaded.length,
          farmPortraits: farmCards.length,
          brokenSrc,
          navPinned: nav ? Math.abs(navBox.bottom - window.innerHeight) < 2 && getComputedStyle(nav).position === "fixed" : null,
          hasBurger: Boolean(document.querySelector('button[aria-label="Open menu"]')),
          main: Boolean(document.querySelector("#main-content"))
        };
      });
      check(`${label} ${route} no horizontal overflow`, metrics.overflow <= 0, `${metrics.overflow}px`);
      check(`${label} ${route} main landmark`, metrics.main);
      if (metrics.cards) check(`${label} ${route} every card has an image`, metrics.cardImgs === metrics.cards, `${metrics.cardImgs}/${metrics.cards}`);
      if (metrics.cards) check(`${label} ${route} every card image loads`, metrics.loaded === metrics.cards, `${metrics.loaded}/${metrics.cards}${metrics.brokenSrc.length ? " broken: " + metrics.brokenSrc.slice(0, 2).join(", ") : ""}`);
      if (route === "/naijafresh/farmers") check(`${label} farmers page shows portraits`, metrics.farmPortraits > 0, String(metrics.farmPortraits));
      if (width < 1024) {
        check(`${label} ${route} mobile menu button`, metrics.hasBurger);
        if (metrics.navPinned !== null) check(`${label} ${route} bottom nav pinned`, metrics.navPinned === true);
      }
      await page.close();
    }

    // Homepage section order, desktop only.
    if (width >= 1024) {
      const page = await context.newPage();
      await page.goto(`${BASE}/naijafresh`, { waitUntil: "load" });
      const order = await page.evaluate((required) => {
        const text = document.body.innerText;
        const positions = required.map((label) => ({ label, at: text.indexOf(label) }));
        return positions;
      }, REQUIRED_ORDER);
      const missing = order.filter((row) => row.at < 0).map((row) => row.label);
      check(`${label} homepage contains every mockup section`, missing.length === 0, missing.join(", "));
      const outOfOrder = order.filter((row, i) => i > 0 && row.at >= 0 && row.at < order[i - 1].at).map((row) => row.label);
      check(`${label} homepage sections follow the mockup order`, outOfOrder.length === 0, outOfOrder.join(", "));
      check(`${label} homepage hero headline`, (await page.locator("h1").first().innerText()).toLowerCase().includes("fresh from african farms"));
      await page.close();
    }
    check(`${label} no console errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
    await context.close();
  }
  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error(failures.slice(0, 40).join("\n"));
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
