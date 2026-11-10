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

    await check("4. two workers claim disjoint nonempty batches", async () => {
      // A live worker may be consuming the queue, so this test creates its own
      // batch immediately before claiming instead of relying on older rows.
      const keys: string[] = [];
      for (let index = 0; index < 6; index += 1) {
        const key = `intent:${runId}:batch:${index}`;
        keys.push(key);
        await prisma.$transaction((tx) => enqueueIntent(tx, intent(key, shipment.id, customer.id)));
      }
      const a = await claimIntents("worker-a", 3);
      const b = await claimIntents("worker-b", 3);
      const union = new Set([...a.rows.map((row) => row.id), ...b.rows.map((row) => row.id)]);
      assert(a.rows.length > 0 && b.rows.length > 0, `each worker must claim at least one (a=${a.rows.length} b=${b.rows.length})`);
      const overlap = a.rows.filter((row) => b.rows.some((other) => other.id === row.id));
      assert(overlap.length === 0, `${overlap.length} intents claimed twice`);
      const claimedKeys = new Set([...a.rows, ...b.rows].map((row) => row.dedupeKey));
      for (const row of a.rows) assert(row.leaseToken === a.token, "row carries a foreign lease token");
      await prisma.notificationIntent.updateMany({ where: { dedupeKey: { in: keys } }, data: { status: "PENDING", leaseOwner: null, leaseToken: null, leaseExpiresAt: null } });
      return `claimed=${union.size} a=${a.rows.length} b=${b.rows.length} overlap=0 ownKeys=${[...claimedKeys].filter((k) => keys.includes(k)).length}`;
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

    await check("8. provider failure leaves the shipment and its intents intact", async () => {
      const key = `intent:${runId}:providerfail`;
      await prisma.$transaction((tx) => enqueueIntent(tx, intent(key, shipment.id, customer.id)));
      const savedInApp = process.env.NOTIFY_IN_APP_CHAIN;
      const savedEmail = process.env.NOTIFY_EMAIL_CHAIN;
      process.env.NOTIFY_IN_APP_CHAIN = "none";
      process.env.NOTIFY_EMAIL_CHAIN = "none";
      try {
        await prisma.notificationIntent.updateMany({ where: { dedupeKey: key }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
        await processIntents("worker-fail", 50);
      } finally {
        if (savedInApp === undefined) delete process.env.NOTIFY_IN_APP_CHAIN; else process.env.NOTIFY_IN_APP_CHAIN = savedInApp;
        if (savedEmail === undefined) delete process.env.NOTIFY_EMAIL_CHAIN; else process.env.NOTIFY_EMAIL_CHAIN = savedEmail;
      }
      const row = await prisma.notificationIntent.findUnique({ where: { dedupeKey: key } });
      assert(row?.status === "PROCESSED", `intent status ${row?.status}, expected PROCESSED`);
      const after = await prisma.logisticsShipment.findUnique({ where: { id: shipment.id }, select: { status: true } });
      assert(after?.status === "quoting", `shipment status changed to ${after?.status}`);
      const queued = await prisma.notification.count({ where: { entityId: shipment.id, status: { in: ["QUEUED", "FAILED"] } } });
      assert(queued >= 1, "no notification record was created for the intent");
      const stillPending = await prisma.notificationIntent.count({ where: { dedupeKey: key, status: "PENDING" } });
      assert(stillPending === 0, "intent was requeued instead of completing");
      return "intent PROCESSED once, shipment untouched, channel failure recorded";
    });

    await check("9. cancellation by a non-owner is rejected with no intent", async () => {
      const before = await prisma.notificationIntent.count({ where: { entityId: shipment.id, eventType: "shipment.cancelled" } });
      let status = 0;
      try { await cancelShipment({ customerId: stranger.id, shipmentId: shipment.id }); }
      catch (error) { status = (error as { status?: number }).status ?? 500; }
      assert(status === 403, `expected 403, got ${status}`);
      const after = await prisma.notificationIntent.count({ where: { entityId: shipment.id, eventType: "shipment.cancelled" } });
      assert(after === before, "an intent was created for a rejected request");
      const row = await prisma.logisticsShipment.findUnique({ where: { id: shipment.id }, select: { status: true } });
      assert(row?.status === "quoting", `shipment mutated to ${row?.status}`);
      return "403, shipment unchanged, zero intents";
    });

    await check("10. owner cancellation writes exactly one intent", async () => {
      await cancelShipment({ customerId: customer.id, shipmentId: shipment.id });
      const intents = await prisma.notificationIntent.findMany({ where: { entityId: shipment.id, eventType: "shipment.cancelled" } });
      assert(intents.length === 1, `${intents.length} cancellation intents`);
      const row = await prisma.logisticsShipment.findUnique({ where: { id: shipment.id }, select: { status: true } });
      assert(row?.status === "cancelled", `status ${row?.status}`);
      return "one intent, shipment cancelled";
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
