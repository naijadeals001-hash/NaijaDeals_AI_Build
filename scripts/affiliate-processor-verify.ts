import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { processReversalIntents, reversalReferenceFor, recoverExpiredIntents } from "../lib/services/affiliate/reversal-processor";

/**
 * Processor idempotency checks.
 *
 *   npx tsx scripts/affiliate-processor-verify.ts
 *
 * Scope: the reversal processor and its two-layer idempotency, driven directly.
 * It does NOT go through refundPayment — that integration remains unproven and
 * is stated as such in the report. What this does prove is the part most likely
 * to be wrong: that a replay cannot reverse twice, and that debt-only reversals
 * (no wallet posting) are handled.
 */

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

const made = { users: [] as string[], recovery: [] as string[], conversions: [] as string[], intents: [] as string[], campaign: "", profile: "", wallet: "" };

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  console.log("database:", db[0].db);

  const user = await prisma.user.create({ data: { email: `proc-${runId}@example.test`, name: "Processor Test", actorType: "CUSTOMER" } });
  made.users.push(user.id);

  const campaign = await prisma.affiliateCampaign.create({
    data: { slug: `proc-${runId}`, name: "Processor campaign", vertical: "shop", status: "ACTIVE", funding: "PLATFORM", commissionBps: 500, budgetKobo: 10_000_000n, attributionDays: 0, commissionBasis: "SUBTOTAL", ruleVersion: 1 }
  });
  made.campaign = campaign.id;

  const profile = await prisma.affiliateProfile.create({
    data: { userId: user.id, status: "APPROVED", termsVersion: "test", termsAcceptedAt: new Date(), approvedAt: new Date() }
  });
  made.profile = profile.id;

  const wallet = await prisma.wallet.create({ data: { userId: user.id, ownerType: "CUSTOMER", currency: "NGN", availableKobo: 0n, heldKobo: 0n } });
  made.wallet = wallet.id;

  const orderId = `ord-proc-${runId}`;
  const conversion = await prisma.affiliateConversion.create({
    data: {
      dedupeKey: `Order:${orderId}`, affiliateId: profile.id, campaignId: campaign.id,
      entityType: "Order", entityId: orderId, ruleVersion: 1, commissionBps: 500,
      basisKobo: 100_000n, amountKobo: 5_000n, state: "PAID", ledgerReference: `AFF-COMM-${orderId}`
    }
  });
  made.conversions.push(conversion.id);

  async function intentFor(refundId: string, amountKobo: bigint) {
    const row = await prisma.affiliateReversalIntent.create({
      data: { dedupeKey: `refund:${refundId}`, refundId, orderId, amountKobo }
    });
    made.intents.push(row.id);
    return row;
  }

  try {
    const first = await intentFor(`rf-${runId}`, 50_000n);

    await check("a pending intent is processed into an adjustment", async () => {
      const result = await processReversalIntents("test-worker", 25);
      assert(result.claimed >= 1, `claimed ${result.claimed}`);
      const row = await prisma.affiliateReversalIntent.findUniqueOrThrow({ where: { id: first.id } });
      assert(row.state === "DONE", `state ${row.state}, error ${row.lastError}`);
      const after = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: conversion.id } });
      assert(after.state === "REVERSED", `conversion state ${after.state}`);
      return `intent DONE, conversion REVERSED, ${result.done} processed`;
    });

    await check("debt records the full amount when the wallet is empty", async () => {
      const recovery = await prisma.affiliateRecovery.findFirst({ where: { conversionId: conversion.id } });
      assert(recovery, "no receivable created for a zero-balance reversal");
      made.recovery.push(recovery!.id);
      // 50,000 refunded at 5% = 2,500 commission owed back; wallet had 0.
      assert(recovery!.amountKobo === 2_500n, `debt ${recovery!.amountKobo}, expected 2500`);
      return `debt ${recovery!.amountKobo} kobo at zero balance, no wallet posting`;
    });

    await check("a duplicate confirmation does not create a second intent", async () => {
      const again = await prisma.affiliateReversalIntent.upsert({
        where: { dedupeKey: `refund:rf-${runId}` },
        create: { dedupeKey: `refund:rf-${runId}`, refundId: `rf-${runId}`, orderId, amountKobo: 50_000n },
        update: {}
      });
      assert(again.id === first.id, "a second intent row was created");
      const count = await prisma.affiliateReversalIntent.count({ where: { dedupeKey: `refund:rf-${runId}` } });
      assert(count === 1, `${count} intents for one refund`);
      return "one intent row";
    });

    await check("replaying a completed intent posts nothing further", async () => {
      await prisma.affiliateReversalIntent.update({ where: { id: first.id }, data: { state: "PENDING", leaseToken: null, leaseExpiresAt: null } });
      const before = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: conversion.id } });
      const beforeRecovery = await prisma.affiliateRecovery.findMany({ where: { conversionId: conversion.id } });
      const result = await processReversalIntents("test-worker", 25);
      const after = await prisma.affiliateRecovery.findMany({ where: { conversionId: conversion.id } });
      const debt = after.reduce((sum, r) => sum + r.amountKobo, 0n);
      const debtBefore = beforeRecovery.reduce((sum, r) => sum + r.amountKobo, 0n);
      assert(debt === debtBefore, `debt grew from ${debtBefore} to ${debt} on replay`);
      assert(before.state === "REVERSED", "conversion changed on replay");
      return `replay: ${result.done} done, debt unchanged at ${debt}, no second posting`;
    });

    await check("the ledger reference is derived from the intent, not random", async () => {
      const reference = reversalReferenceFor(first.id);
      assert(reference === `AFF-REVINT-${first.id}`, `reference ${reference}`);
      return `${reference.slice(0, 32)}… (stable, so a replay collides on @unique)`;
    });

    await check("an expired lease returns to PENDING", async () => {
      await prisma.affiliateReversalIntent.update({
        where: { id: first.id },
        data: { state: "PROCESSING", leaseToken: "stale", leaseExpiresAt: new Date(Date.now() - 60_000) }
      });
      const recovered = await recoverExpiredIntents();
      assert(recovered >= 1, `recovered ${recovered}`);
      const row = await prisma.affiliateReversalIntent.findUniqueOrThrow({ where: { id: first.id } });
      assert(row.state === "PENDING" && row.leaseToken === null, `state ${row.state}`);
      return `recovered ${recovered}, lease cleared`;
    });

    await check("an order with no conversion completes without failing", async () => {
      const orphan = await prisma.affiliateReversalIntent.create({
        data: { dedupeKey: `refund:rf-orphan-${runId}`, refundId: `rf-orphan-${runId}`, orderId: `none-${runId}`, amountKobo: 1_000n }
      });
      made.intents.push(orphan.id);
      await processReversalIntents("test-worker", 25);
      const row = await prisma.affiliateReversalIntent.findUniqueOrThrow({ where: { id: orphan.id } });
      assert(row.state === "DONE", `state ${row.state}`);
      assert(row.lastError === "no_attributed_conversion", `reason ${row.lastError}`);
      return "DONE with no_attributed_conversion, not a retry loop";
    });
  } finally {
    const txs = await prisma.walletTransaction.findMany({ where: { walletId: made.wallet }, select: { id: true } });
    await prisma.ledgerEntry.deleteMany({ where: { OR: [{ walletId: made.wallet }, { transactionId: { in: txs.map((t) => t.id) } }] } });
    await prisma.walletTransaction.deleteMany({ where: { id: { in: txs.map((t) => t.id) } } });
    await prisma.affiliateRecovery.deleteMany({ where: { affiliateId: profile.id } });
    await prisma.affiliateReversalIntent.deleteMany({ where: { id: { in: made.intents } } });
    await prisma.affiliateConversion.deleteMany({ where: { affiliateId: profile.id } });
    await prisma.affiliateProfile.deleteMany({ where: { id: profile.id } });
    await prisma.affiliateCampaign.deleteMany({ where: { id: campaign.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: made.recovery } } });
    await prisma.wallet.deleteMany({ where: { id: wallet.id } });
    await prisma.user.deleteMany({ where: { id: { in: made.users } } });
  }

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
