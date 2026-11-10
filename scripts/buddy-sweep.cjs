/**
 * Build Buddy sweep: exercises Aura the way a person does and collects every
 * failure, with the browser console and network errors alongside.
 *
 * Usage: node scripts/buddy-sweep.cjs
 */
const { chromium } = require("playwright-core");

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3015";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ACCOUNT = { email: "aura-mockup-fixture@naijadeals.test", password: process.env.AURA_FIXTURE_PASSWORD ?? "" };

const problems = [];
const note = (where, what) => problems.push({ where, what });

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  for (const vp of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 834, height: 1112 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => note(`${vp.name} console`, `uncaught: ${e.message.slice(0, 120)}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/favicon|net::ERR_ABORTED/i.test(m.text())) note(`${vp.name} console`, m.text().slice(0, 140));
    });
    page.on("response", (r) => {
      if (r.url().includes("/api/aura") && r.status() >= 400) note(`${vp.name} api`, `${r.status()} ${r.url().split("/api")[1]}`);
    });

    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.evaluate(async (a) => {
      await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(a) });
    }, ACCOUNT);

    for (const path of ["/aura-ai", "/aura-ai/conversations", "/aura-ai/plans", "/aura-ai/saved", "/aura-ai/settings"]) {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      if (!res || res.status() >= 400) note(vp.name, `${path} returned ${res?.status()}`);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 0) note(vp.name, `${path} overflows horizontally by ${overflow}px`);

      // Any control with no accessible name is unusable for screen readers.
      const unnamed = await page.evaluate(() =>
        Array.from(document.querySelectorAll("button, a"))
          .filter((el) => el.offsetParent !== null)
          .filter((el) => !(el.getAttribute("aria-label") || (el.textContent || "").trim() || el.getAttribute("title")))
          .length
      );
      if (unnamed > 0) note(vp.name, `${path} has ${unnamed} control(s) with no name`);

      // Images that failed to load.
      const broken = await page.evaluate(() =>
        Array.from(document.querySelectorAll("img")).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute("src"))
      );
      for (const src of broken) note(vp.name, `${path} image failed: ${src}`);
    }
    await ctx.close();
  }

  // Send a message and read the reply on the small screen too.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => note("mobile send", `uncaught: ${e.message.slice(0, 120)}`));
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.evaluate(async (a) => {
    await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(a) });
  }, ACCOUNT);
  await page.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.locator("#aura-composer-mobile").fill("Hello");
  await page.getByRole("button", { name: /send message/i }).first().click();
  await page.waitForTimeout(15000);
  const afterSend = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (afterSend > 0) note("mobile send", `transcript overflows by ${afterSend}px after a reply`);
  const stillHero = await page.evaluate(() => document.body.innerText.includes("Less searching."));
  if (stillHero) note("mobile send", "the welcome hero is still visible during a conversation");
  await ctx.close();

  await browser.close();

  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), count: problems.length, problems }, null, 2));
  require("node:fs").writeFileSync("qa-artifacts/aura/buddy-sweep.json", JSON.stringify({ problems }, null, 2));
  console.log(`\n${problems.length} problem(s) found`);
})();
