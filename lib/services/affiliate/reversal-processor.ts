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

export async function processReversalIntents(owner: string, limit = 25): Promise<ProcessResult> {
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

      // Adjust from the frozen rule, not from today's campaign settings.
      const proportional = (intent.amountKobo * BigInt(conversion.commissionBps)) / 10_000n;
      if (proportional <= 0n) {
        await finish(intent.id, token, { state: "DONE", processedAt: new Date(), lastError: "zero_adjustment" });
        done += 1;
        continue;
      }

      await reverseConversion({
        actorId: null,
        conversionId: conversion.id,
        amountKobo: proportional,
        reason: `Refund confirmed for order ${intent.orderId}`,
        idempotencyKey: reversalReferenceFor(intent.id)
      });

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
