import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { bookShipment } from "../lib/services/send/shipments";
import { closeQueues } from "../lib/infra/queue";
import { closeCache } from "../lib/infra/cache";

/**
 * Real funded NaijaSend booking, through the service, against a development DB.
 *
 *   npx tsx scripts/send-booking-verify.ts
 *
 * Creates isolated fixtures (customer, separate provider owner, verified
 * provider, vehicle, shipment, offered quote, funded wallet), books through
 * `bookShipment`, and checks wallet, ledger and notification-intent effects.
 * Every row it creates is removed at the end.
 */

const runId = randomUUID().slice(0, 8);
const rows: { name: string; status: "PASS" | "FAIL"; detail: string }[] = [];
const created = { users: [] as string[], providers: [] as string[], shipments: [] as string[] };

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

async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (error) {
    return (error as { status?: number }).status ?? 500;
  }
}

async function fixture(label: string, amountKobo: bigint, fundedKobo: bigint) {
  const suffix = `${label}-${runId}`;
  const customer = await prisma.user.create({
    data: { email: `${suffix}@example.test`, name: `Booking ${label}`, actorType: "CUSTOMER" }
  });
  const owner = await prisma.user.create({
    data: { email: `${suffix}-owner@example.test`, name: `Provider ${label}`, actorType: "VENDOR" }
  });
  created.users.push(customer.id, owner.id);

  const wallet = await prisma.wallet.create({
    data: { userId: customer.id, ownerType: "CUSTOMER", currency: "NGN", availableKobo: fundedKobo, heldKobo: 0n }
  });

  const provider = await prisma.logisticsProvider.create({
    data: {
      ownerId: owner.id,
      name: `${label} Logistics ${runId}`,
      providerType: "road",
      contactPhone: "08012345678",
      status: "verified"
    }
  });
  created.providers.push(provider.id);
  await prisma.providerVehicle.create({ data: { providerId: provider.id, vehicleType: "truck" } });

  const shipment = await prisma.logisticsShipment.create({
    data: {
      reference: `NSH-${label.toUpperCase()}-${runId}`,
      customerId: customer.id,
      description: `Booking fixture ${label}`,
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
  created.shipments.push(shipment.id);

  const quote = await prisma.shipmentQuote.create({
    data: {
      shipmentId: shipment.id,
      providerId: provider.id,
      amountKobo,
      expiresAt: new Date(Date.now() + 3_600_000),
      status: "offered",
      transitDays: 2,
      modes: ["road"]
    }
  });

  return { customer, wallet, provider, shipment, quote };
}

async function main() {
  const happy = await fixture("booked", 1_000_000n, 5_000_000n);
  let reference = "";

  await check("funded booking succeeds and debits exactly the quote", async () => {
    const result = await bookShipment({
      customerId: happy.customer.id,
      shipmentId: happy.shipment.id,
      quoteId: happy.quote.id
    });
    reference = result.reference;

    const after = await prisma.wallet.findUniqueOrThrow({ where: { id: happy.wallet.id } });
    const debit = happy.wallet.availableKobo - after.availableKobo;
    assert(debit === 1_000_000n, `debited ${debit}, expected 1000000`);

    const shipment = await prisma.logisticsShipment.findUniqueOrThrow({ where: { id: happy.shipment.id } });
    assert(shipment.status === "booked", `shipment status ${shipment.status}`);
    return `${result.reference}: ${happy.wallet.availableKobo} → ${after.availableKobo}, status booked`;
  });

  await check("ledger debits equal credits for SEND-<reference>", async () => {
    const ledger = await prisma.walletTransaction.findFirst({
      where: { reference: `SEND-${happy.shipment.reference}` },
      include: { ledger: true }
    });
    if (!ledger) throw new Error("no wallet transaction for SEND-<reference>");
    const debit = ledger.ledger.filter((e) => e.direction === "DEBIT").reduce((sum, e) => sum + e.amountKobo, 0n);
    const credit = ledger.ledger.filter((e) => e.direction === "CREDIT").reduce((sum, e) => sum + e.amountKobo, 0n);
    assert(debit === credit, `debits ${debit} != credits ${credit}`);
    assert(debit === 1_000_000n, `ledger total ${debit}`);
    return `debit=${debit} credit=${credit} entries=${ledger.ledger.length}`;
  });

  await check("booking commits exactly one intent for the right recipient", async () => {
    const intents = await prisma.notificationIntent.findMany({
      where: { entityId: happy.shipment.id, eventType: "shipment.booked" }
    });
    assert(intents.length === 1, `${intents.length} booking intents`);
    assert(intents[0].recipientUserId === happy.customer.id, "intent addressed to the wrong user");
    return `intent ${intents[0].id.slice(0, 8)} ${intents[0].status} → customer`;
  });

  await check("repeated booking is rejected with no extra effects", async () => {
    const before = await prisma.wallet.findUniqueOrThrow({ where: { id: happy.wallet.id } });
    const status = await statusOf(
      bookShipment({ customerId: happy.customer.id, shipmentId: happy.shipment.id, quoteId: happy.quote.id })
    );
    const after = await prisma.wallet.findUniqueOrThrow({ where: { id: happy.wallet.id } });
    const intents = await prisma.notificationIntent.count({
      where: { entityId: happy.shipment.id, eventType: "shipment.booked" }
    });
    assert(status === 409, `expected 409, got ${status}`);
    assert(before.availableKobo === after.availableKobo, "wallet changed on a refused booking");
    assert(intents === 1, `${intents} booking intents after refusal`);
    return "409, wallet unchanged, intents=1";
  });

  await check("insufficient funds is rejected without debit or intent", async () => {
    const poor = await fixture("poor", 99_000_000n, 5_000_000n);
    const status = await statusOf(
      bookShipment({ customerId: poor.customer.id, shipmentId: poor.shipment.id, quoteId: poor.quote.id })
    );
    const after = await prisma.wallet.findUniqueOrThrow({ where: { id: poor.wallet.id } });
    const intents = await prisma.notificationIntent.count({ where: { entityId: poor.shipment.id } });
    const shipment = await prisma.logisticsShipment.findUniqueOrThrow({ where: { id: poor.shipment.id } });
    assert(status === 402, `expected 402, got ${status}`);
    assert(after.availableKobo === poor.wallet.availableKobo, "wallet changed on a rejected booking");
    assert(intents === 0, `${intents} intents on a rejected booking`);
    assert(shipment.status === "quoting", `shipment moved to ${shipment.status}`);
    return `402, wallet ${after.availableKobo} unchanged, intents=0`;
  });

  await check("booking by a different customer is refused", async () => {
    const victim = await fixture("cross", 500_000n, 5_000_000n);
    const intruder = await prisma.user.create({
      data: { email: `intruder-${runId}@example.test`, name: "Intruder", actorType: "CUSTOMER" }
    });
    created.users.push(intruder.id);
    const status = await statusOf(
      bookShipment({ customerId: intruder.id, shipmentId: victim.shipment.id, quoteId: victim.quote.id })
    );
    const intents = await prisma.notificationIntent.count({ where: { entityId: victim.shipment.id } });
    assert(status === 403, `expected 403, got ${status}`);
    assert(intents === 0, `${intents} intents after a refused booking`);
    return "403, zero intents";
  });

  console.log(`booking reference: ${reference}`);
  const width = Math.max(...rows.map((row) => row.name.length));
  for (const row of rows) console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
  const failed = rows.filter((row) => row.status === "FAIL").length;
  console.log(`\n${rows.length - failed} passed, ${failed} failed`);

  try {
    await prisma.notificationIntent.deleteMany({ where: { entityId: { in: created.shipments } } });
    await prisma.notification.deleteMany({ where: { entityId: { in: created.shipments } } });
    await prisma.partnerNotification.deleteMany({ where: { userId: { in: created.users } } });
    const wallets = await prisma.wallet.findMany({ where: { userId: { in: created.users } }, select: { id: true } });
    const walletIds = wallets.map((w) => w.id);
    const txs = await prisma.walletTransaction.findMany({ where: { walletId: { in: walletIds } }, select: { id: true } });
    const txIds = txs.map((t) => t.id);
    await prisma.ledgerEntry.deleteMany({ where: { OR: [{ walletId: { in: walletIds } }, { transactionId: { in: txIds } }] } });
    await prisma.walletTransaction.deleteMany({ where: { id: { in: txIds } } });
    await prisma.shipmentEvent.deleteMany({ where: { shipmentId: { in: created.shipments } } });
    await prisma.shipmentAssignment.deleteMany({ where: { shipmentId: { in: created.shipments } } });
    await prisma.shipmentLeg.deleteMany({ where: { shipmentId: { in: created.shipments } } });
    await prisma.shipmentQuote.deleteMany({ where: { shipmentId: { in: created.shipments } } });
    await prisma.logisticsShipment.deleteMany({ where: { id: { in: created.shipments } } });
    await prisma.providerVehicle.deleteMany({ where: { providerId: { in: created.providers } } });
    await prisma.logisticsProvider.deleteMany({ where: { id: { in: created.providers } } });
    await prisma.wallet.deleteMany({ where: { id: { in: walletIds } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  } catch (error) {
    console.error("cleanup incomplete:", error instanceof Error ? error.message.slice(0, 160) : error);
  }

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
