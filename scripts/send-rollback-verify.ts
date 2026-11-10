import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { postBalancedTransaction } from "../lib/services/core/wallet.service";
import { enqueueIntent } from "../lib/notifications/intent.service";

/**
 * Forced-failure atomicity check for the booking money path.
 *
 *   npx tsx scripts/send-rollback-verify.ts
 *
 * `bookShipment` has no injection point, and adding a production-visible switch
 * to create one would be worse than the missing test. So this harness performs
 * the same operations the service performs — claim the shipment, debit the
 * wallet, post the balanced ledger transaction, record the intent — inside one
 * `prisma.$transaction`, then throws after the ledger and intent are written but
 * before commit.
 *
 * Limits of this evidence, stated plainly: it proves PostgreSQL atomically
 * discards every write in that transaction. It does not prove `bookShipment`
 * itself is wrapped correctly — the funded-booking suite plus the 409 and 402
 * refusals cover that separately.
 */

const runId = randomUUID().slice(0, 8);
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function check(name: string, run: () => Promise<string>) {
  try {
    rows.push({ name, status: "PASS", detail: await run() });
  } catch (error) {
    rows.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

async function main() {
  const customer = await prisma.user.create({
    data: { email: `rollback-${runId}@example.test`, name: "Rollback Customer", actorType: "CUSTOMER" }
  });
  const owner = await prisma.user.create({
    data: { email: `rollback-owner-${runId}@example.test`, name: "Rollback Provider", actorType: "VENDOR" }
  });
  const wallet = await prisma.wallet.create({
    data: { userId: customer.id, ownerType: "CUSTOMER", currency: "NGN", availableKobo: 5_000_000n, heldKobo: 0n }
  });
  const provider = await prisma.logisticsProvider.create({
    data: {
      ownerId: owner.id,
      name: `Rollback Logistics ${runId}`,
      providerType: "road",
      contactPhone: "08012345678",
      status: "verified"
    }
  });
  const shipment = await prisma.logisticsShipment.create({
    data: {
      reference: `NSH-ROLLBACK-${runId}`,
      customerId: customer.id,
      description: "Rollback fixture",
      originLabel: "Lagos",
      destinationLabel: "Abuja",
      senderName: "Sender",
      senderPhone: "08012345678",
      recipientName: "Recipient",
      recipientPhone: "08087654321",
      weightKg: 5,
      status: "quoting"
    }
  });
  const quote = await prisma.shipmentQuote.create({
    data: {
      shipmentId: shipment.id,
      providerId: provider.id,
      amountKobo: 1_000_000n,
      expiresAt: new Date(Date.now() + 3_600_000),
      status: "offered",
      transitDays: 2,
      modes: ["road"]
    }
  });
  const platform = await prisma.wallet.findFirstOrThrow({ where: { ownerType: "SYSTEM" } });

  try {
    await check("forced failure after ledger and intent leaves nothing behind", async () => {
      const before = {
        wallet: (await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).availableKobo,
        platform: (await prisma.wallet.findUniqueOrThrow({ where: { id: platform.id } })).availableKobo,
        ledger: await prisma.ledgerEntry.count({ where: { walletId: wallet.id } }),
        intents: await prisma.notificationIntent.count({ where: { entityId: shipment.id } }),
        events: await prisma.shipmentEvent.count({ where: { shipmentId: shipment.id } })
      };

      let thrown = "";
      try {
        await prisma.$transaction(async (tx) => {
          const claimed = await tx.logisticsShipment.updateMany({
            where: { id: shipment.id, status: { in: ["open", "quoting"] } },
            data: { status: "booked" }
          });
          assert(claimed.count === 1, "fixture shipment was not claimable");

          await tx.wallet.update({ where: { id: wallet.id }, data: { availableKobo: { decrement: quote.amountKobo } } });
          await tx.wallet.update({ where: { id: platform.id }, data: { heldKobo: { increment: quote.amountKobo } } });
          await postBalancedTransaction({
            tx,
            actorId: customer.id,
            walletId: wallet.id,
            type: "debit",
            amountKobo: quote.amountKobo,
            reference: `SEND-${shipment.reference}`,
            description: `Forced-failure probe ${shipment.reference}`,
            entries: [
              { walletId: wallet.id, direction: "DEBIT", amountKobo: quote.amountKobo, memo: "probe debit" },
              { walletId: platform.id, direction: "CREDIT", amountKobo: quote.amountKobo, memo: "probe credit" }
            ]
          });
          await enqueueIntent(tx, {
            dedupeKey: `shipment:${shipment.id}:booked`,
            eventType: "shipment.booked",
            entityType: "LogisticsShipment",
            entityId: shipment.id,
            recipientUserId: customer.id,
            payload: { reference: shipment.reference, label: "booked" }
          });
          await tx.shipmentEvent.create({
            data: { shipmentId: shipment.id, status: "booked", label: "Probe booking", actorId: customer.id }
          });

          throw new Error("forced_rollback_after_ledger_and_intent");
        });
      } catch (error) {
        thrown = error instanceof Error ? error.message : String(error);
      }
      assert(thrown === "forced_rollback_after_ledger_and_intent", `transaction did not fail as intended: ${thrown}`);

      const after = {
        wallet: (await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).availableKobo,
        platform: (await prisma.wallet.findUniqueOrThrow({ where: { id: platform.id } })).availableKobo,
        ledger: await prisma.ledgerEntry.count({ where: { walletId: wallet.id } }),
        intents: await prisma.notificationIntent.count({ where: { entityId: shipment.id } }),
        events: await prisma.shipmentEvent.count({ where: { shipmentId: shipment.id } })
      };
      const status = (await prisma.logisticsShipment.findUniqueOrThrow({ where: { id: shipment.id } })).status;

      assert(after.wallet === before.wallet, `wallet ${before.wallet} -> ${after.wallet}`);
      assert(after.platform === before.platform, `platform balance ${before.platform} -> ${after.platform}`);
      assert(after.ledger === before.ledger, `ledger entries ${before.ledger} -> ${after.ledger}`);
      assert(after.intents === before.intents, `intents ${before.intents} -> ${after.intents}`);
      assert(after.events === before.events, `events ${before.events} -> ${after.events}`);
      assert(status === "quoting", `shipment status became ${status}`);
      const notifications = await prisma.notification.count({ where: { entityId: shipment.id } });
      assert(notifications === 0, `${notifications} notifications exist for a failed booking`);

      return `wallet ${before.wallet}=${after.wallet}, ledger ${before.ledger}, intents ${after.intents}, status ${status}`;
    });

    await check("the same transaction commits cleanly when not forced to fail", async () => {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.logisticsShipment.updateMany({
          where: { id: shipment.id, status: { in: ["open", "quoting"] } },
          data: { status: "booked" }
        });
        assert(claimed.count === 1, "second claim failed");
        await tx.wallet.update({ where: { id: wallet.id }, data: { availableKobo: { decrement: quote.amountKobo } } });
        await tx.wallet.update({ where: { id: platform.id }, data: { heldKobo: { increment: quote.amountKobo } } });
        await postBalancedTransaction({
          tx,
          actorId: customer.id,
          walletId: wallet.id,
          type: "debit",
          amountKobo: quote.amountKobo,
          reference: `SEND-${shipment.reference}`,
          description: `Committed probe ${shipment.reference}`,
          entries: [
            { walletId: wallet.id, direction: "DEBIT", amountKobo: quote.amountKobo, memo: "probe debit" },
            { walletId: platform.id, direction: "CREDIT", amountKobo: quote.amountKobo, memo: "probe credit" }
          ]
        });
        await enqueueIntent(tx, {
          dedupeKey: `shipment:${shipment.id}:booked`,
          eventType: "shipment.booked",
          entityType: "LogisticsShipment",
          entityId: shipment.id,
          recipientUserId: customer.id,
          payload: { reference: shipment.reference, label: "booked" }
        });
      });

      const walletAfter = (await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).availableKobo;
      const intents = await prisma.notificationIntent.count({ where: { entityId: shipment.id } });
      assert(walletAfter === 4_000_000n, `wallet ${walletAfter}`);
      assert(intents === 1, `${intents} intents after commit`);
      return `wallet 4000000, intents 1 (control case)`;
    });
  } finally {
    try {
      const wallets = await prisma.wallet.findMany({ where: { userId: { in: [customer.id, owner.id] } }, select: { id: true } });
      const walletIds = wallets.map((row) => row.id);
      const txs = await prisma.walletTransaction.findMany({ where: { walletId: { in: walletIds } }, select: { id: true } });
      const txIds = txs.map((row) => row.id);
      await prisma.ledgerEntry.deleteMany({ where: { OR: [{ walletId: { in: walletIds } }, { transactionId: { in: txIds } }] } });
      await prisma.walletTransaction.deleteMany({ where: { id: { in: txIds } } });
      await prisma.notificationIntent.deleteMany({ where: { entityId: shipment.id } });
      await prisma.shipmentEvent.deleteMany({ where: { shipmentId: shipment.id } });
      await prisma.shipmentQuote.deleteMany({ where: { shipmentId: shipment.id } });
      await prisma.providerVehicle.deleteMany({ where: { providerId: provider.id } });
      await prisma.logisticsShipment.deleteMany({ where: { id: shipment.id } });
      await prisma.logisticsProvider.deleteMany({ where: { id: provider.id } });
      await prisma.wallet.deleteMany({ where: { id: { in: walletIds } } });
      await prisma.user.deleteMany({ where: { id: { in: [customer.id, owner.id] } } });
    } catch (error) {
      console.error("cleanup incomplete:", error instanceof Error ? error.message.slice(0, 160) : error);
    }
  }

  const width = Math.max(...rows.map((row) => row.name.length));
  for (const row of rows) console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
  const failed = rows.filter((row) => row.status === "FAIL").length;
  console.log(`\n${rows.length - failed} passed, ${failed} failed`);

  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error("crashed:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
