/**
 * Admin-led catalogue acceptance: department create/edit → product draft with
 * imagery → preview → publish → Shop visibility → edit → unpublish.
 * Uses the real Control Center UI. Leaves the test department inactive and the
 * test product unpublished; no payment or external call.
 */
const fs = require("node:fs");
const { chromium } = require("playwright");
const BASE = process.env.REVIEW_BASE_URL || "http://localhost:3047";
const [email, password] = fs.readFileSync("qa-artifacts/review-basket/.admin-credential", "utf8").trim().split(/\r?\n/);
const stamp = Date.now().toString(36);
const PRODUCT_NAME = `DEMO — Review workflow blender ${stamp}`;
const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok, detail });

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: /sign in/i }).first().click();
  await page.waitForTimeout(1500);
  await page.goto(`${BASE}/admin/catalogue`, { waitUntil: "networkidle" });
  check("admin catalogue page loads", (await page.getByRole("heading", { name: "Catalogue workflow" }).count()) > 0, page.url());

  const deptSection = page.locator("section", { hasText: "1. Department" });
  if ((await deptSection.getByText("Review Workflow Demo", { exact: false }).count()) === 0) {
    await deptSection.getByLabel("Name").fill("Review Workflow Demo");
    await deptSection.getByLabel(/Image/).fill("/generated/shop/category-home-kitchen.webp");
    await deptSection.getByLabel("Description").fill("DEMO department created through the Control Center catalogue workflow.");
    await deptSection.getByRole("button", { name: /create department|save department/i }).click();
    await page.waitForTimeout(1200);
  }
  check("department exists after create", (await deptSection.getByText("Review Workflow Demo", { exact: false }).count()) > 0, "");

  const activeDeptRow = deptSection.locator("li", { hasText: "Review Workflow Demo" }).first();
  await activeDeptRow.getByRole("button", { name: "Edit" }).click();
  const activeBox = deptSection.locator('input[type="checkbox"]').last();
  if (!(await activeBox.isChecked())) await activeBox.check();
  await deptSection.getByRole("button", { name: /save department/i }).click();
  await page.waitForTimeout(1200);
  const activeDept = (await (await context.request.get(`${BASE}/api/admin/catalogue`)).json()).departments.find((entry) => entry.name === "Review Workflow Demo");
  check("department activated before publishing", Boolean(activeDept) && activeDept.isActive === true, activeDept ? String(activeDept.isActive) : "missing");

  const productSection = page.locator("section", { hasText: "2. Product" });
  await productSection.getByLabel("Name").fill(PRODUCT_NAME);
  await productSection.getByLabel("Price (NGN)").fill("4500");
  await productSection.getByLabel("Department").selectOption({ label: "Review Workflow Demo" });
  await productSection.getByLabel(/Image/).fill("/generated/shop/product-retro-kitchen-blender.webp");
  await productSection.getByLabel("Accessible image text").fill("Demonstration blender used for the catalogue workflow test");
  await productSection.getByLabel("Description").fill("Demonstration listing created through the Control Center catalogue workflow.");
  await productSection.getByRole("button", { name: /create draft/i }).click();
  await page.waitForTimeout(1500);

  const listed = await (await context.request.get(`${BASE}/api/admin/catalogue`)).json();
  const created = (listed.products || []).find((entry) => entry.name === PRODUCT_NAME);
  check("product created as draft", Boolean(created) && created.status === "DRAFT" && created.images.length === 1, created ? `${created.status}/${created.images.length}` : "missing");
  const preview = await context.request.get(`${BASE}/product/${created.slug}`);
  check("draft is not public", preview.status() === 404, `status=${preview.status()}`);

  const row = productSection.locator("tr", { hasText: PRODUCT_NAME }).first();
  await row.getByRole("button", { name: "Publish" }).click();
  await page.waitForTimeout(1500);
  const publishedState = (await (await context.request.get(`${BASE}/api/admin/catalogue`)).json()).products.find((entry) => entry.id === created.id);
  check("server reports product ACTIVE after publish", Boolean(publishedState) && publishedState.status === "ACTIVE", publishedState ? publishedState.status : "missing");
  const publicPage = await context.request.get(`${BASE}/product/${created.slug}`);
  check("publish makes product public", publicPage.status() === 200, `status=${publicPage.status()}`);
  const search = await (await context.request.get(`${BASE}/api/products?q=review+workflow&category=all&sort=newest`)).text();
  check("published product appears in Shop search", search.includes(PRODUCT_NAME), "");

  await row.getByRole("button", { name: "Edit" }).click();
  await productSection.getByLabel("Price (NGN)").fill("4800");
  await productSection.getByRole("button", { name: /save product/i }).click();
  await page.waitForTimeout(1500);
  const edited = (await (await context.request.get(`${BASE}/api/admin/catalogue`)).json()).products.find((entry) => entry.name === PRODUCT_NAME);
  check("admin edit updates price before publish state", edited && edited.priceKobo === "480000", edited ? edited.priceKobo : "missing");

  const updatedRow = productSection.locator("tr", { hasText: PRODUCT_NAME }).first();
  await updatedRow.getByRole("button", { name: "Unpublish" }).click();
  await page.waitForTimeout(1500);
  const after = await context.request.get(`${BASE}/product/${created.slug}`);
  check("unpublish removes public availability", after.status() === 404, `status=${after.status()}`);

  const deptRow = deptSection.locator("li", { hasText: "Review Workflow Demo" }).first();
  await deptRow.getByRole("button", { name: "Edit" }).click();
  await deptSection.getByLabel("Description").fill(`DEMO department edited through the Control Center ${stamp}.`);
  await deptSection.locator('input[type="checkbox"]').last().uncheck();
  await deptSection.getByRole("button", { name: /save department/i }).click();
  await page.waitForTimeout(1200);
  const cleanup = (await (await context.request.get(`${BASE}/api/admin/catalogue`)).json()).departments.find((entry) => entry.name === "Review Workflow Demo");
  check("department edit saved and left inactive", Boolean(cleanup) && cleanup.isActive === false && cleanup.description.includes(stamp), cleanup ? `${cleanup.isActive}/${cleanup.description}` : "missing");
  check("no browser errors", errors.length === 0, errors.slice(0, 2).join(" | "));

  const anonymous = await fetch(`${BASE}/api/admin/catalogue`);
  check("anonymous catalogue read refused", anonymous.status === 401 || anonymous.status === 403, `status=${anonymous.status}`);

  const customerFile = "qa-artifacts/review-basket/.credential";
  if (fs.existsSync(customerFile)) {
    const rawCustomer = fs.readFileSync(customerFile, "utf8").trim().split(String.fromCharCode(10)).map((line) => line.trim());
    const customerEmail = rawCustomer[0];
    const customerPassword = rawCustomer[1];
    const customer = await browser.newContext();
    const login = await customer.request.post(`${BASE}/api/auth/login`, {
      data: { email: customerEmail, password: customerPassword },
      headers: { Origin: BASE }
    });
    const denied = await customer.request.post(`${BASE}/api/admin/catalogue/departments`, {
      data: { name: "Unauthorised Probe", description: "This must be refused by the server." },
      headers: { Origin: BASE }
    });
    check("customer cannot create a department", login.status() === 200 && (denied.status() === 401 || denied.status() === 403), `login=${login.status()} denied=${denied.status()}`);
    await customer.close();
  }

  await browser.close();
  const failed = checks.filter((entry) => !entry.ok);
  console.log(JSON.stringify({ buildSource: "served", checks, passed: checks.length - failed.length, total: checks.length }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error("CATALOGUE JOURNEY ERROR", error.message);
  process.exit(2);
});
