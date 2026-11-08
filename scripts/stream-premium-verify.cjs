// Premium subscription journey: plans → wallet payment → entitlement → cancel,
// with ledger balance and idempotency checks.
const { chromium } = require("playwright-core");

const BASE = process.env.BASE_URL ?? "http://localhost:3015";
let passed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { passed += 1; console.log(`  PASS ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ email: "customer@naijadeals.local", password: "CustomerPass123!" }) });
  });

  // Reset any subscription left by a previous run so this run is repeatable.
  await page.evaluate(async () => {
    const res = await fetch("/api/stream/premium", { credentials: "include" });
    const body = await res.json().catch(() => ({}));
    if (body.subscription) {
      await fetch("/api/stream/premium", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "cancel" }) });
      // allow the server to settle before subscribing again
      await new Promise((r) => setTimeout(r, 500));
    }
  });

  const plansRes = await page.evaluate(async () => (await fetch("/api/stream/premium/plans")).json());
  check("plan catalogue loads", (plansRes.plans ?? []).length >= 3, String(plansRes.plans?.length));

  const before = await page.evaluate(async () => (await fetch("/api/wallet", { credentials: "include" })).json());
  const walletBefore = BigInt(before.availableKobo ?? 0);

  const subscribe = await page.evaluate(async () => {
    const res = await fetch("/api/stream/premium", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "subscribe", planCode: "BASIC" }) });
    return { status: res.status, body: await res.json() };
  });
  const ok = subscribe.status === 200 && subscribe.body.charged === true;
  check("subscription paid from wallet", ok, JSON.stringify(subscribe.body).slice(0, 120) || JSON.stringify(subscribe.body.error));

  const after = await page.evaluate(async () => (await fetch("/api/wallet", { credentials: "include" })).json());
  const walletAfter = BigInt(after.availableKobo ?? 0);
  if (ok) check("wallet debited by the plan price", walletBefore - walletAfter === 150000n, `${walletBefore} -> ${walletAfter}`);

  const repeat = await page.evaluate(async () => {
    const res = await fetch("/api/stream/premium", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "subscribe", planCode: "BASIC" }) });
    return { status: res.status, body: await res.json() };
  });
  check("repeat subscribe does not charge again", repeat.body?.charged === false || repeat.body?.alreadyActive === true, JSON.stringify(repeat.body).slice(0, 100));

  const state = await page.evaluate(async () => (await fetch("/api/stream/premium", { credentials: "include" })).json());
  check("active subscription reported", state.subscription?.plan?.code === "BASIC", JSON.stringify(state.subscription?.plan?.code));
  check("billing record written", (state.history ?? []).length > 0);

  // Ledger still balances after a subscription payment.
  const admin = await browser.newContext();
  const ap = await admin.newPage();
  await ap.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await ap.evaluate(async () => {
    await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ email: "admin@naijadeals.local", password: "AdminPass123!" }) });
  });
  const recon = await ap.evaluate(async () => (await fetch("/api/admin/finance/reconciliation", { credentials: "include" })).json());
  check("ledger reconciles after subscription", recon.totals?.mismatchedWallets === 0 && (recon.unbalancedTransactions ?? []).length === 0, JSON.stringify(recon.totals));

  const cancel = await page.evaluate(async () => {
    const res = await fetch("/api/stream/premium", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "cancel" }) });
    return { status: res.status, body: await res.json() };
  });
  check("cancellation works", cancel.status === 200 && cancel.body.status === "CANCELLED");

  // UI renders plans for a signed-in listener.
  await page.goto(`${BASE}/naijastream/premium`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const ui = await page.evaluate(() => ({
    hasPlans: /Basic|Premium/.test(document.body.innerText),
    hasCancel: /cancel subscri/i.test(document.body.innerText),
    noStub: !/not available yet/i.test(document.body.innerText)
  }));
  check("premium page shows real plans (no stub)", ui.hasPlans && ui.noStub, JSON.stringify(ui));
  // After cancellation the page correctly offers plans again (no active banner).
  check("cancelled user can resubscribe from the page", ui.hasPlans && !ui.hasCancel, JSON.stringify(ui));
  await page.screenshot({ path: "qa-artifacts/stream-features/premium.png" });

  // Signed-out visitors get an honest sign-in prompt rather than fake plans.
  const guest = await browser.newContext();
  const gp = await guest.newPage();
  await gp.goto(`${BASE}/naijastream/premium`, { waitUntil: "networkidle" });
  await gp.waitForTimeout(1200);
  const guestUi = await gp.evaluate(() => document.body.innerText);
  check("guests see a sign-in prompt, no dead stub", /sign in to subscribe/i.test(guestUi), guestUi.slice(-120));

  await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.error("FAILURES:", failures); process.exit(1); }
})();
