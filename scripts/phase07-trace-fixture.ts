import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
(async () => {
  const tx = await prisma.walletTransaction.findUnique({
    where: { id: "cmvzwmxzy002ev4uc0dgm4qck" },
    include: { wallet: { select: { id: true, ownerType: true, userId: true, vendorId: true } }, ledger: true, order: { select: { orderNumber: true, status: true } } }
  });
  const system = await prisma.wallet.findMany({ where: { ownerType: "SYSTEM" }, select: { id: true, availableKobo: true, heldKobo: true, createdAt: true } });
  console.log(JSON.stringify({ transaction: tx, systemWallets: system }, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  await prisma.$disconnect();
})();
