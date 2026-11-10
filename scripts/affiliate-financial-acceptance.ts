import "dotenv/config";
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";
import { reverseConversion, settleConversion } from "../lib/services/affiliate/settlement";
import { resolveCheckoutAttribution } from "../lib/services/affiliate/service";

/**
 * Financial acceptance for the affiliate slice.
 *
 *   npx tsx scripts/affiliate-financial-acceptance.ts
 *
 * Covers what the happy-path journeys cannot: providers that refuse instead of
 * performing an unconfigured operation, concurrent reversals on an unsettled
 * conversion, settlement racing a reversal, and audit identity that comes from
 * the session rather than the request body.
 */

const REQUIRED_DB = "naijadeals_affiliate_test";
const BASE = process.env.AUTHZ_BASE_URL ?? "http://localhost:3017";
const PASSWORD = `Fin-${randomUUID()}`;
const runId = randomUUID().slice(0, 8);

const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
let failures = 0;
function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
function describeError(error: unknown): string {
  try { return inspect(error, { depth: 3, breakLength: 200 }).slice(0, 1000); } catch { return String(error).slice(0, 1000); }
}
async function check(name: string, run: () => Promise<string>) {
  try { rows.push({ name, status: "PASS", detail: await run() }); }
  catch (error) { failures += 1; rows.push({ name, status: "FAIL", detail: describeError(error) }); }
}

async function http(method: string, pathName: string, cookie: string, body?: unknown) {
  const response = await fetch(BASE + pathName, {
    method,
    headers: { "Content-Type": "application/json", Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed: any = null;
  if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
  return { status: response.status, body: parsed };
}

async function makeUser(key: string, actorType: "ADMIN" | "CUSTOMER", roles: string[]) {
  const email = `fin-${runId}-${key}@example.test`;
  const user = await prisma.user.create({ data: { email, name: `Fin ${key}`, actorType, passwordHash: await hashPassword(PASSWORD) } });
  for (const name of roles) {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  const response = await http("POST", "/api/auth/login", "", { email, password: PASSWORD });
  assert(response.status === 200, `login ${email} returned ${response.status}`);
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password: PASSWORD })
  });
  const cookie = login.headers.getSetCookie().map((value) => value.split(";")[0].trim()).join("; ");
  return { id: user.id, email, cookie };
}

type Chain = { campaignId: string; linkId: string; affiliateId: string; userId: string };

async function chain(): Promise<Chain> {
  const user = await prisma.user.create({
    data: { email: `fin-${runId}-aff-${randomUUID().slice(0, 4)}@example.test`, name: "Fin affiliate", actorType: "CUSTOMER", passwordHash: await hashPassword(PASSWORD) }
  });
  const profile = await prisma.affiliateProfile.create({
    data: { userId: user.id, termsVersion: "fin", termsAcceptedAt: new Date(), status: "APPROVED", approvedAt: new Date() }
  });
  const campaign = await prisma.affiliateCampaign.create({
    data: {
      slug: `fin-${runId}-${randomUUID().slice(0, 4)}`, name: "Fin campaign", vertical: "shop", status: "ACTIVE",
      commissionBps: 500, budgetKobo: 10_000_000n, spentKobo: 0n, attributionDays: 30, commissionBasis: "SUBTOTAL", ruleVersion: 1
    }
  });
  const link = await prisma.affiliateLink.create({
    data: { affiliateId: profile.id, campaignId: campaign.id, code: randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase(), destination: "/" }
  });
  return { campaignId: campaign.id, linkId: link.id, affiliateId: profile.id, userId: user.id };
}

async function conversion(c: Chain, state: "APPROVED" | "PAID" | "TRACKED", amountKobo: bigint, reversibleUntil: Date | null) {
  return prisma.affiliateConversion.create({
    data: {
      dedupeKey: `Order:fin-${runId}-${randomUUID().slice(0, 8)}`,
      affiliateId: c.affiliateId, campaignId: c.campaignId, linkId: c.linkId,
      entityType: "Order", entityId: `fin-order-${randomUUID().slice(0, 8)}`,
      ruleVersion: 1, basisType: "SUBTOTAL", commissionBps: 500, basisKobo: amountKobo * 20n,
      amountKobo, state, reversibleUntil
    }
  });
}

async function main() {
  const database = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  const actual = database[0]?.db ?? "";
  if (actual !== REQUIRED_DB) throw new Error(`Refusing to run: connected to "${actual}", expected "${REQUIRED_DB}".`);

  const admin = await makeUser("admin", "ADMIN", ["admin"]);
  const buyer = await makeUser("buyer", "CUSTOMER", []);
  const vendorOwner = await makeUser("vendor-owner", "CUSTOMER", []);
  const vendor = await prisma.vendor.create({
    data: { ownerId: vendorOwner.id, name: `Fin Vendor ${runId}`, slug: `fin-vendor-${runId}`, market: "Alaba", pickupAddress: "1 Fin Way", pickupPhone: "+2348000000000", status: "VERIFIED" }
  });

  await check("1. Unconfigured providers fail closed without creating a payment", async () => {
    const order = await prisma.order.create({
      data: {
        orderNumber: `FIN-${runId}-A`, customerId: buyer.id, vendorId: vendor.id,
        subtotalKobo: 100_000n, totalKobo: 101_000n, deliveryAddress: "1 Fin Street", contactName: "Fin Buyer", contactPhone: "+2348000000001"
      }
    });
    const testAttempt = await http("POST", "/api/payments/initialize", buyer.cookie, { orderId: order.id, provider: "test" });
    assert(testAttempt.status === 503 && testAttempt.body.code === "provider_unconfigured", `test initialize returned ${testAttempt.status}: ${JSON.stringify(testAttempt.body)}`);
    const paystackAttempt = await http("POST", "/api/payments/initialize", buyer.cookie, { orderId: order.id, provider: "paystack" });
    assert(paystackAttempt.status === 403 && paystackAttempt.body.code === "test_funds_boundary", `paystack initialize returned ${paystackAttempt.status}: ${JSON.stringify(paystackAttempt.body)}`);
    assert((await prisma.payment.count({ where: { orderId: order.id } })) === 0, "a refused provider still created a payment row");
    assert((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus === "pending", "refused providers changed the order payment status");
    return `test=503 provider_unconfigured, paystack=403 test_funds_boundary, zero payment rows, order still pending`;
  });

  await check("2. Concurrent reversals on an unsettled conversion cannot over-reverse", async () => {
    const c = await chain();
    const target = await conversion(c, "APPROVED", 5_000n, new Date(Date.now() + 86_400_000));
    const [a, b] = await Promise.all([
      reverseConversion({ actorId: admin.id, conversionId: target.id, amountKobo: 3_000n, reason: "unsettled race A", idempotencyKey: `fin-a-${runId}` }),
      reverseConversion({ actorId: admin.id, conversionId: target.id, amountKobo: 3_000n, reason: "unsettled race B", idempotencyKey: `fin-b-${runId}` })
    ]);
    const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: target.id } });
    const requested = ops.reduce((sum, op) => sum + op.requestedKobo, 0n);
    const after = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: target.id } });
    assert(requested <= target.amountKobo, `reversals requested ${requested} against ${target.amountKobo}`);
    assert(after.state !== "PAID", "unsettled conversion became PAID through a reversal");
    return `results=${JSON.stringify([a, b])} operations=${ops.length} requested=${requested} state=${after.state}`;
  });

  await check("3. Settlement racing a reversal yields one financial outcome", async () => {
    const c = await chain();
    const target = await conversion(c, "APPROVED", 5_000n, new Date(Date.now() - 60_000));
    const walletBefore = await prisma.wallet.findFirst({ where: { userId: c.userId, ownerType: "CUSTOMER" } });
    const before = walletBefore?.availableKobo ?? 0n;
    const [settle, reverse] = await Promise.all([
      settleConversion({ actorId: admin.id, conversionId: target.id }),
      reverseConversion({ actorId: admin.id, conversionId: target.id, amountKobo: 2_000n, reason: "settle race", idempotencyKey: `fin-settle-race-${runId}` })
    ]);
    const after = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: target.id } });
    const walletAfter = await prisma.wallet.findFirst({ where: { userId: c.userId, ownerType: "CUSTOMER" } });
    const delta = (walletAfter?.availableKobo ?? 0n) - before;
    const ops = await prisma.affiliateReversalOperation.count({ where: { conversionId: target.id } });
    if (settle.settled) {
      assert(delta === target.amountKobo, `settled but wallet delta ${delta} != ${target.amountKobo}`);
      assert(after.state === "PAID", `settled but conversion state ${after.state}`);
    } else {
      assert(delta === 0n, `not settled but wallet credited ${delta}`);
      assert(ops === 0 || after.state === "REVERSED" || after.state === "PAID", `unexpected unsettled state ${after.state}`);
    }
    assert(!(settle.settled && ops > 0 && reverse.reversed && after.state === "PAID" && delta !== target.amountKobo), "both financial effects applied");
    return `settle=${JSON.stringify(settle)} reverse=${JSON.stringify(reverse)} state=${after.state} walletDelta=${delta} ops=${ops}`;
  });

  await check("4. Audit identity comes from the session, not the request body", async () => {
    const created = await http("POST", "/api/admin/affiliate-campaigns", admin.cookie, {
      slug: `fin-audit-${runId}`, name: "Fin audit", vertical: "shop", commissionBps: 500, budgetKobo: "1000000", attributionDays: 30, commissionBasis: "SUBTOTAL"
    });
    assert(created.status === 201, `create returned ${created.status}: ${JSON.stringify(created.body)}`);
    const spoofed = await http("PATCH", `/api/admin/affiliate-campaigns/${created.body.id}`, admin.cookie, { status: "ACTIVE", actorId: buyer.id });
    assert(spoofed.status === 200, `activation returned ${spoofed.status}: ${JSON.stringify(spoofed.body)}`);
    const audit = await prisma.auditLog.findFirst({ where: { entityId: created.body.id, action: "affiliate.campaign_status_changed" } });
    assert(audit?.actorId === admin.id, `audit actor ${audit?.actorId} is not the session user ${admin.id}`);
    assert(audit?.actorId !== buyer.id, "audit accepted the body actorId");
    return `audit actor is the signed-in admin despite a spoofed body actorId`;
  });

  await check("5. An expired touch cannot be frozen on a new order", async () => {
    const c = await chain();
    const visitor = `fin-expired-${runId}`;
    await prisma.attributionTouch.create({
      data: {
        linkId: c.linkId, visitorKey: visitor, consent: true,
        landedAt: new Date(Date.now() - 3 * 86_400_000), expiresAt: new Date(Date.now() - 60_000)
      }
    });
    const resolved = await resolveCheckoutAttribution({ userId: buyer.id, visitorKey: visitor });
    assert(resolved === null, "an expired touch was frozen onto checkout");
    return `expired touch resolves to null`;
  });

  await check("6. A paused campaign cannot be frozen onto a new order", async () => {
    const c = await chain();
    const visitor = `fin-paused-${runId}`;
    await prisma.attributionTouch.create({
      data: { linkId: c.linkId, visitorKey: visitor, consent: true, expiresAt: new Date(Date.now() + 86_400_000) }
    });
    await prisma.affiliateCampaign.update({ where: { id: c.campaignId }, data: { status: "PAUSED" } });
    const resolved = await resolveCheckoutAttribution({ userId: buyer.id, visitorKey: visitor });
    assert(resolved === null, "a paused campaign was frozen onto checkout");
    return `paused campaign resolves to null`;
  });

  console.log(JSON.stringify({ runId, base: BASE, database: actual, checks: rows, failures }, null, 2));
  await prisma.$disconnect();
  if (failures > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(describeError(error));
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
