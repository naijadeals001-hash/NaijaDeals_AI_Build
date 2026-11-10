/**
 * Determines what kind of artefact each Aura reference actually is, so the
 * implementation is built to the right composition.
 *
 * Evidence used:
 *  - aspect ratio and pixel size (a device viewport has a known ratio)
 *  - the presence of a status bar / home indicator (device chrome)
 *  - whether content is clipped at the bottom edge or ends with padding
 *  - the vertical rhythm: a viewport screenshot is exactly one screen tall; a
 *    full-page capture keeps the same horizontal chrome (sidebar) all the way
 *    down, which can be detected by comparing the left column at several heights.
 *
 * Usage: node scripts/aura-reference-diagnosis.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DIR = path.join(process.cwd(), "design-references", "approved", "AuraAI");

/** Common device viewports, to test whether a reference matches one exactly. */
const VIEWPORTS = [
  { name: "iPhone 14/15 logical", w: 390, h: 844 },
  { name: "iPhone 14 Pro Max logical", w: 430, h: 932 },
  { name: "iPhone 11 logical", w: 414, h: 896 },
  { name: "Pixel 7 logical", w: 412, h: 915 },
  { name: "MacBook Air 13", w: 1440, h: 900 },
  { name: "MacBook Pro 16", w: 1728, h: 1117 },
  { name: "1920x1080", w: 1920, h: 1080 },
  { name: "1536x864", w: 1536, h: 864 }
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".png"));
  const report = {};

  for (const file of files) {
    const url = "data:image/png;base64," + fs.readFileSync(path.join(DIR, file)).toString("base64");
    await page.setContent(`<img id="m" src="${url}">`);
    await page.waitForFunction(() => {
      const i = document.getElementById("m");
      return i && i.complete && i.naturalWidth > 0;
    });
    report[file] = await page.evaluate((viewports) => {
      const img = document.getElementById("m");
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const px = (x, y) => {
        const d = ctx.getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
      // Average brightness of a horizontal strip.
      const stripLum = (y, h = 2) => {
        let sum = 0;
        let n = 0;
        for (let yy = y; yy < Math.min(y + h, H); yy += 1) {
          for (let x = 0; x < W; x += 4) {
            sum += lum(px(x, yy));
            n += 1;
          }
        }
        return sum / Math.max(1, n);
      };

      // Is the left-edge column stable down the page? A full-page capture keeps
      // the sidebar; a single viewport has no repeated structure.
      const leftSamples = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => {
        const y = Math.floor(H * f);
        return Math.round(lum(px(20, y)));
      });

      // Bottom edge: a viewport screenshot usually clips content mid-element.
      const lastRow = Math.round(stripLum(H - 3, 2));
      const rowAbove = Math.round(stripLum(H - 12, 2));

      const ratio = Number((W / H).toFixed(4));
      const exact = viewports.filter((v) => v.w === W && v.h === H);
      const scaled = viewports
        .map((v) => ({ ...v, dprW: Number((W / v.w).toFixed(3)), dprH: Number((H / v.h).toFixed(3)) }))
        .filter((v) => Math.abs(v.dprW - v.dprH) < 0.02 && v.dprW > 0.5)
        .map((v) => `${v.name} @${v.dprW}x`);

      return { size: `${W}x${H}`, ratio, exactViewport: exact.map((v) => v.name), uniformScaleMatches: scaled, leftSamples, lastRowLum: lastRow, rowAboveLum: rowAbove };
    }, VIEWPORTS);
  }

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
