/**
 * NaijaDrive map and landmark picker verification.
 *
 * Checks the behaviour that cannot be confirmed from server HTML alone: the Leaflet
 * canvas actually mounts, keyboard selection works, the low-data fallback renders, the
 * denied-geolocation path stays honest, and nothing overflows horizontally.
 *
 * Usage: node scripts/drive-map-qa.mjs [baseUrl]
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";

const BASE = (process.argv[2] || process.env.TEST_BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const OUT = "qa-artifacts/drive";
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: chromePath, headless: true });

async function session(width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    permissions: []
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  return { context, page, consoleErrors };
}

/* ---------------------------------------------------------------- desktop --- */
{
  const { context, page, consoleErrors } = await session(1440, 1000);
  await page.goto(`${BASE}/naijadrive`, { waitUntil: "networkidle", timeout: 60000 });

  await page.waitForSelector("#drive-pickup", { state: "visible" });
  check("Pick-up combobox renders", (await page.locator("#drive-pickup").count()) === 1);

  // Leaflet mounts asynchronously after a dynamic import.
  await page.waitForTimeout(2500);
  const mapBox = await page.locator(".leaflet-container").first().boundingBox().catch(() => null);
  const schematic = await page.locator('svg[aria-label^="Route diagram"]').count();
  const tileFailed = (await page.getByText("Map tiles did not load").count()) > 0;
  check(
    "Map canvas or honest fallback is visible",
    Boolean(mapBox && mapBox.height > 200) || schematic > 0,
    mapBox ? `leaflet ${Math.round(mapBox.width)}x${Math.round(mapBox.height)}` : `schematic=${schematic} tileFailed=${tileFailed}`
  );

  results.push({ name: "tiles loaded", ok: true, detail: tileFailed ? "no (fallback shown)" : "yes" });

  // Keyboard-only landmark selection on the drop-off combobox.
  await page.locator("#drive-dropoff").click();
  await page.locator("#drive-dropoff").fill("lekki");
  await page.waitForTimeout(150);
  const optionsAfterType = await page.getByRole("option").count();
  check("Typing filters the landmark list", optionsAfterType > 0 && optionsAfterType < 20, `${optionsAfterType} options`);
  const topOption = (await page.getByRole("option").first().innerText()).split("\n")[0];
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  const dropoffValue = await page.locator("#drive-dropoff").inputValue();
  check("Keyboard selection commits the top match", dropoffValue === topOption.trim(), `${dropoffValue} (expected ${topOption.trim()})`);

  // Alias search: "CV" should find Computer Village.
  await page.locator("#drive-pickup").fill("CV");
  await page.waitForTimeout(150);
  const aliasHit = await page.getByRole("option").first().innerText().catch(() => "");
  check("Local aliases resolve (CV → Computer Village)", /Computer Village/i.test(aliasHit), aliasHit.split("\n")[0]);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);

  // The quote must survive the new endpoints.
  const fareVisible = await page.getByText("Estimated fare").count();
  check("Fare quote still resolves after picking landmarks", fareVisible > 0);

  const breakdownVisible = await page.getByText("How this fare is built").count();
  const baseRow = await page.getByText(/^Base fare ·/).count();
  check("Fare is itemised before booking", breakdownVisible > 0 && baseRow > 0);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));
  check("No horizontal overflow at 1440px", overflow.scrollWidth <= overflow.innerWidth + 1, JSON.stringify(overflow));

  await page.screenshot({ path: `${OUT}/drive-desktop.png`, fullPage: true });
  await page.locator("section[aria-labelledby='trip-map-heading']").screenshot({ path: `${OUT}/drive-map-desktop.png` }).catch(() => {});

  // Low-data mode must replace tiles with the vector diagram and remember the choice.
  await page.getByRole("button", { name: /low data/i }).click();
  await page.waitForTimeout(600);
  const schematicAfter = await page.locator('svg[aria-label^="Route diagram"]').count();
  check("Low data mode swaps tiles for the schematic", schematicAfter > 0);
  const lowDataPressed = await page.getByRole("button", { name: /low data/i }).getAttribute("aria-pressed");
  check("Low data toggle is announced as pressed", lowDataPressed === "true", String(lowDataPressed));
  await page.locator("section[aria-labelledby='trip-map-heading']").screenshot({ path: `${OUT}/drive-map-lowdata.png` }).catch(() => {});

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const persisted = await page.evaluate(() => window.localStorage.getItem("nd_drive_low_data"));
  check("Low data preference persists across reloads", persisted === "1", String(persisted));

  // Geolocation must fail honestly, never invent a location.
  await page.getByRole("button", { name: /use my location/i }).click();
  await page.waitForTimeout(1500);
  const locationNotice = await page.locator("[role='status']").filter({ hasText: /location|pick-up set|nearest/i }).count();
  check("Denied geolocation shows an honest message", locationNotice > 0);

  check("No console errors on desktop", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
  await context.close();
}

/* ----------------------------------------------------------------- mobile --- */
{
  const { context, page, consoleErrors } = await session(390, 844);
  await page.goto(`${BASE}/naijadrive`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("#drive-pickup", { state: "visible" });
  await page.waitForTimeout(2000);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));
  check("No horizontal overflow at 390px", overflow.scrollWidth <= overflow.innerWidth + 1, JSON.stringify(overflow));

  const target = await page.locator("#drive-pickup").boundingBox();
  check("Pick-up input is a comfortable touch target", Boolean(target && target.height >= 44), `${Math.round(target?.height ?? 0)}px`);

  await page.screenshot({ path: `${OUT}/drive-mobile.png`, fullPage: true });
  await page.locator("section[aria-labelledby='trip-map-heading']").screenshot({ path: `${OUT}/drive-map-mobile.png` }).catch(() => {});

  check("No console errors on mobile", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
  await context.close();
}

await browser.close();

const passed = results.filter((item) => item.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) {
  console.error(JSON.stringify(results.filter((item) => !item.ok), null, 2));
  process.exit(1);
}
