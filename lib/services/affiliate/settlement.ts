import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { postBalancedTransaction } from "@/lib/services/core/wallet.service";
import { ensureWallet } from "@/lib/payments/service";
import { recordAudit } from "@/lib/services/core/audit.service";

/**
 * Affiliate settlement and reversal.
 *
 * Accrual (recordConversion) creates a liability record but posts nothing. This
 * module is the only place that moves money, and it moves it through the shared
 * NaijaPay ledger.
 *
 * Crash safety: claim, ledger post and reference save happen in ONE database
 * transaction. A conditional state update on its own would leave a conversion
 * stuck in PAYING if the process died after claiming but before posting, or
 * worse, post the ledger and then fail to record the reference so a retry posts
 * again. Inside a transaction both either happen or neither does.
 *
 * Idempotency: the ledger reference is derived from the conversion id, so a
 * retry that somehow reaches the ledger twice would collide on the reference
 * rather than credit twice. The state guard is the first line; the reference is
 * the second.
 */

const SETTLEABLE: string[] = ["APPROVED", "PAYABLE"];

export type SettlementResult =
  | { settled: true; conversionId: string; ledgerReference: string; amountKobo: string }
  | { settled: false; reason: string };

/**
 * Settles one approved conversion into the affiliate's NaijaPay wallet.
 *
 * Wallet settlement is not an external payout: the affiliate still requests a
 * payout through the existing payout flow to move funds out.
 */
export async function settleConversion(input: { actorId: string; conversionId: string }): Promise<SettlementResult> {
  const conversion = await prisma.affiliateConversion.findUnique({
    where: { id: input.conversionId },
    include: { affiliate: true }
  });
  if (!conversion) throw new ApiError(404, "conversion_not_found", "That conversion does not exist.");
  if (!SETTLEABLE.includes(conversion.state)) {
    return { settled: false, reason: `state_${conversion.state.toLowerCase()}` };
  }
  if (conversion.affiliate.status !== "APPROVED") {
    return { settled: false, reason: "affiliate_not_approved" };
  }
  if (conversion.reversibleUntil && conversion.reversibleUntil > new Date()) {
    // Hold period still running: eligible later, not now.
    return { settled: false, reason: "hold_period_active" };
  }

  const reference = `AFF-COMM-${conversion.id}`;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // Claim inside the transaction: only one caller can move this row to PAYING.
      const claimed = await tx.affiliateConversion.updateMany({
        where: { id: conversion.id, state: { in: SETTLEABLE as Prisma.EnumConversionStateFilter["in"] } },
        data: { state: "PAYING" }
      });
      if (claimed.count === 0) return { settled: false as const, reason: "already_claimed" };

      const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
      const affiliateWallet = await ensureWallet(tx, { userId: conversion.affiliate.userId, ownerType: "CUSTOMER" });

      await tx.wallet.update({
        where: { id: affiliateWallet.id },
        data: { availableKobo: { increment: conversion.amountKobo } }
      });
      await tx.wallet.update({
        where: { id: platform.id },
        data: { availableKobo: { decrement: conversion.amountKobo } }
      });

      const transaction = await postBalancedTransaction({
        tx,
        actorId: input.actorId,
        walletId: affiliateWallet.id,
        type: "credit",
        amountKobo: conversion.amountKobo,
        reference,
        description: `Affiliate commission for ${conversion.entityType} ${conversion.entityId}`,
        entries: [
          { walletId: platform.id, direction: "DEBIT", amountKobo: conversion.amountKobo, memo: "Affiliate commission payable" },
          { walletId: affiliateWallet.id, direction: "CREDIT", amountKobo: conversion.amountKobo, memo: "Affiliate commission settled" }
        ]
      });

      await tx.affiliateConversion.update({
        where: { id: conversion.id },
        data: { state: "PAID", ledgerReference: transaction.reference }
      });

      return {
        settled: true as const,
        conversionId: conversion.id,
        ledgerReference: transaction.reference,
        amountKobo: conversion.amountKobo.toString()
      };
    });

    if (outcome.settled) {
      await recordAudit({
        actorId: input.actorId,
        action: "affiliate.commission_settled",
        entity: "AffiliateConversion",
        entityId: conversion.id,
        metadata: { amountKobo: conversion.amountKobo.toString(), ledgerReference: outcome.ledgerReference }
      });
    }
    return outcome;
  } catch (error) {
    // Reference collision means this conversion already reached the ledger.
    if ((error as Prisma.PrismaClientKnownRequestError).code === "P2002") {
      return { settled: false, reason: "already_settled" };
    }
    throw error;
  }
}

export type ReversalResult =
  | { reversed: true; conversionId: string; amountKobo: string; cumulativeReversedKobo: string; ledgerReference: string | null }
  | { reversed: false; reason: string };

/**
 * Reverses all or part of a commission, before or after settlement.
 *
 * Before settlement there is no money to move: the row is marked REVERSED and
 * the campaign budget is released, because the commission was never paid.
 * After settlement a compensating ledger entry moves the money back. Reversal is
 * bounded by the original amount: cumulative reversals can never exceed it, and
 * the wallet is only debited by what it can actually cover.
 */
export async function reverseConversion(input: {
  actorId: string;
  conversionId: string;
  amountKobo: bigint;
  reason: string;
  releaseBudget?: boolean;
  /** Stable reference so a replayed reversal collides instead of double-posting. */
  idempotencyKey?: string;
}): Promise<ReversalResult> {
  const conversion = await prisma.affiliateConversion.findUnique({
    where: { id: input.conversionId },
    include: { affiliate: true, campaign: true }
  });
  if (!conversion) throw new ApiError(404, "conversion_not_found", "That conversion does not exist.");
  if (input.amountKobo <= 0n) return { reversed: false, reason: "invalid_amount" };

  const alreadyReversed = await prisma.affiliateConversion.aggregate({
    where: { entityId: conversion.entityId, entityType: conversion.entityType, state: "REVERSED" },
    _sum: { amountKobo: true }
  });
  const cumulative = alreadyReversed._sum.amountKobo ?? 0n;
  const remaining = conversion.amountKobo - cumulative - input.amountKobo;
  if (remaining < 0n) return { reversed: false, reason: "exceeds_original" };

  const settled = conversion.state === "PAID" && Boolean(conversion.ledgerReference);

  if (!settled) {
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.affiliateConversion.updateMany({
        where: { id: conversion.id, state: { in: ["TRACKED", "VALIDATING", "APPROVED", "PAYABLE", "DISPUTED"] } },
        data: {
          state: remaining === 0n ? "REVERSED" : conversion.state,
          reason: input.reason.slice(0, 300)
        }
      });
      if (claimed.count === 0) return false;
      if (input.releaseBudget !== false) {
        await tx.affiliateCampaign.update({
          where: { id: conversion.campaignId },
          data: { spentKobo: { decrement: input.amountKobo } }
        });
      }
      return true;
    });
    if (!updated) return { reversed: false, reason: "state_not_reversible" };
    await recordAudit({
      actorId: input.actorId,
      action: "affiliate.commission_reversed_unsettled",
      entity: "AffiliateConversion",
      entityId: conversion.id,
      metadata: { amountKobo: input.amountKobo.toString(), reason: input.reason, budgetReleased: input.releaseBudget !== false }
    });
    return {
      reversed: true,
      conversionId: conversion.id,
      amountKobo: input.amountKobo.toString(),
      cumulativeReversedKobo: (cumulative + input.amountKobo).toString(),
      ledgerReference: null
    };
  }

  const reference = input.idempotencyKey ?? `AFF-REV-${conversion.id}-${randomUUID().slice(0, 8)}`;
  const outcome = await prisma.$transaction(async (tx) => {
    const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
    const affiliateWallet = await ensureWallet(tx, { userId: conversion.affiliate.userId, ownerType: "CUSTOMER" });
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: affiliateWallet.id } });

    // Recovery is bounded by what the wallet holds, but a wallet balance must not
    // decide whether a valid reversal is recorded. Whatever is available is taken;
    // the remainder becomes debt. With nothing available, no money moves and no
    // zero-value transaction is created.
    const recoverable = wallet.availableKobo < input.amountKobo ? wallet.availableKobo : input.amountKobo;
    const shortfall = input.amountKobo - recoverable;

    let journalReference: string | null = null;
    if (recoverable > 0n) {
      await tx.wallet.update({ where: { id: affiliateWallet.id }, data: { availableKobo: { decrement: recoverable } } });
      await tx.wallet.update({ where: { id: platform.id }, data: { availableKobo: { increment: recoverable } } });

      const transaction = await postBalancedTransaction({
        tx,
        actorId: input.actorId,
        walletId: affiliateWallet.id,
        type: "debit",
        amountKobo: recoverable,
        reference,
        description: `Affiliate commission reversal for ${conversion.entityType} ${conversion.entityId}`,
        entries: [
          { walletId: affiliateWallet.id, direction: "DEBIT", amountKobo: recoverable, memo: "Commission reversed" },
          { walletId: platform.id, direction: "CREDIT", amountKobo: recoverable, memo: "Commission recovered" }
        ]
      });
      journalReference = transaction.reference;
    }

    await tx.affiliateConversion.update({
      where: { id: conversion.id },
      data: {
        state: remaining === 0n ? "REVERSED" : conversion.state,
        reason: input.reason.slice(0, 300),
        ...(journalReference ? { ledgerReference: journalReference } : {})
      }
    });

    // Shortfall becomes a receivable rather than a silent loss. One open record
    // per conversion: a second partial reversal tops it up instead of creating a
    // duplicate receivable that could be collected twice.
    if (shortfall > 0n) {
      const open = await tx.affiliateRecovery.findFirst({
        where: { conversionId: conversion.id, state: "OUTSTANDING" }
      });
      if (open) {
        await tx.affiliateRecovery.update({
          where: { id: open.id },
          data: { amountKobo: { increment: shortfall } }
        });
      } else {
        await tx.affiliateRecovery.create({
          data: {
            conversionId: conversion.id,
            affiliateId: conversion.affiliateId,
            amountKobo: shortfall,
            note: input.reason.slice(0, 300)
          }
        });
      }
    }

    return { ok: true as const, reference: journalReference, recovered: recoverable, shortfall };
  });

  await recordAudit({
    actorId: input.actorId,
    action: "affiliate.commission_reversed_settled",
    entity: "AffiliateConversion",
    entityId: conversion.id,
    metadata: {
      requestedKobo: input.amountKobo.toString(),
      recoveredKobo: outcome.recovered.toString(),
      shortfallKobo: (input.amountKobo - outcome.recovered).toString(),
      ledgerReference: outcome.reference,
      reason: input.reason
    }
  });

  return {
    reversed: true,
    conversionId: conversion.id,
    amountKobo: outcome.recovered.toString(),
    cumulativeReversedKobo: (cumulative + outcome.recovered).toString(),
    ledgerReference: outcome.reference
  };
}
