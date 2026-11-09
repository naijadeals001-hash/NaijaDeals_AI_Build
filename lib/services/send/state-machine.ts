import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";

/**
 * NaijaSend transport state machine.
 *
 * The rule this module exists to enforce: a shipment belongs to NaijaSend only
 * when there is a verified booking, a recorded assignment and a verified pickup —
 * never because a driver pressed a button.
 *
 * Every transition validates, in this order:
 *   1. the shipment exists and the caller may act on it;
 *   2. the assignment record exists, is not revoked, and names this provider;
 *   3. the required evidence exists (a PIN the customer was given, or a sender
 *      confirmation);
 *   4. the current state permits the move;
 *   5. the version the caller saw is still current (optimistic concurrency);
 *   6. the same transition has not already been applied (idempotency key).
 *
 * Pickup and delivery rows are unique per shipment in the database, so a second
 * confirmation cannot be written even by a concurrent request.
 */

export const TRANSPORT_STATES = [
  "created",
  "awaiting_quote",
  "quoted",
  "booked",
  "awaiting_assignment",
  "assigned",
  "en_route_to_pickup",
  "arrived_at_pickup",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "arrived_at_destination",
  "delivered",
  "completed",
  "cancelled",
  "failed_pickup",
  "delivery_failed",
  "delayed",
  "disputed"
] as const;

export type TransportState = (typeof TRANSPORT_STATES)[number];

/** Allowed forward moves. Anything not listed is an invalid jump. */
const TRANSITIONS: Record<string, string[]> = {
  created: ["awaiting_quote", "cancelled"],
  awaiting_quote: ["quoted", "cancelled"],
  quoted: ["booked", "cancelled"],
  booked: ["awaiting_assignment", "assigned", "cancelled"],
  awaiting_assignment: ["assigned", "cancelled"],
  assigned: ["en_route_to_pickup", "failed_pickup", "cancelled"],
  en_route_to_pickup: ["arrived_at_pickup", "failed_pickup"],
  arrived_at_pickup: ["picked_up", "failed_pickup"],
  picked_up: ["in_transit"],
  in_transit: ["out_for_delivery", "arrived_at_destination", "delayed"],
  delayed: ["in_transit"],
  out_for_delivery: ["arrived_at_destination", "delivery_failed"],
  arrived_at_destination: ["delivered", "delivery_failed"],
  delivered: ["completed", "disputed"],
  completed: []
};

export function pinHash(pin: string) {
  return createHash("sha256").update(pin).digest("hex");
}

/**
 * Internal states a client may request. The legacy shipment status
 * (open/quoting/booked/in_transit/delivered/completed) is derived from these so
 * existing pages keep working.
 */
export const STATE_TO_SHIPMENT_STATUS: Record<string, string> = {
  created: "open",
  awaiting_quote: "open",
  quoted: "quoting",
  booked: "booked",
  awaiting_assignment: "booked",
  assigned: "booked",
  en_route_to_pickup: "booked",
  arrived_at_pickup: "booked",
  picked_up: "in_transit",
  in_transit: "in_transit",
  out_for_delivery: "in_transit",
  arrived_at_destination: "in_transit",
  delayed: "in_transit",
  delivered: "delivered",
  completed: "completed",
  cancelled: "cancelled",
  failed_pickup: "cancelled",
  delivery_failed: "in_transit",
  disputed: "delivered"
};

export type ShipmentBundle = Awaited<ReturnType<typeof loadShipment>>;

export async function loadShipment(shipmentId: string) {
  const shipment = await prisma.logisticsShipment.findUnique({
    where: { id: shipmentId },
    include: {
      assignment: true,
      pickups: true,
      legs: { orderBy: { sequence: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
      quotes: { where: { status: "accepted" }, include: { provider: { select: { id: true, name: true, providerType: true } } } }
    }
  });
  if (!shipment) throw new ApiError(404, "shipment_not_found", "Shipment not found.");
  return shipment;
}

/**
 * Resolves which provider (if any) the caller controls for this shipment. A
 * caller is only a provider for a shipment when the assignment record names a
 * provider they own. Being logged in as any provider is not enough.
 */
async function resolveProviderFor(actorId: string, providerId: string | null | undefined) {
  if (!providerId) return null;
  const provider = await prisma.logisticsProvider.findUnique({ where: { id: providerId }, select: { id: true, ownerId: true, status: true } });
  if (!provider || provider.ownerId !== actorId) return null;
  return provider;
}

export type TransitionActor =
  | { kind: "provider"; userId: string }
  | { kind: "customer"; userId: string }
  | { kind: "sender"; userId: string }
  | { kind: "admin"; userId: string };

/**
 * Moves a shipment to `to` after all checks pass.
 * `evidence` carries the customer's PIN or a sender confirmation reference.
 */
export async function transitionShipment(input: {
  shipmentId: string;
  to: string;
  actor: TransitionActor;
  expectedVersion: number;
  idempotencyKey: string;
  pin?: string;
  note?: string;
  simulated?: boolean;
}) {
  if (!TRANSPORT_STATES.includes(input.to as TransportState)) throw new ApiError(400, "invalid_state", "Unknown shipment state.");
  if (!input.idempotencyKey || input.idempotencyKey.length < 8) throw new ApiError(400, "idempotency_required", "An idempotency key is required for this action.");

  return prisma.$transaction(async (tx) => {
    // Lock the row first so two concurrent actions cannot both read the same
    // version and then both succeed. The loser waits, then fails the version check.
    await tx.$executeRaw`SELECT id FROM "LogisticsShipment" WHERE id = ${input.shipmentId} FOR UPDATE`;
    const shipment = await tx.logisticsShipment.findUnique({
      where: { id: input.shipmentId },
      include: { assignment: true, pickups: true, quotes: { where: { status: "accepted" }, select: { id: true, providerId: true } } }
    });
    if (!shipment) throw new ApiError(404, "shipment_not_found", "Shipment not found.");

    const current = (shipment as unknown as { transportState?: string }).transportState ?? deriveState(shipment);

    // --- 6. idempotency: the same key already applied this move -------------
    const replay = await tx.shipmentEvent.findFirst({ where: { shipmentId: shipment.id, idempotencyKey: input.idempotencyKey }, select: { id: true, status: true } });
    if (replay) return { shipmentId: shipment.id, state: replay.status, version: shipment.version, replayed: true };

    // --- 5. optimistic concurrency ----------------------------------------
    if (input.expectedVersion !== shipment.version) {
      throw new ApiError(409, "stale_version", "This shipment changed since you loaded it. Refresh and try again.");
    }

    // --- 2. actor authority -----------------------------------------------
    if (input.actor.kind === "provider") {
      const provider = await resolveProviderFor(input.actor.userId, shipment.assignment?.providerId);
      if (!provider) throw new ApiError(403, "not_assigned", "You are not the assigned transporter for this shipment.");
      if (shipment.assignment?.revokedAt) throw new ApiError(403, "assignment_revoked", "Your assignment for this shipment has been revoked.");
    } else if (input.actor.kind === "customer") {
      if (shipment.customerId !== input.actor.userId) throw new ApiError(403, "forbidden", "This shipment belongs to another account.");
    } else if (input.actor.kind === "sender") {
      // A sender/seller may only confirm pickup at the origin, not move goods.
      if (input.to !== "picked_up") throw new ApiError(403, "not_allowed", "A sender can only confirm pickup at the origin.");
    } else if (input.actor.kind !== "admin") {
      throw new ApiError(403, "forbidden", "Not permitted.");
    }

    // --- 4. legal move -----------------------------------------------------
    if (!(TRANSITIONS[current] ?? []).includes(input.to)) {
      throw new ApiError(409, "invalid_transition", `A shipment that is ${current.replace(/_/g, " ")} cannot move to ${input.to.replace(/_/g, " ")}.`);
    }

    // --- 3. evidence -------------------------------------------------------
    if (input.to === "picked_up") {
      if (!shipment.assignment || shipment.assignment.revokedAt) {
        throw new ApiError(409, "no_assignment", "This shipment has no active transporter assignment, so pickup cannot be verified.");
      }
      if (shipment.pickups.length > 0) throw new ApiError(409, "already_picked_up", "This shipment has already been picked up.");
      const pin = (input.pin ?? "").trim();
      if (!pin) throw new ApiError(400, "pin_required", "Enter the pickup PIN from the sender.");
      const expected = shipment.assignedPickupPinHash;
      if (!expected || pinHash(pin) !== expected) throw new ApiError(400, "invalid_pin", "That pickup PIN is incorrect.");
    }
    if (input.to === "delivered") {
      const pin = (input.pin ?? "").trim();
      if (!shipment.assignment) throw new ApiError(409, "no_assignment", "This shipment has no transporter assignment.");
      if (!pin || pinHash(pin) !== shipment.assignment.deliveryPinHash) throw new ApiError(400, "invalid_pin", "That delivery PIN is incorrect.");
      if (shipment.pickups.length === 0) throw new ApiError(409, "not_picked_up", "Goods must be picked up before delivery can be verified.");
    }

    // --- apply -------------------------------------------------------------
    if (input.to === "picked_up") {
      await tx.shipmentPickup.create({
        data: { shipmentId: shipment.id, actorId: input.actor.userId, method: "pin", providerId: shipment.assignment!.providerId, note: input.note ?? null }
      });
    }
    await tx.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        status: input.to,
        label: STATE_LABELS[input.to] ?? input.to,
        note: input.note ?? null,
        actorId: input.actor.userId,
        idempotencyKey: input.idempotencyKey,
        simulated: Boolean(input.simulated)
      }
    });
    const updated = await tx.logisticsShipment.update({
      where: { id: shipment.id, version: shipment.version },
      data: {
        version: { increment: 1 },
        transportState: input.to,
        status: STATE_TO_SHIPMENT_STATUS[input.to] ?? shipment.status,
        ...(input.to === "picked_up" ? { pickupVerifiedAt: new Date() } : {}),
        ...(input.to === "delivered" || input.to === "completed" ? { deliveryVerifiedAt: new Date() } : {})
      }
    }).catch(() => {
      throw new ApiError(409, "stale_version", "This shipment changed while the action was being saved. Refresh and try again.");
    });

    await recordAudit({
      tx,
      actorId: input.actor.userId,
      action: `shipment.${input.to}`,
      entity: "LogisticsShipment",
      entityId: shipment.id,
      metadata: { from: current, to: input.to, origin: shipment.originVertical, simulated: Boolean(input.simulated) }
    });
    return { shipmentId: updated.id, state: input.to, version: updated.version, replayed: false };
  });
}

/** Derives the transport state for legacy rows created before this machine. */
function deriveState(shipment: { status: string; pickups: unknown[] }) {
  if (shipment.status === "cancelled") return "cancelled";
  if (shipment.status === "completed") return "completed";
  if (shipment.status === "delivered") return "delivered";
  if (shipment.pickups.length) return "in_transit";
  if (shipment.status === "in_transit") return "in_transit";
  if (shipment.status === "booked") return "assigned";
  return "awaiting_quote";
}

export const STATE_LABELS: Record<string, string> = {
  created: "Shipment created",
  awaiting_quote: "Awaiting quotes",
  quoted: "Quotes received",
  booked: "Booked",
  awaiting_assignment: "Awaiting transporter",
  assigned: "Transporter assigned",
  en_route_to_pickup: "En route to pickup",
  arrived_at_pickup: "Arrived at pickup",
  picked_up: "Goods picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  arrived_at_destination: "Arrived at destination",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  failed_pickup: "Pickup failed",
  delivery_failed: "Delivery failed",
  delayed: "Delayed",
  disputed: "Disputed"
};

/** Customer-facing sentence used by originating verticals. */
export function customerSentence(state: string, transporter?: string | null) {
  if (state === "picked_up" || state === "in_transit" || state === "out_for_delivery") return `Your order is on the way with NaijaSend${transporter ? ` — ${transporter}` : ""}.`;
  if (state === "delivered" || state === "completed") return "Your order was delivered and confirmed.";
  if (state === "assigned" || state === "en_route_to_pickup" || state === "arrived_at_pickup") return "NaijaSend has assigned a transporter to collect your order.";
  return "Your order is with NaijaSend for transport.";
}
