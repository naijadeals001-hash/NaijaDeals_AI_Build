const { chromium } = require("playwright-core");
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3015";

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.evaluate(async () =>
    (
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: "admin@naijadeals.local", password: "AdminPass123!" })
      })
    ).status
  );
  await page.goto(`${BASE}/admin?module=aura&tab=aura`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  const text = await page.evaluate(() => document.body.innerText);
  for (const marker of ["Aura AI", "PROVIDER", "USAGE, LAST 7 DAYS", "TOOL REGISTRY"]) {
    console.log(`${text.includes(marker) ? "PASS" : "FAIL"}  ${marker}`);
  }
  console.log(`${/no model provider/i.test(text) ? "FAIL" : "PASS"}  stale 'no model provider' copy removed`);
  console.log(`${/deepseek/i.test(text) ? "PASS" : "FAIL"}  provider reported`);
  console.log(`${/toolCalls|Tool calls/i.test(text) ? "PASS" : "FAIL"}  usage statistics present`);
  console.log("has provider model:", /deepseek/i.test(text));
  console.log("leaks content?", /What stays are available/.test(text) ? "FAIL - conversation text present" : "PASS - no conversation content");
  await page.screenshot({ path: "qa-artifacts/aura/aura-admin.png", fullPage: false });
  await browser.close();
})();
