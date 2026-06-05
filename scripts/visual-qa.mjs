import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3000";
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outDir = path.join(process.cwd(), "qa-artifacts");

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 }
];

const routes = [
  "/",
  "/ecosystem-hub",
  "/categories",
  "/search",
  "/product-listing",
  "/product-detail",
  "/product/oraimo-watch-pro",
  "/cart",
  "/checkout",
  "/account",
  "/orders",
  "/wallet",
  "/help",
  "/returns",
  "/safety",
  "/shipping",
  "/payments",
  "/naijashop",
  "/naijaeats",
  "/naijagigs",
  "/naijastay",
  "/naijadrive",
  "/naijasend",
  "/naijastream",
  "/aura-ai",
  "/business/shop",
  "/business/eats",
  "/business/gigs",
  "/business/stay",
  "/business/drive",
  "/business/send",
  "/business/stream",
  "/onboarding/vendor",
  "/onboarding/driver",
  "/onboarding/restaurant",
  "/onboarding/creator",
  "/tracking/mission-2843",
  "/admin",
  "/super-admin"
];

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true
});

const report = [];
const internalLinks = new Set();

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1
  });

  for (const route of routes) {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const url = `${baseUrl}${route}`;
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(250);

    const metrics = await page.evaluate(() => {
      const bodyText = document.body.innerText.trim();
      const anchors = Array.from(document.querySelectorAll("a[href]")).map((anchor) => anchor.getAttribute("href"));
      const images = Array.from(document.querySelectorAll("img"));
      const visibleImages = images.filter((img) => {
        const rect = img.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
      });
      const badImages = visibleImages.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.getAttribute("alt") || img.getAttribute("src") || "image");
      const overflowElements = Array.from(document.querySelectorAll("body *"))
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && (rect.right > window.innerWidth + 2 || rect.left < -2);
        })
        .slice(0, 8)
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || "").trim().slice(0, 80),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width)
          };
        });

      return {
        title: document.title,
        bodyTextLength: bodyText.length,
        h1Count: document.querySelectorAll("h1").length,
        links: anchors,
        imageCount: images.length,
        visibleImageCount: visibleImages.length,
        badImages,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        overflowElements
      };
    });

    for (const href of metrics.links) {
      if (!href) continue;
      if (href.startsWith("/")) internalLinks.add(href.split("#")[0]);
    }

    const safeRoute = route === "/" ? "home" : route.replace(/^\//, "").replace(/[\\/:[\]*?"<>|]/g, "-");
    const screenshot = `${viewport.name}-${safeRoute}.png`;
    await page.screenshot({ path: path.join(outDir, screenshot), fullPage: false });

    report.push({
      route,
      viewport: viewport.name,
      status: response?.status() ?? null,
      screenshot,
      consoleErrors,
      ...metrics
    });

    await page.close();
  }

  await context.close();
}

const linkChecks = [];
const checkContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const checkPage = await checkContext.newPage();
for (const href of Array.from(internalLinks).sort()) {
  if (href.startsWith("/_next") || href.startsWith("/stitch")) continue;
  const response = await checkPage.goto(`${baseUrl}${href}`, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null);
  linkChecks.push({ href, status: response?.status() ?? null });
}
await checkContext.close();
await browser.close();

const failures = report.filter((item) =>
  item.status !== 200 ||
  item.bodyTextLength < 500 ||
  item.h1Count < 1 ||
  item.hasHorizontalOverflow ||
  item.badImages.length > 0 ||
  item.consoleErrors.length > 0
);

const brokenLinks = linkChecks.filter((item) => item.status !== 200);

const markdown = [
  "# NaijaDeals Visual QA Report",
  "",
  `Base URL: ${baseUrl}`,
  `Routes tested: ${routes.length}`,
  `Viewports: ${viewports.map((v) => `${v.name} ${v.width}x${v.height}`).join(", ")}`,
  `Screenshots: ${report.length}`,
  "",
  "## Summary",
  "",
  `- Page checks with issues: ${failures.length}`,
  `- Broken internal links: ${brokenLinks.length}`,
  "",
  "## Issues",
  "",
  failures.length
    ? failures.map((item) => `- ${item.viewport} ${item.route}: status=${item.status}, overflow=${item.hasHorizontalOverflow}, text=${item.bodyTextLength}, h1=${item.h1Count}, badImages=${item.badImages.length}, consoleErrors=${item.consoleErrors.length}`).join("\n")
    : "- No visual QA failures detected by automated checks.",
  "",
  "## Broken Links",
  "",
  brokenLinks.length ? brokenLinks.map((item) => `- ${item.href}: ${item.status}`).join("\n") : "- No broken internal links detected.",
  "",
  "## Screenshots",
  "",
  ...report.map((item) => `- ${item.viewport} ${item.route}: qa-artifacts/${item.screenshot}`)
].join("\n");

await fs.writeFile(path.join(outDir, "visual-qa-report.json"), JSON.stringify({ report, linkChecks, failures, brokenLinks }, null, 2));
await fs.writeFile(path.join(outDir, "visual-qa-report.md"), markdown);

console.log(JSON.stringify({
  baseUrl,
  routeCount: routes.length,
  screenshotCount: report.length,
  failures: failures.length,
  brokenLinks: brokenLinks.length,
  reportPath: "qa-artifacts/visual-qa-report.md"
}, null, 2));
