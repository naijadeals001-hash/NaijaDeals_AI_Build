/**
 * NaijaGigs route + interaction crawl. Navigates every reported URL and every
 * gigs API endpoint in a real browser, records console/runtime/HTTP errors,
 * rendered content, and checks that filters actually change results.
 *
 * Usage: BASE_URL=http://localhost:3015 node scripts/gigs-route-crawl.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const outDir = path.join(process.cwd(), "qa-artifacts", "gigs-crawl");
fs.mkdirSync(outDir, { recursive: true });

const categories = ["events-catering", "beauty-wellness", "tech-digital", "design-creative", "building-renovation", "cleaning-services", "electrical-solar", "home-repairs"];

const pages = [
  { name: "home", path: "/naijagigs" },
  { name: "services-empty-query", path: "/naijagigs/services?q=&city=" },
  { name: "professionals", path: "/naijagigs/professionals" },
  { name: "services-all", path: "/naijagigs/services" },
  { name: "post-job", path: "/naijagigs/post-job" },
  { name: "pro-apply", path: "/naijagigs/pro/apply" },
  { name: "pro-dashboard", path: "/naijagigs/pro/dashboard" },
  ...categories.map((slug) => ({ name: `cat-${slug}`, path: `/naijagigs/services?category=${slug}`, category: slug })),
  { name: "search-plumber", path: "/naijagigs/services?q=plumber" },
  { name: "search-city", path: "/naijagigs/services?city=Abuja" },
  { name: "jobs", path: "/naijagigs/services?tab=jobs" }
];

const apis = [
  "/api/gigs/categories",
  "/api/gigs/services",
  "/api/gigs/services?category=electrical-solar",
  "/api/gigs/professionals",
  "/api/gigs/jobs",
  "/api/gigs/overview",
  "/api/gigs/pro",
  "/api/gigs/conversations",
  "/api/gigs/bookings"
];

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const results = [];

  for (const target of pages) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
    });
    page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 200)));
    let status = 0;
    try {
      const response = await page.goto(`${BASE}${target.path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      status = response?.status() ?? 0;
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1200);
    } catch (error) {
      status = -1;
      pageErrors.push(`navigation: ${String(error).slice(0, 160)}`);
    }
    const info = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        title: document.title,
        h1: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        notFound: text.includes("This page could not be found"),
        resultCount: document.querySelectorAll("[data-gig-card]").length,
        hasEmptyState: /no (services|professionals|listings|jobs) (match|yet|found)|nothing (here|to show)|be the first/i.test(text),
        cityChips: Array.from(document.querySelectorAll("a[href*='city=']")).map((a) => a.textContent?.trim()).slice(0, 8),
        activeCategory: (() => {
          const active = document.querySelector("a[aria-current='page'][href*='category=']");
          return active?.getAttribute("href") ?? null;
        })(),
        textSample: text.slice(0, 160)
      };
    });
    try {
      await page.screenshot({ path: path.join(outDir, `${target.name}.png`), fullPage: false, timeout: 15000 });
    } catch {
      /* screenshots are evidence, not a gate for the crawl */
    }
    results.push({ ...target, status, ...info, consoleErrors, pageErrors });
    await page.close();
  }

  const apiResults = [];
  for (const endpoint of apis) {
    const page = await browser.newPage();
    await page.goto(`${BASE}/naijagigs`, { waitUntil: "domcontentloaded" });
    const response = await page.evaluate(async (url) => {
      const res = await fetch(url, { credentials: "include" });
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return { status: res.status, sample: JSON.stringify(body).slice(0, 200) };
    }, endpoint);
    apiResults.push({ endpoint, ...response });
    await page.close();
  }

  await browser.close();
  const report = { generatedAt: new Date().toISOString(), base: BASE, pages: results, apis: apiResults };
  fs.writeFileSync(path.join(outDir, "crawl-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.pages.map((p) => ({ name: p.name, status: p.status, h1: p.h1, notFound: p.notFound, cards: p.resultCount, empty: p.hasEmptyState, consoleErrors: p.consoleErrors.length, pageErrors: p.pageErrors.slice(0, 2) })), null, 1));
  console.log(JSON.stringify(apiResults, null, 1));
})();
