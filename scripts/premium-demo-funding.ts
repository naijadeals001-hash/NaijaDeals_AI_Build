/**
 * Restores the demo customer's TEST wallet balance consumed by the Premium
 * acceptance run, using a balanced ledger transaction (cash in = cash out
 * against the SYSTEM wallet). Test funds only — the DB is TEST-classified and
 * no real money moves. Idempotent by reference.
 *
 * Usage: npx tsx scripts/premium-demo-funding.ts
 */
import { prisma } from "../lib/prisma";
import { postBalancedTransaction } from "../lib/services/core/wallet.service";
import { ensureWallet } from "../lib/payments/service";

// Default covers the Premium acceptance run; `--amount=<kobo>` funds larger
// local purchase cycles. Funds always move as a balanced ledger transaction.
const AMOUNT = BigInt(process.argv.find((arg) => arg.startsWith("--amount="))?.slice(9) ?? 150_000);
const REFERENCE = `STREAM-PREMIUM-TEST-TOPUP-${Date.now().toString(36)}`;

(async () => {
  const existing = await prisma.walletTransaction.findUnique({ where: { reference: REFERENCE }, select: { id: true } });
  if (existing) {
    console.log(JSON.stringify({ status: "already_applied", reference: REFERENCE }));
    await prisma.$disconnect();
    return;
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "customer@naijadeals.local" }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    const customer = await ensureWallet(tx, { userId: user.id, ownerType: "CUSTOMER" });
    const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
    await tx.wallet.update({ where: { id: customer.id }, data: { availableKobo: { increment: AMOUNT } } });
    await tx.wallet.update({ where: { id: platform.id }, data: { availableKobo: { decrement: AMOUNT } } });
    await postBalancedTransaction({
      tx,
      walletId: customer.id,
      type: "credit",
      amountKobo: AMOUNT,
      reference: REFERENCE,
      description: "TEST fixture: restore demo wallet balance consumed by Premium acceptance test",
      entries: [
        { walletId: platform.id, direction: "DEBIT", amountKobo: AMOUNT, memo: "Test fixture restore" },
        { walletId: customer.id, direction: "CREDIT", amountKobo: AMOUNT, memo: "Test fixture restore" }
      ]
    });
  });
  console.log(JSON.stringify({ status: "restored", amountKobo: AMOUNT.toString() }));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
