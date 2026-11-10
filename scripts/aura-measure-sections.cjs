/**
 * Reports the exact vertical positions of the major sections in a mockup, so the
 * implementation can be pinned to them instead of approximating.
 *
 * Usage: node scripts/aura-measure-sections.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DIR = path.join(process.cwd(), "design-references", "approved", "AuraAI");

const TARGETS = {
  "aura-desktop-dark.png": {
    columns: { sidebar: [10, 130], centre: [300, 1000], right: [1300, 1500] },
    note: "x-ranges to scan"
  },
  "aura-mobile-dark.png": {
    columns: { full: [40, 850] },
    note: "x-ranges to scan"
  }
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  for (const [file, cfg] of Object.entries(TARGETS)) {
    const url = "data:image/png;base64," + fs.readFileSync(path.join(DIR, file)).toString("base64");
    await page.setContent(`<img id="m" src="${url}">`);
    await page.waitForFunction(() => {
      const i = document.getElementById("m");
      return i && i.complete && i.naturalWidth > 0;
    });
    const out = await page.evaluate((cfg) => {
      const img = document.getElementById("m");
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const res = { size: `${c.width}x${c.height}`, rows: {} };
      // For each column range, record the first and last row containing any
      // "bright" pixel (text or imagery), and the row-to-row brightness profile
      // so gaps between sections are visible.
      for (const [name, [x0, x1]] of Object.entries(cfg.columns)) {
        const profile = [];
        for (let y = 0; y < c.height; y += 1) {
          const d = ctx.getImageData(x0, y, Math.max(1, x1 - x0), 1).data;
          let bright = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] > 90) bright += 1;
          }
          profile.push(bright / (Math.max(1, x1 - x0)));
        }
        // Section boundaries: long runs of near-empty rows separate blocks.
        const gaps = [];
        let runStart = null;
        for (let y = 0; y < profile.length; y += 1) {
          if (profile[y] < 0.02) {
            if (runStart === null) runStart = y;
          } else if (runStart !== null) {
            if (y - runStart >= 12) gaps.push([runStart, y]);
            runStart = null;
          }
        }
        res.rows[name] = gaps.slice(0, 20);
      }
      return res;
    }, cfg);
    console.log(`\n=== ${file} (${out.size}) ===`);
    for (const [col, gaps] of Object.entries(out.rows)) {
      console.log(`  ${col}: gaps ${JSON.stringify(gaps)}`);
    }
  }
  await browser.close();
})();
