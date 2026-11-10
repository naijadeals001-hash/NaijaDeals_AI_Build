/**
 * Locates the artwork rectangles inside the Aura mockup cards, so only the
 * photograph is cropped and every label, border and button stays a real element.
 *
 * Cards in the desktop reference sit in a three-up row; the mobile reference has
 * a two-up row. For each card the photo occupies the top portion, above the dark
 * band that holds the title and service pill. This finds the photo's bounds by
 * scanning for the horizontal edge where the image ends.
 *
 * Usage: node scripts/aura-find-card-artwork.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DIR = path.join(process.cwd(), "design-references", "approved", "AuraAI");

const TARGETS = [
  {
    file: "aura-desktop-dark.png",
    // Approximate card rows (from the earlier section measurements): the row of
    // three cards starts near y=541. Scan a horizontal line through each card.
    probes: [
      { name: "stay", x: 460 },
      { name: "meal", x: 795 },
      { name: "ride", x: 1130 }
    ],
    scanFrom: 540,
    scanTo: 940
  },
  {
    file: "aura-mobile-dark.png",
    probes: [
      { name: "stay", x: 230 },
      { name: "meal", x: 660 }
    ],
    scanFrom: 790,
    scanTo: 1130
  }
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const out = {};
  for (const target of TARGETS) {
    const url = "data:image/png;base64," + fs.readFileSync(path.join(DIR, target.file)).toString("base64");
    await page.setContent(`<img id="m" src="${url}">`);
    await page.waitForFunction(() => {
      const i = document.getElementById("m");
      return i && i.complete && i.naturalWidth > 0;
    });
    out[target.file] = await page.evaluate((t) => {
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

      const result = { size: `${W}x${H}`, cards: {} };
      for (const probe of t.probes) {
        // Vertical extent of vivid (photo) content down the probe column.
        const vivid = [];
        for (let y = t.scanFrom; y < Math.min(t.scanTo, H); y += 1) {
          const p = px(probe.x, y);
          const max = Math.max(...p);
          const min = Math.min(...p);
          // A photograph has colour spread; the dark UI band does not.
          if (max - min > 26 || lum(p) > 55) vivid.push(y);
        }
        const top = vivid[0];
        const bottom = vivid[vivid.length - 1];

        // Horizontal extent: walk left/right from the probe while the row stays vivid.
        const yMid = Math.round((top + bottom) / 2);
        let left = probe.x;
        while (left > 0) {
          const p = px(left - 1, yMid);
          if (Math.max(...p) - Math.min(...p) > 20 || lum(p) > 45) left -= 1;
          else if (left > probe.x - 8) left -= 1;
          else break;
        }
        let right = probe.x;
        while (right < W - 1) {
          const p = px(right + 1, yMid);
          if (Math.max(...p) - Math.min(...p) > 20 || lum(p) > 45) right += 1;
          else if (right < probe.x + 8) right += 1;
          else break;
        }
        result.cards[probe.name] = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
      }
      return result;
    }, target);
  }
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
