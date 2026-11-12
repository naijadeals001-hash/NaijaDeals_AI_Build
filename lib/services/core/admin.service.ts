import type { DeliveryStatus, OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import type { SessionUser } from "@/lib/auth/session";
import { hasPermission, unheldPermissions } from "@/lib/auth/permissions";
import { assertRegion } from "@/lib/auth/scope";
import { recordAudit } from "./audit.service";
import { isCityActivated } from "./city.service";
import { notifyUser, notifyVendorOwner } from "./notification.service";
import { recordSystemEvent } from "./event.service";
import { updateDeliveryStatus } from "./delivery.service";
import {
  assertNoBlockingRefundObligation,
  classifyDeliveryCustody,
  loadOrderRefundState,
  lockOrderRow,
  updateOrderStatus
} from "./order.service";
import {
  cancelUnpaidOrderTx,
  needsRefundClosure
} from "./checkout.service";
import { refundPayment } from "@/lib/payments/service";
import { ensureWallet, listPaymentMethods } from "@/lib/payments/service";
import { assertLiveFinancialOperations } from "@/lib/payments/boundary";

const deliverySequence: DeliveryStatus[] = ["assigned", "pickup_started", "picked_up", "in_transit", "delivered"];

const orderDeliveryTarget: Partial<Record<OrderStatus, DeliveryStatus>> = {
  courier_assigned: "assigned",
  picked_up: "picked_up",
  in_transit: "in_transit",
  delivered: "delivered",
  completed: "delivered"
};

export async function getAdminOverview() {
  const [
    users,
    vendors,
    products,
    orders,
    paidOrders,
    pendingApplications,
    lowStock,
    openReturns,
    disputes,
    auditLogs,
    completedPayments,
    refunds,
    escrowHeld
  ] = await Promise.all([
    prisma.user.count(),
    prisma.vendor.count(),
    prisma.product.count(),
    prisma.order.count(),
    prisma.order.count({ where: { paymentStatus: "paid" } }),
    prisma.sellerApplication.count({ where: { status: "SUBMITTED" } }),
    prisma.inventoryStock.count({ where: { quantity: { lte: 3 } } }),
    prisma.returnRequest.count({ where: { status: { in: ["REQUESTED", "APPROVED", "RECEIVED"] } } }),
    prisma.dispute.count({ where: { status: { notIn: ["resolved_refund", "resolved_release", "rejected"] } } }),
    prisma.auditLog.count(),
    prisma.payment.aggregate({ where: { status: "COMPLETED" }, _sum: { amountKobo: true }, _count: true }),
    prisma.payment.aggregate({ where: { status: "REFUNDED" }, _sum: { amountKobo: true }, _count: true }),
    prisma.escrowHold.aggregate({ where: { status: "held" }, _sum: { amountKobo: true } })
  ]);

  const byStatus = await prisma.order.groupBy({ by: ["status"], _count: true });
  const paymentMethods = listPaymentMethods("NG");

  return {
    users,
    vendors,
    products,
    orders,
    paidOrders,
    pendingApplications,
    lowStock,
    openReturns,
    disputes,
    auditLogs,
    grossVerifiedKobo: (completedPayments._sum.amountKobo ?? BigInt(0)).toString(),
    completedPaymentCount: completedPayments._count,
    refundedKobo: (refunds._sum.amountKobo ?? BigInt(0)).toString(),
    refundCount: refunds._count,
    escrowHeldKobo: (escrowHeld._sum.amountKobo ?? BigInt(0)).toString(),
    ordersByStatus: byStatus.map((row) => ({ status: row.status, count: row._count })),
    paymentMethods
  };
}

export async function getAdminOrders(scope: { countryCode?: string } = {}) {
  return prisma.order.findMany({
    where: scope.countryCode ? { countryCode: scope.countryCode } : undefined,
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
      vendor: true,
      items: true,
      deliveries: { include: { trackingEvents: true, courier: true } },
      payments: true,
      returnRequests: true
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });
}

type AdminClosureResult = {
  orderId: string;
  refundedKobo?: string;
  totalRefundedKobo?: string;
  refundId?: string;
  status?: string;
  restocked?: boolean;
  deliveryCustody?: string | null;
  deliveryOutcomes?: unknown[];
  duplicate?: boolean;
  alreadyRefunded?: boolean;
  closure?: {
    remainingRefundableKobo: string;
    restockRequested: boolean;
    restockable: boolean;
    custody: string;
    orderStatus: string;
    paymentStatus: string;
  };
};

async function recordAdminClosure(input: {
  adminId: string;
  order: { id: string; orderNumber: string; status: string; paymentStatus: string };
  reason: string;
  remainingKobo: bigint;
  custody: { custody: string; restockable: boolean };
  refundedKobo: string;
}) {
  await prisma.$transaction(async (tx) => {
    const action = await tx.adminAction.create({
      data: {
        adminId: input.adminId,
        action: "admin.order_refunded",
        entity: "Order",
        entityId: input.order.id,
        metadata: {
          orderNumber: input.order.orderNumber,
          before: { status: input.order.status, paymentStatus: input.order.paymentStatus },
          after: { status: "refunded", paymentStatus: "refunded" },
          remainingRefundableKobo: input.remainingKobo.toString(),
          refundedKobo: input.refundedKobo,
          deliveryCustody: input.custody.custody,
          restockable: input.custody.restockable,
          reason: input.reason
        }
      }
    });
    await recordSystemEvent({
      tx,
      type: "admin.order_refunded",
      actorId: input.adminId,
      entity: "AdminAction",
      entityId: action.id,
      payload: {
        orderId: input.order.id,
        remainingRefundableKobo: input.remainingKobo.toString(),
        deliveryCustody: input.custody.custody
      }
    });
    await recordAudit({
      tx,
      actorId: input.adminId,
      action: "admin.order_refunded",
      entity: "AdminAction",
      entityId: action.id,
      metadata: {
        orderId: input.order.id,
        before: { status: input.order.status, paymentStatus: input.order.paymentStatus },
        after: { status: "refunded", paymentStatus: "refunded" },
        remainingRefundableKobo: input.remainingKobo.toString(),
        deliveryCustody: input.custody.custody,
        restockable: input.custody.restockable,
        note: input.reason
      }
    });
  });
}

/**
 * Close a paid or partially-refunded order by refunding the remaining balance.
 *
 * The remaining amount is computed server-side from the order's reservation and
 * settled refunds, never from a client amount. Any pending or contradicted
 * claim blocks the closure so an administrator cannot silently strand an
 * external refund. Stock is restored only when the physical custody decision
 * says the goods are back with (or never left) the seller; the refund
 * settlement re-checks that under the order lock.
 */
async function closeOrderWithRefund(input: {
  adminId: string;
  orderId: string;
  reason: string;
}): Promise<AdminClosureResult> {
  const pre = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { payments: true }
  });
  if (!pre) throw new ApiError(404, "order_not_found", "Order not found.");
  if (pre.paymentStatus === "refunded") {
    return {
      orderId: pre.id,
      refundedKobo: "0",
      totalRefundedKobo: pre.totalKobo.toString(),
      duplicate: true,
      alreadyRefunded: true,
      closure: {
        remainingRefundableKobo: "0",
        restockRequested: false,
        restockable: false,
        custody: "closed",
        orderStatus: pre.status,
        paymentStatus: pre.paymentStatus
      }
    };
  }

  const refundState = await loadOrderRefundState(prisma, pre.id);
  // Fail closed on a pending provider claim, a lost reservation, an excess
  // claim or a failed claim whose lifecycle says the provider may have paid.
  assertNoBlockingRefundObligation(refundState);

  const remainingKobo = pre.totalKobo - refundState.claimedKobo;
  if (remainingKobo <= BigInt(0)) {
    throw new ApiError(
      409,
      "already_refunded",
      "This order has no refundable balance left. Reconcile its payment status before closing it."
    );
  }

  const deliveries = await prisma.delivery.findMany({
    where: { orderId: pre.id },
    select: { status: true }
  });
  const custody = classifyDeliveryCustody(deliveries.map((delivery) => delivery.status));

  try {
    const result = await refundPayment({
      orderId: pre.id,
      actorId: input.adminId,
      reason: input.reason,
      amountKobo: remainingKobo,
      restock: custody.restockable
    });
    await recordAdminClosure({
      adminId: input.adminId,
      order: { id: pre.id, orderNumber: pre.orderNumber, status: pre.status, paymentStatus: pre.paymentStatus },
      reason: input.reason,
      remainingKobo,
      custody,
      refundedKobo: result.refundedKobo
    });
    return {
      ...result,
      closure: {
        remainingRefundableKobo: remainingKobo.toString(),
        restockRequested: custody.restockable,
        restockable: custody.restockable,
        custody: custody.custody,
        orderStatus: "refunded",
        paymentStatus: "refunded"
      }
    };
  } catch (error) {
    // A concurrent closure may have refunded the last balance between the read
    // and the lock. That is the same operation completing, not a new failure.
    if (error instanceof ApiError && ["already_refunded", "refund_conflict"].includes(error.code)) {
      const fresh = await prisma.order.findUnique({ where: { id: pre.id } });
      if (fresh?.paymentStatus === "refunded" || fresh?.status === "refunded") {
        return {
          orderId: pre.id,
          refundedKobo: "0",
          totalRefundedKobo: fresh.totalKobo.toString(),
          duplicate: true,
          alreadyRefunded: true,
          closure: {
            remainingRefundableKobo: "0",
            restockRequested: false,
            restockable: false,
            custody: "closed",
            orderStatus: fresh.status,
            paymentStatus: fresh.paymentStatus
          }
        };
      }
    }
    throw error;
  }
}

export async function adminUpdateOrderStatus(input: {
  adminId: string;
  orderId: string;
  status: OrderStatus;
  note?: string;
  /**
   * Session actor for route callers. When supplied, the service re-checks the
   * `orders:write` permission and the order's region itself instead of relying
   * only on the HTTP route. Scripts and internal acceptance fixtures may omit
   * it because they run without a session.
   */
  actor?: SessionUser;
}) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { payments: true }
  });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");

  if (input.actor) {
    if (!hasPermission(input.actor, "orders:write")) {
      throw new ApiError(403, "permission_denied", 'The "orders:write" permission is required for this action.');
    }
    if (input.actor.id !== input.adminId) {
      throw new ApiError(400, "actor_mismatch", "The acting administrator does not match the supplied adminId.");
    }
    assertRegion(input.actor, { countryCode: order.countryCode });
  }

  const note = input.note?.trim();
  const reason = note || (input.status === "cancelled" ? "Administrator cancelled the order." : "Administrator refund.");

  // One locked decision, then the refund (if any) in its own transaction.
  // `refundPayment` cannot be nested in this transaction because it owns the
  // order lock and provider calls; the decision transaction therefore only
  // classifies the order and never edits money.
  const plan = await prisma.$transaction(async (tx) => {
    await lockOrderRow(tx, input.orderId);
    const current = await tx.order.findUniqueOrThrow({ where: { id: input.orderId }, include: { payments: true } });

    if ((input.status === "refunded" || input.status === "cancelled") && needsRefundClosure(current)) {
      return { kind: "refund" as const, status: current.status, paymentStatus: current.paymentStatus };
    }
    if (input.status === "refunded" && (current.paymentStatus === "refunded" || current.status === "refunded")) {
      // A replay of a completed closure reports the existing outcome instead of
      // pretending there is no payment to refund.
      return { kind: "refund" as const, status: current.status, paymentStatus: current.paymentStatus };
    }
    if (input.status === "refunded") {
      throw new ApiError(409, "not_paid", "Only a paid order can be refunded. Cancel the unpaid order instead.");
    }
    if (input.status === "cancelled") {
      const cancelled = await cancelUnpaidOrderTx(tx, {
        orderId: current.id,
        actorId: input.adminId,
        reason
      });
      await recordAdminStatusAction(tx, {
        adminId: input.adminId,
        order: current,
        target: input.status,
        note,
        action: "admin.order_cancelled"
      });
      return { kind: "cancelled" as const, order: cancelled };
    }

    const updated = await updateOrderStatus({
      tx,
      actorId: input.adminId,
      orderId: input.orderId,
      status: input.status,
      note
    });
    await syncDeliveryForOrderStatus(tx, input.adminId, input.orderId, input.status);
    await recordAdminStatusAction(tx, {
      adminId: input.adminId,
      order: current,
      target: input.status,
      note,
      action: "admin.order_status_updated"
    });
    return { kind: "status" as const, order: updated };
  });

  if (plan.kind === "refund") {
    return closeOrderWithRefund({
      adminId: input.adminId,
      orderId: input.orderId,
      reason
    });
  }
  return plan.order;
}

async function recordAdminStatusAction(
  tx: Prisma.TransactionClient,
  input: {
    adminId: string;
    order: { id: string; status: string };
    target: OrderStatus;
    note?: string;
    action: string;
  }
) {
  const action = await tx.adminAction.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      entity: "Order",
      entityId: input.order.id,
      metadata: { before: { status: input.order.status }, after: { status: input.target }, note: input.note ?? null }
    }
  });
  await recordSystemEvent({
    tx,
    type: "admin.action_logged",
    actorId: input.adminId,
    entity: "AdminAction",
    entityId: action.id,
    payload: { orderId: input.order.id, status: input.target }
  });
  await recordAudit({
    tx,
    actorId: input.adminId,
    action: "admin.action_logged",
    entity: "AdminAction",
    entityId: action.id,
    metadata: {
      orderId: input.order.id,
      before: { status: input.order.status },
      after: { status: input.target },
      note: input.note ?? null
    }
  });
}

async function syncDeliveryForOrderStatus(tx: Prisma.TransactionClient, actorId: string, orderId: string, status: OrderStatus) {
  const target = orderDeliveryTarget[status];
  if (!target) return;

  const delivery = await tx.delivery.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
  if (!delivery) return;
  if (delivery.status === target) return;

  const currentIndex = deliverySequence.indexOf(delivery.status);
  const targetIndex = deliverySequence.indexOf(target);
  if (currentIndex === -1 || targetIndex === -1 || targetIndex <= currentIndex) return;

  for (const nextStatus of deliverySequence.slice(currentIndex + 1, targetIndex + 1)) {
    await updateDeliveryStatus({
      tx,
      actorId,
      deliveryId: delivery.id,
      status: nextStatus,
      note: `Synced from admin order status ${status}.`
    });
  }
}


export async function setCourierStatus(input: {
  adminId: string;
  courierId: string;
  active: boolean;
  reason?: string;
}) {
  const courier = await prisma.courier.findUnique({ where: { id: input.courierId } });
  if (!courier) throw new ApiError(404, "courier_not_found", "Courier not found.");
  const reason = input.reason?.trim() ?? "";
  if (!input.active && reason.length === 0) {
    throw new ApiError(400, "reason_required", "A suspension reason is required.");
  }
  if (courier.active === input.active) return courier;

  const updated = await prisma.courier.update({
    where: { id: courier.id },
    data: { active: input.active, suspendedReason: input.active ? null : reason }
  });
  await recordAudit({
    actorId: input.adminId,
    action: "courier.status_changed",
    entity: "Courier",
    entityId: courier.id,
    metadata: {
      before: { active: courier.active, suspendedReason: courier.suspendedReason },
      after: { active: updated.active, suspendedReason: updated.suspendedReason }
    }
  });
  await notifyUser({
    userId: courier.userId,
    kind: updated.active ? "courier_reactivated" : "courier_suspended",
    title: updated.active ? "Courier account reactivated" : "Courier account suspended",
    body: updated.active ? "You can receive new deliveries again." : updated.suspendedReason,
    href: "/courier"
  });
  return updated;
}

export async function setDriverStatus(input: {
  adminId: string;
  userId: string;
  status: "approved" | "suspended";
  reason?: string;
}) {
  const profile = await prisma.driverProfile.findUnique({ where: { userId: input.userId } });
  if (!profile) throw new ApiError(404, "driver_not_found", "Driver profile not found.");
  if (profile.status === "pending") {
    throw new ApiError(409, "driver_pending", "Pending drivers are approved through onboarding before suspension.");
  }
  if (profile.status === input.status) return profile;
  const reason = input.reason?.trim() ?? "";
  if (input.status === "suspended" && reason.length === 0) {
    throw new ApiError(400, "reason_required", "A suspension reason is required.");
  }

  const updated = await prisma.driverProfile.update({
    where: { id: profile.id },
    data: {
      status: input.status,
      active: input.status === "approved",
      suspendedReason: input.status === "suspended" ? reason : null
    }
  });
  await recordAudit({
    actorId: input.adminId,
    action: "driver.status_changed",
    entity: "DriverProfile",
    entityId: profile.id,
    metadata: {
      before: { status: profile.status, active: profile.active, suspendedReason: profile.suspendedReason },
      after: { status: updated.status, active: updated.active, suspendedReason: updated.suspendedReason }
    }
  });
  await notifyUser({
    userId: profile.userId,
    kind: input.status === "suspended" ? "driver_suspended" : "driver_reactivated",
    title: input.status === "suspended" ? "Driver account suspended" : "Driver account reactivated",
    body: input.status === "suspended" ? reason : "You can accept new rides again.",
    href: "/driver"
  });
  return updated;
}

export async function setVendorStatus(input: {
  adminId: string;
  vendorId: string;
  status: "VERIFIED" | "SUSPENDED";
  reason?: string;
}) {
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) throw new ApiError(404, "vendor_not_found", "Vendor not found.");
  if (vendor.status === "PENDING") {
    throw new ApiError(409, "vendor_pending", "Pending vendors are approved through seller applications.");
  }
  if (vendor.status === input.status) return vendor;
  const reason = input.reason?.trim() ?? "";
  if (input.status === "SUSPENDED" && reason.length === 0) {
    throw new ApiError(400, "reason_required", "A suspension reason is required.");
  }

  const updated = await prisma.vendor.update({
    where: { id: vendor.id },
    data: { status: input.status, suspendedReason: input.status === "SUSPENDED" ? reason : null }
  });

  await recordAudit({
    actorId: input.adminId,
    action: "vendor.status_changed",
    entity: "Vendor",
    entityId: vendor.id,
    metadata: {
      before: { status: vendor.status, suspendedReason: vendor.suspendedReason },
      after: { status: updated.status, suspendedReason: updated.suspendedReason }
    }
  });
  await notifyVendorOwner({
    vendorId: vendor.id,
    kind: updated.status === "SUSPENDED" ? "vendor_suspended" : "vendor_reactivated",
    title: updated.status === "SUSPENDED" ? "Seller account suspended" : "Seller account reactivated",
    body: updated.status === "SUSPENDED" ? updated.suspendedReason : "You can create listings and take orders again.",
    href: "/seller"
  });
  return updated;
}

export async function getAdminDisputes(scope: { countryCode?: string } = {}) {
  return prisma.dispute.findMany({
    where: scope.countryCode ? { order: { countryCode: scope.countryCode } } : undefined,
    include: {
      order: { select: { id: true, orderNumber: true, totalKobo: true, currency: true, status: true, paymentStatus: true, countryCode: true } },
      customer: { select: { id: true, name: true, email: true } },
      vendor: { select: { id: true, name: true } },
      escrow: { select: { id: true, status: true, amountKobo: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });
}

export async function getAuditLogs() {
  return prisma.auditLog.findMany({
    include: { actor: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200
  });
}

export async function listSellerApplications(scope: { countryCode?: string } = {}) {
  return prisma.sellerApplication.findMany({
    where: scope.countryCode ? { countryCode: scope.countryCode } : undefined,
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: { createdAt: "desc" }
  });
}

export async function reviewSellerApplication(input: {
  adminId: string;
  applicationId: string;
  decision: "approve" | "reject";
  note?: string;
}) {
  const application = await prisma.sellerApplication.findUnique({
    where: { id: input.applicationId },
    include: { user: true }
  });
  if (!application) throw new ApiError(404, "application_not_found", "Seller application not found.");
  if (application.status !== "SUBMITTED") throw new ApiError(409, "already_reviewed", "This application has already been reviewed.");

  if (input.decision === "reject") {
    const rejected = await prisma.sellerApplication.update({
      where: { id: application.id },
      data: { status: "REJECTED", note: input.note ?? "Application rejected by administrator.", reviewedAt: new Date() }
    });
    await notifyUser({
      userId: application.userId,
      kind: "application_rejected",
      title: "Seller application rejected",
      body: rejected.note ?? "Your seller application was rejected.",
      href: "/sell"
    });
    return rejected;
  }

  const baseSlug = application.businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "seller";
  let slug = baseSlug;
  let suffix = 0;
  while (await prisma.vendor.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  return prisma.$transaction(async (tx) => {
    const vendor = await tx.vendor.create({
      data: {
        ownerId: application.userId,
        name: application.businessName,
        slug,
        market: application.market,
        countryCode: application.countryCode,
        pickupAddress: application.pickupAddress,
        pickupPhone: application.phone,
        status: "VERIFIED",
        trustScore: 60
      }
    });
    const vendorRole = await tx.role.upsert({
      where: { name: "vendor" },
      update: {},
      create: { name: "vendor", description: "Seller operator" }
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: application.userId, roleId: vendorRole.id } },
      update: {},
      create: { userId: application.userId, roleId: vendorRole.id }
    });
    await tx.user.update({ where: { id: application.userId }, data: { actorType: "VENDOR" } });
    await ensureWallet(tx, { vendorId: vendor.id, ownerType: "VENDOR" });
    const reviewed = await tx.sellerApplication.update({
      where: { id: application.id },
      data: { status: "APPROVED", note: input.note ?? "Approved by administrator.", reviewedAt: new Date() }
    });
    await notifyUser({
      tx,
      userId: application.userId,
      kind: "application_approved",
      title: "Seller application approved",
      body: `${vendor.name} is now live in the seller hub.`,
      href: "/seller"
    });
    await recordAudit({
      tx,
      actorId: input.adminId,
      action: "seller.approved",
      entity: "Vendor",
      entityId: vendor.id,
      metadata: { applicationId: application.id, userId: application.userId }
    });
    return { application: reviewed, vendor };
  });
}

export async function moderateProduct(input: { adminId: string; productId: string; status: "ACTIVE" | "SUSPENDED" | "ARCHIVED"; note?: string }) {
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new ApiError(404, "product_not_found", "Product not found.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id: product.id },
      data: { status: input.status, moderationNote: input.note ?? null }
    });
    await recordAudit({
      tx,
      actorId: input.adminId,
      action: "product.moderated",
      entity: "Product",
      entityId: product.id,
      metadata: { before: product.status, after: input.status, note: input.note ?? null }
    });
    return updated;
  });
}


export async function listAdminEscrowHolds() {
  return prisma.escrowHold.findMany({
    include: {
      order: { select: { orderNumber: true, status: true, customer: { select: { name: true, email: true } }, vendor: { select: { name: true } } } },
      events: { orderBy: { createdAt: "desc" }, take: 1 }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });
}

export async function listAdminPayments() {
  return prisma.payment.findMany({
    include: { order: { select: { orderNumber: true, vendor: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 200
  });
}

export async function assignCourier(input: { adminId: string; deliveryId: string; courierId: string }) {
  const [delivery, courier] = await Promise.all([
    prisma.delivery.findUnique({ where: { id: input.deliveryId }, include: { order: true } }),
    prisma.courier.findUnique({
      where: { id: input.courierId },
      include: { user: { select: { verifiedAt: true, actorType: true } } }
    })
  ]);
  if (!delivery) throw new ApiError(404, "delivery_not_found", "Delivery not found.");
  if (["delivered", "returned", "cancelled"].includes(delivery.status)) {
    throw new ApiError(409, "delivery_closed", "This delivery is already closed and cannot be assigned.");
  }
  if (!courier || !courier.active) {
    throw new ApiError(
      409,
      "courier_suspended",
      courier?.suspendedReason ? `Courier suspended: ${courier.suspendedReason}` : "Courier is not active and cannot take new deliveries."
    );
  }
  // `verifiedAt` is the account approval record. An unverified courier profile
  // must never receive customer deliveries, even if an administrator sends its
  // identifier directly to the API.
  if (!courier.user.verifiedAt) {
    throw new ApiError(
      409,
      "courier_unapproved",
      "This courier account has not been approved. Verify the account before assigning deliveries."
    );
  }
  if (!["ready_for_pickup", "courier_assigned"].includes(delivery.order.status)) {
    throw new ApiError(409, "seller_not_ready", "The seller must mark the order ready for pickup before a courier is assigned.");
  }

  return prisma.$transaction(async (tx) => {
    // Lock the order before the delivery, matching refundPayment's order ->
    // delivery lock order. A refund that commits first is visible here and
    // refuses the assignment instead of leaving a cancelled delivery assigned
    // (or deadlocking the two transactions).
    const lockedOrder = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM "Order" WHERE id = ${delivery.orderId} FOR UPDATE
    `;
    if (!lockedOrder[0]) throw new ApiError(404, "order_not_found", "Order not found.");
    if (["cancelled", "refunded"].includes(lockedOrder[0].status)) {
      throw new ApiError(409, "order_closed", "This order is closed and cannot be assigned.");
    }
    if (!["ready_for_pickup", "courier_assigned"].includes(lockedOrder[0].status)) {
      throw new ApiError(409, "seller_not_ready", "The seller must mark the order ready for pickup before a courier is assigned.");
    }

    const lockedDelivery = await tx.$queryRaw<Array<{ status: string; courierId: string | null }>>`
      SELECT status, "courierId" FROM "Delivery" WHERE id = ${delivery.id} FOR UPDATE
    `;
    const current = lockedDelivery[0];
    if (!current) throw new ApiError(404, "delivery_not_found", "Delivery not found.");
    if (["delivered", "returned", "cancelled"].includes(current.status)) {
      throw new ApiError(409, "delivery_closed", "This delivery is already closed and cannot be assigned.");
    }

    const previousCourierId = current.courierId;
    const assigned = await tx.delivery.updateMany({
      where: {
        id: delivery.id,
        status: { in: ["pending_assignment", "assigned", "pickup_started", "picked_up", "in_transit", "delivery_attempted", "failed"] }
      },
      data: { courierId: courier.id }
    });
    if (assigned.count !== 1) {
      throw new ApiError(409, "delivery_closed", "This delivery closed before it could be assigned.");
    }
    await notifyUser({
      tx,
      userId: courier.userId,
      kind: "delivery_assigned",
      title: "New delivery assigned",
      body: `${delivery.order.orderNumber}: ${delivery.pickupAddress} → ${delivery.dropoffAddress}`,
      href: "/courier"
    });
    if (current.status === "pending_assignment" || current.status === "failed") {
      await updateDeliveryStatus({ tx, actorId: input.adminId, deliveryId: delivery.id, status: "assigned", note: `Assigned to ${courier.name}.` });
    }
    if (lockedOrder[0].status === "ready_for_pickup") {
      await updateOrderStatus({ tx, actorId: input.adminId, orderId: delivery.orderId, status: "courier_assigned", note: `Courier ${courier.name} assigned.` });
    }
    const updated = await tx.delivery.findUniqueOrThrow({ where: { id: delivery.id }, include: { courier: true } });
    await recordAudit({
      tx,
      actorId: input.adminId,
      action: "delivery.courier_assigned",
      entity: "Delivery",
      entityId: delivery.id,
      metadata: {
        orderNumber: delivery.order.orderNumber,
        courierId: courier.id,
        courierName: courier.name,
        previousCourierId,
        before: { courierId: previousCourierId, status: current.status },
        after: { courierId: courier.id, status: updated.status }
      }
    });
    return updated;
  });
}

export async function listCouriers() {
  return prisma.courier.findMany({
    include: {
      user: { select: { name: true, email: true, verifiedAt: true, actorType: true } }
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function createPayout(input: { adminId: string; vendorId: string; periodStart: Date; periodEnd: Date }) {
  await assertLiveFinancialOperations("Vendor payout creation");
  const orders = await prisma.order.findMany({
    where: {
      vendorId: input.vendorId,
      paymentStatus: "paid",
      createdAt: { gte: input.periodStart, lte: input.periodEnd }
    }
  });
  if (orders.length === 0) throw new ApiError(400, "no_orders", "No paid orders in this period.");
  const gross = orders.reduce((total, order) => total + order.subtotalKobo, BigInt(0));
  const commission = orders.reduce((total, order) => total + order.commissionKobo, BigInt(0));
  const amount = gross - commission;
  if (amount <= BigInt(0)) throw new ApiError(400, "no_payable", "Nothing payable for this period.");

  const reference = `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  return prisma.$transaction(async (tx) => {
    const payout = await tx.payout.create({
      data: {
        vendorId: input.vendorId,
        amountKobo: amount,
        status: "PENDING",
        reference,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd
      }
    });
    await recordAudit({
      tx,
      actorId: input.adminId,
      action: "payout.created",
      entity: "Payout",
      entityId: payout.id,
      metadata: { vendorId: input.vendorId, amountKobo: amount.toString(), orderCount: orders.length }
    });
    return payout;
  });
}

export async function markPayoutPaid(input: { adminId: string; payoutId: string }) {
  await assertLiveFinancialOperations("Vendor payout settlement");
  const payout = await prisma.payout.findUnique({ where: { id: input.payoutId } });
  if (!payout) throw new ApiError(404, "payout_not_found", "Payout not found.");
  if (payout.status === "PAID") return payout;
  return prisma.$transaction(async (tx) => {
    // Claim the payout atomically so concurrent/repeated calls settle it once.
    // Only PENDING/APPROVED payouts are eligible. REJECTED payouts are terminal
    // and an already-PAID payout is returned without touching the wallet.
    const claim = await tx.payout.updateMany({
      where: { id: payout.id, status: { in: ["PENDING", "APPROVED"] } },
      data: { status: "PAID", paidAt: new Date() }
    });
    if (claim.count === 0) {
      const current = await tx.payout.findUniqueOrThrow({ where: { id: payout.id } });
      if (current.status === "REJECTED") throw new ApiError(409, "payout_not_eligible", "A rejected payout cannot be paid.");
      return current;
    }

    // The wallet debit is conditional: a payout can never push the vendor balance negative.
    const debit = await tx.wallet.updateMany({
      where: { vendorId: payout.vendorId, availableKobo: { gte: payout.amountKobo } },
      data: { availableKobo: { decrement: payout.amountKobo } }
    });
    if (debit.count === 0) {
      throw new ApiError(409, "insufficient_wallet", "Vendor available balance does not cover this payout.");
    }

    const vendorWallet = await tx.wallet.findFirstOrThrow({ where: { vendorId: payout.vendorId } });
    const systemWallet = (await tx.wallet.findFirst({ where: { ownerType: "SYSTEM" } })) ??
      (await tx.wallet.create({ data: { ownerType: "SYSTEM", availableKobo: BigInt(0), heldKobo: BigInt(0) } }));
    await tx.wallet.update({ where: { id: systemWallet.id }, data: { availableKobo: { increment: payout.amountKobo } } });
    await tx.walletTransaction.create({
      data: {
        walletId: vendorWallet.id,
        type: "payout",
        amountKobo: payout.amountKobo,
        reference: `PAYOUT-${payout.reference}`,
        description: `Payout ${payout.reference} settled to vendor`,
        ledger: {
          create: [
            { walletId: vendorWallet.id, direction: "DEBIT", amountKobo: payout.amountKobo, memo: "Vendor payout debited" },
            { walletId: systemWallet.id, direction: "CREDIT", amountKobo: payout.amountKobo, memo: "Payout clearing credit" }
          ]
        }
      }
    });

    const paid = await tx.payout.findUniqueOrThrow({ where: { id: payout.id } });
    await recordAudit({
      tx,
      actorId: input.adminId,
      action: "payout.paid",
      entity: "Payout",
      entityId: payout.id,
      metadata: {
        vendorId: payout.vendorId,
        amountKobo: payout.amountKobo.toString(),
        before: { status: payout.status, paidAt: payout.paidAt?.toISOString() ?? null },
        after: { status: "PAID", paidAt: paid.paidAt?.toISOString() ?? null }
      }
    });
    return paid;
  });
}

export async function getAdminUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      actorType: true,
      phone: true,
      createdAt: true,
      scopeCountryCode: true,
      scopeCityCode: true,
      roles: { include: { role: true } },
      vendors: { select: { id: true, name: true, status: true } },
      driverProfile: { select: { id: true, status: true, active: true, suspendedReason: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });
}

export async function listAssignableRoles() {
  return prisma.role.findMany({
    select: { name: true, description: true },
    orderBy: { name: "asc" }
  });
}

const ROLE_NAMES = ["super_admin", "admin", "ops", "finance", "support", "moderator", "customer", "vendor", "courier", "driver"];

/**
 * Replace a user's roles and region scope.
 *
 * Invariants enforced inside one transaction, so a rejected write leaves no
 * partial state and no audit record:
 *  - only a holder of `roles:write` may call this (checked here as well as in the route);
 *  - an administrator cannot change their own roles;
 *  - an actor cannot delegate a permission they do not hold;
 *  - the last active super administrator cannot be demoted;
 *  - the change and its before/after audit record commit together.
 */
export async function setUserRoles(input: {
  actor: SessionUser;
  userId: string;
  roles: string[];
  scopeCountryCode?: string | null;
  scopeCityCode?: string | null;
}) {
  if (!hasPermission(input.actor, "roles:write")) {
    throw new ApiError(403, "permission_denied", "The \"roles:write\" permission is required for this action.");
  }
  if (input.actor.id === input.userId) {
    throw new ApiError(403, "self_escalation", "You cannot change your own roles or scope.");
  }

  const requested = [...new Set(input.roles.map((role) => role.trim()).filter(Boolean))];
  if (requested.length === 0) {
    throw new ApiError(400, "validation_error", "At least one role is required.");
  }
  const unknown = requested.filter((role) => !ROLE_NAMES.includes(role));
  if (unknown.length > 0) {
    throw new ApiError(400, "unknown_role", `Unknown role: ${unknown.join(", ")}.`);
  }

  if (input.scopeCountryCode && input.scopeCityCode) {
    const activated = await isCityActivated(input.scopeCountryCode, input.scopeCityCode);
    if (!activated) {
      throw new ApiError(409, "city_not_activated", `${input.scopeCityCode} is not activated for ${input.scopeCountryCode}.`);
    }
  }

  const escalated = unheldPermissions(input.actor, requested);
  if (escalated.length > 0) {
    throw new ApiError(403, "privilege_delegation_denied", `You cannot grant permissions you do not hold: ${escalated.join(", ")}.`);
  }

  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { roles: { include: { role: true } } }
  });
  if (!target) throw new ApiError(404, "user_not_found", "User not found.");

  const before = {
    roles: target.roles.map((entry) => entry.role.name).sort(),
    scopeCountryCode: target.scopeCountryCode,
    scopeCityCode: target.scopeCityCode
  };
  const after = {
    roles: [...requested].sort(),
    scopeCountryCode: input.scopeCountryCode === undefined ? target.scopeCountryCode : input.scopeCountryCode,
    scopeCityCode: input.scopeCityCode === undefined ? target.scopeCityCode : input.scopeCityCode
  };

  const removingSuperAdmin = before.roles.includes("super_admin") && !after.roles.includes("super_admin");

  const roles = await prisma.role.findMany({
    where: { name: { in: requested } },
    select: { id: true, name: true }
  });

  return prisma.$transaction(async (tx) => {
    if (removingSuperAdmin) {
      const remaining = await tx.userRole.count({
        where: { role: { name: "super_admin" }, userId: { not: input.userId } }
      });
      if (remaining === 0) {
        throw new ApiError(409, "last_super_admin", "The last active super administrator cannot be demoted.");
      }
    }

    await tx.userRole.deleteMany({ where: { userId: input.userId } });
    if (roles.length > 0) {
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId: input.userId, roleId: role.id }))
      });
    }
    await tx.user.update({
      where: { id: input.userId },
      data: { scopeCountryCode: after.scopeCountryCode, scopeCityCode: after.scopeCityCode }
    });

    await recordAudit({
      tx,
      actorId: input.actor.id,
      action: "admin.roles_updated",
      entity: "User",
      entityId: input.userId,
      metadata: {
        before: { roles: before.roles, scopeCountryCode: before.scopeCountryCode, scopeCityCode: before.scopeCityCode },
        after: { roles: after.roles, scopeCountryCode: after.scopeCountryCode, scopeCityCode: after.scopeCityCode }
      }
    });

    return tx.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        name: true,
        scopeCountryCode: true,
        scopeCityCode: true,
        roles: { include: { role: true } }
      }
    });
  });
}
