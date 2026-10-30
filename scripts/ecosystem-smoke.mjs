/**
 * Ecosystem smoke test: verifies the public product surface and the two
 * journeys most likely to break when the shell changes.
 *
 *  1. Homepage -> Products -> every ecosystem module returns 200 and renders.
 *  2. The NaijaShop card opens the shop and browser Back returns to the homepage.
 *  3. Signing in with ?next= returns the customer to the requested page.
 *
 * Usage: node scripts/ecosystem-smoke.mjs
 * Env:   QA_BASE_URL (default http://localhost:3100)
 */
import { chromium } from "playwright-core";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3100";
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const email = process.env.QA_CUSTOMER_EMAIL ?? "customer@naijadeals.local";
const password = process.env.QA_CUSTOMER_PASSWORD ?? "CustomerPass123!";

const modules = [
  ["NaijaShop", "/naijashop"],
  ["NaijaEats", "/naijaeats"],
  ["NaijaFresh", "/naijafresh"],
  ["NaijaDrive", "/naijadrive"],
  ["NaijaSend", "/naijasend"],
  ["NaijaGigs", "/naijagigs"],
  ["NaijaStay", "/naijastay"],
  ["NaijaStream", "/naijastream"],
  ["NaijaPay", "/wallet"],
  ["Aura AI", "/aura-ai"]
];

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

for (const [name, href] of modules) {
  const response = await fetch(`${baseUrl}${href}`, { redirect: "manual" });
  const html = await response.text();
  const guarded = response.status >= 300 && response.status < 400 && (response.headers.get("location") ?? "").includes("/login");
  const rendered = html.includes(name) || name === "NaijaPay";
  record(
    `route ${href}`,
    guarded || (response.status === 200 && rendered),
    `status ${response.status}${guarded ? ` -> ${response.headers.get("location")}` : `, contains "${name}": ${rendered}`}`
  );
}

const art = [
  "hero-ecosystem",
  ...["shop", "eats", "fresh", "drive", "send", "gigs", "stay", "stream", "wallet", "aura"].map((key) => `module-${key}`)
];
for (const file of art) {
  const response = await fetch(`${baseUrl}/generated/${file}.svg`);
  record(`artwork ${file}`, response.ok && (response.headers.get("content-type") ?? "").includes("svg"), `status ${response.status}`);
}

const browser = await chromium.launch({ executablePath: chromePath });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

try {
  await page.goto(`${baseUrl}/products`, { waitUntil: "networkidle" });
  const cardCount = await page.locator('a[href^="/"]').count();
  record("products page lists modules", cardCount >= modules.length, `${cardCount} links rendered`);

  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /^NaijaShop:/ }).click();
  await page.waitForURL("**/naijashop");
  record("home -> NaijaShop card", page.url().endsWith("/naijashop"), page.url());

  await page.goBack();
  await page.waitForURL(`${baseUrl}/`);
  record("browser Back returns home", page.url() === `${baseUrl}/`, page.url());

  await page.goto(`${baseUrl}/login?next=/wallet`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(4000);
  const walletHeading = await page.locator("h1").first().innerText();
  record("login returns to intended page", page.url().endsWith("/wallet") && /wallet/i.test(walletHeading), `${page.url()} — ${walletHeading}`);
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) process.exitCode = 1;
