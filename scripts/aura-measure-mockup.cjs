/**
 * Measures the approved Aura mockups so the build matches real geometry instead
 * of approximations.
 *
 * Detects edges by scanning for colour changes along key rows/columns and prints
 * the panel boundaries, card sizes and column widths in both CSS pixels (at the
 * mockup's own scale) and as a percentage of the frame.
 *
 * Usage: node scripts/aura-measure-mockup.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DIR = path.join(process.cwd(), "design-references", "approved", "AuraAI");

async function measure(page, file, probes) {
  const dataUrl = "data:image/png;base64," + fs.readFileSync(path.join(DIR, file)).toString("base64");
  await page.setContent(`<img id="m" src="${dataUrl}">`);
  await page.waitForFunction(() => {
    const img = document.getElementById("m");
    return img && img.complete && img.naturalWidth > 0;
  });
  return page.evaluate((probes) => {
    const img = document.getElementById("m");
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3);
    const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

    const out = { size: `${W}x${H}`, scans: {} };
    for (const probe of probes) {
      const { name, axis, at, from, to, threshold = 12 } = probe;
      const values = [];
      for (let i = from; i <= to; i += 1) {
        const p = axis === "row" ? px(i, at) : px(at, i);
        values.push({ pos: i, l: lum(p), rgb: p });
      }
      // Report transitions where luminance shifts by more than the threshold.
      const edges = [];
      for (let i = 1; i < values.length; i += 1) {
        if (Math.abs(values[i].l - values[i - 1].l) > threshold) edges.push(values[i].pos);
      }
      out.scans[name] = edges;
    }
    return out;
  }, probes);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();

  const desktop = await measure(page, "aura-desktop-dark.png", [
    { name: "sidebar→centre (row y=500)", axis: "row", at: 500, from: 0, to: 600 },
    { name: "centre→right (row y=500)", axis: "row", at: 500, from: 1100, to: 1586 },
    { name: "card columns (row y=700)", axis: "row", at: 700, from: 280, to: 1180 },
    { name: "hero top (col x=400)", axis: "col", at: 400, from: 60, to: 340 },
    { name: "composer (col x=700)", axis: "col", at: 700, from: 320, to: 420 }
  ]);

  const mobile = await measure(page, "aura-mobile-dark.png", [
    { name: "tiles (row y=490)", axis: "row", at: 490, from: 0, to: 896 },
    { name: "cards (row y=930)", axis: "row", at: 930, from: 0, to: 896 },
    { name: "stack (col x=60)", axis: "col", at: 60, from: 380, to: 1754 },
    { name: "composer (col x=450)", axis: "col", at: 450, from: 1560, to: 1700 }
  ]);

  console.log(JSON.stringify({ desktop, mobile }, null, 2));
  await browser.close();
})();
