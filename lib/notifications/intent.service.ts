import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/infra/logger";
import { infraMetrics } from "@/lib/infra/metrics";
import { notifyShipmentStatus } from "./domain-events";
import { deliverNotification, notify } from "@/lib/services/core/notification-delivery.service";

/**
 * Transactional notification outbox.
 *
 * The intent row is written inside the business transaction, so a rollback
 * removes the shipment change and the intent together. Delivery happens later
 * in the worker, which is why no provider call ever sits inside a transaction.
 *
 * Processing is at-least-once: claiming is a single `FOR UPDATE SKIP LOCKED`
 * update, and every completion is fenced on the lease token, so a worker whose
 * lease expired cannot overwrite the result of the worker that took over.
 */

const LEASE_SECONDS = 120;
const BACKOFF_MS = [15_000, 60_000, 300_000, 900_000, 3_600_000];

export type IntentPayload = Record<string, unknown>;

type Tx = PrismaClient | Prisma.TransactionClient;

export type IntentInput = {
  dedupeKey: string;
  eventType: string;
  entityType: string;
  entityId: string;
  recipientUserId: string;
  payload: IntentPayload;
  scheduledAt?: Date;
};

/**
 * Records the intent inside the caller's transaction. A duplicate key returns
 * false instead of throwing, so a retried request is a no-op rather than an
 * error for the customer.
 */
export async function enqueueIntent(tx: Tx, input: IntentInput): Promise<boolean> {
  try {
    await tx.notificationIntent.create({
      data: {
        dedupeKey: input.dedupeKey,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        recipientUserId: input.recipientUserId,
        payload: input.payload as Prisma.InputJsonValue,
        payloadVersion: 1,
        nextAttemptAt: input.scheduledAt ?? new Date()
      }
    });
    infraMetrics().queueJobs.inc({ queue: "notifications", event: "intent_enqueued" });
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return false;
    throw error;
  }
}

export type ClaimedIntent = {
  id: string;
  leaseToken: string;
  dedupeKey: string;
  eventType: string;
  entityType: string;
  entityId: string;
  recipientUserId: string;
  payload: IntentPayload;
  attempts: number;
  maxAttempts: number;
};

/**
 * Claims up to `limit` due intents in one statement. SKIP LOCKED is what makes
 * two workers take disjoint batches instead of blocking or double-claiming.
 */
export async function claimIntents(owner: string, limit = 25): Promise<{ token: string; rows: ClaimedIntent[] }> {
  const token = randomUUID();
  const now = new Date();

  // The eligibility filter runs through Prisma's typed query, not raw SQL.
  // A raw date parameter is bound as timestamptz and re-interpreted against the
  // timestamp(3) column, which made a due row compare as not due (a row that
  // findMany matched, $queryRaw did not). Typed filters avoid that mismatch.
  const candidates = await prisma.notificationIntent.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true }
  });
  if (candidates.length === 0) return { token, rows: [] };

  // Atomic claim: the conditional status check means a row can be claimed once.
  // Two workers may race here, but only one update matches each row, and the
  // unique lease token tells us which rows this worker actually won.
  await prisma.notificationIntent.updateMany({
    where: { id: { in: candidates.map((row) => row.id) }, status: "PENDING" },
    data: {
      status: "CLAIMED",
      leaseOwner: owner,
      leaseToken: token,
      leaseExpiresAt: new Date(now.getTime() + LEASE_SECONDS * 1000),
      attempts: { increment: 1 }
    }
  });

  const rows = await prisma.notificationIntent.findMany({ where: { leaseToken: token } });
  return {
    token,
    rows: rows.map((row) => ({
      id: row.id,
      leaseToken: token,
      dedupeKey: row.dedupeKey,
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      recipientUserId: row.recipientUserId,
      payload: (row.payload ?? {}) as IntentPayload,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts
    }))
  };
}

/** Fenced completion: only the lease holder can finalise the row. */
async function finish(id: string, token: string, data: Prisma.NotificationIntentUpdateManyMutationInput): Promise<boolean> {
  const result = await prisma.notificationIntent.updateMany({
    where: { id, leaseToken: token, status: "CLAIMED" },
    data: { ...data, leaseOwner: null, leaseToken: null, leaseExpiresAt: null }
  });
  return result.count === 1;
}

async function deliver(intent: ClaimedIntent): Promise<void> {
  switch (intent.eventType) {
    case "shipment.booked":
    case "shipment.in_transit":
    case "shipment.delivered":
    case "shipment.completed":
    case "shipment.cancelled":
      await notifyShipmentStatus(
        {
          id: intent.entityId,
          reference: String(intent.payload.reference ?? intent.entityId),
          customerId: intent.recipientUserId
        },
        String(intent.payload.label ?? intent.eventType.replace("shipment.", ""))
      );
      return;
    case "support.ticket.created": {
      // Staff alert for a new support ticket. Dedupe key derives from the
      // intent, so a retry after a crash between delivery and completion cannot
      // create a second notification.
      const created = await notify({
        userId: intent.recipientUserId,
        channel: "IN_APP",
        templateKey: "support.ticket_created",
        eventType: "support.ticket.created",
        entityType: intent.entityType,
        entityId: intent.entityId,
        data: {
          reference: String(intent.payload.reference ?? ""),
          subject: String(intent.payload.subject ?? ""),
          vertical: String(intent.payload.vertical ?? "general")
        },
        dedupeKey: `notification:${intent.dedupeKey}`
      });
      if (created.notification.status === "SUPPRESSED") return;
      const outcome = await deliverNotification(created.notification.id);
      if (outcome.status === "FAILED" || outcome.status === "missing") {
        throw new Error(`notification_delivery_${outcome.status}:${outcome.error ?? "unknown"}`);
      }
      return;
    }
    case "order.paid.vendor": {
      // The vendor notification is recorded in the payment transaction as an
      // intent, not written through a nested Prisma client. Delivery happens
      // here, after the financial transaction has committed.
      const created = await notify({
        userId: intent.recipientUserId,
        channel: "IN_APP",
        templateKey: "order.paid.vendor",
        eventType: "order.paid.vendor",
        entityType: intent.entityType,
        entityId: intent.entityId,
        data: {
          orderNumber: String(intent.payload.orderNumber ?? ""),
          href: String(intent.payload.href ?? "/seller")
        },
        dedupeKey: `notification:${intent.dedupeKey}`
      });
      if (created.notification.status === "SUPPRESSED") return;
      const outcome = await deliverNotification(created.notification.id);
      // A skipped delivery is already SENT (a retry replayed the same intent) or
      // not due yet. A FAILED delivery is surfaced so the intent is retried and
      // eventually reported DEAD instead of being marked processed silently.
      if (outcome.status === "FAILED" || outcome.status === "missing") {
        throw new Error(`notification_delivery_${outcome.status}:${outcome.error ?? "unknown"}`);
      }
      return;
    }
    default:
      throw new Error(`unsupported_intent_event:${intent.eventType}`);
  }
}

export type IntentRun = { claimed: number; processed: number; retried: number; dead: number; recovered: number };

/** Recovers leases abandoned by a crashed worker. */
export async function recoverExpiredLeases(): Promise<number> {
  const result = await prisma.notificationIntent.updateMany({
    where: { status: "CLAIMED", leaseExpiresAt: { lt: new Date() } },
    data: {
      status: "PENDING",
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      lastError: "lease_expired_recovered"
    }
  });
  return result.count;
}

export async function processIntents(owner: string, limit = 25): Promise<IntentRun> {
  const recovered = await recoverExpiredLeases();
  const { token, rows } = await claimIntents(owner, limit);

  let processed = 0;
  let retried = 0;
  let dead = 0;

  for (const intent of rows) {
    try {
      // Idempotency comes from the engine's dedupeKey, so a retry after a crash
      // between delivery and completion produces one notification, not two.
      await deliver(intent);
      const done = await finish(intent.id, token, {
        status: "PROCESSED",
        processedAt: new Date(),
        lastError: null
      });
      if (done) processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "unknown";
      const permanent = message.startsWith("unsupported_intent_event");
      const exhausted = intent.attempts >= intent.maxAttempts;
      const backoff = BACKOFF_MS[Math.min(Math.max(intent.attempts - 1, 0), BACKOFF_MS.length - 1)];

      await finish(intent.id, token, {
        status: permanent || exhausted ? "DEAD" : "PENDING",
        lastError: message,
        nextAttemptAt: new Date(Date.now() + backoff)
      });

      if (permanent || exhausted) dead += 1;
      else retried += 1;

      log.warn("intent.failed", {
        intentId: intent.id,
        eventType: intent.eventType,
        attempts: intent.attempts,
        permanent,
        error: message
      });
    }
  }

  if (rows.length) {
    log.info("intent.batch", { claimed: rows.length, processed, retried, dead, recovered });
  }
  return { claimed: rows.length, processed, retried, dead, recovered };
}
