const { chromium } = require("playwright-core");
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3015";

let pass = 0;
let fail = 0;
const check = (n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
  if (ok) pass++;
  else fail++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  // Signed out: private pages send people to sign in, not to an error.
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  for (const path of ["/wallet", "/pay/send", "/pay/escrow"]) {
    const r = await anon.request.get(`${BASE}${path}`, { maxRedirects: 0 });
    const loc = r.headers()["location"] ?? "";
    check(`${path} redirects a visitor to sign in`, r.status() >= 300 && r.status() < 400 && /\/login/.test(loc), `${r.status()} -> ${loc}`);
  }
  await anon.close();

  // Signed in: every NaijaPay page opens and shows its heading.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
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

  const pages = [
    ["/pay", /Pay\. Send\. Receive\./],
    ["/wallet", /Available balance|Your wallet/i],
    ["/pay/send", /Send money/i],
    ["/pay/receive", /Receive/i],
    ["/pay/scan", /Scan/i],
    ["/pay/escrow", /Escrow milestones/i],
    // A customer without a seller account is correctly told so; either the
    // merchant dashboard or that honest gate is a pass.
    ["/pay/business", /Business|seller account/i],
    ["/pay/security", /Security/i]
  ];
  for (const [path, pattern] of pages) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2000);
    const text = await page.evaluate(() => document.body.innerText);
    check(`${path} renders its content`, pattern.test(text), text.slice(0, 60).replace(/\n/g, " "));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${path} has no horizontal overflow`, overflow <= 0, `${overflow}px`);
  }

  await ctx.close();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
