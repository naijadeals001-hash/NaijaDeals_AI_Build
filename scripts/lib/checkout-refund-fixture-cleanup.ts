import type { PrismaClient } from "@prisma/client";

/**
 * Remove only the fixtures created by one checkout/refund acceptance run.
 *
 * The new OrderItemRestock rows have a RESTRICT foreign key to OrderItem, so
 * cleanup must delete them before the order graph. All predicates are scoped
 * by the run's email/slug prefix; shared catalogues, wallets and operator rows
 * are never candidates.
 */
export async function cleanupCheckoutRefundFixtures(
  db: PrismaClient,
  runId: string,
  options: { disposeFinancial?: boolean } = {}
) {
  if (!options.disposeFinancial) {
    // Deleting journal rows while leaving the SYSTEM projection changed makes
    // later reconciliation fail. Never silently leave fixtures behind: require
    // an explicitly disposable database that the operator will drop.
    throw new Error(
      "financial fixture cleanup requires DISPOSABLE_TEST_DATABASE=1; use a disposable TEST database and drop it after the run"
    );
  }
  const emailPrefix = `crf-${runId}`.toLowerCase();
  const vendorPrefix = `crf-vendor-${runId}`.toLowerCase();
  const categoryPrefix = `crf-category-${runId}`.toLowerCase();
  const productPrefix = `crf-product-${runId}`.toLowerCase();
  const users = await db.user.findMany({
    where: { email: { startsWith: `${emailPrefix}-` } },
    select: { id: true }
  });
  const userIds = users.map((row) => row.id);
  const vendors = await db.vendor.findMany({
    where: { slug: { startsWith: `${vendorPrefix}-` } },
    select: { id: true }
  });
  const vendorIds = vendors.map((row) => row.id);
  const categories = await db.category.findMany({
    where: { slug: { startsWith: `${categoryPrefix}-` } },
    select: { id: true }
  });
  const categoryIds = categories.map((row) => row.id);
  const products = await db.product.findMany({
    where: { slug: { startsWith: `${productPrefix}-` } },
    select: { id: true }
  });
  const productIds = products.map((row) => row.id);
  const orders = await db.order.findMany({
    where: { OR: [{ customerId: { in: userIds } }, { vendorId: { in: vendorIds } }] },
    select: { id: true }
  });
  const orderIds = orders.map((row) => row.id);
  const carts = await db.cart.findMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        { items: { some: { productId: { in: productIds } } } }
      ]
    },
    select: { id: true }
  });
  const cartIds = carts.map((row) => row.id);
  const wallets = await db.wallet.findMany({
    where: { OR: [{ userId: { in: userIds } }, { vendorId: { in: vendorIds } }] },
    select: { id: true }
  });
  const walletIds = wallets.map((row) => row.id);
  const deliveries = await db.delivery.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true }
  });
  const deliveryIds = deliveries.map((row) => row.id);
  const escrows = await db.escrowHold.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true }
  });
  const escrowIds = escrows.map((row) => row.id);
  const transactions = await db.walletTransaction.findMany({
    where: { OR: [{ orderId: { in: orderIds } }, { walletId: { in: walletIds } }] },
    select: { id: true }
  });
  const transactionIds = transactions.map((row) => row.id);

  await db.$transaction(async (tx) => {
    await tx.orderItemRestock.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.trackingEvent.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
    await tx.delivery.deleteMany({ where: { id: { in: deliveryIds } } });
    await tx.escrowEvent.deleteMany({ where: { escrowId: { in: escrowIds } } });
    await tx.escrowHold.deleteMany({ where: { id: { in: escrowIds } } });
    await tx.refund.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.returnRequest.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.dispute.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.review.deleteMany({
      where: {
        OR: [
          { orderId: { in: orderIds } },
          { productId: { in: productIds } },
          { userId: { in: userIds } }
        ]
      }
    });
    await tx.orderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderAttribution.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.notificationAttempt.deleteMany({
      where: { notification: { userId: { in: userIds } } }
    });
    await tx.partnerNotification.deleteMany({ where: { userId: { in: userIds } } });
    await tx.notification.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { entityId: { in: orderIds } }] }
    });
    await tx.notificationIntent.deleteMany({
      where: { OR: [{ recipientUserId: { in: userIds } }, { entityId: { in: orderIds } }] }
    });
    await tx.ledgerEntry.deleteMany({
      where: { OR: [{ transactionId: { in: transactionIds } }, { walletId: { in: walletIds } }] }
    });
    await tx.walletTransaction.deleteMany({ where: { id: { in: transactionIds } } });
    await tx.walletTopUp.deleteMany({ where: { walletId: { in: walletIds } } });
    await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.order.deleteMany({ where: { id: { in: orderIds } } });
    await tx.cartItem.deleteMany({
      where: { OR: [{ cartId: { in: cartIds } }, { productId: { in: productIds } }] }
    });
    await tx.cart.deleteMany({ where: { id: { in: cartIds } } });
    await tx.productImage.deleteMany({ where: { productId: { in: productIds } } });
    await tx.inventoryStock.deleteMany({ where: { productId: { in: productIds } } });
    await tx.productVariant.deleteMany({ where: { productId: { in: productIds } } });
    await tx.product.deleteMany({ where: { id: { in: productIds } } });
    await tx.wallet.deleteMany({ where: { id: { in: walletIds } } });
    await tx.courier.deleteMany({ where: { userId: { in: userIds } } });
    await tx.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    await tx.category.deleteMany({ where: { id: { in: categoryIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
    await tx.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: userIds } },
          { entityId: { in: [...orderIds, ...productIds, ...vendorIds] } }
        ]
      }
    });
    await tx.systemEvent.deleteMany({
      where: {
        OR: [
          { actorId: { in: userIds } },
          { entityId: { in: [...orderIds, ...productIds, ...vendorIds] } }
        ]
      }
    });
  });

  return {
    users: userIds.length,
    vendors: vendorIds.length,
    categories: categoryIds.length,
    products: productIds.length,
    orders: orderIds.length,
    wallets: walletIds.length
  };
}
