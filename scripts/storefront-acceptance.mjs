import { chromium } from "playwright-core";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3010";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
let passed = 0, failed = 0;
const check = (name, ok, detail = "") => { if (ok) { passed++; console.log("PASS  " + name); } else { failed++; console.log("FAIL  " + name + (detail ? " — " + detail : "")); } };
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const login = async (email, password) => {
  const page = await browser.newPage();
  await page.goto(BASE + "/login?next=/admin", { waitUntil: "networkidle" });
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", password);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith("/login")), page.click("button[type=submit]")]);
  return page;
};
try {
  const anon = await browser.newPage();
  await anon.goto(BASE + "/", { waitUntil: "networkidle" });
  const unauth = await anon.evaluate(async () => (await fetch("/api/admin/storefront", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
  check("unauthenticated update blocked", unauth === 401, String(unauth));

  const customer = await login("customer@naijadeals.local", "CustomerPass123!");
  const forbidden = await customer.evaluate(async () => (await fetch("/api/admin/storefront", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
  check("non-staff update forbidden", forbidden === 403, String(forbidden));

  const admin = await login("superadmin@naijadeals.local", "SuperAdminPass123!");
  const initial = await admin.evaluate(async () => (await (await fetch("/api/admin/storefront")).json()));
  const version = initial.version;
  check("admin config exposes version", Number.isInteger(version), JSON.stringify(initial));

  const invalid = await admin.evaluate(async (v) => {
    const results = [];
    for (const body of [
      { version: v, shelfLimit: 0 },
      { version: v, showHero: "yes" },
      { version: v, visibleCategories: ["does-not-exist"] },
      { version: v, heroTitle: "x".repeat(200) }
    ]) {
      const res = await fetch("/api/admin/storefront", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      results.push(res.status);
    }
    return results;
  }, version);
  check("invalid limit/boolean/slug/length rejected", invalid.every((s) => s === 400), JSON.stringify(invalid));

  const stale = await admin.evaluate(async (v) => (await fetch("/api/admin/storefront", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: v - 1, heroTitle: "stale" }) })).status, version);
  check("stale version rejected", stale === 409, String(stale));

  const saved = await admin.evaluate(async (v) => {
    const res = await fetch("/api/admin/storefront", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: v, announcement: "<script>window.__pwned=true</script>Admin test", heroTitle: "Admin test storefront" }) });
    return { status: res.status, body: await res.json().catch(() => null) };
  }, version);
  check("valid version saves", saved.status === 200 && saved.body?.version === version + 1, JSON.stringify(saved));

  const publicConfig = await admin.evaluate(async () => (await (await fetch("/api/storefront")).json()));
  check("public API hides version", publicConfig.version === undefined, JSON.stringify(publicConfig));
  check("public API returns saved copy", publicConfig.heroTitle === "Admin test storefront");

  const shop = await browser.newPage();
  await shop.goto(BASE + "/naijashop", { waitUntil: "networkidle" });
  const xss = await shop.evaluate(() => ({ pwned: Boolean(window.__pwned), text: document.body.innerText.includes("Admin test") }));
  check("announcement rendered as text, not executed", xss.pwned === false && xss.text === true, JSON.stringify(xss));

  const current = await admin.evaluate(async () => (await (await fetch("/api/admin/storefront")).json()));
  const hide = await admin.evaluate(async (v) => (await fetch("/api/admin/storefront", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: v, showDemoProducts: false }) })).status, current.version);
  const hidden = await admin.evaluate(async () => (await (await fetch("/api/storefront")).json()).showDemoProducts);
  check("demo visibility toggles", hide === 200 && hidden === false, JSON.stringify({ hide, hidden }));

  await customer.goto(BASE + "/search?q=laptop", { waitUntil: "networkidle" });
  const add = customer.getByRole("button", { name: "Add to cart" }).first();
  if (await add.count()) await add.click();
  await customer.waitForTimeout(600);
  const guard = await customer.evaluate(async () => {
    const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: { contactName: "Accept", contactPhone: "08030000000", line1: "1 Road", city: "Lagos", state: "Lagos", countryCode: "NG" }, saveAddress: false }) });
    return { status: res.status, code: (await res.json().catch(() => null))?.code };
  });
  check("demo checkout guard intact", guard.status === 409 && guard.code === "demo_inventory", JSON.stringify(guard));

  const after = await admin.evaluate(async () => (await (await fetch("/api/admin/storefront")).json()));
  await admin.evaluate(async (v) => (await fetch("/api/admin/storefront", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: v, showDemoProducts: true, announcement: "Demo inventory. These listings are for visual testing only; prices and stock are illustrative.", heroTitle: "Shop verified sellers across Africa" }) })).status, after.version);

  const audit = await admin.evaluate(async () => {
    const res = await fetch("/api/admin/audit-logs");
    if (!res.ok) return { status: res.status };
    const rows = await res.json();
    const row = (Array.isArray(rows) ? rows : []).find((item) => item.action === "storefront.updated");
    return { status: res.status, found: Boolean(row), actor: row?.actorId ?? null, hasChanges: Boolean(row?.metadata?.changes) };
  });
  check("audit trail records storefront updates", audit.found === true && audit.hasChanges === true && Boolean(audit.actor), JSON.stringify(audit));

  const failPage = await browser.newPage();
  await failPage.route("**/api/storefront", (route) => route.fulfill({ status: 500, body: "boom" }));
  await failPage.goto(BASE + "/naijashop", { waitUntil: "networkidle" });
  const fallback = await failPage.evaluate(() => document.querySelectorAll("article a.group").length);
  check("shop usable when config fetch fails", fallback > 0, String(fallback));
} finally { await browser.close(); }
console.log("\nStorefront acceptance: " + passed + "/" + (passed + failed) + " passed");
if (failed > 0) process.exit(1);
