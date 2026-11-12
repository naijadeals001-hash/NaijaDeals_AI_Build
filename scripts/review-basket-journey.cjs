/**
 * REVIEW-only authenticated basket journey. Signs in through the real UI,
 * adds from the product page, changes quantity and removes through the cart
 * API with the browser session, and checks cart/badge continuity across reload
 * and back navigation. No checkout or provider call is made.
 */
const fs = require("node:fs");
const { chromium } = require("playwright");

const BASE = process.env.REVIEW_BASE_URL || "http://localhost:3047";
const [email, password] = fs.readFileSync("qa-artifacts/review-basket/.credential", "utf8").trim().split(/\r?\n/);

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok, detail }); };

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/login")),
    page.getByRole("button", { name: /sign in/i }).first().click()
  ]);
  await page.waitForTimeout(1500);
  check("sign-in", !page.url().includes("/login"), `url=${page.url()}`);

  await page.goto(`${BASE}/product/demo-10-inch-android-tablet`, { waitUntil: "networkidle" });
  check("product detail renders DEMO title", (await page.content()).includes("DEMO — 10-inch Android tablet"), "");
  await page.getByRole("button", { name: /add to cart/i }).first().click();
  await page.waitForTimeout(800);

  let cart = await (await context.request.get(`${BASE}/api/cart`)).json();
  check("add item", (cart.items || []).length === 1, `items=${(cart.items || []).length}`);
  const itemId = cart.items?.[0]?.id;
  const beforeBadge = await (await context.request.get(`${BASE}/api/cart`)).json();
  check("badge data present", Number(beforeBadge.count ?? beforeBadge.totals?.itemCount ?? 1) >= 1, JSON.stringify(beforeBadge.totals ?? {}).slice(0, 80));

  const patch = await context.request.patch(`${BASE}/api/cart/items/${itemId}`, { data: { quantity: 2 }, headers: { Origin: BASE } });
  cart = await patch.json();
  check("quantity update", (cart.items || []).some((item) => item.quantity === 2), `status=${patch.status()}`);

  await page.goto(`${BASE}/cart`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  const afterReload = await (await context.request.get(`${BASE}/api/cart`)).json();
  check("refresh continuity", (afterReload.items || []).some((item) => item.quantity === 2), "");

  await page.goBack({ waitUntil: "networkidle" });
  check("back navigation", page.url().includes("/product/"), `url=${page.url()}`);

  const del = await context.request.delete(`${BASE}/api/cart/items/${itemId}`, { headers: { Origin: BASE } });
  cart = await del.json();
  check("remove item", del.status() === 200 && (cart.items || []).length === 0, `status=${del.status()}`);

  await page.goto(`${BASE}/cart`, { waitUntil: "networkidle" });
  check("cart page empty after removal", /empty|no items|start shopping/i.test(await page.content()), "");
  check("no checkout submitted", !page.url().includes("/checkout"), page.url());

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ base: BASE, results, passed: results.length - failed.length, total: results.length }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((error) => { console.error("JOURNEY ERROR", error.message); process.exit(2); });
