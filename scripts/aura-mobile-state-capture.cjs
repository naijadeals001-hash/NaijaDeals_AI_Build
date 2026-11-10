/**
 * Captures the mobile screen in the state the approved mockup shows, as a
 * signed-in user whose conversation has produced results.
 *
 * Usage: node scripts/aura-mobile-state-capture.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3015";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(process.cwd(), "qa-artifacts", "aura-compare");

const SECTIONS = [
  "Aura AI", "by NaijaDeals", "Built around your world", "Less searching", "More living",
  "One conversation. Your NaijaDeals world.", "Shop", "Eats", "Drive", "More",
  "Plan a relaxed Saturday in Abuja for two.", "Let's make a day of it", "A quiet stay",
  "NaijaStay", "NaijaEats", "Add a ride with NaijaDrive", "Your Saturday plan", "Draft",
  "Stay", "Meal", "Ride", "Review options", "Nothing is booked until you confirm",
  "Ask Aura anything", "Chat", "Explore", "Tasks", "Saved"
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: "naijapay-test-sender@naijadeals.test", password: "NaijaPayTest123!" })
    });
  });
  await page.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });
  // Wait for the seeded turn to finish streaming.
  await page.waitForTimeout(22000);
  await page.screenshot({ path: path.join(OUT, "mobile-populated.png"), fullPage: false });
  await page.screenshot({ path: path.join(OUT, "mobile-populated-full.png"), fullPage: true });

  const text = await page.evaluate(() => document.body.innerText);
  const missing = SECTIONS.filter((s) => !text.includes(s));
  console.log(`\n${SECTIONS.length - missing.length}/${SECTIONS.length} mockup elements present`);
  if (missing.length) console.log("MISSING:", missing.join(" | "));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`horizontal overflow: ${overflow}px`);

  await browser.close();
})();
