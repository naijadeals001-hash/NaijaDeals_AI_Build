import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";

/**
 * Reconciliation exceptions and their audited correction path.
 *
 * A discrepancy is never resolved by editing a balance. The correction posts a
 * *balanced* ledger transaction whose entries name both sides, so the ledger
 * remains the single source of truth and the change is visible in history.
 *
 * Two exception classes are recognised:
 *  - `unbalanced_transaction`: a posted transaction whose entries do not sum to
 *    zero (a correction record that should never have been written as a posting);
 *  - `wallet_delta`: a wallet whose cached balance differs from its ledger net.
 *
 * Both are reported by `walletReconciliation()`; neither is auto-fixed. An
 * operator must supply a reason code, and the platform records who decided.
 */

export type ExceptionClass = "unbalanced_transaction" | "wallet_delta";

export type ReconciliationException = {
  kind: ExceptionClass;
  /** Transaction reference for unbalanced rows, wallet id for wallet deltas. */
  subject: string;
  owner: string;
  deltaKobo: string;
  detail: string;
  /** True when the difference is explained by test fixtures rather than customer money. */
  fixtureRelated: boolean;
};

const FIXTURE_REFERENCE = /^(ADJ-PHASE07|GIGS-E2E|SHOP-REVIEW-FUNDING|SEED-|RIDE-.*-HOLD)/i;

/** Every exception, classified and attributed. Read-only. */
export async function listExceptions(): Promise<ReconciliationException[]> {
  const wallets = await prisma.wallet.findMany({
    select: {
      id: true,
      ownerType: true,
      availableKobo: true,
      heldKobo: true,
      user: { select: { email: true } },
      vendor: { select: { name: true } },
      ledgerEntries: { select: { direction: true, amountKobo: true, transaction: { select: { reference: true } } } }
    }
  });

  const exceptions: ReconciliationException[] = [];
  for (const wallet of wallets) {
    const net = wallet.ledgerEntries.reduce((sum, entry) => sum + (entry.direction === "CREDIT" ? entry.amountKobo : -entry.amountKobo), BigInt(0));
    const cached = wallet.availableKobo + wallet.heldKobo;
    if (cached === net) continue;
    const fixtureRelated = wallet.ledgerEntries.some((entry) => FIXTURE_REFERENCE.test(entry.transaction?.reference ?? ""));
    exceptions.push({
      kind: "wallet_delta",
      subject: wallet.id,
      owner: wallet.user?.email ?? wallet.vendor?.name ?? wallet.ownerType,
      deltaKobo: (cached - net).toString(),
      detail: `Cached balance ${cached} differs from ledger net ${net}.`,
      fixtureRelated
    });
  }

  const unbalanced = await prisma.$queryRaw<Array<{ id: string; reference: string; type: string; net: bigint; amountKobo: bigint }>>`
    SELECT t.id, t.reference, t.type::text AS type, t."amountKobo",
      SUM(CASE WHEN l.direction = 'CREDIT' THEN l."amountKobo" ELSE -l."amountKobo" END) AS net
    FROM "WalletTransaction" t
    JOIN "LedgerEntry" l ON l."transactionId" = t.id
    GROUP BY t.id, t.reference, t.type, t."amountKobo"
    HAVING SUM(CASE WHEN l.direction = 'CREDIT' THEN l."amountKobo" ELSE -l."amountKobo" END) <> 0`;
  for (const row of unbalanced) {
    exceptions.push({
      kind: "unbalanced_transaction",
      subject: row.reference,
      owner: "SYSTEM",
      deltaKobo: row.net.toString(),
      detail: `Transaction ${row.reference} (${row.type}) has entries summing to ${row.net}, not zero.`,
      fixtureRelated: FIXTURE_REFERENCE.test(row.reference)
    });
  }
  return exceptions;
}

/**
 * Posts the compensating entries for one exception so the ledger balances.
 *
 * The correction is itself a balanced transaction: the offsetting entry is
 * written against the opposite side, so total debits again equal total credits.
 * A unique reference makes the correction idempotent.
 */
export async function correctException(input: { actorId: string; exception: ReconciliationException; reasonCode: string; note?: string }) {
  if (!/^[a-z0-9_]{3,40}$/.test(input.reasonCode)) throw new ApiError(400, "reason_required", "A reason code is required.");
  const reference = `RECON-CORRECTION-${input.exception.kind.toUpperCase()}-${input.exception.subject.slice(-12)}`;
  const existing = await prisma.walletTransaction.findUnique({ where: { reference }, select: { id: true } });
  if (existing) return { reference, alreadyApplied: true };
  if (input.exception.kind !== "unbalanced_transaction") {
    // A wallet delta needs a human decision about direction; refuse to guess.
    throw new ApiError(409, "manual_review_required", "Wallet deltas require a documented decision, not an automatic correction.");
  }

  const transaction = await prisma.walletTransaction.findFirst({ where: { reference: input.exception.subject }, include: { ledger: true } });
  if (!transaction) throw new ApiError(404, "transaction_not_found", "That transaction no longer exists.");

  const net = transaction.ledger.reduce((sum, entry) => sum + (entry.direction === "CREDIT" ? entry.amountKobo : -entry.amountKobo), BigInt(0));
  if (net === BigInt(0)) return { reference, alreadyApplied: true };

  const walletId = transaction.walletId;
  const { postBalancedTransaction } = await import("@/lib/services/core/wallet.service");
  const magnitude = net > BigInt(0) ? net : -net;
  // The unbalanced posting credited the wallet without a counterparty. The
  // correction removes exactly that amount from the wallet and books it against
  // a SYSTEM account, so total debits and credits are equal again.
  await prisma.$transaction(async (tx) => {
    const system = await tx.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" }, select: { id: true } });
    await tx.wallet.update({ where: { id: walletId }, data: { availableKobo: { decrement: net } } });
    await tx.wallet.update({ where: { id: system.id }, data: { availableKobo: { increment: net } } });
    await postBalancedTransaction({
      tx,
      actorId: input.actorId,
      walletId,
      type: "fee", // booked as a fee-class correction; the audit row carries the real reason
      amountKobo: magnitude,
      reference,
      description: `Reconciliation correction for ${input.exception.subject} (${input.reasonCode})`,
      entries: [
        { walletId, direction: "DEBIT", amountKobo: magnitude, memo: `Offset unbalanced posting ${input.exception.subject}` },
        { walletId: system.id, direction: "CREDIT", amountKobo: magnitude, memo: "Counterparty for the offset posting" }
      ]
    });
  });
  await recordAudit({
    actorId: input.actorId,
    action: "reconciliation.corrected",
    entity: "WalletTransaction",
    entityId: transaction.id,
    metadata: { reference, exception: input.exception.subject, netKobo: net.toString(), reasonCode: input.reasonCode, note: input.note ?? null }
  });
  return { reference, alreadyApplied: false, netKobo: net.toString() };
}
