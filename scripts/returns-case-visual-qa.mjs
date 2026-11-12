/**
 * Returns-case visual and journey QA.
 *
 * Usage:
 *   1. Start the app (NEXT_DIST_DIR=.next-returns-qa npx next start -p 3100)
 *   2. NEXT_DIST_DIR/.env in place, then:
 *      QA_BASE_URL=http://localhost:3100 node scripts/returns-case-visual-qa.mjs
 *
 * It signs in with the seeded accounts, submits one real return through the
 * UI, approves it through the seller queue, captures desktop/mobile/loading/
 * error/ineligible screenshots and deletes its own fixture afterwards. It never
 * calls the receive/refund seller action.
 */

import "dotenv/config";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = (process.env.QA_BASE_URL || "http://localhost:3100").replace(/\/$/, "");
const OUT = path.join(process.cwd(), "qa-artifacts", "returns-case");
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CUSTOMER = {
  email: process.env.QA_CUSTOMER_EMAIL || "customer@naijadeals.local",
  password: process.env.QA_CUSTOMER_PASSWORD || "CustomerPass123!"
};
const SELLER = {
  email: process.env.QA_SELLER_EMAIL || "seller@naijadeals.local",
  password: process.env.QA_SELLER_PASSWORD || "SellerPass123!"
};
const OPEN = new Set(["REQUESTED", "APPROVED", "RECEIVED"]);
const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const prisma = new PrismaClient();
const screenshots = [];
const checks = [];
let consoleProblems = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) throw new Error(detail || name);
}

function localDatabaseOnly() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set.");
  const host = new URL(raw).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`Refusing to mutate fixtures against non-local database host ${host}.`);
  }
}

async function shot(page, name, options = {}) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false, ...options });
  screenshots.push(path.relative(process.cwd(), file));
  return file;
}

async function login(context, account) {
  const response = await context.request.post(`${BASE}/api/auth/login`, {
    data: account,
    headers: { Origin: BASE, "Content-Type": "application/json" }
  });
  assert(response.ok(), `login failed for ${account.email}: HTTP ${response.status()}`);
}

function watchPage(page, label) {
  page.on("pageerror", (error) => consoleProblems.push(`${label} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") consoleProblems.push(`${label} console: ${message.text()}`);
  });
}

async function main() {
  localDatabaseOnly();
  await fs.mkdir(OUT, { recursive: true });

  const ordersResponse = await fetch(`${BASE}/api/orders`);
  assert(ordersResponse.status === 401, "precondition: guest orders API should be 401");

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  let createdReturnId = null;
  let primaryOrder = null;
  let shiftedOrder = null;
  let shiftedOriginalUpdatedAt = null;

  try {
    // Guest: the route is protected server-side.
    const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    const guestPage = await guest.newPage();
    watchPage(guestPage, "guest-390");
    await guestPage.goto(`${BASE}/returns`, { waitUntil: "domcontentloaded" });
    await guestPage.waitForURL(/\/login/, { timeout: 15_000 });
    check("guest is redirected to sign-in", guestPage.url().includes("/login?next=/returns"), guestPage.url());
    await shot(guestPage, "guest-390-login-gate");
    await guest.close();

    // Read the seeded customer's orders through the real API.
    const customerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
    await login(customerContext, CUSTOMER);
    const apiOrders = await customerContext.request.get(`${BASE}/api/orders`);
    assert(apiOrders.ok(), `orders API failed: HTTP ${apiOrders.status()}`);
    const orders = await apiOrders.json();
    const now = Date.now();
    const eligible = orders
      .filter(
        (order) =>
          ["delivered", "completed"].includes(order.status) &&
          !(order.returnRequests ?? []).some((request) => OPEN.has(request.status)) &&
          Number.isFinite(Date.parse(order.updatedAt)) &&
          now <= Date.parse(order.updatedAt) + WINDOW_MS
      )
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    assert(eligible.length >= 3, `expected at least three eligible orders, found ${eligible.length}`);
    primaryOrder = eligible[0];
    shiftedOrder = eligible[eligible.length - 1];

    const page = await customerContext.newPage();
    watchPage(page, "customer-1440");
    await page.goto(`${BASE}/returns`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Returns & refunds" }).waitFor({ timeout: 20_000 });
    await page.getByText("No return cases yet").waitFor();
    check("initial empty case state is shown", await page.getByText("No return cases yet").isVisible());
    check("eligible orders are listed", (await page.getByRole("button", { name: "Start a return" }).count()) > 0);
    await shot(page, "customer-1440-empty-and-eligible");

    const primaryCard = page.locator(`#eligible-order-${primaryOrder.id}`);
    await primaryCard.scrollIntoViewIfNeeded();
    await primaryCard.getByRole("button", { name: "Start a return" }).click();
    const reason = primaryCard.locator(`#return-reason-${primaryOrder.id}`);
    await reason.waitFor();
    await reason.selectOption({ label: "Item arrived damaged or defective" });
    await primaryCard
      .locator(`#return-detail-${primaryOrder.id}`)
      .fill("QA journey fixture: the screen arrived cracked. This case is removed after the run.");
    await primaryCard.locator("form").evaluate((element) => {
      const top = element.getBoundingClientRect().top + window.scrollY - 150;
      window.scrollTo({ top, behavior: "instant" });
    });
    await shot(page, "customer-1440-return-form");

    // Keyboard order inside the form: reason -> notes -> submit.
    await reason.focus();
    await page.keyboard.press("Tab");
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? "");
    check("keyboard moves from reason to notes", focusedTag === "TEXTAREA", focusedTag);

    await primaryCard.getByRole("button", { name: "Submit return request" }).click();
    await page.getByText(/Return request RET-/).waitFor({ timeout: 20_000 });
    const caseArticle = page.locator("article[aria-labelledby^='return-case-']").first();
    await caseArticle.waitFor();
    const labelledBy = await caseArticle.getAttribute("aria-labelledby");
    createdReturnId = labelledBy?.replace("return-case-", "") ?? null;
    check("a real return case id is rendered", Boolean(createdReturnId), String(createdReturnId));
    await caseArticle.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -140));
    await shot(page, "customer-1440-case-requested");
    await caseArticle.screenshot({ path: path.join(OUT, "customer-1440-case-requested-detail.png") });
    screenshots.push(path.join("qa-artifacts", "returns-case", "customer-1440-case-requested-detail.png"));
    const requestedText = await caseArticle.innerText();
    check("case shows awaiting seller", requestedText.includes("Awaiting seller"), requestedText.slice(0, 120));
    check("case shows a separate refund status", requestedText.includes("REFUND STATUS") || requestedText.includes("Refund status"));
    check("case shows no refund invented", requestedText.includes("No refund yet"));

    // The /orders "Request return" link deep-links here and opens the form.
    const deepLinkOrder = eligible[2];
    await page.goto(`${BASE}/returns?order=${deepLinkOrder.id}`, { waitUntil: "domcontentloaded" });
    const deepLinkReason = page.locator(`#return-reason-${deepLinkOrder.id}`);
    await deepLinkReason.waitFor({ timeout: 20_000 });
    await page.waitForFunction(
      (id) => document.activeElement?.id === id,
      `return-reason-${deepLinkOrder.id}`,
      { timeout: 10_000 }
    );
    check("deep link from orders opens and focuses the return form", await deepLinkReason.isVisible());
    await page.waitForTimeout(250);
    await shot(page, "customer-1440-orders-deep-link");

    // Mobile: eligible list, form and overflow guard.
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await login(mobileContext, CUSTOMER);
    const mobile = await mobileContext.newPage();
    watchPage(mobile, "customer-390");
    await mobile.goto(`${BASE}/returns`, { waitUntil: "domcontentloaded" });
    await mobile.getByRole("heading", { name: "Returns & refunds" }).waitFor({ timeout: 20_000 });
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("mobile page has no horizontal overflow", overflow <= 1, `overflow ${overflow}px`);
    await shot(mobile, "customer-390-eligible-and-case");
    const mobileCase = mobile.locator(`article[aria-labelledby="return-case-${createdReturnId}"]`);
    await mobileCase.scrollIntoViewIfNeeded();
    await mobileCase.screenshot({ path: path.join(OUT, "customer-390-case-requested.png") });
    screenshots.push(path.join("qa-artifacts", "returns-case", "customer-390-case-requested.png"));

    const mobileSecondary = eligible[1];
    const mobileCard = mobile.locator(`#eligible-order-${mobileSecondary.id}`);
    await mobileCard.scrollIntoViewIfNeeded();
    await mobileCard.getByRole("button", { name: "Start a return" }).click();
    await mobileCard.locator(`#return-reason-${mobileSecondary.id}`).waitFor();
    await mobileCard.scrollIntoViewIfNeeded();
    await shot(mobile, "customer-390-return-form");
    await mobileCard.getByRole("button", { name: "Cancel" }).click();

    // Loading state with a delayed orders response.
    const loadingPage = await mobileContext.newPage();
    watchPage(loadingPage, "customer-390-loading");
    await loadingPage.route("**/api/orders", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await loadingPage.goto(`${BASE}/returns`, { waitUntil: "domcontentloaded" });
    await loadingPage.waitForTimeout(250);
    await shot(loadingPage, "customer-390-loading");
    await loadingPage.close();

    // Error state with a failed orders response.
    const errorPage = await mobileContext.newPage();
    watchPage(errorPage, "customer-390-error");
    await errorPage.route("**/api/orders", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Returns service unavailable." }) })
    );
    await errorPage.goto(`${BASE}/returns`, { waitUntil: "domcontentloaded" });
    await errorPage.getByRole("heading", { name: "Returns could not be loaded" }).waitFor({ timeout: 15_000 });
    check("error state offers a retry", await errorPage.getByRole("button", { name: "Try again" }).isVisible());
    await shot(errorPage, "customer-390-error");
    await errorPage.close();

    // Seller queue: approve the real case through the existing seller route.
    const sellerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
    await login(sellerContext, SELLER);
    const sellerPage = await sellerContext.newPage();
    watchPage(sellerPage, "seller-1440");
    await sellerPage.goto(`${BASE}/returns`, { waitUntil: "domcontentloaded" });
    await sellerPage.getByRole("heading", { name: "Seller return queue" }).waitFor({ timeout: 20_000 });
    const sellerSection = sellerPage.locator("section[aria-labelledby='seller-returns-heading']");
    const sellerRow = sellerSection.locator("article").filter({ hasText: primaryOrder.orderNumber }).first();
    await sellerRow.waitFor();
    await sellerSection.scrollIntoViewIfNeeded();
    await shot(sellerPage, "seller-1440-queue");
    await sellerRow.getByRole("button", { name: "Approve return" }).click();
    await sellerPage.getByText("Return approved.").waitFor({ timeout: 15_000 });
    await sellerRow.getByRole("button", { name: "Receive and refund" }).waitFor({ timeout: 15_000 });
    await shot(sellerPage, "seller-1440-approved");
    check("seller queue distinguishes approve from receive", (await sellerRow.getByRole("button", { name: "Receive and refund" }).count()) === 1);
    // Receive/refund is intentionally not clicked: it moves money and stock.

    // Customer sees the decision and the unchanged refund status.
    await page.goto(`${BASE}/returns`, { waitUntil: "domcontentloaded" });
    const approvedCase = page.locator(`article[aria-labelledby="return-case-${createdReturnId}"]`);
    await approvedCase.waitFor({ timeout: 20_000 });
    const approvedText = await approvedCase.innerText();
    check("customer sees the approved status", approvedText.includes("Approved"), approvedText.slice(0, 120));
    check("approval does not claim a completed refund", approvedText.includes("No refund yet"));
    await approvedCase.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -140));
    await shot(page, "customer-1440-case-approved");
    await approvedCase.screenshot({ path: path.join(OUT, "customer-1440-case-approved-detail.png") });
    screenshots.push(path.join("qa-artifacts", "returns-case", "customer-1440-case-approved-detail.png"));

    await mobile.goto(`${BASE}/returns`, { waitUntil: "domcontentloaded" });
    const mobileApproved = mobile.locator(`article[aria-labelledby="return-case-${createdReturnId}"]`);
    await mobileApproved.waitFor({ timeout: 20_000 });
    await mobileApproved.scrollIntoViewIfNeeded();
    await mobileApproved.screenshot({ path: path.join(OUT, "customer-390-case-approved.png") });
    screenshots.push(path.join("qa-artifacts", "returns-case", "customer-390-case-approved.png"));

    // Real ineligible state: move one unused eligible order outside the window,
    // capture the closed-window panel, then restore its exact timestamp.
    shiftedOriginalUpdatedAt = new Date(shiftedOrder.updatedAt);
    await prisma.order.update({
      where: { id: shiftedOrder.id },
      data: { updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) }
    });
    await page.goto(`${BASE}/returns`, { waitUntil: "domcontentloaded" });
    const closedSummary = page.getByText(/Closed return windows \(/);
    await closedSummary.waitFor({ timeout: 20_000 });
    await closedSummary.click();
    const closedPanelText = await closedSummary.locator("xpath=ancestor::details[1]").innerText();
    check("closed-window panel lists the ineligible order", closedPanelText.includes(shiftedOrder.orderNumber), closedPanelText);
    await closedSummary.scrollIntoViewIfNeeded();
    await shot(page, "customer-1440-closed-window");
    await prisma.order.update({
      where: { id: shiftedOrder.id },
      data: { updatedAt: shiftedOriginalUpdatedAt }
    });
    shiftedOriginalUpdatedAt = null;

    const significantConsole = consoleProblems.filter(
      (entry) =>
        !entry.includes("favicon") &&
        !entry.includes("Download the React DevTools") &&
        !entry.includes("Extra attributes from the server") &&
        !entry.includes("status of 403 (Forbidden)") &&
        !entry.includes("status of 503 (Service Unavailable)")
    );
    check("no unexpected page or console errors", significantConsole.length === 0, significantConsole.join("\n"));
    consoleProblems = significantConsole;
  } finally {
    if (shiftedOriginalUpdatedAt && shiftedOrder) {
      await prisma.order
        .update({ where: { id: shiftedOrder.id }, data: { updatedAt: shiftedOriginalUpdatedAt } })
        .catch(() => undefined);
    }
    if (createdReturnId) {
      await prisma.auditLog.deleteMany({ where: { entityId: createdReturnId, action: { startsWith: "return." } } }).catch(() => undefined);
      await prisma.returnRequest.deleteMany({ where: { id: createdReturnId } }).catch(() => undefined);
      console.log(`INFO  removed return fixture ${createdReturnId}`);
    }
    await browser.close();
    await prisma.$disconnect();
  }

  console.log(JSON.stringify({ screenshots, checks, returnId: createdReturnId }, null, 2));
  const failed = checks.filter((entry) => !entry.ok);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  await prisma.$disconnect();
  process.exitCode = 1;
});
