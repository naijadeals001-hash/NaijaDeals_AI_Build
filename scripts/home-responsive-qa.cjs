/** Responsive QA for all four homepage designs at the directive's widths. */
const { chromium } = require("playwright-core");
const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const WIDTHS = [[320,640],[360,800],[375,812],[390,844],[412,915],[430,932],[768,1024],[1024,768],[1440,900],[1920,1080]];
const DESIGNS = ["original","africa-super-app","mobility","commerce"];
let passed = 0; const failures = [];
const check = (n, ok, d) => { if (ok) passed += 1; else failures.push(`${n}${d ? ` — ${d}` : ""}`); };
(async () => {
  const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  for (const key of DESIGNS) {
    for (const [w, h] of WIDTHS) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 768 });
      const p = await ctx.newPage();
      const errors = [];
      p.on("pageerror", (e) => errors.push(String(e).slice(0, 100)));
      await p.goto(`${BASE}/designs`, { waitUntil: "domcontentloaded" });
      await p.evaluate(async (k) => fetch("/api/home/design", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ variant: k }) }), key);
      await p.goto(`${BASE}/`, { waitUntil: "load" });
      await p.evaluate(async () => { for (let y=0;y<Math.min(document.body.scrollHeight,3000);y+=400){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,50));} window.scrollTo(0,0); });
      await p.waitForTimeout(400);
      const m = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, main: Boolean(document.querySelector("#main-content")), h1: Boolean(document.querySelector("h1")) }));
      check(`${key} ${w}: no horizontal overflow`, m.overflow <= 0, `${m.overflow}px`);
      check(`${key} ${w}: hero headline present`, m.h1);
      check(`${key} ${w}: no console errors`, errors.length === 0, errors[0] || "");
      await ctx.close();
    }
  }
  await b.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.error(failures.slice(0,20).join("\n")); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
