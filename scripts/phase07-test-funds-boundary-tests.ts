import { chromium } from "playwright-core";
import { isLiveFinancialEnvironment } from "../lib/payments/boundary";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3010";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log((ok ? "PASS  " : "FAIL  ") + name + (detail ? " — " + detail : "")); if (!ok) failed++; };

function envCase(nodeEnv: string, financialEnv: string | undefined, allow: string | undefined) {
  const saved = { NODE_ENV: process.env.NODE_ENV, FINANCIAL_ENV: process.env.FINANCIAL_ENV, ALLOW_LIVE_FINANCIAL_OPERATIONS: process.env.ALLOW_LIVE_FINANCIAL_OPERATIONS };
  process.env.NODE_ENV = nodeEnv;
  if (financialEnv === undefined) delete process.env.FINANCIAL_ENV; else process.env.FINANCIAL_ENV = financialEnv;
  if (allow === undefined) delete process.env.ALLOW_LIVE_FINANCIAL_OPERATIONS; else process.env.ALLOW_LIVE_FINANCIAL_OPERATIONS = allow;
  const result = isLiveFinancialEnvironment();
  process.env.NODE_ENV = saved.NODE_ENV; process.env.FINANCIAL_ENV = saved.FINANCIAL_ENV; process.env.ALLOW_LIVE_FINANCIAL_OPERATIONS = saved.ALLOW_LIVE_FINANCIAL_OPERATIONS;
  return result;
}

(async () => {
  check("development environment cannot enable live operations", envCase("development", "live", "true") === false);
  check("production without live classification is blocked", envCase("production", undefined, "true") === false);
  check("production without explicit allow flag is blocked", envCase("production", "live", undefined) === false);
  check("fully configured live environment enables operations", envCase("production", "live", "true") === true);

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(BASE + "/login?next=/admin", { waitUntil: "networkidle" });
    await page.fill("input[type=email]", "superadmin@naijadeals.local");
    await page.fill("input[type=password]", "SuperAdminPass123!");
    await Promise.all([page.waitForURL((u) => u.pathname.startsWith("/admin")), page.click("button[type=submit]")]);

    const before = await page.evaluate(async () => (await (await fetch("/api/admin/payouts")).json()).length);
    const payout = await page.evaluate(async () => {
      const res = await fetch("/api/admin/payouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendorId: "any", periodStart: "2026-01-01", periodEnd: "2026-01-31" }) });
      return { status: res.status, body: await res.json().catch(() => null) };
    });
    check("admin payout creation blocked server-side", payout.status === 403 && payout.body?.code === "test_funds_boundary", JSON.stringify(payout));
    const after = await page.evaluate(async () => (await (await fetch("/api/admin/payouts")).json()).length);
    check("blocked payout created no record", before === after, JSON.stringify({ before, after }));

    const pay = await page.evaluate(async () => {
      const list = await (await fetch("/api/admin/payouts")).json();
      if (!list.length) return { skipped: true };
      const res = await fetch("/api/admin/payouts/" + list[0].id + "/pay", { method: "POST" });
      return { status: res.status, body: await res.json().catch(() => null) };
    });
    if (pay.skipped) console.log("SKIP  payout settlement HTTP check (no payout row)");
    else check("admin payout settlement blocked server-side", pay.status === 403 && pay.body?.code === "test_funds_boundary", JSON.stringify(pay));

    const init = await page.evaluate(async () => {
      const res = await fetch("/api/payments/initialize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "paystack", orderId: "boundary-test" }) });
      return { status: res.status, body: await res.json().catch(() => null) };
    });
    check("live provider initialisation blocked", init.status === 403 && init.body?.code === "test_funds_boundary", JSON.stringify(init));
  } finally {
    await browser.close();
  }
  console.log("\nSynthetic-funds boundary: " + (failed === 0 ? "PASS" : failed + " failure(s)"));
  if (failed > 0) process.exit(1);
})().catch((error) => { console.error(error); process.exit(1); });
