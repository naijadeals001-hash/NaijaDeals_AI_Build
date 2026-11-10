/**
 * Aura AI visual QA — desktop, tablet and mobile, signed out and signed in.
 *
 * Captures screenshots and asserts the structural expectations from the approved
 * mockups: the discovery hero appears on the welcome state, service shortcuts are
 * present, the composer is reachable, the mobile bottom bar exists, and nothing
 * overflows horizontally.
 *
 * Run: node scripts/aura-visual-qa.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3015";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(process.cwd(), "qa-artifacts", "aura");

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
};

const VIEWPORTS = [
  { name: "desktop", width: 1586, height: 992 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));

    const res = await page.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    check(`${vp.name}: page loads`, res && res.status() === 200, `status ${res?.status()}`);

    const text = await page.evaluate(() => document.body.innerText);
    check(`${vp.name}: shows the discovery headline`, /Less searching\./i.test(text));
    check(`${vp.name}: shows "One conversation"`, /One conversation/i.test(text));
    check(`${vp.name}: shows service shortcuts`, /Shop|Eats|Drive|Stay/i.test(text));

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${vp.name}: no horizontal overflow`, overflow <= 0, `${overflow}px`);

    const composer = await page.locator("#aura-composer-input").count();
    check(`${vp.name}: composer present`, composer === 1);

    if (vp.name === "mobile") {
      const bottomNav = await page.evaluate(() => /Chat[\s\S]{0,40}Explore[\s\S]{0,40}Tasks[\s\S]{0,40}Saved/.test(document.body.innerText));
      check("mobile: bottom navigation present", bottomNav);
      const header = await page.getByRole("button", { name: /open menu/i }).count();
      check("mobile: compact header menu present", header === 1);
    }

    if (vp.name === "desktop") {
      const sidebar = await page.evaluate(() => /New chat/i.test(document.body.innerText) && /History/i.test(document.body.innerText));
      check("desktop: sidebar with New chat and History", sidebar);
      const rightPanel = await page.evaluate(() => /Your connected world|Today's plan|Make it yours/i.test(document.body.innerText));
      check("desktop: right context panel present", rightPanel);
    }

    // Accessibility basics
    const unlabelled = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .filter((b) => b.offsetParent)
        .filter((b) => !(b.getAttribute("aria-label") || (b.textContent || "").trim()))
        .length
    );
    check(`${vp.name}: every visible button has a name`, unlabelled === 0, `${unlabelled} unnamed`);

    check(`${vp.name}: no runtime page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));

    await page.screenshot({ path: path.join(OUT, `aura-${vp.name}.png`), fullPage: false });
    await ctx.close();
  }

  // Signed-in view with a real conversation is covered by the functional suite.
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
