/**
 * Link integrity audit for NaijaSend, NaijaGigs and their ecosystem path home.
 *
 * Two checks per page:
 *  1. every internal <a href> resolves (no 404, no redirect loop);
 *  2. the page offers a working route back to the NaijaDeals dashboard (/).
 *
 * Usage: node scripts/link-audit.cjs
 */
const { chromium } = require("playwright-core");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const PAGES = [
  "/naijasend",
  "/naijasend/ship",
  "/naijasend/quote",
  "/naijasend/track",
  "/naijasend/orders",
  "/naijasend/providers",
  "/naijasend/transporter",
  "/naijasend/transporter/apply",
  "/naijasend/transporter/dashboard",
  "/naijasend/driver/jobs",
  "/naijasend/driver/earnings",
  "/naijasend/enterprise",
  "/naijasend/help",
  "/naijasend/how-it-works",
  "/naijasend/notifications",
  "/naijagigs",
  "/naijagigs/services",
  "/naijagigs/jobs",
  "/naijagigs/professionals",
  "/naijagigs/post-job",
  "/naijagigs/how-it-works",
  "/naijagigs/stories",
  "/naijagigs/government",
  "/naijagigs/notifications",
  "/"
];

let passed = 0;
const failures = [];

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // 1. Collect every internal link across the audited pages.
  const links = new Map();
  for (const route of PAGES) {
    const page = await context.newPage();
    const response = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 120000 });
    if (!response || response.status() >= 400) failures.push(`page ${route} returned ${response?.status()}`);
    else passed += 1;
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")]
        .map((a) => a.getAttribute("href"))
        .filter((h) => h && h.startsWith("/") && !h.startsWith("//"))
        .map((h) => h.split("#")[0])
    );
    for (const href of hrefs) {
      if (!links.has(href)) links.set(href, new Set());
      links.get(href).add(route);
    }
    // 2. Is there a route home?
    const homeLinks = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")].filter((a) => {
        const href = a.getAttribute("href");
        if (!href) return false;
        // Same-origin dashboard: "/" or an absolute URL whose path is exactly "/".
        return href === "/" || (href.startsWith(location.origin) && new URL(href).pathname === "/");
      }).length
    );
    if (homeLinks > 0) passed += 1;
    else failures.push(`no link back to the dashboard (/) on ${route}`);
    await page.close();
  }

  // 3. Resolve every distinct internal link.
  const page = await context.newPage();
  const sorted = [...links.keys()].sort();
  for (const href of sorted) {
    const response = await page.goto(BASE + href, { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => null);
    const status = response?.status() ?? 0;
    if (status >= 400 || status === 0) {
      failures.push(`BROKEN ${status} ${href} (linked from ${[...links.get(href)].slice(0, 3).join(", ")})`);
    } else {
      passed += 1;
    }
  }
  await page.close();
  await browser.close();

  console.log(`${sorted.length} distinct internal links, ${PAGES.length} pages`);
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
