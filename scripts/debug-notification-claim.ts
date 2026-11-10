import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";

async function main() {
  const key = `probe:${randomUUID()}`;
  const past = new Date(Date.now() - 60_000);
  const user = await prisma.user.create({
    data: { email: `${key}@example.test`, name: "Claim Probe", actorType: "CUSTOMER" }
  });
  await prisma.notificationIntent.create({
    data: {
      dedupeKey: key,
      eventType: "shipment.in_transit",
      entityType: "LogisticsShipment",
      entityId: "probe",
      recipientUserId: user.id,
      payload: {},
      nextAttemptAt: past
    }
  });

  const who = await prisma.$queryRaw<Array<{ db: string; addr: string | null }>>`
    SELECT current_database() AS db, inet_server_addr()::text AS addr`;
  console.log("DB:", JSON.stringify(who));

  const state = await prisma.$queryRaw<Array<{ s: string; due: boolean; next: string }>>`
    SELECT status::text AS s,
           ("nextAttemptAt" <= ${new Date()}) AS due,
           "nextAttemptAt"::text AS next
      FROM "NotificationIntent" WHERE "dedupeKey" = ${key}`;
  console.log("row:", JSON.stringify(state));

  const b = await prisma.$transaction(async (tx) => {
    const noLock = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "NotificationIntent"
       WHERE status = 'PENDING'::"NotificationIntentStatus" AND "nextAttemptAt" <= ${new Date()}
       ORDER BY "nextAttemptAt" LIMIT 10`;
    const a = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "NotificationIntent"
       WHERE status = 'PENDING'::"NotificationIntentStatus" AND "nextAttemptAt" <= ${new Date()}
       ORDER BY "nextAttemptAt" LIMIT 10 FOR UPDATE SKIP LOCKED`;
    const c = await tx.notificationIntent.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
      select: { id: true },
      take: 10
    });
    return { noLock: noLock.length, locked: a.length, findMany: c.length };
  });
  console.log("in tx:", JSON.stringify(b));

  const d = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "NotificationIntent"
     WHERE status = 'PENDING'::"NotificationIntentStatus" AND "nextAttemptAt" <= ${new Date()}
     ORDER BY "nextAttemptAt" LIMIT 10`;
  console.log("outside tx:", d.length);

  const { claimIntents } = await import("../lib/notifications/intent.service");
  const claimed = await claimIntents("probe-worker", 10);
  console.log("claimIntents:", claimed.rows.length, claimed.rows.map((r) => r.dedupeKey === key).join(","));

  await prisma.notificationIntent.updateMany({ where: { dedupeKey: key }, data: { status: "PENDING", leaseOwner: null, leaseToken: null, leaseExpiresAt: null } });
  await prisma.notificationIntent.deleteMany({ where: { dedupeKey: key } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}

void main();
