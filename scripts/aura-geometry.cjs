/**
 * Reads the rendered geometry of each Aura section and compares it with the
 * positions measured from the approved references. Prints the delta per section,
 * which is what actually drives the fixes.
 *
 * Usage: node scripts/aura-geometry.cjs
 */
const { chromium } = require("playwright-core");

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3015";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

// Measured from the reference files (see docs/aura-reference-measurements.md).
const EXPECTED = {
  mobile: { width: 390, height: 763, sections: { hero: 30, tiles: 187, bubble: 247, heading: 331, cards: 360 } },
  desktop: { width: 1586, height: 992, sections: { badge: 94, composer: 336, chips: 424, cards: 541 } }
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  const mctx = await browser.newContext({ viewport: { width: 390, height: 763 }, deviceScaleFactor: 1 });
  const mp = await mctx.newPage();
  await mp.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await mp.evaluate(async (a) => {
    await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(a) });
  }, { email: "aura-mockup-fixture@naijadeals.test", password: process.env.AURA_FIXTURE_PASSWORD ?? "" });
  await mp.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });
  await mp.waitForTimeout(1800);

  const mobile = await mp.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll("[data-aura]")) {
      const key = el.getAttribute("data-aura");
      const r = el.getBoundingClientRect();
      out[key] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }
    return out;
  });
  console.log("MOBILE rendered vs reference y:");
  for (const [k, want] of Object.entries(EXPECTED.mobile.sections)) {
    const got = mobile[k];
    if (!got) { console.log(`  ${k.padEnd(9)} MISSING`); continue; }
    console.log(`  ${k.padEnd(9)} y=${String(got.y).padStart(4)}  reference=${String(want).padStart(4)}  delta=${got.y - want}`);
  }
  await mctx.close();
  await browser.close();
})();
