/**
 * Crops only the photograph out of each Aura mockup card.
 *
 * Runs of vivid rows/columns are detected within a card's known rectangle, so the
 * crop contains artwork alone — never the title, service pill, border or button,
 * which are implemented as real elements in the interface.
 *
 * Every crop records its source mockup and coordinates in the asset registry.
 *
 * Usage: node scripts/aura-crop-card-artwork.cjs
 */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const REF = path.join(process.cwd(), "design-references", "approved", "AuraAI");
const OUT = path.join(process.cwd(), "public", "generated", "aura");

/**
 * Card rectangles measured from the mockups. `search` is the region to scan for
 * the photo within each card; the exact bounds are refined per image below.
 */
const PLANS = [
  {
    source: "aura-desktop-dark.png",
    uses: "desktop welcome cards (3-up row)",
    cards: [
      { id: "aura-card-stay", search: { x0: 290, x1: 595, y0: 535, y1: 800 } },
      { id: "aura-card-meal", search: { x0: 596, x1: 888, y0: 535, y1: 800 } },
      { id: "aura-card-ride", search: { x0: 889, x1: 1170, y0: 535, y1: 800 } }
    ]
  },
  {
    source: "aura-mobile-dark.png",
    uses: "mobile welcome cards (2-up row)",
    cards: [
      { id: "aura-card-stay-mobile", search: { x0: 30, x1: 445, y0: 785, y1: 1060 } },
      { id: "aura-card-meal-mobile", search: { x0: 455, x1: 870, y0: 785, y1: 1060 } }
    ]
  }
];

async function crop(page, sourceFile, search) {
  const url = "data:image/png;base64," + fs.readFileSync(path.join(REF, sourceFile)).toString("base64");
  await page.setContent(`<img id="m" src="${url}">`);
  await page.waitForFunction(() => {
    const i = document.getElementById("m");
    return i && i.complete && i.naturalWidth > 0;
  });
  const result = await page.evaluate((s) => {
    const img = document.getElementById("m");
    const W = img.naturalWidth;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const vivid = (x, y) => {
      const d = ctx.getImageData(x, y, 1, 1).data;
      const l = 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2];
      const spread = Math.max(d[0], d[1], d[2]) - Math.min(d[0], d[1], d[2]);
      return l > 42 || spread > 24;
    };

    // Rows where a majority of the search width is vivid belong to the photo.
    const rows = [];
    for (let y = s.y0; y < s.y1; y += 1) {
      let hits = 0;
      for (let x = s.x0; x < s.x1; x += 2) if (vivid(x, y)) hits += 1;
      rows.push([y, hits / Math.ceil((s.x1 - s.x0) / 2)]);
    }
    const photoRows = rows.filter(([, f]) => f > 0.55).map(([y]) => y);
    const top = photoRows[0];
    const bottom = photoRows[photoRows.length - 1];

    // Columns within that band.
    const cols = [];
    for (let x = s.x0; x < s.x1; x += 1) {
      let hits = 0;
      for (let y = top; y <= bottom; y += 2) if (vivid(x, y)) hits += 1;
      cols.push([x, hits / Math.ceil((bottom - top) / 2)]);
    }
    const photoCols = cols.filter(([, f]) => f > 0.55).map(([x]) => x);
    const left = photoCols[0];
    const right = photoCols[photoCols.length - 1];

    const box = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
    const out = document.createElement("canvas");
    out.width = box.w;
    out.height = box.h;
    out.getContext("2d").drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    return { box, dataUrl: out.toDataURL("image/png") };
  }, search);
  return result;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  const registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "image-registry.json"), "utf8"));
  registry.assets = registry.assets.filter((a) => !a.id.startsWith("aura-card-"));

  const report = [];
  for (const plan of PLANS) {
    for (const card of plan.cards) {
      const { box, dataUrl } = await crop(page, plan.source, card.search);
      if (box.w < 100 || box.h < 80) {
        console.error(`crop too small for ${card.id}: ${JSON.stringify(box)}`);
        continue;
      }
      const png = path.join(OUT, `${card.id}.png`);
      fs.writeFileSync(png, Buffer.from(dataUrl.split(",")[1], "base64"));
      const webp = path.join(OUT, `${card.id}.webp`);
      // 2x the largest display size (mobile 2x DPR) so crops stay sharp.
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", png, "-vf", "scale='min(1200,iw)':-2", "-c:v", "libwebp", "-quality", "90", webp]);
      fs.rmSync(png);

      registry.assets.push({
        id: card.id,
        vertical: "aura",
        kind: "card-artwork",
        component: plan.uses,
        source: `design-references/approved/AuraAI/${plan.source}`,
        sourceType: "cropped from the approved mockup by the owner's instruction",
        crop: { x: box.x, y: box.y, width: box.w, height: box.h },
        model: "none (crop of approved artwork)",
        status: "generated",
        storagePath: `generated/aura/${card.id}.webp`,
        generatedAt: new Date().toISOString(),
        creditsConsumed: 0,
        costUsd: 0,
        qualityReview: "crop inspected at display size",
        usageReferences: ["components/aura/aura-plan-pieces.tsx"]
      });
      report.push({ id: card.id, source: plan.source, crop: box });
      console.log(`${card.id.padEnd(26)} ${plan.source} [${box.x},${box.y},${box.w}x${box.h}]`);
    }
  }

  fs.writeFileSync(path.join(process.cwd(), "scripts", "image-registry.json"), JSON.stringify(registry, null, 2) + "\n");
  fs.writeFileSync(path.join(process.cwd(), "qa-artifacts", "aura-crops.json"), JSON.stringify({ generatedAt: new Date().toISOString(), crops: report }, null, 2));
  await browser.close();
})();
