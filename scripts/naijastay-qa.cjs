/** NaijaStay responsive + imagery QA across the mockup's widths and routes. */
const { chromium } = require("playwright-core");
const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const VIEWPORTS = [["320",320,640],["360",360,800],["390",390,844],["430",430,932],["768",768,1024],["1024",1024,768],["1440",1440,900]];
const ROUTES = ["/naijastay","/naijastay/stays","/naijastay/stays/eko-signature-hotel","/naijastay/search","/naijastay/bookings","/naijastay/destinations","/naijastay/how-it-works","/naijastay/help","/naijastay/safety","/naijastay/agents","/naijastay/host","/naijastay/messages","/naijastay/notifications","/naijastay/saved"];
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
      // Reveal every card, including those inside horizontal rails.
      await page.evaluate(async () => {
        for (const card of document.querySelectorAll("[data-property], [data-category], [data-destination]")) {
          card.scrollIntoView({ block: "nearest", inline: "center" });
          await new Promise((r) => setTimeout(r, 40));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 30000, polling: 200 }).catch(() => null);
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        const cards = [...document.querySelectorAll("[data-property], [data-category], [data-destination]")];
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
      if (m.cards) check(`${label} ${route} every card has an image`, m.withImg === m.cards && m.loaded === m.cards, `${m.loaded}/${m.cards}`);
      check(`${label} ${route} no console errors`, errors.length === 0, errors[0] || "");
      await page.close();
    }
    if (width >= 1024) {
      const page = await ctx.newPage();
      await page.goto(BASE + "/naijastay", { waitUntil: "load" });
      const h1 = (await page.locator("h1").first().innerText()).toLowerCase();
      check(`${label} hero headline matches mockup`, h1.includes("find a place"), h1);
      const cats = page.locator("ul[aria-label='Category carousel']");
      const before = await cats.evaluate((n) => n.scrollLeft);
      const right = page.locator("button[aria-label='Scroll Category carousel right']");
      if (await right.isEnabled()) {
        await right.click(); await page.waitForTimeout(600);
        const after = await cats.evaluate((n) => n.scrollLeft);
        check(`${label} category rail scrolls`, after > before, `${before} → ${after}`);
      } else {
        check(`${label} category rail arrows disabled when it fits`, true);
      }
      await page.close();
    }
    await ctx.close();
  }
  await b.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.error(failures.slice(0, 25).join("\n")); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
