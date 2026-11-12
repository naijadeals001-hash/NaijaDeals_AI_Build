/**
 * Final-build smoke: clean browser and a returning persistent session.
 * Read-only; no sign-in, cart or checkout mutation.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE = process.env.REVIEW_BASE_URL || "http://localhost:3047";
const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok, detail });

async function inspect(page, label) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${BASE}/naijashop`, { waitUntil: "networkidle" });
  const shop = await page.evaluate(() => ({
    build: (document.documentElement.innerHTML.match(/buildId[^,]*/) || [""])[0],
    banner: document.body.innerText.includes("REVIEW CATALOGUE"),
    crf: document.body.innerText.includes("CRF"),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  check(`${label}: shop renders`, shop.banner && !shop.crf && shop.overflow === 0, JSON.stringify(shop));

  const product = await page.goto(`${BASE}/product/demo-10-inch-android-tablet`, { waitUntil: "networkidle" });
  const chip = await page.locator("text=Demonstration seller").count();
  check(`${label}: product 200 and demo seller`, product.status() === 200 && chip > 0, `status=${product.status()} chip=${chip}`);

  const missing = await page.goto(`${BASE}/product/demo-daily-sunscreen`, { waitUntil: "networkidle" });
  const recovery = await page.locator("text=Back to Shop").count();
  check(`${label}: archived product 404 with recovery`, missing.status() === 404 && recovery > 0, `status=${missing.status()}`);
  const unexpected = errors.filter((text) => !/Failed to load resource: the server responded with a status of 404/.test(text));
  check(`${label}: no unexpected browser errors`, unexpected.length === 0, `${unexpected.length} unexpected; ${errors.length} total (intentional 404 excluded)`);
}

(async () => {
  const clean = await chromium.launch();
  const cleanPage = await clean.newPage({ viewport: { width: 1440, height: 900 } });
  await inspect(cleanPage, "clean");
  await clean.close();

  const profile = path.join(os.tmpdir(), `nd-review-returning-${Date.now()}`);
  let context = await chromium.launchPersistentContext(profile, { viewport: { width: 390, height: 844 } });
  let page = context.pages()[0] || (await context.newPage());
  await inspect(page, "returning-first");
  await context.close();

  context = await chromium.launchPersistentContext(profile, { viewport: { width: 390, height: 844 } });
  page = context.pages()[0] || (await context.newPage());
  await inspect(page, "returning-reopen");
  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });

  const failed = checks.filter((entry) => !entry.ok);
  console.log(JSON.stringify({ base: BASE, checks, passed: checks.length - failed.length, total: checks.length }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((error) => { console.error("SMOKE ERROR", error.message); process.exit(2); });
