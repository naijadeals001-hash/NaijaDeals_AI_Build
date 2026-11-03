import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
(async () => {
  const mismatches = await prisma.$queryRaw<Array<{ id: string; available: bigint; held: bigint; net: bigint }>>`
    SELECT w.id, w."availableKobo" AS available, w."heldKobo" AS held,
      COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e."amountKobo" ELSE -e."amountKobo" END), 0)::bigint AS net
    FROM "Wallet" w LEFT JOIN "LedgerEntry" e ON e."walletId" = w.id
    GROUP BY w.id, w."availableKobo", w."heldKobo"
    HAVING (w."availableKobo" + w."heldKobo") <> COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e."amountKobo" ELSE -e."amountKobo" END), 0)`;
  const wallets = await prisma.wallet.count();
  console.log(JSON.stringify({ wallets, mismatches: mismatches.length, sample: mismatches.slice(0, 3) }, (key, value) => typeof value === "bigint" ? value.toString() : value));
  await prisma.$disconnect();
})().catch(async (e) => { console.error("FATAL", e.message); await prisma.$disconnect(); process.exit(1); });
