/**
 * Reads exact pixel colours at named points in the approved Aura mockups.
 * Usage: node scripts/aura-pick-colours.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DIR = path.join(process.cwd(), "design-references", "approved", "AuraAI");

const POINTS = {
  desktop: {
    file: "aura-desktop-dark.png",
    points: {
      "sidebar bg": [130, 700],
      "centre bg": [700, 300],
      "right panel bg": [1380, 500],
      "newchat fill": [130, 130],
      "newchat text": [145, 130],
      "discover pill bg": [130, 200],
      "plan card bg": [1380, 400],
      "plan card border": [1208, 400],
      "make-it-yours bg": [1380, 560],
      "composer fill": [700, 370],
      "composer border": [301, 370],
      "review button": [600, 905],
      "review button text": [600, 905],
      "chip border": [320, 440],
      "card label pill": [400, 820],
      "footer text": [700, 982],
      "headline white": [400, 175],
      "subtitle grey": [400, 296],
      "gold badge": [330, 114],
      "sidebar divider": [130, 393],
      "history text": [120, 473],
      "avatar ring": [1360, 25]
    }
  },
  mobile: {
    file: "aura-mobile-dark.png",
    points: {
      "canvas bg": [450, 1400],
      "tile bg": [130, 490],
      "tile border": [31, 490],
      "bubble bg": [400, 630],
      "bubble border": [128, 630],
      "plan card bg": [450, 1350],
      "plan card border": [27, 1350],
      "review button": [450, 1435],
      "ride strip bg": [450, 1195],
      "card border": [27, 960],
      "bottom nav bg": [450, 1720],
      "composer bg": [450, 1628],
      "composer border": [33, 1628],
      "gold badge border": [40, 212]
    }
  }
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const out = {};
  for (const [view, cfg] of Object.entries(POINTS)) {
    const dataUrl = "data:image/png;base64," + fs.readFileSync(path.join(DIR, cfg.file)).toString("base64");
    await page.setContent(`<img id="m" src="${dataUrl}">`);
    await page.waitForFunction(() => {
      const img = document.getElementById("m");
      return img && img.complete && img.naturalWidth > 0;
    });
    out[view] = await page.evaluate((points) => {
      const img = document.getElementById("m");
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const res = {};
      for (const [name, [x, y]] of Object.entries(points)) {
        const d = ctx.getImageData(x, y, 1, 1).data;
        res[name] = "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
      }
      return res;
    }, cfg.points);
  }
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
