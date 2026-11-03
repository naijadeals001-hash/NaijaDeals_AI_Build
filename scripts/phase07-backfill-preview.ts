import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/**
 * Dry-run only. Proposes balanced reconciliation entries for wallets whose
 * available+held balance differs from their ledger net. Nothing is written.
 * A reviewed migration or one-off admin action must apply any proposal.
 */
(async () => {
  const rows = await prisma.$queryRaw<Array<{ id: string; ownerType: string; availableKobo: bigint; heldKobo: bigint; net: bigint }>>`
    SELECT w.id, w."ownerType"::text AS "ownerType", w."availableKobo", w."heldKobo",
      COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e."amountKobo" ELSE -e."amountKobo" END), 0)::bigint AS net
    FROM "Wallet" w LEFT JOIN "LedgerEntry" e ON e."walletId" = w.id
    GROUP BY w.id, w."ownerType", w."availableKobo", w."heldKobo"
    HAVING (w."availableKobo" + w."heldKobo") <> COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e."amountKobo" ELSE -e."amountKobo" END), 0)
    ORDER BY w.id`;

  const proposals = rows.map((row) => {
    const difference = row.availableKobo + row.heldKobo - row.net;
    // Positive difference: ledger must gain a credit; negative: a debit.
    const walletDirection = difference > BigInt(0) ? "CREDIT" : "DEBIT";
    const amount = difference > BigInt(0) ? difference : -difference;
    return {
      walletId: row.id,
      ownerType: row.ownerType,
      currentBalanceKobo: (row.availableKobo + row.heldKobo).toString(),
      ledgerNetKobo: row.net.toString(),
      differenceKobo: difference.toString(),
      proposal: {
        reference: `RECON-${row.id}-${Date.now()}`,
        entries: [
          { walletId: row.id, direction: walletDirection, amountKobo: amount.toString(), memo: "Reconciliation adjustment" },
          { walletId: "NEW:SYSTEM_RECONCILIATION", direction: walletDirection === "CREDIT" ? "DEBIT" : "CREDIT", amountKobo: amount.toString(), memo: "Counter-account for reconciliation" }
        ],
        note: "Requires a new SYSTEM reconciliation wallet and human approval; not applied."
      }
    };
  });

  console.log(JSON.stringify({ dryRun: true, mismatched: proposals.length, proposals }, (key, value) => typeof value === "bigint" ? value.toString() : value, 2));
  await prisma.$disconnect();
})().catch(async (error) => { console.error("FATAL", error); await prisma.$disconnect(); process.exit(1); });
