import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { enqueueIntent, claimIntents, processIntents, recoverExpiredLeases } from "../lib/notifications/intent.service";
import { cancelShipment } from "../lib/services/send/shipments";
import { closeQueues } from "../lib/infra/queue";
import { closeCache } from "../lib/infra/cache";

const runId = randomUUID().slice(0, 8);
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
const createdShipments: string[] = [];

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
async function check(name: string, run: () => Promise<string>) {
  try { rows.push({ name, status: "PASS", detail: await run() }); }
  catch (e) { rows.push({ name, status: "FAIL", detail: e instanceof Error ? e.message : String(e) }); }
}

function intent(dedupeKey: string, entityId: string, recipient: string) {
  return {
    dedupeKey,
    eventType: "shipment.in_transit",
    entityType: "LogisticsShipment",
    entityId,
    recipientUserId: recipient,
    payload: { reference: `REF-${runId}`, label: "in transit" }
  };
}

async function main() {
  const customer = await prisma.user.create({
    data: { email: `intent-customer-${runId}@example.test`, name: "Intent Customer", actorType: "CUSTOMER" }
  });
  const stranger = await prisma.user.create({
    data: { email: `intent-stranger-${runId}@example.test`, name: "Intent Stranger", actorType: "CUSTOMER" }
  });

  const shipment = await prisma.logisticsShipment.create({
    data: {
      reference: `NSH-VERIFY-${runId}`,
      customerId: customer.id,
      description: "Outbox verification fixture",
      originLabel: "Lagos",
      destinationLabel: "Abuja",
      senderName: "Intent Sender",
      senderPhone: "08012345678",
      recipientName: "Intent Recipient",
      recipientPhone: "08087654321",
      weightKg: 2,
      status: "quoting"
    }
  });
  createdShipments.push(shipment.id);

  try {
    await check("1. intent is written inside a committed transaction", async () => {
      const ok = await prisma.$transaction((tx) => enqueueIntent(tx, intent(`intent:${runId}:commit`, shipment.id, customer.id)));
      assert(ok, "enqueue returned false");
      const row = await prisma.notificationIntent.findUnique({ where: { dedupeKey: `intent:${runId}:commit` } });
      if (!row || row.status !== "PENDING") throw new Error("intent missing or not pending");
      return `pending intent ${row.id.slice(0, 8)}…`;
    });

    await check("2. rolled-back transaction leaves no intent", async () => {
      const key = `intent:${runId}:rollback`;
      await prisma.$transaction(async (tx) => {
        await enqueueIntent(tx, intent(key, shipment.id, customer.id));
        throw new Error("forced_rollback");
      }).catch(() => undefined);
      const row = await prisma.notificationIntent.findUnique({ where: { dedupeKey: key } });
      assert(row === null, "intent survived a rolled-back transaction");
      return "zero intents after rollback";
    });

    await check("3. duplicate intent key is a no-op", async () => {
      const key = `intent:${runId}:duplicate`;
      const first = await prisma.$transaction((tx) => enqueueIntent(tx, intent(key, shipment.id, customer.id)));
      const second = await prisma.$transaction((tx) => enqueueIntent(tx, intent(key, shipment.id, customer.id)));
      assert(first === true && second === false, `first=${first} second=${second}`);
      const count = await prisma.notificationIntent.count({ where: { dedupeKey: key } });
      assert(count === 1, `${count} rows for one key`);
      return "second insert ignored, count=1";
    });

    await check("4. two workers claim disjoint batches", async () => {
      await prisma.notificationIntent.updateMany({ where: { dedupeKey: { startsWith: `intent:${runId}:` } }, data: { nextAttemptAt: new Date() } });
      const a = await claimIntents("worker-a", 10);
      const b = await claimIntents("worker-b", 10);
      const eligible = await prisma.notificationIntent.count({ where: { dedupeKey: { startsWith: `intent:${runId}:` }, status: "PENDING" } });
      assert(eligible > 0, "no eligible intents to claim");
      assert(a.rows.length > 0, "first worker claimed nothing while eligible rows existed");
      const overlap = a.rows.filter((row) => b.rows.some((other) => other.id === row.id));
      assert(overlap.length === 0, `${overlap.length} intents claimed twice`);
      await prisma.notificationIntent.updateMany({ where: { leaseOwner: "worker-a" }, data: { status: "PENDING", leaseOwner: null, leaseToken: null, leaseExpiresAt: null } });
      await prisma.notificationIntent.updateMany({ where: { leaseOwner: "worker-b" }, data: { status: "PENDING", leaseOwner: null, leaseToken: null, leaseExpiresAt: null } });
      return `eligible=${eligible} a=${a.rows.length} b=${b.rows.length} overlap=0`;
    });

    await check("5. expired lease is recovered back to PENDING", async () => {
      const key = `intent:${runId}:lease`;
      await prisma.$transaction((tx) => enqueueIntent(tx, intent(key, shipment.id, customer.id)));
      await prisma.notificationIntent.update({
        where: { dedupeKey: key },
        data: { status: "CLAIMED", leaseOwner: "dead-worker", leaseToken: "stale", leaseExpiresAt: new Date(Date.now() - 60_000) }
      });
      const recovered = await recoverExpiredLeases();
      assert(recovered >= 1, `recovered ${recovered}`);
      const row = await prisma.notificationIntent.findUnique({ where: { dedupeKey: key } });
      assert(row?.status === "PENDING" && row.leaseToken === null, "lease was not cleared");
      return `recovered ${recovered}, lease cleared`;
    });

    await check("6. stale worker cannot finalise a reclaimed intent", async () => {
      const key = `intent:${runId}:fence`;
      await prisma.$transaction((tx) => enqueueIntent(tx, intent(key, shipment.id, customer.id)));
      const first = await claimIntents("worker-old", 50);
      const target = first.rows.find((row) => row.dedupeKey === key);
      if (!target) throw new Error("intent not claimed by the first worker");
      // Simulate takeover: a second claim after the lease expires.
      await prisma.notificationIntent.update({ where: { id: target.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
      await recoverExpiredLeases();
      const second = await claimIntents("worker-new", 50);
      const takeover = second.rows.find((row) => row.id === target.id);
      assert(takeover && takeover.leaseToken !== target.leaseToken, "takeover did not produce a new lease token");
      const staleWrite = await prisma.notificationIntent.updateMany({
        where: { id: target.id, leaseToken: target.leaseToken, status: "CLAIMED" },
        data: { status: "PROCESSED", processedAt: new Date() }
      });
      assert(staleWrite.count === 0, "stale worker overwrote the new lease holder");
      return "stale token rejected, new lease holds";
    });

    await check("7. processing delivers a notification once", async () => {
      const key = `intent:${runId}:deliver`;
      await prisma.$transaction((tx) => enqueueIntent(tx, { ...intent(key, shipment.id, customer.id), eventType: "shipment.in_transit" }));
      await prisma.notificationIntent.updateMany({ where: { dedupeKey: key }, data: { nextAttemptAt: new Date() } });
      const first = await processIntents("worker-deliver", 50);
      assert(first.processed >= 1, `processed ${first.processed}`);
      const notes = await prisma.notification.findMany({ where: { entityId: shipment.id, eventType: "shipment.status_changed" } });
      assert(notes.length >= 1, "no notification record created");
      const second = await processIntents("worker-deliver-2", 50);
      const after = await prisma.notification.count({ where: { entityId: shipment.id, eventType: "shipment.status_changed" } });
      assert(after === notes.length, `notification count changed on reprocess (${notes.length} -> ${after})`);
      return `processed=${first.processed}, reprocessed=${second.processed}, notifications=${after}`;
    });

  } finally {
    const ids = createdShipments;
    await prisma.notificationIntent.deleteMany({ where: { entityId: { in: ids } } }).catch(() => undefined);
    await prisma.notification.deleteMany({ where: { entityId: { in: ids } } }).catch(() => undefined);
    await prisma.partnerNotification.deleteMany({ where: { userId: { in: [customer.id, stranger.id] } } }).catch(() => undefined);
    await prisma.shipmentEvent.deleteMany({ where: { shipmentId: { in: ids } } }).catch(() => undefined);
    await prisma.logisticsShipment.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    await prisma.notificationIntent.deleteMany({ where: { dedupeKey: { contains: runId } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [customer.id, stranger.id] } } }).catch(() => undefined);
  }

  const width = Math.max(...rows.map((row) => row.name.length));
  for (const row of rows) console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
  const failed = rows.filter((row) => row.status === "FAIL").length;
  console.log(`
${rows.length - failed} passed, ${failed} failed`);
  await closeQueues();
  await closeCache();
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error("crashed:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
