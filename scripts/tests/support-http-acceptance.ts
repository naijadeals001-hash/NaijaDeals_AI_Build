/**
 * Build-identity acceptance for the support reply slice (served HTTP consumer).
 *
 * The service-level suite proves the intent rows are written transactionally.
 * This probe proves the *served* build can deliver the new event types: it
 * creates real intents through the source services, then drains them only
 * through the authenticated HTTP consumer at AUTOMATION_BASE_URL
 * (default http://127.0.0.1:3200). If the build did not contain the new
 * delivery cases, the intents would end DEAD with `unsupported_intent_event`
 * and no notification would exist.
 *
 * Migrated from qa-artifacts/_support-reply-http.mts. The database comes from
 * TEST_DATABASE_URL through the shared guard (never DATABASE_URL as a
 * fallback); the guard also points this process's Prisma client at the same
 * database the served build uses.
 *
 * Command:
 *   TEST_DATABASE_URL='postgresql://user:password@host:5432/database' \
 *     AUTOMATION_CONSUMER_TOKEN='...' \
 *     AUTOMATION_BASE_URL='http://127.0.0.1:3200' \
 *     npx tsx scripts/tests/support-http-acceptance.ts
 */
import { requireTestDatabase } from "../lib/test-db-guard";

const STAFF_ROLES = ["super_admin", "admin", "ops", "support"];
const results: Array<{ ok: boolean; name: string; detail?: string }> = [];

async function main(): Promise<void> {
  const token = process.env.AUTOMATION_CONSUMER_TOKEN;
  if (!token) {
    console.error("ABORT: AUTOMATION_CONSUMER_TOKEN is not configured");
    process.exit(2);
  }
  const BASE_URL = (process.env.AUTOMATION_BASE_URL ?? "http://127.0.0.1:3200").replace(/\/+$/, "");

  const { prisma } = await import("../../lib/prisma");
  const { createTicket, postCustomerReply, staffReply, setTicketStatus } = await import(
    "../../lib/services/core/support.service"
  );

  const check = (name: string, ok: boolean, detail = "") => {
    results.push({ ok, name, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  const runTag = `slice2http-${Date.now()}`;
  const ticketIds: string[] = [];
  const userIds: string[] = [];

  async function drain(limit = 50) {
    const response = await fetch(`${BASE_URL}/api/automation/notifications/drain`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ limit })
    });
    const body = (await response.json()) as Record<string, unknown>;
    return { status: response.status, body };
  }

  const counts = async () => ({
    partnerNotification: await prisma.partnerNotification.count(),
    notificationAttempt: await prisma.notificationAttempt.count(),
    notification: await prisma.notification.count(),
    notificationIntent: await prisma.notificationIntent.count(),
    supportMessage: await prisma.supportMessage.count(),
    supportTicketEvent: await prisma.supportTicketEvent.count(),
    supportAccessToken: await prisma.supportAccessToken.count(),
    supportTicket: await prisma.supportTicket.count(),
    userRole: await prisma.userRole.count(),
    user: await prisma.user.count(),
    auditLog: await prisma.auditLog.count(),
    systemEvent: await prisma.systemEvent.count()
  });

  async function removeOwned(ownedUserIds: string[], ownedTicketIds: string[]) {
    const intents = await prisma.notificationIntent.findMany({
      where: { OR: [{ entityId: { in: ownedTicketIds } }, { recipientUserId: { in: ownedUserIds } }] },
      select: { dedupeKey: true, recipientUserId: true }
    });
    const feedRecipients = [...new Set(intents.map((row) => row.recipientUserId))];
    const notificationKeys = intents.map((row) => `notification:${row.dedupeKey}`);
    const notifications = await prisma.notification.findMany({
      where: { OR: [{ dedupeKey: { in: notificationKeys } }, { userId: { in: ownedUserIds } }] },
      select: { id: true }
    });
    const notificationIds = notifications.map((row) => row.id);
    await prisma.partnerNotification.deleteMany({ where: { OR: [ { userId: { in: ownedUserIds } }, { userId: { in: feedRecipients }, createdAt: { gte: feedStartedAt } } ] } });
    await prisma.notificationAttempt.deleteMany({ where: { notificationId: { in: notificationIds } } });
    await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
    await prisma.notificationIntent.deleteMany({
      where: { OR: [{ entityId: { in: ownedTicketIds } }, { recipientUserId: { in: ownedUserIds } }] }
    });
    await prisma.supportMessage.deleteMany({ where: { ticketId: { in: ownedTicketIds } } });
    await prisma.supportTicketEvent.deleteMany({ where: { ticketId: { in: ownedTicketIds } } });
    await prisma.supportAccessToken.deleteMany({ where: { ticketId: { in: ownedTicketIds } } });
    await prisma.supportTicket.deleteMany({ where: { id: { in: ownedTicketIds } } });
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: ownedUserIds } }, { entityId: { in: ownedTicketIds } }] }
    });
    await prisma.systemEvent.deleteMany({
      where: { OR: [{ actorId: { in: ownedUserIds } }, { entityId: { in: ownedTicketIds } }] }
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: ownedUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: ownedUserIds } } });
  }

  const staleTickets = await prisma.supportTicket.findMany({
    where: { subject: { startsWith: "slice2http " } },
    select: { id: true }
  });
  const staleUsers = await prisma.user.findMany({
    where: { email: { startsWith: "slice2http-" } },
    select: { id: true }
  });
  if (staleTickets.length || staleUsers.length) {
    await removeOwned(
      staleUsers.map((row) => row.id),
      staleTickets.map((row) => row.id)
    );
  }

  const preexistingStaff = await prisma.user.count({
    where: { roles: { some: { role: { name: { in: STAFF_ROLES } } } } }
  });
  if (preexistingStaff > 0) {
    console.error("ABORT: database already has eligible staff; refusing to fan out to unrelated users");
    process.exit(2);
  }

  const feedStartedAt = new Date();
  const baseline = await counts();
  let finalCounts: Awaited<ReturnType<typeof counts>> | null = null;
  let exitCode = 0;

  try {
    const role = await prisma.role.findUnique({ where: { name: "support" }, select: { id: true } });
    if (!role) throw new Error("support role missing in the target database");
    const staff = await prisma.user.create({
      data: { email: `${runTag}-staff@naijadeals.test`, name: "HTTP Slice Support", passwordHash: "x" },
      select: { id: true }
    });
    userIds.push(staff.id);
    await prisma.userRole.create({ data: { userId: staff.id, roleId: role.id } });
    const customer = await prisma.user.create({
      data: { email: `${runTag}-customer@naijadeals.test`, name: "HTTP Slice Customer", passwordHash: "x" },
      select: { id: true }
    });
    userIds.push(customer.id);

    const ticket = await createTicket({
      actor: { userId: customer.id, name: null, email: null },
      vertical: "general",
      topic: "other",
      subject: `slice2http ${runTag} consumer`,
      message: "HTTP consumer build identity acceptance message."
    });
    ticketIds.push(ticket.ticket.id);

    // Clear the ticket-created intent through the served build first.
    const first = await drain();
    check(
      "served build drains ticket-created intent",
      first.status === 200 && Number(first.body.processed) >= 1,
      `status=${first.status} processed=${first.body.processed}`
    );

    const reply = await postCustomerReply(ticket.ticket.reference, { userId: customer.id }, "Customer reply for the HTTP consumer.");
    const queuedKey = `notification:support.ticket.queued_reply:${reply.id}:${staff.id}`;
    const beforeQueued = await prisma.notification.count({ where: { dedupeKey: queuedKey } });
    check("queued reply has no notification before drain", beforeQueued === 0, `count=${beforeQueued}`);

    const staffActor = { id: staff.id } as unknown as Parameters<typeof staffReply>[0];
    await staffReply(
      staffActor,
      { countryCode: null },
      ticket.ticket.id,
      "Staff public reply for the HTTP consumer.",
      false
    );
    const customerIntents = await prisma.notificationIntent.findMany({
      where: { entityId: ticket.ticket.id, eventType: "support.ticket.staff_reply" },
      select: { dedupeKey: true, status: true }
    });
    check(
      "staff reply intent is pending before drain",
      customerIntents.length === 1 && customerIntents[0].status === "PENDING",
      `count=${customerIntents.length}`
    );

    await setTicketStatus(staffActor, { countryCode: null }, ticket.ticket.id, "RESOLVED");
    const statusIntents = await prisma.notificationIntent.findMany({
      where: { entityId: ticket.ticket.id, eventType: "support.ticket.status_changed" },
      select: { dedupeKey: true, status: true }
    });
    check(
      "status change intent is pending before drain",
      statusIntents.length === 1 && statusIntents[0].status === "PENDING",
      `count=${statusIntents.length}`
    );

    const second = await drain();
    check(
      "served build delivers the reply event types",
      second.status === 200 && Number(second.body.processed) >= 3,
      `status=${second.status} processed=${second.body.processed} dead=${second.body.dead}`
    );

    const queued = await prisma.notification.findMany({
      where: { dedupeKey: queuedKey },
      select: { templateKey: true, userId: true }
    });
    const staffReplyKey = `notification:${customerIntents[0]?.dedupeKey ?? "missing"}`;
    const customerNotified = await prisma.notification.count({
      where: { dedupeKey: staffReplyKey, userId: customer.id }
    });
    const statusKey = `notification:${statusIntents[0]?.dedupeKey ?? "missing"}`;
    const statusNotified = await prisma.notification.count({
      where: { dedupeKey: statusKey, userId: customer.id }
    });
    const intentsAfter = await prisma.notificationIntent.findMany({
      where: { entityId: ticket.ticket.id },
      select: { status: true, eventType: true }
    });
    check(
      "queued reply delivered once to the staff member",
      queued.length === 1 && queued[0].templateKey === "support.reply" && queued[0].userId === staff.id,
      `count=${queued.length}`
    );
    check("staff reply delivered once to the customer", customerNotified === 1, `count=${customerNotified}`);
    check("status change delivered once to the customer", statusNotified === 1, `count=${statusNotified}`);
    check(
      "no intent ended unsupported",
      intentsAfter.every((row) => row.status === "PROCESSED"),
      `states=${intentsAfter.map((row) => `${row.eventType}:${row.status}`).join(",")}`
    );

    const replay = await drain();
    const queuedAfter = await prisma.notification.count({ where: { dedupeKey: queuedKey } });
    check(
      "replay through the served build creates no duplicate",
      replay.status === 200 && replay.body.processed === 0 && queuedAfter === 1,
      `processed=${replay.body.processed} count=${queuedAfter}`
    );
  } catch (error) {
    exitCode = 1;
    console.error("ERROR", error instanceof Error ? error.message : "unknown");
  } finally {
    await removeOwned(userIds, ticketIds);
    finalCounts = await counts();
    for (const key of Object.keys(baseline) as Array<keyof typeof baseline>) {
      check(`cleanup ${key}`, baseline[key] === finalCounts[key], `baseline=${baseline[key]} final=${finalCounts[key]}`);
    }
    check(
      "cleanup restores every tracked table",
      Object.keys(baseline).every(
        (key) => baseline[key as keyof typeof baseline] === finalCounts![key as keyof typeof finalCounts]
      )
    );
    await prisma.$disconnect();
  }

  const failed = results.filter((row) => !row.ok).length;
  console.log(`\nRESULT ${results.length - failed}/${results.length} checks passed`);
  if (failed > 0 || exitCode !== 0) process.exit(1);
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
