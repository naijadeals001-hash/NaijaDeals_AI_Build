/**
 * NaijaDrive saved-places UI verification against the running preview.
 *
 * Proves the rider-facing saved places workflow in a real browser, not just the API:
 * sign in, add a nicknamed landmark, see it listed, rename it, delete it, and take
 * no console errors or horizontal overflow at mobile width.
 *
 * Usage: node scripts/drive-saved-places-qa.mjs
 * Env:   QA_BASE_URL (default http://localhost:3100)
 */
import { chromium } from "playwright-core";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3100";
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const email = process.env.QA_CUSTOMER_EMAIL ?? "customer@naijadeals.local";
const password = process.env.QA_CUSTOMER_PASSWORD ?? "CustomerPass123!";

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} -- ${detail}`);
}

const stamp = Date.now();
const firstNickname = `QA Mum ${stamp}`;
const renamedNickname = `QA Office ${stamp}`;
const consoleErrors = [];

const browser = await chromium.launch({ executablePath: chromePath });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));

try {
  await page.goto(`${baseUrl}/login?next=/naijadrive`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/naijadrive", { timeout: 20000 });

  const heading = page.getByRole("heading", { name: "Saved places" });
  await heading.waitFor({ timeout: 15000 });
  record("Saved places panel renders for a signed-in rider", await heading.isVisible(), "heading visible");

  // Add.
  await page.locator("#new-nickname").fill(firstNickname);
  await page.locator("#new-landmark").selectOption("ikeja-city-mall");
  await page.getByRole("button", { name: /Save place/ }).click();
  await page.getByText(`Saved \u201c${firstNickname}\u201d.`).waitFor({ timeout: 15000 });
  record("Adding a nicknamed landmark saves it", await page.getByText(firstNickname).first().isVisible(), "add acknowledged");

  // Rename.
  await page.getByRole("button", { name: `Edit ${firstNickname}` }).click();
  await page.locator('input[id^="edit-name-"]').fill(renamedNickname);
  await page.getByRole("button", { name: /^Save$/ }).click();
  await page.getByText(`Updated \u201c${renamedNickname}\u201d.`).waitFor({ timeout: 15000 });
  record("Renaming a saved place updates the nickname", await page.getByText(renamedNickname).first().isVisible(), "rename acknowledged");

  // Search filter.
  await page.locator("#saved-filter").fill("Office");
  const filteredVisible = await page.getByText(renamedNickname).first().isVisible();
  await page.locator("#saved-filter").fill("");
  record("Searching saved places finds the nickname", filteredVisible, "filter applied");

  // Touch targets for the icon controls (measured while a row still exists).
  const target = await page
    .getByRole("button", { name: `Remove ${renamedNickname}` })
    .boundingBox()
    .catch(() => null);
  record(
    "Saved-place icon buttons meet the 44px touch target",
    target ? target.height >= 44 && target.width >= 44 : false,
    target ? `${Math.round(target.width)}x${Math.round(target.height)}px` : "no row found"
  );

  // Delete.
  await page.getByRole("button", { name: `Remove ${renamedNickname}` }).click();
  await page.getByText("Saved place removed.").waitFor({ timeout: 15000 });
  const stillListed = await page.getByText(renamedNickname).count();
  record("Deleting a saved place removes it from the list", stillListed === 0, `matches after delete: ${stillListed}`);

  // Mobile layout.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth
  }));
  record(
    "No horizontal overflow at 390px with saved places present",
    overflow.scrollWidth <= overflow.innerWidth,
    JSON.stringify(overflow)
  );

  record("No console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
} catch (error) {
  record("Saved places UI flow completed", false, error instanceof Error ? error.message : String(error));
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) process.exitCode = 1;
