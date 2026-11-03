import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const KEY = "PHASE07-FIXTURE-FUNDING-20261103";

(async () => {
  const rows = await prisma.$queryRaw<Array<{ id: string; available: bigint; held: bigint; net: bigint }>>`
    SELECT w.id, w."availableKobo" AS available, w."heldKobo" AS held,
      COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e."amountKobo" ELSE -e."amountKobo" END), 0)::bigint AS net
    FROM "Wallet" w LEFT JOIN "LedgerEntry" e ON e."walletId" = w.id
    WHERE w."ownerType" = 'SYSTEM'
    GROUP BY w.id, w."availableKobo", w."heldKobo"`;
  const target = rows.find((r) => r.available + r.held !== r.net);
  if (!target) { console.log(JSON.stringify({ status: "nothing_to_prepare" })); await prisma.$disconnect(); return; }
  const existing = await prisma.ledgerAdjustment.findUnique({ where: { adjustmentKey: KEY } });
  if (existing) {
    console.log(JSON.stringify({ status: "already_prepared", id: existing.id, adjustmentKey: KEY, applied: existing.status === "APPLIED" }));
    await prisma.$disconnect(); return;
  }
  const difference = target.available + target.held - target.net;
  const first = await prisma.ledgerEntry.findFirstOrThrow({ where: { walletId: target.id }, orderBy: { createdAt: "asc" } });
  const tx = await prisma.walletTransaction.findUnique({ where: { id: first.transactionId }, include: { ledger: true } });
  const customerCredit = tx?.ledger.find((e) => e.direction === "CREDIT" && e.walletId !== target.id);
  const adjustment = await prisma.ledgerAdjustment.create({
    data: {
      adjustmentKey: KEY,
      status: "PREPARED",
      preparedBy: "phase07-investigation",
      journal: {
        lines: [
          { walletId: target.id, entry: "CREDIT", amountKobo: difference.toString(), memo: "Recognise fixture funding as opening equity (correction; not applied)" },
          { account: "FIXTURE_EQUITY", entry: "DEBIT", amountKobo: difference.toString(), memo: "Fixture funding source contra" }
        ],
        balanced: true
      },
      references: {
        walletId: target.id,
        earliestLedgerEntryId: first.id,
        fixtureTransactionId: first.transactionId,
        fixtureReference: tx?.reference ?? null,
        fixtureDescription: tx?.description ?? null,
        customerCreditLedgerEntryId: customerCredit?.id ?? null,
        storedAvailableKobo: target.available.toString(),
        storedHeldKobo: target.held.toString(),
        ledgerNetKobo: target.net.toString(),
        differenceKobo: difference.toString()
      }
    }
  });
  console.log(JSON.stringify({ status: "prepared", id: adjustment.id, adjustmentKey: KEY }));
  await prisma.$disconnect();
})().catch(async (e) => { console.error("FATAL", e); await prisma.$disconnect(); process.exit(1); });
