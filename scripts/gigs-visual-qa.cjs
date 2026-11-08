const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3020";
const outDir = path.join(process.cwd(), "qa-artifacts", "gigs");
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 }
];

const pages = [
  { name: "landing", path: "/naijagigs" },
  { name: "services", path: "/naijagigs/services" },
  { name: "professionals", path: "/naijagigs/professionals" },
  { name: "apply", path: "/naijagigs/pro/apply" },
  { name: "pro-dashboard", path: "/naijagigs/pro/dashboard" }
];

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const results = [];
  for (const viewport of viewports) {
    for (const target of pages) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const response = await page.goto(`${BASE}${target.path}`, { waitUntil: "networkidle", timeout: 60000 });
      await page.evaluate(async () => {
        // Nudge horizontal rails so lazy images inside them load, then sweep vertically.
        document.querySelectorAll("*").forEach((el) => {
          if (el.scrollWidth > el.clientWidth + 50 && el.clientWidth > 0) el.scrollLeft = el.scrollWidth;
        });
        for (let y = 0; y <= document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 180));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1500);
      const data = await page.evaluate(() => {
        const images = Array.from(document.querySelectorAll("img")).map((img) => ({ src: img.getAttribute("src"), complete: img.complete, naturalWidth: img.naturalWidth }));
        return {
          title: document.title,
          h1: document.querySelector("h1")?.textContent ?? null,
          images: images.length,
          brokenImages: images.filter((img) => !img.complete || img.naturalWidth === 0).length,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          text: document.body.innerText.slice(0, 80)
        };
      });
      await page.screenshot({ path: path.join(outDir, `${target.name}-${viewport.name}.png`), fullPage: true });
      results.push({ viewport: viewport.name, page: target.name, status: response.status(), ...data });
      await page.close();
    }
  }
  console.log(JSON.stringify(results, null, 2));
  // Auth-gated pages legitimately show a sign-in card (h2, no h1) when anonymous.
  const failures = results.filter((r) => r.status !== 200 || r.brokenImages > 0 || r.overflow > 1 || (!r.h1 && !r.text.includes("Sign in")));
  if (failures.length > 0) {
    console.error("GIGS VISUAL FAILURES:", JSON.stringify(failures, null, 2));
    process.exit(1);
  }
  console.log("GIGS VISUAL QA PASSED");
  await browser.close();
})();
