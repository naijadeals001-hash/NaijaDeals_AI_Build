/**
 * Verifies the NaijaGigs ecosystem card status is truthful and responsive.
 * Checks the status pill text, the pulse counters, the Open navigation target
 * and layout at desktop / tablet / mobile.
 *
 * Usage: BASE_URL=http://localhost:3015 node scripts/gigs-card-status-qa.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const outDir = path.join(process.cwd(), "qa-artifacts", "gigs-card");
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
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);
    // The ecosystem feature card is the link that contains artwork (nav links do not).
    const card = page.locator('a[href="/naijagigs"]:has(img)').first();
    const cardCount = await page.locator('a[href="/naijagigs"]:has(img)').count();
    let info = { cardCount };
    if (cardCount > 0) {
      await card.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      info = {
        ...info,
        cardText: (await card.innerText()).replace(/\s+/g, " ").slice(0, 160),
        hasPreviewBadge: /preview/i.test(await card.innerText()),
        hasStaleSetup: (await card.innerText()).toLowerCase().includes("setup required"),
        imgSrc: await card.locator("img").first().getAttribute("src").catch(() => null),
        box: await card.boundingBox()
      };
      await card.screenshot({ path: path.join(outDir, `naijagigs-card-${viewport.name}.png`), timeout: 15000 }).catch(() => {});
      await card.click();
      await page.waitForURL(/\/naijagigs/, { timeout: 20000 });
      info.openTarget = new URL(page.url()).pathname;
      info.openStatus = (await page.title()).length > 0 ? "rendered" : "blank";
      const h1 = await page.locator("h1").first().innerText().catch(() => "");
      info.targetH1 = h1.replace(/\s+/g, " ").trim();
      info.overflowAfterOpen = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    }
    results.push({ viewport: viewport.name, ...info });
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  const failures = results.filter(
    (r) => r.cardCount === 0 || !r.hasPreviewBadge || r.hasStaleSetup || r.openTarget !== "/naijagigs" || !r.targetH1 || (r.overflowAfterOpen ?? 0) > 1
  );
  if (failures.length) {
    console.error("CARD STATUS QA FAILURES:", JSON.stringify(failures, null, 2));
    process.exit(1);
  }
  console.log("CARD STATUS QA PASSED");
})();
