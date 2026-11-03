import { prisma } from "@/lib/prisma";

type Db = typeof prisma;

/**
 * Apply a PREPARED ledger adjustment atomically.
 * The SYSTEM wallet ledger is credited but its stored balance is not changed (the
 * adjustment aligns the ledger to the already-stored balance), and FIXTURE_EQUITY
 * receives the balancing debit. The status transition and both postings commit together.
 */
export async function applyLedgerAdjustment(adjustmentKey: string, actor: string, client: Db = prisma) {
  return client.$transaction(async (tx) => {
    const adjustment = await tx.ledgerAdjustment.findUnique({ where: { adjustmentKey }, include: { postings: true } });
    if (!adjustment) throw new Error("adjustment_not_found");
    if (adjustment.status === "APPLIED") return { status: "already_applied", adjustmentId: adjustment.id };
    const lines = (adjustment.journal as { lines?: Array<{ walletId?: string; account?: string; entry: string; amountKobo: string; memo?: string }> }).lines ?? [];
    const walletLine = lines.find((line) => line.walletId && line.entry === "CREDIT");
    const accountLine = lines.find((line) => line.account === "FIXTURE_EQUITY" && line.entry === "DEBIT");
    if (!walletLine?.walletId || !accountLine) throw new Error("invalid_adjustment_journal");
    const amount = BigInt(accountLine.amountKobo);
    if (BigInt(walletLine.amountKobo) !== amount) throw new Error("unbalanced_adjustment_journal");
    const account = await tx.ledgerAccount.findUnique({ where: { code: "FIXTURE_EQUITY" } });
    if (!account) throw new Error("contra_account_missing");

    const claimed = await tx.ledgerAdjustment.updateMany({
      where: { id: adjustment.id, status: "PREPARED" },
      data: { status: "APPLIED", appliedAt: new Date(), appliedBy: actor }
    });
    if (claimed.count !== 1) {
      const current = await tx.ledgerAdjustment.findUniqueOrThrow({ where: { id: adjustment.id } });
      return { status: current.status === "APPLIED" ? "already_applied" : "not_applicable", adjustmentId: current.id };
    }

    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: walletLine.walletId,
        type: "credit",
        amountKobo: amount,
        reference: `ADJ-${adjustmentKey}`,
        description: `Ledger adjustment ${adjustmentKey}`,
        ledger: { create: [{ walletId: walletLine.walletId, direction: "CREDIT", amountKobo: amount, memo: walletLine.memo ?? "Ledger adjustment credit" }] }
      }
    });
    await tx.accountPosting.create({
      data: {
        accountId: account.id,
        adjustmentId: adjustment.id,
        transactionId: transaction.id,
        direction: "DEBIT",
        amountKobo: amount,
        memo: accountLine.memo ?? "Fixture equity contra"
      }
    });
    await tx.ledgerAccount.update({ where: { id: account.id }, data: { balanceKobo: { decrement: amount } } });
    return { status: "applied", adjustmentId: adjustment.id, transactionId: transaction.id };
  }, { isolationLevel: "Serializable" });
}
