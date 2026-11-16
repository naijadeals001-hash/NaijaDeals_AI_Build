/**
 * Support reply slice acceptance (run-owned data, TEST-classified DB).
 *
 * Proves that customer replies, staff replies and status changes enqueue the
 * existing NotificationIntent outbox inside the same transaction as the
 * support write, and that delivery stays exactly-once under replay and
 * concurrency. Output carries counts only: no payloads, emails or secrets.
 *
 * Migrated from qa-artifacts/_support-reply-slice.mts. The database comes from
 * TEST_DATABASE_URL through the shared guard (never DATABASE_URL as a
 * fallback); the guard's verified URL also points Prisma at the same database.
 *
 * Command:
 *   TEST_DATABASE_URL='postgresql://user:password@host:5432/database' \
 *     npx tsx scripts/tests/support-reply-acceptance.ts
 */
import { requireTestDatabase } from "../lib/test-db-guard";

const STAFF_ROLES = ["super_admin", "admin", "ops", "support"];
const results: Array<{ ok: boolean; name: string; detail?: string }> = [];

async function main(): Promise<void> {
  const { prisma } = await import("../../lib/prisma");
  const { createTicket, postCustomerReply, staffReply, setTicketStatus, assignTicket } = await import(
    "../../lib/services/core/support.service"
  );
  const { processIntents } = await import("../../lib/notifications/intent.service");

  const check = (name: string, ok: boolean, detail = "") => {
    results.push({ ok, name, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  const stamp = Date.now();
  const runTag = `slice2-${stamp}`;
  const subjectPrefix = `slice2 ${stamp}`;
  const scope = { countryCode: null as string | null };
  type StaffSession = Parameters<typeof staffReply>[0];
  const staffActor = { id: "" } as unknown as StaffSession;

  const ticketIds: string[] = [];
  let customerId = "";
  let staffId = "";
  let roleCreated = false;

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

  /** Removes rows this test owns, in FK order. */
  async function removeOwned(userIds: string[], ownedTicketIds: string[]) {
    const intents = await prisma.notificationIntent.findMany({
      where: { OR: [{ entityId: { in: ownedTicketIds } }, { recipientUserId: { in: userIds } }] },
      select: { dedupeKey: true }
    });
    const notificationKeys = intents.map((row) => `notification:${row.dedupeKey}`);
    const notifications = await prisma.notification.findMany({
      where: { OR: [{ dedupeKey: { in: notificationKeys } }, { userId: { in: userIds } }] },
      select: { id: true }
    });
    const notificationIds = notifications.map((row) => row.id);

    await prisma.partnerNotification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notificationAttempt.deleteMany({ where: { notificationId: { in: notificationIds } } });
    await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
    await prisma.notificationIntent.deleteMany({
      where: { OR: [{ entityId: { in: ownedTicketIds } }, { recipientUserId: { in: userIds } }] }
    });
    await prisma.supportMessage.deleteMany({ where: { ticketId: { in: ownedTicketIds } } });
    await prisma.supportTicketEvent.deleteMany({ where: { ticketId: { in: ownedTicketIds } } });
    await prisma.supportAccessToken.deleteMany({ where: { ticketId: { in: ownedTicketIds } } });
    await prisma.supportTicket.deleteMany({ where: { id: { in: ownedTicketIds } } });
    // Run-owned audit evidence for fixture users, removed before the users so the
    // actorId filter still matches (the FK is SET NULL on user deletion). These
    // rows describe this test, not real business history.
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: ownedTicketIds } }] }
    });
    await prisma.systemEvent.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: ownedTicketIds } }] }
    });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  // A previous interrupted run may have left rows in this exact namespace.
  const staleTickets = await prisma.supportTicket.findMany({
    where: { subject: { startsWith: "slice2 " } },
    select: { id: true }
  });
  const staleUsers = await prisma.user.findMany({
    where: { email: { startsWith: "slice2-" } },
    select: { id: true }
  });
  if (staleTickets.length || staleUsers.length) {
    await removeOwned(
      staleUsers.map((row) => row.id),
      staleTickets.map((row) => row.id)
    );
  }

  // Fan-out reaches every eligible staff member, so a shared database with
  // unrelated staff would be written to by this test. Refuse instead.
  const preexistingStaff = await prisma.user.count({
    where: { roles: { some: { role: { name: { in: STAFF_ROLES } } } } }
  });
  if (preexistingStaff > 0) {
    console.error("ABORT: database already has eligible staff; refusing to fan out to unrelated users");
    process.exit(2);
  }

  const baseline = await counts();
  let finalCounts: Awaited<ReturnType<typeof counts>> | null = null;

  try {
    const existingRole = await prisma.role.findUnique({ where: { name: "support" }, select: { id: true } });
    const role = existingRole ?? (await prisma.role.create({ data: { name: "support" }, select: { id: true } }));
    roleCreated = !existingRole;

    const staff = await prisma.user.create({
      data: { email: `${runTag}-staff@naijadeals.test`, name: "Slice2 Support", passwordHash: "x" },
      select: { id: true }
    });
    staffId = staff.id;
    staffActor.id = staff.id;
    await prisma.userRole.create({ data: { userId: staff.id, roleId: role.id } });
    const customer = await prisma.user.create({
      data: { email: `${runTag}-customer@naijadeals.test`, name: "Slice2 Customer", passwordHash: "x" },
      select: { id: true }
    });
    customerId = customer.id;

    const eligibleStaff = await prisma.user.findMany({
      where: {
        roles: { some: { role: { name: { in: STAFF_ROLES } } } },
        OR: [{ scopeCountryCode: null }]
      },
      select: { id: true },
      take: 20
    });
    const eligibleIds = eligibleStaff.map((row) => row.id);
    check(
      "fixtures: exactly the run-owned staff member is eligible",
      eligibleIds.length === 1 && eligibleIds[0] === staffId,
      `eligible=${eligibleIds.length}`
    );

    const customerActor = { userId: customerId, name: null, email: null };

    const foreignDueIntents = async () =>
      prisma.notificationIntent.count({
        where: { status: "PENDING", nextAttemptAt: { lte: new Date() }, entityId: { notIn: ticketIds } }
      });
    const drain = async (label: string) => {
      const foreign = await foreignDueIntents();
      const run = await processIntents(`${runTag}-${label}`, 50);
      return { foreign, run };
    };

    // ---- (a) assigned ticket: one transactional intent, exactly once ----------
    const t1 = await createTicket({
      actor: customerActor,
      vertical: "general",
      topic: "other",
      subject: `${subjectPrefix} assigned`,
      message: "Assigned ticket acceptance message body."
    });
    ticketIds.push(t1.ticket.id);
    let step = await drain("t1-created");
    check(
      "(a) ticket creation intent delivered once",
      step.foreign === 0 && step.run.processed === 1,
      `foreign=${step.foreign} processed=${step.run.processed}`
    );

    await assignTicket(staffActor, scope, t1.ticket.id, staffId);
    const msgA = await postCustomerReply(t1.ticket.reference, { userId: customerId }, "First customer reply body.");
    const aIntentKey = `support.ticket.customer_reply:${msgA.id}`;
    const aNotifKey = `notification:${aIntentKey}`;
    const aIntent = await prisma.notificationIntent.findUnique({
      where: { dedupeKey: aIntentKey },
      select: { status: true, recipientUserId: true, entityId: true, eventType: true }
    });
    const aNotificationsBefore = await prisma.notification.count({ where: { dedupeKey: aNotifKey } });
    check(
      "(a) assigned reply persists one PENDING intent in its transaction",
      aIntent?.status === "PENDING" &&
        aIntent.recipientUserId === staffId &&
        aIntent.entityId === t1.ticket.id &&
        aIntent.eventType === "support.ticket.customer_reply",
      `status=${aIntent?.status ?? "missing"}`
    );
    check("(a) no notification exists before the drain", aNotificationsBefore === 0, `count=${aNotificationsBefore}`);

    step = await drain("t1-reply");
    const aDelivered = await prisma.notification.findMany({
      where: { dedupeKey: aNotifKey },
      select: { templateKey: true, userId: true }
    });
    const aIntentAfter = await prisma.notificationIntent.findUnique({
      where: { dedupeKey: aIntentKey },
      select: { status: true }
    });
    check(
      "(a) one drain delivers exactly one support.reply notification",
      step.foreign === 0 &&
        step.run.processed === 1 &&
        aDelivered.length === 1 &&
        aDelivered[0].templateKey === "support.reply" &&
        aDelivered[0].userId === staffId &&
        aIntentAfter?.status === "PROCESSED",
      `processed=${step.run.processed} notifications=${aDelivered.length} status=${aIntentAfter?.status ?? "missing"}`
    );

    step = await drain("t1-replay");
    const aDeliveredReplay = await prisma.notification.count({ where: { dedupeKey: aNotifKey } });
    check(
      "(a) replay processes nothing and creates no duplicate",
      step.foreign === 0 && step.run.processed === 0 && aDeliveredReplay === 1,
      `processed=${step.run.processed} notifications=${aDeliveredReplay}`
    );

    // ---- (b) unassigned ticket: fan-out to every eligible staff member --------
    const t2 = await createTicket({
      actor: customerActor,
      vertical: "general",
      topic: "other",
      subject: `${subjectPrefix} unassigned`,
      message: "Unassigned ticket acceptance message body."
    });
    ticketIds.push(t2.ticket.id);
    step = await drain("t2-created");
    check(
      "(b) ticket creation intent delivered once",
      step.foreign === 0 && step.run.processed === 1,
      `foreign=${step.foreign} processed=${step.run.processed}`
    );

    const msgB = await postCustomerReply(t2.ticket.reference, { userId: customerId }, "Unassigned reply body.");
    const bIntents = await prisma.notificationIntent.findMany({
      where: { entityId: t2.ticket.id, eventType: "support.ticket.queued_reply" },
      select: { recipientUserId: true, dedupeKey: true, status: true }
    });
    const bRecipients = bIntents.map((row) => row.recipientUserId).sort();
    const bKeysOk = bIntents.every(
      (row) => row.dedupeKey === `support.ticket.queued_reply:${msgB.id}:${row.recipientUserId}`
    );
    check(
      "(b) unassigned reply fans out one PENDING intent per eligible staff member",
      bIntents.length === eligibleIds.length &&
        bKeysOk &&
        JSON.stringify(bRecipients) === JSON.stringify([...eligibleIds].sort()) &&
        bIntents.every((row) => row.status === "PENDING"),
      `intents=${bIntents.length} eligible=${eligibleIds.length}`
    );

    step = await drain("t2-reply");
    const bNotificationCounts = [] as number[];
    for (const memberId of eligibleIds) {
      const key = `notification:support.ticket.queued_reply:${msgB.id}:${memberId}`;
      bNotificationCounts.push(await prisma.notification.count({ where: { dedupeKey: key } }));
    }
    check(
      "(b) drain delivers exactly one queued_reply notification per staff member",
      step.foreign === 0 &&
        step.run.processed === eligibleIds.length &&
        bNotificationCounts.every((value) => value === 1),
      `processed=${step.run.processed} perRecipient=${bNotificationCounts.join(",")}`
    );

    step = await drain("t2-replay");
    const bReplayCounts = [] as number[];
    for (const memberId of eligibleIds) {
      const key = `notification:support.ticket.queued_reply:${msgB.id}:${memberId}`;
      bReplayCounts.push(await prisma.notification.count({ where: { dedupeKey: key } }));
    }
    check(
      "(b) replay processes nothing and duplicates no notification",
      step.foreign === 0 && step.run.processed === 0 && bReplayCounts.every((value) => value === 1),
      `processed=${step.run.processed} perRecipient=${bReplayCounts.join(",")}`
    );

    // ---- (c) staff public reply vs internal note ------------------------------
    const t3 = await createTicket({
      actor: customerActor,
      vertical: "general",
      topic: "other",
      subject: `${subjectPrefix} staff reply`,
      message: "Staff reply acceptance message body."
    });
    ticketIds.push(t3.ticket.id);
    step = await drain("t3-created");
    check(
      "(c) ticket creation intent delivered once",
      step.foreign === 0 && step.run.processed === 1,
      `foreign=${step.foreign} processed=${step.run.processed}`
    );

    const staffMsg = await staffReply(staffActor, scope, t3.ticket.id, "Public staff reply body.", false);
    const cIntentKey = `support.ticket.staff_reply:${staffMsg.id}`;
    const cNotifKey = `notification:${cIntentKey}`;
    const cIntent = await prisma.notificationIntent.findUnique({
      where: { dedupeKey: cIntentKey },
      select: { status: true, recipientUserId: true, eventType: true }
    });
    const cBefore = await prisma.notification.count({ where: { dedupeKey: cNotifKey } });
    check(
      "(c) public staff reply persists one PENDING customer intent",
      cIntent?.status === "PENDING" &&
        cIntent.recipientUserId === customerId &&
        cIntent.eventType === "support.ticket.staff_reply" &&
        cBefore === 0,
      `status=${cIntent?.status ?? "missing"} notifications=${cBefore}`
    );

    step = await drain("t3-staff-reply");
    const cDelivered = await prisma.notification.findMany({
      where: { dedupeKey: cNotifKey },
      select: { templateKey: true, userId: true }
    });
    check(
      "(c) drain delivers exactly one support.reply notification to the owner",
      step.foreign === 0 &&
        step.run.processed === 1 &&
        cDelivered.length === 1 &&
        cDelivered[0].templateKey === "support.reply" &&
        cDelivered[0].userId === customerId,
      `processed=${step.run.processed} notifications=${cDelivered.length}`
    );

    const internalBaseline = {
      intents: await prisma.notificationIntent.count({ where: { entityId: t3.ticket.id } }),
      notifications: await prisma.notification.count({ where: { userId: customerId } })
    };
    await staffReply(staffActor, scope, t3.ticket.id, "Internal note body.", true);
    const internalAfter = {
      intents: await prisma.notificationIntent.count({ where: { entityId: t3.ticket.id } }),
      notifications: await prisma.notification.count({ where: { userId: customerId } })
    };
    check(
      "(c) an internal note creates no intent and no notification",
      internalAfter.intents === internalBaseline.intents && internalAfter.notifications === internalBaseline.notifications,
      `intents=${internalAfter.intents}/${internalBaseline.intents} notifications=${internalAfter.notifications}/${internalBaseline.notifications}`
    );

    // ---- (d) status change keyed by the SupportTicketEvent id ----------------
    await setTicketStatus(staffActor, scope, t3.ticket.id, "RESOLVED");
    const statusEvent = await prisma.supportTicketEvent.findFirst({
      where: { ticketId: t3.ticket.id, type: "STATUS_CHANGED" },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });
    const dIntentKey = `support.ticket.status_changed:${statusEvent?.id ?? "missing"}`;
    const dNotifKey = `notification:${dIntentKey}`;
    const dIntent = await prisma.notificationIntent.findUnique({
      where: { dedupeKey: dIntentKey },
      select: { status: true, recipientUserId: true, payload: true }
    });
    const dPayload = (dIntent?.payload ?? {}) as { status?: unknown };
    const dBefore = await prisma.notification.count({ where: { dedupeKey: dNotifKey } });
    check(
      "(d) status change persists one PENDING intent keyed by the event id",
      dIntent?.status === "PENDING" &&
        dIntent.recipientUserId === customerId &&
        dPayload.status === "RESOLVED" &&
        dBefore === 0,
      `status=${dIntent?.status ?? "missing"} payloadStatus=${String(dPayload.status ?? "missing")} notifications=${dBefore}`
    );

    step = await drain("t3-status");
    const dDelivered = await prisma.notification.findMany({
      where: { dedupeKey: dNotifKey },
      select: { templateKey: true, userId: true }
    });
    check(
      "(d) one drain delivers exactly one status notification",
      step.foreign === 0 &&
        step.run.processed === 1 &&
        dDelivered.length === 1 &&
        dDelivered[0].templateKey === "support.reply" &&
        dDelivered[0].userId === customerId,
      `processed=${step.run.processed} notifications=${dDelivered.length}`
    );

    const repeatBaseline = {
      events: await prisma.supportTicketEvent.count({ where: { ticketId: t3.ticket.id, type: "STATUS_CHANGED" } }),
      intents: await prisma.notificationIntent.count({ where: { entityId: t3.ticket.id } }),
      notifications: await prisma.notification.count({ where: { userId: customerId } })
    };
    await setTicketStatus(staffActor, scope, t3.ticket.id, "RESOLVED");
    const repeatAfter = {
      events: await prisma.supportTicketEvent.count({ where: { ticketId: t3.ticket.id, type: "STATUS_CHANGED" } }),
      intents: await prisma.notificationIntent.count({ where: { entityId: t3.ticket.id } }),
      notifications: await prisma.notification.count({ where: { userId: customerId } })
    };
    check(
      "(d) setting the same status again creates no event, intent or notification",
      repeatAfter.events === repeatBaseline.events &&
        repeatAfter.intents === repeatBaseline.intents &&
        repeatAfter.notifications === repeatBaseline.notifications,
      `events=${repeatAfter.events} intents=${repeatAfter.intents} notifications=${repeatAfter.notifications}`
    );

    // ---- (e) two replies, two concurrent processIntents calls ----------------
    const t5 = await createTicket({
      actor: customerActor,
      vertical: "general",
      topic: "other",
      subject: `${subjectPrefix} concurrent`,
      message: "Concurrent delivery acceptance message body."
    });
    ticketIds.push(t5.ticket.id);
    step = await drain("t5-created");
    check(
      "(e) ticket creation intent delivered once",
      step.foreign === 0 && step.run.processed === 1,
      `foreign=${step.foreign} processed=${step.run.processed}`
    );

    await assignTicket(staffActor, scope, t5.ticket.id, staffId);
    const msgE1 = await postCustomerReply(t5.ticket.reference, { userId: customerId }, "Concurrent reply one body.");
    const msgE2 = await postCustomerReply(t5.ticket.reference, { userId: customerId }, "Concurrent reply two body.");
    const eIntentKeys = [
      `support.ticket.customer_reply:${msgE1.id}`,
      `support.ticket.customer_reply:${msgE2.id}`
    ];
    const eNotifKeys = eIntentKeys.map((key) => `notification:${key}`);
    const [eRun1, eRun2] = await Promise.all([
      processIntents(`${runTag}-concurrent-a`, 50),
      processIntents(`${runTag}-concurrent-b`, 50)
    ]);
    const eIntents = await prisma.notificationIntent.findMany({
      where: { dedupeKey: { in: eIntentKeys } },
      select: { status: true }
    });
    const eNotifications = await prisma.notification.findMany({
      where: { dedupeKey: { in: eNotifKeys } },
      select: { dedupeKey: true }
    });
    const eUnique = new Set(eNotifications.map((row) => row.dedupeKey));
    check(
      "(e) two concurrent drains deliver each customer reply exactly once",
      eIntents.length === 2 &&
        eIntents.every((row) => row.status === "PROCESSED") &&
        eNotifications.length === 2 &&
        eUnique.size === 2 &&
        eRun1.processed + eRun2.processed === 2,
      `processed=${eRun1.processed}+${eRun2.processed} notifications=${eNotifications.length}`
    );
  } finally {
    await removeOwned([staffId, customerId].filter(Boolean), ticketIds);
    if (roleCreated) {
      await prisma.role.deleteMany({ where: { name: "support", users: { none: {} } } });
    }
    finalCounts = await counts();
    await prisma.$disconnect();
  }

  if (finalCounts) {
    let clean = true;
    for (const key of Object.keys(baseline) as Array<keyof typeof baseline>) {
      const same = baseline[key] === finalCounts[key];
      clean = clean && same;
      console.log(`${same ? "PASS" : "FAIL"}  cleanup ${key} baseline=${baseline[key]} final=${finalCounts[key]}`);
    }
    check("cleanup restores every tracked table to its baseline", clean, clean ? "all equal" : "difference detected");
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
  const failed = results.filter((row) => !row.ok).length;
  console.log(`\nRESULT ${results.length - failed}/${results.length} checks passed`);
  if (failed) process.exitCode = 1;
}

void run();
