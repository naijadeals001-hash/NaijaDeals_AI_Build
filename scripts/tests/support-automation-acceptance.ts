/**
 * Support automation slice acceptance (run-owned data, TEST-classified DB).
 *
 * Proves: transactional outbox, claim/lease/ack via the API, idempotent
 * notification, replay, concurrency, lease recovery, dead-letter, auth.
 *
 * Migrated from qa-artifacts/_automation-slice.mts. The database comes from
 * TEST_DATABASE_URL through the shared guard (never DATABASE_URL as a
 * fallback); the consumer credential and base URL come from the environment.
 * The API must already be served at AUTOMATION_BASE_URL
 * (default http://127.0.0.1:3200).
 *
 * Command:
 *   TEST_DATABASE_URL='postgresql://user:password@host:5432/database' \
 *     AUTOMATION_CONSUMER_TOKEN='...' \
 *     AUTOMATION_BASE_URL='http://127.0.0.1:3200' \
 *     npx tsx scripts/tests/support-automation-acceptance.ts
 */
import { requireTestDatabase } from "../lib/test-db-guard";

type Check = { ok: boolean; name: string; detail?: string };
const results: Check[] = [];

async function main(): Promise<void> {
  const token = process.env.AUTOMATION_CONSUMER_TOKEN;
  if (!token) {
    console.error("ABORT: AUTOMATION_CONSUMER_TOKEN is not configured");
    process.exit(2);
  }
  const baseUrl = (process.env.AUTOMATION_BASE_URL ?? "http://127.0.0.1:3200").replace(/\/+$/, "");
  const base = `${baseUrl}/api/automation/notifications`;

  const { prisma } = await import("../../lib/prisma");
  const { createTicket } = await import("../../lib/services/core/support.service");

  const check = (name: string, ok: boolean, detail = "") => {
    results.push({ ok, name, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };
  const drain = async (t = token, limit = 10) => {
    const r = await fetch(`${base}/drain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`,
        Origin: baseUrl
      },
      body: JSON.stringify({ limit })
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const status = async (t = token) => {
    const r = await fetch(`${base}/status`, { headers: { Authorization: `Bearer ${t}` } });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  // Pre-clean any leftovers from an earlier interrupted run of this probe.
  const stale = await prisma.supportTicket.findMany({
    where: { subject: { startsWith: "automation slice " } },
    select: { id: true }
  });
  if (stale.length) {
    await prisma.notificationIntent.deleteMany({ where: { entityId: { in: stale.map((t) => t.id) } } });
    await prisma.supportTicket.deleteMany({ where: { id: { in: stale.map((t) => t.id) } } });
  }
  const staleStaff = await prisma.user.findMany({
    where: { email: { startsWith: "auto-staff-" } },
    select: { id: true }
  });
  if (staleStaff.length) {
    await prisma.partnerNotification.deleteMany({ where: { userId: { in: staleStaff.map((u) => u.id) } } });
    await prisma.notification.deleteMany({ where: { userId: { in: staleStaff.map((u) => u.id) } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: staleStaff.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: staleStaff.map((u) => u.id) } } });
  }
  const stamp = Date.now();
  const marker = `automation slice ${stamp}`;
  const staff = await prisma.user.create({
    data: { email: `auto-staff-${stamp}@naijadeals.test`, name: "Automation Staff", passwordHash: "x" }
  });
  // The role is shared reference data: adopt it when present and only delete it
  // on cleanup if this run actually created it.
  const existingRole = await prisma.role.findUnique({ where: { name: "support" }, select: { id: true } });
  const role = existingRole ?? (await prisma.role.create({ data: { name: "support" }, select: { id: true } }));
  const roleCreated = !existingRole;
  await prisma.userRole.create({ data: { userId: staff.id, roleId: role.id } });
  const ticket = await createTicket({
    actor: null,
    guestName: "Automation Guest",
    email: `auto-guest-${stamp}@example.test`,
    vertical: "general",
    topic: "other",
    subject: marker,
    message: "Slice acceptance message body."
  });

  try {
    const pending = await prisma.notificationIntent.count({
      where: { entityId: ticket.ticket.id, status: "PENDING" }
    });
    const notificationsBefore = await prisma.notification.count({ where: { userId: staff.id } });
    check("ticket creation writes a durable pending intent", pending >= 1, `pending=${pending}`);
    check("no notification exists before the consumer runs", notificationsBefore === 0, `count=${notificationsBefore}`);

    const first = await drain();
    check("authenticated drain processes the intent", first.status === 200 && first.body.processed >= 1, JSON.stringify(first.body));
    const afterFirst = await prisma.notification.count({ where: { userId: staff.id } });
    check("staff notification delivered exactly once", afterFirst === 1, `count=${afterFirst}`);

    const replay = await drain();
    const afterReplay = await prisma.notification.count({ where: { userId: staff.id } });
    check(
      "replay produces no duplicate notification",
      replay.body.processed === 0 && afterReplay === 1,
      JSON.stringify(replay.body)
    );

    const bad = await drain("wrong-token-value-that-is-long-enough-000000");
    check("invalid credential is refused", bad.status === 401, `status=${bad.status}`);
    const anon = await status("wrong-token-value-that-is-long-enough-111111");
    check("status endpoint requires the credential", anon.status === 401, `status=${anon.status}`);
    const noOrigin = await fetch(`${base}/drain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: "{}"
    });
    check(
      "token-authenticated drain works without an Origin header (server-to-server)",
      noOrigin.status === 200,
      `status=${noOrigin.status}`
    );

    // Concurrency: two tickets, two parallel drains.
    const t2 = await createTicket({
      actor: null,
      guestName: "C2",
      email: `auto-guest2-${stamp}@example.test`,
      vertical: "general",
      topic: "other",
      subject: `${marker} two`,
      message: "Second slice message body."
    });
    const t3 = await createTicket({
      actor: null,
      guestName: "C3",
      email: `auto-guest3-${stamp}@example.test`,
      vertical: "general",
      topic: "other",
      subject: `${marker} three`,
      message: "Third slice message body."
    });
    const [d1, d2] = await Promise.all([drain(), drain()]);
    const notifications = await prisma.notification.count({ where: { userId: staff.id } });
    const stays = await prisma.notificationIntent.count({
      where: { entityId: { in: [t2.ticket.id, t3.ticket.id] }, status: "PROCESSED" }
    });
    check(
      "concurrent drains process each intent once",
      stays >= 2 && notifications === 3,
      `processed=${stays} notifications=${notifications} drains=${JSON.stringify([d1.body, d2.body])}`
    );

    // Lease recovery: claim without completing, expire the lease, drain again.
    const t4 = await createTicket({
      actor: null,
      guestName: "C4",
      email: `auto-guest4-${stamp}@example.test`,
      vertical: "general",
      topic: "other",
      subject: `${marker} four`,
      message: "Fourth slice message body."
    });
    const intent = await prisma.notificationIntent.findFirst({
      where: { entityId: t4.ticket.id, status: "PENDING" },
      select: { id: true }
    });
    if (intent) {
      await prisma.notificationIntent.update({
        where: { id: intent.id },
        data: {
          status: "CLAIMED",
          leaseToken: "stale",
          leaseOwner: "dead-worker",
          leaseExpiresAt: new Date(Date.now() - 60_000),
          attempts: 1
        }
      });
    }
    const recovered = await drain();
    const t4Notification = await prisma.notification.count({ where: { userId: staff.id } });
    check(
      "expired lease is recovered and delivered once",
      recovered.body.recovered >= 1 && t4Notification === 4,
      `recovered=${recovered.body.recovered} notifications=${t4Notification}`
    );

    // Dead letter: unsupported event with one attempt allowed.
    const poison = await prisma.notificationIntent.create({
      data: {
        dedupeKey: `automation-poison-${stamp}`,
        eventType: "unsupported.intent.event",
        entityType: "test",
        entityId: `poison-${stamp}`,
        recipientUserId: staff.id,
        payload: {},
        payloadVersion: 1,
        maxAttempts: 1
      }
    });
    const poisonRun = await drain();
    const poisonRow = await prisma.notificationIntent.findUnique({
      where: { id: poison.id },
      select: { status: true, lastError: true }
    });
    const state = await status();
    check(
      "permanent failure becomes DEAD after bounded attempts",
      poisonRun.body.dead >= 1 && poisonRow?.status === "DEAD",
      JSON.stringify(poisonRow)
    );
    check(
      "dead-letter is visible to the operator endpoint",
      (state.body.dead ?? []).some((row: { entityId: string }) => row.entityId === `poison-${stamp}`)
    );
  } finally {
    // Every ticket this run created shares the marker. The original probe only
    // deleted the first ticket's intents, which leaked the intents of the
    // concurrency and lease tickets; resolve the owned tickets first so all of
    // them are removed.
    const ownedTickets = await prisma.supportTicket.findMany({
      where: { subject: { contains: marker } },
      select: { id: true }
    });
    const ownedTicketIds = [...new Set([...ownedTickets.map((row) => row.id), ticket.ticket.id])];
    await prisma.notificationIntent.deleteMany({
      where: {
        OR: [
          { entityId: { in: ownedTicketIds } },
          { entityId: { startsWith: "poison-" } },
          { dedupeKey: { contains: String(stamp) } }
        ]
      }
    });
    await prisma.supportTicket.deleteMany({ where: { subject: { contains: marker } } });
    await prisma.partnerNotification.deleteMany({ where: { userId: staff.id } });
    await prisma.notification.deleteMany({ where: { userId: staff.id } });
    await prisma.userRole.deleteMany({ where: { userId: staff.id } });
    await prisma.user.delete({ where: { id: staff.id } });
    if (roleCreated) {
      await prisma.role.deleteMany({ where: { name: "support", users: { none: {} } } });
    }
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
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nRESULT ${results.length - failed}/${results.length} checks passed`);
  if (failed) process.exitCode = 1;
}

void run();
