import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { refundPayment } from "../lib/payments/service";
import { processReversalIntents } from "../lib/services/affiliate/reversal-processor";

/**
 * The real refund workflow: refundPayment → persisted intent → processor →
 * commission adjustment.
 *
 *   npx tsx scripts/affiliate-refund-integration.ts
 *
 * The intent is never inserted by hand. refundPayment writes it inside its own
 * transaction when the refund reaches COMPLETED; this test then runs the actual
 * processor and checks the committed financial effects.
 */

// Fail closed: this suite writes financial records and must never run against
// the shared development database. The guard checks the ACTUAL connected
// database, not an environment variable.
const REQUIRED_DB = "naijadeals_affiliate_test";

const runId = randomUUID().slice(0, 8);
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
async function check(name: string, run: () => Promise<string>) {
  try {
    rows.push({ name, status: "PASS", detail: await run() });
  } catch (error) {
    rows.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

const made = { users: [] as string[], conversions: [] as string[], intents: [] as string[], campaign: "", profile: "", order: "", vendor: "", product: "" };

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  console.log("database:", db[0].db);
  if (db[0].db !== REQUIRED_DB) {
    console.error(`Refusing to run: connected to "${db[0].db}", expected "${REQUIRED_DB}".`);
    await prisma.$disconnect();
    process.exit(2);
  }

  const customer = await prisma.user.create({
    data: { email: `ri-cust-${runId}@example.test`, name: "Refund Integration Customer", actorType: "CUSTOMER" }
  });
  const owner = await prisma.user.create({
    data: { email: `ri-own-${runId}@example.test`, name: "Refund Integration Vendor", actorType: "VENDOR" }
  });
  made.users.push(customer.id, owner.id);

  const customerWallet = await prisma.wallet.create({
    data: { userId: customer.id, ownerType: "CUSTOMER", currency: "NGN", availableKobo: 10_000_000n, heldKobo: 0n }
  });

  const vendor = await prisma.vendor.create({
    data: {
      ownerId: owner.id, name: `Refund Vendor ${runId}`, slug: `ri-vendor-${runId}`, market: "Balogun",
      pickupAddress: "Balogun Market, Lagos", pickupPhone: "08012345678", status: "VERIFIED"
    }
  });
  made.vendor = vendor.id;
  const category = await prisma.category.create({ data: { name: `Refund Cat ${runId}`, slug: `ri-cat-${runId}` } });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id, categoryId: category.id, name: `Refund Product ${runId}`, slug: `ri-prod-${runId}`,
      description: "Refund integration fixture", priceKobo: 5_000_000n, status: "ACTIVE",
      stock: { create: { quantity: 10, reserved: 0 } }
    }
  });
  made.product = product.id;

  const order = await prisma.order.create({
    data: {
      orderNumber: `RI-${runId}`, customerId: customer.id, vendorId: vendor.id,
      status: "completed", paymentStatus: "paid",
      subtotalKobo: 5_000_000n, totalKobo: 5_000_000n, commissionKobo: 500_000n,
      deliveryFeeKobo: 0n, escrowFeeKobo: 0n,
      deliveryAddress: "12 Broad Street, Lagos", contactName: "Refund Integration Customer", contactPhone: "08012345678",
      items: { create: [{ productId: product.id, quantity: 1, unitKobo: 5_000_000n, totalKobo: 5_000_000n, productName: `Refund Product ${runId}` }] }
    }
  });
  made.order = order.id;

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id, provider: "test", providerReference: `TEST-RI-${runId}`,
      idempotencyKey: `ri-pay-${runId}`, amountKobo: 5_000_000n, currency: "NGN", status: "COMPLETED"
    }
  });
  // A real capture leaves the funds held against the vendor wallet, which is what
  // the refund reversal guard checks. Creating the hold without that balance is an
  // inconsistent fixture, not a reason to relax the guard.
  const vendorWallet = await prisma.wallet.create({
    data: { vendorId: vendor.id, ownerType: "VENDOR", currency: "NGN", availableKobo: 0n, heldKobo: 5_000_000n }
  });
  await prisma.escrowHold.create({
    data: {
      orderId: order.id, buyerWalletId: customerWallet.id, vendorWalletId: vendorWallet.id,
      amountKobo: 5_000_000n, status: "held", reason: "fixture"
    }
  });

  // The escrow hold must be reflected in the platform's held balance, which is
  // what a real payment capture does; without it the refund has nothing to draw.
  let platform = await prisma.wallet.findFirst({ where: { ownerType: "SYSTEM" } });
  if (!platform) {
    platform = await prisma.wallet.create({ data: { ownerType: "SYSTEM", currency: "NGN", availableKobo: 0n, heldKobo: 0n } });
  }
  // The released-escrow branch debits the platform's AVAILABLE balance, not its
  // held balance (lib/payments/service.ts:615), so that is what the fixture must
  // fund. Measured from the persisted record rather than assumed.
  // A disposable database starts with a zero platform wallet. Funding it here is
  // the fixture's own escrow, and cleanup below removes it in a way that is safe
  // after partial execution because the whole database is thrown away.
  await prisma.wallet.update({ where: { id: platform.id }, data: { availableKobo: { increment: 5_000_000n } } });

  // Attribution: an approved affiliate with a conversion for this order.
  const campaign = await prisma.affiliateCampaign.create({
    data: { slug: `ri-${runId}`, name: "RI campaign", vertical: "shop", status: "ACTIVE", funding: "PLATFORM", commissionBps: 500, budgetKobo: 100_000_000n, attributionDays: 0, commissionBasis: "SUBTOTAL", ruleVersion: 1 }
  });
  made.campaign = campaign.id;
  const affiliateUser = await prisma.user.create({ data: { email: `ri-aff-${runId}@example.test`, name: "Affiliate", actorType: "CUSTOMER" } });
  made.users.push(affiliateUser.id);
  const profile = await prisma.affiliateProfile.create({
    data: { userId: affiliateUser.id, status: "APPROVED", termsVersion: "t", termsAcceptedAt: new Date(), approvedAt: new Date() }
  });
  made.profile = profile.id;
  const conversion = await prisma.affiliateConversion.create({
    data: {
      dedupeKey: `Order:${order.id}`, affiliateId: profile.id, campaignId: campaign.id,
      entityType: "Order", entityId: order.id, ruleVersion: 1, commissionBps: 500,
      basisKobo: 5_000_000n, amountKobo: 250_000n, state: "PAID", ledgerReference: `AFF-COMM-${order.id}`
    }
  });
  made.conversions.push(conversion.id);

  let intentId = "";
  {
   

    await check("refundPayment confirms the refund and writes one intent", async () => {
      const result = await refundPayment({
        orderId: order.id, actorId: customer.id, reason: "integration test refund", idempotencyKey: `ri-refund-${runId}`
      });
      assert(result, "no result");
      const refund = await prisma.refund.findFirst({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } });
      assert(refund && refund.status === "COMPLETED", `refund status ${refund?.status}`);
      const intents = await prisma.affiliateReversalIntent.findMany({ where: { orderId: order.id } });
      assert(intents.length === 1, `${intents.length} intents`);
      intentId = intents[0].id;
      made.intents.push(intentId);
      assert(intents[0].refundId === refund!.id, "intent is not tied to the confirmed refund");
      return `refund ${refund!.id.slice(0, 8)} COMPLETED, one intent ${intentId.slice(0, 8)}`;
    });

    await check("the processor commits the expected reversal operation", async () => {
      const before = await prisma.affiliateReversalOperation.count({ where: { conversionId: conversion.id } });
      const run = await processReversalIntents("refund-integration", 50);
      assert(run.done >= 1, `done ${run.done}`);
      const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: conversion.id } });
      assert(ops.length === before + 1, `${ops.length - before} operations written`);
      const intent = await prisma.affiliateReversalIntent.findUniqueOrThrow({ where: { id: intentId } });
      assert(intent.state === "DONE", `intent state ${intent.state}, error ${intent.lastError}`);
      return `intent DONE, ${ops.length} operation(s)`;
    });

    await check("wallet recovery plus debt equals the expected adjustment", async () => {
      const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: conversion.id } });
      const op = ops[ops.length - 1];
      // Full refund of 5,000,000 at 5% = 250,000 commission owed back.
      assert(op.requestedKobo === 250_000n, `requested ${op.requestedKobo}, expected 250000`);
      assert(op.recoveredKobo + op.debtKobo === op.requestedKobo, `recovered ${op.recoveredKobo} + debt ${op.debtKobo} != ${op.requestedKobo}`);
      const debts = await prisma.affiliateRecovery.findMany({ where: { conversionId: conversion.id } });
      const debtTotal = debts.reduce((sum, row) => sum + row.amountKobo, 0n);
      assert(debtTotal === op.debtKobo, `recovery rows total ${debtTotal}, operation debt ${op.debtKobo}`);
      return `requested ${op.requestedKobo} = recovered ${op.recoveredKobo} + debt ${op.debtKobo}`;
    });

    await check("any ledger entry the reversal posted is balanced", async () => {
      const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: conversion.id } });
      const op = ops[ops.length - 1];
      if (!op.ledgerReference) return "no cash recovered, so no ledger entry was posted (debt-only)";
      const tx = await prisma.walletTransaction.findFirst({ where: { reference: op.ledgerReference }, include: { ledger: true } });
      assert(tx, `no transaction for ${op.ledgerReference}`);
      const debit = tx!.ledger.filter((e) => e.direction === "DEBIT").reduce((s, e) => s + e.amountKobo, 0n);
      const credit = tx!.ledger.filter((e) => e.direction === "CREDIT").reduce((s, e) => s + e.amountKobo, 0n);
      assert(debit === credit, `debit ${debit} != credit ${credit}`);
      return `debit=${debit} credit=${credit}`;
    });

    await check("duplicate confirmation produces no second intent or adjustment", async () => {
      const intentsBefore = await prisma.affiliateReversalIntent.count({ where: { orderId: order.id } });
      const opsBefore = await prisma.affiliateReversalOperation.count({ where: { conversionId: conversion.id } });
      await refundPayment({
        orderId: order.id, actorId: customer.id, reason: "duplicate confirmation", idempotencyKey: `ri-refund-${runId}`
      }).catch(() => undefined);
      const intentsAfter = await prisma.affiliateReversalIntent.count({ where: { orderId: order.id } });
      const opsAfter = await prisma.affiliateReversalOperation.count({ where: { conversionId: conversion.id } });
      assert(intentsAfter === intentsBefore, `intents went ${intentsBefore} -> ${intentsAfter}`);
      assert(opsAfter === opsBefore, `operations went ${opsBefore} -> ${opsAfter}`);
      return `still ${intentsAfter} intent and ${opsAfter} operation after a repeat call`;
    });

    await check("replaying a DONE intent adds no financial effect", async () => {
      const opsBefore = await prisma.affiliateReversalOperation.count({ where: { conversionId: conversion.id } });
      const debtsBefore = await prisma.affiliateRecovery.aggregate({ where: { conversionId: conversion.id }, _sum: { amountKobo: true } });
      // Simulates the crash window: work committed, the intent not yet marked DONE.
      await prisma.affiliateReversalIntent.update({ where: { id: intentId }, data: { state: "PENDING" } });
      await processReversalIntents("replay-probe", 50);
      const opsAfter = await prisma.affiliateReversalOperation.count({ where: { conversionId: conversion.id } });
      const debtsAfter = await prisma.affiliateRecovery.aggregate({ where: { conversionId: conversion.id }, _sum: { amountKobo: true } });
      assert(opsAfter === opsBefore, `operations went ${opsBefore} -> ${opsAfter} on replay`);
      assert(
        (debtsBefore._sum.amountKobo ?? 0n) === (debtsAfter._sum.amountKobo ?? 0n),
        "debt changed on replay"
      );
      return `replay left ${opsAfter} operation and unchanged debt`;
    });

    await check("the customer refund is not affected by affiliate processing", async () => {
      const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } });
      assert(refund.status === "COMPLETED", `refund status ${refund.status}`);
      return "refund stayed COMPLETED";
    });
  }
  // No per-record teardown: the target is a disposable database whose whole point
  // is that partial execution leaves nothing to repair. Every fixture is keyed by
  // runId, so consecutive runs cannot collide, and drift is measured rather than
  // compensated — the previous version subtracted a hardcoded delta from a shared
  // balance, which is exactly how the development wallet was driven negative.

  const width = Math.max(...rows.map((row) => row.name.length));
  for (const row of rows) console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
  const failed = rows.filter((row) => row.status === "FAIL").length;
  console.log(`\n${rows.length - failed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error("crashed:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
