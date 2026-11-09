/**
 * Read-only forensic audit of the NaijaShop catalogue and commerce state.
 * Writes nothing. Usage: npx tsx scripts/naijashop-catalogue-audit.ts
 */
import { prisma } from "../lib/prisma";

const databaseUrl = process.env.DATABASE_URL ?? "";
const dbName = (() => {
  try {
    return new URL(databaseUrl).pathname.replace(/^\//, "");
  } catch {
    return "unknown";
  }
})();

async function main() {
  const [
    products,
    bySample,
    byStatus,
    byVendorStatus,
    vendors,
    stock,
    images,
    orders,
    ordersByStatus,
    deliveries,
    reviews,
    reviewsByStatus,
    payments,
    escrow
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.groupBy({ by: ["isSample"], _count: { _all: true } }),
    prisma.product.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.product.groupBy({ by: ["isSample", "status"], _count: { _all: true } }),
    prisma.vendor.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.inventoryStock.aggregate({ _sum: { quantity: true, reserved: true } }),
    prisma.productImage.count(),
    prisma.order.count(),
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.delivery.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.review.count(),
    prisma.review.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.payment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.escrowHold.groupBy({ by: ["status"], _count: { _all: true } })
  ]);

  // What a shopper can actually buy today.
  const purchasable = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      vendor: { status: "VERIFIED" },
      isSample: false,
      stock: { quantity: { gt: 0 } }
    },
    select: { name: true, slug: true, priceKobo: true, stock: { select: { quantity: true, reserved: true } } },
    take: 10
  });

  const nonSampleActive = await prisma.product.findMany({
    where: { status: "ACTIVE", isSample: false },
    select: { name: true, slug: true, vendor: { select: { name: true, status: true } }, stock: { select: { quantity: true } } },
    take: 20
  });

  const audit = {
    database: { name: dbName, classification: process.env.DATABASE_ENV ?? "(not labelled; project treats it as TEST)" },
    products: {
      total: products,
      bySample,
      byStatus,
      bySampleAndStatus: bySampleAndStatusLabel(byStatus, bySample)
    },
    sellers: { byStatus: vendors },
    inventory: { quantity: stock._sum.quantity ?? 0, reserved: stock._sum.reserved ?? 0 },
    images: { productImages: images },
    orders: { total: orders, byStatus: ordersByStatus },
    deliveries: { byStatus: deliveries },
    reviews: { total: reviews, byStatus: reviewsByStatus },
    payments: { byStatus: payments },
    escrow: { byStatus: escrow },
    purchasableByShopper: purchasable.length,
    purchasableSample: purchasable,
    nonSampleActive: nonSampleActive
  };
  // BigInt money fields need stringifying before logging.
  console.log(JSON.stringify(audit, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 1));
  await prisma.$disconnect();
}

function bySampleAndStatusLabel(_status: unknown, _sample: unknown) {
  return undefined;
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
