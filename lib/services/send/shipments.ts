import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";
import { pinHash } from "@/lib/services/send/state-machine";

/**
 * NaijaSend shipment lifecycle.
 *
 * NaijaSend is a marketplace: customers request shipments, independent providers
 * quote them, and the customer books exactly one quote. NaijaSend never sets a
 * price on a provider's behalf, never claims to operate a vehicle, and never
 * marks a shipment delivered unless every leg is complete.
 *
 * Status flow:
 *   open ─┬─> quoting ─┬─> booked ─> in_transit ─> delivered ─> completed
 *         │            └─> cancelled / expired
 *         └─> in_transit (direct ground dispatch with one accepted quote)
 *
 * Money: the customer pays the accepted quote from their NaijaPay wallet; the
 * funds sit on the platform ledger until delivery, then settle once, guarded by
 * a unique reference (see settleShipment).
 */

export const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  open: "Open for quotes",
  quoting: "Quotes received",
  booked: "Booked",
  in_transit: "In transit",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired"
};

/** Every transport mode the marketplace lists. */
export const TRANSPORT_MODES = ["motorcycle", "car", "van", "truck", "air", "sea", "rail", "warehouse"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const MODE_LABELS: Record<string, string> = {
  motorcycle: "Motorcycle delivery",
  car: "Car transport",
  van: "Van transport",
  truck: "Truck transport",
  air: "Air cargo",
  sea: "Sea freight",
  rail: "Rail logistics",
  warehouse: "Warehousing"
};

export const CARGO_CLASSES = ["parcel", "goods", "freight", "bulk"] as const;
export const PROVIDER_TYPES = ["courier", "car", "van", "truck", "fleet", "air", "sea", "rail", "warehouse", "forwarder", "logistics"] as const;

export const QUOTE_TTL_MS = 72 * 60 * 60 * 1000;
/** Recorded default service fee inherited from the shared ledger; not a new rate. */
const PLATFORM_FEE_BPS = BigInt(500);
const PROVIDER_BPS = BigInt(10000) - PLATFORM_FEE_BPS;

function reference(prefix = "NSH") {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function text(value: unknown, field: string, max = 160) {
  const out = typeof value === "string" ? value.trim() : "";
  if (!out) throw new ApiError(400, "validation_error", `${field} is required.`);
  if (out.length > max) throw new ApiError(400, "validation_error", `${field} must be at most ${max} characters.`);
  return out;
}

function pins() {
  const make = () => String(Math.floor(100000 + Math.random() * 900000));
  return { pickupPin: make(), deliveryPin: make() };
}

/** Creates a shipment request. No price is attached: providers quote it. */
export async function createShipment(input: {
  customerId: string;
  cargoClass: string;
  cargoCategory?: string;
  description: string;
  weightKg: number;
  quantity?: number;
  dimensions?: string;
  declaredValueKobo?: string;
  handling?: string;
  originLabel: string;
  originCountry?: string;
  destinationLabel: string;
  destinationCountry?: string;
  senderName: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  pickupDate?: string;
  preferredMode?: string;
  customerKind?: string;
  sourceVertical?: string;
  sourceReference?: string;
}) {
  if (!CARGO_CLASSES.includes(input.cargoClass as (typeof CARGO_CLASSES)[number])) {
    throw new ApiError(400, "invalid_cargo", "Choose goods/cargo, parcel, freight or bulk/farm.");
  }
  if (!Number.isInteger(input.weightKg) || input.weightKg <= 0 || input.weightKg > 400000) {
    throw new ApiError(400, "invalid_weight", "Weight must be a whole number between 1 and 400,000 kg.");
  }
  if (input.preferredMode && !TRANSPORT_MODES.includes(input.preferredMode as TransportMode)) {
    throw new ApiError(400, "invalid_mode", "Choose a valid transport mode.");
  }
  const origin = text(input.originLabel, "Pickup location", 160);
  const destination = text(input.destinationLabel, "Delivery location", 160);
  const description = text(input.description, "Cargo description", 240);
  const ref = reference();
  // Every shipment is identifiable from creation, before any quote exists.
  const tracking = `NSTK-${ref.replace(/^NSH-/, "")}`;

  const shipment = await prisma.logisticsShipment.create({
    data: {
      reference: ref,
      trackingNumber: tracking,
      customerId: input.customerId,
      customerKind: input.customerKind ?? "individual",
      cargoClass: input.cargoClass,
      cargoCategory: input.cargoCategory?.trim() || null,
      description,
      weightKg: input.weightKg,
      quantity: input.quantity && input.quantity > 0 ? input.quantity : 1,
      dimensions: input.dimensions?.trim() || null,
      declaredValueKobo: BigInt(input.declaredValueKobo ?? "0") > BigInt(0) ? BigInt(input.declaredValueKobo ?? "0") : BigInt(0),
      handling: input.handling?.trim() || null,
      originLabel: origin,
      originCountry: text(input.originCountry ?? "Nigeria", "Origin country", 60),
      destinationLabel: destination,
      destinationCountry: text(input.destinationCountry ?? "Nigeria", "Destination country", 60),
      senderName: text(input.senderName, "Sender name", 120),
      senderPhone: text(input.senderPhone, "Sender phone", 40),
      recipientName: text(input.recipientName, "Recipient name", 120),
      recipientPhone: text(input.recipientPhone, "Recipient phone", 40),
      pickupDate: input.pickupDate ? new Date(input.pickupDate) : null,
      preferredMode: input.preferredMode ?? null,
      originVertical: input.sourceVertical ?? "naijasend",
      transportState: "awaiting_quote",
      sourceVertical: input.sourceVertical ?? null,
      sourceReference: input.sourceReference ?? null,
      events: { create: { status: "open", label: "Shipment requested", note: "Waiting for itemised quotes from verified providers.", actorId: input.customerId } }
    }
  });
  await recordAudit({
    actorId: input.customerId,
    action: "shipment.requested",
    entity: "LogisticsShipment",
    entityId: shipment.id,
    metadata: { reference: ref, cargoClass: shipment.cargoClass, weightKg: shipment.weightKg, origin, destination }
  });
  return shipment;
}

/** Quotes visible to one provider, for its dashboard queue. */
export async function listOpenShipmentsForProvider(providerId: string) {
  const provider = await prisma.logisticsProvider.findUnique({
    where: { id: providerId },
    select: { id: true, providerType: true, country: true, status: true }
  });
  if (!provider) throw new ApiError(404, "provider_not_found", "Provider not found.");
  if (provider.status !== "verified") return [];

  const quoted = await prisma.shipmentQuote.findMany({ where: { providerId }, select: { shipmentId: true } });
  const quotedIds = quoted.map((row) => row.shipmentId);
  return prisma.logisticsShipment.findMany({
    where: {
      status: { in: ["open", "quoting"] },
      id: { notIn: quotedIds.length ? quotedIds : ["none"] },
      ...(provider.country ? { OR: [{ originCountry: provider.country }, { destinationCountry: provider.country }] } : {})
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      reference: true,
      cargoClass: true,
      description: true,
      weightKg: true,
      quantity: true,
      originLabel: true,
      originCountry: true,
      destinationLabel: true,
      destinationCountry: true,
      pickupDate: true,
      preferredMode: true,
      createdAt: true
    }
  });
}

/** A provider submits its own quotation. One live quote per provider per shipment. */
export async function submitQuote(input: { providerId: string; actorId: string; shipmentId: string; amountKobo: string; transitDays: number; modes: string[]; message?: string }) {
  const provider = await prisma.logisticsProvider.findUnique({ where: { id: input.providerId }, select: { id: true, ownerId: true, status: true, capacityKg: true } });
  if (!provider) throw new ApiError(404, "provider_not_found", "Provider not found.");
  if (provider.ownerId !== input.actorId) throw new ApiError(403, "forbidden", "This provider belongs to another account.");
  if (provider.status !== "verified") throw new ApiError(403, "provider_unverified", "Only verified providers can quote.");

  const shipment = await prisma.logisticsShipment.findUnique({ where: { id: input.shipmentId }, select: { id: true, status: true, weightKg: true, preferredMode: true } });
  if (!shipment) throw new ApiError(404, "shipment_not_found", "Shipment not found.");
  if (!["open", "quoting"].includes(shipment.status)) throw new ApiError(409, "shipment_closed", "This shipment is no longer accepting quotes.");
  if (provider.capacityKg && shipment.weightKg > provider.capacityKg) {
    throw new ApiError(409, "capacity_exceeded", `This shipment (${shipment.weightKg} kg) exceeds your registered capacity of ${provider.capacityKg} kg.`);
  }
  const amount = BigInt(input.amountKobo ?? "0");
  if (amount <= BigInt(0)) throw new ApiError(400, "invalid_amount", "Enter your price for this shipment.");
  const modes = (input.modes ?? []).filter((mode) => TRANSPORT_MODES.includes(mode as TransportMode));
  if (!modes.length) throw new ApiError(400, "modes_required", "State which transport mode(s) your quote covers.");
  if (!Number.isInteger(input.transitDays) || input.transitDays < 1 || input.transitDays > 120) {
    throw new ApiError(400, "invalid_transit", "Transit time must be between 1 and 120 days.");
  }

  const quote = await prisma.shipmentQuote.upsert({
    where: { shipmentId_providerId: { shipmentId: shipment.id, providerId: provider.id } },
    update: { amountKobo: amount, transitDays: input.transitDays, modes, message: input.message?.slice(0, 400) ?? null, status: "offered", expiresAt: new Date(Date.now() + QUOTE_TTL_MS) },
    create: { shipmentId: shipment.id, providerId: provider.id, amountKobo: amount, transitDays: input.transitDays, modes, message: input.message?.slice(0, 400) ?? null, expiresAt: new Date(Date.now() + QUOTE_TTL_MS) }
  });
  if (shipment.status === "open") await prisma.logisticsShipment.update({ where: { id: shipment.id }, data: { status: "quoting" } });
  await recordAudit({ actorId: input.actorId, action: "shipment.quoted", entity: "LogisticsShipment", entityId: shipment.id, metadata: { providerId: provider.id, amountKobo: amount.toString(), modes } });
  return quote;
}

/** Quotes the customer can compare. Expired quotes are closed on read. */
export async function listQuotesForShipment(shipmentId: string, customerId: string) {
  const shipment = await prisma.logisticsShipment.findUnique({ where: { id: shipmentId }, select: { customerId: true } });
  if (!shipment) throw new ApiError(404, "shipment_not_found", "Shipment not found.");
  if (shipment.customerId !== customerId) throw new ApiError(403, "forbidden", "This shipment belongs to another account.");
  await prisma.shipmentQuote.updateMany({ where: { shipmentId, status: "offered", expiresAt: { lt: new Date() } }, data: { status: "expired" } });
  return prisma.shipmentQuote.findMany({
    where: { shipmentId },
    orderBy: { amountKobo: "asc" },
    include: { provider: { select: { id: true, name: true, providerType: true, status: true, country: true, operatingCities: true, capacityKg: true, sourcePlatform: true } } }
  });
}

/**
 * Books one accepted quote and charges the customer's NaijaPay wallet.
 * Every competing quote is declined in the same transaction so a shipment can
 * never hold two accepted quotes.
 */
export async function bookShipment(input: { customerId: string; shipmentId: string; quoteId: string }) {
  const shipment = await prisma.logisticsShipment.findUnique({ where: { id: input.shipmentId }, select: { id: true, reference: true, trackingNumber: true, customerId: true, status: true } });
  if (!shipment) throw new ApiError(404, "shipment_not_found", "Shipment not found.");
  if (shipment.customerId !== input.customerId) throw new ApiError(403, "forbidden", "This shipment belongs to another account.");
  if (!["open", "quoting"].includes(shipment.status)) throw new ApiError(409, "already_booked", "This shipment is no longer open for booking.");

  return prisma.$transaction(async (tx) => {
    const quote = await tx.shipmentQuote.findUnique({
      where: { id: input.quoteId },
      include: { provider: { select: { id: true, ownerId: true, name: true, status: true } } }
    });
    if (!quote || quote.shipmentId !== shipment.id) throw new ApiError(404, "quote_not_found", "That quote does not belong to this shipment.");
    if (quote.status !== "offered") throw new ApiError(409, "quote_closed", "That quote is no longer available.");
    if (quote.expiresAt.getTime() < Date.now()) {
      await tx.shipmentQuote.update({ where: { id: quote.id }, data: { status: "expired" } });
      throw new ApiError(409, "quote_expired", "That quote has expired. Request a fresh quote from the provider.");
    }
    if (quote.provider.status !== "verified") throw new ApiError(409, "provider_unverified", "This provider is no longer verified.");
    if (quote.provider.ownerId === input.customerId) throw new ApiError(400, "self_booking", "You cannot book your own provider.");

    const claimed = await tx.logisticsShipment.updateMany({ where: { id: shipment.id, status: { in: ["open", "quoting"] } }, data: { status: "booked" } });
    if (claimed.count === 0) throw new ApiError(409, "already_booked", "Another quote has just been booked for this shipment.");

    const { ensureWallet } = await import("@/lib/payments/service");
    const { postBalancedTransaction } = await import("@/lib/services/core/wallet.service");
    const buyerWallet = await ensureWallet(tx, { userId: input.customerId, ownerType: "CUSTOMER" });
    const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: buyerWallet.id } });
    if (wallet.availableKobo < quote.amountKobo) throw new ApiError(402, "insufficient_funds", "Your NaijaPay balance does not cover this shipment. Top up your wallet first.");

    await tx.wallet.update({ where: { id: buyerWallet.id }, data: { availableKobo: { decrement: quote.amountKobo } } });
    await tx.wallet.update({ where: { id: platform.id }, data: { heldKobo: { increment: quote.amountKobo } } });
    await postBalancedTransaction({
      tx,
      actorId: input.customerId,
      walletId: buyerWallet.id,
      type: "debit",
      amountKobo: quote.amountKobo,
      reference: `SEND-${shipment.reference}`,
      description: `NaijaSend booking ${shipment.reference}`,
      entries: [
        { walletId: buyerWallet.id, direction: "DEBIT", amountKobo: quote.amountKobo, memo: "Shipment paid from wallet" },
        { walletId: platform.id, direction: "CREDIT", amountKobo: quote.amountKobo, memo: "Shipment funds held until delivery" }
      ]
    });

    await tx.shipmentQuote.update({ where: { id: quote.id }, data: { status: "accepted" } });
    await tx.shipmentQuote.updateMany({ where: { shipmentId: shipment.id, id: { not: quote.id }, status: "offered" }, data: { status: "declined" } });

    // The assignment record is what makes every later pickup and delivery check
    // verifiable: it names the booked provider and holds only PIN hashes.
    const providerVehicle = await tx.providerVehicle.findFirst({ where: { providerId: quote.providerId, active: true }, select: { id: true } });
    // One leg per quoted mode, in the order the provider listed them.
    const firstPin = pins();
    const pickupHash = pinHash(firstPin.pickupPin);
    const deliveryHash = pinHash(firstPin.deliveryPin);
    const trackingNumber = shipment.trackingNumber ?? `NSTK-${shipment.reference.replace(/^NSH-/, "")}`;
    await tx.shipmentAssignment.create({
      data: {
        shipmentId: shipment.id,
        providerId: quote.providerId,
        quoteId: quote.id,
        vehicleId: providerVehicle?.id ?? null,
        deliveryPinHash: deliveryHash
      }
    });
    await tx.logisticsShipment.update({
      where: { id: shipment.id },
      data: { trackingNumber, transportState: "assigned", assignedAt: new Date(), assignedPickupPinHash: pickupHash, version: { increment: 1 } }
    });
    await tx.shipmentLeg.createMany({
      data: quote.modes.map((mode, index) => ({
        shipmentId: shipment.id,
        sequence: index + 1,
        mode,
        providerId: quote.providerId,
        fromLabel: index === 0 ? shipment.reference : "",
        toLabel: "",
        status: "assigned",
        ...(index === 0 ? { pickupPin: firstPin.pickupPin } : {}),
        ...(index === quote.modes.length - 1 ? { deliveryPin: firstPin.deliveryPin } : {})
      }))
    });
    await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: "assigned", label: "Transporter assigned", note: `${quote.provider.name} booked at ₦${(Number(quote.amountKobo) / 100).toLocaleString("en-NG")}.`, actorId: input.customerId } });
    await recordAudit({ tx, actorId: input.customerId, action: "shipment.booked", entity: "LogisticsShipment", entityId: shipment.id, metadata: { quoteId: quote.id, providerId: quote.providerId, amountKobo: quote.amountKobo.toString(), modes: quote.modes } });
    return { shipmentId: shipment.id, reference: shipment.reference, trackingNumber, amountKobo: quote.amountKobo.toString(), providerName: quote.provider.name, modes: quote.modes, pickupPin: firstPin.pickupPin, deliveryPin: firstPin.deliveryPin };
  });
}

export type ShipmentActor = { id: string; role: "customer" | "provider" | "admin" };

/** Advances one leg; the shipment follows automatically when every leg moves. */
export async function advanceLeg(input: { actorId: string; shipmentId: string; legId: string; status: string; note?: string; simulated?: boolean; pin?: string }) {
  const leg = await prisma.shipmentLeg.findUnique({
    where: { id: input.legId },
    include: { shipment: { select: { id: true, status: true, reference: true } } }
  });
  if (!leg || leg.shipmentId !== input.shipmentId) throw new ApiError(404, "leg_not_found", "Shipment leg not found.");
  const allowed: Record<string, string[]> = { assigned: ["in_transit"], pending: ["in_transit"], in_transit: ["arrived"], arrived: [] };
  if (!(allowed[leg.status] ?? []).includes(input.status)) {
    throw new ApiError(409, "invalid_transition", `A leg that is ${leg.status} cannot move to ${input.status}.`);
  }
  if (input.status === "in_transit" && leg.pickupPin && input.pin !== leg.pickupPin) {
    throw new ApiError(400, "invalid_pin", "That pickup PIN is incorrect.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.shipmentLeg.update({
      where: { id: leg.id },
      data: { status: input.status, ...(input.status === "in_transit" ? { startedAt: new Date() } : {}), ...(input.status === "arrived" ? { completedAt: new Date() } : {}) }
    });
    await tx.shipmentEvent.create({
      data: { shipmentId: leg.shipmentId, status: input.status, label: input.status === "in_transit" ? `Leg ${leg.sequence} picked up` : `Leg ${leg.sequence} arrived`, note: input.note ?? null, actorId: input.actorId, simulated: Boolean(input.simulated) }
    });
    if (leg.shipment.status === "booked") {
      await tx.logisticsShipment.update({ where: { id: leg.shipmentId }, data: { status: "in_transit" } });
    }
    const legs = await tx.shipmentLeg.findMany({ where: { shipmentId: leg.shipmentId }, select: { status: true } });
    const allArrived = legs.every((row) => row.status === "arrived");
    if (allArrived && legs.length > 0) {
      await tx.logisticsShipment.update({ where: { id: leg.shipmentId }, data: { status: "delivered" } });
      await tx.shipmentEvent.create({ data: { shipmentId: leg.shipmentId, status: "delivered", label: "Delivered", note: "Every leg is complete.", actorId: input.actorId } });
    }
    await recordAudit({ tx, actorId: input.actorId, action: "shipment.leg_advanced", entity: "LogisticsShipment", entityId: leg.shipmentId, metadata: { legId: leg.id, mode: leg.mode, status: input.status, simulated: Boolean(input.simulated) } });
    return { legId: leg.id, status: input.status, shipmentDelivered: allArrived };
  });
}

/** Customer confirms receipt; settles the provider once. */
export async function confirmShipmentDelivery(input: { customerId: string; shipmentId: string; pin: string }) {
  const shipment = await prisma.logisticsShipment.findUnique({
    where: { id: input.shipmentId },
    include: { legs: { orderBy: { sequence: "asc" } } }
  });
  if (!shipment) throw new ApiError(404, "shipment_not_found", "Shipment not found.");
  if (shipment.customerId !== input.customerId) throw new ApiError(403, "forbidden", "This shipment belongs to another account.");
  if (shipment.status !== "delivered") throw new ApiError(409, "not_delivered", "The shipment has not reached every leg yet.");
  const last = shipment.legs[shipment.legs.length - 1];
  if (last?.deliveryPin && last.deliveryPin !== input.pin.trim()) throw new ApiError(400, "invalid_pin", "That delivery PIN is incorrect.");

  return prisma.$transaction(async (tx) => {
    const accepted = await tx.shipmentQuote.findFirst({ where: { shipmentId: shipment.id, status: "accepted" }, select: { id: true, amountKobo: true, providerId: true } });
    if (!accepted) throw new ApiError(409, "no_accepted_quote", "This shipment has no accepted quote to settle.");
    const settled = await settleShipment(tx, shipment.id, shipment.reference, accepted.amountKobo, accepted.providerId, input.customerId);
    await tx.logisticsShipment.update({ where: { id: shipment.id }, data: { status: "completed" } });
    await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: "completed", label: "Delivery confirmed", note: "Delivery PIN verified and funds settled.", actorId: input.customerId } });
    return { completed: true, settlementReference: settled.reference };
  });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Provider payout + platform fee in one balanced, once-only ledger transaction. */
async function settleShipment(tx: Tx, shipmentId: string, reference: string, amountKobo: bigint, providerId: string, actorId: string) {
  const settlementRef = `SEND-SETTLE-${shipmentId}`;
  const existing = await tx.walletTransaction.findUnique({ where: { reference: settlementRef }, select: { id: true } });
  if (existing) return { reference: settlementRef, alreadySettled: true };

  const provider = await tx.logisticsProvider.findUniqueOrThrow({ where: { id: providerId }, select: { ownerId: true, name: true } });
  const providerKobo = (amountKobo * PROVIDER_BPS) / BigInt(10000);
  const platformKobo = amountKobo - providerKobo;
  const { ensureWallet } = await import("@/lib/payments/service");
  const { postBalancedTransaction } = await import("@/lib/services/core/wallet.service");
  const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
  const providerWallet = await ensureWallet(tx, { userId: provider.ownerId, ownerType: "VENDOR" });

  await tx.wallet.update({ where: { id: providerWallet.id }, data: { availableKobo: { increment: providerKobo } } });
  await tx.wallet.update({ where: { id: platform.id }, data: { heldKobo: { decrement: amountKobo }, availableKobo: { increment: platformKobo } } });
  await postBalancedTransaction({
    tx,
    actorId,
    walletId: providerWallet.id,
    type: "payout",
    amountKobo: providerKobo,
    reference: settlementRef,
    description: `NaijaSend settlement for ${reference}`,
    entries: [
      { walletId: platform.id, direction: "DEBIT", amountKobo: amountKobo, memo: "Shipment funds released from escrow" },
      { walletId: providerWallet.id, direction: "CREDIT", amountKobo: providerKobo, memo: "Logistics provider earnings" },
      { walletId: platform.id, direction: "CREDIT", amountKobo: platformKobo, memo: "Platform service fee" }
    ]
  });
  await recordAudit({ tx, actorId, action: "shipment.settled", entity: "LogisticsShipment", entityId: shipmentId, metadata: { settlementRef, providerKobo: providerKobo.toString(), platformKobo: platformKobo.toString() } });
  return { reference: settlementRef, alreadySettled: false };
}

/** Customer cancels before any leg has been picked up; funds return to the wallet. */
export async function cancelShipment(input: { customerId: string; shipmentId: string }) {
  const shipment = await prisma.logisticsShipment.findUnique({ where: { id: input.shipmentId }, include: { legs: { select: { status: true } } } });
  if (!shipment) throw new ApiError(404, "shipment_not_found", "Shipment not found.");
  if (shipment.customerId !== input.customerId) throw new ApiError(403, "forbidden", "This shipment belongs to another account.");
  if (!["open", "quoting"].includes(shipment.status)) throw new ApiError(409, "cannot_cancel", "A booked shipment cannot be cancelled here; contact support.");

  return prisma.$transaction(async (tx) => {
    await tx.logisticsShipment.update({ where: { id: shipment.id }, data: { status: "cancelled" } });
    await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: "cancelled", label: "Cancelled", actorId: input.customerId } });
    return { cancelled: true };
  });
}

export async function listCustomerShipments(customerId: string) {
  return prisma.logisticsShipment.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      quotes: { where: { status: "offered" }, select: { id: true, amountKobo: true, transitDays: true, provider: { select: { name: true } } } },
      legs: { orderBy: { sequence: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });
}
