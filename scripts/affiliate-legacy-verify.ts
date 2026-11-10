import "dotenv/config";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { prisma } from "../lib/prisma";

/**
 * Legacy reconciliation tests with synthetic fixtures.
 *
 *   npx tsx scripts/affiliate-legacy-only-verify.ts
 *
 * Builds conversions that look like pre-table reversals — ledger transactions
 * whose reference starts with AFF-REV-<conversionId> and recovery rows, but no
 * AffiliateReversalOperation — then runs the reconciler as a child process so the
 * real CLI path is exercised, and checks the financial tables are untouched.
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

const made: { users: string[]; conversions: string[]; campaign: string; profile: string } = {
  users: [], conversions: [], campaign: "", profile: ""
};

function reconcile(mode: "--dry-run" | "--apply"): string {
  return execFileSync("npx", ["tsx", "scripts/affiliate-legacy-reconcile.ts", mode], {
    encoding: "utf8",
    shell: process.platform === "win32"
  });
}

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  console.log("database:", db[0].db);

  const user = await prisma.user.create({ data: { email: `legacy-${runId}@example.test`, name: "Legacy", actorType: "CUSTOMER" } });
  made.users.push(user.id);
  const campaign = await prisma.affiliateCampaign.create({
    data: { slug: `legacy-${runId}`, name: "Legacy campaign", vertical: "shop", status: "ACTIVE", funding: "PLATFORM", commissionBps: 500, budgetKobo: 10_000_000n, attributionDays: 0, commissionBasis: "SUBTOTAL", ruleVersion: 1 }
  });
  made.campaign = campaign.id;
  const profile = await prisma.affiliateProfile.create({
    data: { userId: user.id, status: "APPROVED", termsVersion: "t", termsAcceptedAt: new Date(), approvedAt: new Date() }
  });
  made.profile = profile.id;

  async function conversion(label: string, amount: bigint, opts: { state?: "PAID" | "REVERSED"; ledgerReference?: string | null } = {}) {
    const entityId = `legacy-${label}-${runId}`;
    const row = await prisma.affiliateConversion.create({
      data: {
        dedupeKey: `Order:${entityId}`, affiliateId: profile.id, campaignId: campaign.id,
        entityType: "Order", entityId, ruleVersion: 1, commissionBps: 500, basisKobo: amount * 20n,
        amountKobo: amount, state: opts.state ?? "REVERSED", ledgerReference: opts.ledgerReference ?? `AFF-COMM-${entityId}`
      }
    });
    made.conversions.push(row.id);
    return row;
  }

  // The wallet must exist before any legacy transaction references it: the
  // lookup inside the create() arguments threw before the .catch could run.
  const wallet = await prisma.wallet.create({
    data: { userId: user.id, ownerType: "CUSTOMER", currency: "NGN", availableKobo: 0n, heldKobo: 0n }
  });

  async function legacyCash(conversionId: string, amount: bigint) {
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "debit",
        amountKobo: amount,
        reference: `AFF-REV-${conversionId}-legacy`,
        description: "Legacy reversal"
      }
    });
  }

  async function legacyDebt(conversionId: string, amount: bigint) {
    await prisma.affiliateRecovery.create({
      data: { conversionId, affiliateId: profile.id, amountKobo: amount, state: "OUTSTANDING", note: "legacy" }
    });
  }

  try {
    const cashOnly = await conversion("cash", 5_000n);
    await legacyCash(cashOnly.id, 1_200n);

    const debtOnly = await conversion("debt", 5_000n);
    await legacyDebt(debtOnly.id, 900n);

    const mixed = await conversion("mixed", 5_000n, { state: "PAID" });
    await legacyCash(mixed.id, 700n);
    await legacyDebt(mixed.id, 300n);

    const ambiguous = await conversion("ambig", 5_000n);

    const both = await conversion("both", 5_000n);
    await legacyCash(both.id, 2_000n);
    await prisma.affiliateReversalOperation.create({
      data: { opKey: `existing-${runId}`, conversionId: both.id, requestedKobo: 500n, recoveredKobo: 0n, debtKobo: 500n }
    });

    await check("dry run reports reconstructable and ambiguous without writing", async () => {
      const before = await prisma.affiliateReversalOperation.count({ where: { conversionId: { in: made.conversions } } });
      const out = reconcile("--dry-run");
      const after = await prisma.affiliateReversalOperation.count({ where: { conversionId: { in: made.conversions } } });
      assert(after === before, `dry run wrote ${after - before} operations`);
      assert(/reconstructable: 4/.test(out), `expected 4 reconstructable, output: ${out.match(/reconstructable: \d+/)?.[0]}`);
      assert(/ambiguous \(blocked, not inferred\): 1/.test(out), `expected 1 ambiguous, output: ${out.match(/ambiguous[^:]*: \d+/)?.[0]}`);
      return "4 reconstructable, 1 ambiguous, nothing written";
    });

    await check("apply writes historical operations without moving money", async () => {
      const walletsBefore = await prisma.wallet.findMany({ where: { userId: user.id }, select: { id: true, availableKobo: true } });
      const ledgerBefore = await prisma.ledgerEntry.count({});
      const recoveryBefore = await prisma.affiliateRecovery.aggregate({ where: { affiliateId: profile.id }, _sum: { amountKobo: true } });

      reconcile("--apply");

      const walletsAfter = await prisma.wallet.findMany({ where: { userId: user.id }, select: { id: true, availableKobo: true } });
      const ledgerAfter = await prisma.ledgerEntry.count({});
      const recoveryAfter = await prisma.affiliateRecovery.aggregate({ where: { affiliateId: profile.id }, _sum: { amountKobo: true } });

      assert(walletsBefore.length === walletsAfter.length, "wallet count changed");
      for (let i = 0; i < walletsBefore.length; i += 1) {
        assert(walletsBefore[i].availableKobo === walletsAfter[i].availableKobo, `wallet balance changed ${walletsBefore[i].availableKobo} -> ${walletsAfter[i].availableKobo}`);
      }
      assert(ledgerAfter === ledgerBefore, `ledger entries changed ${ledgerBefore} -> ${ledgerAfter}`);
      assert((recoveryBefore._sum.amountKobo ?? 0n) === (recoveryAfter._sum.amountKobo ?? 0n), "recovery amounts changed");
      return "wallet, ledger and recovery untouched";
    });

    await check("reconstructed amounts match the evidence exactly", async () => {
      const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: { in: made.conversions } } });
      const forConversion = (id: string) => ops.filter((op) => op.conversionId === id);
      const cash = forConversion(cashOnly.id);
      const debt = forConversion(debtOnly.id);
      const mix = forConversion(mixed.id);
      assert(cash.length === 1 && cash[0].requestedKobo === 1_200n, `cash-only ${cash[0]?.requestedKobo}`);
      assert(debt.length === 1 && debt[0].requestedKobo === 900n, `debt-only ${debt[0]?.requestedKobo}`);
      assert(mix.length === 1 && mix[0].requestedKobo === 1_000n, `mixed ${mix[0]?.requestedKobo}`);
      return `cash 1200, debt 900, mixed 1000 (700 cash + 300 debt)`;
    });

    await check("a conversion with existing operations records only the unrecorded remainder", async () => {
      const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: both.id } });
      const total = ops.reduce((sum, op) => sum + op.requestedKobo, 0n);
      assert(total === 2_000n, `total ${total}, expected 2000 (500 existing + 1500 legacy remainder)`);
      return `existing 500 + legacy 1500 = ${total}, no double counting`;
    });

    await check("ambiguous history is flagged and financially blocked", async () => {
      const row = await prisma.affiliateConversion.findUniqueOrThrow({ where: { id: ambiguous.id } });
      assert(row.reconciliationRequired, "ambiguous conversion was not flagged");
      const { reverseConversion } = await import("../lib/services/affiliate/settlement");
      const attempt = await reverseConversion({ actorId: null, conversionId: ambiguous.id, amountKobo: 100n, reason: "probe", idempotencyKey: `ambig-${runId}` });
      assert(!attempt.reversed && attempt.reason === "reconciliation_required", `attempt: ${"reason" in attempt ? attempt.reason : "accepted"}`);
      return "flagged, further reversal refused with reconciliation_required";
    });

    await check("a repeated apply changes nothing", async () => {
      const before = await prisma.affiliateReversalOperation.count({ where: { conversionId: { in: made.conversions } } });
      reconcile("--apply");
      const after = await prisma.affiliateReversalOperation.count({ where: { conversionId: { in: made.conversions } } });
      assert(after === before, `${after - before} operations written on rerun`);
      return `still ${after} operations after a second apply`;
    });

    await check("a later reversal respects the reconstructed cumulative limit", async () => {
      const { reverseConversion } = await import("../lib/services/affiliate/settlement");
      // mixed: 5,000 commission, 1,000 reconstructed. 4,000 remains.
      const over = await reverseConversion({ actorId: null, conversionId: mixed.id, amountKobo: 4_500n, reason: "over", idempotencyKey: `mix-over-${runId}` });
      assert(!over.reversed && over.reason === "exceeds_original", `over-attempt: ${"reason" in over ? over.reason : "accepted"}`);
      const ok = await reverseConversion({ actorId: null, conversionId: mixed.id, amountKobo: 4_000n, reason: "remainder", idempotencyKey: `mix-rest-${runId}` });
      assert(ok.reversed, `legitimate remainder refused: ${"reason" in ok ? ok.reason : ""}`);
      const ops = await prisma.affiliateReversalOperation.findMany({ where: { conversionId: mixed.id } });
      const total = ops.reduce((sum, op) => sum + op.requestedKobo, 0n);
      assert(total === 5_000n, `total ${total}, expected exactly the commission`);
      return `4,500 refused, 4,000 accepted, total ${total} of 5000`;
    });
  } finally {
    await prisma.affiliateReversalOperation.deleteMany({ where: { conversionId: { in: made.conversions } } });
    const wallets = await prisma.wallet.findMany({ where: { userId: { in: made.users } }, select: { id: true } });
    const ids = wallets.map((w) => w.id);
    await prisma.ledgerEntry.deleteMany({ where: { walletId: { in: ids } } });
    await prisma.walletTransaction.deleteMany({ where: { walletId: { in: ids } } });
    await prisma.affiliateRecovery.deleteMany({ where: { affiliateId: profile.id } });
    await prisma.affiliateConversion.deleteMany({ where: { affiliateId: profile.id } });
    await prisma.affiliateProfile.deleteMany({ where: { id: profile.id } });
    await prisma.affiliateCampaign.deleteMany({ where: { id: campaign.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: made.conversions } } });
    await prisma.wallet.deleteMany({ where: { id: { in: ids } } });
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
