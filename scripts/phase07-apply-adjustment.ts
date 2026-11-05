/**
 * Apply the PREPARED PHASE07 fixture-funding ledger adjustment to align the
 * SYSTEM wallet ledger with its stored balance, against the FIXTURE_EQUITY
 * contra account. Authorized by the owner (production-readiness directive,
 * 2026-11-05). Idempotent: re-running reports already_applied.
 *
 * Usage: npx tsx scripts/phase07-apply-adjustment.ts
 */
import { PrismaClient } from "@prisma/client";
import { applyLedgerAdjustment, reconcileAdjustmentJournals } from "../lib/services/core/ledger-adjustment.service";

const prisma = new PrismaClient();
const KEY = "PHASE07-FIXTURE-FUNDING-20261103";

(async () => {
  await prisma.ledgerAccount.upsert({
    where: { code: "FIXTURE_EQUITY" },
    update: {},
    create: { code: "FIXTURE_EQUITY", name: "Fixture opening equity", kind: "EQUITY" }
  });
  const result = await applyLedgerAdjustment(KEY, "owner-authorized-phase07-resolution");
  console.log(JSON.stringify(result, (key, value) => (typeof value === "bigint" ? value.toString() : value)));
  const reconciliation = await reconcileAdjustmentJournals(prisma);
  console.log(JSON.stringify({ adjustments: reconciliation.adjustments, issues: reconciliation.issues }));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("FATAL", e);
  await prisma.$disconnect();
  process.exit(1);
});
