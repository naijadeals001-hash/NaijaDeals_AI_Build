/**
 * Country-scoped administrator check against the running REVIEW preview.
 * A GH-scoped admin must not see or mutate NG catalogue records.
 */
const fs = require("node:fs");
const { chromium } = require("playwright");
const BASE = process.env.REVIEW_BASE_URL || "http://localhost:3047";
const [email, password] = fs.readFileSync("qa-artifacts/review-basket/.gh-admin-credential", "utf8")
  .trim().split(String.fromCharCode(10)).map((line) => line.trim());
const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok, detail });

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const request = context.request;
  const login = await request.post(`${BASE}/api/auth/login`, { data: { email, password }, headers: { Origin: BASE } });
  check("GH-scoped admin signs in", login.status() === 200, `status=${login.status()}`);

  const catalogue = await (await request.get(`${BASE}/api/admin/catalogue`)).json();
  const ngProduct = catalogue.products?.find((entry) => entry.name === "DEMO — 10-inch Android tablet");
  check("scoped list excludes NG products", !ngProduct, `visible=${catalogue.products?.length ?? "none"}`);

  const list = await fetch(`${BASE}/api/admin/catalogue`);
  check("anonymous list still 401", list.status === 401, `status=${list.status}`);

  const target = "cmwdyexl50005v4s0txgo7qfa";
  const denied = await request.patch(`${BASE}/api/admin/catalogue/products`, {
    data: { id: target, action: "unpublish" },
    headers: { Origin: BASE }
  });
  check("scoped admin cannot unpublish an NG product", denied.status() === 403, `status=${denied.status()} body=${(await denied.text()).slice(0, 80)}`);

  const create = await request.post(`${BASE}/api/admin/catalogue/products`, {
    data: {
      name: "GH scope probe",
      description: "This probe must be refused for a GH-scoped administrator targeting NG.",
      priceKobo: 100000,
      categoryId: "cmwdyexl40003v4s001cgi3ua",
      countryCode: "NG",
      currency: "NGN",
      isDemo: true
    },
    headers: { Origin: BASE }
  });
  check("scoped create outside scope refused", create.status() === 403 || create.status() === 400, `status=${create.status()}`);

  const active = await (await request.get(`${BASE}/api/products?category=all&sort=newest`)).text();
  check("NG catalogue remains public and intact", active.includes("DEMO — 10-inch Android tablet"), "");

  await browser.close();
  const failed = checks.filter((entry) => !entry.ok);
  console.log(JSON.stringify({ checks, passed: checks.length - failed.length, total: checks.length }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((error) => { console.error("SCOPE JOURNEY ERROR", error.message); process.exit(2); });
