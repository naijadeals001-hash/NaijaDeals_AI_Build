/**
 * REVIEW-only admin-led catalogue acceptance: an authorised admin suspends and
 * reactivates a demonstration listing through the Control Center, and the
 * Shop reflects each change. No edits to files or financial state.
 */
const fs = require("node:fs");
const { chromium } = require("playwright");
const BASE = process.env.REVIEW_BASE_URL || "http://localhost:3047";
const [email, password] = fs.readFileSync("qa-artifacts/review-basket/.admin-credential", "utf8").trim().split(/\r?\n/);
const TITLE = "DEMO — 10-inch Android tablet";
const SLUG = "demo-10-inch-android-tablet";

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const checks = [];
  const check = (name, ok, detail = "") => checks.push({ name, ok, detail });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.waitForTimeout(1800);
  check("admin sign-in", !page.url().includes("/login"), page.url());

  await page.goto(`${BASE}/admin?tab=products`, { waitUntil: "networkidle" });
  await page.getByPlaceholder(/search product/i).fill("Android tablet");
  await page.waitForTimeout(1200);
  const row = page.locator("tr", { hasText: TITLE }).first();
  check("admin sees demonstration product", (await row.count()) > 0, TITLE);

  await row.getByRole("button", { name: "Suspend" }).click();
  await page.waitForTimeout(1500);
  const suspended = await context.request.get(`${BASE}/product/${SLUG}`);
  check("suspend removes public availability", suspended.status() === 404, `status=${suspended.status()}`);
  const searchAfter = await (await context.request.get(`${BASE}/api/products?q=tablet&category=all&sort=newest`)).text();
  check("suspended product absent from Shop search", !searchAfter.includes(TITLE), "");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByPlaceholder(/search product/i).fill("Android tablet");
  await page.waitForTimeout(1200);
  const suspendedRow = page.locator("tr", { hasText: TITLE }).first();
  const activate = suspendedRow.getByRole("button", { name: "Activate" });
  check("suspended row exposes Activate", (await activate.count()) > 0, "");
  if (await activate.count()) {
    await activate.click();
    await page.waitForTimeout(1500);
  }
  const restored = await context.request.get(`${BASE}/product/${SLUG}`);
  check("reactivate restores public availability", restored.status() === 200, `status=${restored.status()}`);
  const searchRestored = await (await context.request.get(`${BASE}/api/products?q=tablet&category=all&sort=newest`)).text();
  check("restored product visible in Shop search", searchRestored.includes(TITLE), "");

  await browser.close();
  const failed = checks.filter((c) => !c.ok);
  console.log(JSON.stringify({ base: BASE, checks, passed: checks.length - failed.length, total: checks.length }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error("ADMIN JOURNEY ERROR", error.message);
  process.exit(2);
});
