import { chromium } from "playwright-core";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3010";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed += 1; console.log("PASS  " + name); }
  else { failed += 1; console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(BASE + "/naijashop", { waitUntil: "networkidle" });
  const browse = await page.evaluate(() => {
    const shelves = Array.from(document.querySelectorAll("article")).filter((article) => article.querySelector("a.group"));
    return {
      shelves: shelves.length,
      perShelf: shelves.map((shelf) => shelf.querySelectorAll("a.group").length),
      broken: Array.from(document.querySelectorAll("img")).filter((img) => !img.complete || img.naturalWidth === 0).length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  check("storefront renders 8 shelves", browse.shelves === 8, String(browse.shelves));
  check("every shelf has 4 products", browse.perShelf.every((n) => n === 4), JSON.stringify(browse.perShelf));
  check("no broken images", browse.broken === 0, String(browse.broken));
  check("desktop has no horizontal overflow", browse.overflow === 0, String(browse.overflow));

  await page.getByRole("button", { name: "All departments" }).first().click();
  await page.waitForTimeout(300);
  check("all-departments drawer opens", (await page.getByText("Shop by Department").count()) === 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("Escape closes the drawer", (await page.getByText("Shop by Department").count()) === 0);

  await page.goto(BASE + "/search?q=phone", { waitUntil: "networkidle" });
  const rows = await page.locator("article").count();
  check("search returns product rows", rows > 0, String(rows));

  const firstProduct = page.locator("a[href^='/product/']").first();
  const href = await firstProduct.getAttribute("href");
  await firstProduct.click();
  await page.waitForTimeout(500);
  check("product details load", (await page.locator("h1").count()) === 1, page.url());

  await page.goto(BASE + "/login?next=/naijashop", { waitUntil: "networkidle" });
  await page.fill("input[type=email]", "customer@naijadeals.local");
  await page.fill("input[type=password]", "CustomerPass123!");
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith("/login")), page.click("button[type=submit]")]);

  await page.goto(BASE + "/search?q=phone", { waitUntil: "networkidle" });
  const add = page.getByRole("button", { name: "Add to cart" }).first();
  const addVisible = await add.count();
  if (addVisible) { await add.click(); await page.waitForTimeout(900); }
  check("add to cart works", addVisible === 1 && (await page.getByText(/added to cart/).count()) === 1);

  const cartResponse = await page.evaluate(async () => {
    const res = await fetch("/api/cart");
    const body = await res.json();
    return { status: res.status, items: body.items?.length ?? 0 };
  });
  check("cart returns the added item", cartResponse.status === 200 && cartResponse.items > 0, JSON.stringify(cartResponse));

  const guard = await page.evaluate(async () => {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: { contactName: "Demo Check", contactPhone: "08030000000", line1: "1 Test Road", city: "Lagos", state: "Lagos", countryCode: "NG" }, saveAddress: false })
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, code: body?.code };
  });
  check("demo inventory cannot checkout", guard.status === 409 && guard.code === "demo_inventory", JSON.stringify(guard));

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.goto(BASE + "/naijashop", { waitUntil: "networkidle" });
  const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("mobile has no horizontal overflow", mobileOverflow === 0, String(mobileOverflow));
  await mobile.screenshot({ path: "qa-artifacts/preview/naijashop-mobile-e2e.png" });
} finally {
  await browser.close();
}
console.log("\nNaijaShop E2E: " + passed + "/" + (passed + failed) + " passed");
if (failed > 0) process.exit(1);
