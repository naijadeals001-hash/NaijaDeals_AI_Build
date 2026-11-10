/**
 * Captures Aura at mockup dimensions for visual comparison, plus a DOM audit of
 * every section the mockups contain.
 *
 * Usage: node scripts/aura-compare-capture.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3015";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(process.cwd(), "qa-artifacts", "aura-compare");

const DESKTOP_SECTIONS = [
  "Aura AI", "by NaijaDeals", "New chat", "Discover", "Conversations", "My tasks", "Saved", "History", "Settings",
  "Your everyday intelligence", "Built around your world", "Less searching", "More living",
  "One conversation connects your NaijaDeals world", "Find something", "Plan my day", "Compare options",
  "Create with Aura", "Your connected world", "Today's plan", "Draft", "Choose a stay", "Pick a meal",
  "Arrange a ride", "Make it yours", "Personalised suggestions", "Use saved preferences", "Manage privacy",
  "Made for life", "across Africa", "Check important details"
];

const MOBILE_SECTIONS = [
  "Aura AI", "by NaijaDeals", "Built around your world", "Less searching", "More living",
  "One conversation. Your NaijaDeals world.", "Shop", "Eats", "Drive", "More",
  "Ask Aura anything", "Chat", "Explore", "Tasks", "Saved"
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });

  for (const vp of [
    { name: "desktop", width: 1586, height: 992 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, `discover-${vp.name}.png`) });

    const text = await page.evaluate(() => document.body.innerText);
    const expected = vp.name === "desktop" ? DESKTOP_SECTIONS : MOBILE_SECTIONS;
    const missing = expected.filter((s) => !text.includes(s));
    console.log(`\n[${vp.name}] ${expected.length - missing.length}/${expected.length} sections present`);
    if (missing.length) console.log("MISSING:", missing.join(" | "));

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`[${vp.name}] horizontal overflow: ${overflow}px`);
    await ctx.close();
  }

  await browser.close();
})();
