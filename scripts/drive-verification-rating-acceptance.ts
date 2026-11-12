/**
 * NaijaDrive protected pickup verification, receipts and participant ratings.
 *
 * Executes the real services against `naijadeals_wallet_acceptance` only:
 *
 *   - assignment creates a dedicated RideVerification record (never an event log);
 *   - the rider-only endpoint returns the raw 4-digit code; driver endpoints never do;
 *   - wrong code, expiry, attempt lock, cooldown, repeated and concurrent submissions;
 *   - the authoritative start transition refuses an unverified trip;
 *   - audited support reset/verify actions;
 *   - one rating per participant per completed trip, bounds, idempotency, aggregate;
 *   - receipt fare components and cancellation/refund adjustments;
 *   - safety reports kept separate from ratings and reviews.
 *
 * Database safety: `.env` is read only to derive the acceptance URL by replacing
 * the database path. `current_database()` is the guard. No provider call, real
 * charge, payout, push, deployment or shared affiliated database is touched.
 * Every fixture is tagged with RUN_ID and removed before exit.
 *
 * Usage:
 *   npx tsx scripts/drive-verification-rating-acceptance.ts
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

const DB = "naijadeals_wallet_acceptance";
const RUN_ID = `drive-verify-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
const REPO_ROOT = path.resolve(__dirname, "..");

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
let failures = 0;

function check(name: string, pass: boolean, detail = "") {
  checks.push({ name, pass, detail });
  if (!pass) failures += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `\n      ${detail}` : ""}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const safeJson = (value: unknown) =>
  JSON.stringify(value, (_key, inner) => (typeof inner === "bigint" ? inner.toString() : inner));

function acceptanceUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set in .env.");
  const url = new URL(raw);
  url.pathname = `/${DB}`;
  return url.toString();
}

async function expectError(
  label: string,
  action: () => Promise<unknown>,
  expectedStatus: number,
  expectedCode?: string
) {
  try {
    await action();
    check(label, false, "no error was raised");
    return null;
  } catch (error) {
    const typed = error as { status?: number; code?: string; message?: string };
    const ok =
      typed.status === expectedStatus && (!expectedCode || typed.code === expectedCode);
    check(
      label,
      ok,
      ok ? "" : `expected ${expectedStatus}${expectedCode ? `/${expectedCode}` : ""}, got ${typed.status}/${typed.code}: ${typed.message}`
    );
    return typed;
  }
}

async function main() {
  process.env.DATABASE_URL = acceptanceUrl();
  process.env.ENABLE_TEST_PAYMENTS = "true";
  process.env.VALKEY_URL = "";

  const { prisma } = await import("../lib/prisma");
  const drive = await import("../lib/services/core/drive.service");
  const { ensureWallet } = await import("../lib/payments/service");
  const { createTopUp, creditTopUp } = await import("../lib/services/core/topup.service");
  const { reconcile } = await import("../lib/services/core/reconciliation-correct");

  const dbRow = await prisma.$queryRaw<Array<{ db: string }>>`select current_database() as db`;
  assert(dbRow[0]?.db === DB, `wrong database ${dbRow[0]?.db}; expected ${DB}`);
  console.log(`NaijaDrive verification/rating acceptance\nRUN_ID ${RUN_ID}\nDATABASE ${DB}\n`);

  const runTag = RUN_ID.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toUpperCase();
  const userIds: string[] = [];
  const driverProfileIds: string[] = [];
  const rideIds: string[] = [];
  const walletIds: string[] = [];
  const walletReferences = new Set<string>();
  const topUpKeys = new Set<string>();

  const systemBefore = await prisma.wallet.findFirstOrThrow({
    where: { ownerType: "SYSTEM" },
    select: { id: true, availableKobo: true, heldKobo: true }
  });

  async function createUser(role: "CUSTOMER" | "DRIVER", label: string) {
    const email = `${RUN_ID}-${label}@naijadeals.local`;
    const user = await prisma.user.create({
      data: { email, name: `${RUN_ID} ${label}`, actorType: role }
    });
    userIds.push(user.id);
    return user;
  }

  async function createDriver(label: string) {
    const user = await createUser("DRIVER", label);
    const profile = await prisma.driverProfile.create({
      data: {
        userId: user.id,
        licenseNumber: `LIC-${runTag}-${label}`.slice(0, 40),
        status: "approved",
        active: true,
        vehicleClass: "economy",
        vehicleMake: "Toyota",
        vehicleModel: "Corolla",
        vehiclePlate: `ND-${runTag.slice(-5)}${label.slice(0, 1).toUpperCase()}`.slice(0, 20),
        serviceZone: "Lagos"
      }
    });
    driverProfileIds.push(profile.id);
    return { user, profile };
  }

  async function newRide(
    riderId: string,
    paymentMethod: "cash" | "wallet" = "cash",
    route = { pickupId: "computer-village", dropoffId: "maryland", vehicleClassId: "economy" }
  ) {
    const ride = await drive.requestRide({ riderId, ...route, paymentMethod });
    rideIds.push(ride.id);
    return ride;
  }

  async function assign(driverUserId: string, rideId: string) {
    return drive.acceptRide({ userId: driverUserId, rideId });
  }

  async function arrive(driverUserId: string, rideId: string) {
    return drive.driverUpdateRideStatus({ userId: driverUserId, rideId, status: "driver_arriving" });
  }

  async function start(driverUserId: string, rideId: string) {
    return drive.driverUpdateRideStatus({ userId: driverUserId, rideId, status: "in_progress" });
  }

  async function complete(driverUserId: string, rideId: string) {
    return drive.driverUpdateRideStatus({ userId: driverUserId, rideId, status: "completed" });
  }

  async function fundRiderWallet(userId: string, amountKobo: bigint) {
    const wallet = await ensureWallet(prisma, { userId, ownerType: "CUSTOMER" });
    walletIds.push(wallet.id);
    const reference = `TOPUP-${RUN_ID}-${randomBytes(4).toString("hex")}`;
    const idempotencyKey = `${RUN_ID}-TOPUP-${randomBytes(4).toString("hex")}`;
    topUpKeys.add(idempotencyKey);
    walletReferences.add(reference);
    await createTopUp(prisma, {
      walletId: wallet.id,
      amountKobo,
      provider: "test",
      providerReference: reference,
      idempotencyKey
    });
    await creditTopUp(prisma, {
      providerReference: reference,
      verifiedAmountKobo: amountKobo,
      verifiedCurrency: "NGN",
      actorId: userId
    });
    return wallet;
  }

  async function cleanupFixtures() {
  const reportIds = (
    await prisma.rideSafetyReport.findMany({ where: { rideId: { in: rideIds } }, select: { id: true } })
  ).map((row) => row.id);
  const notificationIds = (
    await prisma.notification.findMany({
      where: { OR: [{ entityType: "Ride", entityId: { in: rideIds } }, { userId: { in: userIds } }] },
      select: { id: true }
    })
  ).map((row) => row.id);
  if (notificationIds.length) {
    await prisma.notificationAttempt.deleteMany({ where: { notificationId: { in: notificationIds } } });
    await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
  }
  await prisma.partnerNotification.deleteMany({ where: { userId: { in: userIds } } });

  const walletTransactions = await prisma.walletTransaction.findMany({
    where: {
      OR: [
        { reference: { in: [...walletReferences] } },
        { walletId: { in: walletIds } }
      ]
    },
    select: { id: true }
  });
  const transactionIds = walletTransactions.map((row) => row.id);
  if (transactionIds.length) {
    await prisma.ledgerEntry.deleteMany({ where: { transactionId: { in: transactionIds } } });
    await prisma.walletTransaction.deleteMany({ where: { id: { in: transactionIds } } });
  }
  await prisma.walletTopUp.deleteMany({
    where: { OR: [{ idempotencyKey: { in: [...topUpKeys] } }, { providerReference: { in: [...walletReferences] } }] }
  });

  await prisma.rideRating.deleteMany({ where: { rideId: { in: rideIds } } });
  await prisma.rideSafetyReport.deleteMany({ where: { rideId: { in: rideIds } } });
  await prisma.rideVerification.deleteMany({ where: { rideId: { in: rideIds } } });
  await prisma.rideEvent.deleteMany({ where: { rideId: { in: rideIds } } });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorId: { in: userIds } },
        { entityId: { in: [...rideIds, ...reportIds] } }
      ]
    }
  });
  await prisma.systemEvent.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: rideIds } }] }
  });
  await prisma.ride.deleteMany({ where: { id: { in: rideIds } } });
  await prisma.driverProfile.deleteMany({ where: { id: { in: driverProfileIds } } });
  await prisma.wallet.deleteMany({ where: { id: { in: walletIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  // Restore the shared SYSTEM wallet exactly. Test funding and the ride hold/refund
  // were removed with their journals above; no direct production repair is implied.
  await prisma.wallet.update({
    where: { id: systemBefore.id },
    data: { availableKobo: systemBefore.availableKobo, heldKobo: systemBefore.heldKobo }
  });

  }

  // The acceptance database already has Lagos active; refuse to silently rely on it.
  const lagos = await prisma.citySetting.findUnique({
    where: { countryCode_code: { countryCode: "NG", code: "lagos" } }
  });
  if (!lagos?.enabled) {
    await prisma.citySetting.upsert({
      where: { countryCode_code: { countryCode: "NG", code: "lagos" } },
      update: { enabled: true, name: "Lagos" },
      create: { countryCode: "NG", code: "lagos", name: "Lagos", enabled: true }
    });
  }

  const riderA = await createUser("CUSTOMER", "rider-a");
  const riderB = await createUser("CUSTOMER", "rider-b");
  const riderC = await createUser("CUSTOMER", "rider-c");
  const riderD = await createUser("CUSTOMER", "rider-d");
  const riderE = await createUser("CUSTOMER", "rider-e");
  const riderF = await createUser("CUSTOMER", "rider-f");
  const riderW = await createUser("CUSTOMER", "rider-w");
  const outsider = await createUser("CUSTOMER", "outsider");
  const admin = await createUser("CUSTOMER", "admin");
  const driverA = await createDriver("driver-a");
  const driverB = await createDriver("driver-b");

  try {
  /* ------------------------------------------------ A. protected record --- */
  const rideA = await newRide(riderA.id, "cash");
  check(
    "booking does not write a verification event log",
    (await prisma.systemEvent.count({ where: { type: "ride.verification_issued", entityId: rideA.id } })) === 0
  );
  check(
    "no verification record exists before assignment",
    (await prisma.rideVerification.count({ where: { rideId: rideA.id } })) === 0
  );

  await assign(driverA.user.id, rideA.id);
  const recordA = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideA.id } });
  check(
    "assignment creates one protected record with hash/salt/expiry/limits",
    recordA.algorithm === "scrypt-hmac-sha256-v1" &&
      recordA.codeHash.length === 64 &&
      recordA.salt.length === 32 &&
      recordA.expiresAt.getTime() > Date.now() &&
      recordA.maxAttempts === drive.RIDE_VERIFICATION_MAX_ATTEMPTS &&
      recordA.attemptCount === 0 &&
      recordA.verifiedAt === null,
    JSON.stringify({
      algorithm: recordA.algorithm,
      hashLength: recordA.codeHash.length,
      saltLength: recordA.salt.length,
      maxAttempts: recordA.maxAttempts
    })
  );

  const codeA = await drive.getRideVerificationCode({ userId: riderA.id, rideId: rideA.id });
  check(
    "rider-only endpoint returns a 4-digit code",
    typeof codeA.code === "string" && /^\d{4}$/.test(codeA.code) && codeA.required && !codeA.verified,
    JSON.stringify({ verified: codeA.verified, expiresAt: codeA.expiresAt })
  );
  const rawA = codeA.code!;
  check(
    "stored hash is not the raw code",
    recordA.codeHash !== rawA && !recordA.codeHash.includes(rawA) && recordA.salt !== rawA
  );
  check(
    "no SystemEvent row carries a verification salt",
    (await prisma.systemEvent.count({ where: { type: "ride.verification_issued", entityId: rideA.id } })) === 0
  );

  const boardA = await drive.listDriverRides(driverA.user.id);
  const activeA = boardA.active.find((ride) => ride.id === rideA.id);
  const boardSerialized = safeJson(activeA);
  check(
    "driver board marks the code required but unverified",
    Boolean(activeA?.verification?.required) && !activeA?.verification?.verified,
    JSON.stringify(activeA?.verification)
  );
  check(
    "driver board contains no raw code, hash or salt",
    !boardSerialized.includes(rawA) &&
      !boardSerialized.includes(recordA.codeHash) &&
      !boardSerialized.includes(recordA.salt) &&
      !boardSerialized.includes("codeHash") &&
      !boardSerialized.includes("\"salt\"")
  );

  await expectError(
    "assigned driver cannot read the rider code",
    () => drive.getRideVerificationCode({ userId: driverA.user.id, rideId: rideA.id }),
    403,
    "forbidden"
  );
  await expectError(
    "unrelated rider cannot read the code",
    () => drive.getRideVerificationCode({ userId: outsider.id, rideId: rideA.id }),
    403,
    "forbidden"
  );
  await expectError(
    "administrator cannot read the raw code",
    () => drive.getRideVerificationCode({ userId: admin.id, rideId: rideA.id }),
    403,
    "forbidden"
  );
  await expectError(
    "rider cannot submit a driver verification",
    () => drive.verifyPassenger({ userId: riderA.id, rideId: rideA.id, code: rawA }),
    403,
    "not_a_driver"
  );
  await expectError(
    "a different driver cannot verify this ride",
    () => drive.verifyPassenger({ userId: driverB.user.id, rideId: rideA.id, code: rawA }),
    403,
    "forbidden"
  );
  await expectError(
    "a different driver cannot advance this ride",
    () => arrive(driverB.user.id, rideA.id),
    403,
    "forbidden"
  );

  /* ------------------------------------------- B. wrong/cooldown/correct --- */
  const wrongA = String((Number(rawA) + 1) % 10_000).padStart(4, "0");
  await expectError(
    "wrong pickup code is rejected and counted",
    () => drive.verifyPassenger({ userId: driverA.user.id, rideId: rideA.id, code: wrongA }),
    400,
    "invalid_passenger_code"
  );
  const afterWrong = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideA.id } });
  check("wrong attempt committed exactly one increment", afterWrong.attemptCount === 1);
  check(
    "wrong attempt wrote an audit row",
    (await prisma.auditLog.count({
      where: { action: "ride.passenger_verification_failed", entityId: rideA.id }
    })) === 1
  );
  await expectError(
    "immediate retry is rate limited without consuming another attempt",
    () => drive.verifyPassenger({ userId: driverA.user.id, rideId: rideA.id, code: rawA }),
    429,
    "verification_rate_limited"
  );
  const afterLimited = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideA.id } });
  check("rate-limited retry did not increment attempts", afterLimited.attemptCount === 1);

  // Clear the cooldown in the fixture so the acceptance run does not wait 1.5 s.
  await prisma.rideVerification.update({
    where: { rideId: rideA.id },
    data: { lastAttemptAt: new Date(Date.now() - 5_000) }
  });
  const verifiedA = await drive.verifyPassenger({ userId: driverA.user.id, rideId: rideA.id, code: rawA });
  check(
    "correct code verifies the passenger once",
    verifiedA.verified && !verifiedA.alreadyVerified && Boolean(verifiedA.verifiedAt),
    JSON.stringify({ already: verifiedA.alreadyVerified })
  );
  const afterVerified = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideA.id } });
  check("verifiedAt is recorded on the protected row", Boolean(afterVerified.verifiedAt));
  check(
    "verification event is a normal ride event, not a code carrier",
    (await prisma.rideEvent.count({ where: { rideId: rideA.id, label: "Passenger verified" } })) === 1 &&
      !JSON.stringify(await prisma.rideEvent.findMany({ where: { rideId: rideA.id } })).includes(rawA)
  );

  const replayVerify = await drive.verifyPassenger({ userId: driverA.user.id, rideId: rideA.id, code: rawA });
  check("repeating the correct code is idempotent and cannot count twice", replayVerify.alreadyVerified === true);
  const codeAfterVerify = await drive.getRideVerificationCode({ userId: riderA.id, rideId: rideA.id });
  check(
    "rider endpoint withholds the code after verification",
    codeAfterVerify.code === null && codeAfterVerify.verified === true
  );

  await arrive(driverA.user.id, rideA.id);
  const startedA = await start(driverA.user.id, rideA.id);
  check(
    "atomic transition starts the trip after the correct code",
    startedA.status === "in_progress" && Boolean(startedA.startedAt),
    startedA.status
  );
  const secondStart = await start(driverA.user.id, rideA.id);
  check(
    "a duplicate start is idempotent and does not create a second transition",
    secondStart.status === "in_progress" &&
      secondStart.startedAt?.getTime() === startedA.startedAt?.getTime() &&
      (await prisma.rideEvent.count({ where: { rideId: rideA.id, status: "in_progress" } })) === 1
  );
  await expectError(
    "code replay after start is rejected",
    () => drive.verifyPassenger({ userId: driverA.user.id, rideId: rideA.id, code: rawA }),
    409,
    "verification_not_available"
  );
  await complete(driverA.user.id, rideA.id);
  await drive.markCashCollected({ userId: driverA.user.id, rideId: rideA.id });

  /* -------------------------------------------------------- C. receipt --- */
  const receiptA = await drive.getRideReceipt({ userId: riderA.id, isAdmin: false, rideId: rideA.id });
  const itemised =
    receiptA.fare.baseKobo + receiptA.fare.distanceKobo + receiptA.fare.timeKobo + receiptA.fare.adjustmentKobo;
  check(
    "receipt fare components sum exactly to the fare total",
    itemised === receiptA.fare.totalKobo && receiptA.fare.totalKobo === Number(rideA.fareKobo),
    JSON.stringify({ itemised, total: receiptA.fare.totalKobo })
  );
  check(
    "receipt records cash method, paid status and reference",
    receiptA.payment.method === "cash" &&
      receiptA.payment.status === "paid" &&
      receiptA.payment.receiptReference === `RIDE-${rideA.id}-CASH` &&
      receiptA.adjustments.chargedKobo === receiptA.fare.totalKobo,
    JSON.stringify({ payment: receiptA.payment, charged: receiptA.adjustments.chargedKobo })
  );
  check(
    "receipt starts with zero adjustments and no aggregate ratings",
    receiptA.adjustments.refundedKobo === 0 &&
      receiptA.adjustments.cancellationFeeKobo === 0 &&
      receiptA.rating.driverSummary.count === 0
  );
  await expectError(
    "unrelated rider cannot read the receipt",
    () => drive.getRideReceipt({ userId: outsider.id, isAdmin: false, rideId: rideA.id }),
    403,
    "forbidden"
  );
  await expectError(
    "unassigned driver cannot read the receipt",
    () => drive.getRideReceipt({ userId: driverB.user.id, isAdmin: false, rideId: rideA.id }),
    403,
    "forbidden"
  );

  /* --------------------------------------------------------- D. ratings --- */
  const ratingRider = await drive.submitRideRating({
    userId: riderA.id,
    rideId: rideA.id,
    score: 5,
    feedback: "Smooth trip"
  });
  check("rider rates the assigned driver once", !ratingRider.idempotent && ratingRider.rating.score === 5);
  const ratingRepeat = await drive.submitRideRating({
    userId: riderA.id,
    rideId: rideA.id,
    score: 5,
    feedback: "Smooth trip"
  });
  check("identical rating retry is idempotent", ratingRepeat.idempotent === true);
  await expectError(
    "changing an existing rating is rejected",
    () => drive.submitRideRating({ userId: riderA.id, rideId: rideA.id, score: 4 }),
    409,
    "rating_already_submitted"
  );
  const ratingDriver = await drive.submitRideRating({
    userId: driverA.user.id,
    rideId: rideA.id,
    score: 4,
    feedback: "Ready at pick-up"
  });
  check("driver rates the passenger once", !ratingDriver.idempotent && ratingDriver.rating.score === 4);
  await expectError("score 0 is rejected", () => drive.submitRideRating({ userId: riderA.id, rideId: rideA.id, score: 0 }), 400, "invalid_score");
  await expectError("score 6 is rejected for the rider", () => drive.submitRideRating({ userId: riderA.id, rideId: rideA.id, score: 6 }), 400, "invalid_score");
  await expectError("fractional score is rejected", () => drive.submitRideRating({ userId: riderA.id, rideId: rideA.id, score: 3.5 }), 400, "invalid_score");
  await expectError(
    "unrelated account cannot rate",
    () => drive.submitRideRating({ userId: outsider.id, rideId: rideA.id, score: 5 }),
    403,
    "forbidden"
  );
  await expectError(
    "unassigned driver cannot rate",
    () => drive.submitRideRating({ userId: driverB.user.id, rideId: rideA.id, score: 5 }),
    403,
    "forbidden"
  );
  const driverSummaryA = await drive.participantRatingSummary(driverA.user.id, "customer");
  const customerSummaryA = await drive.participantRatingSummary(riderA.id, "driver");
  check(
    "aggregate uses real rating rows only",
    driverSummaryA.count === 1 &&
      driverSummaryA.average === 5 &&
      customerSummaryA.count === 1 &&
      customerSummaryA.average === 4,
    JSON.stringify({ driverSummaryA, customerSummaryA })
  );
  const ratingStateRider = await drive.getRideRatingState({
    userId: riderA.id,
    isAdmin: false,
    rideId: rideA.id
  });
  const ratingStateDriver = await drive.getRideRatingState({
    userId: driverA.user.id,
    isAdmin: false,
    rideId: rideA.id
  });
  check(
    "each participant sees only their own feedback text",
    JSON.stringify(ratingStateRider).includes("Smooth trip") &&
      !JSON.stringify(ratingStateRider).includes("Ready at pick-up") &&
      JSON.stringify(ratingStateDriver).includes("Ready at pick-up") &&
      !JSON.stringify(ratingStateDriver).includes("Smooth trip")
  );
  const boardAfterRating = await drive.listDriverRides(driverA.user.id);
  check(
    "driver board exposes the real aggregate rating",
    boardAfterRating.driver.rating?.count === 1 && boardAfterRating.driver.rating?.average === 5,
    JSON.stringify(boardAfterRating.driver.rating)
  );

  /* ------------------------------------------------- E. expiry + support --- */
  const rideB = await newRide(riderB.id, "cash");
  await assign(driverB.user.id, rideB.id);
  const codeB = await drive.getRideVerificationCode({ userId: riderB.id, rideId: rideB.id });
  check("second ride issued a code", typeof codeB.code === "string");
  await prisma.rideVerification.update({
    where: { rideId: rideB.id },
    data: { expiresAt: new Date(Date.now() - 1_000) }
  });
  await expectError(
    "expired code is rejected without consuming an attempt",
    () => drive.verifyPassenger({ userId: driverB.user.id, rideId: rideB.id, code: codeB.code! }),
    409,
    "verification_expired"
  );
  await arrive(driverB.user.id, rideB.id);
  await expectError(
    "start is refused while the code is expired",
    () => start(driverB.user.id, rideB.id),
    409,
    "verification_expired"
  );

  const beforeReset = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideB.id } });
  const reset = await drive.overrideRideVerification({
    adminId: admin.id,
    rideId: rideB.id,
    action: "reset",
    reason: "Code expired during acceptance test"
  });
  const afterReset = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideB.id } });
  check(
    "audited support reset rotates the code and clears attempts",
    afterReset.salt !== beforeReset.salt &&
      afterReset.attemptCount === 0 &&
      afterReset.verifiedAt === null &&
      afterReset.expiresAt.getTime() > Date.now() &&
      reset.verification.locked === false &&
      reset.action === "reset"
  );
  check(
    "support reset wrote its audit row with the reason",
    (await prisma.auditLog.count({
      where: {
        action: "ride.verification_support_reset",
        entityId: rideB.id,
        metadata: { path: ["reason"], equals: "Code expired during acceptance test" }
      }
    })) === 1
  );
  check(
    "support reset response never contains a raw code",
    !JSON.stringify(reset).includes(codeB.code!)
  );
  const codeB2 = await drive.getRideVerificationCode({ userId: riderB.id, rideId: rideB.id });
  check("rider receives the rotated code", typeof codeB2.code === "string");
  const verifyB = await drive.verifyPassenger({ userId: driverB.user.id, rideId: rideB.id, code: codeB2.code! });
  check("rotated code verifies", verifyB.verified === true);
  await start(driverB.user.id, rideB.id);
  await complete(driverB.user.id, rideB.id);

  const rideC = await newRide(riderC.id, "cash");
  await assign(driverB.user.id, rideC.id);
  await arrive(driverB.user.id, rideC.id);
  await prisma.rideVerification.update({
    where: { rideId: rideC.id },
    data: { expiresAt: new Date(Date.now() - 1_000) }
  });
  const supportVerify = await drive.overrideRideVerification({
    adminId: admin.id,
    rideId: rideC.id,
    action: "verify",
    reason: "Rider present, code screen unavailable"
  });
  check(
    "audited support verify marks the passenger verified without exposing a code",
    supportVerify.verification.verified === true && !JSON.stringify(supportVerify).includes("\"code\"")
  );
  check(
    "support verify wrote its audit row",
    (await prisma.auditLog.count({
      where: { action: "ride.verification_support_verified", entityId: rideC.id }
    })) === 1
  );
  await start(driverB.user.id, rideC.id);
  await complete(driverB.user.id, rideC.id);

  /* ---------------------------------------------------------- F. lockout --- */
  const rideD = await newRide(riderD.id, "cash");
  await assign(driverA.user.id, rideD.id);
  await arrive(driverA.user.id, rideD.id);
  const codeD = await drive.getRideVerificationCode({ userId: riderD.id, rideId: rideD.id });
  const wrongD = String((Number(codeD.code) + 1) % 10_000).padStart(4, "0");
  for (let attempt = 1; attempt <= drive.RIDE_VERIFICATION_MAX_ATTEMPTS; attempt += 1) {
    await prisma.rideVerification.update({
      where: { rideId: rideD.id },
      data: { lastAttemptAt: new Date(Date.now() - 5_000) }
    });
    const error = await expectError(
      `wrong code attempt ${attempt} is rejected`,
      () => drive.verifyPassenger({ userId: driverA.user.id, rideId: rideD.id, code: wrongD }),
      attempt === drive.RIDE_VERIFICATION_MAX_ATTEMPTS ? 429 : 400,
      attempt === drive.RIDE_VERIFICATION_MAX_ATTEMPTS ? "verification_locked" : "invalid_passenger_code"
    );
    if (!error) break;
  }
  const lockedRecord = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideD.id } });
  check(
    "attempt limit is persisted and locks the record",
    lockedRecord.attemptCount === drive.RIDE_VERIFICATION_MAX_ATTEMPTS &&
      lockedRecord.verifiedAt === null
  );
  await expectError(
    "the locked record refuses the correct code",
    () => drive.verifyPassenger({ userId: driverA.user.id, rideId: rideD.id, code: codeD.code! }),
    429,
    "verification_locked"
  );
  await expectError(
    "start is refused while the record is locked",
    () => start(driverA.user.id, rideD.id),
    429,
    "verification_locked"
  );
  await drive.cancelRide({
    actorId: riderD.id,
    isAdmin: false,
    rideId: rideD.id,
    reason: "Lockout scenario cleanup"
  });

  /* ------------------------------------------------------- G. concurrency --- */
  const rideE = await newRide(riderE.id, "cash");
  await assign(driverB.user.id, rideE.id);
  await arrive(driverB.user.id, rideE.id);
  const codeE = await drive.getRideVerificationCode({ userId: riderE.id, rideId: rideE.id });
  const wrongE = String((Number(codeE.code) + 1) % 10_000).padStart(4, "0");
  const concurrent = await Promise.allSettled([
    drive.verifyPassenger({ userId: driverB.user.id, rideId: rideE.id, code: codeE.code! }),
    drive.verifyPassenger({ userId: driverB.user.id, rideId: rideE.id, code: wrongE })
  ]);
  const settled = concurrent.map((entry) =>
    entry.status === "fulfilled"
      ? { status: 200, code: "ok" }
      : { status: (entry.reason as { status?: number }).status ?? 500, code: (entry.reason as { code?: string }).code ?? "error" }
  );
  check(
    "concurrent correct+wrong submissions never bypass verification",
    settled.every((entry) => [200, 400, 409, 429].includes(entry.status)),
    JSON.stringify(settled)
  );
  let concurrencyRecord = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideE.id } });
  if (!concurrencyRecord.verifiedAt) {
    await prisma.rideVerification.update({
      where: { rideId: rideE.id },
      data: { lastAttemptAt: new Date(Date.now() - 5_000) }
    });
    const retry = await drive.verifyPassenger({
      userId: driverB.user.id,
      rideId: rideE.id,
      code: codeE.code!
    });
    check("correct retry after the concurrent window verifies", retry.verified === true);
  } else {
    check("the concurrent correct submission verified", true);
  }
  concurrencyRecord = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideE.id } });
  check(
    "concurrent attempts leave one verified record below its limit",
    Boolean(concurrencyRecord.verifiedAt) &&
      concurrencyRecord.attemptCount <= drive.RIDE_VERIFICATION_MAX_ATTEMPTS
  );
  check(
    "concurrency left the ride unstarted until the start transition",
    (await prisma.ride.findUniqueOrThrow({ where: { id: rideE.id }, select: { status: true } })).status ===
      "driver_arriving"
  );
  const starts = await Promise.allSettled([
    start(driverB.user.id, rideE.id),
    start(driverB.user.id, rideE.id)
  ]);
  const startOutcomes = starts.map((entry) => (entry.status === "fulfilled" ? 200 : (entry.reason as { status?: number }).status ?? 500));
  check(
    "two concurrent starts produce exactly one transition",
    startOutcomes.filter((status) => status === 200).length === 1 &&
      startOutcomes.filter((status) => status >= 400).length === 1,
    JSON.stringify(startOutcomes)
  );
  const rideEAfter = await prisma.ride.findUniqueOrThrow({
    where: { id: rideE.id },
    select: { status: true, startedAt: true }
  });
  check("ride is in progress once with one start timestamp", rideEAfter.status === "in_progress" && Boolean(rideEAfter.startedAt));
  check(
    "only one verification event exists for the concurrent ride",
    (await prisma.rideEvent.count({ where: { rideId: rideE.id, label: "Passenger verified" } })) === 1
  );
  await complete(driverB.user.id, rideE.id);

  /* ------------------------------------------ H. active-ride rating guard --- */
  const rideF = await newRide(riderF.id, "cash");
  await assign(driverA.user.id, rideF.id);
  await expectError(
    "an active trip cannot be rated",
    () => drive.submitRideRating({ userId: riderF.id, rideId: rideF.id, score: 5 }),
    409,
    "ride_not_completed"
  );
  await drive.cancelRide({ actorId: riderF.id, isAdmin: false, rideId: rideF.id, reason: "Rating guard cleanup" });

  /* ------------------------------------------ I. safety reports separate --- */
  const safetyRider = await drive.submitRideSafetyReport({
    userId: riderA.id,
    rideId: rideA.id,
    category: "unsafe_driving",
    details: "The vehicle changed lane without indicating near Maryland."
  });
  const safetyDriver = await drive.submitRideSafetyReport({
    userId: driverA.user.id,
    rideId: rideA.id,
    category: "other",
    details: "Passenger opened the door before the vehicle stopped."
  });
  check(
    "both participants can file safety reports",
    safetyRider.status === "submitted" && safetyDriver.status === "submitted"
  );
  await expectError(
    "an unrelated account cannot file a safety report",
    () =>
      drive.submitRideSafetyReport({
        userId: outsider.id,
        rideId: rideA.id,
        category: "other",
        details: "Not a participant on this trip."
      }),
    403,
    "forbidden"
  );
  const riderReports = await drive.listRideSafetyReports({
    userId: riderA.id,
    isAdmin: false,
    rideId: rideA.id
  });
  const adminReports = await drive.listRideSafetyReports({
    userId: admin.id,
    isAdmin: true,
    rideId: rideA.id
  });
  check(
    "safety reports are separate operational records, not ratings",
    riderReports.length === 1 &&
      adminReports.length === 2 &&
      (await prisma.rideRating.count({ where: { rideId: rideA.id } })) === 2
  );
  check(
    "safety report text is not emitted as public rating feedback",
    !JSON.stringify(adminReports).includes("Smooth trip") &&
      !JSON.stringify(riderReports).includes("Ready at pick-up")
  );

  /* ------------------------------------------ J. wallet refund receipt --- */
  const wallet = await fundRiderWallet(riderW.id, BigInt(300_000));
  const rideW = await newRide(riderW.id, "wallet");
  walletReferences.add(`RIDE-${rideW.id}-HOLD`);
  walletReferences.add(`RIDE-${rideW.id}-REFUND`);
  const walletHeld = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
  check(
    "wallet ride holds the fare at request",
    walletHeld.heldKobo === rideW.fareKobo && walletHeld.availableKobo === BigInt(300_000) - rideW.fareKobo,
    JSON.stringify({ available: walletHeld.availableKobo.toString(), held: walletHeld.heldKobo.toString() })
  );
  await assign(driverA.user.id, rideW.id);
  await drive.cancelRide({ actorId: riderW.id, isAdmin: false, rideId: rideW.id, reason: "Wallet receipt test" });
  const cancelledW = await prisma.ride.findUniqueOrThrow({ where: { id: rideW.id } });
  const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
  check(
    "cancelling before start refunds the full held fare",
    cancelledW.paymentStatus === "refunded" &&
      walletAfter.heldKobo === BigInt(0) &&
      walletAfter.availableKobo === BigInt(300_000),
    JSON.stringify({
      paymentStatus: cancelledW.paymentStatus,
      available: walletAfter.availableKobo.toString(),
      held: walletAfter.heldKobo.toString()
    })
  );
  const receiptW = await drive.getRideReceipt({ userId: riderW.id, isAdmin: false, rideId: rideW.id });
  const itemisedW =
    receiptW.fare.baseKobo + receiptW.fare.distanceKobo + receiptW.fare.timeKobo + receiptW.fare.adjustmentKobo;
  check(
    "cancelled wallet receipt shows the refund adjustment and zero charge",
    itemisedW === receiptW.fare.totalKobo &&
      receiptW.payment.method === "wallet" &&
      receiptW.payment.status === "refunded" &&
      receiptW.payment.receiptReference === `RIDE-${rideW.id}-REFUND` &&
      receiptW.adjustments.refundedKobo === receiptW.fare.totalKobo &&
      receiptW.adjustments.cancellationFeeKobo === 0 &&
      receiptW.adjustments.chargedKobo === 0,
    JSON.stringify({
      payment: receiptW.payment,
      adjustments: receiptW.adjustments
    })
  );
  await expectError(
    "a cancelled trip cannot be rated",
    () => drive.submitRideRating({ userId: riderW.id, rideId: rideW.id, score: 5 }),
    409,
    "ride_not_completed"
  );

  } finally {
    await cleanupFixtures();
  }

  const leftovers = {
    rides: await prisma.ride.count({ where: { id: { in: rideIds } } }),
    verifications: await prisma.rideVerification.count({ where: { rideId: { in: rideIds } } }),
    ratings: await prisma.rideRating.count({ where: { rideId: { in: rideIds } } }),
    reports: await prisma.rideSafetyReport.count({ where: { rideId: { in: rideIds } } }),
    users: await prisma.user.count({ where: { email: { startsWith: RUN_ID } } }),
    wallets: await prisma.wallet.count({ where: { id: { in: walletIds } } })
  };
  check("cleanup removed every RUN_ID fixture", Object.values(leftovers).every((count) => count === 0), JSON.stringify(leftovers));

  const systemAfter = await prisma.wallet.findFirstOrThrow({
    where: { ownerType: "SYSTEM" },
    select: { availableKobo: true, heldKobo: true }
  });
  check(
    "SYSTEM wallet restored to its exact pre-run position",
    systemAfter.availableKobo === systemBefore.availableKobo && systemAfter.heldKobo === systemBefore.heldKobo,
    JSON.stringify({
      before: { available: systemBefore.availableKobo.toString(), held: systemBefore.heldKobo.toString() },
      after: { available: systemAfter.availableKobo.toString(), held: systemAfter.heldKobo.toString() }
    })
  );

  const reconciliation = await reconcile();
  check(
    "wallet reconciliation has no new issues after cleanup",
    reconciliation.issues.length === 0,
    JSON.stringify(reconciliation.issues.slice(0, 3))
  );

  await prisma.$disconnect();

  console.log(
    JSON.stringify(
      {
        runId: RUN_ID,
        database: DB,
        checks: checks.length,
        passed: checks.length - failures,
        failed: failures,
        leftovers,
        status: failures === 0 ? "PASS" : "FAIL"
      },
      null,
      2
    )
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
