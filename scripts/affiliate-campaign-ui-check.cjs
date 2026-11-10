const { chromium } = require("playwright-core");
const { randomUUID, randomBytes, scryptSync } = require("node:crypto");
const { mkdirSync } = require("node:fs");
const path = require("node:path");
require("dotenv").config();

const database = new URL(process.env.DATABASE_URL);
database.pathname = "/naijadeals_affiliate_test";
process.env.DATABASE_URL = database.toString();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BASE = process.env.AUTHZ_BASE_URL ?? "http://localhost:3017";
const RUN = randomUUID().slice(0, 8);
const PASSWORD = `UiCampaign-${randomUUID()}`;
const SHOTS = path.join(process.cwd(), "qa-artifacts", "affiliate-campaigns");
const CAMPAIGN_NAME = `UI Campaign ${RUN}`;
const SLUG = `ui-campaign-${RUN}`;

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

async function makeUser(key, actorType, roles) {
  const email = `uicamp-${RUN}-${key}@example.test`;
  const user = await prisma.user.create({ data: { email, name: `UI ${key}`, actorType, passwordHash: hashPassword(PASSWORD) } });
  for (const name of roles) {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  return { id: user.id, email };
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  const attempt = page.waitForResponse((response) => response.url().includes("/api/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in" }).click();
  const response = await attempt;
  assert(response.status() === 200, `browser login returned ${response.status()}`);
}

async function main() {
  const live = await prisma.$queryRawUnsafe("select current_database() as db");
  assert(live[0].db === "naijadeals_affiliate_test", `connected to ${live[0].db}`);
  mkdirSync(SHOTS, { recursive: true });

  const admin = await makeUser("admin", "ADMIN", ["admin"]);
  const affiliate = await makeUser("affiliate", "CUSTOMER", []);
  const profile = await prisma.affiliateProfile.create({
    data: { userId: affiliate.id, termsVersion: "ui", termsAcceptedAt: new Date(), status: "APPROVED", approvedAt: new Date() }
  });

  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  let linkCode = "";

  await step("Manager creates and activates a campaign in the Control Center", async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
    const page = await context.newPage();
    await signIn(page, admin.email);
    await page.goto(`${BASE}/admin/affiliate-campaigns`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Name", { exact: true }).fill(CAMPAIGN_NAME);
    await page.getByLabel("Slug", { exact: true }).fill(SLUG);
    await page.getByLabel("Commission (basis points)").fill("500");
    await page.getByLabel("Budget (kobo)").fill("5000000");
    await page.getByRole("button", { name: "Create draft" }).click();
    await page.getByText(/created as a draft/i).waitFor({ timeout: 20000 });

    const row = page.locator("li", { hasText: CAMPAIGN_NAME }).first();
    await row.waitFor({ timeout: 20000 });
    assert((await row.innerText()).includes("DRAFT"), "new campaign is not shown as a draft");
    await page.screenshot({ path: path.join(SHOTS, "admin-draft.png"), fullPage: true });

    await row.getByRole("button", { name: "Activate" }).click();
    await page.getByText(/is now Active/i).waitFor({ timeout: 20000 });
    const activeRow = page.locator("li", { hasText: CAMPAIGN_NAME }).first();
    assert((await activeRow.innerText()).includes("ACTIVE"), "campaign did not become active");
    await page.screenshot({ path: path.join(SHOTS, "admin-active.png"), fullPage: true });
    await context.close();

    const stored = await prisma.affiliateCampaign.findUniqueOrThrow({ where: { slug: SLUG } });
    assert(stored.status === "ACTIVE", `stored status is ${stored.status}`);
    return `draft created, activated in the browser, stored status ACTIVE`;
  });

  await step("Approved affiliate discovers the campaign and creates a link", async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
    const page = await context.newPage();
    await signIn(page, affiliate.email);
    await page.goto(`${BASE}/affiliate`, { waitUntil: "domcontentloaded" });
    await page.getByText("Campaigns open to you").waitFor({ timeout: 20000 });

    const row = page.locator("li", { hasText: CAMPAIGN_NAME }).first();
    await row.waitFor({ timeout: 20000 });
    await page.screenshot({ path: path.join(SHOTS, "affiliate-discovery.png"), fullPage: true });

    await row.getByRole("button", { name: "Create link" }).click();
    await page.getByLabel("Destination path").fill("/product/ui-journey");
    await page.getByRole("button", { name: "Create tracked link" }).click();
    const notice = page.getByText(/Link created: \/r\//);
    await notice.waitFor({ timeout: 20000 });
    const text = (await notice.innerText()).trim();
    const match = text.match(/\/r\/([A-Z0-9]{6,16})/);
    assert(match, `could not read the link code from "${text}"`);
    linkCode = match[1];

    await page.getByText(linkCode).first().waitFor({ timeout: 20000 });
    await page.screenshot({ path: path.join(SHOTS, "affiliate-link-created.png"), fullPage: true });

    const stored = await prisma.affiliateLink.findUniqueOrThrow({ where: { code: linkCode } });
    assert(stored.affiliateId === profile.id, "link is not tied to the signed-in affiliate");
    await context.close();
    return `${text}; link ${linkCode} persisted for the affiliate`;
  });

  await step("The tracked link records a consenting touch and redirects internally", async () => {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const visitor = `ui-visitor-${RUN}`;
    await context.addCookies([
      { name: "nd_visitor", value: visitor, url: BASE },
      { name: "nd_consent", value: "all", url: BASE }
    ]);
    const page = await context.newPage();
    await page.goto(`${BASE}/r/${linkCode}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/product\/ui-journey$/, { timeout: 20000 });
    await page.screenshot({ path: path.join(SHOTS, "referral-landing.png"), fullPage: true });

    const link = await prisma.affiliateLink.findUniqueOrThrow({ where: { code: linkCode } });
    const touch = await prisma.attributionTouch.findFirst({ where: { linkId: link.id, visitorKey: visitor } });
    assert(touch && touch.consent === true, "no consenting attribution touch was recorded");
    await context.close();
    return `browser landed on /product/ui-journey; touch stored with consent:true`;
  });

  await browser.close();
  const failures = results.filter((row) => row.status === "FAIL").length;
  console.log(JSON.stringify({ run: RUN, base: BASE, campaign: SLUG, results, failures }, null, 2));
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => prisma.$disconnect().catch(() => undefined));
