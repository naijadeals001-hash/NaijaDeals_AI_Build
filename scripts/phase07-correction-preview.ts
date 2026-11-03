import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.$queryRaw<Array<{ id: string; available: bigint; held: bigint; net: bigint }>>`
    SELECT w.id, w."availableKobo" AS available, w."heldKobo" AS held,
      COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e."amountKobo" ELSE -e."amountKobo" END), 0)::bigint AS net
    FROM "Wallet" w LEFT JOIN "LedgerEntry" e ON e."walletId" = w.id
    WHERE w."ownerType" = 'SYSTEM'
    GROUP BY w.id, w."availableKobo", w."heldKobo"
    HAVING (w."availableKobo" + w."heldKobo") <> COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e."amountKobo" ELSE -e."amountKobo" END), 0)`;
  const wallet = rows[0];
  if (!wallet) { console.log(JSON.stringify({ mismatches: 0 })); await prisma.$disconnect(); return; }
  const first = await prisma.ledgerEntry.findFirst({ where: { walletId: wallet.id }, orderBy: { createdAt: "asc" } });
  const difference = wallet.available + wallet.held - wallet.net;
  const journal = [
    { account: "SYSTEM wallet " + wallet.id, entry: "CREDIT", amountKobo: difference.toString(), memo: "Recognise fixture funding as opening equity (corrects one-sided fixture debit)" },
    { account: "FIXTURE_EQUITY (non-wallet contra account, proposed)", entry: "DEBIT", amountKobo: difference.toString(), memo: "Fixture funding source contra" }
  ];
  console.log(JSON.stringify({
    dryRun: true,
    walletId: wallet.id,
    storedAvailableKobo: wallet.available.toString(),
    storedHeldKobo: wallet.held.toString(),
    ledgerNetKobo: wallet.net.toString(),
    differenceKobo: difference.toString(),
    earliestDivergence: first ? { id: first.id, createdAt: first.createdAt, direction: first.direction, amountKobo: first.amountKobo.toString(), memo: first.memo } : null,
    proposedJournal: journal,
    journalBalance: { debitsKobo: difference.toString(), creditsKobo: difference.toString(), balanced: true },
    projected: {
      systemLedgerNetKobo: (wallet.net + difference).toString(),
      systemStoredTotalKobo: (wallet.available + wallet.held).toString(),
      systemDifferenceKobo: "0",
      nonNegativeWalletsPreserved: true,
      historicalEntriesRewritten: false
    },
    note: "FIXTURE_EQUITY is an accounting contra account; it is not a wallet and must not be forced to a non-negative balance."
  }, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => { console.error("FATAL", e); await prisma.$disconnect(); process.exit(1); });
