/**
 * Samples the approved Aura AI mockups so the implementation uses their real
 * colours rather than the suggested starting tokens.
 *
 * Usage: node scripts/aura-mockup-palette.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DIR = path.join(process.cwd(), "design-references", "approved", "AuraAI");

const REGIONS = {
  desktop: {
    "sidebar-bg": [10, 400, 60, 120],
    "canvas-bg": [300, 300, 100, 60],
    "composer-bg": [320, 355, 300, 30],
    "mint-button": [140, 130, 90, 30],
    "newchat-mint": [16, 115, 220, 34],
    "right-panel-bg": [1240, 400, 100, 60],
    "plan-card-bg": [1240, 900, 100, 40],
    "makeit-yours": [1240, 540, 100, 40],
    "gold-badge": [330, 110, 120, 20]
  },
  mobile: {
    "canvas-bg": [20, 700, 80, 60],
    "service-tile": [30, 435, 100, 60],
    "mint-action": [60, 1355, 400, 40],
    "plan-card": [40, 1180, 300, 40],
    "composer": [60, 1500, 300, 30],
    "bottom-nav": [20, 1650, 100, 40]
  }
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const out = {};
  for (const [name, regions] of Object.entries(REGIONS)) {
    const file = path.join(DIR, name === "desktop" ? "aura-desktop-dark.png" : "aura-mobile-dark.png");
    const dataUrl = "data:image/png;base64," + fs.readFileSync(file).toString("base64");
    await page.setContent(`<img id="m" src="${dataUrl}">`);
    await page.waitForFunction(() => {
      const img = document.getElementById("m");
      return img && img.complete && img.naturalWidth > 0;
    });
    out[name] = await page.evaluate((regions) => {
      const img = document.getElementById("m");
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const hex = (r, g, b) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
      const result = { size: `${img.naturalWidth}x${img.naturalHeight}` };
      for (const [region, [x, y, w, h]] of Object.entries(regions)) {
        const cw = Math.min(w, img.naturalWidth - x);
        const ch = Math.min(h, img.naturalHeight - y);
        const px = ctx.getImageData(x, y, cw, ch).data;
        const counts = new Map();
        for (let i = 0; i < px.length; i += 4 * 3) {
          const r = Math.round(px[i] / 4) * 4;
          const g = Math.round(px[i + 1] / 4) * 4;
          const b = Math.round(px[i + 2] / 4) * 4;
          const key = hex(Math.min(r, 255), Math.min(g, 255), Math.min(b, 255));
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        result[region] = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c} (${n})`);
      }
      return result;
    }, regions);
  }
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
