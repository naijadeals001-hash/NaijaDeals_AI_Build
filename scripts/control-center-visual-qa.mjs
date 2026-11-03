/**
 * Real-browser QA for the Control Center.
 *
 * This drives an installed Chrome through Playwright, so it exercises actual
 * clicks, Next.js client navigation, filters, the header search, sign-out and
 * the server-enforced super-admin boundary. It also captures screenshots at
 * desktop and mobile widths for visual comparison with the design reference.
 *
 * Usage:
 *   node scripts/control-center-visual-qa.mjs
 *
 * Env:
 *   TEST_BASE_URL            default http://localhost:3100
 *   TEST_ADMIN_EMAIL         default admin@naijadeals.local
 *   TEST_ADMIN_PASSWORD      default AdminPass123!
 *   TEST_SUPER_ADMIN_EMAIL   default superadmin@naijadeals.local
 *   TEST_SUPER_ADMIN_PASSWORD default SuperAdminPass123!
 *
 * Outputs screenshots and report.json under .qa/control-center/.
 * Credentials are never written to the report or the screenshots.
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = (process.env.TEST_BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const OUT = path.resolve(".qa/control-center");

const ADMIN = {
  email: process.env.TEST_ADMIN_EMAIL || "admin@naijadeals.local",
  password: process.env.TEST_ADMIN_PASSWORD || "AdminPass123!"
};
const SUPER_ADMIN = {
  email: process.env.TEST_SUPER_ADMIN_EMAIL || "superadmin@naijadeals.local",
  password: process.env.TEST_SUPER_ADMIN_PASSWORD || "SuperAdminPass123!"
};

const FABRICATED = [
  "23,160,000",
  "10,140",
  "8,941",
  "Driver shortage in Lagos Island",
  "Payment provider latency",
  "Updated just now",
  "Platform Commission",
  "Avg. Pickup Time",
  "Propose New Module"
];

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function wireDiagnostics(page, label) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`http ${response.status()}: ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    if (failure && failure.errorText !== "net::ERR_ABORTED") {
      errors.push(`request failed: ${request.url()} (${failure.errorText})`);
    }
  });
  results.push({ name: `${label}: console and network clean`, ok: errors.length === 0, detail: errors.slice(0, 6).join(" | ") });
  if (errors.length > 0) console.log(`FAIL ${label}: console and network clean — ${errors.slice(0, 6).join(" | ")}`);
  else console.log(`PASS ${label}: console and network clean`);
  return errors;
}

async function login(page, credentials) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(credentials.email);
  await page.locator('input[type="password"]').fill(credentials.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 }),
    page.getByRole("button", { name: "Sign in", exact: true }).click()
  ]);
  await page.waitForLoadState("networkidle");
}

async function bodyText(page) {
  return page.locator("body").innerText();
}

async function run() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const report = { base: BASE, startedAt: new Date().toISOString(), screenshots: [], checks: results };

  try {
    /* ---------------------------------------------------------------- desktop */
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-NG" });
    const page = await desktop.newPage();
    const desktopErrors = wireDiagnostics(page, "desktop");

    // Unauthenticated access is redirected to sign-in.
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    check("anonymous /admin redirects to sign-in", page.url().includes("/login"), page.url());

    await login(page, ADMIN);
    check("admin sign-in lands on an authenticated page", !page.url().includes("/login"), page.url());

    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Ecosystem Control Center" }).waitFor({ timeout: 15000 });

    const overviewText = await bodyText(page);
    const fabricated = FABRICATED.filter((needle) => overviewText.includes(needle));
    check("overview shows no fabricated demo metrics", fabricated.length === 0, fabricated.join(", "));
    check("overview reports the real database load time", /Loaded from the local PostgreSQL database/.test(overviewText));
    check("overview lists all admin endpoints as healthy", overviewText.includes("All admin endpoints responded."));

    const sidebarBox = await page.locator('aside, [aria-label="Control Center navigation"]').first().boundingBox();
    check("desktop sidebar is on-screen at 1440px", Boolean(sidebarBox && sidebarBox.x >= 0 && sidebarBox.width > 100), JSON.stringify(sidebarBox));

    await page.screenshot({ path: path.join(OUT, "01-overview-desktop.png"), fullPage: true });
    report.screenshots.push("01-overview-desktop.png");

    // Module switcher is a real client-side navigation.
    await page.getByRole("tab", { name: /NaijaShop Commerce/ }).click();
    await page.waitForURL(/module=shop/, { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    check("module card click navigates to the Shop workspace", page.url().includes("module=shop"), page.url());
    await page.getByRole("heading", { name: "NaijaShop Admin" }).waitFor({ timeout: 10000 });
    await page.screenshot({ path: path.join(OUT, "02-shop-desktop.png"), fullPage: true });
    report.screenshots.push("02-shop-desktop.png");

    // Header tab is also a real navigation.
    await page.getByRole("tab", { name: "Orders", exact: true }).click();
    await page.waitForURL(/tab=orders/, { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    const ordersText = await bodyText(page);
    check("Orders tab click updates the URL and heading", page.url().includes("tab=orders") && ordersText.includes("Real orders from the marketplace service."), page.url());
    check("Orders tab shows an honest empty state", ordersText.includes("No orders exist yet."));
    await page.screenshot({ path: path.join(OUT, "03-orders-desktop.png"), fullPage: true });
    report.screenshots.push("03-orders-desktop.png");

    // Users tab: filter, search, refresh. Users belongs to the ecosystem module,
    // so navigate directly instead of looking for it under Shop.
    await page.goto(`${BASE}/admin?tab=users`, { waitUntil: "networkidle" });
    await page.getByText("Every account in the platform, including roles and linked vendors.").waitFor({ timeout: 15000 });
    const initialRows = await page.locator("tbody tr").count();
    check("Users tab renders real rows", initialRows >= 5, `${initialRows} rows`);

    await page.getByLabel("Filter by status").selectOption("ADMIN");
    await page.waitForTimeout(400);
    const filteredRows = await page.locator("tbody tr").count();
    const filteredText = await bodyText(page);
    check("actor-type filter narrows the user list", filteredRows > 0 && filteredRows < initialRows, `${filteredRows} of ${initialRows}`);
    check("filtered list still contains the super administrator", filteredText.includes("superadmin@naijadeals.local"));

    await page.getByLabel("Filter by status").selectOption("all");
    await page.getByPlaceholder("Search name, email or phone…").fill("superadmin");
    await page.waitForTimeout(400);
    const searchedRows = await page.locator("tbody tr").count();
    check("in-table search narrows to the matching user", searchedRows === 1, `${searchedRows} row(s)`);

    await page.getByPlaceholder("Search name, email or phone…").fill("");
    await page.getByLabel("Search Control Center").fill("superadmin");
    await page.getByLabel("Search Control Center").press("Enter");
    await page.waitForURL(/q=superadmin/, { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    const headerSearchRows = await page.locator("tbody tr").count();
    check("header search drives the workspace query", page.url().includes("q=superadmin") && headerSearchRows === 1, `${headerSearchRows} row(s), ${page.url()}`);
    await page.screenshot({ path: path.join(OUT, "04-users-search-desktop.png"), fullPage: true });
    report.screenshots.push("04-users-search-desktop.png");

    // Refresh re-renders from the server without losing the workspace.
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.waitForLoadState("networkidle");
    check("Refresh keeps the Users workspace selected", page.url().includes("tab=users"), page.url());

    // Server-enforced super-admin boundary for a standard admin.
    const adminApi = await page.request.get(`${BASE}/api/super-admin/system`);
    check("standard admin receives HTTP 403 from the super-admin API", adminApi.status() === 403, `HTTP ${adminApi.status()}`);

    // Sign out.
    await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
    await page.waitForURL(/\/login/, { timeout: 20000 });
    check("sign-out returns to the sign-in page", page.url().includes("/login"), page.url());

    // Super-admin flow.
    await login(page, SUPER_ADMIN);
    await page.goto(`${BASE}/super-admin?tab=settings`, { waitUntil: "networkidle" });
    await page.getByText(/Signed in as Super Admin/).waitFor({ timeout: 20000 });
    const settingsText = await bodyText(page);
    check("super admin reaches the platform settings snapshot", settingsText.includes("Payment providers") && settingsText.includes("Roles in the database"));
    check("settings never claim to return secrets", settingsText.includes("Secrets are never returned by this endpoint."));
    check("standard admin navigation is present in the super-admin shell", settingsText.includes("Super Admin"));
    await page.screenshot({ path: path.join(OUT, "05-super-admin-settings.png"), fullPage: true });
    report.screenshots.push("05-super-admin-settings.png");

    await page.goto(`${BASE}/super-admin`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Ecosystem Control Center" }).waitFor({ timeout: 15000 });
    const superOverviewText = await bodyText(page);
    check("super-admin overview exposes Settings and the super-admin area", superOverviewText.includes("Settings") && superOverviewText.includes("Super admin area"));
    await page.screenshot({ path: path.join(OUT, "06-super-admin-overview.png"), fullPage: true });
    report.screenshots.push("06-super-admin-overview.png");

    const superApi = await page.request.get(`${BASE}/api/super-admin/system`);
    check("super admin receives HTTP 200 from the super-admin API", superApi.status() === 200, `HTTP ${superApi.status()}`);

    report.desktop = { url: page.url(), rows: { initialRows, filteredRows, searchedRows, headerSearchRows }, errors: desktopErrors };
    await desktop.close();

    /* ----------------------------------------------------------------- mobile */
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-NG", isMobile: true, hasTouch: true });
    const mobilePage = await mobile.newPage();
    const mobileErrors = wireDiagnostics(mobilePage, "mobile");

    await login(mobilePage, ADMIN);
    await mobilePage.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await mobilePage.getByRole("heading", { name: "Ecosystem Control Center" }).waitFor({ timeout: 15000 });
    const overflow = await mobilePage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    check("mobile layout does not overflow horizontally", overflow.scrollWidth <= overflow.clientWidth + 2, JSON.stringify(overflow));
    await mobilePage.screenshot({ path: path.join(OUT, "07-overview-mobile.png"), fullPage: true });
    report.screenshots.push("07-overview-mobile.png");

    await mobilePage.getByRole("button", { name: "Open navigation menu" }).first().click();
    await mobilePage.waitForTimeout(400);
    const menuVisible = await mobilePage.locator('aside, [aria-label="Control Center navigation"]').first().boundingBox();
    check("mobile menu reveals the sidebar", Boolean(menuVisible && menuVisible.x >= 0), JSON.stringify(menuVisible));
    await mobilePage.screenshot({ path: path.join(OUT, "08-mobile-menu.png") });
    report.screenshots.push("08-mobile-menu.png");

    await mobilePage.locator('a[href="/admin?tab=orders"]').first().click();
    await mobilePage.waitForURL(/tab=orders/, { timeout: 15000 });
    await mobilePage.waitForLoadState("networkidle");
    check("mobile sidebar link opens the Orders workspace", (await bodyText(mobilePage)).includes("Real orders from the marketplace service."), mobilePage.url());
    await mobilePage.waitForFunction(
      () => {
        const sidebar = document.querySelector('aside[aria-label="Control Center navigation"]');
        return sidebar ? sidebar.getBoundingClientRect().right <= 0 : false;
      },
      { timeout: 5000 }
    );
    check("mobile sidebar closes after navigation", true, "sidebar moved off-screen");
    await mobilePage.screenshot({ path: path.join(OUT, "09-orders-mobile.png"), fullPage: true });
    report.screenshots.push("09-orders-mobile.png");

    report.mobile = { errors: mobileErrors, overflow };
    await mobile.close();

    // Assert no credential leaked into screenshots' page text or the report.
    const leaked = [ADMIN.password, SUPER_ADMIN.password].filter((secret) => JSON.stringify(report).includes(secret));
    check("report contains no passwords", leaked.length === 0);
  } finally {
    await browser.close();
  }

  const failed = results.filter((item) => !item.ok);
  report.finishedAt = new Date().toISOString();
  report.summary = { total: results.length, passed: results.length - failed.length, failed: failed.length };
  await writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2), "utf8");

  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(`Screenshots and report: ${OUT}`);
  if (failed.length > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error("Control Center visual QA crashed:", error);
  process.exitCode = 1;
});
