const { chromium } = require("playwright-core");
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

let pass = 0;
let fail = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
  if (ok) pass++;
  else fail++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3015/login", { waitUntil: "networkidle" });
  await page.evaluate(async () =>
    (
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: "naijapay-test-sender@naijadeals.test", password: "NaijaPayTest123!" })
      })
    ).status
  );

  // Queue an intent directly through the module the UI uses.
  await page.goto("http://localhost:3015/wallet", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const me = await page.evaluate(async () => (await (await fetch("/api/auth/me", { credentials: "include" })).json()).user.id);
  await page.evaluate(async (uid) => {
    const { queueIntent } = await import("/_next/static/chunks/pay-outbox-probe.js").catch(() => ({ queueIntent: null }));
    // Fall back to writing the same storage shape the app uses.
    if (!queueIntent) {
      const key = "naijapay.outbox.v1";
      const item = {
        id: "probe-" + Date.now(),
        kind: "transfer",
        target: "naijapay-test-recipient@naijadeals.test",
        amountKobo: "12345",
        ownerUserId: uid,
        idempotencyKey: "probe" + Date.now(),
        status: "queued",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        confirmedTarget: "naijapay-test-recipient@naijadeals.test",
        confirmedAmountKobo: "12345"
      };
      localStorage.setItem(key, JSON.stringify([item]));
    }
  }, me);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const text = await page.evaluate(() => document.body.innerText);
  check("outbox panel renders", /Waiting to send/i.test(text));
  check("queued intent is listed", /123\.45|12345/.test(text));
  check("queued intent is labelled as awaiting connection", /Queued — awaiting connection/i.test(text));
  check("it is not labelled as sent", !/Payment successful|Transfer sent/i.test(text));
  check("retry and cancel are offered", /Retry/i.test(text) && /Cancel/i.test(text));

  await page.screenshot({ path: "qa-artifacts/naijapay/outbox-mobile.png", fullPage: false });
  await ctx.close();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
