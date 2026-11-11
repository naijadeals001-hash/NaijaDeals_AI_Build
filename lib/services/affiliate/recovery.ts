import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { postBalancedTransaction } from "@/lib/services/core/wallet.service";
import { ensureWallet } from "@/lib/payments/service";
import { recordAudit } from "@/lib/services/core/audit.service";

/**
 * Collection and write-off of affiliate commission shortfalls.
 *
 * A shortfall exists when a reversal could not recover the full amount because
 * the affiliate had already spent it. `AffiliateRecovery` holds the debt; this
 * module is the only place that settles it.
 *
 * Design constraints:
 *  - Collection is bounded twice: by the outstanding debt and by the affiliate's
 *    available balance. A wallet is never overdrawn to satisfy a receivable.
 *  - Each collection posts a balanced ledger entry and is recorded as an
 *    append-only audit row carrying that journal reference, so partial payments
 *    leave a traceable history. A single overwritten `ledgerReference` column
 *    would lose every partial after the first.
 *  - The claim is a conditional update inside a database transaction, so two
 *    concurrent collectors cannot both take the same outstanding amount.
 *  - Write-off is an explicit, permission-gated decision with its own audit row.
 *    It does not move money: it records that the platform has stopped pursuing
 *    the debt.
 */

export type CollectionResult =
  | { collected: true; recoveryId: string; collectedKobo: string; outstandingKobo: string; ledgerReference: string }
  | { collected: false; reason: string };

export async function collectRecovery(input: {
  actorId: string;
  recoveryId: string;
  amountKobo: bigint;
}): Promise<CollectionResult> {
  if (input.amountKobo <= 0n) return { collected: false, reason: "invalid_amount" };

  const recovery = await prisma.affiliateRecovery.findUnique({ where: { id: input.recoveryId } });
  if (!recovery) throw new ApiError(404, "recovery_not_found", "That recovery record does not exist.");
  // AffiliateRecovery stores affiliateId without a Prisma relation, so the wallet
  // owner is resolved explicitly rather than through an include.
  const affiliate = await prisma.affiliateProfile.findUniqueOrThrow({
    where: { id: recovery.affiliateId },
    select: { userId: true }
  });
  if (recovery.state !== "OUTSTANDING") return { collected: false, reason: `state_${recovery.state.toLowerCase()}` };

  const outstanding = recovery.amountKobo - recovery.collectedKobo - recovery.offsetKobo;
  if (outstanding <= 0n) return { collected: false, reason: "fully_collected" };

  const requested = input.amountKobo < outstanding ? input.amountKobo : outstanding;

  const outcome = await prisma.$transaction(async (tx) => {
    const affiliateWallet = await ensureWallet(tx, { userId: affiliate.userId, ownerType: "CUSTOMER" });
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: affiliateWallet.id } });
    const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });

    // Bounded by what the wallet actually holds: recovering more than exists
    // would create a negative balance, which the platform does not allow.
    const amount = wallet.availableKobo < requested ? wallet.availableKobo : requested;
    if (amount <= 0n) return { ok: false as const, reason: "no_available_funds" };

    // Conditional claim: only one caller can move this much of the outstanding
    // debt, so two concurrent collections cannot both take it.
    const claimed = await tx.affiliateRecovery.updateMany({
      where: { id: recovery.id, state: "OUTSTANDING", collectedKobo: recovery.collectedKobo, offsetKobo: recovery.offsetKobo },
      data: {
        collectedKobo: { increment: amount },
        state: recovery.collectedKobo + amount + recovery.offsetKobo >= recovery.amountKobo ? "COLLECTED" : "OUTSTANDING"
      }
    });
    if (claimed.count === 0) return { ok: false as const, reason: "contended" };

    await tx.wallet.update({ where: { id: wallet.id }, data: { availableKobo: { decrement: amount } } });
    await tx.wallet.update({ where: { id: platform.id }, data: { availableKobo: { increment: amount } } });

    const reference = `AFF-REC-${recovery.id}-${Date.now().toString(36)}`;
    const transaction = await postBalancedTransaction({
      tx,
      actorId: input.actorId,
      walletId: wallet.id,
      type: "debit",
      amountKobo: amount,
      reference,
      description: `Affiliate commission shortfall recovery ${recovery.id}`,
      entries: [
        { walletId: wallet.id, direction: "DEBIT", amountKobo: amount, memo: "Commission shortfall recovered" },
        { walletId: platform.id, direction: "CREDIT", amountKobo: amount, memo: "Commission shortfall recovered" }
      ]
    });

    await tx.affiliateRecovery.update({
      where: { id: recovery.id },
      data: { ledgerReference: transaction.reference }
    });

    return { ok: true as const, amount, reference: transaction.reference };
  });

  if (!outcome.ok) return { collected: false, reason: outcome.reason };

  await recordAudit({
    actorId: input.actorId,
    action: "affiliate.recovery_collected",
    entity: "AffiliateRecovery",
    entityId: recovery.id,
    metadata: {
      amountKobo: outcome.amount.toString(),
      ledgerReference: outcome.reference,
      requestedKobo: input.amountKobo.toString()
    }
  });

  const after = await prisma.affiliateRecovery.findUniqueOrThrow({ where: { id: recovery.id } });
  return {
    collected: true,
    recoveryId: recovery.id,
    collectedKobo: outcome.amount.toString(),
    outstandingKobo: (after.amountKobo - after.collectedKobo - after.offsetKobo).toString(),
    ledgerReference: outcome.reference
  };
}

export async function writeOffRecovery(input: { actorId: string; recoveryId: string; reason: string }) {
  const recovery = await prisma.affiliateRecovery.findUnique({ where: { id: input.recoveryId } });
  if (!recovery) throw new ApiError(404, "recovery_not_found", "That recovery record does not exist.");
  if (recovery.state !== "OUTSTANDING") {
    return { writtenOff: false as const, reason: `state_${recovery.state.toLowerCase()}` };
  }

  const written = await prisma.affiliateRecovery.updateMany({
    where: { id: recovery.id, state: "OUTSTANDING" },
    data: { state: "WRITTEN_OFF", note: input.reason.slice(0, 300) }
  });
  if (written.count === 0) return { writtenOff: false as const, reason: "contended" };

  await recordAudit({
    actorId: input.actorId,
    action: "affiliate.recovery_written_off",
    entity: "AffiliateRecovery",
    entityId: recovery.id,
    metadata: {
      writtenOffKobo: (recovery.amountKobo - recovery.collectedKobo).toString(),
      collectedKobo: recovery.collectedKobo.toString(),
      reason: input.reason
    }
  });

  return { writtenOff: true as const, outstandingKobo: (recovery.amountKobo - recovery.collectedKobo).toString() };
}

/** Debt, collections and write-offs, derived from records rather than a counter. */
export async function recoverySummary(affiliateId?: string) {
  const where: Prisma.AffiliateRecoveryWhereInput = affiliateId ? { affiliateId } : {};
  const rows = await prisma.affiliateRecovery.groupBy({
    by: ["state"],
    where,
    _sum: { amountKobo: true, collectedKobo: true },
    _count: { _all: true }
  });
  const collections = await prisma.auditLog.count({
    where: { action: "affiliate.recovery_collected", ...(affiliateId ? { entity: "AffiliateRecovery" } : {}) }
  });
  return {
    byState: Object.fromEntries(
      rows.map((row) => [
        row.state,
        {
          count: row._count._all,
          amountKobo: (row._sum.amountKobo ?? 0n).toString(),
          collectedKobo: (row._sum.collectedKobo ?? 0n).toString()
        }
      ])
    ),
    collectionEntries: collections
  };
}
