/**
 * Controlled visual comparison of Aura against the approved references.
 *
 * Reference diagnosis (scripts/aura-reference-diagnosis.cjs):
 *   desktop 1586x992  = 1440x900 viewport at 1.101x  -> LOGICAL 1441x901
 *   mobile   896x1754 = 390x844 viewport at 2.297x   -> LOGICAL 390x763 (device viewport)
 *
 * Both are single-viewport compositions, not long pages, so the implementation is
 * captured at those logical sizes with a matching device pixel ratio, then scaled
 * to the reference's own pixel dimensions for a like-for-like comparison.
 *
 * Outputs, per view:
 *   - reference-*.png        (reference normalised to the comparison size)
 *   - implementation-*.png   (capture normalised the same way)
 *   - overlay-*.png          (50/50 blend, to see structural drift)
 *   - diff-*.png             (Pixelmatch, transparent where matching)
 *   - regions.json           (difference per named region)
 *
 * Usage: node scripts/aura-visual-compare.cjs [--fixture]
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
const OUT = path.join(process.cwd(), "qa-artifacts", "aura-compare");

const USE_FIXTURE = process.argv.includes("--fixture");

const TARGETS = [
  {
    name: "desktop",
    reference: "aura-desktop-dark.png",
    logical: { width: 1586, height: 992 },
    dpr: 1,
    composer: "#aura-composer-desktop",
    // [x0, y0, x1, y1] as fractions of the reference, from the section
    // measurements in scripts/aura-measure-sections.cjs.
    regions: {
      header: [0.166, 0, 1, 0.045],
      sidebar: [0, 0, 0.165, 1],
      hero: [0.17, 0.05, 0.75, 0.33],
      composer: [0.18, 0.335, 0.74, 0.39],
      chips: [0.18, 0.40, 0.62, 0.47],
      cards: [0.18, 0.55, 0.74, 0.93],
      rightRail: [0.766, 0.04, 1, 1]
    }
  },
  {
    name: "mobile",
    reference: "aura-mobile-dark.png",
    logical: { width: 896, height: 1754 },
    dpr: 1,
    composer: "#aura-composer-mobile",
    // Bands derived from the mobile reference: header 0-42, hero 70-393,
    // tiles 445-516, bubble 590-670, cards 800-1120, plan 1260-1530,
    // composer 1590-1670, nav 1675-1754 (of 1754).
    regions: {
      header: [0, 0, 1, 0.024],
      hero: [0, 0.04, 1, 0.225],
      tiles: [0, 0.254, 1, 0.294],
      bubble: [0, 0.336, 1, 0.382],
      cards: [0, 0.456, 1, 0.638],
      plan: [0, 0.718, 1, 0.872],
      composer: [0, 0.905, 1, 0.951],
      nav: [0, 0.953, 1, 1]
    }
  }
];

function resize(input, width, height, output) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", input, "-vf", `scale=${width}:${height}:flags=lanczos`, output]);
}

function png(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

/** Difference count and percentage inside a normalised region. */
function regionDiff(refData, implData, width, height, [x0, y0, x1, y1]) {
  const left = Math.floor(x0 * width);
  const right = Math.min(width, Math.ceil(x1 * width));
  const top = Math.floor(y0 * height);
  const bottom = Math.min(height, Math.ceil(y1 * height));
  let differing = 0;
  let total = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const i = (width * y + x) * 4;
      total += 1;
      if (Math.abs(refData[i] - implData[i]) + Math.abs(refData[i + 1] - implData[i + 1]) + Math.abs(refData[i + 2] - implData[i + 2]) > 36) {
        differing += 1;
      }
    }
  }
  return { percent: Number(((differing / Math.max(1, total)) * 100).toFixed(1)), pixels: differing };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const report = [];

  for (const target of TARGETS) {
    const ctx = await browser.newContext({
      viewport: target.logical,
      deviceScaleFactor: target.dpr,
      reducedMotion: "reduce",
      colorScheme: "dark"
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.evaluate(async (useFixture) => {
      const account = useFixture
        ? { email: "aura-mockup-fixture@naijadeals.test", password: process.env.AURA_FIXTURE_PASSWORD ?? "" }
        : { email: "naijapay-test-sender@naijadeals.test", password: "NaijaPayTest123!" };
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(account)
      });
    }, USE_FIXTURE);
    await page.goto(`${BASE}/aura-ai`, { waitUntil: "networkidle" });

    if (!process.argv.includes("--conversation")) {
      // Compose the welcome state: clear any open conversation, then reset scroll.
      const newChat = page.getByRole("button", { name: /new chat/i }).first();
      if (await newChat.count()) await newChat.click();
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        document.querySelectorAll("*").forEach((el) => {
          if (el.scrollTop > 0) el.scrollTop = 0;
        });
      });
      await page.waitForTimeout(400);
    }

    // Wait for fonts and every image to finish so both captures compare like for like.
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForFunction(() => Array.from(document.querySelectorAll("img")).every((i) => i.complete), null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const raw = path.join(OUT, `${target.name}-implementation-raw.png`);
    await page.screenshot({ path: raw });

    // Reference gives the comparison size.
    const refFile = path.join(REF, target.reference);
    const refSize = png(refFile);
    const W = refSize.width;
    const H = refSize.height;

    const implFile = path.join(OUT, `${target.name}-implementation.png`);
    resize(raw, W, H, implFile);
    const refNorm = path.join(OUT, `${target.name}-reference.png`);
    resize(refFile, W, H, refNorm);

    const a = png(refNorm);
    const b = png(implFile);

    // Overlay: 50/50 blend makes any positional drift show as ghosting.
    const overlay = new PNG({ width: W, height: H });
    for (let i = 0; i < a.data.length; i += 4) {
      overlay.data[i] = Math.round((a.data[i] + b.data[i]) / 2);
      overlay.data[i + 1] = Math.round((a.data[i + 1] + b.data[i + 1]) / 2);
      overlay.data[i + 2] = Math.round((a.data[i + 2] + b.data[i + 2]) / 2);
      overlay.data[i + 3] = 255;
    }
    fs.writeFileSync(path.join(OUT, `${target.name}-overlay.png`), PNG.sync.write(overlay));

    // Pixelmatch, documented settings: threshold 0.1 on colour distance,
    // antialiasing included so text edges are not counted as errors.
    const diff = new PNG({ width: W, height: H });
    const differing = pixelmatch(a.data, b.data, diff.data, W, H, {
      threshold: 0.1,
      includeAA: true,
      alpha: 0.35,
      diffColor: [255, 40, 90]
    });
    fs.writeFileSync(path.join(OUT, `${target.name}-diff.png`), PNG.sync.write(diff));

    const regions = {};
    for (const [name, box] of Object.entries(target.regions)) {
      regions[name] = regionDiff(a.data, b.data, W, H, box);
    }

    const percent = Number(((differing / (W * H)) * 100).toFixed(2));
    report.push({ view: target.name, reference: `${W}x${H}`, logical: target.logical, dpr: target.dpr, fixture: USE_FIXTURE, percent, regions });
    console.log(`\n[${target.name}] ${percent}% differ (threshold 0.10, AA included)`);
    console.log(Object.entries(regions).map(([k, v]) => `   ${k.padEnd(11)} ${String(v.percent).padStart(5)}%`).join("\n"));

    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), fixture: USE_FIXTURE, report }, null, 2));
})();
