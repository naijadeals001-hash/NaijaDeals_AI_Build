const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.env.BASE_URL ?? "http://localhost:3015";
const OUT = path.join(process.cwd(), "qa-artifacts", "stream-mobile");
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "320", width: 320, height: 700 },
  { name: "360", width: 360, height: 780 },
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 }
];

const NAV_ITEMS = ["Music", "Podcasts", "Live Events", "Videos", "Creators", "Charts", "Playlists", "Explore Africa", "Your Library", "Liked Songs", "Your Playlists", "Go Premium", "Settings", "Account"];

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--autoplay-policy=no-user-gesture-required"] });
  const results = [];
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 100)));
    await page.goto(`${BASE}/naijastream`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1800);
    const info = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      carousel: Boolean(document.querySelector('[aria-roledescription="carousel"]')),
      slides: document.querySelectorAll('[aria-roledescription="slide"]').length,
      bottomNav: document.querySelectorAll('nav[aria-label="Mobile"]').length,
      serviceTiles: ["Music", "Podcasts", "Videos", "Live Events", "Premium"].every((t) => document.body.innerText.includes(t)),
      trending: /Trending songs/i.test(document.body.innerText),
      explore: /Explore Africa/i.test(document.body.innerText)
    }));
    await page.screenshot({ path: path.join(OUT, `home-${vp.name}.png`), fullPage: false });
    results.push({ vp: vp.name, ...info, errors: errors.length });
    await page.close();
  }

  // Mobile drawer parity
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/naijastream`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /open all navigation/i }).click();
  await page.waitForTimeout(600);
  const drawer = await page.evaluate((items) => {
    const dialog = document.querySelector('[role="dialog"]');
    const text = dialog?.innerText ?? "";
    return { opened: Boolean(dialog), missing: items.filter((item) => !text.includes(item)), links: dialog?.querySelectorAll("a").length ?? 0 };
  }, NAV_ITEMS);
  await page.screenshot({ path: path.join(OUT, "drawer.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const closed = await page.evaluate(() => !document.querySelector('[role="dialog"]'));

  // Carousel controls
  await page.getByRole("button", { name: /next slide/i }).click();
  await page.waitForTimeout(500);
  const nextOk = await page.evaluate(() => document.body.innerText.includes("EVERY BEAT HAS A"));
  await page.getByRole("button", { name: /previous slide/i }).click();
  await page.waitForTimeout(500);
  const prevOk = await page.evaluate(() => document.body.innerText.includes("AFRICA TO THE"));
  const pauseBtn = await page.getByRole("button", { name: /pause automatic rotation/i }).count();

  // Auto-rotation
  await page.waitForTimeout(7000);
  const rotated = await page.evaluate(() => !document.body.innerText.includes("AFRICA TO THE WORLD") || /EVERY BEAT|VOICES WORTH/i.test(document.body.innerText));

  // Mini player expands
  await page.locator('button[aria-label^="Play "]').first().click();
  await page.waitForTimeout(2500);
  const audio = await page.evaluate(() => Number((document.querySelector("audio")?.currentTime || 0).toFixed(2)));
  await page.getByRole("button", { name: /open full player/i }).click();
  await page.waitForTimeout(800);
  const expanded = await page.evaluate(() => Boolean(document.querySelector('[aria-label="Player"]')));
  await page.screenshot({ path: path.join(OUT, "player-expanded.png") });

  await browser.close();
  console.log(JSON.stringify({ viewports: results, drawer, drawerClosed: closed, carousel: { nextOk, prevOk, pauseButton: pauseBtn, rotated }, player: { audioAdvanced: audio, expanded } }, null, 1));
})();
