import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3001";
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outDir = path.join(process.cwd(), "qa-artifacts", "ecosystem");

const routes = (process.env.QA_ROUTES ?? "/,/products").split(",");
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 }
];

await fs.mkdir(outDir, { recursive: true });

async function waitForServer(attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(baseUrl, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Server at ${baseUrl} did not become ready`);
}

await waitForServer();

const browser = await chromium.launch({ executablePath: chromePath });
const report = [];

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  for (const route of routes) {
    const slug = route === "/" ? "home" : route.replace(/\//g, "-").replace(/^-/, "");
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.8);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const brokenImages = await page.evaluate(() =>
      Array.from(document.images)
        .filter((img) => !img.complete || img.naturalWidth === 0)
        .map((img) => img.currentSrc || img.src)
    );
    const heading = await page.locator("h1").first().innerText().catch(() => "");
    const file = path.join(outDir, `${slug}-${viewport.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    report.push({
      route,
      viewport: viewport.name,
      status: response?.status(),
      heading,
      horizontalOverflowPx: overflow,
      brokenImages,
      consoleErrors
    });
  }

  await context.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
