/**
 * Operations automation acceptance (run-owned data, TEST-classified database).
 *
 * Proves the onboarding reminder scan, the daily report fan-out, the
 * backup-status endpoint (auth, idempotency, validation), backup staleness
 * (absent and older than 26 hours), delivery through the real intent processor
 * exactly once, replay, and full baseline restoration.
 *
 * The database comes from TEST_DATABASE_URL through the shared guard; the guard
 * runs before any application service is imported, and DATABASE_URL is never a
 * fallback. This file contains no staging environment path: the caller supplies
 * a verified TEST database and the automation credential.
 *
 * The suite aborts before creating anything when it finds rows it does not own
 * (unscoped operations staff, onboarding records older than three days, due
 * notification intents or backup.status events), because its processIntents()
 * call would otherwise deliver or alter foreign work and its baseline check
 * could not restore it.
 *
 * Command (placeholders only; use a TEST-classified database):
 *   TEST_DATABASE_URL='postgresql://user:password@host:5432/database' \
 *     AUTOMATION_CONSUMER_TOKEN='<automation consumer token>' \
 *     npx tsx scripts/tests/operations-automation-acceptance.ts
 *
 * Output is PASS/FAIL per check plus the totals; no payloads, emails or secrets
 * are printed. Exit code is non-zero when any check fails.
 */
import { randomBytes } from "node:crypto";
import { requireTestDatabase } from "../lib/test-db-guard";

const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const RUN_TAG = `ops-acceptance-${stamp}`;
const DAY = new Date().toISOString().slice(0, 10);
const OLD_CREATED_AT = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
let failed = 0;

function check(name: string, ok: boolean, detail = ""): void {
  checks.push({ name, ok, detail });
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function abort(message: string): Promise<never> {
  console.error(`ABORT: ${message}`);
  process.exit(2);
}

async function main(): Promise<void> {
  const token = process.env.AUTOMATION_CONSUMER_TOKEN ?? "";
  if (token.length < 32) {
    console.error("ABORT: AUTOMATION_CONSUMER_TOKEN is missing or shorter than 32 characters");
    process.exit(2);
  }

  // Application imports happen only after the guard has pointed DATABASE_URL at
  // the verified TEST database.
  const { prisma } = await import("../../lib/prisma");
  const { NextRequest } = await import("next/server");
  const { POST: scanPost } = await import("../../app/api/automation/reminders/scan/route");
  const { POST: backupStatusPost } = await import("../../app/api/automation/backup-status/route");
  const { processIntents } = await import("../../lib/notifications/intent.service");
  const { listOperationsRecipients } = await import("../../lib/services/core/operations-automation.service");

  type Counts = {
    notificationIntent: number;
    notification: number;
    notificationAttempt: number;
    partnerNotification: number;
    systemEvent: number;
    sellerApplication: number;
    restaurantApplication: number;
    driverProfile: number;
    user: number;
    userRole: number;
    role: number;
    auditLog: number;
  };

  const tableCounts = async (): Promise<Counts> => ({
    notificationIntent: await prisma.notificationIntent.count(),
    notification: await prisma.notification.count(),
    notificationAttempt: await prisma.notificationAttempt.count(),
    partnerNotification: await prisma.partnerNotification.count(),
    systemEvent: await prisma.systemEvent.count(),
    sellerApplication: await prisma.sellerApplication.count(),
    restaurantApplication: await prisma.restaurantApplication.count(),
    driverProfile: await prisma.driverProfile.count(),
    user: await prisma.user.count(),
    userRole: await prisma.userRole.count(),
    role: await prisma.role.count(),
    auditLog: await prisma.auditLog.count()
  });

  // The test needs a quiet database: its processIntents() call claims every due
  // intent, so foreign work would be delivered and could not be restored.
  const foreignStaff = await listOperationsRecipients();
  if (foreignStaff.length > 0) await abort(`the database already has ${foreignStaff.length} unscoped operations staff`);
  const foreignOldSeller = await prisma.sellerApplication.count({
    where: { status: "SUBMITTED", createdAt: { lt: OLD_CREATED_AT } }
  });
  const foreignOldRestaurant = await prisma.restaurantApplication.count({
    where: { status: "SUBMITTED", createdAt: { lt: OLD_CREATED_AT } }
  });
  const foreignOldDriver = await prisma.driverProfile.count({
    where: { status: "pending", createdAt: { lt: OLD_CREATED_AT } }
  });
  if (foreignOldSeller + foreignOldRestaurant + foreignOldDriver > 0) {
    await abort("the database already has onboarding records older than three days");
  }
  const foreignDue = await prisma.notificationIntent.count({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } }
  });
  if (foreignDue > 0) await abort(`the database has ${foreignDue} due pending notification intents`);
  const foreignBackupEvents = await prisma.systemEvent.count({ where: { type: "backup.status" } });
  if (foreignBackupEvents > 0) await abort("the database already has backup.status SystemEvents");

  const baseline = await tableCounts();

  const email = (kind: string) => `${RUN_TAG}-${kind}@naijadeals.test`;
  const roleRows = await prisma.role.findMany({ where: { name: { in: ["admin", "ops"] } } });
  const createdRoles = ["admin", "ops"].filter((name) => !roleRows.some((row) => row.name === name));
  const adminRole = await prisma.role.upsert({ where: { name: "admin" }, update: {}, create: { name: "admin" } });
  const opsRole = await prisma.role.upsert({ where: { name: "ops" }, update: {}, create: { name: "ops" } });

  const adminA = await prisma.user.create({
    data: {
      email: email("admin-a"),
      name: "Ops Acceptance Admin A",
      passwordHash: "x",
      scopeCountryCode: null,
      scopeCityCode: null,
      roles: { create: { roleId: adminRole.id } }
    }
  });
  const adminB = await prisma.user.create({
    data: {
      email: email("admin-b"),
      name: "Ops Acceptance Admin B",
      passwordHash: "x",
      scopeCountryCode: null,
      scopeCityCode: null,
      roles: { create: { roleId: opsRole.id } }
    }
  });
  const sellerUser = await prisma.user.create({
    data: { email: email("seller"), name: "Ops Acceptance Seller", passwordHash: "x" }
  });
  const restaurantUser = await prisma.user.create({
    data: { email: email("restaurant"), name: "Ops Acceptance Restaurant", passwordHash: "x" }
  });
  const driverUser = await prisma.user.create({
    data: { email: email("driver"), name: "Ops Acceptance Driver", passwordHash: "x" }
  });

  const sellerApplication = await prisma.sellerApplication.create({
    data: {
      userId: sellerUser.id,
      businessName: "Ops Acceptance Shop",
      market: "Wuse",
      countryCode: "NG",
      pickupAddress: "Acceptance pickup address",
      phone: "+2348000000000",
      category: "general",
      status: "SUBMITTED",
      createdAt: OLD_CREATED_AT
    }
  });
  const restaurantApplication = await prisma.restaurantApplication.create({
    data: {
      userId: restaurantUser.id,
      kitchenName: "Ops Acceptance Kitchen",
      cuisine: "Nigerian",
      market: "Wuse",
      address: "Acceptance kitchen address",
      phone: "+2348000000001",
      status: "SUBMITTED",
      createdAt: OLD_CREATED_AT
    }
  });
  const driverProfile = await prisma.driverProfile.create({
    data: {
      userId: driverUser.id,
      licenseNumber: `OPS-${stamp}`,
      status: "pending",
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      vehiclePlate: `OPS ${stamp.slice(-6)}`,
      createdAt: OLD_CREATED_AT
    }
  });

  const runFailureId = `${RUN_TAG}-failure`;
  const runSuccessId = `${RUN_TAG}-success`;
  const runConcurrentId = `${RUN_TAG}-concurrent`;
  let adminC: { id: string } | null = null;

  const ownedUserIds = [adminA.id, adminB.id, sellerUser.id, restaurantUser.id, driverUser.id];
  const ownedEntityIds = [
    sellerApplication.id,
    restaurantApplication.id,
    driverProfile.id,
    DAY,
    runFailureId,
    runSuccessId,
    runConcurrentId
  ];

  const scan = async (authToken: string | null = token) => {
    const headers: Record<string, string> = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const response = await scanPost(
      new NextRequest("http://127.0.0.1/api/automation/reminders/scan", { method: "POST", headers })
    );
    return { status: response.status, headers: response.headers, body: await response.json().catch(() => ({})) };
  };

  const backupStatus = async (body: unknown, authToken: string | null = token) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const response = await backupStatusPost(
      new NextRequest("http://127.0.0.1/api/automation/backup-status", {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body)
      })
    );
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };

  try {
    const unauthenticated = await scan(null);
    check("scan requires the automation credential", unauthenticated.status === 401, `status=${unauthenticated.status}`);

    const firstScan = await scan();
    check(
      "first scan creates 3 onboarding, 2 daily and 2 stale intents",
      firstScan.status === 200 &&
        firstScan.body.onboarding === 3 &&
        firstScan.body.reports === 2 &&
        firstScan.body.stale === 2 &&
        firstScan.body.intentsCreated === 7,
      JSON.stringify(firstScan.body)
    );
    check(
      "scan response is not cacheable",
      (firstScan.headers.get("cache-control") ?? "").includes("no-store"),
      firstScan.headers.get("cache-control") ?? "missing"
    );

    const sellerIntent = await prisma.notificationIntent.findUnique({
      where: { dedupeKey: `onboarding.reminder:seller:${sellerApplication.id}:${DAY}` }
    });
    const restaurantIntent = await prisma.notificationIntent.findUnique({
      where: { dedupeKey: `onboarding.reminder:restaurant:${restaurantApplication.id}:${DAY}` }
    });
    const driverIntent = await prisma.notificationIntent.findUnique({
      where: { dedupeKey: `onboarding.reminder:driver:${driverProfile.id}:${DAY}` }
    });
    const sellerPayload = (sellerIntent?.payload ?? {}) as Record<string, unknown>;
    const restaurantPayload = (restaurantIntent?.payload ?? {}) as Record<string, unknown>;
    const driverPayload = (driverIntent?.payload ?? {}) as Record<string, unknown>;
    check(
      "seller reminder payload is versioned and points at /seller",
      sellerIntent?.eventType === "onboarding.reminder" &&
        sellerPayload.version === 1 &&
        sellerPayload.kind === "seller" &&
        sellerPayload.status === "SUBMITTED" &&
        sellerPayload.href === "/seller" &&
        sellerPayload.createdAt === sellerApplication.createdAt.toISOString(),
      JSON.stringify(sellerPayload)
    );
    check(
      "restaurant and driver reminders use their own destinations",
      restaurantPayload.href === "/restaurant/apply" &&
        restaurantPayload.kind === "restaurant" &&
        driverPayload.href === "/onboarding/driver" &&
        driverPayload.kind === "driver" &&
        driverPayload.status === "pending",
      JSON.stringify({ restaurant: restaurantPayload.href, driver: driverPayload.href })
    );
    const dailyA = await prisma.notificationIntent.findUnique({
      where: { dedupeKey: `ops.daily_report:${DAY}:${adminA.id}` }
    });
    const dailyB = await prisma.notificationIntent.findUnique({
      where: { dedupeKey: `ops.daily_report:${DAY}:${adminB.id}` }
    });
    const dailyPayload = (dailyA?.payload ?? {}) as Record<string, unknown>;
    check(
      "one daily report per unscoped staff member with real summary counts",
      Boolean(dailyA) &&
        Boolean(dailyB) &&
        dailyA?.entityType === "System" &&
        dailyA?.entityId === DAY &&
        dailyPayload.version === 1 &&
        dailyPayload.date === DAY &&
        typeof dailyPayload.summary === "string" &&
        /Orders .*Open support \d+\..*Pending refunds \d+\..*Pending payouts \d+\..*Applications seller \d+, restaurant \d+, driver \d+\..*Dead notification intents \d+\./.test(
          String(dailyPayload.summary)
        ),
      String(dailyPayload.summary ?? "missing")
    );
    const staleA = await prisma.notificationIntent.findUnique({
      where: { dedupeKey: `ops.backup_stale:${DAY}:${adminA.id}` }
    });
    const staleB = await prisma.notificationIntent.findUnique({
      where: { dedupeKey: `ops.backup_stale:${DAY}:${adminB.id}` }
    });
    const stalePayload = (staleA?.payload ?? {}) as Record<string, unknown>;
    check(
      "absent successful backup produces one stale alert per staff member",
      Boolean(staleA) && Boolean(staleB) && stalePayload.version === 1 && stalePayload.date === DAY && stalePayload.lastSuccessAt === null,
      JSON.stringify(stalePayload)
    );

    const secondScan = await scan();
    check(
      "second scan creates no duplicates",
      secondScan.status === 200 && secondScan.body.intentsCreated === 0,
      JSON.stringify(secondScan.body)
    );

    const noToken = await backupStatus({ runId: runFailureId, status: "failure", target: "staging-db", finishedAt: new Date().toISOString() }, null);
    const wrongToken = await backupStatus(
      { runId: runFailureId, status: "failure", target: "staging-db", finishedAt: new Date().toISOString() },
      "wrong-token-value-that-is-long-enough-000000"
    );
    check(
      "backup-status endpoint refuses missing and invalid credentials",
      noToken.status === 401 && wrongToken.status === 401,
      `missing=${noToken.status} invalid=${wrongToken.status}`
    );

    const invalidStatus = await backupStatus({
      runId: runFailureId,
      status: "unknown",
      target: "staging-db",
      finishedAt: new Date().toISOString()
    });
    check("backup-status rejects an unknown status", invalidStatus.status === 400, `status=${invalidStatus.status}`);

    const oversized = await backupStatus({
      runId: runFailureId,
      status: "failure",
      target: "staging-db",
      finishedAt: new Date().toISOString(),
      message: "x".repeat(9000)
    });
    check("backup-status enforces the 8 KiB body limit", oversized.status === 413, `status=${oversized.status}`);

    const failureBody = {
      runId: runFailureId,
      status: "failure",
      target: "staging-db",
      finishedAt: new Date().toISOString(),
      message: "Acceptance backup failure report."
    };
    const recorded = await backupStatus(failureBody);
    const eventRows = await prisma.systemEvent.findMany({ where: { type: "backup.status", entityId: runFailureId } });
    const eventPayload = (eventRows[0]?.payload ?? {}) as Record<string, unknown>;
    check(
      "backup failure records one SystemEvent and alerts both staff members",
      recorded.status === 200 &&
        recorded.body.ok === true &&
        recorded.body.duplicate === false &&
        recorded.body.intentsCreated === 2 &&
        eventRows.length === 1 &&
        eventRows[0].entity === "Backup" &&
        eventPayload.status === "failure" &&
        eventPayload.target === "staging-db" &&
        eventPayload.runId === runFailureId &&
        typeof eventPayload.finishedAt === "string",
      JSON.stringify(recorded.body)
    );
    const failureIntentA = await prisma.notificationIntent.findUnique({
      where: { dedupeKey: `ops.backup.failure:${runFailureId}:${adminA.id}` }
    });
    const failureIntentB = await prisma.notificationIntent.findUnique({
      where: { dedupeKey: `ops.backup.failure:${runFailureId}:${adminB.id}` }
    });
    const failureIntentPayload = (failureIntentA?.payload ?? {}) as Record<string, unknown>;
    check(
      "failure intents carry the backup payload for each recipient",
      Boolean(failureIntentA) &&
        Boolean(failureIntentB) &&
        failureIntentA?.eventType === "ops.backup_failed" &&
        failureIntentPayload.version === 1 &&
        failureIntentPayload.runId === runFailureId &&
        failureIntentPayload.target === "staging-db" &&
        failureIntentPayload.message === "Acceptance backup failure report."
    );

    const duplicate = await backupStatus(failureBody);
    const eventCountAfterDuplicate = await prisma.systemEvent.count({
      where: { type: "backup.status", entityId: runFailureId }
    });
    const failureIntentCount = await prisma.notificationIntent.count({
      where: { dedupeKey: { endsWith: `:${adminA.id}` }, entityId: runFailureId }
    });
    check(
      "repeated runId creates no new event or intents",
      duplicate.status === 200 &&
        duplicate.body.duplicate === true &&
        duplicate.body.intentsCreated === 0 &&
        eventCountAfterDuplicate === 1 &&
        failureIntentCount === 1,
      JSON.stringify(duplicate.body)
    );

    const due = await prisma.notificationIntent.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
      select: { entityId: true, recipientUserId: true }
    });
    const allOwned = due.every(
      (row) => ownedEntityIds.includes(row.entityId) || ownedUserIds.includes(row.recipientUserId)
    );
    check("only run-owned intents are due before delivery", allOwned && due.length === 9, `due=${due.length}`);

    const deliveries = await processIntents(`ops-acceptance:${stamp}`, 50);
    const notificationRows = await prisma.notification.findMany({
      where: { userId: { in: ownedUserIds } },
      select: { userId: true, templateKey: true, eventType: true, status: true }
    });
    const byTemplate = (key: string) => notificationRows.filter((row) => row.templateKey === key).length;
    const feedRows = await prisma.partnerNotification.count({ where: { userId: { in: ownedUserIds } } });
    check(
      "processIntents delivers every operations intent exactly once",
      deliveries.claimed === 9 &&
        deliveries.processed === 9 &&
        deliveries.retried === 0 &&
        deliveries.dead === 0 &&
        notificationRows.length === 9 &&
        notificationRows.every((row) => row.status === "SENT") &&
        byTemplate("onboarding.reminder") === 3 &&
        byTemplate("ops.daily_report") === 2 &&
        byTemplate("ops.backup_stale") === 2 &&
        byTemplate("ops.backup_failed") === 2 &&
        feedRows === 9,
      JSON.stringify({ deliveries, notifications: notificationRows.length, feedRows, byTemplate: {
        onboarding: byTemplate("onboarding.reminder"),
        daily: byTemplate("ops.daily_report"),
        stale: byTemplate("ops.backup_stale"),
        failed: byTemplate("ops.backup_failed")
      } })
    );

    const replay = await processIntents(`ops-acceptance-replay:${stamp}`, 50);
    const notificationCountAfterReplay = await prisma.notification.count({ where: { userId: { in: ownedUserIds } } });
    check(
      "replay of processIntents creates no notification",
      replay.claimed === 0 && replay.processed === 0 && notificationCountAfterReplay === 9,
      JSON.stringify(replay)
    );

    const successRecorded = await backupStatus({
      runId: runSuccessId,
      status: "success",
      target: "staging-db",
      finishedAt: new Date().toISOString(),
      message: "Acceptance backup success report."
    });
    const freshScan = await scan();
    const succeededIntentA = await prisma.notificationIntent.findUnique({
      where: { dedupeKey: `ops.backup.success:${runSuccessId}:${adminA.id}` }
    });
    check(
      "fresh successful backup suppresses the stale alert",
      successRecorded.status === 200 &&
        successRecorded.body.intentsCreated === 2 &&
        Boolean(succeededIntentA) &&
        succeededIntentA?.eventType === "ops.backup_succeeded" &&
        freshScan.body.stale === 0 &&
        freshScan.body.intentsCreated === 0,
      JSON.stringify({ success: successRecorded.body, scan: freshScan.body })
    );

    const successDeliveries = await processIntents(`ops-acceptance-success:${stamp}`, 50);
    const successNotifications = await prisma.notification.findMany({
      where: { userId: { in: [adminA.id, adminB.id] }, templateKey: "ops.backup_succeeded" },
      select: { body: true }
    });
    check(
      "backup success alerts deliver without claiming a restore",
      successDeliveries.claimed === 2 &&
        successDeliveries.processed === 2 &&
        successNotifications.length === 2 &&
        successNotifications.every(
          (row) => !/restor(e|ed|ing|ation)/i.test(row.body) && /reported success/i.test(row.body)
        ),
      JSON.stringify({ deliveries: successDeliveries, notifications: successNotifications.length })
    );

    // Age the success record past 26 hours, then use a new staff account so the
    // existing per-day dedupe keys do not hide the staleness result.
    const successEvent = await prisma.systemEvent.findFirst({
      where: { type: "backup.status", entityId: runSuccessId },
      select: { id: true, payload: true }
    });
    assert(successEvent, "successful backup event disappeared");
    const oldSuccessAt = new Date(Date.now() - 27 * 60 * 60 * 1000);
    await prisma.systemEvent.update({
      where: { id: successEvent.id },
      data: {
        createdAt: oldSuccessAt,
        payload: {
          ...((successEvent.payload ?? {}) as Record<string, unknown>),
          finishedAt: oldSuccessAt.toISOString()
        }
      }
    });

    adminC = await prisma.user.create({
      data: {
        email: email("admin-c"),
        name: "Ops Acceptance Admin C",
        passwordHash: "x",
        scopeCountryCode: null,
        scopeCityCode: null,
        roles: { create: { roleId: adminRole.id } }
      }
    });
    const staleScan = await scan();
    const staleC = await prisma.notificationIntent.findUnique({
      where: { dedupeKey: `ops.backup_stale:${DAY}:${adminC.id}` }
    });
    const staleCPayload = (staleC?.payload ?? {}) as Record<string, unknown>;
    check(
      "success older than 26 hours creates one stale alert for a new staff member",
      staleScan.status === 200 &&
        staleScan.body.reports === 1 &&
        staleScan.body.stale === 1 &&
        Boolean(staleC) &&
        staleCPayload.version === 1 &&
        staleCPayload.date === DAY &&
        staleCPayload.lastSuccessAt === oldSuccessAt.toISOString(),
      JSON.stringify(staleScan.body)
    );

    const concurrentBody = {
      runId: runConcurrentId,
      status: "failure",
      target: "n8n",
      finishedAt: new Date().toISOString(),
      message: "Concurrent acceptance report."
    };
    const [concurrentA, concurrentB] = await Promise.all([
      backupStatus(concurrentBody),
      backupStatus(concurrentBody)
    ]);
    const concurrentEvents = await prisma.systemEvent.count({
      where: { type: "backup.status", entityId: runConcurrentId }
    });
    const concurrentIntents = await prisma.notificationIntent.count({
      where: { entityId: runConcurrentId }
    });
    check(
      "concurrent duplicate reports record one event and one intent per staff member",
      concurrentA.status === 200 &&
        concurrentB.status === 200 &&
        concurrentEvents === 1 &&
        concurrentIntents === 3 &&
        [concurrentA.body.duplicate, concurrentB.body.duplicate].filter(Boolean).length === 1,
      JSON.stringify({ a: concurrentA.body, b: concurrentB.body, events: concurrentEvents, intents: concurrentIntents })
    );
  } catch (error) {
    check("suite completed", false, error instanceof Error ? error.message.slice(0, 300) : "unknown error");
  } finally {
    const cleanup = {
      notificationIntent: 0,
      notification: 0,
      partnerNotification: 0,
      systemEvent: 0,
      sellerApplication: 0,
      restaurantApplication: 0,
      driverProfile: 0,
      userRole: 0,
      user: 0,
      role: 0
    };

    const allUserIds = [...ownedUserIds, ...(adminC ? [adminC.id] : [])];
    try {
      const ownedIntents = await prisma.notificationIntent.deleteMany({
        where: {
          OR: [
            { recipientUserId: { in: allUserIds } },
            { entityId: { in: ownedEntityIds } },
            { dedupeKey: { contains: stamp } }
          ]
        }
      });
      cleanup.notificationIntent = ownedIntents.count;

      const ownedNotifications = await prisma.notification.deleteMany({
        where: { OR: [{ userId: { in: allUserIds } }, { dedupeKey: { contains: stamp } }] }
      });
      cleanup.notification = ownedNotifications.count;

      const ownedFeed = await prisma.partnerNotification.deleteMany({ where: { userId: { in: allUserIds } } });
      cleanup.partnerNotification = ownedFeed.count;

      const ownedEvents = await prisma.systemEvent.deleteMany({
        where: { type: "backup.status", entityId: { in: [runFailureId, runSuccessId, runConcurrentId] } }
      });
      cleanup.systemEvent = ownedEvents.count;

      cleanup.sellerApplication = (
        await prisma.sellerApplication.deleteMany({ where: { userId: sellerUser.id } })
      ).count;
      cleanup.restaurantApplication = (
        await prisma.restaurantApplication.deleteMany({ where: { userId: restaurantUser.id } })
      ).count;
      cleanup.driverProfile = (await prisma.driverProfile.deleteMany({ where: { userId: driverUser.id } })).count;
      cleanup.userRole = (await prisma.userRole.deleteMany({ where: { userId: { in: allUserIds } } })).count;
      cleanup.user = (await prisma.user.deleteMany({ where: { id: { in: allUserIds } } })).count;
      if (createdRoles.length > 0) {
        cleanup.role = (
          await prisma.role.deleteMany({ where: { name: { in: createdRoles }, users: { none: {} } } })
        ).count;
      }
    } catch (error) {
      check("cleanup completed", false, error instanceof Error ? error.message.slice(0, 300) : "unknown error");
    }

    const after = await tableCounts();
    const mismatches = (Object.keys(baseline) as (keyof Counts)[])
      .filter((key) => baseline[key] !== after[key])
      .map((key) => `${key}:${baseline[key]}->${after[key]}`);
    check(
      "cleanup restores every touched table to its baseline count",
      mismatches.length === 0,
      mismatches.length ? mismatches.join(", ") : `removed intents=${cleanup.notificationIntent} events=${cleanup.systemEvent} users=${cleanup.user}`
    );

    await prisma.$disconnect();
  }

  console.log(`\nRESULT ${checks.filter((row) => row.ok).length}/${checks.length} checks passed`);
  if (failed > 0) process.exitCode = 1;
}

async function run(): Promise<void> {
  try {
    await requireTestDatabase();
  } catch (error) {
    console.error(`TEST_DB_GUARD_FAILED ${error instanceof Error ? error.name : "unknown"}`);
    console.error(error instanceof Error ? error.message : "unknown");
    process.exit(2);
  }
  await main();
}

void run();
