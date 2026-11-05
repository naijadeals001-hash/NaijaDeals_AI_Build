// NaijaPay /pay visual QA — screenshots at mobile/tablet/desktop plus basic
// content assertions. Run: node scripts/pay-visual-qa.mjs (QA_BASE_URL optional).
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3015";
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outDir = path.join(process.cwd(), "qa-artifacts", "pay");

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 }
];

const browser = await chromium.launch({ executablePath: chromePath });
await fs.mkdir(outDir, { recursive: true });
const results = [];
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const response = await page.goto(`${baseUrl}/pay`, { waitUntil: "networkidle", timeout: 60000 });
    // Scroll through the page so loading="lazy" images load before measuring.
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState("networkidle").catch(() => {});
    const heading = await page.getByRole("heading", { name: "Your Money. A Brighter Nigeria." }).count();
    const sub = await page.getByText("Pay. Send. Receive. Do More.").count();
    const images = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img")).map((img) => ({
        src: img.getAttribute("src"),
        complete: img.complete,
        naturalWidth: img.naturalWidth
      }))
    );
    const broken = images.filter((img) => !img.complete || img.naturalWidth === 0);
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    const walletCard = await page.getByText("Sign in to NaijaPay").count();
    await page.screenshot({ path: path.join(outDir, `pay-${viewport.name}.png`), fullPage: true });
    results.push({
      viewport: viewport.name,
      status: response.status(),
      heading,
      sub,
      images: images.length,
      brokenImages: broken.length,
      horizontalOverflow,
      signedOutWalletCard: walletCard
    });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
const failures = results.filter(
  (r) => r.status !== 200 || r.heading !== 1 || r.sub < 1 || r.brokenImages > 0 || r.horizontalOverflow > 1 || r.signedOutWalletCard < 1
);
if (failures.length > 0) {
  console.error("PAY VISUAL QA FAILURES:", JSON.stringify(failures));
  process.exit(1);
}
console.log("PAY VISUAL QA PASSED");
