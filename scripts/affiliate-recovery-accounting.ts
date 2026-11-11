import "dotenv/config";
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth/password";
import { reverseConversion, settleConversion } from "../lib/services/affiliate/settlement";
import { collectRecovery } from "../lib/services/affiliate/recovery";
import { ensureWallet } from "../lib/payments/service";

/** Recovery accounting: debt persistence, settlement offset, partial collection. */

const REQUIRED_DB = "naijadeals_affiliate_test";
const runId = randomUUID().slice(0, 8);
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
let failures = 0;
function assert(condition: unknown, message: string): void { if (!condition) throw new Error(message); }
const safe = (value: unknown): string => JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
async function check(name: string, run: () => Promise<string>) {
  try { rows.push({ name, status: "PASS", detail: await run() }); }
  catch (error) { failures += 1; rows.push({ name, status: "FAIL", detail: String(inspect(error, { depth: 3 })).slice(0, 900) }); }
}

async function chain() {
  const passwordHash = await hashPassword(`Rec-${randomUUID()}`);
  const user = await prisma.user.create({ data: { email: `rec-${runId}-${randomUUID().slice(0, 4)}@example.test`, name: "Rec affiliate", actorType: "CUSTOMER", passwordHash } });
  const profile = await prisma.affiliateProfile.create({ data: { userId: user.id, termsVersion: "rec", termsAcceptedAt: new Date(), status: "APPROVED", approvedAt: new Date() } });
  const campaign = await prisma.affiliateCampaign.create({
    data: { slug: `rec-${runId}-${randomUUID().slice(0, 4)}`, name: "Rec campaign", vertical: "shop", status: "ACTIVE", commissionBps: 500, budgetKobo: 10_000_000n, commissionBasis: "SUBTOTAL", ruleVersion: 1 }
  });
  const link = await prisma.affiliateLink.create({ data: { affiliateId: profile.id, campaignId: campaign.id, code: randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase(), destination: "/" } });
  await ensureWallet(prisma, { userId: user.id, ownerType: "CUSTOMER" });
  return { userId: user.id, profileId: profile.id, campaignId: campaign.id, linkId: link.id };
}

async function conversion(c: Awaited<ReturnType<typeof chain>>, state: "APPROVED" | "PAID", amountKobo: bigint, ledgerReference: string | null) {
  return prisma.affiliateConversion.create({
    data: {
      dedupeKey: `Order:rec-${runId}-${randomUUID().slice(0, 8)}`, affiliateId: c.profileId, campaignId: c.campaignId, linkId: c.linkId,
      entityType: "Order", entityId: `rec-order-${randomUUID().slice(0, 8)}`, ruleVersion: 1, basisType: "SUBTOTAL",
      commissionBps: 500, basisKobo: amountKobo * 20n, amountKobo, state, ledgerReference
    }
  });
}

async function walletOf(userId: string) {
  const wallet = await prisma.wallet.findFirstOrThrow({ where: { userId, ownerType: "CUSTOMER" } });
  return { id: wallet.id, availableKobo: wallet.availableKobo };
}

async function main() {
  const database = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  const actual = database[0]?.db ?? "";
  if (actual !== REQUIRED_DB) throw new Error(`Refusing to run: connected to "${actual}", expected "${REQUIRED_DB}".`);

  const actor = await prisma.user.create({ data: { email: `rec-${runId}-actor@example.test`, name: "Recovery actor", actorType: "ADMIN", passwordHash: await hashPassword(`Actor-${randomUUID()}`) } });

  await check("1. An unsettled reversal persists recoverable debt atomically", async () => {
    const c = await chain();
    const target = await conversion(c, "APPROVED", 5_000n, null);
    const outcome = await reverseConversion({ actorId: actor.id, conversionId: target.id, amountKobo: 2_000n, reason: "unsettled debt", idempotencyKey: `rec-debt-${runId}` });
    assert(outcome.reversed, `reversal refused: ${safe(outcome)}`);
    const recovery = await prisma.affiliateRecovery.findFirstOrThrow({ where: { conversionId: target.id } });
    assert(recovery.amountKobo === 2_000n && recovery.collectedKobo === 0n && recovery.offsetKobo === 0n && recovery.state === "OUTSTANDING", `unexpected recovery ${safe(recovery)}`);
    const op = await prisma.affiliateReversalOperation.findFirstOrThrow({ where: { conversionId: target.id } });
    assert(op.debtKobo === 2_000n && op.recoveredKobo === 0n, `unexpected operation ${safe(op)}`);
    return `recovery ${recovery.id} outstanding 2000; operation debt 2000`;
  });

  await check("2. Settlement offsets the debt instead of paying and collecting it twice", async () => {
    const c = await chain();
    const target = await conversion(c, "APPROVED", 5_000n, null);
    await reverseConversion({ actorId: actor.id, conversionId: target.id, amountKobo: 2_000n, reason: "offset me", idempotencyKey: `rec-offset-${runId}` });
    const before = await walletOf(c.userId);
    const settled = await settleConversion({ actorId: actor.id, conversionId: target.id });
    assert(settled.settled, `settlement refused: ${safe(settled)}`);
    const after = await walletOf(c.userId);
    assert(after.availableKobo - before.availableKobo === 3_000n, `wallet delta ${after.availableKobo - before.availableKobo}, expected 3000`);
    const recovery = await prisma.affiliateRecovery.findFirstOrThrow({ where: { conversionId: target.id } });
    assert(recovery.offsetKobo === 2_000n && recovery.collectedKobo === 0n && recovery.state === "COLLECTED", `unexpected offset state ${safe(recovery)}`);
    const payments = await prisma.walletTransaction.count({ where: { reference: `AFF-COMM-${target.id}` } });
    assert(payments === 1, `expected one payout transaction, got ${payments}`);
    const collected = await collectRecovery({ actorId: actor.id, recoveryId: recovery.id, amountKobo: 2_000n });
    assert(!collected.collected, "collected an already-offset debt");
    return `paid 3000, offset 2000, one payout transaction, later collection refused`;
  });

  await check("3. A settled reversal's shortfall is collected partially, then fully, once", async () => {
    const c = await chain();
    const target = await conversion(c, "PAID", 5_000n, `AFF-COMM-${runId}-direct`);
    const wallet = await walletOf(c.userId);
    await prisma.wallet.update({ where: { id: wallet.id }, data: { availableKobo: 0n } });
    const outcome = await reverseConversion({ actorId: actor.id, conversionId: target.id, amountKobo: 2_000n, reason: "spent commission", idempotencyKey: `rec-short-${runId}` });
    assert(outcome.reversed, `reversal refused: ${safe(outcome)}`);
    const recovery = await prisma.affiliateRecovery.findFirstOrThrow({ where: { conversionId: target.id } });
    assert(recovery.amountKobo === 2_000n && recovery.collectedKobo === 0n, `unexpected recovery ${safe(recovery)}`);

    await prisma.wallet.update({ where: { id: wallet.id }, data: { availableKobo: 700n } });
    const first = await collectRecovery({ actorId: actor.id, recoveryId: recovery.id, amountKobo: 1_200n });
    assert(first.collected && first.collectedKobo === "700" && first.outstandingKobo === "1300", `first collection ${safe(first)}`);
    const dry = await collectRecovery({ actorId: actor.id, recoveryId: recovery.id, amountKobo: 1_000n });
    assert(!dry.collected && dry.reason === "no_available_funds", `collection without funds returned ${safe(dry)}`);
    await prisma.wallet.update({ where: { id: wallet.id }, data: { availableKobo: 1_300n } });
    const second = await collectRecovery({ actorId: actor.id, recoveryId: recovery.id, amountKobo: 5_000n });
    assert(second.collected && second.collectedKobo === "1300" && second.outstandingKobo === "0", `second collection ${safe(second)}`);
    const again = await collectRecovery({ actorId: actor.id, recoveryId: recovery.id, amountKobo: 1_000n });
    assert(!again.collected && again.reason === "state_collected", `duplicate collection ${safe(again)}`);
    const ledger = await prisma.walletTransaction.count({ where: { reference: { startsWith: `AFF-REC-${recovery.id}` } } });
    assert(ledger === 2, `expected two recovery ledger rows, got ${ledger}`);
    return `700 recovered, 1300 outstanding, then 1300 recovered; duplicate refused; two ledger rows`;
  });

  await check("4. Replaying the same reversal key does not add debt twice", async () => {
    const c = await chain();
    const target = await conversion(c, "APPROVED", 5_000n, null);
    const key = `rec-replay-${runId}`;
    await reverseConversion({ actorId: actor.id, conversionId: target.id, amountKobo: 1_500n, reason: "replay", idempotencyKey: key });
    await reverseConversion({ actorId: actor.id, conversionId: target.id, amountKobo: 1_500n, reason: "replay", idempotencyKey: key });
    const recoveries = await prisma.affiliateRecovery.findMany({ where: { conversionId: target.id } });
    assert(recoveries.length === 1 && recoveries[0].amountKobo === 1_500n, `replay changed recovery ${safe(recoveries)}`);
    assert((await prisma.affiliateReversalOperation.count({ where: { conversionId: target.id } })) === 1, "replay created a second operation");
    return `one recovery of 1500 and one operation after a replayed key`;
  });

  await check("5. A collection racing settlement cannot exceed the debt", async () => {
    const c = await chain();
    const target = await conversion(c, "APPROVED", 5_000n, null);
    await reverseConversion({ actorId: actor.id, conversionId: target.id, amountKobo: 2_000n, reason: "race", idempotencyKey: `rec-race-${runId}` });
    const recovery = await prisma.affiliateRecovery.findFirstOrThrow({ where: { conversionId: target.id } });
    const wallet = await walletOf(c.userId);
    await prisma.wallet.update({ where: { id: wallet.id }, data: { availableKobo: 500n } });
    const [collect, settle] = await Promise.all([
      collectRecovery({ actorId: actor.id, recoveryId: recovery.id, amountKobo: 2_000n }),
      settleConversion({ actorId: actor.id, conversionId: target.id })
    ]);
    const after = await prisma.affiliateRecovery.findUniqueOrThrow({ where: { id: recovery.id } });
    assert(after.collectedKobo + after.offsetKobo <= after.amountKobo, `collected ${after.collectedKobo} + offset ${after.offsetKobo} exceeds ${after.amountKobo}`);
    if (!settle.settled) throw new Error(`settlement refused in race: ${safe(settle)}`);
    assert(!collect.collected || collect.collectedKobo === "500", `collection took ${safe(collect)}`);
    return `collect=${safe(collect)} settle offset=${settle.offsetKobo} paid=${settle.paidKobo}; total ${after.collectedKobo + after.offsetKobo} of ${after.amountKobo}`;
  });

  console.log(JSON.stringify({ runId, database: actual, checks: rows, failures }, null, 2));
  await prisma.$disconnect();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
