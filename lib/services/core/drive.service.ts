import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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
    await lockRideVerification(tx, input.rideId);
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

    await invalidateRideVerification(tx, ride.id, "Ride cancelled.");
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
    // Lock order for every transaction that mutates a ride's verification state:
    // ride-verification advisory lock -> Ride row -> RideVerification row. Taking
    // the same lock here means a release, expiry, cancellation, support reset and
    // this acceptance cannot interleave their ride/verification writes.
    await lockRideVerification(tx, input.rideId);
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
        // A new assignment always issues a protected record below. The
        // pre-enforcement marker belongs to the enforcement-time assignment only,
        // so it must not survive into this one.
        pickupVerificationLegacyAt: null,
        // The clock starts now: arrive, or the ride goes back to the queue.
        assignmentExpiresAt: nextAssignmentDeadline()
      }
    });
    if (accepted.count === 0) {
      throw new ApiError(409, "ride_taken", "Another driver has already accepted this ride, or it is no longer available.");
    }

    // The pickup code belongs to the assignment, not to an event log. Rotating
    // here means a re-assigned ride never reuses the previous driver's code. The
    // attempt budget is carried across reassignment: otherwise a driver could
    // release and re-accept the same ride to reset the five-attempt cap.
    await issueRideVerification(tx, ride.id, { carryAttempts: true });

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
    // Repeated identical transitions are idempotent. In particular a duplicate
    // start tap returns the already-started ride without a second event, payment
    // release or start timestamp; it is not a new transition.
    if (ride.status === input.status) {
      return { outcome: "ok" as const, ride };
    }

    assertRideTransition(ride.status, input.status);
    if (input.status === "completed") {
      if (ride.status !== "in_progress") throw new ApiError(409, "trip_not_started", "Start the trip before completing it.");
    }
    let startAuthorization: StartAuthorizationBasis | null = null;
    if (input.status === "in_progress") {
      // Authoritative gate: the protected record must show a successful code
      // verification in the same transaction that moves the ride forward. Only the
      // one-time pre-enforcement marker can authorise a missing record; every other
      // missing record is refused and needs the audited support recovery flow.
      startAuthorization = await requireVerifiedRide(tx, ride, driver.userId);
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
    if (startAuthorization?.basis === "pre_enforcement_assignment") {
      // Bounded compatibility transition: the assignment existed when enforcement
      // began, so there is nothing to verify. Record the exception with its exact
      // basis and marker timestamp instead of pretending a code was checked.
      await addRideEvent(tx, {
        rideId: ride.id,
        status: "in_progress",
        label: "Legacy pickup start",
        description:
          "This trip was matched before protected pickup verification was enforced. No pickup code was issued for that assignment, and the start was recorded as a pre-enforcement exception.",
        actorId: input.userId
      });
      await recordAudit({
        tx,
        actorId: input.userId,
        action: "ride.legacy_pickup_start_without_verification",
        entity: "Ride",
        entityId: ride.id,
        metadata: {
          rideNumber: ride.rideNumber,
          reason: "no_verification_record_for_pre_enforcement_assignment",
          authorizationBasis: "pre_enforcement_assignment",
          legacyMarkerAt: startAuthorization.legacyMarkerAt.toISOString(),
          assignedAt: ride.acceptedAt?.toISOString() ?? null
        }
      });
    }
    await recordSystemEvent({
      tx,
      type: `ride.${input.status}`,
      actorId: input.userId,
      entity: "Ride",
      entityId: ride.id,
      payload: {
        paymentReference,
        ...(startAuthorization ? { authorizationBasis: startAuthorization.basis } : {})
      }
    });
    await recordAudit({
      tx,
      actorId: input.userId,
      action: `ride.${input.status}`,
      entity: "Ride",
      entityId: ride.id,
      metadata: {
        paymentReference,
        ...(startAuthorization ? startAuthorizationMetadata(startAuthorization) : {})
      }
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
    await lockRideVerification(tx, input.rideId);
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
        assignmentExpiresAt: null,
        // The pre-enforcement exemption is bound to the assignment that existed at
        // enforcement. Once that assignment ends it cannot authorise this ride again.
        pickupVerificationLegacyAt: null
      }
    });
    if (updated.count === 0) throw new ApiError(409, "ride_changed", "The ride changed while releasing. Reload and try again.");

    await invalidateRideVerification(tx, ride.id, "Driver released the assignment.");
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
  await lockRideVerification(tx, ride.id);
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
      assignmentExpiresAt: null,
      // The pre-enforcement exemption ends with the assignment it described.
      pickupVerificationLegacyAt: null
    }
  });
  if (updated.count === 0) return null;

  await invalidateRideVerification(tx, ride.id, "Assignment expired.");
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

  // Attach only the verification state the driver UI needs. The protected record's
  // hash and salt are never selected here, so no driver response can expose them.
  const activeWithVerification = await Promise.all(
    active.map(async (ride) => {
      const record = await prisma.rideVerification.findUnique({
        where: { rideId: ride.id },
        select: {
          expiresAt: true,
          attemptCount: true,
          maxAttempts: true,
          verifiedAt: true,
          invalidatedAt: true
        }
      });
      return {
        ...ride,
        verification: safeVerification(record, now, {
          legacyEligible: Boolean(ride.pickupVerificationLegacyAt)
        })
      };
    })
  );

  const [presence, summary, rating] = await Promise.all([
    presenceForDriver(driver, now),
    driverSummary(driver, now),
    participantRatingSummary(driver.userId, "customer")
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
      suspendedReason: driver.suspendedReason,
      /** Average of real customer ratings only; null until a trip is rated. */
      rating
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

/**
 * Control Center queue for pickup-code support.
 *
 * Returns active assigned trips only, with verification state and a legacy flag
 * but never the salt, hash or raw code. The route requires `rides:write`, the same
 * permission the reset/verify action requires.
 */
export async function listRideVerificationSupport() {
  await releaseExpiredAssignments();
  const rides = await prisma.ride.findMany({
    where: { status: { in: ["driver_assigned", "driver_arriving"] } },
    select: {
      id: true,
      rideNumber: true,
      status: true,
      acceptedAt: true,
      assignmentExpiresAt: true,
      pickupVerificationLegacyAt: true,
      rider: { select: { id: true, name: true } },
      driver: { select: { id: true, vehiclePlate: true, user: { select: { id: true, name: true } } } }
    },
    orderBy: { acceptedAt: "asc" },
    take: 100
  });
  if (rides.length === 0) return [];
  const records = await prisma.rideVerification.findMany({
    where: { rideId: { in: rides.map((ride) => ride.id) } },
    select: {
      rideId: true,
      expiresAt: true,
      attemptCount: true,
      maxAttempts: true,
      verifiedAt: true,
      invalidatedAt: true,
      lastAttemptAt: true
    }
  });
  const byRide = new Map(records.map((record) => [record.rideId, record]));
  const now = new Date();
  return rides.map((ride) => {
    const record = byRide.get(ride.id) ?? null;
    return {
      rideId: ride.id,
      rideNumber: ride.rideNumber,
      status: ride.status,
      acceptedAt: ride.acceptedAt?.toISOString() ?? null,
      assignmentExpiresAt: ride.assignmentExpiresAt?.toISOString() ?? null,
      rider: { name: ride.rider.name },
      driver: ride.driver
        ? {
            name: ride.driver.user.name,
            vehiclePlate: ride.driver.vehiclePlate
          }
        : null,
      verification: safeVerification(record, now, {
        legacyEligible: Boolean(ride.pickupVerificationLegacyAt)
      })
    };
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
const PASSENGER_VERIFIED_LABEL = "Passenger verified";

/* --------------------------------------------------- pickup verification --- */

/**
 * PICKUP-CODE SECURITY MODEL — read this before changing it.
 *
 * The four-digit code is derived, not stored:
 *
 *   verificationCodeFor(secretV, rideId, salt, keyVersion)
 *     = HMAC-SHA256(key = secretV,
 *                   message = `naijadrive-pickup-verification:v1:k{keyVersion}:{rideId}:{salt}:{counter}`)
 *       rejection-sampled from 32 bits into 0000..9999.
 *
 * `RideVerification.salt` is CSPRNG output, but it is public to the database. A
 * database-only reader cannot compute the code because the HMAC key is a server
 * secret that never enters the database or any response. The stored verifier is
 * `scrypt(code, salt + keyVersion + secret)`, so the 10,000-candidate space
 * cannot be brute-forced offline from a database dump either. `algorithm` and
 * `keyVersion` are recorded so the exact key can be selected after rotation.
 *
 * Key configuration is explicit and fail-closed:
 *   - `DRIVE_PICKUP_VERIFICATION_KEY_VERSION` names the version used for new
 *     records;
 *   - `DRIVE_PICKUP_VERIFICATION_KEY_V<version>` supplies that version's secret
 *     (minimum 32 characters; generate with `openssl rand -hex 32`).
 * A missing, invalid or short key makes issuance, retrieval and verification
 * return 503 `verification_key_unavailable`. There is deliberately no default
 * and no fallback to the old salt-only derivation.
 *
 * Rotation: add the new version's key, point KEY_VERSION at it and restart. New
 * records use the new key; records already issued keep verifying with the key
 * named by their `keyVersion`. Keep an old key configured until every record
 * that used it has expired or been invalidated (maximum code TTL plus the
 * assignment grace). Removing a still-needed key fails closed and requires a
 * rider/support reset.
 *
 * Legacy records (`keyVersion IS NULL`) were derived from the salt alone. The
 * runtime never derives or verifies them. The rider's read path replaces an
 * active legacy record with a keyed one (audited), the rider reset and support
 * reset issue a keyed record, and the driver verification path returns 409
 * `verification_reissue_required` without consuming an attempt. Records that
 * are already verified or no longer active are left as-is because they cannot
 * disclose a usable code.
 *
 * Boundary (not a claim of protection): if the database AND the server secret
 * are both compromised, every active code is recoverable. So is the case where
 * an attacker can execute code or read process memory on the application
 * server. This design removes the database-only disclosure path; it does not
 * make a 4-digit code cryptographically unguessable at the endpoint, so the
 * expiry, five-attempt cap, per-record cooldown, single-use start transition
 * and support rate limits remain mandatory.
 */
export const RIDE_VERIFICATION_CODE_LENGTH = 4;
export const RIDE_VERIFICATION_MAX_ATTEMPTS = 5;
export const RIDE_VERIFICATION_TTL_MS = 2 * 60 * 60 * 1000;
export const RIDE_VERIFICATION_ATTEMPT_COOLDOWN_MS = 1_500;
/**
 * A rider may re-issue an expired or locked code without support. The limit keeps
 * a rider (or someone holding their session) from repeatedly invalidating the code
 * the driver is about to use. Support resets are separately privileged and audited.
 */
export const RIDE_VERIFICATION_MAX_RIDER_RESETS_PER_WINDOW = 3;
export const RIDE_VERIFICATION_RIDER_RESET_WINDOW_MS = 10 * 60 * 1000;
/**
 * Support reset/verify is privileged and audited, but it also rotates or bypasses
 * a rider's pickup code. Bound it per ride and per operator using the AuditLog
 * rows every successful action already writes, so the limiter has no separate
 * in-memory state and survives a process restart.
 */
export const RIDE_VERIFICATION_SUPPORT_WINDOW_MS = 10 * 60 * 1000;
export const RIDE_VERIFICATION_SUPPORT_MAX_PER_RIDE = 3;
export const RIDE_VERIFICATION_SUPPORT_MAX_PER_OPERATOR = 20;
export const RIDE_VERIFICATION_SUPPORT_ACTIONS = [
  "ride.verification_support_reset",
  "ride.verification_support_verified"
] as const;
/**
 * Algorithm versioning is deliberate. `scrypt-hmac-sha256-v1`/`-v2` were the
 * pre-key salt-only schemes; they are recognised only so legacy rows can be
 * replaced, never used to derive or verify. `hmac-sha256-pepper-v1` is the
 * server-keyed scheme; the key itself is versioned separately in `keyVersion`.
 */
const RIDE_VERIFICATION_ALGORITHM = "hmac-sha256-pepper-v1";
const RIDE_VERIFICATION_KEY_VERSION_ENV = "DRIVE_PICKUP_VERIFICATION_KEY_VERSION";
const RIDE_VERIFICATION_KEY_ENV_PREFIX = "DRIVE_PICKUP_VERIFICATION_KEY_V";
const RIDE_VERIFICATION_MIN_KEY_CHARS = 32;
const RIDE_VERIFICATION_HASH_BYTES = 32;
const RIDE_VERIFICATION_MESSAGE_DOMAIN = "naijadrive-pickup-verification:v1";

type VerificationRecord = {
  expiresAt: Date;
  attemptCount: number;
  maxAttempts: number;
  verifiedAt: Date | null;
  invalidatedAt: Date | null;
  algorithm?: string;
  /** Present on full records; partial UI selects may omit it. */
  keyVersion?: number | null;
};

export type SafeRideVerification = {
  required: boolean;
  verified: boolean;
  expired: boolean;
  locked: boolean;
  attemptsRemaining: number;
  expiresAt: string | null;
  verifiedAt: string | null;
  /**
   * True only when the ride carries the one-time enforcement marker written by the
   * cutover migration AND has no active record. Such a pre-enforcement assignment
   * is not forced to verify retroactively; starting it is audited as an exception.
   */
  legacy: boolean;
  /**
   * True when this assignment should have a protected record but none exists and
   * it is not pre-enforcement. The server refuses to start or issue a code on its
   * own; an authorised support reset/verify is required.
   */
  recoveryRequired: boolean;
};

const RIDE_VERIFICATION_CODE_SPACE = 10 ** RIDE_VERIFICATION_CODE_LENGTH;

/**
 * Fail closed with one stable, non-secret-revealing error. The message never
 * includes an env value, a key version's secret or the configured env names.
 */
function verificationKeyUnavailable() {
  return new ApiError(
    503,
    "verification_key_unavailable",
    "Pickup-code protection is temporarily unavailable on this server. Nothing was issued or verified; try again later or contact NaijaDrive support."
  );
}

function parseVerificationKeyVersion(value: string | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^[1-9]\d{0,5}$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** Read one version's secret. No default, no fallback, minimum length enforced. */
function verificationKeySecret(version: number, env: NodeJS.ProcessEnv = process.env): string {
  const secret = env[`${RIDE_VERIFICATION_KEY_ENV_PREFIX}${version}`]?.trim() ?? "";
  if (secret.length < RIDE_VERIFICATION_MIN_KEY_CHARS) throw verificationKeyUnavailable();
  return secret;
}

/** Current key for new records. Never cached: rotation is environment driven. */
function activeVerificationKey(env: NodeJS.ProcessEnv = process.env) {
  const version = parseVerificationKeyVersion(env[RIDE_VERIFICATION_KEY_VERSION_ENV]);
  if (version === null) throw verificationKeyUnavailable();
  return { version, secret: verificationKeySecret(version, env) };
}

/**
 * Key for an existing record's recorded version. A NULL/unknown version is not
 * resolvable on purpose: legacy salt-only rows must never be derived with a
 * fallback key, and a retired key must fail closed rather than guess.
 */
function verificationKeyForRecord(
  record: { keyVersion: number | null },
  env: NodeJS.ProcessEnv = process.env
) {
  const version = record.keyVersion;
  if (!version || !Number.isInteger(version) || version < 1) throw verificationKeyUnavailable();
  return { version, secret: verificationKeySecret(version, env) };
}

/**
 * Derive the 4-digit pickup code from the server secret, per-ride salt and
 * recorded key version. The salt alone is public to the database, so the HMAC
 * key is what makes a database dump insufficient. Rejection sampling keeps all
 * 10,000 codes equally likely (rejection probability 0.00017%).
 */
function verificationCodeFor(input: {
  secret: string;
  salt: string;
  rideId: string;
  keyVersion: number;
  algorithm: string;
}) {
  if (input.algorithm !== RIDE_VERIFICATION_ALGORITHM) {
    throw new ApiError(500, "verification_algorithm_unsupported", "This pickup code uses an unknown algorithm version.");
  }
  const limit = Math.floor(0x1_0000_0000 / RIDE_VERIFICATION_CODE_SPACE) * RIDE_VERIFICATION_CODE_SPACE;
  const message = (counter: number) =>
    `${RIDE_VERIFICATION_MESSAGE_DOMAIN}:k${input.keyVersion}:${input.rideId}:${input.salt}:${counter}`;
  for (let counter = 0; counter < 32; counter += 1) {
    const digest = createHmac("sha256", input.secret).update(message(counter)).digest();
    const value = digest.readUInt32BE(0);
    if (value < limit) {
      return String(value % RIDE_VERIFICATION_CODE_SPACE).padStart(RIDE_VERIFICATION_CODE_LENGTH, "0");
    }
  }
  // Unreachable in practice (the chance of 32 consecutive rejections is ~1e-116).
  // Hashing another block keeps the function total without weakening the space.
  const fallback = createHmac("sha256", input.secret)
    .update(`${RIDE_VERIFICATION_MESSAGE_DOMAIN}:k${input.keyVersion}:${input.rideId}:${input.salt}:fallback`)
    .digest()
    .readUInt32BE(0);
  return String(fallback % RIDE_VERIFICATION_CODE_SPACE).padStart(RIDE_VERIFICATION_CODE_LENGTH, "0");
}

/**
 * Keyed verifier: the pepper is mixed into the scrypt salt as well. Without the
 * server secret a database reader cannot brute-force the 10,000 candidates
 * offline, and the unkeyed `scrypt(code, salt)` hash of the real code does not
 * match the stored value.
 */
function hashVerificationCode(code: string, salt: string, keyVersion: number, secret: string) {
  return scryptSync(code, `naijadrive-pickup-verifier:v1:k${keyVersion}:${salt}:${secret}`, RIDE_VERIFICATION_HASH_BYTES).toString(
    "hex"
  );
}

function safeVerification(
  record: VerificationRecord | null,
  now: Date = new Date(),
  options: { legacyEligible?: boolean } = {}
): SafeRideVerification {
  if (!record) {
    // Absence is no longer enough to call a ride legacy. Only the durable
    // pre-enforcement marker authorises that transition; every other missing
    // record fails closed and requires the audited support recovery flow.
    const legacy = Boolean(options.legacyEligible);
    return {
      required: false,
      verified: false,
      expired: false,
      locked: false,
      attemptsRemaining: 0,
      expiresAt: null,
      verifiedAt: null,
      legacy,
      recoveryRequired: !legacy
    };
  }
  const active = !record.invalidatedAt;
  const verified = active && Boolean(record.verifiedAt);
  const expired = active && !verified && record.expiresAt.getTime() <= now.getTime();
  const locked = active && !verified && record.attemptCount >= record.maxAttempts;
  return {
    required: active,
    verified,
    expired,
    locked,
    attemptsRemaining: Math.max(0, record.maxAttempts - record.attemptCount),
    expiresAt: active ? record.expiresAt.toISOString() : null,
    verifiedAt: verified && record.verifiedAt ? record.verifiedAt.toISOString() : null,
    legacy: false,
    recoveryRequired: false
  };
}

/** Serialise every verification operation for one ride on the same row lock. */
async function lockRideVerification(tx: Db, rideId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ride-verification:${rideId}`}))`;
}

/**
 * Issue (or rotate) the protected record. Called inside the driver-acceptance
 * transaction and by an audited support/rider reset. No caller receives the raw
 * code.
 *
 * `carryAttempts` is used by reassignment: the five-attempt budget belongs to the
 * ride, so releasing and accepting the same ride again must not restore a fresh
 * budget to a driver who already spent it. Only an explicit rider/support reset
 * clears attempts.
 */
async function issueRideVerification(
  tx: Db,
  rideId: string,
  options: { carryAttempts?: boolean } = {}
) {
  // Resolve the key before writing anything. A missing or invalid active key must
  // abort the enclosing transaction (acceptance, reset or support action) instead
  // of creating a record that nobody can derive or verify.
  const key = activeVerificationKey();
  const existing = options.carryAttempts
    ? await tx.rideVerification.findUnique({
        where: { rideId },
        select: { attemptCount: true, maxAttempts: true }
      })
    : null;
  const attemptCount = existing
    ? Math.min(existing.attemptCount, Math.max(existing.maxAttempts, RIDE_VERIFICATION_MAX_ATTEMPTS))
    : 0;
  const salt = randomBytes(16).toString("hex");
  const code = verificationCodeFor({
    secret: key.secret,
    salt,
    rideId,
    keyVersion: key.version,
    algorithm: RIDE_VERIFICATION_ALGORITHM
  });
  const now = new Date();
  const data = {
    codeHash: hashVerificationCode(code, salt, key.version, key.secret),
    salt,
    algorithm: RIDE_VERIFICATION_ALGORITHM,
    keyVersion: key.version,
    expiresAt: new Date(now.getTime() + RIDE_VERIFICATION_TTL_MS),
    attemptCount,
    maxAttempts: RIDE_VERIFICATION_MAX_ATTEMPTS,
    lastAttemptAt: null,
    verifiedAt: null,
    verifiedByUserId: null,
    invalidatedAt: null,
    invalidatedReason: null
  } satisfies Prisma.RideVerificationUpdateInput;
  return tx.rideVerification.upsert({
    where: { rideId },
    create: { rideId, ...data },
    update: data
  });
}

/** A released, expired or cancelled assignment cannot leave a usable code behind. */
async function invalidateRideVerification(tx: Db, rideId: string, reason: string) {
  await tx.rideVerification.updateMany({
    where: { rideId, invalidatedAt: null },
    data: {
      invalidatedAt: new Date(),
      invalidatedReason: reason.slice(0, 200),
      verifiedAt: null,
      verifiedByUserId: null
    }
  });
}

/**
 * The authorization basis recorded for every start. `passenger_code` is the
 * normal driver-entered code; `support_override` is an administrator who marked
 * the passenger verified; `pre_enforcement_assignment` is the only compatibility
 * path, and only the cutover marker can produce it. `verified_record` is a
 * verified row whose actor is no longer identifiable, retained so the value can
 * never be silently reported as a normal passenger-code start.
 */
type StartAuthorizationBasis =
  | { basis: "pre_enforcement_assignment"; legacyMarkerAt: Date }
  | { basis: "passenger_code"; verifiedAt: Date; verifiedByUserId: string | null }
  | { basis: "support_override"; verifiedAt: Date; verifiedByUserId: string }
  | { basis: "verified_record"; verifiedAt: Date; verifiedByUserId: null };

function startAuthorizationMetadata(authorization: StartAuthorizationBasis) {
  switch (authorization.basis) {
    case "pre_enforcement_assignment":
      return {
        authorizationBasis: authorization.basis,
        legacyMarkerAt: authorization.legacyMarkerAt.toISOString()
      };
    case "passenger_code":
    case "support_override":
    case "verified_record":
      return {
        authorizationBasis: authorization.basis,
        verifiedAt: authorization.verifiedAt.toISOString(),
        verifiedByUserId: authorization.verifiedByUserId
      };
  }
}

/**
 * The start transition is gated by the protected row inside the caller's
 * transaction. A code that is expired, locked or invalidated is refused.
 *
 * A missing row is refused unless the ride carries the durable marker written by
 * the enforcement migration for assignments that predate enforcement. That marker
 * is the only legacy evidence; a missing row on a newer assignment is an anomaly
 * and enters the audited support recovery flow instead of silently starting. The
 * caller writes the returned authorization basis to the ride event/audit trail.
 */
async function requireVerifiedRide(
  tx: Db,
  ride: { id: string; pickupVerificationLegacyAt: Date | null },
  driverUserId: string
): Promise<StartAuthorizationBasis> {
  await lockRideVerification(tx, ride.id);
  const record = await tx.rideVerification.findUnique({ where: { rideId: ride.id } });
  const now = new Date();
  if (!record) {
    if (ride.pickupVerificationLegacyAt) {
      return { basis: "pre_enforcement_assignment", legacyMarkerAt: ride.pickupVerificationLegacyAt };
    }
    throw new ApiError(
      409,
      "verification_record_missing",
      "The protected pickup code record is missing for this assignment. Support must issue a new code before this trip can start; the trip was not started."
    );
  }
  if (record.invalidatedAt) {
    throw new ApiError(
      409,
      "verification_not_issued",
      "The passenger has to open their trip screen to receive a pickup code before the trip can start."
    );
  }
  if (record.verifiedAt) {
    if (record.verifiedByUserId === driverUserId) {
      return { basis: "passenger_code", verifiedAt: record.verifiedAt, verifiedByUserId: record.verifiedByUserId };
    }
    if (record.verifiedByUserId) {
      return { basis: "support_override", verifiedAt: record.verifiedAt, verifiedByUserId: record.verifiedByUserId };
    }
    return { basis: "verified_record", verifiedAt: record.verifiedAt, verifiedByUserId: null };
  }
  if (record.expiresAt.getTime() <= now.getTime()) {
    throw new ApiError(
      409,
      "verification_expired",
      "This pickup code has expired. The rider can reset it from their trip screen, or support can reset it."
    );
  }
  if (record.attemptCount >= record.maxAttempts) {
    throw new ApiError(
      429,
      "verification_locked",
      "Too many incorrect pickup codes. The rider or support must reset the code before this trip can start."
    );
  }
  // An unverified legacy row cannot authorise a start and cannot be derived
  // safely. The rider's trip screen (or support) replaces it with a keyed record.
  // A keyed row with an unexpected algorithm tag is treated the same way.
  if (record.keyVersion === null || record.algorithm !== RIDE_VERIFICATION_ALGORITHM) {
    throw new ApiError(
      409,
      "verification_reissue_required",
      "This pickup code was issued before server-key protection was enabled and can no longer be used. Ask the rider to open their trip screen to receive a new code, or contact support."
    );
  }
  // Do not tell the driver to enter a code that the server cannot verify because
  // a key is missing or retired. Fail closed with the same 503 as the other paths.
  verificationKeyForRecord(record);
  throw new ApiError(
    409,
    "passenger_verification_required",
    "Verify the passenger's pickup code before starting the trip."
  );
}

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
 * Resolve the rider's protected record, issuing a keyed replacement when the
 * stored record cannot produce a usable, server-keyed code:
 *
 *  - invalidated: the assignment ended; a fresh code belongs to the new state;
 *  - legacy `keyVersion IS NULL` and still active: deliberately rotate it under
 *    the ride lock and audit the transition, so the salt-only code stops working;
 *  - verified, expired or locked legacy rows are left untouched because they can
 *    no longer disclose a usable code (the reset endpoint handles the latter two).
 *
 * Returns null only for a pre-enforcement assignment with no row. Every other
 * missing row is an anomaly and fails closed. All issuance happens inside the
 * caller's normal ride-verification lock order.
 */
async function resolveRiderVerificationRecord(rideId: string, riderUserId: string) {
  const now = new Date();
  const current = await prisma.rideVerification.findUnique({ where: { rideId } });
  const rotateLegacy =
    current !== null &&
    !current.invalidatedAt &&
    (current.keyVersion === null || current.algorithm !== RIDE_VERIFICATION_ALGORITHM) &&
    !current.verifiedAt &&
    current.expiresAt.getTime() > now.getTime() &&
    current.attemptCount < current.maxAttempts;
  if (current && !current.invalidatedAt && !rotateLegacy) return current;

  return prisma.$transaction(async (tx) => {
    await lockRideVerification(tx, rideId);
    const ride = await tx.ride.findUnique({
      where: { id: rideId },
      select: { id: true, status: true, riderId: true, pickupVerificationLegacyAt: true }
    });
    if (!ride) throw new ApiError(404, "ride_not_found", "Ride not found.");
    if (ride.riderId !== riderUserId) {
      throw new ApiError(403, "forbidden", "Only the rider on this trip can see its pickup code.");
    }
    if (!["driver_assigned", "driver_arriving"].includes(ride.status)) {
      throw new ApiError(409, "verification_not_available", "This trip is no longer waiting for pickup verification.");
    }
    const fresh = await tx.rideVerification.findUnique({ where: { rideId } });
    if (!fresh) {
      if (ride.pickupVerificationLegacyAt) return null;
      throw new ApiError(
        409,
        "verification_record_missing",
        "The protected pickup code record is missing. Contact NaijaDrive support; they must issue a new code before this trip can start."
      );
    }
    if (fresh.invalidatedAt) {
      // The previous assignment ended. The new assignment needs a fresh code;
      // the attempt budget is carried across reassignment.
      return issueRideVerification(tx, rideId, { carryAttempts: true });
    }
    if (fresh.keyVersion !== null && fresh.algorithm === RIDE_VERIFICATION_ALGORITHM) return fresh;
    const checkedAt = new Date();
    if (
      fresh.verifiedAt ||
      fresh.expiresAt.getTime() <= checkedAt.getTime() ||
      fresh.attemptCount >= fresh.maxAttempts
    ) {
      return fresh;
    }
    const next = await issueRideVerification(tx, rideId, { carryAttempts: true });
    await recordAudit({
      tx,
      actorId: riderUserId,
      action: "ride.verification_legacy_reissued",
      entity: "Ride",
      entityId: rideId,
      metadata: {
        reason: "legacy_salt_only_record",
        previousAlgorithm: fresh.algorithm,
        newAlgorithm: next.algorithm,
        newKeyVersion: next.keyVersion
      }
    });
    return next;
  });
}

/**
 * The rider's protected pickup code.
 *
 * This is the only endpoint allowed to return the raw four-digit code. The
 * driver, an unrelated account and an administrator are all refused; an
 * administrator uses the audited support reset instead. After verification the
 * code is no longer returned at all. Derivation requires the key version recorded
 * on the row; if that key is missing (unconfigured or retired) the call fails
 * closed with 503 rather than falling back to the salt-only derivation.
 */
export async function getRideVerificationCode(input: { userId: string; rideId: string }) {
  const ride = await loadRide(prisma, input.rideId);
  if (ride.riderId !== input.userId) {
    throw new ApiError(403, "forbidden", "Only the rider on this trip can see its pickup code.");
  }
  if (ride.status === "completed" || ride.status === "cancelled") {
    throw new ApiError(409, "ride_closed", "This ride is no longer active.");
  }
  if (ride.status === "requested") {
    throw new ApiError(
      409,
      "verification_not_available",
      "A pickup code is issued when a driver accepts the ride."
    );
  }
  if (ride.status === "in_progress") {
    throw new ApiError(409, "verification_not_available", "This trip has already started.");
  }

  const record = await resolveRiderVerificationRecord(ride.id, input.userId);
  if (!record) {
    // Bounded pre-enforcement transition: this assignment existed when pickup
    // verification was enforced and had no record. Opening the trip screen must
    // not create one retroactively. Support can still issue a code explicitly.
    return {
      rideId: ride.id,
      code: null,
      issuedAt: null,
      expiresAt: null,
      verified: false,
      expired: false,
      locked: false,
      attemptsRemaining: 0,
      required: false,
      legacy: true,
      recoveryRequired: false,
      verifiedAt: null
    };
  }

  const state = safeVerification(record);
  let code: string | null = null;
  if (!state.verified && !state.expired && !state.locked && !record.invalidatedAt) {
    const key = verificationKeyForRecord(record);
    code = verificationCodeFor({
      secret: key.secret,
      salt: record.salt,
      rideId: ride.id,
      keyVersion: key.version,
      algorithm: record.algorithm ?? RIDE_VERIFICATION_ALGORITHM
    });
  }
  return {
    rideId: ride.id,
    code,
    issuedAt: record.createdAt.toISOString(),
    expiresAt: state.expiresAt,
    verified: state.verified,
    expired: state.expired,
    locked: state.locked,
    attemptsRemaining: state.attemptsRemaining,
    required: !record.invalidatedAt,
    legacy: false,
    recoveryRequired: false,
    verifiedAt: state.verifiedAt
  };
}

type VerificationOutcome =
  | { outcome: "verified"; verifiedAt: Date; attemptsRemaining: number; ride: Awaited<ReturnType<typeof loadRide>> }
  | { outcome: "already"; verifiedAt: Date; attemptsRemaining: number; ride: Awaited<ReturnType<typeof loadRide>> }
  | { outcome: "invalid"; attemptsRemaining: number }
  | { outcome: "locked" }
  | { outcome: "expired" }
  | { outcome: "not_issued" }
  | { outcome: "legacy" }
  | { outcome: "reissue_required" }
  | { outcome: "missing_record" }
  | { outcome: "rate_limited" };

/**
 * Verify a passenger code before the trip starts.
 *
 * The row lock serialises concurrent correct/incorrect submissions. A wrong
 * attempt, its counter increment and its audit row are committed as an outcome
 * (not thrown inside the transaction, which would roll the attempt back) and the
 * error is raised afterwards. A correct attempt flips `verifiedAt` exactly once;
 * replays return the already-verified state and can never restart a closed ride.
 */
export async function verifyPassenger(input: { userId: string; rideId: string; code: string }) {
  // A suspended driver may finish the ride they already hold (the same rule as
  // `driverUpdateRideStatus`); suspension blocks accepting new work, not safely
  // completing an existing assignment. The assignment check below remains.
  const driver = await getDriverForUser(input.userId, false);
  const provided = input.code.trim();
  const pattern = new RegExp(`^\\d{${RIDE_VERIFICATION_CODE_LENGTH}}$`);
  if (!pattern.test(provided)) {
    throw new ApiError(
      400,
      "invalid_code",
      `Enter the ${RIDE_VERIFICATION_CODE_LENGTH}-digit code shown on the passenger's trip screen.`
    );
  }

  const result = await prisma.$transaction(async (tx): Promise<VerificationOutcome> => {
    await lockRideVerification(tx, input.rideId);
    const ride = await loadRide(tx, input.rideId);
    if (ride.driverId !== driver.id) {
      throw new ApiError(403, "forbidden", "This ride is assigned to another driver.");
    }
    if (!["driver_assigned", "driver_arriving"].includes(ride.status)) {
      throw new ApiError(409, "verification_not_available", "Passenger verification is only available before the trip starts.");
    }

    const record = await tx.rideVerification.findUnique({ where: { rideId: ride.id } });
    if (!record) {
      return { outcome: ride.pickupVerificationLegacyAt ? "legacy" : "missing_record" };
    }
    if (record.invalidatedAt) return { outcome: "not_issued" };
    const now = new Date();
    if (record.verifiedAt) {
      return {
        outcome: "already",
        verifiedAt: record.verifiedAt,
        attemptsRemaining: Math.max(0, record.maxAttempts - record.attemptCount),
        ride
      };
    }
    if (record.expiresAt.getTime() <= now.getTime()) return { outcome: "expired" };
    if (record.attemptCount >= record.maxAttempts) return { outcome: "locked" };
    if (record.lastAttemptAt && now.getTime() - record.lastAttemptAt.getTime() < RIDE_VERIFICATION_ATTEMPT_COOLDOWN_MS) {
      return { outcome: "rate_limited" };
    }
    // A legacy salt-only row can no longer be verified: doing so would restore
    // exactly the database-only disclosure path this change removes. Refuse
    // without consuming an attempt; the rider/support flow issues a keyed code.
    if (record.keyVersion === null || record.algorithm !== RIDE_VERIFICATION_ALGORITHM) {
      return { outcome: "reissue_required" };
    }

    // A missing or retired key must not be treated as a wrong code. Throwing
    // rolls the transaction back, so no attempt is consumed by a misconfiguration.
    const key = verificationKeyForRecord(record);
    const derived = hashVerificationCode(provided, record.salt, key.version, key.secret);
    const expected = Buffer.from(record.codeHash, "hex");
    const actual = Buffer.from(derived, "hex");
    const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

    if (!matches) {
      const attemptCount = record.attemptCount + 1;
      await tx.rideVerification.update({
        where: { id: record.id },
        data: { attemptCount: { increment: 1 }, lastAttemptAt: now }
      });
      await recordAudit({
        tx,
        actorId: input.userId,
        action: "ride.passenger_verification_failed",
        entity: "Ride",
        entityId: ride.id,
        metadata: { driverId: driver.id, attemptsRemaining: Math.max(0, record.maxAttempts - attemptCount) }
      });
      if (attemptCount >= record.maxAttempts) {
        await recordAudit({
          tx,
          actorId: input.userId,
          action: "ride.passenger_verification_locked",
          entity: "Ride",
          entityId: ride.id,
          metadata: { driverId: driver.id, maxAttempts: record.maxAttempts }
        });
        return { outcome: "locked" };
      }
      return { outcome: "invalid", attemptsRemaining: record.maxAttempts - attemptCount };
    }

    await tx.rideVerification.update({
      where: { id: record.id },
      data: { verifiedAt: now, verifiedByUserId: input.userId, lastAttemptAt: now }
    });
    await addRideEvent(tx, {
      rideId: ride.id,
      status: ride.status,
      label: PASSENGER_VERIFIED_LABEL,
      description: "The driver confirmed the passenger's pickup code before starting.",
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
    return {
      outcome: "verified",
      verifiedAt: now,
      attemptsRemaining: Math.max(0, record.maxAttempts - record.attemptCount),
      ride: await loadRide(tx, ride.id)
    };
  });

  switch (result.outcome) {
    case "verified":
    case "already":
      return {
        verified: true,
        alreadyVerified: result.outcome === "already",
        verifiedAt: result.verifiedAt.toISOString(),
        attemptsRemaining: result.attemptsRemaining,
        ride: result.ride
      };
    case "invalid":
      throw new ApiError(
        400,
        "invalid_passenger_code",
        `That pickup code is not correct. ${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? "" : "s"} left.`
      );
    case "locked":
      throw new ApiError(
        429,
        "verification_locked",
        "Too many incorrect pickup codes. The rider or support must reset the code before this trip can start."
      );
    case "expired":
      throw new ApiError(
        409,
        "verification_expired",
        "This pickup code has expired. The rider can reset it from their trip screen, or support can reset it."
      );
    case "not_issued":
      throw new ApiError(
        409,
        "verification_not_issued",
        "The passenger has not opened their trip screen yet. Ask them to open it to receive their pickup code."
      );
    case "legacy":
      throw new ApiError(
        409,
        "verification_not_required",
        "This trip was matched before protected pickup verification was enforced, so that assignment has no pickup code. Start the trip normally; the pre-enforcement exception is recorded."
      );
    case "reissue_required":
      throw new ApiError(
        409,
        "verification_reissue_required",
        "This pickup code was issued before server-key protection was enabled and can no longer be used. Ask the rider to open their trip screen to receive a new code, or contact support."
      );
    case "missing_record":
      throw new ApiError(
        409,
        "verification_record_missing",
        "The protected pickup code record is missing for this assignment. Support must issue a new code before this trip can start."
      );
    case "rate_limited":
      throw new ApiError(
        429,
        "verification_rate_limited",
        "Please wait a moment before trying another pickup code."
      );
  }
}

function verificationStateKey(
  record: {
    invalidatedAt: Date | null;
    verifiedAt: Date | null;
    expiresAt: Date;
    attemptCount: number;
    maxAttempts: number;
  } | null,
  legacyEligible: boolean
) {
  if (!record) return legacyEligible ? "pre_enforcement_no_record" : "missing_record";
  if (record.invalidatedAt) return "invalidated";
  if (record.verifiedAt) return "verified";
  if (record.expiresAt.getTime() <= Date.now()) return "expired";
  if (record.attemptCount >= record.maxAttempts) return "locked";
  return "active";
}

/**
 * Audited exceptional support handling. An administrator can rotate the code or
 * mark the passenger verified without ever seeing the raw code. The action is
 * refused once the trip is moving or closed, requires a reason, and always writes
 * an AuditLog row that records the previous state and the authorization basis.
 *
 * Every call is rate-limited twice from those same AuditLog rows:
 *  - per ride, so a single assignment cannot be reset/verified in a loop;
 *  - per operator, so one compromised staff session cannot sweep the queue.
 * The counts run under operator and ride advisory locks, so concurrent calls
 * cannot both slip through at the boundary. There is no in-memory counter, so a
 * process restart does not reset the limit.
 */
export async function overrideRideVerification(input: {
  adminId: string;
  rideId: string;
  action: "reset" | "verify";
  reason: string;
}) {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 300) {
    throw new ApiError(400, "invalid_reason", "Give a short reason (3-300 characters) for this support action.");
  }

  return prisma.$transaction(async (tx) => {
    // Operator first, then ride: every verification path takes the ride lock, and
    // only support actions take the operator lock, so this ordering cannot deadlock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ride-verification-support:operator:${input.adminId}`}))`;
    await lockRideVerification(tx, input.rideId);
    const ride = await loadRide(tx, input.rideId);
    if (!["driver_assigned", "driver_arriving"].includes(ride.status)) {
      throw new ApiError(
        409,
        "verification_not_available",
        "Pickup-code support actions are only available before the trip starts."
      );
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - RIDE_VERIFICATION_SUPPORT_WINDOW_MS);
    const [rideActions, operatorActions] = await Promise.all([
      tx.auditLog.count({
        where: {
          entity: "Ride",
          entityId: ride.id,
          action: { in: [...RIDE_VERIFICATION_SUPPORT_ACTIONS] },
          createdAt: { gte: windowStart }
        }
      }),
      tx.auditLog.count({
        where: {
          actorId: input.adminId,
          action: { in: [...RIDE_VERIFICATION_SUPPORT_ACTIONS] },
          createdAt: { gte: windowStart }
        }
      })
    ]);
    if (rideActions >= RIDE_VERIFICATION_SUPPORT_MAX_PER_RIDE) {
      throw new ApiError(
        429,
        "verification_support_ride_rate_limited",
        "This trip has had several pickup-code support actions recently. Wait for the rate-limit window before trying again."
      );
    }
    if (operatorActions >= RIDE_VERIFICATION_SUPPORT_MAX_PER_OPERATOR) {
      throw new ApiError(
        429,
        "verification_support_operator_rate_limited",
        "You have performed several pickup-code support actions recently. Wait for the rate-limit window before trying again."
      );
    }

    let record = await tx.rideVerification.findUnique({ where: { rideId: ride.id } });
    const previousState = verificationStateKey(record, Boolean(ride.pickupVerificationLegacyAt));
    const authorizationBasis =
      !record || record.invalidatedAt ? "support_recovery" : "support_override";

    if (input.action === "reset") {
      record = await issueRideVerification(tx, ride.id);
    } else {
      // A legacy salt-only row is replaced with a keyed record even when the
      // support action is "verify", so the database keeps no usable salt-only
      // code after the action. No raw code is returned either way.
      if (
        !record ||
        record.invalidatedAt ||
        record.keyVersion === null ||
        record.algorithm !== RIDE_VERIFICATION_ALGORITHM
      ) {
        record = await issueRideVerification(tx, ride.id);
      }
      record = await tx.rideVerification.update({
        where: { id: record.id },
        data: {
          verifiedAt: now,
          verifiedByUserId: input.adminId,
          attemptCount: 0,
          lastAttemptAt: null,
          expiresAt: new Date(now.getTime() + RIDE_VERIFICATION_TTL_MS)
        }
      });
    }
    if (ride.pickupVerificationLegacyAt) {
      // Explicit support opt-in ends the pre-enforcement exemption permanently.
      // If this record is ever lost after the opt-in, the ride fails closed rather
      // than silently reverting to a legacy start. The audit row above captured the
      // marker timestamp before this update.
      await tx.ride.update({
        where: { id: ride.id },
        data: { pickupVerificationLegacyAt: null }
      });
    }

    await recordAudit({
      tx,
      actorId: input.adminId,
      action: input.action === "reset" ? "ride.verification_support_reset" : "ride.verification_support_verified",
      entity: "Ride",
      entityId: ride.id,
      metadata: {
        rideNumber: ride.rideNumber,
        reason,
        action: input.action,
        authorizationBasis,
        previousState,
        legacyMarkerAt: ride.pickupVerificationLegacyAt?.toISOString() ?? null,
        operatorId: input.adminId
      }
    });

    return {
      rideId: ride.id,
      action: input.action,
      verification: safeVerification(record),
      rateLimit: {
        windowSeconds: RIDE_VERIFICATION_SUPPORT_WINDOW_MS / 1000,
        rideActionsRemaining: Math.max(0, RIDE_VERIFICATION_SUPPORT_MAX_PER_RIDE - rideActions - 1),
        operatorActionsRemaining: Math.max(
          0,
          RIDE_VERIFICATION_SUPPORT_MAX_PER_OPERATOR - operatorActions - 1
        )
      }
    };
  });
}

/**
 * Rider-initiated reset for an expired or locked code.
 *
 * A long wait at the pick-up can outlive the two-hour code, and five wrong
 * attempts can lock a legitimate trip. Until now both required Control Center
 * support. This escape hatch stays with the rider, rotates the salt (the old code
 * and any shared screenshot stop working), clears attempts, writes an audit row
 * and is rate-limited per ride. It never reveals a code; the rider's normal
 * verification endpoint returns the new one.
 */
export async function resetRideVerificationByRider(input: { userId: string; rideId: string }) {
  return prisma.$transaction(async (tx) => {
    await lockRideVerification(tx, input.rideId);
    const ride = await loadRide(tx, input.rideId);
    if (ride.riderId !== input.userId) {
      throw new ApiError(403, "forbidden", "Only the rider on this trip can reset its pickup code.");
    }
    if (!["driver_assigned", "driver_arriving"].includes(ride.status)) {
      throw new ApiError(
        409,
        "verification_not_available",
        "Pickup codes can only be reset before the trip starts."
      );
    }

    const record = await tx.rideVerification.findUnique({ where: { rideId: ride.id } });
    if (!record) {
      if (ride.pickupVerificationLegacyAt) {
        throw new ApiError(
          409,
          "verification_not_required",
          "This trip was matched before protected pickup verification was enforced, so it has no code to reset."
        );
      }
      throw new ApiError(
        409,
        "verification_record_missing",
        "The protected pickup code record is missing. Contact NaijaDrive support; only an authorised support action can issue a replacement code."
      );
    }
    if (record.invalidatedAt) {
      throw new ApiError(
        409,
        "verification_not_issued",
        "No active pickup code is attached to this assignment. Ask support to issue one."
      );
    }
    if (record.verifiedAt) {
      throw new ApiError(409, "already_verified", "This trip's pickup code has already been verified.");
    }

    const now = new Date();
    const expired = record.expiresAt.getTime() <= now.getTime();
    const locked = record.attemptCount >= record.maxAttempts;
    if (!expired && !locked) {
      throw new ApiError(
        409,
        "verification_active",
        "The current pickup code is still active. Use it, or ask support if you have lost it."
      );
    }

    const since = new Date(now.getTime() - RIDE_VERIFICATION_RIDER_RESET_WINDOW_MS);
    const recentResets = await tx.auditLog.count({
      where: {
        entity: "Ride",
        entityId: ride.id,
        action: "ride.verification_rider_reset",
        createdAt: { gte: since }
      }
    });
    if (recentResets >= RIDE_VERIFICATION_MAX_RIDER_RESETS_PER_WINDOW) {
      throw new ApiError(
        429,
        "verification_reset_rate_limited",
        "This pickup code was reset several times recently. Contact NaijaDrive support for help."
      );
    }

    const next = await issueRideVerification(tx, ride.id);
    await addRideEvent(tx, {
      rideId: ride.id,
      status: ride.status,
      label: "Pickup code reissued",
      description: expired
        ? "The rider reissued an expired pickup code. The previous code no longer works."
        : "The rider reissued a locked pickup code. The previous code no longer works.",
      actorId: input.userId
    });
    await recordAudit({
      tx,
      actorId: input.userId,
      action: "ride.verification_rider_reset",
      entity: "Ride",
      entityId: ride.id,
      metadata: {
        rideNumber: ride.rideNumber,
        attemptsBefore: record.attemptCount,
        expired,
        locked
      }
    });

    return {
      rideId: ride.id,
      reissued: true,
      verification: safeVerification(next)
    };
  });
}

/* ------------------------------------------------------- receipts and ratings --- */

export type RideFareComponents = {
  baseKobo: number;
  distanceKobo: number;
  timeKobo: number;
  adjustmentKobo: number;
  totalKobo: number;
  currency: string;
};

/** The same itemisation the rider was quoted, rebuilt from the recorded ride. */
export function rideFareComponents(ride: {
  vehicleClass: string;
  distanceMeters: number;
  durationMinutes: number;
  fareKobo: bigint;
  currency: string;
}): RideFareComponents {
  const vehicle = findVehicleClass(ride.vehicleClass);
  const totalKobo = Number(ride.fareKobo);
  const baseKobo = vehicle?.baseKobo ?? 0;
  const distanceKobo = vehicle ? Math.round(vehicle.perKmKobo * (ride.distanceMeters / 1000)) : 0;
  const timeKobo = vehicle ? vehicle.perMinuteKobo * ride.durationMinutes : 0;
  return {
    baseKobo,
    distanceKobo,
    timeKobo,
    adjustmentKobo: totalKobo - baseKobo - distanceKobo - timeKobo,
    totalKobo,
    currency: ride.currency
  };
}

export type ParticipantRatingSummary = { average: number | null; count: number };

/** Aggregate over real rating rows only; there is no synthetic seed data path. */
export async function participantRatingSummary(
  subjectUserId: string,
  raterRole: "customer" | "driver"
): Promise<ParticipantRatingSummary> {
  const aggregate = await prisma.rideRating.aggregate({
    where: { subjectUserId, raterRole },
    _avg: { score: true },
    _count: { _all: true }
  });
  const count = aggregate._count._all;
  return {
    average: count > 0 ? Math.round((aggregate._avg.score ?? 0) * 10) / 10 : null,
    count
  };
}

function rideParticipantRole(
  ride: { riderId: string; driver: { user: { id: string } } | null },
  userId: string
): "customer" | "driver" | null {
  if (ride.riderId === userId) return "customer";
  if (ride.driver?.user.id === userId) return "driver";
  return null;
}

export async function getRideReceipt(input: { userId: string; isAdmin: boolean; rideId: string }) {
  const ride = await loadRide(prisma, input.rideId);
  const role = rideParticipantRole(ride, input.userId);
  if (!input.isAdmin && !role) {
    throw new ApiError(403, "forbidden", "This trip belongs to another account.");
  }

  const components = rideFareComponents(ride);
  const fee = Number(ride.cancellationFeeKobo ?? BigInt(0));
  const refundedKobo =
    ride.paymentStatus === "refunded"
      ? components.totalKobo
      : ride.paymentStatus === "partially_refunded"
        ? Math.max(0, components.totalKobo - fee)
        : 0;
  const chargedKobo =
    ride.status === "cancelled"
      ? ride.paymentStatus === "refunded"
        ? 0
        : ride.paymentStatus === "partially_refunded"
          ? fee
          : 0
      : components.totalKobo;

  const [ownRating, driverSummary, customerSummary] = await Promise.all([
    prisma.rideRating.findUnique({
      where: { rideId_raterUserId: { rideId: ride.id, raterUserId: input.userId } },
      select: { score: true, feedback: true, createdAt: true }
    }),
    ride.driver
      ? participantRatingSummary(ride.driver.user.id, "customer")
      : Promise.resolve({ average: null, count: 0 }),
    participantRatingSummary(ride.riderId, "driver")
  ]);

  return {
    rideId: ride.id,
    rideNumber: ride.rideNumber,
    status: ride.status,
    currency: ride.currency,
    route: {
      pickupLabel: ride.pickupLabel,
      pickupAddress: ride.pickupAddress,
      dropoffLabel: ride.dropoffLabel,
      dropoffAddress: ride.dropoffAddress,
      distanceMeters: ride.distanceMeters,
      durationMinutes: ride.durationMinutes,
      vehicleClass: ride.vehicleClass
    },
    fare: components,
    payment: {
      method: ride.paymentMethod,
      status: ride.paymentStatus,
      reference: ride.paymentReference,
      receiptReference: ride.paymentReference ?? ride.rideNumber
    },
    adjustments: {
      cancellationFeeKobo: fee,
      refundedKobo,
      chargedKobo,
      cancellationReason: ride.cancellationReason ?? null
    },
    timestamps: {
      requestedAt: ride.requestedAt.toISOString(),
      acceptedAt: ride.acceptedAt?.toISOString() ?? null,
      startedAt: ride.startedAt?.toISOString() ?? null,
      completedAt: ride.completedAt?.toISOString() ?? null,
      cancelledAt: ride.cancelledAt?.toISOString() ?? null
    },
    driver: ride.driver
      ? {
          userId: ride.driver.user.id,
          name: ride.driver.user.name,
          vehicleMake: ride.driver.vehicleMake,
          vehicleModel: ride.driver.vehicleModel,
          vehiclePlate: ride.driver.vehiclePlate
        }
      : null,
    rider: { id: ride.rider.id, name: ride.rider.name },
    rating: {
      own: ownRating
        ? { score: ownRating.score, feedback: ownRating.feedback, createdAt: ownRating.createdAt.toISOString() }
        : null,
      canRate: ride.status === "completed" && Boolean(role) && !ownRating,
      driverSummary,
      customerSummary
    }
  };
}

export async function submitRideRating(input: {
  userId: string;
  rideId: string;
  score: number;
  feedback?: string | null;
}) {
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
    throw new ApiError(400, "invalid_score", "Choose a whole-number rating from 1 to 5.");
  }
  const feedback = input.feedback?.trim().replace(/\s+/g, " ") || null;
  if (feedback && feedback.length > 1000) {
    throw new ApiError(400, "invalid_feedback", "Feedback must be 1,000 characters or fewer.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ride-rating:${input.rideId}:${input.userId}`}))`;
    const ride = await loadRide(tx, input.rideId);
    const role = rideParticipantRole(ride, input.userId);
    if (!role) throw new ApiError(403, "forbidden", "Only the rider or assigned driver can rate this trip.");
    if (ride.status !== "completed") {
      throw new ApiError(409, "ride_not_completed", "You can rate this trip after it is completed.");
    }
    if (role === "customer" && !ride.driver) {
      throw new ApiError(409, "no_driver", "This completed trip has no driver to rate.");
    }
    const subjectUserId = role === "customer" ? ride.driver!.user.id : ride.riderId;

    const created = await tx.rideRating.createMany({
      data: [
        {
          rideId: ride.id,
          raterUserId: input.userId,
          raterRole: role,
          subjectUserId,
          score: input.score,
          feedback
        }
      ],
      skipDuplicates: true
    });
    const rating = await tx.rideRating.findUnique({
      where: { rideId_raterUserId: { rideId: ride.id, raterUserId: input.userId } }
    });
    if (!rating) throw new Error("Rating row disappeared after creation.");

    const idempotent = created.count === 0;
    if (idempotent && (rating.score !== input.score || (rating.feedback ?? null) !== feedback)) {
      throw new ApiError(
        409,
        "rating_already_submitted",
        "This trip was already rated. A participant can submit exactly one rating per trip."
      );
    }
    if (!idempotent) {
      await recordAudit({
        tx,
        actorId: input.userId,
        action: "ride.rating_submitted",
        entity: "Ride",
        entityId: ride.id,
        metadata: { raterRole: role, score: input.score, hasFeedback: Boolean(feedback) }
      });
    }
    return {
      idempotent,
      rating: {
        rideId: rating.rideId,
        score: rating.score,
        feedback: rating.feedback,
        createdAt: rating.createdAt.toISOString()
      }
    };
  });
}

export async function getRideRatingState(input: { userId: string; isAdmin: boolean; rideId: string }) {
  const ride = await loadRide(prisma, input.rideId);
  const role = rideParticipantRole(ride, input.userId);
  if (!input.isAdmin && !role) {
    throw new ApiError(403, "forbidden", "This trip belongs to another account.");
  }
  const [ownRating, driverSummary, customerSummary] = await Promise.all([
    prisma.rideRating.findUnique({
      where: { rideId_raterUserId: { rideId: ride.id, raterUserId: input.userId } },
      select: { score: true, feedback: true, createdAt: true }
    }),
    ride.driver
      ? participantRatingSummary(ride.driver.user.id, "customer")
      : Promise.resolve({ average: null, count: 0 }),
    participantRatingSummary(ride.riderId, "driver")
  ]);
  return {
    rideId: ride.id,
    status: ride.status,
    own: ownRating
      ? { score: ownRating.score, feedback: ownRating.feedback, createdAt: ownRating.createdAt.toISOString() }
      : null,
    canRate: ride.status === "completed" && Boolean(role) && !ownRating,
    driverSummary,
    customerSummary
  };
}

const SAFETY_CATEGORIES = [
  "unsafe_driving",
  "harassment",
  "vehicle_condition",
  "route_deviation",
  "payment",
  "other"
] as const;

export async function submitRideSafetyReport(input: {
  userId: string;
  rideId: string;
  category: string;
  details: string;
}) {
  const category = input.category.trim();
  if (!(SAFETY_CATEGORIES as readonly string[]).includes(category)) {
    throw new ApiError(400, "invalid_category", `Choose one of: ${SAFETY_CATEGORIES.join(", ")}.`);
  }
  const details = input.details.trim();
  if (details.length < 5 || details.length > 1500) {
    throw new ApiError(400, "invalid_details", "Describe the concern in 5-1,500 characters.");
  }

  return prisma.$transaction(async (tx) => {
    const ride = await loadRide(tx, input.rideId);
    const role = rideParticipantRole(ride, input.userId);
    if (!role) throw new ApiError(403, "forbidden", "Only the rider or assigned driver can report on this trip.");

    const report = await tx.rideSafetyReport.create({
      data: {
        rideId: ride.id,
        reporterUserId: input.userId,
        reporterRole: role,
        category,
        details
      }
    });
    // The details are private support data; only category and role go to audit.
    await recordAudit({
      tx,
      actorId: input.userId,
      action: "ride.safety_report_submitted",
      entity: "RideSafetyReport",
      entityId: report.id,
      metadata: { rideId: ride.id, category, reporterRole: role }
    });
    return {
      id: report.id,
      rideId: report.rideId,
      category: report.category,
      status: report.status,
      createdAt: report.createdAt.toISOString()
    };
  });
}

export async function listRideSafetyReports(input: { userId: string; isAdmin: boolean; rideId: string }) {
  const ride = await loadRide(prisma, input.rideId);
  const role = rideParticipantRole(ride, input.userId);
  if (!input.isAdmin && !role) {
    throw new ApiError(403, "forbidden", "This trip belongs to another account.");
  }
  const reports = await prisma.rideSafetyReport.findMany({
    where: {
      rideId: ride.id,
      ...(input.isAdmin ? {} : { reporterUserId: input.userId })
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      category: true,
      status: true,
      details: true,
      createdAt: true,
      reviewedAt: true,
      resolutionNote: true
    }
  });
  return reports.map((report) => ({
    ...report,
    createdAt: report.createdAt.toISOString(),
    reviewedAt: report.reviewedAt?.toISOString() ?? null
  }));
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
