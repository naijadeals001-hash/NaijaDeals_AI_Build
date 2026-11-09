const { chromium } = require("playwright-core");
const BASE = process.env.BASE || "http://127.0.0.1:3015";
const path = process.argv[2] || "/naijafresh";
const name = process.argv[3] || "home";
(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  for (const [label, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: label === "mobile", hasTouch: label === "mobile" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
    await page.goto(BASE + path, { waitUntil: "load" });
    await page.screenshot({ path: `qa-artifacts/naijafresh/${name}-${label}.png`, fullPage: true });
    console.log(label, "overflow:", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), "errors:", errors.length, errors[0] || "");
    await context.close();
  }
  await browser.close();
})();
