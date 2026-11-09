/**
 * Cancels unpaid or part-paid orders created by the local purchase/review
 * iterations, so the demo accounts do not accumulate stranded carts.
 * Uses the real order status update (transition machine + audit).
 *
 * Usage: node scripts/cancel-stale-test-orders.cjs
 */
const { PrismaClient } = require("@prisma/client");
const { adminUpdateOrderStatus } = require("../lib/services/core/admin.service");

const prisma = new PrismaClient();

(async () => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@naijadeals.local" }, select: { id: true } });
  const customers = await prisma.user.findMany({
    where: { email: { in: ["customer@naijadeals.local", "demo.stream.amaka@naijastream.demo"] } },
    select: { id: true }
  });
  const stale = await prisma.order.findMany({
    where: { customerId: { in: customers.map((row) => row.id) }, status: { in: ["payment_pending", "vendor_notified"] } },
    select: { id: true, orderNumber: true, status: true, payments: { select: { status: true } } }
  });

  const cancelled = [];
  const skipped = [];
  for (const order of stale) {
    const anyPaid = order.payments.some((payment) => payment.status === "COMPLETED");
    try {
      if (anyPaid) {
        // Part-paid orders go through the refund path, which needs finance review;
        // leaving them for an operator is safer than cancelling money without it.
        skipped.push({ orderNumber: order.orderNumber, reason: "has a completed payment; needs refund review" });
        continue;
      }
      await adminUpdateOrderStatus({ adminId: admin.id, orderId: order.id, status: "cancelled", note: "Stale local test order (never paid)." });
      cancelled.push(order.orderNumber);
    } catch (error) {
      skipped.push({ orderNumber: order.orderNumber, reason: String(error.message).slice(0, 80) });
    }
  }
  console.log(JSON.stringify({ cancelled: cancelled.length, skipped }, null, 1));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
