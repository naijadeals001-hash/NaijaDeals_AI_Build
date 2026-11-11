import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma, RidePaymentMethod, RideStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import {
  DRIVE_ASSIGNMENT_GRACE_MINUTES,
  DRIVE_CITY,
  DRIVE_COUNTRY,
  findPlace,
  findVehicleClass,
  nearestPlace,
  nextAssignmentDeadline,
  quoteDrive
} from "@/lib/config/drive";
import { infraConfig } from "@/lib/infra/config";
import { ensureWallet } from "@/lib/payments/service";
import { recordAudit } from "./audit.service";
import { startDriveSweeper } from "./drive-sweeper";
import { isQueueConfigured } from "@/lib/infra/queue";
import { notifyRideAssigned, notifyRideExpired } from "@/lib/notifications/domain-events";
import { isCityActivated } from "./city.service";
import { recordSystemEvent } from "./event.service";
import { postBalancedTransaction } from "./wallet.service";

type Db = Prisma.TransactionClient | typeof prisma;

const rideInclude = {
  driver: {
    include: {
      user: { select: { id: true, name: true, phone: true } }
    }
  },
  rider: { select: { id: true, name: true, phone: true } },
  events: { orderBy: { createdAt: "asc" } }
} satisfies Prisma.RideInclude;

const openRideSelect = {
  id: true,
  rideNumber: true,
  status: true,
  pickupLabel: true,
  pickupAddress: true,
  dropoffLabel: true,
  dropoffAddress: true,
  vehicleClass: true,
  distanceMeters: true,
  durationMinutes: true,
  fareKobo: true,
  currency: true,
  paymentMethod: true,
  paymentStatus: true,
  requestedAt: true,
  acceptedAt: true
} satisfies Prisma.RideSelect;

export const rideStatusLabel: Record<RideStatus, string> = {
  requested: "Looking for a driver",
  driver_assigned: "Driver assigned",
  driver_arriving: "Driver arriving",
  in_progress: "Trip in progress",
  completed: "Trip completed",
  cancelled: "Ride cancelled"
};

const rideTransitions: Record<RideStatus, RideStatus[]> = {
  requested: ["driver_assigned", "cancelled"],
  // Arrival is a required server-verified step: a driver cannot start a trip from
  // the acceptance state, so the passenger has a record that the car reached them.
  driver_assigned: ["driver_arriving", "cancelled"],
  driver_arriving: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [],
  cancelled: []
};

const cancellable: RideStatus[] = ["requested", "driver_assigned", "driver_arriving"];

function assertRideTransition(from: RideStatus, to: RideStatus) {
  if (from === to) return;
  if (!rideTransitions[from]?.includes(to)) {
    throw new ApiError(409, "invalid_transition", `Cannot move ride from ${from} to ${to}.`);
  }
}

function newRideNumber() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `NDR-${stamp}-${suffix}`;
}

async function addRideEvent(
  tx: Db,
  input: { rideId: string; status: RideStatus; label: string; description: string; actorId?: string | null }
) {
  return tx.rideEvent.create({
    data: {
      rideId: input.rideId,
      status: input.status,
      label: input.label,
      description: input.description,
      actorId: input.actorId ?? null
    }
  });
}

async function loadRide(tx: Db, rideId: string) {
  const ride = await tx.ride.findUnique({ where: { id: rideId }, include: rideInclude });
  if (!ride) throw new ApiError(404, "ride_not_found", "Ride not found.");
  return ride;
}

export function getQuote(input: {
  pickupId: string | null | undefined;
  dropoffId: string | null | undefined;
  vehicleClassId: string | null | undefined;
}) {
  const quote = quoteDrive(input);
  if (!quote) {
    throw new ApiError(
      400,
      "invalid_route",
      "Choose two different Lagos pick-up and drop-off points and a valid vehicle class."
    );
  }
  return quote;
}

export async function requestRide(input: {
  riderId: string;
  pickupId: string;
  dropoffId: string;
  vehicleClassId: string;
  paymentMethod: RidePaymentMethod;
}) {
  // City activation is a Control Center decision, not a client assumption. A quote
  // can still be inspected while a city is off, but no ride can be requested.
  const cityActive = await isCityActivated(DRIVE_COUNTRY, DRIVE_CITY).catch(() => false);
  if (!cityActive) {
    throw new ApiError(
      409,
      "service_area_unavailable",
      `Ride dispatch in ${DRIVE_CITY} is currently switched off in Control Center. No request was created.`
    );
  }

  const quote = getQuote(input);
  if (input.paymentMethod !== "cash" && input.paymentMethod !== "wallet") {
    throw new ApiError(400, "invalid_payment_method", "Choose cash or NaijaPay wallet.");
  }

  return prisma.$transaction(async (tx) => {
    // Serialise requests per rider so two taps cannot create two active rides.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.riderId}))`;
    const activeRide = await tx.ride.findFirst({
      where: {
        riderId: input.riderId,
        status: { in: ["requested", "driver_assigned", "driver_arriving", "in_progress"] }
      },
      select: { id: true, rideNumber: true, status: true }
    });
    if (activeRide) {
      throw new ApiError(409, "active_ride_exists", `Ride ${activeRide.rideNumber} is still active. Finish or cancel it first.`);
    }

    let ride = await tx.ride.create({
      data: {
        rideNumber: newRideNumber(),
        riderId: input.riderId,
        status: "requested",
        pickupLabel: quote.pickup.label,
        pickupAddress: quote.pickup.address,
        pickupLat: quote.pickup.lat,
        pickupLng: quote.pickup.lng,
        dropoffLabel: quote.dropoff.label,
        dropoffAddress: quote.dropoff.address,
        dropoffLat: quote.dropoff.lat,
        dropoffLng: quote.dropoff.lng,
        vehicleClass: quote.vehicleClass.id,
        distanceMeters: quote.distanceMeters,
        durationMinutes: quote.durationMinutes,
        fareKobo: BigInt(quote.fareKobo),
        currency: quote.currency,
        paymentMethod: input.paymentMethod,
        paymentStatus: "pending"
      }
    });

    if (input.paymentMethod === "wallet") {
      const riderWallet = await ensureWallet(tx, { userId: input.riderId, ownerType: "CUSTOMER" });
      const fare = BigInt(quote.fareKobo);
      const locked = await tx.$queryRaw<Array<{ availableKobo: bigint }>>`
        SELECT "availableKobo" FROM "Wallet" WHERE id = ${riderWallet.id} FOR UPDATE
      `;
      if (!locked[0] || locked[0].availableKobo < fare) {
        throw new ApiError(
          402,
          "insufficient_wallet",
          "NaijaPay wallet balance is below this fare. Top up or choose cash."
        );
      }
      await tx.wallet.update({
        where: { id: riderWallet.id },
        data: { availableKobo: { decrement: fare }, heldKobo: { increment: fare } }
      });
      const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
      await tx.wallet.update({ where: { id: platform.id }, data: { heldKobo: { increment: fare } } });

      const reference = `RIDE-${ride.id}-HOLD`;
      await postBalancedTransaction({
        tx,
        actorId: input.riderId,
        walletId: riderWallet.id,
        type: "hold",
        amountKobo: fare,
        reference,
        description: `Fare hold for ${ride.rideNumber}`,
        entries: [
          { walletId: riderWallet.id, direction: "DEBIT", amountKobo: fare, memo: "Ride fare held from rider wallet" },
          { walletId: platform.id, direction: "CREDIT", amountKobo: fare, memo: "Ride fare held in platform escrow" }
        ]
      });
      ride = await tx.ride.update({
        where: { id: ride.id },
        data: { paymentStatus: "held", paymentReference: reference }
      });
    }

    await addRideEvent(tx, {
      rideId: ride.id,
      status: "requested",
      label: rideStatusLabel.requested,
      description:
        input.paymentMethod === "wallet"
          ? `Ride requested. ${quote.currency} fare held in NaijaPay until the trip is completed.`
          : "Ride requested. Fare is payable in cash to the driver at the end of the trip.",
      actorId: input.riderId
    });
    await recordSystemEvent({
      tx,
      type: "ride.requested",
      actorId: input.riderId,
      entity: "Ride",
      entityId: ride.id,
      payload: { rideNumber: ride.rideNumber, paymentMethod: input.paymentMethod, fareKobo: ride.fareKobo.toString() }
    });
    await recordAudit({
      tx,
      actorId: input.riderId,
      action: "ride.requested",
      entity: "Ride",
      entityId: ride.id,
      metadata: { rideNumber: ride.rideNumber, fareKobo: ride.fareKobo.toString() }
    });

    return loadRide(tx, ride.id);
  });
}

/**
 * Release the rider's fare hold, optionally retaining a late cancellation fee.
 *
 * The fee is taken out of money NaijaPay is already holding, never charged from
 * nothing: the rider's held amount is released, the refundable part returns to
 * their available balance, and the retained part moves from platform escrow to the
 * platform's available balance in the same balanced ledger transaction.
 */
async function refundRideHold(
  tx: Db,
  ride: {
    id: string;
    riderId: string;
    fareKobo: bigint;
    paymentMethod: RidePaymentMethod;
    paymentStatus: string;
  },
  actorId: string,
  feeKobo = 0
) {
  if (ride.paymentMethod !== "wallet" || ride.paymentStatus !== "held") return null;
  const riderWallet = await ensureWallet(tx, { userId: ride.riderId, ownerType: "CUSTOMER" });
  const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
  const fare = ride.fareKobo;
  const fee = BigInt(Math.max(0, Math.min(Math.round(feeKobo), Number(fare))));
  const refund = fare - fee;

  const riderRelease = await tx.wallet.updateMany({
    where: { id: riderWallet.id, heldKobo: { gte: fare } },
    data: { heldKobo: { decrement: fare }, availableKobo: { increment: refund } }
  });
  const platformRelease = await tx.wallet.updateMany({
    where: { id: platform.id, heldKobo: { gte: fare } },
    data: { heldKobo: { decrement: fare }, availableKobo: { increment: fee } }
  });
  if (riderRelease.count === 0 || platformRelease.count === 0) {
    throw new ApiError(409, "hold_conflict", "The ride fare hold is no longer available to refund.");
  }

  const reference = `RIDE-${ride.id}-${fee > BigInt(0) ? "CANCEL" : "REFUND"}`;
  const entries: Array<{ walletId: string; direction: "DEBIT" | "CREDIT"; amountKobo: bigint; memo: string }> = [
    { walletId: platform.id, direction: "DEBIT", amountKobo: fare, memo: "Ride fare hold released" }
  ];
  if (refund > BigInt(0)) {
    entries.push({
      walletId: riderWallet.id,
      direction: "CREDIT",
      amountKobo: refund,
      memo: "Fare returned to rider wallet"
    });
  }
  if (fee > BigInt(0)) {
    entries.push({
      walletId: platform.id,
      direction: "CREDIT",
      amountKobo: fee,
      memo: "Late cancellation fee retained"
    });
  }

  await postBalancedTransaction({
    tx,
    actorId,
    walletId: riderWallet.id,
    type: fee > BigInt(0) ? "fee" as const : "refund" as const,
    amountKobo: fare,
    reference,
    description:
      fee > BigInt(0)
        ? `Ride cancelled after the driver set off for ${ride.id}`
        : `Ride fare returned for ${ride.id}`,
    entries
  });

  return { reference, refundKobo: Number(refund), feeKobo: Number(fee) };
}

export async function cancelRide(input: {
  actorId: string;
  isAdmin: boolean;
  rideId: string;
  reason?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const ride = await loadRide(tx, input.rideId);
    if (!input.isAdmin && ride.riderId !== input.actorId) {
      throw new ApiError(403, "forbidden", "This ride belongs to another account.");
    }

    if (ride.status === "cancelled") return ride;
    if (!cancellable.includes(ride.status)) {
      throw new ApiError(
        409,
        "ride_in_progress",
        ride.status === "in_progress"
          ? "A trip in progress cannot be cancelled here. Contact support if there is a safety issue."
          : "This ride can no longer be cancelled."
      );
    }

    // CANCELLATION FEE POLICY — NOT YET DEFINED.
    // The retention amount and the exact qualifying trip state are still an open
    // business rule, so no fee is charged here and none is deducted from a rider's
    // held fare. Both `paymentMethod` cases are therefore free to cancel, which also
    // preserves the stated cash-free policy. The schema fields and ledger `fee`
    // transaction type stay in place so a defined policy can be switched on later
    // without another migration, but until then this is deliberately zero.
    const feeKobo = 0;

    const updated = await tx.ride.updateMany({
      where: { id: ride.id, status: ride.status },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationReason: input.reason?.slice(0, 300) || "Cancelled by rider.",
        cancellationFeeKobo: BigInt(feeKobo),
        assignmentExpiresAt: null
      }
    });
    if (updated.count === 0) throw new ApiError(409, "ride_changed", "The ride changed while cancelling. Reload and try again.");

    const refund = await refundRideHold(tx, ride, input.actorId, feeKobo);
    if (refund) {
      await tx.ride.update({
        where: { id: ride.id },
        data: {
          paymentStatus: refund.feeKobo > 0 ? "partially_refunded" : "refunded",
          paymentReference: refund.reference
        }
      });
    }

    await addRideEvent(tx, {
      rideId: ride.id,
      status: "cancelled",
      label: rideStatusLabel.cancelled,
      description: refund
        ? refund.feeKobo > 0
          ? `Ride cancelled after the driver set off. ${refund.feeKobo} kobo was kept as a late cancellation fee and ${refund.refundKobo} kobo returned to the rider wallet.`
          : `Ride cancelled. ${refund.refundKobo} kobo returned to the rider wallet.`
        : `Ride cancelled. ${input.reason || "No fare was charged."}`,
      actorId: input.actorId
    });
    const hasRefund = Boolean(refund);
    await recordSystemEvent({
      tx,
      type: "ride.cancelled",
      actorId: input.actorId,
      entity: "Ride",
      entityId: ride.id,
      payload: {
        refunded: refund ? (refund.feeKobo > 0 ? "partially_refunded" : "refunded") : "none"
      }
    });
    await recordAudit({
      tx,
      actorId: input.actorId,
      action: input.isAdmin ? "ride.cancelled_by_admin" : "ride.cancelled",
      entity: "Ride",
      entityId: ride.id,
      metadata: {
        refunded: Boolean(refund),
        cancellationFeeKobo: feeKobo,
        reason: input.reason ?? null
      }
    });

    return loadRide(tx, ride.id);
  });
}

export async function getDriverForUser(userId: string, requireApproved = true) {
  const driver = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!driver) throw new ApiError(403, "not_a_driver", "No driver profile is linked to this account.");
  if (requireApproved && (driver.status !== "approved" || !driver.active)) {
    throw new ApiError(403, "driver_not_approved", "This driver profile is not approved for trips.");
  }
  return driver;
}

export async function acceptRide(input: { userId: string; rideId: string }) {
  const driver = await getDriverForUser(input.userId);
  if (driver.status !== "approved") {
    throw new ApiError(
      403,
      "driver_suspended",
      driver.suspendedReason ? `Driver account suspended: ${driver.suspendedReason}` : "Driver account is not approved to accept new rides."
    );
  }
  const loaded = await prisma.$transaction(async (tx) => {
    const ride = await tx.ride.findUnique({ where: { id: input.rideId } });
    if (!ride) throw new ApiError(404, "ride_not_found", "Ride not found.");
    if (ride.status === "cancelled") throw new ApiError(409, "ride_cancelled", "This ride was cancelled by the rider.");

    // A deadline can pass without anyone reading the ride. Release it inside this
    // transaction so a driver offering to take over is never told it is taken forever.
    if (
      (ride.status === "driver_assigned" || ride.status === "driver_arriving") &&
      ride.assignmentExpiresAt &&
      ride.assignmentExpiresAt.getTime() < Date.now()
    ) {
      await releaseExpiredRide(tx, ride, new Date());
    }

    // Serialise acceptance per driver. Two different open rides tapped at the same
    // time must not both attach to one driver, so the check and the write happen
    // under one driver-scoped advisory lock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`driver:${driver.id}`}))`;
    const alreadyActive = await tx.ride.findFirst({
      where: {
        driverId: driver.id,
        status: { in: ["driver_assigned", "driver_arriving", "in_progress"] }
      },
      select: { id: true, rideNumber: true, status: true }
    });
    if (alreadyActive) {
      throw new ApiError(
        409,
        "driver_has_active_ride",
        `You are already on ride ${alreadyActive.rideNumber}. Complete or release it before accepting another.`
      );
    }

    const accepted = await tx.ride.updateMany({
      where: { id: input.rideId, status: "requested", driverId: null },
      data: {
        driverId: driver.id,
        status: "driver_assigned",
        acceptedAt: new Date(),
        // The clock starts now: arrive, or the ride goes back to the queue.
        assignmentExpiresAt: nextAssignmentDeadline()
      }
    });
    if (accepted.count === 0) {
      throw new ApiError(409, "ride_taken", "Another driver has already accepted this ride, or it is no longer available.");
    }

    await addRideEvent(tx, {
      rideId: ride.id,
      status: "driver_assigned",
      label: rideStatusLabel.driver_assigned,
      description: `${driver.vehicleMake} ${driver.vehicleModel} (${driver.vehiclePlate}) accepted the ride.`,
      actorId: input.userId
    });
    await recordSystemEvent({
      tx,
      type: "ride.driver_assigned",
      actorId: input.userId,
      entity: "Ride",
      entityId: ride.id,
      payload: { driverId: driver.id }
    });
    await recordAudit({
      tx,
      actorId: input.userId,
      action: "ride.driver_assigned",
      entity: "Ride",
      entityId: ride.id,
      metadata: { driverId: driver.id }
    });

    return loadRide(tx, ride.id);
  });

  // Post-commit: the rider learns who took the ride.
  await notifyRideAssigned({
    id: loaded.id,
    rideNumber: loaded.rideNumber,
    riderId: loaded.riderId,
    driverName: null
  });

  return loaded;
}

async function releaseHoldToDriver(
  tx: Db,
  ride: { id: string; fareKobo: bigint; paymentMethod: RidePaymentMethod; paymentStatus: string; riderId: string },
  driverUserId: string,
  actorId: string
) {
  if (ride.paymentMethod !== "wallet" || ride.paymentStatus !== "held") return null;
  const fare = ride.fareKobo;
  const riderWallet = await ensureWallet(tx, { userId: ride.riderId, ownerType: "CUSTOMER" });
  const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
  const driverWallet = await ensureWallet(tx, { userId: driverUserId, ownerType: "DRIVER" });

  const riderRelease = await tx.wallet.updateMany({
    where: { id: riderWallet.id, heldKobo: { gte: fare } },
    data: { heldKobo: { decrement: fare } }
  });
  const platformRelease = await tx.wallet.updateMany({
    where: { id: platform.id, heldKobo: { gte: fare } },
    data: { heldKobo: { decrement: fare } }
  });
  if (riderRelease.count === 0 || platformRelease.count === 0) {
    throw new ApiError(409, "hold_conflict", "The ride fare hold is no longer available to release.");
  }
  await tx.wallet.update({ where: { id: driverWallet.id }, data: { availableKobo: { increment: fare } } });

  const reference = `RIDE-${ride.id}-RELEASE`;
  await postBalancedTransaction({
    tx,
    actorId,
    walletId: driverWallet.id,
    type: "release",
    amountKobo: fare,
    reference,
    description: `Ride fare paid to driver for ${ride.id}`,
    entries: [
      { walletId: platform.id, direction: "DEBIT", amountKobo: fare, memo: "Ride fare hold released" },
      { walletId: driverWallet.id, direction: "CREDIT", amountKobo: fare, memo: "Ride fare paid to driver" }
    ]
  });
  return reference;
}

export async function driverUpdateRideStatus(input: {
  userId: string;
  rideId: string;
  status: Extract<RideStatus, "driver_arriving" | "in_progress" | "completed">;
}) {
  // A driver suspended mid-trip may finish the ride they already hold; only
  // accepting new rides is blocked by the approved-status guard.
  const driver = await getDriverForUser(input.userId, false);

  // The transaction reports what happened instead of throwing on expiry. A throw
  // inside `$transaction` rolls the release back, so the 409 has to be raised after
  // the release has been committed.
  const result = await prisma.$transaction(async (tx) => {
    const ride = await loadRide(tx, input.rideId);
    if (ride.driverId !== driver.id) {
      // A concurrent read or sweep can release an expired assignment between the
      // driver's tap and this transaction. That is an expiry, not a foreign ride:
      // report it as such so the driver knows the ride went back to the queue.
      const expiredRelease =
        ride.status === "requested" &&
        ride.events.some((event) => event.label === "Driver did not respond in time");
      if (expiredRelease) {
        throw new ApiError(
          409,
          "assignment_expired",
          "This assignment expired and the ride went back to the open queue. Nothing extra was charged."
        );
      }
      throw new ApiError(403, "forbidden", "This ride is assigned to another driver.");
    }
    if (ride.status === "completed" && input.status === "completed") {
      return { outcome: "ok" as const, ride };
    }

    assertRideTransition(ride.status, input.status);
    if (input.status === "completed") {
      if (ride.status !== "in_progress") throw new ApiError(409, "trip_not_started", "Start the trip before completing it.");
    }
    if (input.status === "in_progress") {
      const required = await isVerificationRequired(tx, ride.id);
      const verified = isPassengerVerified(ride.events);
      if (required && !verified) {
        throw new ApiError(
          409,
          "passenger_verification_required",
          "Ask the passenger for the 4-digit code on their trip screen and verify it before starting."
        );
      }
    }

    const now = new Date();
    /** Transitions out of an assignment must not revive a deadline that already passed. */
    const assignmentPending = ride.status === "driver_assigned" || ride.status === "driver_arriving";
    const updated = await tx.ride.updateMany({
      where: {
        id: ride.id,
        driverId: driver.id,
        status: ride.status,
        ...(assignmentPending
          ? {
              OR: [
                { assignmentExpiresAt: null },
                { assignmentExpiresAt: { gte: now } }
              ]
            }
          : {})
      },
      data: {
        status: input.status,
        ...(input.status === "driver_arriving"
          ? { arrivedAt: now, assignmentExpiresAt: nextAssignmentDeadline(now) }
          : {}),
        ...(input.status === "in_progress"
          ? { startedAt: ride.startedAt ?? now, assignmentExpiresAt: null }
          : {}),
        ...(input.status === "completed" ? { completedAt: now, assignmentExpiresAt: null } : {})
      }
    });
    if (updated.count === 0) {
      // The conditional update lost. If the deadline is what closed the door, release
      // the ride inside this transaction and report it, so the release commits before
      // the caller sees the 409.
      if (assignmentPending && (await releaseExpiredRide(tx, ride, now))) {
        return { outcome: "expired" as const };
      }
      return { outcome: "changed" as const };
    }

    let paymentReference: string | null = null;
    if (input.status === "completed") {
      paymentReference = await releaseHoldToDriver(tx, ride, ride.driver?.user.id ?? driver.userId, input.userId);
      await tx.ride.update({
        where: { id: ride.id },
        data: paymentReference
          ? { paymentStatus: "paid", paymentReference }
          : { paymentStatus: ride.paymentMethod === "cash" ? "pending" : ride.paymentStatus }
      });
    }

    const description =
      input.status === "driver_arriving"
        ? "Driver has arrived at the pick-up point."
        : input.status === "in_progress"
          ? "Trip started. The fare was locked at request time."
          : paymentReference
            ? "Trip completed. Fare released from the rider wallet to the driver."
            : "Trip completed. Cash fare is due to the driver.";

    await addRideEvent(tx, {
      rideId: ride.id,
      status: input.status,
      label: rideStatusLabel[input.status],
      description,
      actorId: input.userId
    });
    await recordSystemEvent({
      tx,
      type: `ride.${input.status}`,
      actorId: input.userId,
      entity: "Ride",
      entityId: ride.id,
      payload: { paymentReference }
    });
    await recordAudit({
      tx,
      actorId: input.userId,
      action: `ride.${input.status}`,
      entity: "Ride",
      entityId: ride.id,
      metadata: { paymentReference }
    });

    return { outcome: "ok" as const, ride: await loadRide(tx, ride.id) };
  });

  if (result.outcome === "expired") {
    throw new ApiError(
      409,
      "assignment_expired",
      "This assignment expired and the ride went back to the open queue. Nothing extra was charged."
    );
  }
  if (result.outcome === "changed") {
    throw new ApiError(409, "ride_changed", "The ride changed while updating. Reload and try again.");
  }
  return result.ride;
}

export async function releaseRide(input: { userId: string; rideId: string; reason?: string | null }) {
  const driver = await getDriverForUser(input.userId);
  return prisma.$transaction(async (tx) => {
    const ride = await loadRide(tx, input.rideId);
    if (ride.driverId !== driver.id) throw new ApiError(403, "forbidden", "This ride is assigned to another driver.");
    if (!["driver_assigned", "driver_arriving"].includes(ride.status)) {
      throw new ApiError(409, "cannot_release", "Only an accepted ride that has not started can be released.");
    }

    const updated = await tx.ride.updateMany({
      where: { id: ride.id, driverId: driver.id, status: ride.status },
      data: {
        status: "requested",
        driverId: null,
        acceptedAt: null,
        arrivedAt: null,
        assignmentExpiresAt: null
      }
    });
    if (updated.count === 0) throw new ApiError(409, "ride_changed", "The ride changed while releasing. Reload and try again.");

    await addRideEvent(tx, {
      rideId: ride.id,
      status: "requested",
      label: "Driver released the ride",
      description: input.reason?.slice(0, 300) || "The ride is open again for another driver.",
      actorId: input.userId
    });
    await recordAudit({
      tx,
      actorId: input.userId,
      action: "ride.driver_released",
      entity: "Ride",
      entityId: ride.id,
      metadata: { reason: input.reason ?? null }
    });

    return loadRide(tx, ride.id);
  });
}

export async function markCashCollected(input: { userId: string; rideId: string }) {
  const driver = await getDriverForUser(input.userId);
  return prisma.$transaction(async (tx) => {
    const ride = await loadRide(tx, input.rideId);
    if (ride.driverId !== driver.id) throw new ApiError(403, "forbidden", "This ride is assigned to another driver.");
    if (ride.paymentMethod !== "cash") throw new ApiError(409, "not_cash", "This ride was paid from the wallet.");
    if (ride.status !== "completed") throw new ApiError(409, "trip_not_complete", "Cash can only be recorded after the trip is completed.");
    if (ride.paymentStatus === "paid") return ride;

    const updated = await tx.ride.updateMany({
      where: { id: ride.id, paymentStatus: "pending" },
      data: { paymentStatus: "paid", paymentReference: `RIDE-${ride.id}-CASH` }
    });
    if (updated.count === 0) throw new ApiError(409, "payment_changed", "The ride payment changed. Reload and try again.");

    await addRideEvent(tx, {
      rideId: ride.id,
      status: "completed",
      label: "Cash fare recorded",
      description: "Driver confirmed the cash fare was collected from the rider.",
      actorId: input.userId
    });
    await recordAudit({
      tx,
      actorId: input.userId,
      action: "ride.cash_collected",
      entity: "Ride",
      entityId: ride.id,
      metadata: { fareKobo: ride.fareKobo.toString() }
    });

    return loadRide(tx, ride.id);
  });
}

/**
 * Release one ride if its assignment deadline has genuinely passed.
 *
 * The conditional update re-checks status, driver and deadline in the same statement
 * that changes the row, so a sweep racing a driver (or another sweep) can only win
 * once. Returns the ride id when this call did the release, otherwise null.
 */
async function releaseExpiredRide(
  tx: Db,
  ride: { id: string; rideNumber: string; status: RideStatus; driverId: string | null },
  now: Date
) {
  const updated = await tx.ride.updateMany({
    where: {
      id: ride.id,
      status: ride.status,
      driverId: ride.driverId,
      assignmentExpiresAt: { lt: now }
    },
    data: {
      status: "requested",
      driverId: null,
      acceptedAt: null,
      arrivedAt: null,
      assignmentExpiresAt: null
    }
  });
  if (updated.count === 0) return null;

  await addRideEvent(tx, {
    rideId: ride.id,
    status: "requested",
    label: "Driver did not respond in time",
    description: `The assigned driver made no progress for ${DRIVE_ASSIGNMENT_GRACE_MINUTES} minutes, so the ride went back to the open queue automatically. Nothing extra was charged and you do not need to request again.`,
    actorId: null
  });
  await recordAudit({
    tx,
    actorId: null,
    action: "ride.assignment_expired",
    entity: "Ride",
    entityId: ride.id,
    metadata: { rideNumber: ride.rideNumber, previousDriverId: ride.driverId }
  });
  return ride.id;
}

/**
 * Return rides whose assigned driver has gone silent to the open queue.
 *
 * Two things call this: a periodic server sweep (see `instrumentation.ts`, every 30
 * seconds) and the start of every ride read that a client polls. The periodic sweep
 * means an idle ride returns even when nobody is looking at it; the read-time sweep
 * keeps a client from ever seeing a deadline that has already passed.
 *
 * Each release is guarded by the exact status, driver and deadline that were read, so
 * two concurrent sweeps (or a sweep racing the driver) release a ride at most once.
 */
export async function releaseExpiredAssignments(now: Date = new Date()) {
  // Driver presence has no dedicated session table in this schema; its heartbeat
  // lives in LocationPing. Reuse the same 30-second sweep to close a presence whose
  // last heartbeat has passed the documented TTL, so a vanished driver is never
  // offered work indefinitely.
  await expireStaleDriverPresence(now).catch(() => 0);

  const stale = await prisma.ride.findMany({
    where: {
      status: { in: ["driver_assigned", "driver_arriving"] },
      assignmentExpiresAt: { lt: now }
    },
    select: { id: true, rideNumber: true, status: true, driverId: true, riderId: true },
    orderBy: { assignmentExpiresAt: "asc" },
    take: 25
  });

  const released: string[] = [];
  for (const ride of stale) {
    try {
      const changed = await prisma.$transaction((tx) => releaseExpiredRide(tx, ride, now));
      if (changed) {
        released.push(changed);
        // Post-commit and outside the race guard: a notification must not turn
        // a successful release into a retried one.
        await notifyRideExpired({ id: ride.id, rideNumber: ride.rideNumber, riderId: ride.riderId });
      }
    } catch {
      // Another sweep or the driver won the race. The ride is already moving on.
    }
  }

  return released;
}

export async function listRidesForRider(riderId: string) {
  await releaseExpiredAssignments();
  return prisma.ride.findMany({
    where: { riderId },
    include: rideInclude,
    orderBy: { createdAt: "desc" },
    take: 30
  });
}

export async function getRideForUser(input: { userId: string; isAdmin: boolean; rideId: string }) {
  // Keep a single-ride read honest too: never return an assignment whose deadline
  // has already passed.
  await releaseExpiredAssignments();
  const ride = await loadRide(prisma, input.rideId);
  if (input.isAdmin || ride.riderId === input.userId || ride.driver?.user.id === input.userId) return ride;
  throw new ApiError(403, "forbidden", "This ride belongs to another account.");
}

export async function listDriverRides(userId: string) {
  const driver = await getDriverForUser(userId);
  const now = new Date();
  await releaseExpiredAssignments(now);

  const [open, active, recent] = await Promise.all([
    prisma.ride.findMany({
      where: { status: "requested" },
      select: openRideSelect,
      orderBy: { requestedAt: "asc" },
      take: 50
    }),
    prisma.ride.findMany({
      where: { driverId: driver.id, status: { in: ["driver_assigned", "driver_arriving", "in_progress"] } },
      include: rideInclude,
      orderBy: { acceptedAt: "desc" }
    }),
    prisma.ride.findMany({
      where: { driverId: driver.id, status: { in: ["completed", "cancelled"] } },
      include: rideInclude,
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);

  // Attach the verification state the driver UI must enforce before starting.
  const activeWithVerification = await Promise.all(
    active.map(async (ride) => ({
      ...ride,
      verification: {
        required: await isVerificationRequired(prisma, ride.id),
        verified: isPassengerVerified(ride.events)
      }
    }))
  );

  const [presence, summary] = await Promise.all([
    presenceForDriver(driver, now),
    driverSummary(driver, now)
  ]);
  // Time buckets are separate: online time is split into pick-up and on-trip
  // intervals using server timestamps, leaving the remainder as available time.
  summary.todayAvailableSeconds = Math.max(
    0,
    presence.todayOnlineSeconds - summary.todayPickupSeconds - summary.todayDrivingSeconds
  );

  return {
    driver: {
      id: driver.id,
      status: driver.status,
      active: driver.active,
      vehicleClass: driver.vehicleClass,
      vehicleMake: driver.vehicleMake,
      vehicleModel: driver.vehicleModel,
      vehiclePlate: driver.vehiclePlate,
      licenseNumber: driver.licenseNumber,
      serviceZone: driver.serviceZone,
      online: driver.online,
      foodDeliveryEnabled: driver.foodDeliveryEnabled,
      foodVehicleType: driver.foodVehicleType,
      insulatedBag: driver.insulatedBag,
      suspendedReason: driver.suspendedReason
    },
    presence,
    summary,
    open,
    active: activeWithVerification,
    recent
  };
}

export async function listAllRides() {
  await releaseExpiredAssignments();
  return prisma.ride.findMany({
    include: rideInclude,
    orderBy: { createdAt: "desc" },
    take: 100
  });
}

/* ------------------------------------------- presence, tracking and routing --- */

/**
 * Driver presence and online time.
 *
 * SCHEMA GAP (reported, not simulated): this repository has no
 * `DriverAvailabilitySession` table (startedAt, lastHeartbeatAt, endedAt, endReason)
 * and no `DriverProfile.lastLocation*` columns. Presence therefore uses the
 * authoritative `DriverProfile.online` field plus:
 *   - `LocationPing` rows as heartbeats (`presence:<driverId>`, or the active
 *     trip's `drive:<rideId>` session while a trip is running);
 *   - paired `driver.online` / `driver.offline` SystemEvents for start/end times.
 * Online totals are derived from those server timestamps only. The client never
 * supplies a duration.
 */
export const DRIVE_PRESENCE_TTL_SECONDS = 120;
export const DRIVE_TRACKING_STALE_MS = 90_000;
const PRESENCE_STALE_WARNING_SECONDS = 60;
const DRIVE_SERVICE_RADIUS_METERS = 25_000;
const MAX_LOCATION_ACCURACY_M = 5_000;
const ONLINE_EVENT_TYPES = ["driver.online", "driver.offline"];
const VERIFICATION_EVENT_TYPE = "ride.verification_issued";
const PASSENGER_VERIFIED_LABEL = "Passenger verified";

export type DriveRouteStep = {
  instruction: string;
  maneuver: string;
  distanceMeters: number;
  durationSeconds: number;
};

export type DriveRoute = {
  provider: "osrm";
  profile: "driving";
  distanceMeters: number;
  durationSeconds: number;
  geometry: Array<{ lat: number; lng: number }>;
  steps: DriveRouteStep[];
};

export type DrivePresence = {
  online: boolean;
  since: string | null;
  lastSeenAt: string | null;
  lastSeenAgeSeconds: number | null;
  expiresAt: string | null;
  stale: boolean;
  heartbeatTtlSeconds: number;
  todayOnlineSeconds: number;
  serviceZone: string;
  activeRideId: string | null;
  eligible: {
    approved: boolean;
    active: boolean;
    vehicle: boolean;
    serviceZone: boolean;
  };
};

export type DriveDriverSummary = {
  todayCompletedTrips: number;
  todayFareReleasedKobo: string;
  todayCashRecordedKobo: string;
  todayCashPendingKobo: string;
  /** Time from accepting a ride until the trip starts (en route + waiting). */
  todayPickupSeconds: number;
  /** Time between trip start and completion. */
  todayDrivingSeconds: number;
  /** Online time not attributed to a pick-up or an active trip. */
  todayAvailableSeconds: number;
  walletAvailableKobo: string | null;
  walletHeldKobo: string | null;
  activeTripId: string | null;
};

type PresenceDriver = {
  id: string;
  userId: string;
  status: string;
  active: boolean;
  online: boolean;
  updatedAt: Date;
  serviceZone: string | null;
  vehicleClass: string;
};

type PresenceEventRow = { type: string; payload: Prisma.JsonValue | null; createdAt: Date };

function normalizeServiceZone(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function lagosDayStart(now: Date) {
  // Nigeria is UTC+1 all year (no daylight saving). Compute local midnight and
  // express it back in UTC so every online segment is clipped to one local day.
  const offsetMs = 60 * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(startLocal - offsetMs);
}

function presenceEventTime(row: PresenceEventRow) {
  const payload = row.payload as { at?: unknown } | null;
  const parsed = payload && typeof payload.at === "string" ? new Date(payload.at) : row.createdAt;
  return Number.isNaN(parsed.getTime()) ? row.createdAt : parsed;
}

function onlineSecondsBetween(events: PresenceEventRow[], from: Date, to: Date) {
  let total = 0;
  let startedAt: Date | null = null;
  for (const event of events) {
    const at = presenceEventTime(event);
    if (at.getTime() > to.getTime()) continue;
    if (event.type === "driver.online" && !startedAt) startedAt = at;
    if (event.type === "driver.offline" && startedAt) {
      const start = Math.max(startedAt.getTime(), from.getTime());
      const end = Math.min(at.getTime(), to.getTime());
      if (end > start) total += Math.floor((end - start) / 1000);
      startedAt = null;
    }
  }
  if (startedAt) {
    const start = Math.max(startedAt.getTime(), from.getTime());
    const end = to.getTime();
    if (end > start) total += Math.floor((end - start) / 1000);
  }
  return total;
}

async function activeRideForDriver(driverId: string) {
  return prisma.ride.findFirst({
    where: { driverId, status: { in: ["driver_assigned", "driver_arriving", "in_progress"] } },
    select: { id: true, rideNumber: true, status: true },
    orderBy: { acceptedAt: "desc" }
  });
}

async function latestDriverPing(userId: string, driverId: string, activeRideId: string | null) {
  const refs = [`presence:${driverId}`];
  if (activeRideId) refs.push(`drive:${activeRideId}`);
  return prisma.locationPing.findFirst({
    where: { userId, sessionRef: { in: refs } },
    orderBy: { capturedAt: "desc" },
    select: {
      latitude: true,
      longitude: true,
      accuracyM: true,
      speedMps: true,
      headingDeg: true,
      capturedAt: true,
      source: true,
      sessionRef: true
    }
  });
}

async function endDriverPresence(
  driver: PresenceDriver,
  actorId: string | null,
  at: Date,
  reason: string
) {
  const updated = await prisma.driverProfile.updateMany({
    where: { id: driver.id, online: true },
    data: { online: false }
  });
  if (updated.count === 0) return false;
  await recordSystemEvent({
    type: "driver.offline",
    actorId,
    entity: "DriverProfile",
    entityId: driver.id,
    payload: { at: at.toISOString(), reason }
  });
  await recordAudit({
    actorId,
    action: "driver.went_offline",
    entity: "DriverProfile",
    entityId: driver.id,
    metadata: { reason, at: at.toISOString() }
  });
  return true;
}

async function expireOneDriverPresence(driver: PresenceDriver, now: Date) {
  if (!driver.online) return false;
  const active = await activeRideForDriver(driver.id);
  const latest = await latestDriverPing(driver.userId, driver.id, active?.id ?? null);
  const lastSeen = latest?.capturedAt ?? driver.updatedAt;
  const ageMs = now.getTime() - lastSeen.getTime();
  if (ageMs <= DRIVE_PRESENCE_TTL_SECONDS * 1000) return false;
  // Close the session at the exact point the documented TTL elapsed, not at sweep
  // time, so offline minutes are never counted as online.
  const effectiveAt = new Date(lastSeen.getTime() + DRIVE_PRESENCE_TTL_SECONDS * 1000);
  return endDriverPresence(driver, null, effectiveAt, "heartbeat_timeout");
}

export async function expireStaleDriverPresence(now: Date = new Date()) {
  const drivers = await prisma.driverProfile.findMany({
    where: { online: true },
    select: {
      id: true,
      userId: true,
      status: true,
      active: true,
      online: true,
      updatedAt: true,
      serviceZone: true,
      vehicleClass: true
    },
    take: 50
  });
  let expired = 0;
  for (const driver of drivers) {
    if (await expireOneDriverPresence(driver, now)) expired += 1;
  }
  return expired;
}

async function presenceForDriver(driver: PresenceDriver, now: Date): Promise<DrivePresence> {
  const active = await activeRideForDriver(driver.id);
  const [latest, events] = await Promise.all([
    latestDriverPing(driver.userId, driver.id, active?.id ?? null),
    prisma.systemEvent.findMany({
      where: {
        entity: "DriverProfile",
        entityId: driver.id,
        type: { in: ONLINE_EVENT_TYPES }
      },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: { type: true, payload: true, createdAt: true }
    })
  ]);

  const lastSeen = latest?.capturedAt ?? (driver.online ? driver.updatedAt : null);
  const ageSeconds = lastSeen ? Math.max(0, Math.floor((now.getTime() - lastSeen.getTime()) / 1000)) : null;
  const dayStart = lagosDayStart(now);
  const lastOnlineEvent = [...events].reverse().find((event) => event.type === "driver.online");
  const since = lastOnlineEvent ? presenceEventTime(lastOnlineEvent) : null;
  const vehicle = Boolean(findVehicleClass(driver.vehicleClass));
  const zone = !driver.serviceZone || normalizeServiceZone(driver.serviceZone) === normalizeServiceZone(DRIVE_CITY);

  return {
    online: driver.online,
    since: driver.online && since ? since.toISOString() : null,
    lastSeenAt: lastSeen ? lastSeen.toISOString() : null,
    lastSeenAgeSeconds: ageSeconds,
    expiresAt:
      driver.online && lastSeen
        ? new Date(lastSeen.getTime() + DRIVE_PRESENCE_TTL_SECONDS * 1000).toISOString()
        : null,
    stale: Boolean(driver.online && (ageSeconds === null || ageSeconds > PRESENCE_STALE_WARNING_SECONDS)),
    heartbeatTtlSeconds: DRIVE_PRESENCE_TTL_SECONDS,
    todayOnlineSeconds: onlineSecondsBetween(events, dayStart, now),
    serviceZone: driver.serviceZone || DRIVE_CITY,
    activeRideId: active?.id ?? null,
    eligible: {
      approved: driver.status === "approved",
      active: driver.active,
      vehicle,
      serviceZone: zone
    }
  };
}

export async function getDriverPresence(userId: string) {
  const driver = await getDriverForUser(userId);
  const now = new Date();
  await expireOneDriverPresence(driver, now);
  const fresh = await prisma.driverProfile.findUniqueOrThrow({ where: { id: driver.id } });
  return presenceForDriver(fresh, now);
}

function assertUsableDriverPoint(input: {
  latitude?: unknown;
  longitude?: unknown;
  accuracyM?: unknown;
}) {
  const lat = Number(input.latitude);
  const lng = Number(input.longitude);
  const accuracy = Number(input.accuracyM);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new ApiError(400, "invalid_location", "A valid latitude and longitude are required to go online.");
  }
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > MAX_LOCATION_ACCURACY_M) {
    throw new ApiError(
      400,
      "inaccurate_location",
      `Location accuracy must be within ${MAX_LOCATION_ACCURACY_M} m. Move somewhere with a clearer signal and try again.`
    );
  }
  const nearest = nearestPlace({ lat, lng });
  if (!nearest || nearest.distanceMeters > DRIVE_SERVICE_RADIUS_METERS) {
    throw new ApiError(
      400,
      "outside_service_area",
      "You are outside the Lagos operating area NaijaDrive can dispatch from."
    );
  }
  return { lat, lng, accuracyM: accuracy };
}

async function recordDriverPing(input: {
  userId: string;
  driverId: string;
  sessionRef: string;
  point: { lat: number; lng: number; accuracyM: number };
  now: Date;
}) {
  const device =
    (await prisma.deviceRegistration.findFirst({
      where: { userId: input.userId, revokedAt: null },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true }
    })) ??
    (await prisma.deviceRegistration.create({
      data: { userId: input.userId, platform: "web" },
      select: { id: true }
    }));
  await prisma.locationPing.create({
    data: {
      deviceId: device.id,
      userId: input.userId,
      sessionRef: input.sessionRef,
      latitude: input.point.lat,
      longitude: input.point.lng,
      accuracyM: input.point.accuracyM,
      capturedAt: input.now,
      clientId: `presence-${randomBytes(8).toString("hex")}`,
      source: "browser"
    }
  });
  await prisma.deviceRegistration
    .update({ where: { id: device.id }, data: { lastSeenAt: input.now } })
    .catch(() => null);
}

/**
 * Go online, send a heartbeat, or stop new requests.
 *
 * Going online requires an approved, active passenger-ride profile, a known
 * vehicle class, a Lagos service zone and a usable fresh browser location. A
 * heartbeat outside Lagos ends presence instead of pretending the driver is still
 * dispatchable. Going offline never abandons an active trip.
 */
export async function setDriverPresence(input: {
  userId: string;
  action: "go_online" | "go_offline" | "heartbeat";
  latitude?: unknown;
  longitude?: unknown;
  accuracyM?: unknown;
}) {
  const driver = await getDriverForUser(input.userId);

  if (input.action === "go_offline") {
    await endDriverPresence(driver, input.userId, new Date(), "driver_offline");
    return getDriverPresence(input.userId);
  }

  if (driver.status !== "approved" || !driver.active) {
    throw new ApiError(403, "driver_not_eligible", "This driver profile is not approved to receive passenger rides.");
  }
  if (!findVehicleClass(driver.vehicleClass)) {
    throw new ApiError(403, "vehicle_not_eligible", "Your vehicle class is not one NaijaDrive can dispatch.");
  }
  if (driver.serviceZone && normalizeServiceZone(driver.serviceZone) !== normalizeServiceZone(DRIVE_CITY)) {
    throw new ApiError(403, "outside_service_area", `Passenger rides are dispatched in ${DRIVE_CITY} only.`);
  }

  let point: { lat: number; lng: number; accuracyM: number };
  try {
    point = assertUsableDriverPoint(input);
  } catch (error) {
    if (input.action === "heartbeat" && error instanceof ApiError && error.code === "outside_service_area") {
      await endDriverPresence(driver, input.userId, new Date(), "left_service_area");
    }
    throw error;
  }

  if (input.action === "heartbeat" && !driver.online) {
    throw new ApiError(409, "not_online", "This driver is offline. Go online again to resume location sharing.");
  }

  const now = new Date();
  const active = await activeRideForDriver(driver.id);
  const sessionRef = active ? `drive:${active.id}` : `presence:${driver.id}`;

  if (input.action === "go_online") {
    const changed = await prisma.driverProfile.updateMany({
      where: { id: driver.id, online: false },
      data: { online: true }
    });
    if (changed.count > 0) {
      await recordSystemEvent({
        type: "driver.online",
        actorId: input.userId,
        entity: "DriverProfile",
        entityId: driver.id,
        payload: { at: now.toISOString(), mode: "browser", zone: driver.serviceZone || DRIVE_CITY }
      });
      await recordAudit({
        actorId: input.userId,
        action: "driver.went_online",
        entity: "DriverProfile",
        entityId: driver.id,
        metadata: { mode: "browser", zone: driver.serviceZone || DRIVE_CITY }
      });
    }
  }

  await recordDriverPing({ userId: driver.userId, driverId: driver.id, sessionRef, point, now });
  return getDriverPresence(input.userId);
}

async function driverSummary(driver: PresenceDriver, now: Date): Promise<DriveDriverSummary> {
  const dayStart = lagosDayStart(now);
  const [completedToday, startedToday, wallet] = await Promise.all([
    prisma.ride.findMany({
      where: { driverId: driver.id, status: "completed", completedAt: { gte: dayStart } },
      select: {
        id: true,
        fareKobo: true,
        paymentMethod: true,
        paymentStatus: true,
        startedAt: true,
        completedAt: true
      }
    }),
    prisma.ride.findMany({
      where: {
        driverId: driver.id,
        OR: [{ status: "in_progress" }, { startedAt: { gte: dayStart } }]
      },
      select: { id: true, status: true, acceptedAt: true, startedAt: true, completedAt: true }
    }),
    prisma.wallet.findFirst({
      where: { userId: driver.userId, ownerType: "DRIVER" },
      select: { availableKobo: true, heldKobo: true }
    })
  ]);

  let todayFareReleasedKobo = BigInt(0);
  let todayCashRecordedKobo = BigInt(0);
  let todayCashPendingKobo = BigInt(0);
  for (const ride of completedToday) {
    if (ride.paymentMethod === "wallet" && ride.paymentStatus === "paid") {
      todayFareReleasedKobo += ride.fareKobo;
    } else if (ride.paymentMethod === "cash") {
      if (ride.paymentStatus === "paid") todayCashRecordedKobo += ride.fareKobo;
      else todayCashPendingKobo += ride.fareKobo;
    }
  }

  let todayDrivingSeconds = 0;
  let todayPickupSeconds = 0;
  const seen = new Set<string>();
  for (const ride of startedToday) {
    if (seen.has(ride.id) || !ride.startedAt) continue;
    seen.add(ride.id);
    const start = Math.max(ride.startedAt.getTime(), dayStart.getTime());
    const end = Math.min((ride.completedAt ?? now).getTime(), now.getTime());
    if (end > start) todayDrivingSeconds += Math.floor((end - start) / 1000);
    if (ride.acceptedAt) {
      const pickupStart = Math.max(ride.acceptedAt.getTime(), dayStart.getTime());
      const pickupEnd = Math.min(ride.startedAt.getTime(), now.getTime());
      if (pickupEnd > pickupStart) todayPickupSeconds += Math.floor((pickupEnd - pickupStart) / 1000);
    }
  }

  return {
    todayCompletedTrips: completedToday.length,
    todayFareReleasedKobo: todayFareReleasedKobo.toString(),
    todayCashRecordedKobo: todayCashRecordedKobo.toString(),
    todayCashPendingKobo: todayCashPendingKobo.toString(),
    todayPickupSeconds,
    todayDrivingSeconds,
    todayAvailableSeconds: 0,
    walletAvailableKobo: wallet ? wallet.availableKobo.toString() : null,
    walletHeldKobo: wallet ? wallet.heldKobo.toString() : null,
    activeTripId: startedToday.find((ride) => ride.status === "in_progress")?.id ?? null
  };
}

/* --------------------------------------------------------------- road routes --- */

const routeCache = new Map<string, { expiresAt: number; route: DriveRoute | null }>();

function osrmBaseUrl() {
  const configured = infraConfig().osrm?.url;
  if (!configured) return null;
  const trimmed = configured.replace(/\/$/, "");
  // The deployment value may be written as host:port without a scheme; fetch()
  // requires a scheme, so normalise it here instead of silently treating routing
  // as unavailable. Credentials are never logged.
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function describeManeuver(step: {
  name?: string;
  maneuver?: { type?: string; modifier?: string };
}) {
  const name = step.name?.trim() || "the road";
  const type = step.maneuver?.type ?? "";
  const modifier = step.maneuver?.modifier ?? "";
  if (type === "depart") return `Start on ${name}`;
  if (type === "arrive") return "Arrive at the destination";
  if (type === "roundabout" || type === "rotary") return `Take the roundabout onto ${name}`;
  if (type === "merge") return `Merge ${modifier ? `${modifier} ` : ""}onto ${name}`.replace(/\s+/g, " ");
  if (type === "fork") return `Keep ${modifier || "ahead"} onto ${name}`.replace(/\s+/g, " ");
  if (type === "end of road") return `At the end of the road, turn ${modifier || "ahead"} onto ${name}`;
  if (type === "new name" || type === "continue") return `Continue onto ${name}`;
  if (modifier) return `Turn ${modifier} onto ${name}`;
  return `Continue on ${name}`;
}

async function routeWithGeometry(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  cacheKey: string,
  cacheSeconds = 30
): Promise<DriveRoute | null> {
  const cached = routeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.route;

  const base = osrmBaseUrl();
  if (!base) {
    routeCache.set(cacheKey, { expiresAt: Date.now() + 15_000, route: null });
    return null;
  }

  const path = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  try {
    const response = await fetch(
      `${base}/route/v1/driving/${path}?overview=full&geometries=geojson&alternatives=false&steps=true`,
      { cache: "no-store", signal: AbortSignal.timeout(6000) }
    );
    if (!response.ok) {
      routeCache.set(cacheKey, { expiresAt: Date.now() + 15_000, route: null });
      return null;
    }
    const body = (await response.json()) as {
      code?: string;
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: Array<[number, number]> };
        legs?: Array<{
          steps?: Array<{
            name?: string;
            distance?: number;
            duration?: number;
            maneuver?: { type?: string; modifier?: string };
          }>;
        }>;
      }>;
    };
    const best = body.routes?.[0];
    const coordinates = best?.geometry?.coordinates;
    if (
      body.code !== "Ok" ||
      !best ||
      typeof best.distance !== "number" ||
      typeof best.duration !== "number" ||
      !Array.isArray(coordinates) ||
      coordinates.length < 2
    ) {
      routeCache.set(cacheKey, { expiresAt: Date.now() + 15_000, route: null });
      return null;
    }

    const steps = (best.legs?.[0]?.steps ?? []).map((step) => ({
      instruction: describeManeuver(step),
      maneuver: [step.maneuver?.type, step.maneuver?.modifier].filter(Boolean).join(" "),
      distanceMeters: Math.round(step.distance ?? 0),
      durationSeconds: Math.round(step.duration ?? 0)
    }));

    const route: DriveRoute = {
      provider: "osrm",
      profile: "driving",
      distanceMeters: Math.round(best.distance),
      durationSeconds: Math.round(best.duration),
      geometry: coordinates.map(([lng, lat]) => ({ lat, lng })),
      steps
    };
    routeCache.set(cacheKey, { expiresAt: Date.now() + cacheSeconds * 1000, route });
    return route;
  } catch {
    routeCache.set(cacheKey, { expiresAt: Date.now() + 15_000, route: null });
    return null;
  }
}

/** Public road route between two bookable landmarks. No coordinates are invented. */
export async function getPublicDriveRoute(pickupId: string | null | undefined, dropoffId: string | null | undefined) {
  const pickup = findPlace(pickupId);
  const dropoff = findPlace(dropoffId);
  if (!pickup || !dropoff || pickup.id === dropoff.id) {
    throw new ApiError(400, "invalid_route", "Choose two different Lagos landmarks.");
  }
  const key = `places:${pickup.id}:${dropoff.id}`;
  const route = await routeWithGeometry(pickup, dropoff, key, 60);
  return {
    pickup: { id: pickup.id, label: pickup.label, lat: pickup.lat, lng: pickup.lng },
    dropoff: { id: dropoff.id, label: dropoff.label, lat: dropoff.lat, lng: dropoff.lng },
    route,
    reason: route ? null : "routing_unavailable"
  };
}

/**
 * One ride's tracking state for its rider, its assigned driver, or an admin.
 * Older or closed rides expose no coordinates. The caller cannot read another
 * account's session because the ride ownership check runs first.
 */
export async function getRideTracking(input: {
  userId: string;
  isAdmin: boolean;
  rideId: string;
}) {
  const ride = await loadRide(prisma, input.rideId);
  const assignedUserId = ride.driver?.user.id ?? null;
  if (!input.isAdmin && ride.riderId !== input.userId && assignedUserId !== input.userId) {
    throw new ApiError(403, "forbidden", "This ride belongs to another account.");
  }

  const base = {
    rideId: ride.id,
    rideNumber: ride.rideNumber,
    status: ride.status,
    pickup: { label: ride.pickupLabel, address: ride.pickupAddress, lat: ride.pickupLat, lng: ride.pickupLng },
    dropoff: { label: ride.dropoffLabel, address: ride.dropoffAddress, lat: ride.dropoffLat, lng: ride.dropoffLng },
    driver: ride.driver
      ? {
          name: ride.driver.user.name,
          vehicleMake: ride.driver.vehicleMake,
          vehicleModel: ride.driver.vehicleModel,
          vehiclePlate: ride.driver.vehiclePlate
        }
      : null,
    serverTime: new Date().toISOString()
  };

  if (ride.status === "completed" || ride.status === "cancelled" || ride.status === "requested") {
    return {
      ...base,
      closed: ride.status === "completed" || ride.status === "cancelled",
      leg: null,
      latest: null,
      stale: true,
      ageSeconds: null,
      route: null,
      reason:
        ride.status === "requested"
          ? "waiting_for_driver"
          : "tracking_closed"
    };
  }

  const latest = await prisma.locationPing.findFirst({
    where: { sessionRef: `drive:${ride.id}`, userId: assignedUserId ?? undefined },
    orderBy: { capturedAt: "desc" },
    select: {
      latitude: true,
      longitude: true,
      accuracyM: true,
      speedMps: true,
      headingDeg: true,
      capturedAt: true,
      source: true
    }
  });

  const now = new Date();
  const ageMs = latest ? now.getTime() - latest.capturedAt.getTime() : null;
  const stale = ageMs === null || ageMs > DRIVE_TRACKING_STALE_MS;
  const leg = ride.status === "in_progress" ? "dropoff" : "pickup";
  const target =
    leg === "dropoff"
      ? { label: ride.dropoffLabel, lat: ride.dropoffLat, lng: ride.dropoffLng }
      : { label: ride.pickupLabel, lat: ride.pickupLat, lng: ride.pickupLng };

  const route =
    latest && !stale
      ? await routeWithGeometry(
          { lat: latest.latitude, lng: latest.longitude },
          { lat: target.lat, lng: target.lng },
          `ride:${ride.id}:${leg}:${latest.latitude.toFixed(4)}:${latest.longitude.toFixed(4)}`,
          10
        ).catch(() => null)
      : null;

  return {
    ...base,
    closed: false,
    leg,
    target,
    latest: latest
      ? {
          lat: latest.latitude,
          lng: latest.longitude,
          accuracyM: latest.accuracyM,
          speedMps: latest.speedMps,
          headingDeg: latest.headingDeg,
          capturedAt: latest.capturedAt.toISOString(),
          source: latest.source
        }
      : null,
    stale,
    ageSeconds: ageMs === null ? null : Math.max(0, Math.floor(ageMs / 1000)),
    route,
    reason: !latest ? "no_location" : stale ? "location_stale" : route ? null : "routing_unavailable"
  };
}

/* --------------------------------------------------- passenger verification --- */

/**
 * SCHEMA GAP (reported, not simulated): `Ride` has no `verificationPinHash` or
 * `verificationRequired` column. The rider receives a server-derived 4-digit code
 * from a random per-ride salt stored only in the server-side SystemEvent log; the
 * code itself is never stored. Verification is required before starting a trip
 * once the rider has opened the code, so existing API clients that never request a
 * code keep their previous state-machine behaviour. A production schema should add
 * `Ride.verificationPinHash` and set it atomically at booking.
 */
function verificationCodeFor(salt: string, rideId: string) {
  const digest = createHmac("sha256", salt).update(rideId).digest();
  return String(digest.readUInt32BE(0) % 10_000).padStart(4, "0");
}

async function isVerificationRequired(tx: Db, rideId: string) {
  const record = await tx.systemEvent.findFirst({
    where: { type: VERIFICATION_EVENT_TYPE, entity: "Ride", entityId: rideId },
    select: { id: true }
  });
  return Boolean(record);
}

function isPassengerVerified(events: Array<{ label: string }>) {
  return events.some((event) => event.label === PASSENGER_VERIFIED_LABEL);
}

export async function getRideVerificationCode(input: { userId: string; rideId: string }) {
  const ride = await loadRide(prisma, input.rideId);
  if (ride.riderId !== input.userId) {
    throw new ApiError(403, "forbidden", "Only the rider on this trip can see its verification code.");
  }
  if (ride.status === "completed" || ride.status === "cancelled") {
    throw new ApiError(409, "ride_closed", "This ride is no longer active.");
  }

  const existing = await prisma.systemEvent.findFirst({
    where: { type: VERIFICATION_EVENT_TYPE, entity: "Ride", entityId: ride.id },
    select: { payload: true, createdAt: true }
  });
  const payload = (existing?.payload as { salt?: unknown; issuedAt?: unknown } | null) ?? null;
  let salt = typeof payload?.salt === "string" ? payload.salt : "";
  let issuedAt = existing?.createdAt ?? new Date();
  if (!salt) {
    salt = randomBytes(16).toString("hex");
    const created = await prisma.systemEvent.create({
      data: {
        type: VERIFICATION_EVENT_TYPE,
        actorId: input.userId,
        entity: "Ride",
        entityId: ride.id,
        payload: { salt, issuedAt: issuedAt.toISOString() }
      }
    });
    issuedAt = created.createdAt;
  }

  return {
    rideId: ride.id,
    code: verificationCodeFor(salt, ride.id),
    issuedAt: issuedAt.toISOString(),
    verified: isPassengerVerified(ride.events),
    required: true
  };
}

export async function verifyPassenger(input: { userId: string; rideId: string; code: string }) {
  const driver = await getDriverForUser(input.userId);
  const provided = input.code.trim();
  if (!/^\d{4}$/.test(provided)) {
    throw new ApiError(400, "invalid_code", "Enter the 4-digit code shown on the passenger's trip screen.");
  }

  return prisma.$transaction(async (tx) => {
    const ride = await loadRide(tx, input.rideId);
    if (ride.driverId !== driver.id) throw new ApiError(403, "forbidden", "This ride is assigned to another driver.");
    if (!["driver_assigned", "driver_arriving"].includes(ride.status)) {
      throw new ApiError(409, "verification_not_available", "Passenger verification is only available before the trip starts.");
    }
    if (isPassengerVerified(ride.events)) {
      return { verified: true, alreadyVerified: true, ride };
    }

    const record = await tx.systemEvent.findFirst({
      where: { type: VERIFICATION_EVENT_TYPE, entity: "Ride", entityId: ride.id },
      select: { payload: true }
    });
    const salt = (record?.payload as { salt?: unknown } | null)?.salt;
    if (typeof salt !== "string" || !salt) {
      throw new ApiError(
        409,
        "verification_not_issued",
        "The passenger has not opened their trip code yet. Ask them to refresh their trip screen."
      );
    }

    const expected = verificationCodeFor(salt, ride.id);
    const matches =
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!matches) {
      await recordAudit({
        tx,
        actorId: input.userId,
        action: "ride.passenger_verification_failed",
        entity: "Ride",
        entityId: ride.id,
        metadata: { driverId: driver.id }
      });
      throw new ApiError(400, "invalid_passenger_code", "That code does not match this passenger's trip.");
    }

    const event = await addRideEvent(tx, {
      rideId: ride.id,
      status: ride.status,
      label: PASSENGER_VERIFIED_LABEL,
      description: "The driver confirmed the passenger's 4-digit ride code before starting.",
      actorId: input.userId
    });
    await recordAudit({
      tx,
      actorId: input.userId,
      action: "ride.passenger_verified",
      entity: "Ride",
      entityId: ride.id,
      metadata: { driverId: driver.id }
    });
    return { verified: true, alreadyVerified: false, verifiedAt: event.createdAt, ride: await loadRide(tx, ride.id) };
  });
}

/* ------------------------------------------------------------ saved places --- */

export const MAX_SAVED_PLACES = 20;

export async function listSavedPlaces(userId: string) {
  return prisma.savedPlace.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

export async function savePlace(input: { userId: string; nickname: string; placeId: string }) {
  const nickname = input.nickname.trim().replace(/\s+/g, " ");
  if (nickname.length < 2 || nickname.length > 40) {
    throw new ApiError(400, "invalid_nickname", "Give this place a name between 2 and 40 characters.");
  }
  if (!findPlace(input.placeId)) {
    throw new ApiError(400, "unknown_place", "Choose one of the Lagos landmarks NaijaDrive can price.");
  }

  const count = await prisma.savedPlace.count({ where: { userId: input.userId } });
  if (count >= MAX_SAVED_PLACES) {
    throw new ApiError(409, "too_many_saved_places", `You can save up to ${MAX_SAVED_PLACES} places. Remove one first.`);
  }

  const existing = await prisma.savedPlace.findFirst({
    where: { userId: input.userId, nickname: { equals: nickname, mode: "insensitive" } }
  });
  if (existing) {
    throw new ApiError(409, "nickname_taken", `You already have a saved place called “${existing.nickname}”.`);
  }

  const place = await prisma.savedPlace.create({
    data: { userId: input.userId, nickname, placeId: input.placeId }
  });
  await recordAudit({
    actorId: input.userId,
    action: "drive.saved_place_created",
    entity: "SavedPlace",
    entityId: place.id,
    metadata: { nickname, placeId: input.placeId }
  });
  return place;
}

/**
 * Rename a saved place, or re-point it at a different bookable landmark. Scoped by
 * userId in the lookup, so one account can never edit another's saved places.
 */
export async function updateSavedPlace(input: {
  userId: string;
  id: string;
  nickname?: string;
  placeId?: string;
}) {
  const current = await prisma.savedPlace.findFirst({
    where: { id: input.id, userId: input.userId }
  });
  if (!current) {
    throw new ApiError(404, "saved_place_not_found", "That saved place is not on this account.");
  }

  const nickname =
    input.nickname === undefined ? current.nickname : input.nickname.trim().replace(/\s+/g, " ");
  if (nickname.length < 2 || nickname.length > 40) {
    throw new ApiError(400, "invalid_nickname", "Give this place a name between 2 and 40 characters.");
  }
  if (input.placeId !== undefined && !findPlace(input.placeId)) {
    throw new ApiError(400, "unknown_place", "Choose one of the Lagos landmarks NaijaDrive can price.");
  }

  const clash = await prisma.savedPlace.findFirst({
    where: {
      userId: input.userId,
      nickname: { equals: nickname, mode: "insensitive" },
      NOT: { id: input.id }
    }
  });
  if (clash) {
    throw new ApiError(409, "nickname_taken", `You already have a saved place called “${clash.nickname}”.`);
  }

  const place = await prisma.savedPlace.update({
    where: { id: input.id },
    data: { nickname, ...(input.placeId !== undefined ? { placeId: input.placeId } : {}) }
  });
  await recordAudit({
    actorId: input.userId,
    action: "drive.saved_place_updated",
    entity: "SavedPlace",
    entityId: place.id,
    metadata: { nickname: place.nickname, placeId: place.placeId }
  });
  return place;
}

export async function deleteSavedPlace(input: { userId: string; id: string }) {
  // Scoped by userId in the delete itself, so one account can never remove another's.
  const deleted = await prisma.savedPlace.deleteMany({ where: { id: input.id, userId: input.userId } });
  if (deleted.count === 0) {
    throw new ApiError(404, "saved_place_not_found", "That saved place is not on this account.");
  }
  await recordAudit({
    actorId: input.userId,
    action: "drive.saved_place_deleted",
    entity: "SavedPlace",
    entityId: input.id
  });
  return { deleted: true };
}

/*
 * The durable sweeper lives in the worker: lib/infra/schedules.ts registers a
 * BullMQ job every 30s and scripts/infra-worker.ts runs releaseExpiredAssignments
 * through the same conditional update used here.
 *
 * The in-process timer is a fallback for environments with no queue backend
 * (CI, a developer without Docker), where it is the only thing that can return
 * an idle ride to the queue. Where a queue exists the timer is not started, so
 * two web processes cannot both sweep and no timer is left unmanaged.
 */
if (!isQueueConfigured()) {
  startDriveSweeper(releaseExpiredAssignments);
}
