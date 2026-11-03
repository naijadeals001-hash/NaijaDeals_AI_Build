import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import { getDatabaseClassification, assertLiveFinancialOperations, assertProviderOperation } from "../lib/payments/boundary";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3010";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const db = new PrismaClient();
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log((ok ? "PASS  " : "FAIL  ") + name + (detail ? " — " + detail : "")); if (!ok) failed++; };
const expect403 = async (fn: () => Promise<unknown>) => { try { await fn(); return { blocked: false }; } catch (error) { const e = error as { code?: string }; return { blocked: e.code === "test_funds_boundary", code: e.code }; } };

(async () => {
  const classification = await getDatabaseClassification(db);
  check("shared database is durably classified TEST", classification === "TEST", classification);

  const saved = { NODE_ENV: process.env.NODE_ENV, FINANCIAL_ENV: process.env.FINANCIAL_ENV, ALLOW_LIVE_FINANCIAL_OPERATIONS: process.env.ALLOW_LIVE_FINANCIAL_OPERATIONS };
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  process.env.FINANCIAL_ENV = "live"; process.env.ALLOW_LIVE_FINANCIAL_OPERATIONS = "true";
  const allFlags = await expect403(() => assertLiveFinancialOperations("flag override test", db));
  check("all live flags cannot override TEST database", allFlags.blocked, JSON.stringify(allFlags));
  const sandboxNoCreds = await expect403(() => assertProviderOperation("sandbox test", "paystack", db));
  check("TEST database rejects live/missing provider credentials", sandboxNoCreds.blocked, JSON.stringify(sandboxNoCreds));
  (process.env as Record<string, string | undefined>).NODE_ENV = saved.NODE_ENV;
  process.env.FINANCIAL_ENV = saved.FINANCIAL_ENV; process.env.ALLOW_LIVE_FINANCIAL_OPERATIONS = saved.ALLOW_LIVE_FINANCIAL_OPERATIONS;

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(BASE + "/login?next=/admin", { waitUntil: "networkidle" });
    await page.fill("input[type=email]", "superadmin@naijadeals.local");
    await page.fill("input[type=password]", "SuperAdminPass123!");
    await Promise.all([page.waitForURL((u) => u.pathname.startsWith("/admin")), page.click("button[type=submit]")]);
    const before = await page.evaluate(async () => ({ payouts: (await (await fetch("/api/admin/payouts")).json()).length }));
    const payout = await page.evaluate(async () => {
      const res = await fetch("/api/admin/payouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendorId: "any", periodStart: "2026-01-01", periodEnd: "2026-01-31" }) });
      return { status: res.status, body: await res.json().catch(() => null) };
    });
    check("admin payout creation blocked server-side", payout.status === 403 && payout.body?.code === "test_funds_boundary", JSON.stringify(payout));
    const after = await page.evaluate(async () => ({ payouts: (await (await fetch("/api/admin/payouts")).json()).length }));
    check("blocked payout created no record", before.payouts === after.payouts, JSON.stringify({ before, after }));

    const init = await page.evaluate(async () => {
      const res = await fetch("/api/payments/initialize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "paystack", orderId: "boundary-test" }) });
      return { status: res.status, body: await res.json().catch(() => null) };
    });
    check("live provider initialisation blocked", init.status === 403 && init.body?.code === "test_funds_boundary", JSON.stringify(init));
  } finally {
    await browser.close();
    await db.$disconnect();
  }
  console.log("\nSynthetic-funds boundary: " + (failed === 0 ? "PASS" : failed + " failure(s)"));
  if (failed > 0) process.exit(1);
})().catch((error) => { console.error(error); process.exit(1); });
