/** Renders review contact sheets of generated city/artist assets. */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(process.cwd(), "public", "generated", "stream", "cities");
const OUT = path.join(process.cwd(), "qa-artifacts", "stream-final");
fs.mkdirSync(OUT, { recursive: true });

const toUrl = (file) => `file:///${path.resolve(DIR, file).replace(/\\/g, "/")}`;

(async () => {
  const files = fs.readdirSync(DIR).filter((file) => file.endsWith(".png")).sort();
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const size = 12;
  for (let index = 0; index < files.length; index += size) {
    const batch = files.slice(index, index + size);
    const figures = batch
      .map(
        (file) =>
          `<figure><img src="${toUrl(file)}"><figcaption>${file.replace(".png", "")}</figcaption></figure>`
      )
      .join("");
    const html = `<!doctype html><style>
      body{margin:0;background:#0d0d0d;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px}
      figure{margin:0;position:relative}
      img{width:100%;aspect-ratio:1;object-fit:cover;display:block;border-radius:8px}
      figcaption{position:absolute;left:0;right:0;bottom:0;background:#000c;color:#fff;font:600 15px system-ui;padding:5px 7px;border-radius:0 0 8px 8px}
    </style><body>${figures}</body>`;
    const file = path.join(OUT, `contact-${Math.floor(index / size)}.html`);
    fs.writeFileSync(file, html);
    await page.goto(`file:///${file.replace(/\\/g, "/")}`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `contact-sheet-${Math.floor(index / size)}.png`), fullPage: true });
  }
  await browser.close();
  console.log(JSON.stringify({ sheets: Math.ceil(files.length / size), files: files.length }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
