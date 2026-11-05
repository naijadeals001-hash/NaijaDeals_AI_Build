// Forensics for the SYSTEM wallet cached-vs-ledger delta. Read-only.
// Run: node scripts/system-wallet-forensics.cjs
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const wallet = await prisma.wallet.findFirst({ where: { ownerType: "SYSTEM" } });
  const entries = await prisma.ledgerEntry.findMany({
    where: { walletId: wallet.id },
    include: { transaction: { select: { reference: true, description: true, createdAt: true, type: true } } },
    orderBy: { createdAt: "asc" }
  });
  const credits = entries.filter((e) => e.direction === "CREDIT").reduce((s, e) => s + e.amountKobo, 0n);
  const debits = entries.filter((e) => e.direction === "DEBIT").reduce((s, e) => s + e.amountKobo, 0n);
  console.log("wallet:", { id: wallet.id, cachedAvailable: wallet.availableKobo.toString(), cachedHeld: wallet.heldKobo.toString() });
  console.log("ledger:", { credits: credits.toString(), debits: debits.toString(), derived: (credits - debits).toString(), deltaVsCached: (credits - debits - wallet.availableKobo - wallet.heldKobo).toString() });
  console.log("delta (derived - cached):", (credits - debits - wallet.availableKobo - wallet.heldKobo).toString(), "kobo");
  let running = 0n;
  for (const e of entries) {
    running += e.direction === "CREDIT" ? e.amountKobo : -e.amountKobo;
    console.log(e.createdAt.toISOString(), e.direction, e.amountKobo.toString().padStart(8), "run:", running.toString().padStart(9), "|", e.transaction.reference, "|", e.transaction.description.slice(0, 60));
  }
  await prisma.$disconnect();
})();
