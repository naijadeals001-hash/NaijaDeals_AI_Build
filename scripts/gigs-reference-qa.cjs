const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const outDir = path.join(process.cwd(), "qa-artifacts", "gigs-reference");
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 }
];

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const results = [];
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const response = await page.goto(`${BASE}/naijagigs`, { waitUntil: "networkidle", timeout: 60000 });
    await page.evaluate(async () => {
      document.querySelectorAll("*").forEach((el) => {
        if (el.scrollWidth > el.clientWidth + 50 && el.clientWidth > 0) el.scrollLeft = el.scrollWidth;
      });
      for (let y = 0; y <= document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2500);
    const checks = await page.evaluate(() => {
      const text = document.body.innerText;
      const images = Array.from(document.querySelectorAll("img")).filter((img) => Boolean(img.offsetParent) || img.style.position === "fixed").map((img) => ({ complete: img.complete, naturalWidth: img.naturalWidth }));
      return {
        h1: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim(),
        heroHeadline: text.includes("Find the right person.") && text.includes("Get the job done."),
        searchPresent: Boolean(document.querySelector('input[name="q"]')),
        categoryRail: text.includes("View All Services"),
        postJobPanel: text.includes("Tell us what you need."),
        howItWorks: text.includes("How NaijaGigs Works") && text.includes("Hire With Confidence"),
        fourSteps: ["1. Search", "2. Compare", "3. Hire", "4. Get It Done"].every((s) => text.includes(s)),
        providerBand: text.includes("Turn Your Skills Into Income"),
        footerBand: text.includes("Find a skill. Hire a professional. Get the job done."),
        images: images.length,
        brokenImages: images.filter((img) => !img.complete || img.naturalWidth === 0).length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    await page.screenshot({ path: path.join(outDir, `landing-${viewport.name}.png`), fullPage: true });
    results.push({ viewport: viewport.name, status: response.status(), ...checks });
    await page.close();
  }
  // Post a Job page (signed-out gate renders sign-in card)
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const postJob = await page.goto(`${BASE}/naijagigs/post-job`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);
  const postJobChecks = await page.evaluate(() => ({
    loaded: document.body.innerText.length > 0,
    text: document.body.innerText.slice(0, 120)
  }));
  await page.screenshot({ path: path.join(outDir, "post-job-desktop.png"), fullPage: true });
  results.push({ viewport: "desktop", page: "post-job", status: postJob.status(), ...postJobChecks });
  await page.close();

  console.log(JSON.stringify(results, null, 2));
  const landingFailures = results.filter((r) => r.viewport && r.h1 !== undefined && (r.status !== 200 || r.brokenImages > 0 || r.overflow > 1 || !r.heroHeadline || !r.searchPresent || !r.categoryRail || !r.postJobPanel || !r.howItWorks || !r.fourSteps || !r.providerBand || !r.footerBand));
  if (landingFailures.length > 0) {
    console.error("REFERENCE QA FAILURES:", JSON.stringify(landingFailures, null, 2));
    process.exit(1);
  }
  console.log("REFERENCE QA PASSED");
  await browser.close();
})();
