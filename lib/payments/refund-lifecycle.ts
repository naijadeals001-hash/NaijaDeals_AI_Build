import type { Prisma, PrismaClient } from "@prisma/client";
import { recordSystemEvent } from "@/lib/services/core/event.service";

/**
 * Explicit lifecycle for an external refund attempt.
 *
 * `Refund.status` answers one question only: has the money posted locally yet
 * (`PENDING` / `COMPLETED` / `FAILED`). It cannot express the dangerous window
 * between "we reserved the amount" and "the provider told us what happened".
 * Retrying in that window is how a customer gets paid twice, so the attempt
 * records an append-only lifecycle instead:
 *
 *   reserved   the claim is committed and `Order.refundedKobo` already caps the
 *              order; no provider request has been sent. Resubmitting is safe
 *              because the provider was never contacted.
 *   submitted  a provider request was sent. `acknowledged: true` means the
 *              provider answered with its own pending state, so the obligation
 *              is known and merely awaiting completion. An unacknowledged
 *              `submitted` event means the process may have died mid-call: the
 *              outcome is unknown and must never be resubmitted.
 *   confirmed  the provider reported the refund as completed. If the local
 *              settlement has not posted yet, the books are out of step and the
 *              retry path may settle from this evidence without calling the
 *              provider again.
 *   failed     the provider definitively rejected the request, or an operator
 *              established it was never processed. The reservation is released
 *              in the same transaction as this event.
 *   unknown    the provider outcome could not be established (transport error,
 *              timeout, 5xx or an interrupted call). The reservation stays and
 *              reconciliation must surface it; it is never automatically
 *              retried.
 *
 * The events live in `SystemEvent` with `entity = "Refund"` because adding a
 * second mutable status column to `Refund` would create two competing sources
 * of truth. `SystemEvent` is append-only and is written in the same transaction
 * as the money or reservation change it describes.
 */

export const REFUND_LIFECYCLE_EVENT = "refund.lifecycle";

export type RefundLifecycleState = "reserved" | "submitted" | "confirmed" | "failed" | "unknown";

const LIFECYCLE_STATES: readonly RefundLifecycleState[] = ["reserved", "submitted", "confirmed", "failed", "unknown"];

export type RefundLifecyclePayload = {
  state: RefundLifecycleState;
  /** Only meaningful for `submitted`: the provider acknowledged a pending refund. */
  acknowledged?: boolean;
  provider?: string | null;
  providerReference?: string | null;
  providerStatus?: string | null;
  amountKobo?: string;
  priorRefundedKobo?: string;
  escrowReleasedAtClaim?: boolean;
  note?: string | null;
};

type Db = PrismaClient | Prisma.TransactionClient;

/** Append a lifecycle transition. Callers run this inside their money transaction. */
export async function recordRefundLifecycle(
  tx: Db,
  input: { refundId: string; actorId?: string | null; payload: RefundLifecyclePayload }
) {
  const payload: Prisma.InputJsonValue = {
    state: input.payload.state,
    acknowledged: input.payload.acknowledged ?? false,
    provider: input.payload.provider ?? null,
    providerReference: input.payload.providerReference ?? null,
    providerStatus: input.payload.providerStatus ?? null,
    amountKobo: input.payload.amountKobo ?? null,
    priorRefundedKobo: input.payload.priorRefundedKobo ?? null,
    escrowReleasedAtClaim: input.payload.escrowReleasedAtClaim ?? null,
    note: input.payload.note ?? null
  };
  return recordSystemEvent({
    tx,
    type: REFUND_LIFECYCLE_EVENT,
    actorId: input.actorId ?? null,
    entity: "Refund",
    entityId: input.refundId,
    payload
  });
}

export type RefundLifecycle = {
  refundId: string;
  /** Highest-precedence persisted state, or null when no lifecycle was recorded. */
  state: RefundLifecycleState | null;
  /** True only when the provider answered the submission with its own pending state. */
  acknowledged: boolean;
  provider: string | null;
  providerReference: string | null;
  providerStatus: string | null;
  eventCount: number;
  firstEventAt: Date | null;
  lastEventAt: Date | null;
  basis: {
    amountKobo: bigint;
    priorRefundedKobo: bigint;
    escrowReleasedAtClaim: boolean;
  } | null;
};

type ParsedEvent = {
  state: RefundLifecycleState;
  acknowledged: boolean;
  provider: string | null;
  providerReference: string | null;
  providerStatus: string | null;
  amountKobo: bigint | null;
  priorRefundedKobo: bigint | null;
  escrowReleasedAtClaim: boolean | null;
  createdAt: Date;
};

const toOptionalBigInt = (value: unknown): bigint | null => {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

const toOptionalString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

function parseEvent(payload: Prisma.JsonValue | null, createdAt: Date): ParsedEvent | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  const state = row.state;
  if (typeof state !== "string" || !LIFECYCLE_STATES.includes(state as RefundLifecycleState)) return null;
  return {
    state: state as RefundLifecycleState,
    acknowledged: row.acknowledged === true,
    provider: toOptionalString(row.provider),
    providerReference: toOptionalString(row.providerReference),
    providerStatus: toOptionalString(row.providerStatus),
    amountKobo: toOptionalBigInt(row.amountKobo),
    priorRefundedKobo: toOptionalBigInt(row.priorRefundedKobo),
    escrowReleasedAtClaim: typeof row.escrowReleasedAtClaim === "boolean" ? row.escrowReleasedAtClaim : null,
    createdAt
  };
}

/**
 * Highest-precedence state. Timestamps are deliberately not used to order
 * transitions: `now()` is transaction-start time in PostgreSQL, so two events
 * serialised by the order row lock can carry timestamps in the opposite order
 * from their commit order. The lifecycle is monotonic in meaning, not in time.
 */
const STATE_PRIORITY: Record<RefundLifecycleState, number> = {
  reserved: 0,
  submitted: 1,
  unknown: 2,
  failed: 3,
  confirmed: 4
};

/** Load lifecycle state for the given refund attempts. */
export async function loadRefundLifecycles(db: Db, refundIds: string[]): Promise<Map<string, RefundLifecycle>> {
  const result = new Map<string, RefundLifecycle>();
  if (refundIds.length === 0) return result;

  const events = await db.systemEvent.findMany({
    where: {
      type: REFUND_LIFECYCLE_EVENT,
      entity: "Refund",
      entityId: { in: refundIds }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { entityId: true, payload: true, createdAt: true }
  });

  for (const event of events) {
    if (!event.entityId) continue;
    const parsed = parseEvent(event.payload, event.createdAt);
    if (!parsed) continue;
    const current = result.get(event.entityId);
    if (!current) {
      result.set(event.entityId, {
        refundId: event.entityId,
        state: parsed.state,
        acknowledged: parsed.acknowledged,
        provider: parsed.provider,
        providerReference: parsed.providerReference,
        providerStatus: parsed.providerStatus,
        eventCount: 1,
        firstEventAt: event.createdAt,
        lastEventAt: event.createdAt,
        basis:
          parsed.amountKobo !== null
            ? {
                amountKobo: parsed.amountKobo,
                priorRefundedKobo: parsed.priorRefundedKobo ?? BigInt(0),
                escrowReleasedAtClaim: parsed.escrowReleasedAtClaim === true
              }
            : null
      });
      continue;
    }

    current.eventCount += 1;
    if (event.createdAt < (current.firstEventAt ?? event.createdAt)) current.firstEventAt = event.createdAt;
    if (event.createdAt > (current.lastEventAt ?? event.createdAt)) current.lastEventAt = event.createdAt;
    if (parsed.provider) current.provider = parsed.provider;
    if (parsed.providerReference) current.providerReference = parsed.providerReference;
    if (parsed.providerStatus) current.providerStatus = parsed.providerStatus;
    if (parsed.amountKobo !== null && !current.basis) {
      current.basis = {
        amountKobo: parsed.amountKobo,
        priorRefundedKobo: parsed.priorRefundedKobo ?? BigInt(0),
        escrowReleasedAtClaim: parsed.escrowReleasedAtClaim === true
      };
    }
    // Acknowledged submission is monotonic: an acknowledgement cannot be
    // retracted, it can only be superseded by a later definitive state.
    if (parsed.state === "submitted" && parsed.acknowledged) current.acknowledged = true;
    if (STATE_PRIORITY[parsed.state] > STATE_PRIORITY[current.state ?? "reserved"]) {
      current.state = parsed.state;
    }
  }

  return result;
}

export async function loadRefundLifecycle(db: Db, refundId: string): Promise<RefundLifecycle | null> {
  const map = await loadRefundLifecycles(db, [refundId]);
  return map.get(refundId) ?? null;
}

/** True when a persisted submission never received a provider acknowledgement. */
export function isUnacknowledgedSubmission(lifecycle: RefundLifecycle | null): boolean {
  return lifecycle?.state === "submitted" && !lifecycle.acknowledged;
}
