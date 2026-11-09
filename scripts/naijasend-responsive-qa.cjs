/**
 * NaijaSend responsive + imagery QA.
 *
 * For each route and viewport: no horizontal overflow, main landmark present,
 * every mode/solution/category card has a loaded image, the mobile bottom nav is
 * pinned, and there are no console errors. The homepage additionally asserts the
 * mockup's section order (A–P) and the hero headline at desktop widths.
 *
 * Usage: node scripts/naijasend-responsive-qa.cjs
 */
const { chromium } = require("playwright-core");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
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
  "/naijasend",
  "/naijasend/ship",
  "/naijasend/quote",
  "/naijasend/track",
  "/naijasend/orders",
  "/naijasend/providers",
  "/naijasend/transporter/apply",
  "/naijasend/transporter/dashboard",
  "/naijasend/enterprise",
  "/naijasend/help",
  "/naijasend/how-it-works",
  "/naijasend/notifications"
];
// The quote card sits beside the hero (as in the mockup), so its heading is
// horizontally adjacent rather than sequentially below it.
const REQUIRED_ORDER = [
  "Africa's All-in-One Logistics Marketplace",
  "All Transport Modes",
  "Choose a Transport Solution",
  "Transport for Every Need",
  "Ship by Category",
  "How NaijaSend Works",
  "Solutions for Everyone",
  "Ship for Your Business",
  "Ship Farm Produce Nationwide",
  "Become a Transporter",
  "Enterprise & Government Logistics",
  "Our Transport Network",
  "NaijaSend Mobile App"
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
    const errors = [];

    for (const route of ROUTES) {
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
      page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 120)));
      await page.goto(BASE + route, { waitUntil: "load", timeout: 120000 });
      // Reveal every card (including horizontal rails) as a user would.
      await page.evaluate(async () => {
        for (const card of document.querySelectorAll("[data-mode], [data-category], [data-solution]")) {
          card.scrollIntoView({ block: "nearest", inline: "center" });
          await new Promise((r) => setTimeout(r, 40));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 45000, polling: 250 }).catch(() => null);
      await page.waitForTimeout(400);

      const metrics = await page.evaluate(() => {
        const cards = [...document.querySelectorAll("[data-mode], [data-category], [data-solution]")];
        const withImg = cards.filter((c) => c.querySelector("img"));
        const loaded = withImg.filter((c) => {
          const img = c.querySelector("img");
          return img && img.complete && img.naturalWidth > 0;
        });
        const nav = document.querySelector('nav[aria-label="NaijaSend navigation"]');
        const navBox = nav ? nav.getBoundingClientRect() : null;
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          main: Boolean(document.querySelector("#main-content")),
          cards: cards.length,
          withImg: withImg.length,
          loaded: loaded.length,
          navPinned: nav ? Math.abs(navBox.bottom - window.innerHeight) < 2 && getComputedStyle(nav).position === "fixed" : null,
          burger: Boolean(document.querySelector('button[aria-label="Open menu"]'))
        };
      });
      check(`${label} ${route} no horizontal overflow`, metrics.overflow <= 0, `${metrics.overflow}px`);
      check(`${label} ${route} main landmark`, metrics.main);
      if (metrics.cards) check(`${label} ${route} every card has an image`, metrics.withImg === metrics.cards, `${metrics.withImg}/${metrics.cards}`);
      if (metrics.cards) check(`${label} ${route} every card image loads`, metrics.loaded === metrics.cards, `${metrics.loaded}/${metrics.cards}`);
      if (width < 1024) {
        check(`${label} ${route} mobile menu button`, metrics.burger);
        if (metrics.navPinned !== null) check(`${label} ${route} bottom nav pinned`, metrics.navPinned === true);
      }
      await page.close();
    }

    if (width >= 1024) {
      const page = await context.newPage();
      await page.goto(`${BASE}/naijasend`, { waitUntil: "load" });
      // Each section is located by an element whose text starts with the label and
      // that is not inside the header (several labels also appear in the hero).
      const positions = await page.evaluate((required) => {
        const candidates = [...document.querySelectorAll("h1,h2,h3,p,span,section,div")]
          .filter((n) => !n.closest("header") && n.children.length === 0 && n.innerText.trim().length > 0);
        return required.map((label) => {
          const node = candidates.find((n) => n.innerText.trim().startsWith(label));
          return { label, at: node ? node.getBoundingClientRect().top + window.scrollY : -1 };
        });
      }, REQUIRED_ORDER);
      const missing = positions.filter((row) => row.at < 0).map((row) => row.label);
      check(`${label} homepage has every mockup section`, missing.length === 0, missing.join(", "));
      const outOfOrder = positions.filter((row, i) => i > 0 && row.at >= 0 && row.at < positions[i - 1].at).map((row) => row.label);
      check(`${label} homepage follows mockup order`, outOfOrder.length === 0, outOfOrder.join(", "));
      const h1 = (await page.locator("h1").first().innerText()).toLowerCase();
      check(`${label} hero headline matches mockup`, h1.includes("logistics marketplace"), h1);
      await page.close();
    }
    check(`${label} no console errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
    await context.close();
  }
  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error(failures.slice(0, 30).join("\n"));
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
