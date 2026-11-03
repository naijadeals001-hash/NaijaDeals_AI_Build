import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

(async () => {
  const wallets = await prisma.wallet.count();
  const mismatches = await prisma.$queryRaw<Array<{ id: string; ownerType: string; availableKobo: bigint; heldKobo: bigint; net: bigint }>>`
    SELECT w.id, w."ownerType"::text AS "ownerType", w."availableKobo", w."heldKobo",
      COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e."amountKobo" ELSE -e."amountKobo" END), 0)::bigint AS net
    FROM "Wallet" w LEFT JOIN "LedgerEntry" e ON e."walletId" = w.id
    GROUP BY w.id, w."ownerType", w."availableKobo", w."heldKobo"
    HAVING (w."availableKobo" + w."heldKobo") <> COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e."amountKobo" ELSE -e."amountKobo" END), 0)
    ORDER BY w.id`;
  console.log(JSON.stringify({
    wallets,
    mismatches: mismatches.length,
    rows: mismatches.map((row) => ({
      id: row.id,
      ownerType: row.ownerType,
      availableKobo: row.availableKobo.toString(),
      heldKobo: row.heldKobo.toString(),
      ledgerNetKobo: row.net.toString(),
      differenceKobo: (row.availableKobo + row.heldKobo - row.net).toString()
    }))
  }, null, 2));
  await prisma.$disconnect();
  process.exit(mismatches.length === 0 ? 0 : 2);
})().catch(async (error) => { console.error("FATAL", error); await prisma.$disconnect(); process.exit(1); });
