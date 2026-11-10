const { chromium } = require("playwright-core");
const { randomUUID, randomBytes, scryptSync } = require("node:crypto");
const { mkdirSync } = require("node:fs");
const path = require("node:path");
require("dotenv").config();

// Same isolated database and preview as the HTTP suites.
const database = new URL(process.env.DATABASE_URL);
database.pathname = "/naijadeals_affiliate_test";
process.env.DATABASE_URL = database.toString();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BASE = process.env.AUTHZ_BASE_URL ?? "http://localhost:3017";
const RUN = randomUUID().slice(0, 8);
const PASSWORD = `Ui-${randomUUID()}`;
const SHOTS = path.join(process.cwd(), "qa-artifacts", "affiliate-review");

function hashPassword(password) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
}

const results = [];
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function step(name, run) {
  try {
    results.push({ name, status: "PASS", detail: await run() });
  } catch (error) {
    results.push({ name, status: "FAIL", detail: String(error && error.stack ? error.stack : error).slice(0, 900) });
  }
}

async function makeStaff(key, roleName) {
  const email = `ui-${RUN}-${key}@example.test`;
  const passwordHash = hashPassword(PASSWORD);
  const user = await prisma.user.create({ data: { email, name: `UI ${key}`, actorType: "ADMIN", passwordHash } });
  const role = await prisma.role.upsert({ where: { name: roleName }, update: {}, create: { name: roleName } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return email;
}

async function park(orderId, amountKobo) {
  const profile = await prisma.affiliateProfile.findFirstOrThrow({ select: { id: true } });
  const campaign = await prisma.affiliateCampaign.findFirstOrThrow({ select: { id: true } });
  await prisma.affiliateConversion.create({
    data: {
      dedupeKey: `Order:${orderId}`, affiliateId: profile.id, campaignId: campaign.id,
      entityType: "Order", entityId: orderId, ruleVersion: 1, basisType: null,
      commissionBps: 500, basisKobo: 1_000_000n, amountKobo: 50_000n, state: "PAID",
      ledgerReference: `UI-${orderId}`
    }
  });
  return prisma.affiliateReversalIntent.create({
    data: {
      dedupeKey: `refund:${orderId}`, refundId: `rf-${orderId}`, orderId, amountKobo,
      state: "FAILED", attempts: 1, lastError: "review_required:missing_allocation"
    }
  });
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login?next=/admin/affiliate-reviews`, { waitUntil: "domcontentloaded" });
  // A cold context must finish hydrating: clicking earlier lets the browser
  // perform the form's native submit instead of calling the login API.
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  const attempt = page.waitForResponse((response) => response.url().includes("/api/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in" }).click();
  const response = await attempt;
  assert(response.status() === 200, `browser login returned ${response.status()}`);
  await page.goto(`${BASE}/admin/affiliate-reviews`, { waitUntil: "domcontentloaded" });
  await page.locator("li").first().waitFor({ timeout: 20000 });
}

async function main() {
  const live = await prisma.$queryRawUnsafe("select current_database() as db");
  assert(live[0].db === "naijadeals_affiliate_test", `connected to ${live[0].db}`);
  mkdirSync(SHOTS, { recursive: true });

  const reviewerEmail = await makeStaff("reviewer", "affiliate_reviewer");
  const managerEmail = await makeStaff("manager", "admin");
  const reviewerOrder = `uiR-${RUN}-parked`;
  const managerOrder = `uiM-${RUN}-parked`;
  await park(reviewerOrder, 500_000n);
  await park(managerOrder, 500_000n);

  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

  await step("Reviewer sees the populated queue and a read-only detail", async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await signIn(page, reviewerEmail);
    await page.locator("li", { hasText: reviewerOrder.slice(0, 12) }).first().waitFor({ timeout: 20000 });
    const rows = await page.locator("li").filter({ hasText: "refunded" }).count();
    assert(rows >= 2, `expected a populated queue, saw ${rows} rows`);
    await page.screenshot({ path: path.join(SHOTS, "reviewer-queue.png"), fullPage: true });

    const row = page.locator("li", { hasText: reviewerOrder.slice(0, 12) }).first();
    await row.getByRole("button", { name: "Inspect" }).click();
    await page.getByText("Read-only: resolving requires the affiliates:manage permission.").waitFor();
    assert((await page.getByRole("button", { name: "Resolve with evidence" }).count()) === 0, "reviewer page rendered a resolve button");
    assert((await page.getByLabel("Basis amount (kobo)").count()) === 0, "reviewer page rendered basis inputs");
    await page.screenshot({ path: path.join(SHOTS, "reviewer-readonly.png"), fullPage: true });

    const attempt = await page.evaluate(async (intentId) => {
      const response = await fetch("/api/admin/affiliate-reviews", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId, basisType: "TOTAL", basisKobo: "1000000", evidenceRef: "ui-evidence", reason: "ui attempt from a read-only session" })
      });
      return response.status;
    }, (await prisma.affiliateReversalIntent.findFirstOrThrow({ where: { orderId: reviewerOrder } })).id);
    assert(attempt === 403, `browser-side reviewer resolve returned ${attempt}`);
    const intent = await prisma.affiliateReversalIntent.findFirstOrThrow({ where: { orderId: reviewerOrder } });
    assert(intent.state === "FAILED" && intent.eligibleKobo === null, "reviewer browser attempt mutated the intent");
    await context.close();
    return `${rows} rows, Inspect shows read-only copy, no resolve controls or inputs, POST ${attempt}, intent untouched`;
  });

  await step("Manager resolves through the form and the row leaves the queue", async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await signIn(page, managerEmail);
    const row = page.locator("li", { hasText: managerOrder.slice(0, 12) }).first();
    await row.getByRole("button", { name: "Review" }).click();
    await page.getByLabel("Basis amount (kobo)").fill("1000000");
    await page.getByLabel("Evidence reference").fill("ui-ledger-2026-11");
    await page.getByLabel("Reason").fill("basis confirmed in the browser walk");
    await page.screenshot({ path: path.join(SHOTS, "manager-form.png"), fullPage: true });
    await page.getByRole("button", { name: "Resolve with evidence" }).click();
    await page.getByText(/Queued for processing with ₦/).waitFor({ timeout: 20000 });
    const notice = (await page.getByText(/Queued for processing with ₦/).innerText()).trim();
    await page.screenshot({ path: path.join(SHOTS, "manager-resolved.png"), fullPage: true });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const stillListed = await page.locator("li", { hasText: managerOrder.slice(0, 12) }).count();
    assert(stillListed === 0, "resolved intent is still in the review queue");

    const intent = await prisma.affiliateReversalIntent.findFirstOrThrow({ where: { orderId: managerOrder } });
    assert(intent.state === "PENDING" && intent.eligibleKobo === 500_000n, `intent not requeued: ${intent.state}/${intent.eligibleKobo}`);
    const audit = await prisma.auditLog.count({ where: { entityId: intent.id, action: "affiliate.reversal_review_resolved" } });
    assert(audit === 1, `expected one resolution audit row, found ${audit}`);
    await context.close();
    return `${notice}; intent PENDING eligible=500000, one audit row, row removed from queue`;
  });

  await browser.close();
  const failures = results.filter((row) => row.status === "FAIL").length;
  console.log(JSON.stringify({ run: RUN, base: BASE, results, failures }, null, 2));
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => prisma.$disconnect().catch(() => undefined));
