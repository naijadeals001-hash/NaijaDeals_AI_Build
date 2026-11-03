import { randomBytes } from "node:crypto";
import type { Prisma, RidePaymentMethod, RideStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import {
  DRIVE_ASSIGNMENT_GRACE_MINUTES,
  findPlace,
  nextAssignmentDeadline,
  quoteDrive
} from "@/lib/config/drive";
import { ensureWallet } from "@/lib/payments/service";
import { recordAudit } from "./audit.service";
import { startDriveSweeper } from "./drive-sweeper";
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
  driver_assigned: ["driver_arriving", "in_progress", "cancelled"],
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
  return prisma.$transaction(async (tx) => {
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
    if (ride.driverId !== driver.id) throw new ApiError(403, "forbidden", "This ride is assigned to another driver.");
    if (ride.status === "completed" && input.status === "completed") {
      return { outcome: "ok" as const, ride };
    }

    assertRideTransition(ride.status, input.status);
    if (input.status === "completed") {
      if (ride.status !== "in_progress") throw new ApiError(409, "trip_not_started", "Start the trip before completing it.");
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
  const stale = await prisma.ride.findMany({
    where: {
      status: { in: ["driver_assigned", "driver_arriving"] },
      assignmentExpiresAt: { lt: now }
    },
    select: { id: true, rideNumber: true, status: true, driverId: true },
    orderBy: { assignmentExpiresAt: "asc" },
    take: 25
  });

  const released: string[] = [];
  for (const ride of stale) {
    try {
      const changed = await prisma.$transaction((tx) => releaseExpiredRide(tx, ride, now));
      if (changed) released.push(changed);
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
  await releaseExpiredAssignments();
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
      take: 10
    })
  ]);
  return { driver, open, active, recent };
}

export async function listAllRides() {
  await releaseExpiredAssignments();
  return prisma.ride.findMany({
    include: rideInclude,
    orderBy: { createdAt: "desc" },
    take: 100
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
 * Start the background expiry sweeper the first time this module is loaded by a Node
 * server. Read-time sweeps still exist; this is what guarantees an idle ride returns
 * even when no client polls. The timer is unref'd and guarded once per process.
 */
startDriveSweeper(releaseExpiredAssignments);
