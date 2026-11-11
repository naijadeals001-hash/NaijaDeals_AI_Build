import "dotenv/config";
import { prisma } from "../lib/prisma";
import { recordAudit } from "../lib/services/core/audit.service";

/**
 * Idempotent backfill for reversal debt recorded before recovery rows existed.
 *
 *   npx tsx scripts/affiliate-recovery-backfill.ts [--apply]
 *
 * Dry run by default. Target debt per conversion is the sum of debtKobo over
 * its operations; existing coverage is the sum of recovery amountKobo. Only the
 * difference is created, so repeated runs change nothing.
 */

const REQUIRED_DB = "naijadeals_affiliate_test";

async function main() {
  const database = await prisma.$queryRawUnsafe<Array<{ db: string }>>("select current_database() as db");
  const actual = database[0]?.db ?? "";
  if (actual !== REQUIRED_DB) throw new Error(`Refusing to run: connected to "${actual}", expected "${REQUIRED_DB}".`);
  const apply = process.argv.includes("--apply");

  const groups = await prisma.affiliateReversalOperation.groupBy({
    by: ["conversionId"],
    _sum: { debtKobo: true },
    _count: { _all: true }
  });

  const changes: Array<{ conversionId: string; debtKobo: string; coveredKobo: string; deficitKobo: string; action: string }> = [];
  let created = 0;
  let toppedUp = 0;
  let deficitTotal = 0n;

  for (const group of groups) {
    const target = group._sum.debtKobo ?? 0n;
    if (target <= 0n) continue;
    const covered = await prisma.affiliateRecovery.aggregate({
      where: { conversionId: group.conversionId },
      _sum: { amountKobo: true }
    });
    const coveredKobo = covered._sum.amountKobo ?? 0n;
    const deficit = target - coveredKobo;
    if (deficit <= 0n) continue;
    deficitTotal += deficit;

    const conversion = await prisma.affiliateConversion.findUnique({ where: { id: group.conversionId } });
    if (!conversion) continue;

    const open = await prisma.affiliateRecovery.findFirst({
      where: { conversionId: group.conversionId, state: "OUTSTANDING" }
    });
    const action = open ? "topped_up" : "created";
    changes.push({ conversionId: group.conversionId, debtKobo: target.toString(), coveredKobo: coveredKobo.toString(), deficitKobo: deficit.toString(), action });

    if (!apply) continue;
    // Serialise per conversion and recompute inside the lock: two backfill
    // processes that both read the same deficit must not both create it.
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${conversion.id}))`;
      const lockedOps = await tx.affiliateReversalOperation.aggregate({ where: { conversionId: conversion.id }, _sum: { debtKobo: true } });
      const lockedCovered = await tx.affiliateRecovery.aggregate({ where: { conversionId: conversion.id }, _sum: { amountKobo: true } });
      const lockedDeficit = (lockedOps._sum.debtKobo ?? 0n) - (lockedCovered._sum.amountKobo ?? 0n);
      if (lockedDeficit <= 0n) return "none" as const;
      const lockedOpen = await tx.affiliateRecovery.findFirst({ where: { conversionId: conversion.id, state: "OUTSTANDING" } });
      if (lockedOpen) {
        await tx.affiliateRecovery.update({ where: { id: lockedOpen.id }, data: { amountKobo: { increment: lockedDeficit } } });
        return "topped_up" as const;
      }
      await tx.affiliateRecovery.create({
        data: {
          conversionId: conversion.id,
          affiliateId: conversion.affiliateId,
          amountKobo: lockedDeficit,
          note: "Backfilled from reversal operations"
        }
      });
      return "created" as const;
    });
    if (outcome === "none") continue;
    if (outcome === "topped_up") toppedUp += 1; else created += 1;
    await recordAudit({
      actorId: null,
      action: "affiliate.recovery_backfilled",
      entity: "AffiliateRecovery",
      entityId: conversion.id,
      metadata: { deficitKobo: deficit.toString(), operations: group._count._all, applied: true }
    });
  }

  console.log(JSON.stringify({
    database: actual,
    dryRun: !apply,
    conversionsWithDebt: groups.filter((group) => (group._sum.debtKobo ?? 0n) > 0n).length,
    deficits: changes.length,
    deficitKobo: deficitTotal.toString(),
    created,
    toppedUp,
    changes: changes.slice(0, 20)
  }, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
