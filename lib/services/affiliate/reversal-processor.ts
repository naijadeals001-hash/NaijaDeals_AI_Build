import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/infra/logger";
import { reverseConversion } from "./settlement";

/**
 * Refund-reversal processor.
 *
 * Confirmed refunds write an `AffiliateReversalIntent` inside the refund
 * transaction. This module claims those intents and turns each into a commission
 * adjustment, independently of the customer's refund.
 *
 * Idempotency has two layers, and the second one is what makes a crash safe:
 *  1. the intent row is unique per refund and moves PENDING → DONE;
 *  2. the reversal posts a wallet transaction whose `reference` is derived from
 *     the intent id, and `WalletTransaction.reference` is `@unique`. A replay
 *     after a crash between posting and marking DONE therefore collides on the
 *     reference instead of reversing twice.
 *
 * Lease fencing is used for concurrency, not for correctness: a stale worker may
 * lose its lease, but it still cannot double-post because of the reference.
 */

const LEASE_SECONDS = 120;
const BACKOFF_MS = [15_000, 60_000, 300_000, 900_000, 1_800_000, 3_600_000];

export const RECONCILIATION_ACTION = "affiliate.reversal_intent_failed";

export type ProcessResult = { claimed: number; done: number; retried: number; dead: number; recovered: number };

export function reversalReferenceFor(intentId: string): string {
  return `AFF-REVINT-${intentId}`;
}

/** Returns expired PROCESSING leases to PENDING so a crash cannot strand work. */
export async function recoverExpiredIntents(): Promise<number> {
  const result = await prisma.affiliateReversalIntent.updateMany({
    where: { state: "PROCESSING", leaseExpiresAt: { lt: new Date() } },
    data: { state: "PENDING", leaseToken: null, leaseExpiresAt: null, lastError: "lease_expired_recovered" }
  });
  return result.count;
}

export async function processReversalIntents(
  owner: string,
  limit = 25,
  /** Test-only seam: throws after the financial commit, before the intent is DONE. */
  hooks: { failBeforeDone?: boolean } = {}
): Promise<ProcessResult> {
  const recovered = await recoverExpiredIntents();
  const token = randomUUID();

  const claimed = await prisma.$transaction(async (tx) => {
    const due = await tx.affiliateReversalIntent.findMany({
      where: { state: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true }
    });
    if (due.length === 0) return [];
    await tx.affiliateReversalIntent.updateMany({
      where: { id: { in: due.map((row) => row.id) }, state: "PENDING" },
      data: {
        state: "PROCESSING",
        leaseToken: token,
        leaseExpiresAt: new Date(Date.now() + LEASE_SECONDS * 1000),
        attempts: { increment: 1 }
      }
    });
    return tx.affiliateReversalIntent.findMany({ where: { leaseToken: token } });
  });

  let done = 0;
  let retried = 0;
  let dead = 0;

  for (const intent of claimed) {
    try {
      const conversion = await prisma.affiliateConversion.findFirst({
        where: { entityType: "Order", entityId: intent.orderId },
        orderBy: { createdAt: "desc" }
      });

      if (!conversion) {
        // No attributed conversion: nothing to reverse. Not a failure.
        await finish(intent.id, token, { state: "DONE", processedAt: new Date(), lastError: "no_attributed_conversion" });
        done += 1;
        continue;
      }

      // Fail closed: no eligible allocation means the charge-back cannot be computed
      // without charging commission on components the affiliate was never paid on.
      if (intent.eligibleKobo === null || !intent.allocationPolicy) {
        await finish(intent.id, token, { state: "FAILED", lastError: "review_required:missing_allocation" });
        dead += 1;
        log.warn("affiliate.reversal_needs_review", { intentId: intent.id, orderId: intent.orderId });
        continue;
      }

      // Cumulative rounding: the target is computed from the running total of
      // eligible refunds, and only the difference from what earlier refunds already
      // reversed is applied. Rounding each refund independently would drift.
      const prior = await prisma.affiliateReversalIntent.findMany({
        where: {
          orderId: intent.orderId,
          state: "DONE",
          eligibleKobo: { not: null },
          createdAt: { lt: intent.createdAt }
        },
        select: { eligibleKobo: true }
      });
      const priorEligible = prior.reduce((sum, row) => sum + (row.eligibleKobo ?? 0n), 0n);
      const bps = BigInt(conversion.commissionBps);
      const targetCumulative = ((priorEligible + intent.eligibleKobo) * bps) / 10_000n;
      const priorTarget = (priorEligible * bps) / 10_000n;
      const proportional = targetCumulative - priorTarget;
      if (proportional <= 0n) {
        await finish(intent.id, token, { state: "DONE", processedAt: new Date(), lastError: "zero_adjustment" });
        done += 1;
        continue;
      }

      const outcome = await reverseConversion({
        actorId: null,
        conversionId: conversion.id,
        amountKobo: proportional,
        reason: `Refund confirmed for order ${intent.orderId}`,
        idempotencyKey: reversalReferenceFor(intent.id)
      });

      // A refusal is not a completed adjustment. Settlement holds the conversion
      // in PAYING inside its transaction, so a reversal that arrives during that
      // window must be retried: the next sweep sees PAID and applies the settled
      // branch. Anything else is a terminal conflict that needs review, because
      // marking it DONE would silently discard a real charge-back.
      if (!outcome.reversed) {
        if (outcome.reason === "state_not_reversible") {
          const exhausted = intent.attempts >= intent.maxAttempts;
          await finish(intent.id, token, {
            state: exhausted ? "FAILED" : "PENDING",
            lastError: exhausted ? "review_required:settlement_contended" : "retry:settlement_contended"
          });
          if (exhausted) dead += 1;
          else retried += 1;
          continue;
        }
        await finish(intent.id, token, {
          state: "FAILED",
          lastError: `review_required:reversal_refused:${outcome.reason}`
        });
        dead += 1;
        continue;
      }

      if (hooks.failBeforeDone) throw new Error("injected_failure_before_done");

      await finish(intent.id, token, { state: "DONE", processedAt: new Date(), lastError: null });
      done += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "unknown";

      // A unique-reference collision means this intent already posted its
      // reversal before the crash: the work is done, not duplicated.
      if (message.includes("Unique constraint") || message.includes("P2002")) {
        await finish(intent.id, token, { state: "DONE", processedAt: new Date(), lastError: "replayed_after_post" });
        done += 1;
        continue;
      }

      const exhausted = intent.attempts >= intent.maxAttempts;
      await finish(intent.id, token, {
        state: exhausted ? "FAILED" : "PENDING",
        lastError: message
      });
      if (exhausted) dead += 1;
      else retried += 1;

      log.warn("affiliate.reversal_intent_failed", {
        intentId: intent.id,
        orderId: intent.orderId,
        attempts: intent.attempts,
        exhausted,
        error: message
      });
    }
  }

  if (claimed.length > 0) log.info("affiliate.reversal_batch", { claimed: claimed.length, done, retried, dead, recovered });
  return { claimed: claimed.length, done, retried, dead, recovered };
}

/** Fenced completion: only the lease holder can finish the row. */
async function finish(
  id: string,
  token: string,
  data: { state: "DONE" | "PENDING" | "FAILED"; processedAt?: Date; lastError: string | null }
) {
  await prisma.affiliateReversalIntent.updateMany({
    where: { id, leaseToken: token, state: "PROCESSING" },
    data: { ...data, leaseToken: null, leaseExpiresAt: null }
  });
}

/** Terminal failures, for reconciliation rather than silent loss. */
export async function listFailedIntents(limit = 50) {
  return prisma.affiliateReversalIntent.findMany({
    where: { state: "FAILED" },
    orderBy: { updatedAt: "desc" },
    take: limit
  });
}
