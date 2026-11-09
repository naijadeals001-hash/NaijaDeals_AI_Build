import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";
import { pinHash } from "@/lib/services/send/state-machine";

/**
 * Cross-vertical logistics contract.
 *
 * A NaijaShop order stays a NaijaShop purchase, a NaijaFresh order stays a
 * NaijaFresh purchase and a NaijaEats order stays a NaijaEats order. What changes
 * is that NaijaSend executes the transport, with its own authoritative shipment
 * record resolved from the originating order.
 *
 * Identity rules:
 *  - `originVertical` is set once, at creation, from the calling vertical.
 *  - `(originVertical, sourceReference)` is unique in the database (partial index),
 *    so a second shipment for the same order is impossible even under a race.
 *  - Calling create again for the same order returns the existing shipment.
 */

export const ORIGIN_VERTICALS = ["naijasend", "naijashop", "naijafresh", "naijaeats"] as const;

export type OriginVertical = (typeof ORIGIN_VERTICALS)[number];

export type OrderSource = {
  vertical: OriginVertical;
  /** The originating order's own identifier (order number or id). */
  orderId: string;
  customerId: string;
  description: string;
  weightKg: number;
  pickupLabel: string;
  deliveryLabel: string;
  senderName: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  preferredMode?: string;
  cargoClass?: string;
};

function trackingNumber() {
  return `NSTK-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/**
 * Creates (or returns) the NaijaSend shipment for an originating order.
 * Idempotent by `(originVertical, orderId)`: calling twice never makes two
 * shipments, and the second caller receives the first shipment's identity.
 */
export async function createShipmentFromOrder(source: OrderSource) {
  if (!ORIGIN_VERTICALS.includes(source.vertical)) throw new ApiError(400, "invalid_vertical", "Unknown originating vertical.");
  if (!source.orderId) throw new ApiError(400, "order_required", "An originating order is required.");
  if (!Number.isInteger(source.weightKg) || source.weightKg < 1) throw new ApiError(400, "invalid_weight", "Weight must be at least 1 kg.");

  const existing = await prisma.logisticsShipment.findFirst({
    where: { originVertical: source.vertical, sourceReference: source.orderId },
    select: { id: true, reference: true, trackingNumber: true, transportState: true }
  });
  if (existing) return { ...existing, created: false };

  const reference = `NSH-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
  try {
    const shipment = await prisma.logisticsShipment.create({
      data: {
        reference,
        trackingNumber: trackingNumber(),
        customerId: source.customerId,
        customerKind: "individual",
        cargoClass: source.cargoClass ?? "goods",
        description: source.description.slice(0, 240),
        weightKg: source.weightKg,
        originLabel: source.pickupLabel.slice(0, 160),
        destinationLabel: source.deliveryLabel.slice(0, 160),
        senderName: source.senderName.slice(0, 120),
        senderPhone: source.senderPhone.slice(0, 40),
        recipientName: source.recipientName.slice(0, 120),
        recipientPhone: source.recipientPhone.slice(0, 40),
        preferredMode: source.preferredMode ?? null,
        originVertical: source.vertical,
        sourceVertical: source.vertical,
        sourceReference: source.orderId,
        transportState: "awaiting_quote",
        status: "open",
        events: { create: { status: "awaiting_quote", label: `Shipment requested from ${source.vertical}`, note: `Order ${source.orderId}`, actorId: source.customerId, idempotencyKey: `create:${source.vertical}:${source.orderId}` } }
      },
      select: { id: true, reference: true, trackingNumber: true, transportState: true }
    });
    await recordAudit({
      actorId: source.customerId,
      action: "shipment.created_from_order",
      entity: "LogisticsShipment",
      entityId: shipment.id,
      metadata: { originVertical: source.vertical, orderId: source.orderId }
    });
    return { ...shipment, created: true };
  } catch (error) {
    // The partial unique index wins a race: return the shipment that won.
    const raced = await prisma.logisticsShipment.findFirst({
      where: { originVertical: source.vertical, sourceReference: source.orderId },
      select: { id: true, reference: true, trackingNumber: true, transportState: true }
    });
    if (raced) return { ...raced, created: false };
    throw error;
  }
}

/**
 * Links an existing direct NaijaSend shipment to an order it is fulfilling, for
 * verticals that already created the shipment themselves (for example a food
 * delivery opened by the restaurant dispatch).
 */
export async function attachShipmentToOrder(input: { shipmentId: string; vertical: OriginVertical; orderId: string }) {
  const shipment = await prisma.logisticsShipment.findUnique({ where: { id: input.shipmentId }, select: { id: true, originVertical: true, sourceReference: true } });
  if (!shipment) throw new ApiError(404, "shipment_not_found", "Shipment not found.");
  // Origin is immutable: a shipment created by NaijaSend direct booking cannot be
  // relabelled as a NaijaFresh purchase, and vice versa.
  if (shipment.originVertical !== "naijasend" && shipment.originVertical !== input.vertical) {
    throw new ApiError(409, "origin_immutable", `This shipment belongs to ${shipment.originVertical} and cannot be re-labelled as ${input.vertical}.`);
  }
  if (shipment.sourceReference && shipment.sourceReference !== input.orderId) {
    throw new ApiError(409, "already_linked", "This shipment already fulfils another order.");
  }
  const updated = await prisma.logisticsShipment.update({
    where: { id: shipment.id },
    data: { originVertical: input.vertical, sourceVertical: input.vertical, sourceReference: input.orderId }
  });
  await recordAudit({ action: "shipment.attached_to_order", entity: "LogisticsShipment", entityId: shipment.id, metadata: { vertical: input.vertical, orderId: input.orderId } });
  return updated;
}

/**
 * Everything a customer or vertical needs to show tracking. One authoritative
 * record: every vertical resolves to this same shape.
 */
export async function getShipmentTracking(input: { trackingNumber?: string; shipmentId?: string; originVertical?: string; orderId?: string; viewerId?: string }) {
  const where = input.trackingNumber
    ? { trackingNumber: input.trackingNumber }
    : input.shipmentId
      ? { id: input.shipmentId }
      : input.originVertical && input.orderId
        ? { originVertical: input.originVertical, sourceReference: input.orderId }
        : null;
  if (!where) throw new ApiError(400, "lookup_required", "Provide a tracking number, shipment id, or origin order.");
  const shipment = await prisma.logisticsShipment.findFirst({
    where,
    include: {
      assignment: true,
      pickups: true,
      events: { orderBy: { createdAt: "asc" } },
      legs: { orderBy: { sequence: "asc" } },
      quotes: { where: { status: "accepted" }, include: { provider: { select: { name: true, providerType: true } } } }
    }
  });
  if (!shipment) return null;
  if (input.viewerId && shipment.customerId !== input.viewerId) {
    const provider = shipment.assignment?.providerId
      ? await prisma.logisticsProvider.findUnique({ where: { id: shipment.assignment.providerId }, select: { ownerId: true } })
      : null;
    if (provider?.ownerId !== input.viewerId) throw new ApiError(403, "forbidden", "This shipment belongs to another account.");
  }
  return {
    shipmentId: shipment.id,
    trackingNumber: shipment.trackingNumber,
    reference: shipment.reference,
    originVertical: shipment.originVertical,
    originOrderId: shipment.sourceReference,
    transportState: shipment.transportState,
    status: shipment.status,
    transporter: shipment.quotes[0]?.provider.name ?? null,
    transporterType: shipment.quotes[0]?.provider.providerType ?? null,
    providerId: shipment.assignment?.providerId ?? null,
    assignedAt: shipment.assignedAt,
    pickupVerifiedAt: shipment.pickupVerifiedAt,
    deliveryVerifiedAt: shipment.deliveryVerifiedAt,
    pickupLocation: shipment.originLabel,
    deliveryLocation: shipment.destinationLabel,
    vehicleType: shipment.preferredMode,
    legs: shipment.legs.map((leg) => ({ sequence: leg.sequence, mode: leg.mode, status: leg.status })),
    timeline: shipment.events.map((event) => ({ status: event.status, label: event.label, note: event.note, at: event.createdAt, simulated: event.simulated }))
  };
}

/** Encodes the pickup PIN a sender holds, for a shipment booked elsewhere. */
export function encodePin(pin: string) {
  return pinHash(pin);
}
