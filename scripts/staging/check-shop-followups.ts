/**
 * Read-only evidence for Shop order/payment/refund state and outbox delivery.
 *
 * Finds the most recent STAGING DEMO orders, prints their business state and
 * the associated NotificationIntent / Notification / PartnerNotification rows.
 * It never prints user emails, tokens or message bodies.
 */
import fs from "node:fs";

const ENV_FILE = "C:/NaijaDeals-Staging/env/staging.env";
const EXPECTED_DATABASE = "naijadeals_staging";

function loadStagingEnvironment() {
  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index > 0) values[line.slice(0, index)] = line.slice(index + 1);
  }
  if (!values.DATABASE_URL) throw new Error("staging DATABASE_URL is not configured");
  process.env.DATABASE_URL = values.DATABASE_URL;
}

async function main() {
  loadStagingEnvironment();
  const { prisma } = await import("../../lib/prisma");
  const database = await prisma.$queryRaw<Array<{ name: string }>>`select current_database() as name`;
  if (database[0]?.name !== EXPECTED_DATABASE) {
    throw new Error(`refusing: connected database is ${database[0]?.name ?? "unknown"}`);
  }
  const demoProducts = await prisma.product.findMany({
    where: { slug: { startsWith: "staging-demo-" } },
    select: { id: true }
  });
  const demoIds = demoProducts.map((row) => row.id);
  const orders = await prisma.order.findMany({
    where: { items: { some: { productId: { in: demoIds } } } },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      vendorId: true,
      status: true,
      paymentStatus: true,
      totalKobo: true,
      refundedKobo: true,
      createdAt: true,
      payments: { select: { provider: true, status: true, amountKobo: true } },
      escrowHolds: { select: { status: true, amountKobo: true } },
      deliveries: { select: { status: true } },
      returnRequests: { select: { status: true } }
    }
  });
  const orderIds = orders.map((order) => order.id);
  const [intents, notifications, partnerNotifications] = await Promise.all([
    prisma.notificationIntent.findMany({
      where: { entityType: "Order", entityId: { in: orderIds } },
      orderBy: { createdAt: "asc" },
      select: {
        dedupeKey: true,
        eventType: true,
        entityId: true,
        status: true,
        attempts: true,
        nextAttemptAt: true,
        processedAt: true,
        lastError: true
      }
    }),
    prisma.notification.findMany({
      where: { entityType: "Order", entityId: { in: orderIds } },
      orderBy: { createdAt: "asc" },
      select: {
        eventType: true,
        channel: true,
        status: true,
        attempts: true,
        lastError: true,
        entityId: true
      }
    }),
    prisma.partnerNotification.findMany({
      where: { userId: { in: orders.map((order) => order.customerId) } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { kind: true, title: true, readAt: true }
    })
  ]);
  console.log(
    JSON.stringify(
      {
        database: database[0]?.name,
        demoProducts: demoIds.length,
        orders: orders.map((order) => ({
          ...order,
          totalKobo: order.totalKobo.toString(),
          refundedKobo: order.refundedKobo.toString(),
          payments: order.payments.map((payment) => ({ ...payment, amountKobo: payment.amountKobo.toString() })),
          escrowHolds: order.escrowHolds.map((hold) => ({ ...hold, amountKobo: hold.amountKobo.toString() }))
        })),
        intents,
        notifications,
        partnerNotifications
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
