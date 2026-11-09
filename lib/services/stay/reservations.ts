import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";

/**
 * NaijaStay reservations.
 *
 * Rules enforced here (Phase 15 exit gates):
 *  - dates are validated in the property's own time zone, using date-only keys;
 *  - prices are computed on the server only, in integer kobo, and the accepted
 *    snapshot is stored with the reservation;
 *  - a reservation starts as a HOLD that expires, so checkout cannot block
 *    inventory forever;
 *  - the database exclusion constraint (`StayReservation_no_overlap`) is the
 *    authority against double booking; a violation is surfaced as `dates_taken`;
 *  - only the guest may cancel or review; only the host may check in / complete.
 */

export const HOLD_MINUTES = 20;
/** Default cancellation policy snapshot stored with each reservation. NOT a new commercial term: see docs/decisions.md. */
export const DEFAULT_POLICY = {
  name: "standard",
  freeCancellationUntilHoursBeforeCheckIn: 48,
  refundPercentBeforeDeadline: 100,
  refundPercentAfterDeadline: 0
};

const LIVE_STATUSES = ["hold", "awaiting_payment", "confirmed"];

export function dateKey(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}

/** Nights between two date-only strings; rejects same-day or reversed ranges. */
export function nightsBetween(checkIn: string, checkOut: string) {
  const start = new Date(`${checkIn}T00:00:00Z`).getTime();
  const end = new Date(`${checkOut}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new ApiError(400, "invalid_dates", "Choose valid check-in and check-out dates.");
  const nights = Math.round((end - start) / 86_400_000);
  if (nights < 1) throw new ApiError(400, "invalid_dates", "Check-out must be after check-in.");
  if (nights > 365) throw new ApiError(400, "invalid_dates", "Stays longer than 365 nights need the host to confirm directly.");
  return nights;
}

export type PriceBreakdown = {
  currency: string;
  nights: number;
  nightlyKobo: string;
  subtotalKobo: string;
  cleaningKobo: string;
  serviceKobo: string;
  totalKobo: string;
};

/** Server-side price. The client never sends a price. */
export function priceStay(property: { nightlyKobo: bigint; cleaningFeeKobo: bigint; serviceFeeBps: number; currency: string }, nights: number): PriceBreakdown {
  const subtotal = property.nightlyKobo * BigInt(nights);
  const service = (subtotal * BigInt(property.serviceFeeBps)) / BigInt(10000);
  const total = subtotal + property.cleaningFeeKobo + service;
  return {
    currency: property.currency,
    nights,
    nightlyKobo: property.nightlyKobo.toString(),
    subtotalKobo: subtotal.toString(),
    cleaningKobo: property.cleaningFeeKobo.toString(),
    serviceKobo: service.toString(),
    totalKobo: total.toString()
  };
}

/** Dates already held or booked for a unit, plus host blocks. */
export async function unavailableDates(unitId: string) {
  const [reservations, blocks] = await Promise.all([
    prisma.stayReservation.findMany({ where: { unitId, status: { in: LIVE_STATUSES } }, select: { checkIn: true, checkOut: true } }),
    prisma.stayBlock.findMany({ where: { unitId }, select: { startDate: true, endDate: true } })
  ]);
  return [
    ...reservations.map((row) => ({ start: dateKey(row.checkIn), end: dateKey(row.checkOut) })),
    ...blocks.map((row) => ({ start: dateKey(row.startDate), end: dateKey(row.endDate) }))
  ];
}

export async function isAvailable(unitId: string, checkIn: string, checkOut: string) {
  const clash = await prisma.stayReservation.findFirst({
    where: {
      unitId,
      status: { in: LIVE_STATUSES },
      checkIn: { lt: new Date(`${checkOut}T00:00:00Z`) },
      checkOut: { gt: new Date(`${checkIn}T00:00:00Z`) }
    },
    select: { id: true }
  });
  if (clash) return false;
  const block = await prisma.stayBlock.findFirst({
    where: { unitId, startDate: { lt: new Date(`${checkOut}T00:00:00Z`) }, endDate: { gt: new Date(`${checkIn}T00:00:00Z`) } },
    select: { id: true }
  });
  return !block;
}

function reference() {
  return `NST-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/**
 * Creates a hold for the chosen dates. The hold expires in HOLD_MINUTES; paying
 * converts it to a confirmed reservation, and an expired hold frees the dates.
 */
export async function createHold(input: { guestId: string; propertyId: string; checkIn: string; checkOut: string; guests: number; guestName: string; guestPhone: string }) {
  const property = await prisma.stayProperty.findUnique({
    where: { id: input.propertyId },
    include: { units: { orderBy: { name: "asc" }, take: 1 } }
  });
  if (!property) throw new ApiError(404, "property_not_found", "That property does not exist.");
  if (property.status !== "published") throw new ApiError(409, "not_bookable", "This property is not open for booking.");
  if (property.listingType !== "stay" && property.listingType !== "rent") throw new ApiError(400, "not_a_stay", "This listing is for sale or land; it is not bookable by the night.");
  const unit = property.units[0];
  if (!unit) throw new ApiError(409, "no_unit", "This property has no bookable unit yet.");
  if (input.guests < 1 || input.guests > property.maxGuests) throw new ApiError(400, "invalid_guests", `This property takes between 1 and ${property.maxGuests} guests.`);
  if (!input.guestName.trim() || !input.guestPhone.trim()) throw new ApiError(400, "validation_error", "Your name and phone number are required.");

  const nights = nightsBetween(input.checkIn, input.checkOut);
  if (nights < property.minimumNights) throw new ApiError(400, "minimum_stay", `This property has a minimum stay of ${property.minimumNights} nights.`);
  if (!(await isAvailable(unit.id, input.checkIn, input.checkOut))) throw new ApiError(409, "dates_taken", "Those dates are no longer available.");

  const price = priceStay(property, nights);
  try {
    return await prisma.$transaction(async (tx) => {
      const reservation = await tx.stayReservation.create({
        data: {
          reference: reference(),
          propertyId: property.id,
          unitId: unit.id,
          guestId: input.guestId,
          status: "hold",
          paymentStatus: "unpaid",
          checkIn: new Date(`${input.checkIn}T00:00:00Z`),
          checkOut: new Date(`${input.checkOut}T00:00:00Z`),
          nights,
          guests: input.guests,
          currency: property.currency,
          nightlyKobo: property.nightlyKobo,
          subtotalKobo: BigInt(price.subtotalKobo),
          cleaningKobo: property.cleaningFeeKobo,
          serviceKobo: BigInt(price.serviceKobo),
          totalKobo: BigInt(price.totalKobo),
          policySnapshot: JSON.stringify(DEFAULT_POLICY),
          guestName: input.guestName.trim().slice(0, 120),
          guestPhone: input.guestPhone.trim().slice(0, 40),
          holdExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000),
          events: { create: { status: "hold", note: `Dates held for ${HOLD_MINUTES} minutes.`, actorId: input.guestId } }
        }
      });
      return { reservation, price };
    });
  } catch (error) {
    // 23P01 = exclusion_violation: the database refused a second overlapping booking.
    if (String(error).includes("23P01") || String(error).includes("StayReservation_no_overlap")) {
      throw new ApiError(409, "dates_taken", "Those dates were just taken by another guest. Choose different dates.");
    }
    throw error;
  }
}

/** Guest pays from the NaijaPay wallet; funds are held on the platform until check-in. */
export async function payReservation(input: { guestId: string; reservationId: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "StayReservation" WHERE id = ${input.reservationId} FOR UPDATE`;
    const reservation = await tx.stayReservation.findUnique({ where: { id: input.reservationId }, include: { property: { select: { host: { select: { ownerId: true } } } } } });
    if (!reservation) throw new ApiError(404, "reservation_not_found", "Reservation not found.");
    if (reservation.guestId !== input.guestId) throw new ApiError(403, "forbidden", "This reservation belongs to another account.");
    if (reservation.status === "confirmed") return { alreadyPaid: true, reference: reservation.reference };
    if (reservation.status !== "hold" && reservation.status !== "awaiting_payment") throw new ApiError(409, "not_payable", "This reservation can no longer be paid.");
    if (reservation.holdExpiresAt && reservation.holdExpiresAt.getTime() < Date.now()) {
      await tx.stayReservation.update({ where: { id: reservation.id }, data: { status: "cancelled", holdExpiresAt: null } });
      await tx.stayReservationEvent.create({ data: { reservationId: reservation.id, status: "cancelled", note: "Hold expired before payment.", actorId: input.guestId } });
      throw new ApiError(409, "hold_expired", "Your hold expired. Please choose the dates again.");
    }

    const { ensureWallet } = await import("@/lib/payments/service");
    const { postBalancedTransaction } = await import("@/lib/services/core/wallet.service");
    const buyer = await ensureWallet(tx, { userId: input.guestId, ownerType: "CUSTOMER" });
    const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: buyer.id } });
    if (wallet.availableKobo < reservation.totalKobo) throw new ApiError(402, "insufficient_funds", "Your NaijaPay balance does not cover this stay. Top up your wallet first.");

    await tx.wallet.update({ where: { id: buyer.id }, data: { availableKobo: { decrement: reservation.totalKobo } } });
    await tx.wallet.update({ where: { id: platform.id }, data: { heldKobo: { increment: reservation.totalKobo } } });
    await postBalancedTransaction({
      tx,
      actorId: input.guestId,
      walletId: buyer.id,
      type: "debit",
      amountKobo: reservation.totalKobo,
      reference: `STAY-${reservation.reference}`,
      description: `NaijaStay reservation ${reservation.reference}`,
      entries: [
        { walletId: buyer.id, direction: "DEBIT", amountKobo: reservation.totalKobo, memo: "Stay paid from wallet" },
        { walletId: platform.id, direction: "CREDIT", amountKobo: reservation.totalKobo, memo: "Stay funds held until check-in" }
      ]
    });
    const updated = await tx.stayReservation.update({ where: { id: reservation.id, version: reservation.version }, data: { status: "confirmed", paymentStatus: "paid", holdExpiresAt: null, version: { increment: 1 } } });
    await tx.stayReservationEvent.create({ data: { reservationId: reservation.id, status: "confirmed", note: "Paid with NaijaPay. Funds held until check-in.", actorId: input.guestId } });
    await recordAudit({ tx, actorId: input.guestId, action: "stay.reservation.confirmed", entity: "StayReservation", entityId: reservation.id, metadata: { reference: reservation.reference, totalKobo: reservation.totalKobo.toString() } });
    return { alreadyPaid: false, reference: updated.reference };
  });
}

/** Releases an expired hold so the dates go back on sale. Safe to call repeatedly. */
export async function releaseExpiredHolds() {
  const now = new Date();
  const expired = await prisma.stayReservation.findMany({ where: { status: "hold", holdExpiresAt: { lt: now } }, select: { id: true } });
  for (const row of expired) {
    await prisma.$transaction(async (tx) => {
      await tx.stayReservation.update({ where: { id: row.id }, data: { status: "cancelled", holdExpiresAt: null } });
      await tx.stayReservationEvent.create({ data: { reservationId: row.id, status: "cancelled", note: "Hold expired automatically." } });
    });
  }
  return expired.length;
}

/** Cancellation refund follows the stored policy snapshot, and is computed server-side. */
export async function cancelReservation(input: { userId: string; reservationId: string; asHost?: boolean }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "StayReservation" WHERE id = ${input.reservationId} FOR UPDATE`;
    const reservation = await tx.stayReservation.findUnique({ where: { id: input.reservationId }, include: { property: { select: { host: { select: { ownerId: true, id: true } } } } } });
    if (!reservation) throw new ApiError(404, "reservation_not_found", "Reservation not found.");
    const isGuest = reservation.guestId === input.userId;
    const isHost = reservation.property.host.ownerId === input.userId;
    if (!isGuest && !isHost) throw new ApiError(403, "forbidden", "Not your reservation.");
    if (!["hold", "awaiting_payment", "confirmed"].includes(reservation.status)) throw new ApiError(409, "not_cancellable", "This reservation cannot be cancelled.");

    const policy = JSON.parse(reservation.policySnapshot) as typeof DEFAULT_POLICY;
    const hoursToCheckIn = (reservation.checkIn.getTime() - Date.now()) / 3_600_000;
    // A host cancellation always refunds in full, regardless of the guest deadline.
    const refundPercent = isHost ? 100 : hoursToCheckIn >= policy.freeCancellationUntilHoursBeforeCheckIn ? policy.refundPercentBeforeDeadline : policy.refundPercentAfterDeadline;
    const refundKobo = (reservation.totalKobo * BigInt(refundPercent)) / BigInt(100);

    if (refundKobo > BigInt(0) && reservation.paymentStatus === "paid") {
      const { ensureWallet } = await import("@/lib/payments/service");
      const { postBalancedTransaction } = await import("@/lib/services/core/wallet.service");
      const guest = await ensureWallet(tx, { userId: reservation.guestId, ownerType: "CUSTOMER" });
      const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
      await tx.wallet.update({ where: { id: guest.id }, data: { availableKobo: { increment: refundKobo } } });
      await tx.wallet.update({ where: { id: platform.id }, data: { heldKobo: { decrement: refundKobo } } });
      await postBalancedTransaction({
        tx,
        actorId: input.userId,
        walletId: guest.id,
        type: "credit",
        amountKobo: refundKobo,
        reference: `STAY-REFUND-${reservation.id}`,
        description: `NaijaStay refund for ${reservation.reference}`,
        entries: [
          { walletId: platform.id, direction: "DEBIT", amountKobo: refundKobo, memo: "Stay refund released from hold" },
          { walletId: guest.id, direction: "CREDIT", amountKobo: refundKobo, memo: "Stay refund to guest wallet" }
        ]
      });
    }
    const updated = await tx.stayReservation.update({
      where: { id: reservation.id },
      data: { status: "cancelled", paymentStatus: refundKobo > BigInt(0) ? "refunded" : reservation.paymentStatus, version: { increment: 1 } }
    });
    await tx.stayReservationEvent.create({ data: { reservationId: reservation.id, status: "cancelled", note: `${isHost ? "Host" : "Guest"} cancelled. Refund ${refundPercent}% (${refundKobo} kobo).`, actorId: input.userId } });
    await recordAudit({ tx, actorId: input.userId, action: "stay.reservation.cancelled", entity: "StayReservation", entityId: reservation.id, metadata: { by: isHost ? "host" : "guest", refundPercent, refundKobo: refundKobo.toString() } });
    return { cancelled: true, refundPercent, refundKobo: refundKobo.toString(), reservation: updated };
  });
}

/** A guest may review once, after the stay has ended. */
export async function reviewStay(input: { guestId: string; reservationId: string; rating: number; comment?: string }) {
  if (input.rating < 1 || input.rating > 5) throw new ApiError(400, "invalid_rating", "Choose a rating from 1 to 5.");
  const reservation = await prisma.stayReservation.findUnique({ where: { id: input.reservationId }, select: { guestId: true, status: true, checkOut: true, propertyId: true } });
  if (!reservation) throw new ApiError(404, "reservation_not_found", "Reservation not found.");
  if (reservation.guestId !== input.guestId) throw new ApiError(403, "forbidden", "You can only review your own stay.");
  if (reservation.checkOut.getTime() > Date.now()) throw new ApiError(409, "too_early", "You can review once your stay has ended.");
  const existing = await prisma.stayReview.findUnique({ where: { reservationId: input.reservationId }, select: { id: true } });
  if (existing) throw new ApiError(409, "already_reviewed", "You have already reviewed this stay.");
  return prisma.stayReview.create({ data: { propertyId: reservation.propertyId, reservationId: input.reservationId, guestId: input.guestId, rating: input.rating, comment: input.comment?.slice(0, 1000) ?? null } });
}
