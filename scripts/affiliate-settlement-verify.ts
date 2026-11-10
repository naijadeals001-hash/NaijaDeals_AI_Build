import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { applyAffiliate, decideAffiliate, createLink, resolveTouch, recordConversion, updateConversionState } from "../lib/services/affiliate/service";
import { settleConversion, reverseConversion } from "../lib/services/affiliate/settlement";

/**
 * Settlement and reversal verification against the shared NaijaPay ledger.
 *
 *   npx tsx scripts/affiliate-settlement-verify.ts
 *
 * Uses isolated fixtures and test-only amounts. No external payout happens: a
 * wallet settlement is not a payout, and this script never requests one.
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

async function balance(walletId: string) {
  return (await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })).availableKobo;
}

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  console.log("database:", db[0].db);

  const user = await prisma.user.create({ data: { email: `affset-${runId}@example.test`, name: "Settlement Test", actorType: "CUSTOMER" } });
  const admin = await prisma.user.create({ data: { email: `affset-admin-${runId}@example.test`, name: "Settlement Admin", actorType: "ADMIN" } });
  const platform = await prisma.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" } });

  const profile = await applyAffiliate({ userId: user.id, termsVersion: "2026-11" });
  await decideAffiliate({ actorId: admin.id, affiliateId: profile.id, approve: true });
  const campaign = await prisma.affiliateCampaign.create({
    data: {
      slug: `settle-${runId}`, name: `Settlement campaign ${runId}`, vertical: "shop", status: "ACTIVE",
      funding: "PLATFORM", commissionBps: 500, budgetKobo: 10_000_000n, attributionDays: 0, commissionBasis: "SUBTOTAL", ruleVersion: 1
    }
  });
  const link = await createLink({ affiliateId: profile.id, campaignId: campaign.id, destination: "/product/abc" });
  await resolveTouch({ code: link.code, visitorKey: `v-${runId}`, consent: true });

  const conversionIds: string[] = [];
  async function accrual(entityId: string) {
    const result = await recordConversion({ entityType: "Order", entityId, basisKobo: 100_000n, visitorKey: `v-${runId}` });
    if (!result.created) throw new Error(`accrual failed: ${result.reason}`);
    conversionIds.push(result.conversion.id);
    return result.conversion;
  }

  try {
    const first = await accrual(`ord-settle-${runId}`);

    await check("an unapproved state cannot settle", async () => {
      const result = await settleConversion({ actorId: admin.id, conversionId: first.id });
      assert(!result.settled, "settled from TRACKED");
      return `refused: ${"reason" in result ? result.reason : ""}`;
    });

    await updateConversionState({ actorId: admin.id, conversionId: first.id, to: "VALIDATING" });
    await updateConversionState({ actorId: admin.id, conversionId: first.id, to: "APPROVED" });

    let affiliateWalletId = "";
    let before = 0n;
    let platformBefore = 0n;

    await check("settlement credits the affiliate once and debits the platform", async () => {
      const wallet = await prisma.wallet.findFirstOrThrow({ where: { userId: user.id, ownerType: "CUSTOMER" } });
      affiliateWalletId = wallet.id;
      before = await balance(wallet.id);
      platformBefore = await balance(platform.id);

      const result = await settleConversion({ actorId: admin.id, conversionId: first.id });
      assert(result.settled, `not settled: ${"reason" in result ? result.reason : ""}`);
      const after = await balance(wallet.id);
      assert(after - before === 5_000n, `wallet moved ${after - before}, expected 5000`);
      const platformAfter = await balance(platform.id);
      assert(platformBefore - platformAfter === 5_000n, `platform moved ${platformBefore - platformAfter}`);
      return `affiliate +${after - before} kobo, platform -${platformBefore - platformAfter} kobo`;
    });

    await check("the ledger transaction is balanced", async () => {
      const tx = await prisma.walletTransaction.findFirstOrThrow({
        where: { reference: `AFF-COMM-${first.id}` }, include: { ledger: true }
      });
      const debit = tx.ledger.filter((e) => e.direction === "DEBIT").reduce((sum, e) => sum + e.amountKobo, 0n);
      const credit = tx.ledger.filter((e) => e.direction === "CREDIT").reduce((sum, e) => sum + e.amountKobo, 0n);
      assert(debit === credit && debit === 5_000n, `debit ${debit} credit ${credit}`);
      return `debit=${debit} credit=${credit}`;
    });

    await check("the conversion records the journal reference", async () => {
      const row = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: first.id } });
      assert(row.state === "PAID", `state ${row.state}`);
      assert(row.ledgerReference === `AFF-COMM-${first.id}`, `reference ${row.ledgerReference}`);
      return `PAID + ${row.ledgerReference}`;
    });

    await check("a second settlement credits nothing", async () => {
      const afterFirst = await balance(affiliateWalletId);
      const again = await settleConversion({ actorId: admin.id, conversionId: first.id });
      assert(!again.settled, "settled twice");
      const now = await balance(affiliateWalletId);
      assert(now === afterFirst, `wallet moved again by ${now - afterFirst}`);
      return `refused: ${"reason" in again ? again.reason : ""}, wallet unchanged`;
    });

    await check("concurrent settlements produce one credit", async () => {
      const second = await accrual(`ord-conc-${runId}`);
      await updateConversionState({ actorId: admin.id, conversionId: second.id, to: "VALIDATING" });
      await updateConversionState({ actorId: admin.id, conversionId: second.id, to: "APPROVED" });
      const beforeConcurrent = await balance(affiliateWalletId);
      const results = await Promise.allSettled([
        settleConversion({ actorId: admin.id, conversionId: second.id }),
        settleConversion({ actorId: admin.id, conversionId: second.id })
      ]);
      const settledCount = results.filter((r) => r.status === "fulfilled" && r.value.settled).length;
      const afterConcurrent = await balance(affiliateWalletId);
      assert(settledCount === 1, `${settledCount} settlements succeeded`);
      assert(afterConcurrent - beforeConcurrent === 5_000n, `wallet moved ${afterConcurrent - beforeConcurrent}, expected 5000`);
      return `one settlement, wallet +${afterConcurrent - beforeConcurrent}`;
    });

    await check("reversal before settlement releases budget without moving money", async () => {
      const third = await accrual(`ord-pre-${runId}`);
      const campaignBefore = await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
      const walletBefore = await balance(affiliateWalletId);
      const result = await reverseConversion({ actorId: admin.id, conversionId: third.id, amountKobo: 5_000n, reason: "order refunded before settlement" });
      assert(result.reversed, `not reversed: ${"reason" in result ? result.reason : ""}`);
      const campaignAfter = await prisma.affiliateCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
      const walletAfter = await balance(affiliateWalletId);
      assert(campaignBefore.spentKobo - campaignAfter.spentKobo === 5_000n, "budget not released");
      assert(walletAfter === walletBefore, "money moved for an unsettled reversal");
      const row = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: third.id } });
      assert(row.state === "REVERSED", `state ${row.state}`);
      return `budget released 5000, wallet unchanged, state REVERSED`;
    });

    await check("reversal after settlement debits the wallet with a balanced entry", async () => {
      const walletBefore = await balance(affiliateWalletId);
      const platformBeforeRev = await balance(platform.id);
      const result = await reverseConversion({ actorId: admin.id, conversionId: first.id, amountKobo: 5_000n, reason: "order refunded after settlement" });
      assert(result.reversed, `not reversed: ${"reason" in result ? result.reason : ""}`);
      const walletAfter = await balance(affiliateWalletId);
      assert(walletBefore - walletAfter === 5_000n, `wallet moved ${walletBefore - walletAfter}`);
      assert(await balance(platform.id) - platformBeforeRev === 5_000n, "platform not credited");
      const tx = await prisma.walletTransaction.findFirst({
        where: { reference: { startsWith: `AFF-REV-${first.id}` } }, include: { ledger: true }
      });
      assert(tx, "no reversal transaction");
      const debit = tx!.ledger.filter((e) => e.direction === "DEBIT").reduce((s, e) => s + e.amountKobo, 0n);
      const credit = tx!.ledger.filter((e) => e.direction === "CREDIT").reduce((s, e) => s + e.amountKobo, 0n);
      assert(debit === credit, `reversal unbalanced: ${debit} vs ${credit}`);
      return `wallet -5000, platform +5000, balanced reversal`;
    });

    await check("reversal cannot exceed the original commission", async () => {
      const over = await reverseConversion({ actorId: admin.id, conversionId: first.id, amountKobo: 100_000n, reason: "over-reversal attempt" });
      assert(!over.reversed, "over-reversal accepted");
      return `refused: ${"reason" in over ? over.reason : ""}`;
    });

    await check("wallet never goes negative through recovery", async () => {
      const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: affiliateWalletId } });
      assert(wallet.availableKobo >= 0n, `balance ${wallet.availableKobo}`);
      return `balance ${wallet.availableKobo} kobo, non-negative`;
    });
  } finally {
    const wallet = await prisma.wallet.findFirst({ where: { userId: user.id } });
    if (wallet) {
      const txs = await prisma.walletTransaction.findMany({ where: { walletId: wallet.id }, select: { id: true } });
      await prisma.ledgerEntry.deleteMany({ where: { OR: [{ walletId: wallet.id }, { transactionId: { in: txs.map((t) => t.id) } }] } });
      await prisma.walletTransaction.deleteMany({ where: { id: { in: txs.map((t) => t.id) } } });
    }
    await prisma.affiliateConversion.deleteMany({ where: { affiliateId: profile.id } });
    await prisma.attributionTouch.deleteMany({ where: { link: { affiliateId: profile.id } } });
    await prisma.affiliateLink.deleteMany({ where: { affiliateId: profile.id } });
    await prisma.affiliateProfile.deleteMany({ where: { id: profile.id } });
    await prisma.affiliateCampaign.deleteMany({ where: { id: campaign.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: conversionIds } } });
    await prisma.wallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, admin.id] } } });
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
