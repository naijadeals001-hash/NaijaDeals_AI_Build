import "dotenv/config";
import { prisma } from "../lib/prisma";

/**
 * Legacy reversal reconciliation.
 *
 *   npx tsx scripts/affiliate-legacy-reconcile.ts --dry-run
 *   npx tsx scripts/affiliate-legacy-reconcile.ts --apply
 *
 * Reversals used to be recorded only in the ledger and recovery tables, before
 * AffiliateReversalOperation existed. That made them invisible to the cumulative
 * bound, so an old conversion could be reversed again beyond its original
 * commission.
 *
 * Evidence used, in order of reliability:
 *  - cash recovered: a WalletTransaction whose reference starts with
 *    `AFF-REV-<conversionId>` — the old generated reference shape;
 *  - debt: AffiliateRecovery rows for the conversion.
 * Requested = recovered cash + debt. Nothing is inferred from a state flag,
 * because a partial reversal leaves the conversion PAID.
 *
 * If a conversion looks reversed but neither piece of evidence exists, the amount
 * is unknowable. Those are flagged `reconciliationRequired` and financially
 * blocked rather than assumed to be zero.
 *
 * Idempotent: existing operations make a conversion ineligible, so a second run
 * changes nothing. Operation rows are written with `legacy:<conversionId>` keys
 * and carry no ledger reference, because no money moves during reconciliation.
 */

const APPLY = process.argv.includes("--apply");
const DRY = !APPLY;

type Plan = {
  conversionId: string;
  entityId: string;
  cashKobo: bigint;
  debtKobo: bigint;
  requestedKobo: bigint;
  evidence: string[];
};

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  console.log(`database: ${db[0].db}  mode: ${DRY ? "DRY RUN" : "APPLY"}`);

  const candidates = await prisma.affiliateConversion.findMany({
    where: {
      OR: [{ state: "REVERSED" }, { ledgerReference: { not: null } }]
    },
    select: { id: true, entityId: true, amountKobo: true, state: true, ledgerReference: true }
  });

  const plans: Plan[] = [];
  const ambiguous: typeof candidates = [];

  for (const conversion of candidates) {
    // AffiliateReversalOperation.conversionId is a bare scalar, so existing
    // operations are checked directly rather than through a relation filter.
    // Existing operations must not hide older unrecorded history: a conversion
    // can have both. The reconstructed total is compared against what operations
    // already account for, and only the difference is recorded.
    const existingOps = await prisma.affiliateReversalOperation.aggregate({
      where: { conversionId: conversion.id },
      _sum: { requestedKobo: true }
    });
    const recordedKobo = existingOps._sum.requestedKobo ?? 0n;
    const cash = await prisma.walletTransaction.findMany({
      where: { reference: { startsWith: `AFF-REV-${conversion.id}` } },
      select: { amountKobo: true, reference: true }
    });
    const debtRows = await prisma.affiliateRecovery.findMany({
      where: { conversionId: conversion.id },
      select: { amountKobo: true }
    });

    const cashKobo = cash.reduce((sum, row) => sum + row.amountKobo, 0n);
    const debtKobo = debtRows.reduce((sum, row) => sum + row.amountKobo, 0n);
    const requestedKobo = cashKobo + debtKobo;

    if (requestedKobo === 0n) {
      // State says reversed, but nothing records how much. Do not guess zero.
      ambiguous.push(conversion);
      continue;
    }

    const unrecorded = requestedKobo - recordedKobo;
    if (unrecorded <= 0n) continue; // fully accounted for by existing operations

    plans.push({
      conversionId: conversion.id,
      entityId: conversion.entityId,
      cashKobo,
      debtKobo,
      requestedKobo: unrecorded,
      evidence: [
        ...(cash.length ? [`${cash.length} reversal ledger entr${cash.length === 1 ? "y" : "ies"}`] : []),
        ...(debtRows.length ? [`${debtRows.length} recovery row${debtRows.length === 1 ? "" : "s"}`] : [])
      ]
    });
  }

  console.log(`\nreconstructable: ${plans.length}`);
  for (const plan of plans) {
    console.log(
      `  ${plan.conversionId.slice(0, 10)}… cash=${plan.cashKobo} debt=${plan.debtKobo} requested=${plan.requestedKobo} [${plan.evidence.join(", ")}]`
    );
  }

  console.log(`\nambiguous (blocked, not inferred): ${ambiguous.length}`);
  for (const row of ambiguous) {
    console.log(`  ${row.id.slice(0, 10)}… entity=${row.entityId} state=${row.state}`);
  }

  if (DRY) {
    console.log("\nDry run: nothing written.");
    await prisma.$disconnect();
    return;
  }

  let written = 0;
  for (const plan of plans) {
    // Re-check inside the write so a concurrent run cannot double-insert:
    // opKey is unique on (legacy, conversion).
    // If a legacy row already exists the difference has been recorded before.
    const existing = await prisma.affiliateReversalOperation.findUnique({
      where: { opKey: `legacy:${plan.conversionId}` }
    });
    if (existing) continue;
    await prisma.affiliateReversalOperation.create({
      data: {
        opKey: `legacy:${plan.conversionId}`,
        conversionId: plan.conversionId,
        requestedKobo: plan.requestedKobo,
        recoveredKobo: plan.cashKobo,
        debtKobo: plan.debtKobo,
        actorId: null
      }
    });
    written += 1;
  }

  let flagged = 0;
  for (const row of ambiguous) {
    const result = await prisma.affiliateConversion.updateMany({
      where: { id: row.id, reconciliationRequired: false },
      data: { reconciliationRequired: true }
    });
    flagged += result.count;
  }

  console.log(`\napplied: ${written} operation rows written, ${flagged} conversions flagged`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("crashed:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
