/**
 * Pixel comparison of the Aura implementation against the approved mockups.
 *
 * Playwright captures the page at the mockup's own dimensions; Pixelmatch then
 * reports the fraction of differing pixels and writes a highlighted diff image
 * so each difference can be seen rather than guessed.
 *
 * Both images must be the same size for a like-for-like comparison, so the
 * capture is downscaled to the mockup's dimensions first.
 *
 * Usage: node scripts/aura-pixel-diff.cjs
 */
const { chromium } = require("playwright-core");
const pixelmatch = require("pixelmatch").default ?? require("pixelmatch");
const { PNG } = require("pngjs");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const BASE = process.env.QA_BASE_URL ?? "http://localhost:3015";
const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const REF = path.join(process.cwd(), "design-references", "approved", "AuraAI");
const OUT = path.join(process.cwd(), "qa-artifacts", "aura-diff");
const ACCOUNT = { email: "naijapay-test-sender@naijadeals.test", password: "NaijaPayTest123!" };
const QUESTION = "Plan a relaxed Saturday in Abuja for two.";

const TARGETS = [
  {
    name: "desktop",
    reference: "aura-desktop-dark.png",
    width: 1586,
    height: 992,
    composer: "#aura-composer-desktop",
    settle: 26000
  },
  {
    name: "mobile",
    reference: "aura-mobile-dark.png",
    width: 390,
    height: 844,
    composer: "#aura-composer-mobile",
    settle: 26000
  }
];

function resize(input, width, height, output) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-vf", `scale=${width}:${height}:flags=lanczos`, output]);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const summary = [];

  for (const target of TARGETS) {
    const ctx = await browser.newContext({ viewport: { width: target.width, height: target.height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.evaluate(async (account) => {
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(account)
      });
    }, ACCOUNT);
    await page.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    const composer = page.locator(target.composer).first();
    await composer.waitFor({ state: "visible", timeout: 15000 });
    await composer.fill(QUESTION);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(target.settle);
    for (let i = 0; i < 40; i += 1) {
      if ((await page.getByRole("button", { name: /stop generating/i }).count()) === 0) break;
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(1000);

    const shot = path.join(OUT, `${target.name}-implementation-raw.png`);
    await page.screenshot({ path: shot });

    const normalised = path.join(OUT, `${target.name}-implementation.png`);
    resize(shot, target.width, target.height, normalised);

    const refPath = path.join(REF, target.reference);
    const refResized = path.join(OUT, `${target.name}-reference.png`);
    resize(refPath, target.width, target.height, refResized);

    const a = PNG.sync.read(fs.readFileSync(refResized));
    const b = PNG.sync.read(fs.readFileSync(normalised));
    const diff = new PNG({ width: target.width, height: target.height });
    const differing = pixelmatch(a.data, b.data, diff.data, target.width, target.height, {
      threshold: 0.12,
      includeAA: false,
      diffColor: [255, 40, 90]
    });
    const diffPath = path.join(OUT, `${target.name}-diff.png`);
    fs.writeFileSync(diffPath, PNG.sync.write(diff));

    // Report the difference per horizontal band so it is clear *where* the two
    // diverge (header / hero / cards / rails) rather than only a total.
    const bands = 8;
    const bandH = Math.floor(target.height / bands);
    const perBand = [];
    for (let band = 0; band < bands; band += 1) {
      let count = 0;
      for (let y = band * bandH; y < Math.min((band + 1) * bandH, target.height); y += 1) {
        for (let x = 0; x < target.width; x += 1) {
          const i = (target.width * y + x) * 4;
          if (diff.data[i] === 255 && diff.data[i + 1] === 40 && diff.data[i + 2] === 90) count += 1;
        }
      }
      perBand.push(Number(((count / (bandH * target.width)) * 100).toFixed(1)));
    }

    const percent = Number(((differing / (target.width * target.height)) * 100).toFixed(2));
    summary.push({ view: target.name, percent, perBand, diffPath });
    console.log(`[${target.name}] ${percent}% of pixels differ`);
    console.log(`   bands (top→bottom, % differing): ${perBand.join(", ")}`);
    console.log(`   diff image: ${diffPath}`);

    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2));
})();
