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
const STAFF_PASSWORD = `GuestJourney-${randomUUID()}`;
const GUEST_PASSWORD = `Guest-${randomUUID()}`;
const SHOTS = path.join(process.cwd(), "qa-artifacts", "affiliate-guest");
let DESTINATION = "/product/journey-item";
const PRICE_KOBO = 100_000n;
const COMMISSION_KOBO = 5_000n;

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
    results.push({ name, status: "FAIL", detail: String(error && error.stack ? error.stack : error).slice(0, 1000) });
  }
}

async function apiLogin(email, password) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password })
  });
  assert(response.status === 200, `login ${email} returned ${response.status}`);
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return cookies.map((value) => value.split(";")[0].trim()).filter(Boolean).join("; ");
}

async function apiJson(method, pathName, cookie, body) {
  const response = await fetch(BASE + pathName, {
    method,
    headers: { "Content-Type": "application/json", Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const status = response.status;
  const text = await response.text();
  let parsed = null;
  if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
  return { status, body: parsed };
}

async function makeStaff(key, actorType, roles) {
  const email = `guest-${RUN}-${key}@example.test`;
  const user = await prisma.user.create({ data: { email, name: `Guest ${key}`, actorType, passwordHash: hashPassword(STAFF_PASSWORD) } });
  for (const name of roles) {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  return { id: user.id, email, cookie: await apiLogin(email, STAFF_PASSWORD) };
}

async function fund(userId, amountKobo) {
  const system = (await prisma.wallet.findFirst({ where: { ownerType: "SYSTEM" } }))
    ?? (await prisma.wallet.create({ data: { ownerType: "SYSTEM", availableKobo: 0n, heldKobo: 0n } }));
  const buyer = (await prisma.wallet.findFirst({ where: { userId, ownerType: "CUSTOMER" } }))
    ?? (await prisma.wallet.create({ data: { ownerType: "CUSTOMER", userId, availableKobo: 0n, heldKobo: 0n } }));
  await prisma.$transaction(async (tx) => {
    await tx.wallet.update({ where: { id: system.id }, data: { availableKobo: { decrement: amountKobo } } });
    await tx.wallet.update({ where: { id: buyer.id }, data: { availableKobo: { increment: amountKobo } } });
    await tx.walletTransaction.create({
      data: {
        walletId: buyer.id, type: "credit", amountKobo, reference: `GUEST-FUND-${RUN}-${buyer.id}`,
        description: "Isolated guest journey funding",
        ledger: { create: [
          { walletId: system.id, direction: "DEBIT", amountKobo, memo: "Guest journey fixture funding" },
          { walletId: buyer.id, direction: "CREDIT", amountKobo, memo: "Guest journey fixture funding" }
        ] }
      }
    });
  });
}

async function fixtureProduct() {
  const owner = await prisma.user.create({
    data: { email: `guest-${RUN}-vendor@example.test`, name: "Journey vendor", actorType: "VENDOR", passwordHash: hashPassword(STAFF_PASSWORD) }
  });
  const vendor = await prisma.vendor.create({
    data: {
      ownerId: owner.id, name: `Journey Vendor ${RUN}`, slug: `journey-vendor-${RUN}`, market: "Alaba",
      pickupAddress: "1 Alaba Way, Lagos", pickupPhone: "+2348000000000", status: "VERIFIED", commissionBps: 1000
    }
  });
  const category = await prisma.category.upsert({
    where: { slug: "journey-guest" }, update: {}, create: { name: "Journey Guest", slug: "journey-guest" }
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id, categoryId: category.id, name: `Journey item ${RUN}`, slug: `journey-item-${RUN}`,
      description: "Isolated guest attribution fixture", priceKobo: PRICE_KOBO, status: "ACTIVE", countryCode: "NG"
    }
  });
  await prisma.inventoryStock.create({ data: { productId: product.id, quantity: 20 } });
  return product;
}

async function enableNgCheckout() {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CountrySetting" (code, enabled, "deliveryEnabled", "updatedAt") VALUES ('NG', true, true, now())
     ON CONFLICT (code) DO UPDATE SET enabled = true, "deliveryEnabled" = true, "updatedAt" = now()`
  ).catch(() => undefined);
}

/** Browser-origin call on a stable page, so the real cookie jar is used. */
async function callFromPage(page, pathName, payload, method = "POST") {
  return page.evaluate(async ({ pathName: p, method: m, body }) => {
    const response = await fetch(p, {
      method: m,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const status = response.status;
    const text = await response.text();
    let parsed = null;
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
    return { status, body: parsed };
  }, { pathName, method, body: payload });
}

async function main() {
  const live = await prisma.$queryRawUnsafe("select current_database() as db");
  assert(live[0].db === "naijadeals_affiliate_test", `connected to ${live[0].db}`);
  mkdirSync(SHOTS, { recursive: true });
  await enableNgCheckout();

  const admin = await makeStaff("admin", "ADMIN", ["admin"]);
  const product = await fixtureProduct();
  DESTINATION = `/product/${product.slug}`;

  const campaign = await apiJson("POST", "/api/admin/affiliate-campaigns", admin.cookie, {
    slug: `guest-${RUN}`, name: `Guest campaign ${RUN}`, vertical: "shop",
    commissionBps: 500, budgetKobo: "5000000", attributionDays: 30, commissionBasis: "SUBTOTAL"
  });
  assert(campaign.status === 201, `campaign creation returned ${campaign.status}: ${JSON.stringify(campaign.body)}`);
  const activated = await apiJson("PATCH", `/api/admin/affiliate-campaigns/${campaign.body.id}`, admin.cookie, { status: "ACTIVE" });
  assert(activated.status === 200, `campaign activation returned ${activated.status}`);

  const affiliate = await makeStaff("affiliate", "CUSTOMER", []);
  const profile = await prisma.affiliateProfile.create({
    data: { userId: affiliate.id, termsVersion: "guest", termsAcceptedAt: new Date(), status: "APPROVED", approvedAt: new Date() }
  });
  const link = await apiJson("POST", "/api/affiliate/links", affiliate.cookie, { campaignId: campaign.body.id, destination: DESTINATION });
  assert(link.status === 201, `link creation returned ${link.status}: ${JSON.stringify(link.body)}`);
  const linkCode = link.body.code;

  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const visitor = randomBytes(16).toString("hex");

  await step("Consenting guest lands, signs up, checks out and pays: one commission", async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
    await context.addCookies([
      { name: "nd_visitor", value: visitor, url: BASE },
      { name: "nd_consent", value: "all", url: BASE }
    ]);
    const page = await context.newPage();
    await page.goto(`${BASE}/r/${linkCode}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(new RegExp(`${DESTINATION}$`), { timeout: 20000 });
    await page.screenshot({ path: path.join(SHOTS, "guest-landing.png"), fullPage: true });
    await page.waitForLoadState("load");
    await page.waitForTimeout(800);

    const touch = await prisma.attributionTouch.findFirstOrThrow({ where: { linkId: link.body.id, visitorKey: visitor } });
    assert(touch.consent === true, "landing touch was not consented");

    const email = `guest-${RUN}-buyer@example.test`;
    const registered = await callFromPage(page, "/api/auth/register", { name: "Guest Buyer", email, password: GUEST_PASSWORD, phone: "+2348012345678" });
    assert(registered.status === 201, `registration returned ${registered.status}: ${JSON.stringify(registered.body)}`);
    const buyer = await prisma.user.findUniqueOrThrow({ where: { email } });
    await fund(buyer.id, 10_000_000n);

    const cart = await callFromPage(page, "/api/cart/items", { productId: product.id, quantity: 1 });
    assert(cart.status === 201, `cart add returned ${cart.status}: ${JSON.stringify(cart.body)}`);

    const checkout = await callFromPage(page, "/api/checkout", {
      address: { contactName: "Guest Buyer", contactPhone: "+2348012345678", countryCode: "NG", state: "Lagos", city: "Ikeja", line1: "1 Journey Street" },
      saveAddress: false
    });
    assert(checkout.status === 201, `checkout returned ${checkout.status}: ${JSON.stringify(checkout.body)}`);
    assert(checkout.body.attributed === true, "order was not attributed despite a consented guest touch");
    const orderId = checkout.body.orders[0].orderId;

    const frozen = await prisma.orderAttribution.findUniqueOrThrow({ where: { orderId } });
    assert(frozen.touchId === touch.id && frozen.affiliateId === profile.id && frozen.campaignId === campaign.body.id, "frozen attribution does not match the landing touch");

    const initialized = await callFromPage(page, "/api/payments/initialize", { orderId, provider: "wallet" });
    assert(initialized.status === 201, `initialize returned ${initialized.status}: ${JSON.stringify(initialized.body)}`);
    const confirmed = await callFromPage(page, "/api/payments/confirm", { reference: initialized.body.reference, provider: "wallet" });
    assert(confirmed.status === 200 && confirmed.body.duplicate === false, `confirm returned ${confirmed.status}: ${JSON.stringify(confirmed.body)}`);

    const conversions = await prisma.affiliateConversion.findMany({ where: { entityId: orderId } });
    assert(conversions.length === 1, `expected exactly one conversion, found ${conversions.length}`);
    assert(conversions[0].affiliateId === profile.id && conversions[0].amountKobo === COMMISSION_KOBO, `unexpected commission ${conversions[0].amountKobo}`);
    assert(conversions[0].basisKobo === PRICE_KOBO && conversions[0].state === "TRACKED", `unexpected basis/state ${conversions[0].basisKobo}/${conversions[0].state}`);

    const spentAfter = (await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: campaign.body.id } })).spentKobo;

    const duplicate = await callFromPage(page, "/api/payments/confirm", { reference: initialized.body.reference, provider: "wallet" });
    assert(duplicate.status === 200 && duplicate.body.duplicate === true, `duplicate confirm returned ${duplicate.status}: ${JSON.stringify(duplicate.body)}`);
    assert((await prisma.affiliateConversion.count({ where: { entityId: orderId } })) === 1, "duplicate confirmation created another conversion");
    assert((await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: campaign.body.id } })).spentKobo === spentAfter, "duplicate confirmation changed the campaign spend");

    await page.goto(`${BASE}/orders`, { waitUntil: "domcontentloaded" });
    await page.screenshot({ path: path.join(SHOTS, "guest-paid-order.png"), fullPage: true });
    await context.close();
    return `guest touch -> signup -> checkout (attributed) -> wallet payment; one conversion of ${COMMISSION_KOBO} kobo; duplicate confirm kept one`;
  });

  await step("A guest without consent is never attributed", async () => {
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    const noConsentVisitor = randomBytes(16).toString("hex");
    await context.addCookies([{ name: "nd_visitor", value: noConsentVisitor, url: BASE }]);
    const page = await context.newPage();
    await page.goto(`${BASE}/r/${linkCode}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(new RegExp(`${DESTINATION}$`), { timeout: 20000 });
    await page.waitForLoadState("load");
    await page.waitForTimeout(800);

    const email = `guest-${RUN}-noconsent@example.test`;
    const registered = await callFromPage(page, "/api/auth/register", { name: "No Consent", email, password: GUEST_PASSWORD });
    assert(registered.status === 201, `registration returned ${registered.status}`);
    const buyer = await prisma.user.findUniqueOrThrow({ where: { email } });
    await fund(buyer.id, 10_000_000n);
    await callFromPage(page, "/api/cart/items", { productId: product.id, quantity: 1 });
    const checkout = await callFromPage(page, "/api/checkout", {
      address: { contactName: "No Consent", contactPhone: "+2348012345679", countryCode: "NG", state: "Lagos", city: "Ikeja", line1: "2 Journey Street" }
    });
    assert(checkout.status === 201, `checkout returned ${checkout.status}: ${JSON.stringify(checkout.body)}`);
    assert(checkout.body.attributed === false, "unconsented touch produced an attributed order");

    const initialized = await callFromPage(page, "/api/payments/initialize", { orderId: checkout.body.orders[0].orderId, provider: "wallet" });
    const confirmed = await callFromPage(page, "/api/payments/confirm", { reference: initialized.body.reference, provider: "wallet" });
    assert(confirmed.status === 200, `confirm returned ${confirmed.status}`);
    assert((await prisma.affiliateConversion.count({ where: { entityId: checkout.body.orders[0].orderId } })) === 0, "unconsented order produced a commission");
    await context.close();
    return `no consent -> attributed:false -> zero conversions`;
  });

  await step("A signed-in visitor is attributed, and buying through your own link is refused", async () => {
    const email = `guest-${RUN}-signedin@example.test`;
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    await context.addCookies([{ name: "nd_visitor", value: randomBytes(16).toString("hex"), url: BASE }, { name: "nd_consent", value: "all", url: BASE }]);
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    const registered = await callFromPage(page, "/api/auth/register", { name: "Signed In", email, password: GUEST_PASSWORD });
    assert(registered.status === 201, `registration returned ${registered.status}: ${JSON.stringify(registered.body)}`);
    const buyer = await prisma.user.findUniqueOrThrow({ where: { email } });
    await fund(buyer.id, 10_000_000n);
    // The login page reacts to the new session and may navigate; let it settle.
    await page.waitForTimeout(1200);
    await page.goto(`${BASE}/r/${linkCode}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(new RegExp(`${DESTINATION}$`), { timeout: 20000 });
    await page.waitForLoadState("load");
    await page.waitForTimeout(800);
    await callFromPage(page, "/api/cart/items", { productId: product.id, quantity: 1 });
    const checkout = await callFromPage(page, "/api/checkout", {
      address: { contactName: "Signed In", contactPhone: "+2348012345680", countryCode: "NG", state: "Lagos", city: "Ikeja", line1: "3 Journey Street" }
    });
    assert(checkout.status === 201 && checkout.body.attributed === true, `signed-in checkout was not attributed: ${JSON.stringify(checkout.body)}`);
    await context.close();

    // The affiliate buying through their own link must not be attributed.
    const selfContext = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    await selfContext.addCookies([{ name: "nd_visitor", value: randomBytes(16).toString("hex"), url: BASE }, { name: "nd_consent", value: "all", url: BASE }]);
    await selfContext.addCookies(affiliate.cookie.split("; ").map((pair) => {
      const [name, value] = pair.split("=");
      return { name, value, url: BASE };
    }));
    const selfPage = await selfContext.newPage();
    await fund(affiliate.id, 10_000_000n);
    await selfPage.goto(`${BASE}/r/${linkCode}`, { waitUntil: "domcontentloaded" });
    await selfPage.waitForURL(new RegExp(`${DESTINATION}$`), { timeout: 20000 });
    await selfPage.waitForLoadState("load");
    await selfPage.waitForTimeout(800);
    await callFromPage(selfPage, "/api/cart/items", { productId: product.id, quantity: 1 });
    const selfCheckout = await callFromPage(selfPage, "/api/checkout", {
      address: { contactName: "Self Buyer", contactPhone: "+2348012345681", countryCode: "NG", state: "Lagos", city: "Ikeja", line1: "4 Journey Street" }
    });
    assert(selfCheckout.status === 201, `self checkout returned ${selfCheckout.status}: ${JSON.stringify(selfCheckout.body)}`);
    assert(selfCheckout.body.attributed === false, "affiliate was attributed for buying through their own link");
    await selfContext.close();
    return `signed-in touch attributed; self-referral order attributed:false`;
  });

  await browser.close();
  const failures = results.filter((row) => row.status === "FAIL").length;
  console.log(JSON.stringify({ run: RUN, base: BASE, campaign: campaign.body.id, linkCode, results, failures }, null, 2));
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => prisma.$disconnect().catch(() => undefined));
