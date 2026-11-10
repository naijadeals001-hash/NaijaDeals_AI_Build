/**
 * Aura AI visual QA — desktop, tablet and mobile, signed out.
 *
 * Captures screenshots and asserts the structural expectations from the approved
 * mockups: the discovery hero appears on the welcome state, service shortcuts are
 * present, the composer is reachable, the mobile bottom bar exists, and nothing
 * overflows horizontally.
 *
 * Run: node scripts/aura-visual-qa.cjs
 *
 * Failure handling: the browser is closed in a `finally`, so it closes after a
 * clean run, after a failed check and after a thrown error. The exit status is
 * set after cleanup; `process.exit()` is never called before the browser closes,
 * because that would skip it.
 *
 * Failure injection (opt-in, test-only):
 *   AURA_VISUAL_FORCE_FAIL=<substring>  marks the first matching check false
 *   AURA_VISUAL_THROW=1                 throws mid-run to exercise the exception path
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3015";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT = path.join(process.cwd(), "qa-artifacts", "aura");
const FORCE_FAIL = process.env.AURA_VISUAL_FORCE_FAIL ?? "";
const THROW = process.env.AURA_VISUAL_THROW === "1";

let pass = 0;
let fail = 0;
let forcedUsed = false;
const check = (name, ok, detail = "") => {
  const forced = !forcedUsed && FORCE_FAIL && name.includes(FORCE_FAIL);
  if (forced) forcedUsed = true;
  const passed = forced ? false : Boolean(ok);
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}${forced ? " (forced)" : ""}`);
  if (passed) pass++;
  else fail++;
};

const VIEWPORTS = [
  { name: "desktop", width: 1586, height: 992 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let browser;

  try {
    browser = await chromium.launch({ executablePath: CHROME });

    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      try {
        const page = await ctx.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));

        const res = await page.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });
        await page.waitForTimeout(1200);
        check(`${vp.name}: page loads`, res && res.status() === 200, `status ${res?.status()}`);

        if (THROW) throw new Error("injected_runtime_exception");

        const text = await page.evaluate(() => document.body.innerText);
        check(`${vp.name}: shows the discovery headline`, /Less searching\./i.test(text));
        check(`${vp.name}: shows "One conversation"`, /One conversation/i.test(text));
        check(`${vp.name}: shows service shortcuts`, /Shop|Eats|Drive|Stay/i.test(text));

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`${vp.name}: no horizontal overflow`, overflow <= 0, `${overflow}px`);

        // Both layouts are in the DOM; exactly one is visible at any width.
        const composerVisible = await page.locator("#aura-composer-mobile, #aura-composer-desktop").evaluateAll((els) =>
          els.filter((el) => el.offsetParent !== null).length
        );
        check(`${vp.name}: composer present`, composerVisible === 1, `${composerVisible} visible`);

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
      } finally {
        await ctx.close().catch(() => undefined);
      }
    }
  } catch (error) {
    // An exception is a failure of the suite, recorded the same way as a check.
    check(`suite ran without error (${error instanceof Error ? error.message.slice(0, 80) : "unknown"})`, false);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }

  // Set the status after cleanup so the browser is never left open.
  console.log(`\n${pass} passed, ${fail} failed${FORCE_FAIL || THROW ? " (failure injection active)" : ""}`);
  process.exitCode = fail === 0 && pass > 0 ? 0 : 1;
})();
