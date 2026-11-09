/**
 * Read-only integrity report for the local NaijaShop TEST database: ledger
 * balance, order/payment consistency, orphan checks and review state.
 *
 * Usage: node scripts/naijashop-integrity-check.cjs
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

(async () => {
  const [ledger, orders, payments, reviews, approvedRatings] = await Promise.all([
    prisma.$queryRawUnsafe(
      `select count(*)::int as entries,
              coalesce(sum(case when direction = 'CREDIT' then "amountKobo" else -"amountKobo" end), 0)::bigint as net
         from "LedgerEntry"`
    ),
    prisma.order.groupBy({ by: ["status", "paymentStatus"], _count: { _all: true } }),
    prisma.payment.groupBy({ by: ["provider", "status"], _count: { _all: true } }),
    prisma.review.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.$queryRawUnsafe(
      `select count(*)::int as products_with_ratings
         from (select "productId" from "Review" where status = 'APPROVED' group by "productId") t`
    )
  ]);

  const orphans = await prisma.$queryRawUnsafe(
    `select
       (select count(*)::int from "Payment" p where not exists (select 1 from "Order" o where o.id = p."orderId")) as orphan_payments,
       (select count(*)::int from "OrderItem" i where not exists (select 1 from "Order" o where o.id = i."orderId")) as orphan_items,
       (select count(*)::int from "Review" r where not exists (select 1 from "Order" o where o.id = r."orderId")) as orphan_reviews`
  );

  console.log(
    JSON.stringify(
      {
        ledger: ledger[0],
        orders,
        payments,
        reviews,
        productsWithApprovedRatings: approvedRatings[0].products_with_ratings,
        orphans: orphans[0]
      },
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      1
    )
  );
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
