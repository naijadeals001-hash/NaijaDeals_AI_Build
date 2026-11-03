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


/** Validate each adjustment journal across LedgerEntry and AccountPosting. */
export async function reconcileAdjustmentJournals(client: Db = prisma) {
  const adjustments = await client.ledgerAdjustment.findMany({ include: { postings: true } });
  const issues: string[] = [];
  const rows = [];
  for (const adjustment of adjustments) {
    const transaction = await client.walletTransaction.findFirst({
      where: { reference: `ADJ-${adjustment.adjustmentKey}` },
      include: { ledger: true }
    });
    const walletCredits = transaction?.ledger.filter((e) => e.direction === "CREDIT").reduce((sum, e) => sum + e.amountKobo, 0n) ?? 0n;
    const walletDebits = transaction?.ledger.filter((e) => e.direction === "DEBIT").reduce((sum, e) => sum + e.amountKobo, 0n) ?? 0n;
    const accountDebits = adjustment.postings.filter((p) => p.direction === "DEBIT").reduce((sum, p) => sum + p.amountKobo, 0n);
    const accountCredits = adjustment.postings.filter((p) => p.direction === "CREDIT").reduce((sum, p) => sum + p.amountKobo, 0n);
    const totalCredits = walletCredits + accountCredits;
    const totalDebits = walletDebits + accountDebits;
    const status = adjustment.status;
    const linked = adjustment.postings.every((p) => p.transactionId === transaction?.id && p.adjustmentId === adjustment.id);
    const valid = status === "PREPARED"
      ? !transaction && adjustment.postings.length === 0
      : status === "APPLIED" && Boolean(transaction) && adjustment.postings.length === 1 && totalCredits === totalDebits && linked && Boolean(adjustment.appliedAt);
    if (!valid) issues.push(adjustment.adjustmentKey);
    rows.push({
      key: adjustment.adjustmentKey, status, appliedAt: adjustment.appliedAt,
      walletCredits: walletCredits.toString(), walletDebits: walletDebits.toString(),
      accountDebits: accountDebits.toString(), accountCredits: accountCredits.toString(),
      totalCredits: totalCredits.toString(), totalDebits: totalDebits.toString(),
      postings: adjustment.postings.length, linked, valid
    });
  }
  return { adjustments: adjustments.length, issues, rows };
}
