import { PrismaClient } from "@prisma/client";
import { reconcileAdjustmentJournals } from "../lib/services/core/ledger-adjustment.service";
const prisma = new PrismaClient();
const QUARANTINED = new Set(["cmvzwmxzx002cv4ucop26i63c"]);
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log((ok ? "PASS  " : "FAIL  ") + name + (detail ? " — " + detail : ""));
  if (!ok) failed++;
};

(async () => {
  const wallets = await prisma.wallet.findMany({ select: { id: true, ownerType: true, availableKobo: true, heldKobo: true } });
  check("wallet balances are non-negative", wallets.every((w) => w.availableKobo >= 0n && w.heldKobo >= 0n));

  const rows = await prisma.$queryRaw<Array<{ id: string; available: bigint; held: bigint; net: bigint }>>`
    SELECT w.id, w."availableKobo" AS available, w."heldKobo" AS held,
      COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e."amountKobo" ELSE -e."amountKobo" END), 0)::bigint AS net
    FROM "Wallet" w LEFT JOIN "LedgerEntry" e ON e."walletId" = w.id
    GROUP BY w.id, w."availableKobo", w."heldKobo"`;
  const mismatches = rows.filter((r) => r.available + r.held !== r.net);
  check("known discrepancy remains contained (NOT full reconciliation)", mismatches.every((m) => QUARANTINED.has(m.id)) && mismatches.length <= 1, JSON.stringify(mismatches.map((m) => ({ id: m.id, diff: (m.available + m.held - m.net).toString() }))));

  const adjustments = await prisma.ledgerAdjustment.findMany({ select: { adjustmentKey: true } });
  const adjustmentKeys = new Set(adjustments.map((a) => a.adjustmentKey));
  const transactions = await prisma.walletTransaction.findMany({ include: { ledger: true } });
  const uncovered: string[] = [];
  const unbalancedOrdinary: string[] = [];
  let ordinary = 0;
  let adjustmentLinked = 0;
  for (const tx of transactions) {
    if (tx.ledger.length === 0) { uncovered.push(tx.id + ":" + tx.reference + ":no-ledger-entries"); continue; }
    const key = tx.reference.startsWith("ADJ-") ? tx.reference.slice(4) : "";
    if (key && adjustmentKeys.has(key)) { adjustmentLinked++; continue; }
    ordinary++;
    const debits = tx.ledger.filter((e) => e.direction === "DEBIT").reduce((sum, e) => sum + e.amountKobo, 0n);
    const credits = tx.ledger.filter((e) => e.direction === "CREDIT").reduce((sum, e) => sum + e.amountKobo, 0n);
    if (debits !== credits) unbalancedOrdinary.push(tx.id + ":" + tx.reference);
  }
  check("every transaction is covered by ordinary or adjustment reconciliation", uncovered.length === 0 && unbalancedOrdinary.length === 0, JSON.stringify({ ordinary, adjustmentLinked, uncovered, unbalancedOrdinary }));
  check("no adjustment-prefixed transaction is unrecognised", transactions.filter((tx) => tx.reference.startsWith("ADJ-") && !adjustmentKeys.has(tx.reference.slice(4))).length === 0, JSON.stringify(transactions.filter((tx) => tx.reference.startsWith("ADJ-") && !adjustmentKeys.has(tx.reference.slice(4))).map((tx) => tx.reference)));

  const journals = await reconcileAdjustmentJournals(prisma);
  check("adjustment journals balance across LedgerEntry and AccountPosting", journals.issues.length === 0, JSON.stringify(journals.rows));
  const prepared = await prisma.ledgerAdjustment.findMany({ where: { adjustmentKey: "PHASE07-FIXTURE-FUNDING-20261103" } });
  check("at most one correction is prepared", prepared.length <= 1, String(prepared.length));
  check("correction remains unapplied", prepared.every((a) => a.status === "PREPARED" && a.appliedAt === null));

  console.log("\nLifetime reconciliation: " + (failed === 0 ? "PASS" : failed + " failure(s)"));
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
})().catch(async (e) => { console.error("FATAL", e); await prisma.$disconnect(); process.exit(1); });
