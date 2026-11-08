/**
 * One-off correction for the first e2e cleanup run, which deleted gig ledger
 * transactions without reversing wallet balances (customer wallet left 50000
 * kobo below its ledger, SYSTEM wallet left 6000 above). Posts a balanced
 * correction across the two books (wallet LedgerEntry lines + FIXTURE_EQUITY
 * AccountPosting), audited, idempotent by reference.
 *
 * Usage: npx tsx scripts/gigs-e2e-correction.ts
 */
import { PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";

const REFERENCE = "GIGS-E2E-CLEANUP-CORRECTION-1";

const db = new PrismaClient();

(async () => {
  const existing = await prisma.walletTransaction.findUnique({ where: { reference: REFERENCE } });
  if (existing) {
    console.log(JSON.stringify({ status: "already_applied" }));
    await db.$disconnect();
    return;
  }

  const customer = await prisma.wallet.findFirstOrThrow({ where: { user: { email: "customer@naijadeals.local" } } });
  const system = await prisma.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" } });
  await prisma.$transaction(async (tx) => {
    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: system.id,
        type: "credit",
        amountKobo: 50000n,
        reference: REFERENCE,
        description: "Correction: reverse NaijaGigs e2e fixture money after an incomplete first cleanup",
        ledger: {
          create: [
            { walletId: system.id, direction: "CREDIT", amountKobo: 6000n, memo: "Restore commission credit deleted with fixture ledger" },
            { walletId: customer.id, direction: "DEBIT", amountKobo: 50000n, memo: "Re-align customer wallet with ledger after fixture entry deletion" }
          ]
        }
      }
    });
    const equity = await tx.ledgerAccount.upsert({
      where: { code: "FIXTURE_EQUITY" },
      update: {},
      create: { code: "FIXTURE_EQUITY", name: "Fixture opening equity", kind: "EQUITY" }
    });
    await tx.accountPosting.create({
      data: { accountId: equity.id, transactionId: transaction.id, direction: "CREDIT", amountKobo: 44000n, memo: "Contra for deleted fixture professional earnings" }
    });
    await tx.ledgerAccount.update({ where: { id: equity.id }, data: { balanceKobo: { increment: 44000n } } });
  }, { isolationLevel: "Serializable" });

  console.log(JSON.stringify({ status: "applied", reference: REFERENCE }));
  await db.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
