/**
 * Locale QA: verifies Swahili and Arabic render, Arabic flips the document to RTL,
 * the in-page switcher changes language, and no horizontal overflow appears.
 *
 * Usage: node scripts/locale-qa.mjs
 * Env:   QA_BASE_URL (default http://localhost:3100)
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3100";
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outDir = path.join(process.cwd(), "qa-artifacts", "locale");

await fs.mkdir(outDir, { recursive: true });

const cases = [
  { name: "english", cookies: { nd_lang: "en", nd_country: "NG", nd_city: "Lagos" }, lang: "en", dir: "ltr", marker: "One app for the way Africa" },
  { name: "swahili", cookies: { nd_lang: "sw", nd_country: "NG", nd_city: "Lagos" }, lang: "sw", dir: "ltr", marker: "Programu moja" },
  { name: "arabic", cookies: { nd_lang: "ar", nd_country: "KE", nd_city: "Nairobi" }, lang: "ar", dir: "rtl", marker: "تطبيق واحد" }
];

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

const browser = await chromium.launch({ executablePath: chromePath });

try {
  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 1000 }
  ]) {
    for (const item of cases) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      await context.addCookies(
        Object.entries(item.cookies).map(([name, value]) => ({
          name,
          value,
          url: baseUrl
        }))
      );
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });

      await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
      const htmlLang = await page.evaluate(() => document.documentElement.lang);
      const htmlDir = await page.evaluate(() => document.documentElement.dir);
      const heading = await page.locator("h1").first().innerText();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      await page.screenshot({ path: path.join(outDir, `${item.name}-${viewport.name}.png`), fullPage: true });

      record(
        `${item.name} ${viewport.name}: html lang/dir`,
        htmlLang === item.lang && htmlDir === item.dir,
        `${htmlLang}/${htmlDir}`
      );
      record(`${item.name} ${viewport.name}: translated heading`, heading.includes(item.marker), heading.slice(0, 60));
      record(`${item.name} ${viewport.name}: no horizontal overflow`, overflow === 0, `${overflow}px`);
      record(`${item.name} ${viewport.name}: no console errors`, consoleErrors.length === 0, consoleErrors.join(" | ").slice(0, 160));

      await context.close();
    }
  }

  // In-page switcher: start English, choose Arabic through the UI, confirm RTL applied.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([
    { name: "nd_lang", value: "en", url: baseUrl },
    { name: "nd_country", value: "NG", url: baseUrl },
    { name: "nd_city", value: "Lagos", url: baseUrl }
  ]);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.locator('button[aria-haspopup="dialog"]').click();
  await page.getByRole("button", { name: "العربية" }).click();
  await page.waitForFunction(() => document.documentElement.dir === "rtl", undefined, { timeout: 15000 });
  const dir = await page.evaluate(() => document.documentElement.dir);
  const heading = await page.locator("h1").first().innerText();
  const cookies = await context.cookies();
  const langCookie = cookies.find((cookie) => cookie.name === "nd_lang")?.value;
  record("switcher to Arabic sets dir=rtl", dir === "rtl", dir);
  record("switcher to Arabic translates heading", heading.includes("تطبيق واحد"), heading.slice(0, 60));
  record("switcher persists language cookie", langCookie === "ar", String(langCookie));
  await context.close();
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`Screenshots: ${outDir}`);
if (failed.length > 0) process.exitCode = 1;
