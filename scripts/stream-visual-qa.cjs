const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.BASE_URL ?? "http://localhost:3017";
const outDir = path.join(process.cwd(), "qa-artifacts", "stream");
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 }
];

const pages = [
  { name: "home", path: "/naijastream" },
  { name: "music", path: "/naijastream/music" },
  { name: "artists", path: "/naijastream/artists" },
  { name: "playlists", path: "/naijastream/playlists" },
  { name: "charts", path: "/naijastream/charts" },
  { name: "search", path: "/naijastream/search?q=lagos" },
  { name: "artist-profile", path: "/naijastream/artists/adaeze-moon" },
  { name: "playlist-detail", path: "/naijastream/playlists/afrobeats-hits" },
  { name: "library", path: "/naijastream/library" },
  { name: "live-honest", path: "/naijastream/live" }
];

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const results = [];
  for (const viewport of viewports) {
    for (const target of pages) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
      const res = await page.goto(`${BASE}${target.path}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
      await page.evaluate(async () => {
        document.querySelectorAll("*").forEach((el) => {
          if (el.scrollWidth > el.clientWidth + 50 && el.clientWidth > 0) el.scrollLeft = el.scrollWidth;
        });
        for (let y = 0; y <= document.body.scrollHeight; y += 500) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 150));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(2000);
      const info = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll("img")).filter((i) => i.offsetParent || i.complete);
        return {
          title: document.title,
          h1: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
          images: imgs.length,
          broken: imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src")),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          playerVisible: Boolean(document.querySelector('[aria-label="Play"], [aria-label="Pause"]')),
          darkBg: getComputedStyle(document.body).backgroundColor
        };
      });
      await page.screenshot({ path: path.join(outDir, `${target.name}-${viewport.name}.png`), fullPage: false, timeout: 15000 }).catch(() => {});
      results.push({ viewport: viewport.name, page: target.name, status: res?.status() ?? 0, ...info, errors });
      await page.close();
    }
  }

  // Player interaction check on desktop
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${BASE}/naijastream`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => document.body.innerText.includes("Nothing playing"));
  await page.locator('button[aria-label^="Play "]').first().click();
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => ({
    nowPlaying: !document.body.innerText.includes("Nothing playing"),
    errorShown: /audio is unavailable|not been published/i.test(document.body.innerText)
  }));
  results.push({ viewport: "desktop", page: "player-interaction", status: 200, ...after, wasEmpty: before });
  await page.screenshot({ path: path.join(outDir, "player-interaction.png") });
  await page.close();

  await browser.close();
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(results, null, 2));
  const failures = results.filter(
    (r) =>
      r.status !== 200 ||
      (r.broken && r.broken.length > 0) ||
      (typeof r.overflow === "number" && r.overflow > 1) ||
      (r.errors && r.errors.length > 0) ||
      (r.page === "player-interaction" && !r.nowPlaying)
  );
  console.log(JSON.stringify(results.map((r) => ({ v: r.viewport, p: r.page, s: r.status, h1: r.h1, img: r.images, broken: r.broken?.length, of: r.overflow, err: r.errors?.length })), null, 0));
  if (failures.length) {
    console.error("STREAM VISUAL FAILURES:", JSON.stringify(failures, null, 2));
    process.exit(1);
  }
  console.log("STREAM VISUAL QA PASSED");
})();
