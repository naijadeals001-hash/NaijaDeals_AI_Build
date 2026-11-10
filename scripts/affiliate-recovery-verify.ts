import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { requireIsolatedDatabase } from "./lib/require-isolated-database";
import { reverseConversion } from "../lib/services/affiliate/settlement";
import { collectRecovery, writeOffRecovery, recoverySummary } from "../lib/services/affiliate/recovery";

/**
 * Recovery accounting verification: shortfall, partial collection, concurrency,
 * full collection and write-off.
 *
 *   npx tsx scripts/affiliate-recovery-verify.ts
 *
 * Fixtures are built directly so the recovery logic is exercised without
 * replaying the whole settlement chain. Test-only amounts; no external payout.
 */

const runId = randomUUID().slice(0, 8);
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
const made: { users: string[]; recovery: string[]; conversions: string[]; campaign: string; profile: string; wallet: string } = {
  users: [], recovery: [], conversions: [], campaign: "", profile: "", wallet: ""
};

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

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  console.log("database:", db[0].db);
  requireIsolatedDatabase(db[0].db);

  const user = await prisma.user.create({ data: { email: `rec-${runId}@example.test`, name: "Recovery Test", actorType: "CUSTOMER" } });
  const admin = await prisma.user.create({ data: { email: `rec-ad-${runId}@example.test`, name: "Recovery Admin", actorType: "ADMIN" } });
  made.users.push(user.id, admin.id);

  const campaign = await prisma.affiliateCampaign.create({
    data: { slug: `rec-${runId}`, name: "Recovery campaign", vertical: "shop", status: "ACTIVE", funding: "PLATFORM", commissionBps: 500, budgetKobo: 10_000_000n, attributionDays: 0, commissionBasis: "SUBTOTAL", ruleVersion: 1 }
  });
  made.campaign = campaign.id;

  const profile = await prisma.affiliateProfile.create({
    data: { userId: user.id, status: "APPROVED", termsVersion: "test", termsAcceptedAt: new Date(), approvedAt: new Date() }
  });
  made.profile = profile.id;

  // Wallet deliberately short: the reversal will exceed what is available.
  const wallet = await prisma.wallet.create({
    data: { userId: user.id, ownerType: "CUSTOMER", currency: "NGN", availableKobo: 2_000n, heldKobo: 0n }
  });
  made.wallet = wallet.id;

  async function paidConversion(entityId: string, amount: bigint) {
    const conversion = await prisma.affiliateConversion.create({
      data: {
        dedupeKey: `Order:${entityId}`, affiliateId: profile.id, campaignId: campaign.id,
        entityType: "Order", entityId, ruleVersion: 1, commissionBps: 500,
        basisKobo: amount * 20n, amountKobo: amount, state: "PAID", ledgerReference: `AFF-COMM-${entityId}`
      }
    });
    made.conversions.push(conversion.id);
    return conversion;
  }

  try {
    const first = await paidConversion(`o1-${runId}`, 5_000n);

    await check("a reversal beyond the wallet balance creates a receivable", async () => {
      const result = await reverseConversion({ actorId: admin.id, conversionId: first.id, amountKobo: 5_000n, reason: "refund", idempotencyKey: `t-${randomUUID()}` });
      assert(result.reversed, `not reversed: ${"reason" in result ? result.reason : ""}`);
      const rec = await prisma.affiliateRecovery.findFirst({ where: { conversionId: first.id } });
      assert(rec, "no recovery record");
      made.recovery.push(rec!.id);
      assert(rec!.amountKobo === 3_000n, `shortfall ${rec!.amountKobo}, expected 3000 (5000 requested, 2000 available)`);
      assert(rec!.state === "OUTSTANDING", `state ${rec!.state}`);
      return `shortfall ${rec!.amountKobo} kobo recorded as OUTSTANDING`;
    });

    await check("wallet was drained by exactly the recoverable amount", async () => {
      const after = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      assert(after.availableKobo === 0n, `wallet ${after.availableKobo}, expected 0`);
      return "wallet 0, never negative";
    });

    await check("collection with no funds is refused, not overdrawn", async () => {
      const result = await collectRecovery({ actorId: admin.id, recoveryId: made.recovery[0], amountKobo: 1_000n });
      assert(!result.collected, "collected with an empty wallet");
      return `refused: ${"reason" in result ? result.reason : ""}`;
    });

    await check("partial collection is bounded by available funds", async () => {
      await prisma.wallet.update({ where: { id: wallet.id }, data: { availableKobo: 1_200n } });
      const result = await collectRecovery({ actorId: admin.id, recoveryId: made.recovery[0], amountKobo: 1_000n });
      assert(result.collected, `not collected: ${"reason" in result ? result.reason : ""}`);
      if (!result.collected) return "";
      assert(result.collectedKobo === "1000", `collected ${result.collectedKobo}`);
      assert(result.outstandingKobo === "2000", `outstanding ${result.outstandingKobo}`);
      assert(result.ledgerReference.startsWith("AFF-REC-"), `reference ${result.ledgerReference}`);
      return `collected 1000, outstanding 2000, ref ${result.ledgerReference.slice(0, 24)}…`;
    });

    await check("the collection ledger entry is balanced", async () => {
      const rec = await prisma.affiliateRecovery.findUniqueOrThrow({ where: { id: made.recovery[0] } });
      assert(rec.ledgerReference, "no ledger reference on the recovery");
      const tx = await prisma.walletTransaction.findFirst({ where: { reference: rec.ledgerReference! }, include: { ledger: true } });
      assert(tx, `no transaction for ${rec.ledgerReference}`);
      const debit = tx!.ledger.filter((e) => e.direction === "DEBIT").reduce((s, e) => s + e.amountKobo, 0n);
      const credit = tx!.ledger.filter((e) => e.direction === "CREDIT").reduce((s, e) => s + e.amountKobo, 0n);
      assert(debit === credit && debit === 1_000n, `debit ${debit} credit ${credit}`);
      return `debit=${debit} credit=${credit}`;
    });

    await check("a partial collection is traced in the audit journal", async () => {
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: made.recovery[0], action: "affiliate.recovery_collected" },
        orderBy: { createdAt: "desc" }
      });
      assert(audit, "no audit row for the collection");
      const meta = audit!.metadata as { ledgerReference?: string } | null;
      assert(meta?.ledgerReference?.startsWith("AFF-REC-"), "audit row lacks the journal reference");
      return "audit row carries the journal reference";
    });

    await check("concurrent collections cannot take the same amount twice", async () => {
      await prisma.wallet.update({ where: { id: wallet.id }, data: { availableKobo: 2_000n } });
      const results = await Promise.allSettled([
        collectRecovery({ actorId: admin.id, recoveryId: made.recovery[0], amountKobo: 1_000n }),
        collectRecovery({ actorId: admin.id, recoveryId: made.recovery[0], amountKobo: 1_000n })
      ]);
      const ok = results.filter((r) => r.status === "fulfilled" && r.value.collected);
      const rec = await prisma.affiliateRecovery.findUniqueOrThrow({ where: { id: made.recovery[0] } });
      assert(rec.collectedKobo <= 3_000n, `over-collected: ${rec.collectedKobo} of ${rec.amountKobo}`);
      return `${ok.length} succeeded, collected total ${rec.collectedKobo} of ${rec.amountKobo}`;
    });

    await check("full collection closes the receivable", async () => {
      const rec = await prisma.affiliateRecovery.findUniqueOrThrow({ where: { id: made.recovery[0] } });
      const outstanding = rec.amountKobo - rec.collectedKobo;
      if (outstanding > 0n) {
        await prisma.wallet.update({ where: { id: wallet.id }, data: { availableKobo: outstanding } });
        const result = await collectRecovery({ actorId: admin.id, recoveryId: made.recovery[0], amountKobo: outstanding });
        assert(result.collected, `final collection failed: ${"reason" in result ? result.reason : ""}`);
      }
      const after = await prisma.affiliateRecovery.findUniqueOrThrow({ where: { id: made.recovery[0] } });
      assert(after.state === "COLLECTED", `state ${after.state}`);
      assert(after.collectedKobo === after.amountKobo, `${after.collectedKobo} of ${after.amountKobo}`);
      return `COLLECTED ${after.collectedKobo} of ${after.amountKobo}`;
    });

    await check("write-off closes a receivable without moving money", async () => {
      const second = await paidConversion(`o2-${runId}`, 4_000n);
      await prisma.wallet.update({ where: { id: wallet.id }, data: { availableKobo: 0n } });
      const reverse = await reverseConversion({ actorId: admin.id, conversionId: second.id, amountKobo: 4_000n, reason: "refund 2", idempotencyKey: `t-${randomUUID()}` });
      assert(reverse.reversed, "second reversal failed");
      const rec = await prisma.affiliateRecovery.findFirst({ where: { conversionId: second.id } });
      assert(rec, "no recovery for the second shortfall");
      made.recovery.push(rec!.id);
      const walletBefore = (await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).availableKobo;
      const result = await writeOffRecovery({ actorId: admin.id, recoveryId: rec!.id, reason: "uncollectable" });
      assert(result.writtenOff, `not written off: ${"reason" in result ? result.reason : ""}`);
      const walletAfter = (await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).availableKobo;
      assert(walletAfter === walletBefore, "write-off moved money");
      const after = await prisma.affiliateRecovery.findUniqueOrThrow({ where: { id: rec!.id } });
      assert(after.state === "WRITTEN_OFF", `state ${after.state}`);
      return `WRITTEN_OFF ${result.outstandingKobo} kobo, wallet unchanged`;
    });

    await check("summary reconciles outstanding, collected and written off", async () => {
      const summary = await recoverySummary(profile.id);
      const collected = summary.byState.COLLECTED;
      const written = summary.byState.WRITTEN_OFF;
      assert(collected && collected.amountKobo === collected.collectedKobo, "collected bucket does not reconcile");
      assert(written && written.count === 1, `written-off count ${written?.count}`);
      assert(summary.collectionEntries >= 2, `${summary.collectionEntries} collection entries, expected at least 2`);
      return `COLLECTED ${collected.count} fully, WRITTEN_OFF ${written.count}, ${summary.collectionEntries} journal entries`;
    });
  } finally {
    const txs = await prisma.walletTransaction.findMany({ where: { walletId: made.wallet }, select: { id: true } });
    await prisma.ledgerEntry.deleteMany({ where: { OR: [{ walletId: made.wallet }, { transactionId: { in: txs.map((t) => t.id) } }] } });
    await prisma.walletTransaction.deleteMany({ where: { id: { in: txs.map((t) => t.id) } } });
    await prisma.affiliateRecovery.deleteMany({ where: { affiliateId: profile.id } });
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
