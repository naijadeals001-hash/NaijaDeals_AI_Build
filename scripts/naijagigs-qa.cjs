/** NaijaGigs responsive + imagery QA across the mockup's routes and widths. */
const { chromium } = require("playwright-core");
const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const VIEWPORTS = [["320",320,640],["390",390,844],["768",768,1024],["1024",1024,768],["1440",1440,900],["1920",1920,1080]];
const ROUTES = ["/naijagigs","/naijagigs/services","/naijagigs/jobs","/naijagigs/professionals","/naijagigs/post-job","/naijagigs/how-it-works","/naijagigs/stories","/naijagigs/government","/naijagigs/notifications"];
let passed = 0; const failures = [];
const check = (n, ok, d) => { if (ok) passed += 1; else failures.push(`${n}${d ? ` — ${d}` : ""}`); };
(async () => {
  const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  for (const [label, width, height] of VIEWPORTS) {
    const ctx = await b.newContext({ viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768 });
    for (const route of ROUTES) {
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
      await page.goto(BASE + route, { waitUntil: "load", timeout: 120000 });
      await page.evaluate(async () => {
        for (const card of document.querySelectorAll("[data-category]")) { card.scrollIntoView({ block: "nearest", inline: "center" }); await new Promise((r) => setTimeout(r, 40)); }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(900);
      const m = await page.evaluate(() => {
        const cards = [...document.querySelectorAll("[data-category]")];
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          main: Boolean(document.querySelector("#main-content")),
          cards: cards.length,
          withImg: cards.filter((c) => c.querySelector("img")).length,
          loaded: cards.filter((c) => { const i = c.querySelector("img"); return i && i.complete && i.naturalWidth > 0; }).length
        };
      });
      check(`${label} ${route} no overflow`, m.overflow <= 0, `${m.overflow}px`);
      check(`${label} ${route} main landmark`, m.main);
      if (m.cards) check(`${label} ${route} every category card has an image`, m.withImg === m.cards && m.loaded === m.cards, `${m.loaded}/${m.cards}`);
      check(`${label} ${route} no console errors`, errors.length === 0, errors[0] || "");
      await page.close();
    }
    if (width >= 1024) {
      const page = await ctx.newPage();
      await page.goto(BASE + "/naijagigs", { waitUntil: "load" });
      await page.waitForTimeout(600);
      const rail = page.locator("ul[aria-label='Explore Service Categories']");
      const overflow = await rail.evaluate((n) => n.scrollWidth > n.clientWidth + 4);
      const before = await rail.evaluate((n) => n.scrollLeft);
      const right = page.locator("button[aria-label='Scroll Explore Service Categories right']");
      if (overflow) {
        await right.click();
        await page.waitForTimeout(600);
        const after = await rail.evaluate((n) => n.scrollLeft);
        check(`${label} category rail scrolls right`, after > before, `${before} → ${after}`);
        await page.locator("button[aria-label='Scroll Explore Service Categories left']").click();
        await page.waitForTimeout(600);
        const back = await rail.evaluate((n) => n.scrollLeft);
        check(`${label} category rail scrolls back`, back < after, `${after} → ${back}`);
      } else {
        // A rail that fits must disable its arrows rather than offer dead controls.
        check(`${label} category rail arrows disabled when it fits`, await right.isDisabled());
      }
      const h1 = (await page.locator("h1").first().innerText()).toLowerCase();
      check(`${label} hero headline matches mockup`, h1.includes("find skills"), h1);
      await page.close();
    }
    await ctx.close();
  }
  await b.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.error(failures.slice(0, 25).join("\n")); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
