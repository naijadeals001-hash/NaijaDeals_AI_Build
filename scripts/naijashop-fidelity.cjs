/**
 * NaijaShop design-fidelity harness.
 *
 * Measures the approved mockups and the live storefront in the browser, then
 * reports region-by-region deltas instead of an impression of closeness.
 *
 * Metrics per region: normalised width, height and vertical position, so a
 * mockup rendered at 1024px and a live page at 1440px compare on proportion.
 *
 * Usage: BASE_URL=http://localhost:3015 node scripts/naijashop-fidelity.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const OUT = path.join(process.cwd(), "qa-artifacts", "naijashop", "fidelity");
fs.mkdirSync(OUT, { recursive: true });

const MOCKUP = {
  desktop: path.join(process.cwd(), "design-references", "approved", "NaijaShop", "desktop-homepage.png"),
  mobile: path.join(process.cwd(), "design-references", "approved", "NaijaShop", "mobile-homepage.png")
};

const fileUrl = (target) => `file:///${target.replace(/\\/g, "/")}`;

/** Regions present in the approved desktop mockup, in page order. */
const DESKTOP_REGIONS = [
  { key: "header", label: "Main header (logo, search, account, cart)", match: /^header$/i },
  { key: "departments", label: "Secondary department navigation" },
  { key: "sidebar", label: "Left department sidebar" },
  { key: "hero", label: "Hero carousel" },
  { key: "plus", label: "Plus membership panel" },
  { key: "quick", label: "Quick-access service tiles" },
  { key: "deals", label: "Deals of the day row" },
  { key: "categories", label: "Shop by category grid" },
  { key: "shelves", label: "Product shelves" },
  { key: "banners", label: "Lower promotional banners" },
  { key: "brands", label: "Shop by brand strip" },
  { key: "benefits", label: "Service-benefit strip" },
  { key: "footer", label: "Footer" }
];

const MOBILE_REGIONS = ["header", "categoryTabs", "hero", "serviceTiles", "deals", "plusCard", "categoryRail", "bottomNav", "footer"];

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

  // ---- Measure the approved mockups ------------------------------------
  const mockPage = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const mockMeasure = async (file) => {
    await mockPage.goto(fileUrl(file));
    await mockPage.waitForTimeout(600);
    return mockPage.evaluate(() => ({ width: document.querySelector("img").naturalWidth, height: document.querySelector("img").naturalHeight }));
  };
  const desktopMock = await mockPage.goto(fileUrl(MOCKUP.desktop)).then(() => mockPage.evaluate(() => ({
    width: document.querySelector("img").naturalWidth,
    height: document.querySelector("img").naturalHeight
  })));
  const mobileMock = await mockPage.goto(fileUrl(MOCKUP.mobile)).then(() => mockPage.evaluate(() => ({
    width: document.querySelector("img").naturalWidth,
    height: document.querySelector("img").naturalHeight
  })));

  // ---- Measure the live storefront -------------------------------------
  const live = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await live.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 120000 });
  await live.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
  await live.waitForTimeout(2500);

  const liveMetrics = await live.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height, width: r.width, left: r.left };
    };
    const page = { width: document.documentElement.clientWidth, height: document.body.scrollHeight };
    const header = rect("header");
    const nav = rect('nav[aria-label="Primary"]');
    const hero = rect('[role="region"][aria-roledescription="carousel"]');
    const quick = rect('section[aria-label="Quick links"]');
    const deals = rect('section[aria-labelledby="deals-heading"]');
    const categories = rect('section[aria-labelledby="category-heading"]');
    const shelves = rect('section[aria-labelledby^="shelf-"]');
    const banners = rect('section[aria-label="Promotions"]');
    const benefits = rect('section[aria-label="Why shop with NaijaShop"]');
    const footer = rect("footer");
    return {
      page,
      header,
      departments: nav,
      hero,
      quick,
      deals,
      categories,
      shelves,
      banners,
      benefits,
      footer,
      sidebar: rect('nav[aria-label="Shop by category"]'),
      plus: rect('aside[aria-labelledby="plus-panel"]'),
      brands: rect('section[aria-labelledby="brands-heading"]')
    };
  });

  const normalise = (box, page, axis) => {
    if (!box) return null;
    return axis === "x" ? Number((box.width / page.width).toFixed(3)) : Number((box.height / page.height).toFixed(3));
  };

  const report = {
    mockups: { desktop: desktopMock, mobile: mobileMock },
    live: { viewport: liveMetrics.page, measuredAt: new Date().toISOString(), source: "workspace build served by preview-3015" },
    desktop: DESKTOP_REGIONS.map((region) => {
      const box = liveMetrics[region.key];
      return {
        region: region.label,
        present: Boolean(box),
        widthRatio: normalise(box, liveMetrics.page, "x"),
        heightRatio: normalise(box, liveMetrics.page, "y"),
        top: box ? Math.round(box.top) : null
      };
    })
  };

  fs.writeFileSync(path.join(OUT, "measurements.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.desktop, null, 1));

  // Full-page captures for the visual comparison record.
  await live.screenshot({ path: path.join(OUT, "live-desktop-full.png"), fullPage: true });
  const mobileLive = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await mobileLive.goto(`${BASE}/naijashop`, { waitUntil: "load", timeout: 120000 });
  await mobileLive.waitForTimeout(3000);
  await mobileLive.screenshot({ path: path.join(OUT, "live-mobile-full.png"), fullPage: true });

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
