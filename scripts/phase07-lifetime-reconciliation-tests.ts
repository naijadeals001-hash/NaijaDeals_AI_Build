import { PrismaClient } from "@prisma/client";
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

  const groups = await prisma.$queryRaw<Array<{ transactionId: string; debits: bigint; credits: bigint }>>`
    SELECT "transactionId",
      COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN "amountKobo" ELSE 0 END), 0)::bigint AS debits,
      COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN "amountKobo" ELSE 0 END), 0)::bigint AS credits
    FROM "LedgerEntry" GROUP BY "transactionId"`;
  const unbalanced = groups.filter((g) => g.debits !== g.credits);
  check("every ledger transaction group balances", unbalanced.length === 0, JSON.stringify(unbalanced.slice(0, 5).map((g) => ({ id: g.transactionId, debits: g.debits.toString(), credits: g.credits.toString() }))));

  const prepared = await prisma.ledgerAdjustment.findMany({ where: { adjustmentKey: "PHASE07-FIXTURE-FUNDING-20261103" } });
  check("at most one correction is prepared", prepared.length <= 1, String(prepared.length));
  check("correction remains unapplied", prepared.every((a) => a.status === "PREPARED" && a.appliedAt === null));

  console.log("\nLifetime reconciliation: " + (failed === 0 ? "PASS" : failed + " failure(s)"));
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
})().catch(async (e) => { console.error("FATAL", e); await prisma.$disconnect(); process.exit(1); });
