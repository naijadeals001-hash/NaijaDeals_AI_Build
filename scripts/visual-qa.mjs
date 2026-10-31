import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3000";
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outDir = path.join(process.cwd(), "qa-artifacts");

// Minimum rendered text length before a page is treated as suspiciously empty.
const MIN_TEXT_LENGTH = 120;

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 }
];

const accounts = {
  customer: {
    email: process.env.QA_CUSTOMER_EMAIL ?? "customer@naijadeals.local",
    password: process.env.QA_CUSTOMER_PASSWORD ?? "CustomerPass123!"
  },
  seller: {
    email: process.env.QA_SELLER_EMAIL ?? "seller@naijadeals.local",
    password: process.env.QA_SELLER_PASSWORD ?? "SellerPass123!"
  },
  courier: {
    email: process.env.QA_COURIER_EMAIL ?? "courier@naijadeals.local",
    password: process.env.QA_COURIER_PASSWORD ?? "CourierPass123!"
  },
  admin: {
    email: process.env.QA_ADMIN_EMAIL ?? "admin@naijadeals.local",
    password: process.env.QA_ADMIN_PASSWORD ?? "AdminPass123!"
  },
  driver: {
    email: process.env.QA_DRIVER_EMAIL ?? "driver@naijadeals.local",
    password: process.env.QA_DRIVER_PASSWORD ?? "DriverPass123!"
  }
};

const publicRoutes = [
  "/",
  "/naijashop",
  "/search",
  "/login",
  "/register",
  "/sell",
  "/naijaeats",
  "/naijasend",
  "/naijadrive",
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
  "/onboarding/creator"
];

// Pages that require a signed-in customer session.
const customerRoutes = ["/cart", "/checkout", "/account", "/orders", "/wallet"];

// Role dashboards, exercised with the matching account.
const roleRoutes = [
  { route: "/seller", account: "seller" },
  { route: "/courier", account: "courier" },
  { route: "/driver", account: "driver" },
  { route: "/admin", account: "admin" },
  { route: "/super-admin", account: "admin" }
];

async function resolveProductRoute() {
  try {
    const response = await fetch(`${baseUrl}/api/products`);
    const products = response.ok ? await response.json() : [];
    if (products[0]?.slug) return `/product/${products[0].slug}`;
  } catch {
    // The static routes still cover the storefront if the catalog is unavailable.
  }
  return null;
}

const productRoute = await resolveProductRoute();
if (productRoute) publicRoutes.splice(1, 0, productRoute);

const passes = [
  { name: "public", account: null, routes: publicRoutes, expectLoginRedirect: false },
  { name: "customer", account: "customer", routes: customerRoutes, expectLoginRedirect: false },
  ...roleRoutes.map((entry) => ({
    name: entry.account,
    account: entry.account,
    routes: [entry.route],
    expectLoginRedirect: false
  })),
  {
    name: "anonymous-gate",
    account: null,
    routes: roleRoutes.map((entry) => entry.route),
    expectLoginRedirect: true
  }
];

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true
});

const report = [];
const internalLinks = new Set();
const authFailures = [];

async function signIn(context, account) {
  const credentials = accounts[account];
  const response = await context.request.post(`${baseUrl}/api/auth/login`, {
    data: credentials,
    headers: { Origin: baseUrl, "Content-Type": "application/json" }
  });
  if (!response.ok()) {
    authFailures.push(`${account}: login returned ${response.status()}`);
  }
}

for (const pass of passes) {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1
    });

    if (pass.account) await signIn(context, pass.account);

    for (const route of pass.routes) {
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
        const badImages = visibleImages
          .filter((img) => !img.complete || img.naturalWidth === 0)
          .map((img) => img.getAttribute("alt") || img.getAttribute("src") || "image");
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
          finalPath: `${window.location.pathname}${window.location.search}`,
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
      const screenshot = `${viewport.name}-${pass.name}-${safeRoute}.png`;
      await page.screenshot({ path: path.join(outDir, screenshot), fullPage: false });

      const redirectedToLogin = metrics.finalPath.startsWith("/login");
      const problems = [];

      if (response?.status() !== 200) problems.push(`status ${response?.status() ?? "none"}`);
      if (pass.expectLoginRedirect) {
        if (!redirectedToLogin) problems.push(`expected /login redirect, landed on ${metrics.finalPath}`);
      } else {
        if (redirectedToLogin && route !== "/login") problems.push(`unexpected /login redirect from ${route}`);
        if (metrics.bodyTextLength < MIN_TEXT_LENGTH) problems.push(`only ${metrics.bodyTextLength} chars of text`);
        if (metrics.h1Count < 1) problems.push("no h1 heading");
      }
      if (metrics.hasHorizontalOverflow) problems.push("horizontal overflow");
      if (metrics.badImages.length > 0) problems.push(`${metrics.badImages.length} broken image(s)`);
      if (consoleErrors.length > 0) problems.push(`${consoleErrors.length} console error(s)`);

      report.push({
        route,
        pass: pass.name,
        account: pass.account,
        viewport: viewport.name,
        status: response?.status() ?? null,
        finalPath: metrics.finalPath,
        redirectedToLogin,
        screenshot,
        problems,
        consoleErrors,
        overflowElements: metrics.overflowElements,
        ...metrics
      });

      await page.close();
    }

    await context.close();
  }
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

const failures = report.filter((item) => item.problems.length > 0);
const brokenLinks = linkChecks.filter((item) => item.status !== 200 && item.status !== 307 && item.status !== 308);

const formatFailure = (item) =>
  `- ${item.viewport} ${item.pass} ${item.route} -> ${item.finalPath}: ${item.problems.join("; ")}` +
  (item.consoleErrors.length ? `\n  - console: ${item.consoleErrors.slice(0, 3).join(" | ")}` : "");

const markdown = [
  "# NaijaDeals Visual QA Report",
  "",
  `Base URL: ${baseUrl}`,
  `Passes: ${passes.map((pass) => pass.name).join(", ")}`,
  `Page checks: ${report.length} (${passes.length} passes x ${viewports.length} viewports)`,
  `Viewports: ${viewports.map((v) => `${v.name} ${v.width}x${v.height}`).join(", ")}`,
  `Screenshots: ${report.length}`,
  "",
  "## Summary",
  "",
  `- Page checks with issues: ${failures.length}`,
  `- Broken internal links: ${brokenLinks.length}`,
  `- Authentication failures: ${authFailures.length}`,
  "",
  "## Coverage",
  "",
  `- Public pages checked anonymously: ${publicRoutes.length}`,
  `- Customer pages checked while signed in: ${customerRoutes.length}`,
  `- Role dashboards checked while signed in: ${roleRoutes.length}`,
  `- Role dashboards checked anonymously (must redirect to /login): ${roleRoutes.length}`,
  "",
  "## Issues",
  "",
  failures.length ? failures.map(formatFailure).join("\n") : "- No visual QA failures detected by automated checks.",
  "",
  "## Broken Links",
  "",
  brokenLinks.length ? brokenLinks.map((item) => `- ${item.href}: ${item.status}`).join("\n") : "- No broken internal links detected.",
  "",
  "## Screenshots",
  "",
  ...report.map((item) => `- ${item.viewport} ${item.pass} ${item.route}: qa-artifacts/${item.screenshot}`)
].join("\n");

await fs.writeFile(path.join(outDir, "visual-qa-report.json"), JSON.stringify({ report, linkChecks, failures, brokenLinks, authFailures }, null, 2));
await fs.writeFile(path.join(outDir, "visual-qa-report.md"), markdown);

console.log(JSON.stringify({
  baseUrl,
  passes: passes.length,
  pageChecks: report.length,
  screenshotCount: report.length,
  failures: failures.length,
  brokenLinks: brokenLinks.length,
  authFailures: authFailures.length,
  reportPath: "qa-artifacts/visual-qa-report.md"
}, null, 2));
