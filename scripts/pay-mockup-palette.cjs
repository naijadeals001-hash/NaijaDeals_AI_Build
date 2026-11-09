/**
 * Samples the approved NaijaPay mockup so the page uses its real colours
 * instead of values guessed from a screenshot. Prints the dominant colours of
 * each region plus a cluster summary.
 *
 * Usage: node scripts/pay-mockup-palette.mjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const MOCKUP = path.join(process.cwd(), "design-references", "approved", "NaijaPay", "NaijaPay_ A Brighter Nigeria.png");

const REGIONS = {
  "hero-background": [10, 60, 120, 60],
  "hero-headline": [52, 115, 300, 40],
  "hero-button": [52, 250, 200, 40],
  "hero-gold": [310, 40, 60, 40],
  "phone-card-green": [30, 400, 200, 80],
  "bill-promo-card": [30, 520, 200, 30],
  "marketing-1": [20, 1290, 300, 80],
  "marketing-2": [340, 1290, 300, 80],
  "footer-line": [20, 1480, 900, 30]
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const dataUrl = "data:image/png;base64," + fs.readFileSync(MOCKUP).toString("base64");
  await page.setContent(`<img id="m" src="${dataUrl}" style="display:block">`);
  await page.waitForFunction(() => {
    const img = document.getElementById("m");
    return img && img.complete && img.naturalWidth > 0;
  });

  const out = await page.evaluate((regions) => {
    const img = document.getElementById("m");
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const hex = (r, g, b) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
    const result = { size: { w: img.naturalWidth, h: img.naturalHeight }, regions: {} };
    for (const [name, [x, y, w, h]] of Object.entries(regions)) {
      const pixels = ctx.getImageData(x, y, w, h).data;
      const counts = new Map();
      for (let i = 0; i < pixels.length; i += 4 * 3) {
        // Quantise to 8 levels per channel so near-identical shades cluster.
        const r = Math.round(pixels[i] / 8) * 8;
        const g = Math.round(pixels[i + 1] / 8) * 8;
        const b = Math.round(pixels[i + 2] / 8) * 8;
        const key = hex(Math.min(r, 255), Math.min(g, 255), Math.min(b, 255));
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      result.regions[name] = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, n]) => `${c} (${n})`);
    }
    return result;
  }, REGIONS);

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
