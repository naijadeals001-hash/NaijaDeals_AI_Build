/**
 * Notification delivery / intent retry acceptance.
 *
 * Proves the fixed contract between `deliverNotification()` and the intent
 * processor: an intent is PROCESSED only when the notification was actually
 * delivered, deliberately suppressed, or already terminal-and-reported. It
 * exercises the real delivery engine, the real transport chain, the real
 * `processIntents()` claim/lease/fence path and real database writes.
 *
 * Requirements:
 *  - TEST_DATABASE_URL must name a database explicitly classified TEST
 *    (`DatabaseClassification.id = "default"` with classification TEST).
 *    DATABASE_URL is never used as a fallback.
 *  - The disposable test database must have no other due PENDING intents while
 *    this runs; the script aborts rather than processing foreign rows.
 *
 * Command (the URL must be a disposable TEST-classified database):
 *   TEST_DATABASE_URL='postgresql://user:password@host:5432/database' \
 *     npx tsx scripts/tests/notification-retry-acceptance.ts
 *
 * Every row created here is removed before exit and the tracked table counts
 * are compared with the baseline. Output carries counts, statuses and provider
 * error codes only: no payloads, recipients, emails or secrets.
 */
import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { requireTestDatabase } from "../lib/test-db-guard";

const RUN_ID = `nretry-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
let failedChecks = 0;

function record(name: string, pass: boolean, detail = ""): void {
  checks.push({ name, pass, detail });
  if (!pass) failedChecks += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Counts = {
  notificationAttempt: number;
  notification: number;
  notificationIntent: number;
  partnerNotification: number;
  notificationPreference: number;
  auditLog: number;
  systemEvent: number;
  user: number;
};

async function tableCounts(prisma: PrismaClient): Promise<Counts> {
  return {
    notificationAttempt: await prisma.notificationAttempt.count(),
    notification: await prisma.notification.count(),
    notificationIntent: await prisma.notificationIntent.count(),
    partnerNotification: await prisma.partnerNotification.count(),
    notificationPreference: await prisma.notificationPreference.count(),
    auditLog: await prisma.auditLog.count(),
    systemEvent: await prisma.systemEvent.count(),
    user: await prisma.user.count()
  };
}

/** Removes rows this run owns, in foreign-key order. */
async function removeOwned(prisma: PrismaClient, userIds: string[]): Promise<void> {
  const intents = await prisma.notificationIntent.findMany({
    where: { OR: [{ recipientUserId: { in: userIds } }, { dedupeKey: { startsWith: "nretry-" } }] },
    select: { id: true, dedupeKey: true }
  });
  const intentKeys = intents.map((row) => `notification:${row.dedupeKey}`);
  const notifications = await prisma.notification.findMany({
    where: { OR: [{ userId: { in: userIds } }, { dedupeKey: { in: intentKeys } }] },
    select: { id: true }
  });
  const notificationIds = notifications.map((row) => row.id);

  await prisma.partnerNotification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notificationAttempt.deleteMany({ where: { notificationId: { in: notificationIds } } });
  await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
  await prisma.notificationIntent.deleteMany({ where: { id: { in: intents.map((row) => row.id) } } });
  await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
  // Run-owned audit evidence (suppression/failure records) is removed with the
  // fixtures; these rows describe this test, not business history.
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: notificationIds } }] }
  });
  await prisma.systemEvent.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: notificationIds } }] }
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main(): Promise<void> {
  // A queue backend is irrelevant here and must not be probed.
  process.env.VALKEY_URL = "";

  const { prisma } = await import("../../lib/prisma");
  const { notify, deliverNotification } = await import("../../lib/services/core/notification-delivery.service");
  const { processIntents } = await import("../../lib/notifications/intent.service");
  const { resetFlakyTestState } = await import("../../lib/notifications/test-transport");

  // Clean stale leftovers from an interrupted earlier run of this same suite.
  const stale = await prisma.user.findMany({ where: { email: { startsWith: "nretry-" } }, select: { id: true } });
  const staleIds = stale.map((row) => row.id);
  if (staleIds.length) await removeOwned(prisma, staleIds);

  const baseline = await tableCounts(prisma);
  const user = await prisma.user.create({
    data: { email: `${RUN_ID}@naijadeals.test`, name: "Notification Retry Acceptance", passwordHash: "x" },
    select: { id: true }
  });
  const userId = user.id;

  const createIntent = async (
    key: string,
    options: {
      eventType?: string;
      entityType?: string;
      entityId?: string;
      payload?: Prisma.InputJsonValue;
      maxAttempts?: number;
      nextAttemptAt?: Date;
    } = {}
  ) => {
    return prisma.notificationIntent.create({
      data: {
        dedupeKey: key,
        eventType: options.eventType ?? "order.paid.vendor",
        entityType: options.entityType ?? "Order",
        entityId: options.entityId ?? `${RUN_ID}-${key}`,
        recipientUserId: userId,
        payload: options.payload ?? ({ orderNumber: `NRT-${key}` } as Prisma.InputJsonValue),
        maxAttempts: options.maxAttempts,
        nextAttemptAt: options.nextAttemptAt ?? new Date(Date.now() - 5_000)
      }
    });
  };

  const notificationByIntent = (dedupeKey: string) =>
    prisma.notification.findUnique({ where: { dedupeKey: `notification:${dedupeKey}` } });

  const attemptRows = (notificationId: string) =>
    prisma.notificationAttempt.count({ where: { notificationId } });

  const feedRows = (testUserId: string) => prisma.partnerNotification.count({ where: { userId: testUserId } });

  /**
   * The worker claims every due intent in the database, so this suite only runs
   * when the due set is exactly the intents it is about to process.
   */
  const runIntents = async (label: string, expectedIntentIds: string[]) => {
    const due = await prisma.notificationIntent.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
      select: { id: true }
    });
    const dueIds = due.map((row) => row.id).sort();
    const expected = [...expectedIntentIds].sort();
    const isolated = JSON.stringify(dueIds) === JSON.stringify(expected);
    record(`isolation precondition (${label})`, isolated, `due=${dueIds.length} expected=${expected.length}`);
    assert(isolated, `isolation_breach_${label}`);
    return processIntents(`nretry-${label}-${RUN_ID}`, 10);
  };

  try {
    // ---- (0) outcome taxonomy ------------------------------------------------
    const missing = await deliverNotification(`${RUN_ID}-missing-row`);
    record(
      "(0) a missing notification row is classified, not an ambiguous skip",
      missing.reason === "missing" && missing.skipped === true,
      `reason=${missing.reason} status=${missing.status}`
    );

    // ---- (a) retryable provider failure, then one successful delivery -------
    process.env.NOTIFICATION_TEST_FLAKY = "retry-once";
    const intentA = await createIntent(`${RUN_ID}-a`);
    let run = await runIntents("a-first", [intentA.id]);
    const notifA = await notificationByIntent(intentA.dedupeKey);
    const intentAAfterFirst = await prisma.notificationIntent.findUniqueOrThrow({ where: { id: intentA.id } });
    assert(notifA, "notification A missing after first attempt");
    record(
      "(a) first attempt fails retryably: intent PENDING, lastError, future nextAttemptAt",
      run.processed === 0 &&
        run.retried === 1 &&
        intentAAfterFirst.status === "PENDING" &&
        Boolean(intentAAfterFirst.lastError?.includes("notification_delivery_not_due")) &&
        intentAAfterFirst.nextAttemptAt.getTime() > Date.now() &&
        notifA.status === "QUEUED" &&
        notifA.attempts === 1 &&
        (await attemptRows(notifA.id)) === 1,
      `run processed=${run.processed} retried=${run.retried}; intent=${intentAAfterFirst.status} attempts=${notifA.attempts}; notification=${notifA.status}`
    );

    await prisma.notification.update({
      where: { id: notifA.id },
      data: { scheduledFor: new Date(Date.now() - 5_000) }
    });
    await prisma.notificationIntent.update({
      where: { id: intentA.id },
      data: { nextAttemptAt: new Date(Date.now() - 5_000) }
    });
    run = await runIntents("a-second", [intentA.id]);
    const notifAAfter = await prisma.notification.findUniqueOrThrow({ where: { id: notifA.id } });
    const intentAAfter = await prisma.notificationIntent.findUniqueOrThrow({ where: { id: intentA.id } });
    const okAttemptsA = await prisma.notificationAttempt.count({ where: { notificationId: notifA.id, ok: true } });
    record(
      "(a) second attempt delivers exactly once and the intent becomes PROCESSED",
      run.processed === 1 &&
        intentAAfter.status === "PROCESSED" &&
        notifAAfter.status === "SENT" &&
        notifAAfter.attempts === 2 &&
        (await attemptRows(notifA.id)) === 2 &&
        okAttemptsA === 1 &&
        (await prisma.notification.count({ where: { dedupeKey: notifA.dedupeKey } })) === 1 &&
        (await feedRows(userId)) === 1,
      `processed=${run.processed}; attempts=${notifAAfter.attempts} ok=${okAttemptsA}; notification=${notifAAfter.status}`
    );
    delete process.env.NOTIFICATION_TEST_FLAKY;
    resetFlakyTestState();

    // ---- (b) permanent provider failure -------------------------------------
    process.env.NOTIFICATION_TEST_FLAKY = "permanent";
    const intentB = await createIntent(`${RUN_ID}-b`);
    run = await runIntents("b", [intentB.id]);
    const notifB = await notificationByIntent(intentB.dedupeKey);
    const intentBAfter = await prisma.notificationIntent.findUniqueOrThrow({ where: { id: intentB.id } });
    assert(notifB, "notification B missing after permanent failure");
    record(
      "(b) permanent provider failure: notification FAILED, intent DEAD, lastError visible",
      run.dead === 1 &&
        run.processed === 0 &&
        notifB.status === "FAILED" &&
        notifB.lastError === "test_flaky_permanent" &&
        intentBAfter.status === "DEAD" &&
        Boolean(intentBAfter.lastError?.includes("notification_delivery_terminal")) &&
        (await attemptRows(notifB.id)) === 1,
      `intent=${intentBAfter.status} notification=${notifB.status} attempts=${notifB.attempts}`
    );
    delete process.env.NOTIFICATION_TEST_FLAKY;
    resetFlakyTestState();

    // ---- (c) an already SENT notification is not resent --------------------
    const keyC = `${RUN_ID}-c`;
    const createdC = await notify({
      userId,
      channel: "IN_APP",
      templateKey: "order.paid.vendor",
      eventType: "order.paid.vendor",
      entityType: "Order",
      entityId: `${RUN_ID}-${keyC}`,
      data: { orderNumber: "NRT-C" },
      dedupeKey: `notification:${keyC}`
    });
    const deliveredC = await deliverNotification(createdC.notification.id);
    const attemptsBeforeC = (await prisma.notification.findUniqueOrThrow({ where: { id: createdC.notification.id } }))
      .attempts;
    const rowsBeforeC = await attemptRows(createdC.notification.id);
    const intentC = await createIntent(keyC);
    run = await runIntents("c", [intentC.id]);
    const notifCAfter = await prisma.notification.findUniqueOrThrow({ where: { id: createdC.notification.id } });
    const intentCAfter = await prisma.notificationIntent.findUniqueOrThrow({ where: { id: intentC.id } });
    const reclassified = await deliverNotification(createdC.notification.id);
    record(
      "(c) an existing SENT notification is not redelivered and the intent completes",
      deliveredC.reason === "delivered" &&
        reclassified.reason === "delivered" &&
        run.processed === 1 &&
        intentCAfter.status === "PROCESSED" &&
        notifCAfter.status === "SENT" &&
        notifCAfter.attempts === attemptsBeforeC &&
        (await attemptRows(createdC.notification.id)) === rowsBeforeC &&
        (await prisma.notification.count({ where: { dedupeKey: `notification:${keyC}` } })) === 1,
      `processed=${run.processed} attempts=${notifCAfter.attempts}/${attemptsBeforeC} rows=${rowsBeforeC}`
    );

    // ---- (d) suppressed by preference --------------------------------------
    await prisma.notificationPreference.create({
      data: { userId, channel: "IN_APP", category: "ORDERS", enabled: false }
    });
    const intentD = await createIntent(`${RUN_ID}-d`);
    run = await runIntents("d", [intentD.id]);
    const notifD = await notificationByIntent(intentD.dedupeKey);
    const intentDAfter = await prisma.notificationIntent.findUniqueOrThrow({ where: { id: intentD.id } });
    assert(notifD, "suppressed notification row missing");
    const suppressionAudit = await prisma.auditLog.count({
      where: { action: "notification.suppressed", entity: "Notification", entityId: notifD.id }
    });
    record(
      "(d) preference-disabled delivery is SUPPRESSED and audited; intent PROCESSED",
      run.processed === 1 &&
        intentDAfter.status === "PROCESSED" &&
        notifD.status === "SUPPRESSED" &&
        notifD.lastError === "preference_disabled" &&
        notifD.attempts === 0 &&
        (await attemptRows(notifD.id)) === 0 &&
        suppressionAudit === 1,
      `intent=${intentDAfter.status} notification=${notifD.status} attempts=${notifD.attempts} audit=${suppressionAudit}`
    );
    await prisma.notificationPreference.deleteMany({ where: { userId } });

    // ---- (e) another worker is sending (SENDING) ----------------------------
    const keyE = `${RUN_ID}-e`;
    const createdE = await notify({
      userId,
      channel: "IN_APP",
      templateKey: "order.paid.vendor",
      eventType: "order.paid.vendor",
      entityType: "Order",
      entityId: `${RUN_ID}-${keyE}`,
      data: { orderNumber: "NRT-E" },
      dedupeKey: `notification:${keyE}`
    });
    await prisma.notification.update({ where: { id: createdE.notification.id }, data: { status: "SENDING" } });
    const intentE = await createIntent(keyE);
    run = await runIntents("e-first", [intentE.id]);
    const intentEAfterFirst = await prisma.notificationIntent.findUniqueOrThrow({ where: { id: intentE.id } });
    record(
      "(e) in-flight delivery leaves the intent PENDING, not PROCESSED",
      run.processed === 0 &&
        run.retried === 1 &&
        intentEAfterFirst.status === "PENDING" &&
        Boolean(intentEAfterFirst.lastError?.includes("notification_delivery_in_flight")) &&
        intentEAfterFirst.nextAttemptAt.getTime() > Date.now(),
      `intent=${intentEAfterFirst.status} retried=${run.retried}`
    );
    await prisma.notification.update({
      where: { id: createdE.notification.id },
      data: { status: "SENT", sentAt: new Date(), lastError: null }
    });
    await prisma.notificationIntent.update({
      where: { id: intentE.id },
      data: { nextAttemptAt: new Date(Date.now() - 5_000) }
    });
    run = await runIntents("e-second", [intentE.id]);
    const notifEAfter = await prisma.notification.findUniqueOrThrow({ where: { id: createdE.notification.id } });
    const intentEAfter = await prisma.notificationIntent.findUniqueOrThrow({ where: { id: intentE.id } });
    record(
      "(e) after the other worker completes, the next run finishes without resending",
      run.processed === 1 &&
        intentEAfter.status === "PROCESSED" &&
        notifEAfter.status === "SENT" &&
        notifEAfter.attempts === 0 &&
        (await attemptRows(createdE.notification.id)) === 0 &&
        (await prisma.notification.count({ where: { dedupeKey: `notification:${keyE}` } })) === 1,
      `processed=${run.processed} attempts=${notifEAfter.attempts} notification=${notifEAfter.status}`
    );

    // ---- (f) crash after the effect, before the acknowledgement ------------
    const intentF = await createIntent(`${RUN_ID}-f`);
    run = await runIntents("f-first", [intentF.id]);
    const notifF = await notificationByIntent(intentF.dedupeKey);
    assert(notifF, "notification F missing after delivery");
    const firstF = {
      attempts: notifF.attempts,
      rows: await attemptRows(notifF.id),
      feed: await feedRows(userId),
      processed: run.processed
    };
    await prisma.notificationIntent.update({
      where: { id: intentF.id },
      data: { status: "PENDING", processedAt: null, nextAttemptAt: new Date(Date.now() - 5_000) }
    });
    run = await runIntents("f-second", [intentF.id]);
    const notifFAfter = await prisma.notification.findUniqueOrThrow({ where: { id: notifF.id } });
    const intentFAfter = await prisma.notificationIntent.findUniqueOrThrow({ where: { id: intentF.id } });
    record(
      "(f) replay after a crash adds no notification and no provider attempt",
      firstF.processed === 1 &&
        run.processed === 1 &&
        intentFAfter.status === "PROCESSED" &&
        (await prisma.notification.count({ where: { dedupeKey: notifF.dedupeKey } })) === 1 &&
        notifFAfter.attempts === firstF.attempts &&
        (await attemptRows(notifF.id)) === firstF.rows &&
        (await feedRows(userId)) === firstF.feed,
      `processed=${firstF.processed}+${run.processed} attempts=${notifFAfter.attempts}/${firstF.attempts} rows=${firstF.rows}`
    );

    // ---- (g) two concurrent workers on one intended effect -----------------
    const intentG = await createIntent(`${RUN_ID}-g`);
    const dueG = await prisma.notificationIntent.count({
      where: { status: "PENDING", nextAttemptAt: { lte: new Date() } }
    });
    record("isolation precondition (g)", dueG === 1, `due=${dueG} expected=1`);
    assert(dueG === 1, "isolation_breach_g");
    const [runG1, runG2] = await Promise.all([
      processIntents(`nretry-g-a-${RUN_ID}`, 10),
      processIntents(`nretry-g-b-${RUN_ID}`, 10)
    ]);
    const notifG = await notificationByIntent(intentG.dedupeKey);
    const intentGAfter = await prisma.notificationIntent.findUniqueOrThrow({ where: { id: intentG.id } });
    assert(notifG, "notification G missing after concurrent run");
    record(
      "(g) concurrent runs deliver once; the intent is processed once",
      runG1.processed + runG2.processed === 1 &&
        runG1.claimed + runG2.claimed === 1 &&
        intentGAfter.status === "PROCESSED" &&
        intentGAfter.attempts === 1 &&
        (await prisma.notification.count({ where: { dedupeKey: notifG.dedupeKey } })) === 1 &&
        notifG.attempts === 1 &&
        (await attemptRows(notifG.id)) === 1,
      `processed=${runG1.processed}+${runG2.processed} claimed=${runG1.claimed}+${runG2.claimed} attempts=${notifG.attempts}`
    );

    // ---- (h) poison event type dead-letters and is operator-visible --------
    const poisonEntityId = `${RUN_ID}-poison`;
    const intentH = await createIntent(`${RUN_ID}-h`, {
      eventType: "probe.unsupported.event",
      entityType: "Probe",
      entityId: poisonEntityId,
      payload: {}
    });
    run = await runIntents("h", [intentH.id]);
    const intentHAfter = await prisma.notificationIntent.findUniqueOrThrow({ where: { id: intentH.id } });
    // Same query the operator status endpoint uses.
    const dead = await prisma.notificationIntent.findMany({
      where: { status: "DEAD" },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, eventType: true, entityType: true, entityId: true, attempts: true, lastError: true, updatedAt: true }
    });
    record(
      "(h) poison event type becomes DEAD and is visible via the status query",
      run.dead === 1 &&
        intentHAfter.status === "DEAD" &&
        Boolean(intentHAfter.lastError?.startsWith("unsupported_intent_event")) &&
        dead.some((row) => row.id === intentH.id && row.entityId === poisonEntityId),
      `intent=${intentHAfter.status} deadCount=${dead.length}`
    );
  } finally {
    await removeOwned(prisma, [userId]);
    const finalCounts = await tableCounts(prisma);
    let restored = true;
    for (const key of Object.keys(baseline) as Array<keyof Counts>) {
      const same = baseline[key] === finalCounts[key];
      restored = restored && same;
      console.log(`${same ? "PASS" : "FAIL"}  cleanup ${key} baseline=${baseline[key]} final=${finalCounts[key]}`);
    }
    record("cleanup restores every tracked table to its baseline", restored, restored ? "all equal" : "difference detected");
    await prisma.$disconnect();
  }
}

async function run(): Promise<void> {
  try {
    await requireTestDatabase();
  } catch (error) {
    console.error(`TEST_DB_GUARD_FAILED ${error instanceof Error ? error.name : "unknown"}`);
    console.error(error instanceof Error ? error.message : "unknown");
    process.exit(2);
  }
  try {
    await main();
  } catch (error) {
    console.error(`SUITE_ERROR ${error instanceof Error ? error.message.slice(0, 300) : "unknown"}`);
    process.exitCode = 1;
  }
  const failed = failedChecks;
  console.log(`\nRESULT ${checks.length - failed}/${checks.length} checks passed`);
  if (failed > 0) process.exitCode = 1;
}

void run();
