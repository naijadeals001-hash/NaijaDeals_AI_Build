/**
 * Served-build acceptance for the operations and commerce automation routes.
 *
 * Unlike the in-process suites, every delivery here goes through the
 * authenticated HTTP API on the running staging build. A build that lacks a
 * route or a handler fails visibly (404, DEAD intent, or no notification).
 *
 * Requirements:
 *  - TEST_DATABASE_URL names the TEST-classified staging database.
 *  - AUTOMATION_BASE_URL points at the served build (default 127.0.0.1:3200).
 *  - AUTOMATION_CONSUMER_TOKEN is the consumer credential.
 *  - The target has no foreign unscoped staff or stale onboarding rows; the
 *    script aborts instead of touching another run's data.
 *
 * Command:
 *   TEST_DATABASE_URL='postgresql://…' AUTOMATION_CONSUMER_TOKEN='…' \
 *     npx tsx scripts/tests/automation-routes-acceptance.mts
 *
 * All rows are run-owned and removed before exit; counts are printed only.
 */
import { randomBytes } from "node:crypto";
import { requireTestDatabase } from "../lib/test-db-guard";

const RUN = `routes-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(3).toString("hex")}`;
const BASE = (process.env.AUTOMATION_BASE_URL ?? "http://127.0.0.1:3200").replace(/\/$/, "");
const token = process.env.AUTOMATION_CONSUMER_TOKEN ?? "";
if (token.length < 32) {
  console.error("ABORT: AUTOMATION_CONSUMER_TOKEN is missing or too short");
  process.exit(2);
}
await requireTestDatabase();

const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const checks: Array<{ ok: boolean; name: string; detail?: string }> = [];
function check(name: string, ok: boolean, detail = ""): void {
  checks.push({ ok, name, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function post(path: string, body?: string, headers: Record<string, string> = auth) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body })
  });
  let parsed: Record<string, unknown> = {};
  try {
    parsed = (await response.json()) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  return { status: response.status, body: parsed };
}

const { prisma } = await import("@/lib/prisma");

const STAFF_ROLES = ["admin", "ops", "super_admin"];
const foreignStaff = await prisma.user.count({
  where: { scopeCountryCode: null, scopeCityCode: null, roles: { some: { role: { name: { in: STAFF_ROLES } } } } }
});
const staleApplications = await prisma.sellerApplication.count({
  where: { status: "SUBMITTED", createdAt: { lt: new Date(Date.now() - 3 * 86400_000) } }
});
const dueIntents = await prisma.notificationIntent.count({ where: { status: "PENDING", nextAttemptAt: { lte: new Date() } } });
const identity = await prisma.$queryRaw<Array<{ db: string }>>`select current_database() as db`;
if (foreignStaff || staleApplications || dueIntents) {
  console.error(
    `ABORT: target not clean for this run (db=${identity[0]?.db ?? "unknown"} staff=${foreignStaff} stale=${staleApplications} due=${dueIntents})`
  );
  process.exit(2);
}

const counts = async () => ({
  notification: await prisma.notification.count(),
  notificationAttempt: await prisma.notificationAttempt.count(),
  notificationIntent: await prisma.notificationIntent.count(),
  partnerNotification: await prisma.partnerNotification.count(),
  sellerApplication: await prisma.sellerApplication.count(),
  user: await prisma.user.count(),
  userRole: await prisma.userRole.count(),
  systemEvent: await prisma.systemEvent.count(),
  auditLog: await prisma.auditLog.count()
});
const baseline = await counts();
const userIds: string[] = [];
const intentKeys: string[] = [];
let runId = "";
let exit = 0;

try {
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "admin" }, select: { id: true } });
  const sellerRole = await prisma.role.findUniqueOrThrow({ where: { name: "vendor" }, select: { id: true } });
  const admin = await prisma.user.create({
    data: { email: `${RUN}-admin@naijadeals.test`, name: "Routes Admin", passwordHash: "x" },
    select: { id: true }
  });
  userIds.push(admin.id);
  await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
  const seller = await prisma.user.create({
    data: { email: `${RUN}-seller@naijadeals.test`, name: "Routes Seller", passwordHash: "x" },
    select: { id: true }
  });
  userIds.push(seller.id);
  await prisma.userRole.create({ data: { userId: seller.id, roleId: sellerRole.id } });
  const customer = await prisma.user.create({
    data: { email: `${RUN}-customer@naijadeals.test`, name: "Routes Customer", passwordHash: "x" },
    select: { id: true }
  });
  userIds.push(customer.id);

  await prisma.sellerApplication.create({
    data: {
      userId: seller.id,
      businessName: "Routes Test Store",
      market: "Wuse",
      countryCode: "NG",
      pickupAddress: "Test pickup",
      phone: "+2340000000000",
      category: "general",
      status: "SUBMITTED",
      createdAt: new Date(Date.now() - 4 * 86400_000)
    }
  });

  const anonScan = await post("/api/automation/reminders/scan", undefined, {});
  check("scan refuses an unauthenticated call", anonScan.status === 401, `status=${anonScan.status}`);

  const firstScan = await post("/api/automation/reminders/scan");
  const staleCount = Number(firstScan.body.stale);
  check(
    "served build runs the operations scan",
    firstScan.status === 200 &&
      Number(firstScan.body.onboarding) === 1 &&
      Number(firstScan.body.reports) === 1 &&
      (staleCount === 0 || staleCount === 1) &&
      Number(firstScan.body.intentsCreated) === 2 + staleCount,
    JSON.stringify(firstScan.body)
  );

  const secondScan = await post("/api/automation/reminders/scan");
  check(
    "repeated scan creates no duplicates",
    secondScan.status === 200 && Number(secondScan.body.intentsCreated) === 0,
    JSON.stringify(secondScan.body)
  );

  const anonBackup = await post("/api/automation/backup-status", "{}", {});
  check("backup-status refuses an unauthenticated call", anonBackup.status === 401, `status=${anonBackup.status}`);

  runId = `${RUN}-backup`;
  const backup = await post(
    "/api/automation/backup-status",
    JSON.stringify({
      runId,
      status: "success",
      target: "staging-db",
      finishedAt: new Date().toISOString(),
      message: "Served-build acceptance run."
    })
  );
  check(
    "served build records a backup success and alerts the admin",
    backup.status === 200 && backup.body.duplicate === false && Number(backup.body.intentsCreated) === 1,
    JSON.stringify(backup.body)
  );
  const duplicate = await post(
    "/api/automation/backup-status",
    JSON.stringify({
      runId,
      status: "success",
      target: "staging-db",
      finishedAt: new Date().toISOString()
    })
  );
  check("duplicate backup report is idempotent", duplicate.status === 200 && duplicate.body.duplicate === true, JSON.stringify(duplicate.body));

  // Producer contracts are static-tested; these rows prove the served build
  // contains the delivery handlers for every new commerce event.
  const commerce = [
    {
      eventType: "order.status_changed",
      entityType: "Order",
      entityId: `${RUN}-order`,
      payload: { version: 1, orderNumber: `${RUN}-O1`, status: "in_transit", href: "/orders/x" },
      template: "order.status_changed"
    },
    {
      eventType: "order.delivered",
      entityType: "Order",
      entityId: `${RUN}-order`,
      payload: { version: 1, orderNumber: `${RUN}-O1`, status: "completed", href: "/orders/x" },
      template: "order.delivered"
    },
    {
      eventType: "refund.completed",
      entityType: "Order",
      entityId: `${RUN}-order`,
      payload: { version: 1, orderNumber: `${RUN}-O1`, amountKobo: "150000", href: "/orders/x" },
      template: "refund.completed"
    },
    {
      eventType: "payout.completed",
      entityType: "Payout",
      entityId: `${RUN}-payout`,
      payload: { version: 1, amountKobo: "250000", reference: `${RUN}-P1`, href: "/seller" },
      template: "payout.completed"
    }
  ];
  for (const [index, item] of commerce.entries()) {
    const key = `routes.commerce:${RUN}:${index}`;
    intentKeys.push(key);
    await prisma.notificationIntent.create({
      data: {
        dedupeKey: key,
        eventType: item.eventType,
        entityType: item.entityType,
        entityId: item.entityId,
        recipientUserId: index === 3 ? seller.id : customer.id,
        payload: item.payload
      }
    });
  }

  const drain = await post("/api/automation/notifications/drain", JSON.stringify({ limit: 50 }));
  check(
    "served build drains every new event type",
    drain.status === 200 && Number(drain.body.processed) >= 7 && Number(drain.body.dead) === 0,
    JSON.stringify(drain.body)
  );

  for (const item of commerce) {
    const notification = await prisma.notification.findFirst({
      where: { dedupeKey: { startsWith: "notification:routes.commerce:" }, templateKey: item.template },
      select: { id: true, status: true }
    });
    check(`commerce template ${item.template} delivered once`, notification?.status === "SENT", `status=${notification?.status ?? "missing"}`);
  }
  const onboarding = await prisma.notification.findFirst({
    where: { dedupeKey: { startsWith: "notification:onboarding.reminder:" }, userId: seller.id },
    select: { title: true, body: true, status: true }
  });
  check(
    "onboarding reminder is applicant-facing and delivered",
    onboarding?.status === "SENT" && /awaiting review/i.test(`${onboarding.title} ${onboarding.body}`),
    `status=${onboarding?.status ?? "missing"} title=${onboarding?.title ?? "none"}`
  );

  const replay = await post("/api/automation/notifications/drain", JSON.stringify({ limit: 50 }));
  check(
    "replay through the served build creates no duplicates",
    replay.status === 200 && Number(replay.body.processed) === 0,
    JSON.stringify(replay.body)
  );
} catch (error) {
  exit = 1;
  console.error("ERROR", error instanceof Error ? error.message : "unknown");
} finally {
  const owned = await prisma.notificationIntent.findMany({
    where: {
      OR: [
        { recipientUserId: { in: userIds } },
        { dedupeKey: { startsWith: `onboarding.reminder:` } },
        { dedupeKey: { startsWith: `ops.daily_report:` } },
        { dedupeKey: { startsWith: `ops.backup_stale:` } },
        { dedupeKey: { startsWith: `ops.backup.` } },
        { dedupeKey: { in: intentKeys } }
      ]
    },
    select: { dedupeKey: true }
  });
  const notificationIds = (
    await prisma.notification.findMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { dedupeKey: { in: owned.map((row) => `notification:${row.dedupeKey}`) } }
        ]
      },
      select: { id: true }
    })
  ).map((row) => row.id);
  await prisma.partnerNotification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notificationAttempt.deleteMany({ where: { notificationId: { in: notificationIds } } });
  await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
  await prisma.notificationIntent.deleteMany({
    where: {
      OR: [
        { recipientUserId: { in: userIds } },
        { dedupeKey: { startsWith: "onboarding.reminder:" } },
        { dedupeKey: { startsWith: "ops.daily_report:" } },
        { dedupeKey: { startsWith: "ops.backup_stale:" } },
        { dedupeKey: { startsWith: "ops.backup." } },
        { dedupeKey: { in: intentKeys } }
      ]
    }
  });
  await prisma.sellerApplication.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.systemEvent.deleteMany({ where: { entityId: runId } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: userIds } }] } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  const final = await counts();
  for (const key of Object.keys(baseline) as Array<keyof typeof baseline>) {
    check(`cleanup ${key}`, baseline[key] === final[key], `baseline=${baseline[key]} final=${final[key]}`);
  }
  await prisma.$disconnect();
}

const failed = checks.filter((row) => !row.ok).length;
console.log(`\nRESULT ${checks.length - failed}/${checks.length} checks passed`);
if (failed || exit) process.exit(1);
