/**
 * NaijaDrive protected pickup verification, receipts and participant ratings.
 *
 * Executes the real services against `naijadeals_wallet_acceptance` only:
 *
 *   - assignment creates a dedicated RideVerification record (never an event log);
 *   - the rider-only endpoint returns the raw 4-digit code; driver endpoints never do;
 *   - wrong code, expiry, attempt lock, cooldown, repeated and concurrent submissions;
 *   - the authoritative start transition refuses an unverified trip;
 *   - bounded pre-enforcement legacy: only the cutover marker, never a missing row,
 *     can authorise a start; post-enforcement missing rows fail closed into the
 *     audited support recovery flow; reassignment/expiry end the exemption;
 *   - every start records its authorization basis (passenger_code, support_override
 *     or pre_enforcement_assignment);
 *   - support reset/verify is RBAC/explicit at the route, reason-bound, audited and
 *     rate-limited per ride and per operator from durable audit rows;
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
import { createHmac, randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

const DB = "naijadeals_wallet_acceptance";
const RUN_ID = `drive-verify-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
const REPO_ROOT = path.resolve(__dirname, "..");
// Ephemeral acceptance keys. They exist only in this process environment and are
// never written to the database, a file or the console.
const TEST_KEY_V1 = `test-drive-key-v1-${randomBytes(16).toString("hex")}`;
const TEST_KEY_V2 = `test-drive-key-v2-${randomBytes(16).toString("hex")}`;

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

/**
 * Test-side mirrors used only to construct known fixtures. Production behavior
 * always comes from the service under test.
 *
 * `legacyDerivedCode`/`legacyHashFor` reproduce the pre-key salt-only scheme so
 * the suite can create a legacy row and prove the runtime refuses it.
 * `keyedCode`/`keyedHash` mirror the server-keyed scheme so a known leading-zero
 * code or a record for a previous key version can be built.
 */
const CODE_SPACE = 10_000;
const LEGACY_ALGORITHM_V2 = "scrypt-hmac-sha256-v2";
const KEYED_ALGORITHM = "hmac-sha256-pepper-v1";
const MESSAGE_DOMAIN = "naijadrive-pickup-verification:v1";

function legacyDerivedCode(salt: string, rideId: string, algorithm: "v1" | "v2") {
  if (algorithm === "v1") {
    const digest = createHmac("sha256", salt).update(`${rideId}:naijadrive-pickup-verification`).digest();
    return String(digest.readUInt32BE(0) % CODE_SPACE).padStart(4, "0");
  }
  const limit = Math.floor(0x1_0000_0000 / CODE_SPACE) * CODE_SPACE;
  for (let counter = 0; counter < 32; counter += 1) {
    const digest = createHmac("sha256", salt).update(`${rideId}:naijadrive-pickup-verification:${counter}`).digest();
    const value = digest.readUInt32BE(0);
    if (value < limit) return String(value % CODE_SPACE).padStart(4, "0");
  }
  throw new Error("legacy fixture derivation exhausted its rejection loop");
}

function legacyHashFor(code: string, salt: string) {
  return scryptSync(code, salt, 32).toString("hex");
}

function keyedCode(salt: string, rideId: string, keyVersion: number, secret: string) {
  const limit = Math.floor(0x1_0000_0000 / CODE_SPACE) * CODE_SPACE;
  const message = (counter: number | "fallback") =>
    `${MESSAGE_DOMAIN}:k${keyVersion}:${rideId}:${salt}:${counter}`;
  for (let counter = 0; counter < 32; counter += 1) {
    const digest = createHmac("sha256", secret).update(message(counter)).digest();
    const value = digest.readUInt32BE(0);
    if (value < limit) return String(value % CODE_SPACE).padStart(4, "0");
  }
  return String(createHmac("sha256", secret).update(message("fallback")).digest().readUInt32BE(0) % CODE_SPACE).padStart(
    4,
    "0"
  );
}

function keyedHashFor(code: string, salt: string, keyVersion: number, secret: string) {
  return scryptSync(code, `naijadrive-pickup-verifier:v1:k${keyVersion}:${salt}:${secret}`, 32).toString("hex");
}

function useVerificationKeyVersion(version: 1 | 2) {
  process.env.DRIVE_PICKUP_VERIFICATION_KEY_VERSION = String(version);
}

/** Restore an env var exactly, deleting it when it was originally unset. */
function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

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
  // Explicit, versioned key configuration. The service has no default: these are
  // required before the module is imported and every call reads them lazily.
  process.env.DRIVE_PICKUP_VERIFICATION_KEY_VERSION = "1";
  process.env.DRIVE_PICKUP_VERIFICATION_KEY_V1 = TEST_KEY_V1;
  process.env.DRIVE_PICKUP_VERIFICATION_KEY_V2 = TEST_KEY_V2;

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
    "assignment creates one keyed record with hash/salt/key version/expiry/limits",
    recordA.algorithm === KEYED_ALGORITHM &&
      recordA.keyVersion === 1 &&
      recordA.codeHash.length === 64 &&
      recordA.salt.length === 32 &&
      recordA.expiresAt.getTime() > Date.now() &&
      recordA.maxAttempts === drive.RIDE_VERIFICATION_MAX_ATTEMPTS &&
      recordA.attemptCount === 0 &&
      recordA.verifiedAt === null,
    JSON.stringify({
      algorithm: recordA.algorithm,
      keyVersion: recordA.keyVersion,
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
    "stored verifier is keyed by the server secret, not the salt-only scrypt hash",
    recordA.codeHash === keyedHashFor(rawA, recordA.salt, 1, TEST_KEY_V1) &&
      recordA.codeHash !== legacyHashFor(rawA, recordA.salt) &&
      recordA.codeHash !== rawA &&
      recordA.salt !== rawA,
    JSON.stringify({ matchesKeyed: recordA.codeHash === keyedHashFor(rawA, recordA.salt, 1, TEST_KEY_V1) })
  );
  check(
    "no SystemEvent row carries a verification salt or key material",
    (await prisma.systemEvent.count({
      where: { entityId: rideA.id, type: { contains: "verification" } }
    })) === 0
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

  await expectError(
    "support reset requires a reason",
    () =>
      drive.overrideRideVerification({
        adminId: admin.id,
        rideId: rideB.id,
        action: "reset",
        reason: "   "
      }),
    400,
    "invalid_reason"
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

  /* ---------------- K. server-key storage, rotation and legacy transition --- */
  const riderG = await createUser("CUSTOMER", "rider-g");
  const riderH = await createUser("CUSTOMER", "rider-h");

  // A record written by the pre-key service (salt-only v2) must not verify. The
  // runtime refuses it without consuming an attempt, and the rider's read path
  // deliberately rotates it to a keyed record.
  const rideLegacy = await newRide(riderG.id, "cash");
  await assign(driverA.user.id, rideLegacy.id);
  const legacySalt = randomBytes(16).toString("hex");
  const legacyLiveCode = legacyDerivedCode(legacySalt, rideLegacy.id, "v2");
  await prisma.rideVerification.update({
    where: { rideId: rideLegacy.id },
    data: {
      algorithm: LEGACY_ALGORITHM_V2,
      keyVersion: null,
      salt: legacySalt,
      codeHash: legacyHashFor(legacyLiveCode, legacySalt)
    }
  });
  await expectError(
    "a legacy salt-only code is refused by the driver",
    () => drive.verifyPassenger({ userId: driverA.user.id, rideId: rideLegacy.id, code: legacyLiveCode }),
    409,
    "verification_reissue_required"
  );
  const legacyUnchanged = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideLegacy.id } });
  check(
    "refusing a legacy code consumes no attempt and does not mark it verified",
    legacyUnchanged.attemptCount === 0 && legacyUnchanged.verifiedAt === null && legacyUnchanged.keyVersion === null
  );

  const legacyRider = await drive.getRideVerificationCode({ userId: riderG.id, rideId: rideLegacy.id });
  const rotatedRecord = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideLegacy.id } });
  check(
    "opening the rider screen replaces a legacy row with a keyed record",
    rotatedRecord.keyVersion === 1 &&
      rotatedRecord.algorithm === KEYED_ALGORITHM &&
      rotatedRecord.salt !== legacySalt &&
      rotatedRecord.codeHash !== legacyHashFor(legacyLiveCode, legacySalt) &&
      typeof legacyRider.code === "string" &&
      /^\d{4}$/.test(legacyRider.code),
    safeJson({ keyVersion: rotatedRecord.keyVersion, algorithm: rotatedRecord.algorithm })
  );
  check(
    "the rotated row stores the keyed verifier, not the salt-only hash",
    rotatedRecord.codeHash === keyedHashFor(legacyRider.code!, rotatedRecord.salt, 1, TEST_KEY_V1)
  );
  const legacyRotationAudit = await prisma.auditLog.findFirstOrThrow({
    where: { action: "ride.verification_legacy_reissued", entityId: rideLegacy.id }
  });
  const legacyAuditText = safeJson(legacyRotationAudit.metadata);
  check(
    "the legacy rotation is audited without salt, code or key material",
    !legacyAuditText.includes(legacySalt) &&
      !legacyAuditText.includes(legacyLiveCode) &&
      !legacyAuditText.includes(TEST_KEY_V1) &&
      !legacyAuditText.includes(TEST_KEY_V2),
    legacyAuditText
  );
  const legacyVerify = await drive.verifyPassenger({
    userId: driverA.user.id,
    rideId: rideLegacy.id,
    code: legacyRider.code!
  });
  check("the rotated keyed code verifies", legacyVerify.verified === true);
  await arrive(driverA.user.id, rideLegacy.id);
  await start(driverA.user.id, rideLegacy.id);
  await complete(driverA.user.id, rideLegacy.id);

  // Database-only disclosure fixture: the live code is not reproducible from the
  // stored salt, algorithm and key version, and the stored verifier is not the
  // unkeyed scrypt hash. The two derivations differ for this fixture by
  // construction, so the check is deterministic.
  const rideDbOnly = await newRide(riderG.id, "cash");
  await assign(driverA.user.id, rideDbOnly.id);
  let dbSalt = "";
  let dbCode = "";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = randomBytes(16).toString("hex");
    const candidateCode = keyedCode(candidate, rideDbOnly.id, 1, TEST_KEY_V1);
    if (legacyDerivedCode(candidate, rideDbOnly.id, "v2") !== candidateCode) {
      dbSalt = candidate;
      dbCode = candidateCode;
      break;
    }
  }
  check("fixture found a keyed code that salt-only derivation does not reproduce", dbSalt !== "");
  await prisma.rideVerification.update({
    where: { rideId: rideDbOnly.id },
    data: {
      algorithm: KEYED_ALGORITHM,
      keyVersion: 1,
      salt: dbSalt,
      codeHash: keyedHashFor(dbCode, dbSalt, 1, TEST_KEY_V1)
    }
  });
  const dbRow = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideDbOnly.id } });
  check(
    "a database row alone does not yield a usable code",
    legacyDerivedCode(dbRow.salt, rideDbOnly.id, "v2") !== dbCode &&
      dbRow.codeHash !== legacyHashFor(dbCode, dbRow.salt) &&
      dbRow.codeHash !== dbCode &&
      dbRow.salt !== dbCode,
    JSON.stringify({ algorithm: dbRow.algorithm, keyVersion: dbRow.keyVersion })
  );
  const codeDbOnly = await drive.getRideVerificationCode({ userId: riderG.id, rideId: rideDbOnly.id });
  check("the rider still retrieves the keyed code", codeDbOnly.code === dbCode);
  await drive.cancelRide({
    actorId: riderG.id,
    isAdmin: false,
    rideId: rideDbOnly.id,
    reason: "Database-only disclosure cleanup"
  });

  // Leading zeros are valid digits, not a numeric value. Construct a keyed record
  // whose real code starts with zero and prove both the endpoint and the driver
  // submission preserve it.
  const rideZero = await newRide(riderG.id, "cash");
  await assign(driverA.user.id, rideZero.id);
  let zeroSalt = "";
  let zeroCode = "";
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const candidate = randomBytes(16).toString("hex");
    const candidateCode = keyedCode(candidate, rideZero.id, 1, TEST_KEY_V1);
    if (candidateCode.startsWith("0")) {
      zeroSalt = candidate;
      zeroCode = candidateCode;
      break;
    }
  }
  check("fixture search found a leading-zero code", zeroSalt !== "" && zeroCode.startsWith("0"), zeroCode);
  await prisma.rideVerification.update({
    where: { rideId: rideZero.id },
    data: {
      algorithm: KEYED_ALGORITHM,
      keyVersion: 1,
      salt: zeroSalt,
      codeHash: keyedHashFor(zeroCode, zeroSalt, 1, TEST_KEY_V1)
    }
  });
  const codeZero = await drive.getRideVerificationCode({ userId: riderG.id, rideId: rideZero.id });
  check(
    "the rider endpoint returns a four-character leading-zero code",
    codeZero.code === zeroCode && /^0\d{3}$/.test(codeZero.code ?? ""),
    JSON.stringify({ returned: codeZero.code, expected: zeroCode })
  );
  const verifiedZero = await drive.verifyPassenger({ userId: driverA.user.id, rideId: rideZero.id, code: zeroCode });
  check("the driver submission accepts a leading-zero code", verifiedZero.verified === true);
  await drive.cancelRide({
    actorId: riderG.id,
    isAdmin: false,
    rideId: rideZero.id,
    reason: "Leading-zero acceptance cleanup"
  });

  // Attempts belong to the ride. A refresh must not clear them, and neither may a
  // release followed by re-acceptance.
  const rideBudget = await newRide(riderG.id, "cash");
  await assign(driverA.user.id, rideBudget.id);
  const codeBudget = await drive.getRideVerificationCode({ userId: riderG.id, rideId: rideBudget.id });
  const wrongBudget = String((Number(codeBudget.code) + 1) % 10_000).padStart(4, "0");
  await expectError(
    "first wrong code increments the attempt counter",
    () => drive.verifyPassenger({ userId: driverA.user.id, rideId: rideBudget.id, code: wrongBudget }),
    400,
    "invalid_passenger_code"
  );
  const beforeRefresh = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideBudget.id } });
  await drive.getRideVerificationCode({ userId: riderG.id, rideId: rideBudget.id });
  await drive.getRideVerificationCode({ userId: riderG.id, rideId: rideBudget.id });
  const afterRefresh = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideBudget.id } });
  check(
    "refreshing the rider screen neither resets nor increments attempts",
    afterRefresh.attemptCount === beforeRefresh.attemptCount && afterRefresh.attemptCount === 1,
    JSON.stringify({ before: beforeRefresh.attemptCount, after: afterRefresh.attemptCount })
  );

  await drive.releaseRide({ userId: driverA.user.id, rideId: rideBudget.id, reason: "Budget test release" });
  const releasedRecord = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideBudget.id } });
  check("release invalidates the current code", Boolean(releasedRecord.invalidatedAt));
  await assign(driverA.user.id, rideBudget.id);
  const reassignedRecord = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideBudget.id } });
  const codeBudget2 = await drive.getRideVerificationCode({ userId: riderG.id, rideId: rideBudget.id });
  check(
    "reassignment rotates the code but carries the spent attempt budget",
    reassignedRecord.salt !== releasedRecord.salt &&
      reassignedRecord.attemptCount === 1 &&
      reassignedRecord.verifiedAt === null &&
      reassignedRecord.keyVersion === 1 &&
      codeBudget2.code === keyedCode(reassignedRecord.salt, rideBudget.id, 1, TEST_KEY_V1),
    JSON.stringify({ attempts: reassignedRecord.attemptCount, code: codeBudget2.code })
  );
  const verifiedBudget = await drive.verifyPassenger({
    userId: driverA.user.id,
    rideId: rideBudget.id,
    code: codeBudget2.code!
  });
  check(
    "the reassigned code verifies with the remaining budget, not a fresh five",
    verifiedBudget.verified === true && verifiedBudget.attemptsRemaining === drive.RIDE_VERIFICATION_MAX_ATTEMPTS - 1,
    JSON.stringify({ attemptsRemaining: verifiedBudget.attemptsRemaining })
  );
  await arrive(driverA.user.id, rideBudget.id);
  await start(driverA.user.id, rideBudget.id);
  await complete(driverA.user.id, rideBudget.id);

  /* ---------------- K2. key rotation and fail-closed configuration --- */
  const rideRotateV1 = await newRide(riderG.id, "cash");
  await assign(driverA.user.id, rideRotateV1.id);
  const rotateV1Record = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideRotateV1.id } });
  const rotateV1Code = await drive.getRideVerificationCode({ userId: riderG.id, rideId: rideRotateV1.id });
  check(
    "active version 1 issues a version-1 record derived with that key",
    rotateV1Record.keyVersion === 1 &&
      rotateV1Code.code === keyedCode(rotateV1Record.salt, rideRotateV1.id, 1, TEST_KEY_V1),
    JSON.stringify({ keyVersion: rotateV1Record.keyVersion })
  );

  useVerificationKeyVersion(2);
  const rideRotateV2 = await newRide(riderH.id, "cash");
  await assign(driverB.user.id, rideRotateV2.id);
  const rotateV2Record = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideRotateV2.id } });
  const rotateV2Code = await drive.getRideVerificationCode({ userId: riderH.id, rideId: rideRotateV2.id });
  check(
    "new records use the new key version after rotation",
    rotateV2Record.keyVersion === 2 &&
      rotateV2Record.algorithm === KEYED_ALGORITHM &&
      rotateV2Code.code === keyedCode(rotateV2Record.salt, rideRotateV2.id, 2, TEST_KEY_V2),
    JSON.stringify({ keyVersion: rotateV2Record.keyVersion })
  );
  const rotatedVerifyV2 = await drive.verifyPassenger({
    userId: driverB.user.id,
    rideId: rideRotateV2.id,
    code: rotateV2Code.code!
  });
  check("a version-2 record verifies with the version-2 key", rotatedVerifyV2.verified === true);
  await arrive(driverB.user.id, rideRotateV2.id);
  await start(driverB.user.id, rideRotateV2.id);
  await complete(driverB.user.id, rideRotateV2.id);

  const rotateV1Again = await drive.getRideVerificationCode({ userId: riderG.id, rideId: rideRotateV1.id });
  check(
    "a version-1 record still derives with its recorded key after rotation",
    rotateV1Again.code === rotateV1Code.code,
    JSON.stringify({ expected: rotateV1Code.code, returned: rotateV1Again.code })
  );
  const rotatedVerifyV1 = await drive.verifyPassenger({
    userId: driverA.user.id,
    rideId: rideRotateV1.id,
    code: rotateV1Code.code!
  });
  check("a version-1 record still verifies after rotation", rotatedVerifyV1.verified === true);
  await arrive(driverA.user.id, rideRotateV1.id);
  await start(driverA.user.id, rideRotateV1.id);
  await complete(driverA.user.id, rideRotateV1.id);

  // Retiring a key while a record still references it must fail closed on every
  // path that would derive or verify the code. No attempt is consumed.
  const savedKeyV1 = process.env.DRIVE_PICKUP_VERIFICATION_KEY_V1;
  delete process.env.DRIVE_PICKUP_VERIFICATION_KEY_V1;
  try {
    const retiredRide = await newRide(riderH.id, "cash");
    await assign(driverA.user.id, retiredRide.id);
    const retiredSalt = randomBytes(16).toString("hex");
    const retiredCode = keyedCode(retiredSalt, retiredRide.id, 1, TEST_KEY_V1);
    await prisma.rideVerification.update({
      where: { rideId: retiredRide.id },
      data: {
        algorithm: KEYED_ALGORITHM,
        keyVersion: 1,
        salt: retiredSalt,
        codeHash: keyedHashFor(retiredCode, retiredSalt, 1, TEST_KEY_V1)
      }
    });
    await expectError(
      "a retired key version fails closed on rider retrieval",
      () => drive.getRideVerificationCode({ userId: riderH.id, rideId: retiredRide.id }),
      503,
      "verification_key_unavailable"
    );
    await expectError(
      "a retired key version fails closed on driver verification",
      () => drive.verifyPassenger({ userId: driverA.user.id, rideId: retiredRide.id, code: retiredCode }),
      503,
      "verification_key_unavailable"
    );
    const retiredRow = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: retiredRide.id } });
    check(
      "a missing key does not consume an attempt or mark the record verified",
      retiredRow.attemptCount === 0 && retiredRow.verifiedAt === null
    );
    await arrive(driverA.user.id, retiredRide.id);
    await expectError(
      "start fails closed when the record's key is missing",
      () => start(driverA.user.id, retiredRide.id),
      503,
      "verification_key_unavailable"
    );
    await drive.cancelRide({
      actorId: riderH.id,
      isAdmin: false,
      rideId: retiredRide.id,
      reason: "Retired-key cleanup"
    });
  } finally {
    restoreEnv("DRIVE_PICKUP_VERIFICATION_KEY_V1", savedKeyV1);
  }

  // No active key version: acceptance must abort and leave the ride untouched,
  // rather than issuing a salt-only record or silently skipping protection.
  const noKeyRide = await newRide(riderF.id, "cash");
  const noKeyResetRide = await newRide(riderH.id, "cash");
  await assign(driverA.user.id, noKeyResetRide.id);
  await prisma.rideVerification.update({
    where: { rideId: noKeyResetRide.id },
    data: { attemptCount: drive.RIDE_VERIFICATION_MAX_ATTEMPTS }
  });
  const savedKeyVersion = process.env.DRIVE_PICKUP_VERIFICATION_KEY_VERSION;
  delete process.env.DRIVE_PICKUP_VERIFICATION_KEY_VERSION;
  try {
    await expectError(
      "acceptance fails closed when the active key version is unset",
      () => assign(driverB.user.id, noKeyRide.id),
      503,
      "verification_key_unavailable"
    );
    const untouched = await prisma.ride.findUniqueOrThrow({ where: { id: noKeyRide.id } });
    check(
      "the failed acceptance leaves the ride requested, unassigned and record-free",
      untouched.status === "requested" &&
        untouched.driverId === null &&
        (await prisma.rideVerification.count({ where: { rideId: noKeyRide.id } })) === 0
    );
    await expectError(
      "rider reset fails closed when the active key is unset",
      () => drive.resetRideVerificationByRider({ userId: riderH.id, rideId: noKeyResetRide.id }),
      503,
      "verification_key_unavailable"
    );
    const resetRecord = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: noKeyResetRide.id } });
    check(
      "the failed reset leaves the locked record and attempt count untouched",
      resetRecord.attemptCount === drive.RIDE_VERIFICATION_MAX_ATTEMPTS && resetRecord.verifiedAt === null
    );
  } finally {
    restoreEnv("DRIVE_PICKUP_VERIFICATION_KEY_VERSION", savedKeyVersion);
  }
  await drive.cancelRide({
    actorId: riderH.id,
    isAdmin: false,
    rideId: noKeyResetRide.id,
    reason: "Fail-closed configuration cleanup"
  });
  await drive.cancelRide({
    actorId: riderF.id,
    isAdmin: false,
    rideId: noKeyRide.id,
    reason: "Fail-closed configuration cleanup"
  });

  // A configured but too-short key is invalid. Do not accept it as a weak key.
  const shortKeyRide = await newRide(riderG.id, "cash");
  await assign(driverA.user.id, shortKeyRide.id);
  const shortKeyAcceptRide = await newRide(riderF.id, "cash");
  const savedKeyV2 = process.env.DRIVE_PICKUP_VERIFICATION_KEY_V2;
  process.env.DRIVE_PICKUP_VERIFICATION_KEY_V2 = "too-short";
  try {
    await expectError(
      "a short key fails closed on rider retrieval",
      () => drive.getRideVerificationCode({ userId: riderG.id, rideId: shortKeyRide.id }),
      503,
      "verification_key_unavailable"
    );
    await expectError(
      "a short key fails closed on new acceptance",
      () => assign(driverB.user.id, shortKeyAcceptRide.id),
      503,
      "verification_key_unavailable"
    );
  } finally {
    restoreEnv("DRIVE_PICKUP_VERIFICATION_KEY_V2", savedKeyV2);
  }
  await drive.cancelRide({
    actorId: riderG.id,
    isAdmin: false,
    rideId: shortKeyRide.id,
    reason: "Fail-closed configuration cleanup"
  });
  await drive.cancelRide({
    actorId: riderF.id,
    isAdmin: false,
    rideId: shortKeyAcceptRide.id,
    reason: "Fail-closed configuration cleanup"
  });

  /* ------------------------------- L. rider reset and suspended driver --- */
  const rideReset = await newRide(riderH.id, "cash");
  await assign(driverB.user.id, rideReset.id);
  await expectError(
    "an unrelated rider cannot reset another ride's code",
    () => drive.resetRideVerificationByRider({ userId: riderG.id, rideId: rideReset.id }),
    403,
    "forbidden"
  );
  await expectError(
    "the driver cannot reset the rider's code",
    () => drive.resetRideVerificationByRider({ userId: driverB.user.id, rideId: rideReset.id }),
    403,
    "forbidden"
  );
  await expectError(
    "an active code is not reset just because someone asks",
    () => drive.resetRideVerificationByRider({ userId: riderH.id, rideId: rideReset.id }),
    409,
    "verification_active"
  );
  await prisma.rideVerification.update({
    where: { rideId: rideReset.id },
    data: { attemptCount: drive.RIDE_VERIFICATION_MAX_ATTEMPTS }
  });
  const beforeRiderReset = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideReset.id } });
  const riderReset = await drive.resetRideVerificationByRider({ userId: riderH.id, rideId: rideReset.id });
  const afterRiderReset = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: rideReset.id } });
  check(
    "rider reset rotates a locked code and clears attempts without returning a code",
    afterRiderReset.salt !== beforeRiderReset.salt &&
      afterRiderReset.attemptCount === 0 &&
      afterRiderReset.verifiedAt === null &&
      riderReset.verification.locked === false &&
      !safeJson(riderReset).includes("\"code\"")
  );
  check(
    "rider reset wrote its audit row",
    (await prisma.auditLog.count({
      where: { action: "ride.verification_rider_reset", entityId: rideReset.id }
    })) === 1
  );
  const resetCode = await drive.getRideVerificationCode({ userId: riderH.id, rideId: rideReset.id });
  check("the rider receives a working code after reset", typeof resetCode.code === "string");
  const verifiedReset = await drive.verifyPassenger({
    userId: driverB.user.id,
    rideId: rideReset.id,
    code: resetCode.code!
  });
  check("the reset code verifies", verifiedReset.verified === true);
  await expectError(
    "a verified ride cannot be reset again",
    () => drive.resetRideVerificationByRider({ userId: riderH.id, rideId: rideReset.id }),
    409,
    "already_verified"
  );
  await arrive(driverB.user.id, rideReset.id);
  await start(driverB.user.id, rideReset.id);
  await complete(driverB.user.id, rideReset.id);

  // Reset abuse limit: three reissues per window, then a clear 429. The record is
  // forced expired between resets because a reset leaves an active code.
  const rideResetLimit = await newRide(riderH.id, "cash");
  await assign(driverB.user.id, rideResetLimit.id);
  await prisma.rideVerification.update({
    where: { rideId: rideResetLimit.id },
    data: { attemptCount: drive.RIDE_VERIFICATION_MAX_ATTEMPTS }
  });
  for (let reset = 1; reset <= drive.RIDE_VERIFICATION_MAX_RIDER_RESETS_PER_WINDOW; reset += 1) {
    const result = await drive.resetRideVerificationByRider({ userId: riderH.id, rideId: rideResetLimit.id });
    check(`rider reset ${reset} within the window succeeds`, result.reissued === true);
    await prisma.rideVerification.update({
      where: { rideId: rideResetLimit.id },
      data: { expiresAt: new Date(Date.now() - 1_000) }
    });
  }
  await expectError(
    "a fourth rider reset inside the window is rate limited",
    () => drive.resetRideVerificationByRider({ userId: riderH.id, rideId: rideResetLimit.id }),
    429,
    "verification_reset_rate_limited"
  );
  check(
    "the reset limit left exactly the allowed audit rows",
    (await prisma.auditLog.count({
      where: { action: "ride.verification_rider_reset", entityId: rideResetLimit.id }
    })) === drive.RIDE_VERIFICATION_MAX_RIDER_RESETS_PER_WINDOW
  );
  await drive.cancelRide({
    actorId: riderH.id,
    isAdmin: false,
    rideId: rideResetLimit.id,
    reason: "Reset-limit cleanup"
  });

  // A driver suspended after accepting can still verify and finish the trip they
  // hold; suspension blocks new work, not the assigned trip.
  const rideSuspended = await newRide(riderH.id, "cash");
  await assign(driverB.user.id, rideSuspended.id);
  const codeSuspended = await drive.getRideVerificationCode({ userId: riderH.id, rideId: rideSuspended.id });
  await prisma.driverProfile.update({
    where: { id: driverB.profile.id },
    data: { status: "suspended", suspendedReason: "Acceptance-suite suspension check" }
  });
  const suspendedVerify = await drive.verifyPassenger({
    userId: driverB.user.id,
    rideId: rideSuspended.id,
    code: codeSuspended.code!
  });
  check("a suspended driver can still verify the ride they already hold", suspendedVerify.verified === true);
  await prisma.driverProfile.update({
    where: { id: driverB.profile.id },
    data: { status: "approved", suspendedReason: null }
  });
  await arrive(driverB.user.id, rideSuspended.id);
  await start(driverB.user.id, rideSuspended.id);
  await complete(driverB.user.id, rideSuspended.id);

  /* ------------------ M. bounded pre-enforcement compatibility and recovery --- */
  // Only the enforcement migration writes this marker, and only for rides already
  // assigned at the cutover. The fixture reproduces that exact database state:
  // an assigned ride with no protected record and a one-time marker.
  async function markPreEnforcementAssignment(rideId: string, driverProfileId: string) {
    const markerAt = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.ride.update({
      where: { id: rideId },
      data: {
        driverId: driverProfileId,
        status: "driver_assigned",
        acceptedAt: new Date(markerAt.getTime() - 5 * 60 * 1000),
        assignmentExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        pickupVerificationLegacyAt: markerAt
      }
    });
    return markerAt;
  }

  const legacyRide = await newRide(riderG.id, "cash");
  const legacyMarkerAt = await markPreEnforcementAssignment(legacyRide.id, driverA.profile.id);
  check(
    "pre-enforcement fixture has the durable marker and no protected record",
    (await prisma.rideVerification.count({ where: { rideId: legacyRide.id } })) === 0 &&
      (await prisma.ride.findUniqueOrThrow({ where: { id: legacyRide.id } })).pickupVerificationLegacyAt !== null
  );
  const legacyCode = await drive.getRideVerificationCode({ userId: riderG.id, rideId: legacyRide.id });
  check(
    "a genuine pre-enforcement assignment reports no code and does not create a record",
    legacyCode.legacy === true &&
      legacyCode.recoveryRequired === false &&
      legacyCode.code === null &&
      legacyCode.required === false &&
      (await prisma.rideVerification.count({ where: { rideId: legacyRide.id } })) === 0,
    JSON.stringify(legacyCode)
  );
  await drive.getRideVerificationCode({ userId: riderG.id, rideId: legacyRide.id });
  check(
    "opening a legacy trip screen again still does not create a record",
    (await prisma.rideVerification.count({ where: { rideId: legacyRide.id } })) === 0
  );
  const legacyBoard = await drive.listDriverRides(driverA.user.id);
  const legacyRow = legacyBoard.active.find((ride) => ride.id === legacyRide.id);
  check(
    "the driver board marks the marked pre-enforcement ride as legacy, not verified",
    legacyRow?.verification?.legacy === true &&
      legacyRow?.verification?.recoveryRequired === false &&
      legacyRow?.verification?.required === false &&
      legacyRow?.verification?.verified === false,
    safeJson(legacyRow?.verification)
  );
  await expectError(
    "a pre-enforcement ride has no code for the driver to submit",
    () => drive.verifyPassenger({ userId: driverA.user.id, rideId: legacyRide.id, code: "1234" }),
    409,
    "verification_not_required"
  );
  await arrive(driverA.user.id, legacyRide.id);

  const legacyStarts = await Promise.allSettled([
    start(driverA.user.id, legacyRide.id),
    start(driverA.user.id, legacyRide.id)
  ]);
  check(
    "concurrent legacy starts move the ride exactly once",
    legacyStarts.some((entry) => entry.status === "fulfilled") &&
      (await prisma.ride.findUniqueOrThrow({ where: { id: legacyRide.id }, select: { status: true } })).status ===
        "in_progress" &&
      (await prisma.rideEvent.count({ where: { rideId: legacyRide.id, label: "Legacy pickup start" } })) === 1
  );
  const legacyStartAudits = await prisma.auditLog.findMany({
    where: { action: "ride.in_progress", entityId: legacyRide.id }
  });
  const legacyAudit = await prisma.auditLog.findFirst({
    where: { action: "ride.legacy_pickup_start_without_verification", entityId: legacyRide.id }
  });
  check(
    "the exceptional start records its authorization basis and marker",
    legacyAudit !== null &&
      (legacyAudit.metadata as Record<string, unknown>).authorizationBasis ===
        "pre_enforcement_assignment" &&
      (legacyAudit.metadata as Record<string, unknown>).legacyMarkerAt === legacyMarkerAt.toISOString() &&
      legacyStartAudits.length === 1 &&
      (legacyStartAudits[0].metadata as Record<string, unknown>).authorizationBasis ===
        "pre_enforcement_assignment",
    safeJson({ legacyAudit: legacyAudit?.metadata, startAudit: legacyStartAudits[0]?.metadata })
  );
  check(
    "the legacy start wrote the explicit event once",
    (await prisma.rideEvent.count({ where: { rideId: legacyRide.id, label: "Legacy pickup start" } })) === 1
  );

  // Durability across a fresh database client: there is no in-memory legacy set.
  // The marker and its audit trail survive independently of the service module.
  const { PrismaClient } = await import("@prisma/client");
  const freshClient = new PrismaClient();
  try {
    const reloadedRide = await freshClient.ride.findUniqueOrThrow({
      where: { id: legacyRide.id },
      select: { pickupVerificationLegacyAt: true, status: true }
    });
    const reloadedAudit = await freshClient.auditLog.count({
      where: { action: "ride.legacy_pickup_start_without_verification", entityId: legacyRide.id }
    });
    check(
      "legacy evidence is durable in the database, not process memory",
      reloadedRide.pickupVerificationLegacyAt?.getTime() === legacyMarkerAt.getTime() &&
        reloadedRide.status === "in_progress" &&
        reloadedAudit === 1
    );
  } finally {
    await freshClient.$disconnect();
  }
  check(
    "a ride already in progress is not requeued or blocked by verification",
    (await drive.driverUpdateRideStatus({
      userId: driverA.user.id,
      rideId: legacyRide.id,
      status: "completed"
    })).status === "completed"
  );

  // A genuinely in-progress trip that predates enforcement (or lost its row) must
  // still be completable. Completion never requires a pickup code; only a start
  // does. This fixture deliberately has neither a record nor a marker.
  const inProgressRide = await newRide(riderE.id, "cash");
  await assign(driverA.user.id, inProgressRide.id);
  await arrive(driverA.user.id, inProgressRide.id);
  await prisma.ride.update({
    where: { id: inProgressRide.id },
    data: { status: "in_progress", startedAt: new Date(), assignmentExpiresAt: null }
  });
  await prisma.rideVerification.delete({ where: { rideId: inProgressRide.id } });
  check(
    "a genuinely in-progress trip with no record and no marker can still complete",
    (await complete(driverA.user.id, inProgressRide.id)).status === "completed" &&
      (await prisma.ride.findUniqueOrThrow({ where: { id: inProgressRide.id } })).pickupVerificationLegacyAt ===
        null
  );

  // A post-enforcement assignment with a deleted record is not legacy. Every read
  // and transition fails closed until support performs an audited recovery.
  const missingRide = await newRide(riderH.id, "cash");
  await assign(driverB.user.id, missingRide.id);
  await prisma.rideVerification.delete({ where: { rideId: missingRide.id } });
  check(
    "deleting a post-enforcement record leaves no legacy marker",
    (await prisma.ride.findUniqueOrThrow({ where: { id: missingRide.id } })).pickupVerificationLegacyAt === null
  );
  await expectError(
    "the rider endpoint refuses a missing post-enforcement record instead of deriving a code",
    () => drive.getRideVerificationCode({ userId: riderH.id, rideId: missingRide.id }),
    409,
    "verification_record_missing"
  );
  await expectError(
    "the rider cannot self-reset a missing post-enforcement record",
    () => drive.resetRideVerificationByRider({ userId: riderH.id, rideId: missingRide.id }),
    409,
    "verification_record_missing"
  );
  await arrive(driverB.user.id, missingRide.id);
  const missingBoard = await drive.listDriverRides(driverB.user.id);
  const missingRow = missingBoard.active.find((ride) => ride.id === missingRide.id);
  check(
    "the driver board flags the missing record as recovery-required, not legacy",
    missingRow?.verification?.recoveryRequired === true &&
      missingRow?.verification?.legacy === false &&
      missingRow?.verification?.required === false,
    safeJson(missingRow?.verification)
  );
  await expectError(
    "the driver cannot submit a code for a missing record",
    () => drive.verifyPassenger({ userId: driverB.user.id, rideId: missingRide.id, code: "1234" }),
    409,
    "verification_record_missing"
  );
  await expectError(
    "the start transition fails closed when the record is missing",
    () => start(driverB.user.id, missingRide.id),
    409,
    "verification_record_missing"
  );
  check(
    "failed reads and starts did not auto-create a record",
    (await prisma.rideVerification.count({ where: { rideId: missingRide.id } })) === 0
  );

  const recoveryIssue = await drive.overrideRideVerification({
    adminId: admin.id,
    rideId: missingRide.id,
    action: "reset",
    reason: "Protected record missing after assignment; rider present"
  });
  const recoveryAudit = await prisma.auditLog.findFirstOrThrow({
    where: { action: "ride.verification_support_reset", entityId: missingRide.id }
  });
  check(
    "support recovery issues a record for a missing assignment and audits its basis",
    recoveryIssue.verification.required === true &&
      recoveryIssue.verification.recoveryRequired === false &&
      (await prisma.rideVerification.count({ where: { rideId: missingRide.id } })) === 1 &&
      (recoveryAudit.metadata as Record<string, unknown>).authorizationBasis === "support_recovery" &&
      (recoveryAudit.metadata as Record<string, unknown>).previousState === "missing_record",
    safeJson(recoveryAudit.metadata)
  );
  const recoveryCode = await drive.getRideVerificationCode({ userId: riderH.id, rideId: missingRide.id });
  check("the recovered code is usable by the rider", /^\d{4}$/.test(recoveryCode.code ?? ""));
  const recoveryVerify = await drive.verifyPassenger({
    userId: driverB.user.id,
    rideId: missingRide.id,
    code: recoveryCode.code!
  });
  check("the recovered code verifies normally", recoveryVerify.verified === true);
  await start(driverB.user.id, missingRide.id);
  const recoveryStartAudit = await prisma.auditLog.findFirstOrThrow({
    where: { action: "ride.in_progress", entityId: missingRide.id }
  });
  check(
    "a normal start after recovery records passenger_code as its basis",
    (recoveryStartAudit.metadata as Record<string, unknown>).authorizationBasis === "passenger_code",
    safeJson(recoveryStartAudit.metadata)
  );
  await complete(driverB.user.id, missingRide.id);

  // Support may attest verification for a missing record instead of issuing a
  // code. The start is then recorded as a support override, not a normal code.
  const missingVerifyRide = await newRide(riderG.id, "cash");
  await assign(driverA.user.id, missingVerifyRide.id);
  await prisma.rideVerification.delete({ where: { rideId: missingVerifyRide.id } });
  const supportVerifyMissing = await drive.overrideRideVerification({
    adminId: admin.id,
    rideId: missingVerifyRide.id,
    action: "verify",
    reason: "Record missing; rider identity checked at pick-up"
  });
  check("support can attest verification for a missing record", supportVerifyMissing.verification.verified === true);
  await arrive(driverA.user.id, missingVerifyRide.id);
  await start(driverA.user.id, missingVerifyRide.id);
  const supportStartAudit = await prisma.auditLog.findFirstOrThrow({
    where: { action: "ride.in_progress", entityId: missingVerifyRide.id }
  });
  check(
    "a support-attested start records support_override and the verifying operator",
    (supportStartAudit.metadata as Record<string, unknown>).authorizationBasis === "support_override" &&
      (supportStartAudit.metadata as Record<string, unknown>).verifiedByUserId === admin.id,
    safeJson(supportStartAudit.metadata)
  );
  await complete(driverA.user.id, missingVerifyRide.id);

  // A pre-enforcement ride can be explicitly opted into verification by support.
  const legacySupport = await newRide(riderH.id, "cash");
  await markPreEnforcementAssignment(legacySupport.id, driverB.profile.id);
  await expectError(
    "a pre-enforcement rider cannot reset a code that never existed",
    () => drive.resetRideVerificationByRider({ userId: riderH.id, rideId: legacySupport.id }),
    409,
    "verification_not_required"
  );
  const supportIssue = await drive.overrideRideVerification({
    adminId: admin.id,
    rideId: legacySupport.id,
    action: "reset",
    reason: "Pre-enforcement ride opt-in to pickup verification"
  });
  check(
    "support can explicitly issue a code for a pre-enforcement ride and ends the exemption",
    supportIssue.verification.required === true &&
      supportIssue.verification.legacy === false &&
      (await prisma.rideVerification.count({ where: { rideId: legacySupport.id } })) === 1 &&
      (await prisma.ride.findUniqueOrThrow({ where: { id: legacySupport.id } })).pickupVerificationLegacyAt ===
        null
  );
  await arrive(driverB.user.id, legacySupport.id);
  await expectError(
    "after support opt-in the start is gated by the issued code",
    () => start(driverB.user.id, legacySupport.id),
    409,
    "passenger_verification_required"
  );
  const legacySupportCode = await drive.getRideVerificationCode({ userId: riderH.id, rideId: legacySupport.id });
  const legacySupportVerify = await drive.verifyPassenger({
    userId: driverB.user.id,
    rideId: legacySupport.id,
    code: legacySupportCode.code!
  });
  check("the support-issued code verifies normally", legacySupportVerify.verified === true);
  await start(driverB.user.id, legacySupport.id);
  await complete(driverB.user.id, legacySupport.id);

  // Support reset must also retire an active salt-only row: it issues a keyed
  // record under the active version and the old derived code stops working.
  const legacySaltRide = await newRide(riderH.id, "cash");
  await assign(driverA.user.id, legacySaltRide.id);
  const legacyRowSalt = randomBytes(16).toString("hex");
  const legacyRowCode = legacyDerivedCode(legacyRowSalt, legacySaltRide.id, "v2");
  await prisma.rideVerification.update({
    where: { rideId: legacySaltRide.id },
    data: {
      algorithm: LEGACY_ALGORITHM_V2,
      keyVersion: null,
      salt: legacyRowSalt,
      codeHash: legacyHashFor(legacyRowCode, legacyRowSalt)
    }
  });
  const legacySupportReset = await drive.overrideRideVerification({
    adminId: admin.id,
    rideId: legacySaltRide.id,
    action: "reset",
    reason: "Replace a pre-key salt-only record with a keyed record"
  });
  const legacySupportRecord = await prisma.rideVerification.findUniqueOrThrow({
    where: { rideId: legacySaltRide.id }
  });
  check(
    "support reset replaces a legacy salt-only row with a keyed record",
    legacySupportReset.verification.required === true &&
      legacySupportRecord.keyVersion === 2 &&
      legacySupportRecord.algorithm === KEYED_ALGORITHM &&
      legacySupportRecord.salt !== legacyRowSalt &&
      legacySupportRecord.codeHash !== legacyHashFor(legacyRowCode, legacyRowSalt),
    safeJson({ keyVersion: legacySupportRecord.keyVersion, algorithm: legacySupportRecord.algorithm })
  );
  const legacySupportReplacement = await drive.getRideVerificationCode({
    userId: riderH.id,
    rideId: legacySaltRide.id
  });
  check(
    "the replacement code is derived from the keyed record, not the old salt",
    legacySupportReplacement.code ===
      keyedCode(legacySupportRecord.salt, legacySaltRide.id, 2, TEST_KEY_V2),
    safeJson({ keyVersion: legacySupportRecord.keyVersion })
  );
  await drive.cancelRide({
    actorId: riderH.id,
    isAdmin: false,
    rideId: legacySaltRide.id,
    reason: "Legacy support-reset cleanup"
  });

  // Reassignment must not revive the pre-enforcement exemption. Release clears
  // the marker; the pre-enforcement fixture never had a record to invalidate, and
  // the next acceptance must issue a real one.
  const legacyReassign = await newRide(riderG.id, "cash");
  await markPreEnforcementAssignment(legacyReassign.id, driverA.profile.id);
  await drive.releaseRide({
    userId: driverA.user.id,
    rideId: legacyReassign.id,
    reason: "Pre-enforcement reassignment boundary"
  });
  check(
    "release clears the pre-enforcement marker and leaves no protected record",
    (await prisma.ride.findUniqueOrThrow({ where: { id: legacyReassign.id } })).pickupVerificationLegacyAt === null &&
      (await prisma.rideVerification.count({ where: { rideId: legacyReassign.id } })) === 0
  );
  await assign(driverB.user.id, legacyReassign.id);
  const reassignedLegacyRecord = await prisma.rideVerification.findUniqueOrThrow({
    where: { rideId: legacyReassign.id }
  });
  check(
    "reassignment issues a new active record after the marker is cleared",
    reassignedLegacyRecord.invalidatedAt === null && reassignedLegacyRecord.verifiedAt === null
  );
  await prisma.rideVerification.delete({ where: { rideId: legacyReassign.id } });
  await expectError(
    "a missing record after reassignment fails closed, not as legacy",
    () => drive.getRideVerificationCode({ userId: riderG.id, rideId: legacyReassign.id }),
    409,
    "verification_record_missing"
  );
  await drive.cancelRide({
    actorId: riderG.id,
    isAdmin: false,
    rideId: legacyReassign.id,
    reason: "Reassignment-boundary cleanup"
  });

  // Assignment expiry releases the ride, clears the marker, invalidates the code,
  // and a later acceptance starts from a fresh protected record.
  const expiryRide = await newRide(riderG.id, "cash");
  await assign(driverA.user.id, expiryRide.id);
  const expiryRecordBefore = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: expiryRide.id } });
  await prisma.ride.update({
    where: { id: expiryRide.id },
    data: { assignmentExpiresAt: new Date(Date.now() - 1_000) }
  });
  const releasedIds = await drive.releaseExpiredAssignments();
  const expiredRide = await prisma.ride.findUniqueOrThrow({ where: { id: expiryRide.id } });
  const expiryRecordAfter = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: expiryRide.id } });
  check(
    "assignment expiry returns the ride, clears the marker and invalidates the record",
    releasedIds.includes(expiryRide.id) &&
      expiredRide.status === "requested" &&
      expiredRide.acceptedAt === null &&
      expiredRide.pickupVerificationLegacyAt === null &&
      expiryRecordAfter.invalidatedAt !== null &&
      expiryRecordAfter.salt === expiryRecordBefore.salt
  );
  await assign(driverB.user.id, expiryRide.id);
  const expiryRecordReissued = await prisma.rideVerification.findUniqueOrThrow({ where: { rideId: expiryRide.id } });
  check(
    "acceptance after expiry issues a fresh active record",
    expiryRecordReissued.invalidatedAt === null &&
      expiryRecordReissued.verifiedAt === null &&
      expiryRecordReissued.salt !== expiryRecordAfter.salt
  );
  await drive.cancelRide({
    actorId: riderG.id,
    isAdmin: false,
    rideId: expiryRide.id,
    reason: "Expiry-boundary cleanup"
  });

  const legacyExpiry = await newRide(riderH.id, "cash");
  await markPreEnforcementAssignment(legacyExpiry.id, driverA.profile.id);
  await prisma.ride.update({
    where: { id: legacyExpiry.id },
    data: { assignmentExpiresAt: new Date(Date.now() - 1_000) }
  });
  await drive.releaseExpiredAssignments();
  check(
    "assignment expiry clears a pre-enforcement marker",
    (await prisma.ride.findUniqueOrThrow({ where: { id: legacyExpiry.id } })).pickupVerificationLegacyAt === null
  );
  await assign(driverB.user.id, legacyExpiry.id);
  await prisma.rideVerification.delete({ where: { rideId: legacyExpiry.id } });
  await expectError(
    "the expired-and-reaccepted ride cannot reuse the pre-enforcement exemption",
    () => drive.getRideVerificationCode({ userId: riderH.id, rideId: legacyExpiry.id }),
    409,
    "verification_record_missing"
  );
  await drive.cancelRide({
    actorId: riderH.id,
    isAdmin: false,
    rideId: legacyExpiry.id,
    reason: "Legacy-expiry cleanup"
  });

  // Awaiting assignment is unchanged: no record exists, and the rider is told why.
  const awaitingRide = await newRide(riderG.id, "cash");
  await expectError(
    "an unassigned ride has no pickup code yet",
    () => drive.getRideVerificationCode({ userId: riderG.id, rideId: awaitingRide.id }),
    409,
    "verification_not_available"
  );
  check(
    "requesting a ride never creates a verification record",
    (await prisma.rideVerification.count({ where: { rideId: awaitingRide.id } })) === 0
  );
  await drive.cancelRide({
    actorId: riderG.id,
    isAdmin: false,
    rideId: awaitingRide.id,
    reason: "Awaiting-assignment cleanup"
  });

  /* ------------------------ N. support rate limits and queue shape --- */
  const rateAdmin = await createUser("CUSTOMER", "rate-admin");
  const boundaryAdmin = await createUser("CUSTOMER", "boundary-admin");
  const supportAction = "ride.verification_support_reset";

  const rateRideLimit = await newRide(riderG.id, "cash");
  await assign(driverA.user.id, rateRideLimit.id);
  await prisma.auditLog.createMany({
    data: Array.from({ length: drive.RIDE_VERIFICATION_SUPPORT_MAX_PER_RIDE }, (_, index) => ({
      actorId: rateAdmin.id,
      action: supportAction,
      entity: "Ride",
      entityId: rateRideLimit.id,
      metadata: { seededRateLimitRow: index }
    }))
  });
  await expectError(
    "support actions are rate-limited per ride",
    () =>
      drive.overrideRideVerification({
        adminId: rateAdmin.id,
        rideId: rateRideLimit.id,
        action: "reset",
        reason: "Per-ride rate-limit check"
      }),
    429,
    "verification_support_ride_rate_limited"
  );
  await drive.cancelRide({
    actorId: riderG.id,
    isAdmin: false,
    rideId: rateRideLimit.id,
    reason: "Rate-limit cleanup"
  });

  const rateOperatorRide = await newRide(riderH.id, "cash");
  await assign(driverB.user.id, rateOperatorRide.id);
  await prisma.auditLog.createMany({
    data: Array.from({ length: drive.RIDE_VERIFICATION_SUPPORT_MAX_PER_OPERATOR }, (_, index) => ({
      actorId: rateAdmin.id,
      action: supportAction,
      entity: "Ride",
      entityId: `rate-limit-operator-seed-${index}`,
      metadata: { seededRateLimitRow: index }
    }))
  });
  await expectError(
    "support actions are rate-limited per operator across rides",
    () =>
      drive.overrideRideVerification({
        adminId: rateAdmin.id,
        rideId: rateOperatorRide.id,
        action: "verify",
        reason: "Per-operator rate-limit check"
      }),
    429,
    "verification_support_operator_rate_limited"
  );
  await drive.cancelRide({
    actorId: riderH.id,
    isAdmin: false,
    rideId: rateOperatorRide.id,
    reason: "Rate-limit cleanup"
  });

  // Two concurrent support actions at the boundary must not both commit: the
  // operator and ride advisory locks serialise the count.
  const rateBoundaryRide = await newRide(riderG.id, "cash");
  await assign(driverA.user.id, rateBoundaryRide.id);
  await prisma.auditLog.createMany({
    data: Array.from(
      { length: drive.RIDE_VERIFICATION_SUPPORT_MAX_PER_RIDE - 1 },
      (_, index) => ({
        actorId: boundaryAdmin.id,
        action: supportAction,
        entity: "Ride",
        entityId: rateBoundaryRide.id,
        metadata: { seededRateLimitRow: index }
      })
    )
  });
  const boundaryResults = await Promise.allSettled([
    drive.overrideRideVerification({
      adminId: boundaryAdmin.id,
      rideId: rateBoundaryRide.id,
      action: "reset",
      reason: "Concurrent boundary reset"
    }),
    drive.overrideRideVerification({
      adminId: boundaryAdmin.id,
      rideId: rateBoundaryRide.id,
      action: "reset",
      reason: "Concurrent boundary reset"
    })
  ]);
  const boundaryStatuses = boundaryResults.map((entry) =>
    entry.status === "fulfilled" ? "ok" : ((entry.reason as { code?: string }).code ?? "error")
  );
  check(
    "concurrent support actions cannot exceed the per-ride limit",
    boundaryStatuses.filter((status) => status === "ok").length === 1 &&
      boundaryStatuses.filter((status) => status === "verification_support_ride_rate_limited").length === 1 &&
      (await prisma.auditLog.count({ where: { entityId: rateBoundaryRide.id, action: supportAction } })) ===
        drive.RIDE_VERIFICATION_SUPPORT_MAX_PER_RIDE,
    JSON.stringify(boundaryStatuses)
  );
  await drive.cancelRide({
    actorId: riderG.id,
    isAdmin: false,
    rideId: rateBoundaryRide.id,
    reason: "Boundary-rate cleanup"
  });

  const queueNormal = await newRide(riderG.id, "cash");
  await assign(driverA.user.id, queueNormal.id);
  const queueRecovery = await newRide(riderH.id, "cash");
  await assign(driverB.user.id, queueRecovery.id);
  await prisma.rideVerification.delete({ where: { rideId: queueRecovery.id } });
  const queueLegacy = await newRide(riderF.id, "cash");
  await markPreEnforcementAssignment(queueLegacy.id, driverA.profile.id);

  const queue = await drive.listRideVerificationSupport();
  const normalRow = queue.find((row) => row.rideId === queueNormal.id);
  const recoveryRow = queue.find((row) => row.rideId === queueRecovery.id);
  const legacyQueueRow = queue.find((row) => row.rideId === queueLegacy.id);
  const queueSerialized = safeJson(queue);
  check(
    "the Control Center queue distinguishes active, recovery-required and pre-enforcement rows",
    Boolean(normalRow) &&
      normalRow?.verification.required === true &&
      normalRow?.verification.legacy === false &&
      normalRow?.verification.recoveryRequired === false &&
      recoveryRow?.verification.recoveryRequired === true &&
      recoveryRow?.verification.legacy === false &&
      recoveryRow?.verification.required === false &&
      legacyQueueRow?.verification.legacy === true &&
      legacyQueueRow?.verification.recoveryRequired === false &&
      legacyQueueRow?.verification.required === false,
    safeJson({ normal: normalRow?.verification, recovery: recoveryRow?.verification, legacy: legacyQueueRow?.verification })
  );
  check(
    "the Control Center queue never contains a raw code, salt or hash",
    !queueSerialized.includes("codeHash") &&
      !queueSerialized.includes("\"salt\"") &&
      !queueSerialized.includes("\"code\"") &&
      queue.every((row) => ["driver_assigned", "driver_arriving"].includes(row.status))
  );
  await drive.cancelRide({
    actorId: riderG.id,
    isAdmin: false,
    rideId: queueNormal.id,
    reason: "Support-queue cleanup"
  });
  await drive.cancelRide({
    actorId: riderH.id,
    isAdmin: false,
    rideId: queueRecovery.id,
    reason: "Support-queue cleanup"
  });
  await drive.cancelRide({
    actorId: riderF.id,
    isAdmin: false,
    rideId: queueLegacy.id,
    reason: "Support-queue cleanup"
  });

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
