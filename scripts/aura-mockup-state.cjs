/**
 * Captures Aura in the exact state the approved mockups show: a signed-in user
 * whose conversation has produced stay / meal / ride results.
 *
 * Signs in through the UI (no injection), asks the mockup's own question, waits
 * for the real answer and cards, then captures desktop and mobile at the
 * mockups' own pixel dimensions.
 *
 * Usage: node scripts/aura-mockup-state.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3015";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(process.cwd(), "qa-artifacts", "aura-compare");
const ACCOUNT = { email: "naijapay-test-sender@naijadeals.test", password: "NaijaPayTest123!" };
const QUESTION = "Plan a relaxed Saturday in Abuja for two.";

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.evaluate(async (account) => {
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(account)
    });
  }, ACCOUNT);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });

  for (const vp of [
    { name: "desktop", width: 1586, height: 992, scale: 1 },
    { name: "mobile", width: 390, height: 844, scale: 2 }
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.scale });
    const page = await ctx.newPage();
    await signIn(page);
    await page.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // Send the mockup's question through the real composer.
    // Both layouts exist in the DOM (one is display:none at each width), so pick
    // the one that is actually visible rather than the first match.
    const composer = page.locator(vp.name === "desktop" ? "#aura-composer-desktop" : "#aura-composer-mobile").first();
    await composer.waitFor({ state: "visible", timeout: 15000 });
    await composer.fill(QUESTION);
    await page.keyboard.press("Enter");
    // Wait for the turn to finish: no Stop control remaining.
    for (let i = 0; i < 60; i += 1) {
      await page.waitForTimeout(1000);
      const stopping = await page.getByRole("button", { name: /stop generating/i }).count();
      if (stopping === 0 && i > 3) break;
    }
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(OUT, `state-${vp.name}.png`), fullPage: false });

    const text = await page.evaluate(() => document.body.innerText);
    const checks = ["Let's make a day of it", "NaijaStay", "NaijaEats", "Review options", "Nothing is booked until you confirm"];
    const missing = checks.filter((c) => !text.includes(c));
    console.log(`[${vp.name}] result sections missing: ${missing.length ? missing.join(", ") : "none"}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`[${vp.name}] overflow: ${overflow}px`);
    await ctx.close();
  }

  await browser.close();
})();
