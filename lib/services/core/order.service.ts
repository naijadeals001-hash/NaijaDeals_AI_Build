import type { EscrowHold, EscrowStatus, OrderStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "./audit.service";
import { enqueueVendorNotification } from "./notification.service";
import { notifyEscrowReleased, notifyOrderStatus } from "@/lib/notifications/domain-events";
import { recordSystemEvent } from "./event.service";
import { assertOrderTransition } from "./state-machines";
import { ensureWallet } from "@/lib/payments/service";

type Db = PrismaClient | Prisma.TransactionClient;

export async function getOrders(userId?: string) {
  return prisma.order.findMany({
    where: userId ? { customerId: userId } : undefined,
    include: {
      items: true,
      statusEvents: { orderBy: { createdAt: "asc" } },
      deliveries: { include: { trackingEvents: { orderBy: { createdAt: "asc" } } } },
      escrowHolds: true,
      payments: { select: { id: true, provider: true, status: true, amountKobo: true, verifiedAt: true } },
      vendor: { select: { id: true, name: true, market: true } },
      returnRequests: true,
      reviews: true
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function getOrder(id: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id },
    include: {
      items: true,
      statusEvents: { orderBy: { createdAt: "asc" } },
      deliveries: { include: { trackingEvents: { orderBy: { createdAt: "asc" } }, courier: true } },
      escrowHolds: { include: { events: true } },
      payments: true,
      vendor: true,
      customer: { select: { id: true, name: true, email: true, phone: true } },
      returnRequests: true,
      reviews: true
    }
  });
}

export async function updateOrderStatus(input: {
  tx?: Db;
  actorId?: string | null;
  orderId: string;
  status: OrderStatus;
  note?: string;
}) {
  const db = input.tx ?? prisma;
  const current = await db.order.findUniqueOrThrow({ where: { id: input.orderId } });
  assertOrderTransition(current.status, input.status);
  const order = await db.order.update({
    where: { id: input.orderId },
    data: {
      status: input.status,
      statusEvents: { create: { from: current.status, to: input.status, note: input.note } }
    },
    include: { statusEvents: true }
  });

  await recordSystemEvent({
    tx: db,
    type: "order.status_changed",
    actorId: input.actorId,
    entity: "Order",
    entityId: order.id,
    payload: { from: current.status, to: input.status }
  });
  await recordAudit({
    tx: db,
    actorId: input.actorId,
    action: "order.status_changed",
    entity: "Order",
    entityId: order.id,
    metadata: { from: current.status, to: input.status }
  });

  if (input.status === "vendor_notified") {
    // Durable outbox: the intent is written in this transaction, so a rollback
    // removes it and a committed payment always has exactly one delivery job.
    // No notification is sent while the financial transaction holds its
    // connection, which keeps connection_limit=1 pools deadlock-free.
    await enqueueVendorNotification({
      tx: db,
      vendorId: order.vendorId,
      eventType: "order.paid.vendor",
      dedupeKey: `order.paid.vendor:${order.id}`,
      entityType: "Order",
      entityId: order.id,
      orderNumber: order.orderNumber,
      href: "/seller"
    });
  }

  return order;
}

/**
 * The single refund-aware escrow release calculation.
 *
 * `EscrowHold.amountKobo` is frozen when payment is verified. Refunds settle
 * against that hold but leave the row at its original amount, so releasing
 * `escrow.amountKobo` after a refund pays out money the buyer already received
 * back. The seller's share is the unrefunded part of the frozen payable, using
 * the same cumulative proportional split as `allocateRefundShares`, never the
 * live fare/commission configuration.
 *
 * Two distinct quantities are often confused:
 *
 *  - `completedRefundKobo` is money that has actually moved back to the buyer
 *    (`Refund.status = COMPLETED`). Only this reduces the escrow obligation.
 *  - `Order.refundedKobo` additionally contains reserved, submitted and unknown
 *    external-refund claims. Those block release but have not moved money, so
 *    subtracting them here would understate the obligation and later strand the
 *    difference.
 *
 * `previouslyReleasedKobo` / `previouslyReleasedPayableKobo` make the function
 * safe if a release was ever posted in stages: only the unpaid remainder is
 * returned. There is no other approved allocation bucket, so
 * `otherAllocatedKobo` is always zero and the journal must allocate the whole
 * remaining obligation to the seller and the platform.
 */
export type EscrowReleaseObligation = {
  completedRefundKobo: bigint;
  /** Escrow still owed after completed refunds, before any earlier release. */
  escrowObligationKobo: bigint;
  previouslyReleasedKobo: bigint;
  previouslyReleasedPayableKobo: bigint;
  /** The part of the obligation this posting may still move. */
  remainingEscrowObligationKobo: bigint;
  vendorProceedsKobo: bigint;
  platformShareKobo: bigint;
  /** No other allocation policy exists; kept explicit so a future one is a decision. */
  otherAllocatedKobo: bigint;
  /** The amount this posting moves now. Always equals the remaining obligation. */
  totalReleasedKobo: bigint;
  /** @deprecated alias of `remainingEscrowObligationKobo`. */
  releasableKobo: bigint;
  /** @deprecated alias of `vendorProceedsKobo`. */
  payableKobo: bigint;
  /** @deprecated alias of `platformShareKobo`. */
  platformKobo: bigint;
};

export function releaseObligation(input: {
  escrowAmountKobo: bigint;
  orderTotalKobo: bigint;
  payableKobo: bigint;
  completedRefundKobo: bigint;
  previouslyReleasedKobo?: bigint;
  previouslyReleasedPayableKobo?: bigint;
}): EscrowReleaseObligation {
  const zero = BigInt(0);
  const nonNegative = (value: bigint) => (value > zero ? value : zero);
  const escrowAmountKobo = nonNegative(input.escrowAmountKobo);
  const orderTotalKobo = nonNegative(input.orderTotalKobo);
  const frozenPayableKobo = nonNegative(input.payableKobo);
  const completedRefundKobo = nonNegative(input.completedRefundKobo);
  const previouslyReleasedKobo = nonNegative(input.previouslyReleasedKobo ?? zero);
  const previouslyReleasedPayableKobo = nonNegative(input.previouslyReleasedPayableKobo ?? zero);

  const appliedRefundKobo = completedRefundKobo > escrowAmountKobo ? escrowAmountKobo : completedRefundKobo;
  const escrowObligationKobo = escrowAmountKobo - appliedRefundKobo;

  // The refund removes its proportional share of the frozen payable. Order and
  // escrow totals are the same amount in every current payment path; clamping
  // keeps legacy rows with a mismatched total from producing a negative share.
  const refundShareKobo =
    orderTotalKobo > zero && appliedRefundKobo > orderTotalKobo ? orderTotalKobo : appliedRefundKobo;
  const reversedPayableKobo =
    orderTotalKobo > zero ? (frozenPayableKobo * refundShareKobo) / orderTotalKobo : frozenPayableKobo;
  let payableAfterRefundsKobo = frozenPayableKobo - reversedPayableKobo;
  if (payableAfterRefundsKobo < zero) payableAfterRefundsKobo = zero;
  if (payableAfterRefundsKobo > escrowObligationKobo) payableAfterRefundsKobo = escrowObligationKobo;

  const appliedPriorReleaseKobo =
    previouslyReleasedKobo > escrowObligationKobo ? escrowObligationKobo : previouslyReleasedKobo;
  let remainingEscrowObligationKobo = escrowObligationKobo - appliedPriorReleaseKobo;
  if (remainingEscrowObligationKobo < zero) remainingEscrowObligationKobo = zero;

  const priorPayableKobo =
    previouslyReleasedPayableKobo > payableAfterRefundsKobo
      ? payableAfterRefundsKobo
      : previouslyReleasedPayableKobo;
  let vendorProceedsKobo = payableAfterRefundsKobo - priorPayableKobo;
  if (vendorProceedsKobo < zero) vendorProceedsKobo = zero;
  if (vendorProceedsKobo > remainingEscrowObligationKobo) vendorProceedsKobo = remainingEscrowObligationKobo;

  const platformShareKobo = remainingEscrowObligationKobo - vendorProceedsKobo;
  const otherAllocatedKobo = zero;
  if (vendorProceedsKobo + platformShareKobo + otherAllocatedKobo !== remainingEscrowObligationKobo) {
    throw new Error("Escrow release allocation does not conserve the remaining obligation.");
  }

  return {
    completedRefundKobo,
    escrowObligationKobo,
    previouslyReleasedKobo,
    previouslyReleasedPayableKobo,
    remainingEscrowObligationKobo,
    vendorProceedsKobo,
    platformShareKobo,
    otherAllocatedKobo,
    totalReleasedKobo: remainingEscrowObligationKobo,
    releasableKobo: remainingEscrowObligationKobo,
    payableKobo: vendorProceedsKobo,
    platformKobo: platformShareKobo
  };
}

export type OrderReleaseState = {
  order: Prisma.OrderGetPayload<{
    include: { escrowHolds: true; refunds: { select: { id: true } } };
  }>;
  escrow: EscrowHold | null;
  pendingRefundCount: number;
  completedRefundKobo: bigint;
  previouslyReleasedKobo: bigint;
  previouslyReleasedPayableKobo: bigint;
  frozenPayableKobo: bigint;
  obligation: EscrowReleaseObligation | null;
};

/**
 * Read everything a release decision depends on under one order lock.
 *
 * Completed refunds, not `Order.refundedKobo`, determine what is still owed.
 * Pending claims are returned separately because they must block a release
 * without changing its arithmetic.
 */
export async function loadOrderReleaseState(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<OrderReleaseState> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      escrowHolds: { orderBy: { createdAt: "asc" } },
      refunds: { where: { status: "PENDING" }, select: { id: true } }
    }
  });
  const completed = await tx.refund.aggregate({
    where: { orderId, status: "COMPLETED" },
    _sum: { amountKobo: true }
  });
  const priorReleases = await tx.walletTransaction.findMany({
    where: { orderId, type: "release" },
    select: {
      amountKobo: true,
      ledger: { select: { direction: true, amountKobo: true } }
    }
  });
  let previouslyReleasedKobo = BigInt(0);
  let previouslyReleasedPayableKobo = BigInt(0);
  for (const release of priorReleases) {
    previouslyReleasedPayableKobo += release.amountKobo;
    for (const leg of release.ledger) {
      if (leg.direction === "DEBIT") previouslyReleasedKobo += leg.amountKobo;
    }
  }

  const escrow = order.escrowHolds[0] ?? null;
  const frozenPayableKobo = order.subtotalKobo - order.commissionKobo + order.deliveryFeeKobo;
  const completedRefundKobo = completed._sum.amountKobo ?? BigInt(0);
  const obligation = escrow
    ? releaseObligation({
        escrowAmountKobo: escrow.amountKobo,
        orderTotalKobo: order.totalKobo,
        payableKobo: frozenPayableKobo,
        completedRefundKobo,
        previouslyReleasedKobo,
        previouslyReleasedPayableKobo
      })
    : null;

  return {
    order,
    escrow,
    pendingRefundCount: order.refunds.length,
    completedRefundKobo,
    previouslyReleasedKobo,
    previouslyReleasedPayableKobo,
    frozenPayableKobo,
    obligation
  };
}

export type ReleasePostingResult = {
  escrowId: string;
  reference: string;
  escrowObligationKobo: bigint;
  previouslyReleasedKobo: bigint;
  previouslyReleasedPayableKobo: bigint;
  remainingEscrowObligationKobo: bigint;
  totalReleasedKobo: bigint;
  vendorProceedsKobo: bigint;
  platformShareKobo: bigint;
  otherAllocatedKobo: bigint;
};

/**
 * Post the one authoritative escrow release journal.
 *
 * Both customer completion and dispute resolution call this function, so the
 * wallet movements and the ledger cannot drift between the two entry points.
 * Every wallet movement is conditional and every claim is a compare-and-set:
 * a lost race returns 409 and never posts a second release.
 */
export async function postEscrowRelease(
  tx: Prisma.TransactionClient,
  input: {
    order: { id: string; orderNumber: string };
    escrow: EscrowHold;
    completedRefundKobo: bigint;
    previouslyReleasedKobo: bigint;
    previouslyReleasedPayableKobo: bigint;
    frozenPayableKobo: bigint;
    orderTotalKobo: bigint;
    allowedStatuses: EscrowStatus[];
    reference: string;
    description: string;
    note: string;
    actorId?: string | null;
  }
): Promise<ReleasePostingResult> {
  const obligation = releaseObligation({
    escrowAmountKobo: input.escrow.amountKobo,
    orderTotalKobo: input.orderTotalKobo,
    payableKobo: input.frozenPayableKobo,
    completedRefundKobo: input.completedRefundKobo,
    previouslyReleasedKobo: input.previouslyReleasedKobo,
    previouslyReleasedPayableKobo: input.previouslyReleasedPayableKobo
  });
  if (obligation.totalReleasedKobo <= BigInt(0)) {
    throw new ApiError(409, "escrow_conflict", "The escrow has no releasable balance after its refunds and earlier releases.");
  }

  const claimed = await tx.escrowHold.updateMany({
    where: { id: input.escrow.id, status: { in: input.allowedStatuses } },
    data: { status: "released" }
  });
  if (claimed.count !== 1) {
    throw new ApiError(409, "escrow_conflict", "The escrow changed while releasing it. Reload and try again.");
  }

  // The buyer of record is the wallet that actually holds the escrow: the
  // customer for wallet payments, the platform for verified external payments.
  const buyerRelease = await tx.wallet.updateMany({
    where: { id: input.escrow.buyerWalletId, heldKobo: { gte: obligation.totalReleasedKobo } },
    data: { heldKobo: { decrement: obligation.totalReleasedKobo } }
  });
  if (buyerRelease.count !== 1) {
    throw new ApiError(409, "escrow_conflict", "The remaining escrow hold is no longer available to release.");
  }
  const sellerRelease = await tx.wallet.updateMany({
    where: { id: input.escrow.vendorWalletId, heldKobo: { gte: obligation.totalReleasedKobo } },
    data: {
      heldKobo: { decrement: obligation.totalReleasedKobo },
      availableKobo: { increment: obligation.vendorProceedsKobo }
    }
  });
  if (sellerRelease.count !== 1) {
    throw new ApiError(409, "escrow_conflict", "The seller's remaining escrow hold is no longer available to release.");
  }

  const entries = [
    {
      walletId: input.escrow.vendorWalletId,
      direction: "DEBIT" as const,
      amountKobo: obligation.totalReleasedKobo,
      memo: "Remaining escrow payable cleared"
    },
    {
      walletId: input.escrow.vendorWalletId,
      direction: "CREDIT" as const,
      amountKobo: obligation.vendorProceedsKobo,
      memo: "Seller net proceeds credited"
    }
  ];
  if (obligation.platformShareKobo > BigInt(0)) {
    const platformWallet = await ensureWallet(tx, { ownerType: "SYSTEM" });
    await tx.wallet.update({
      where: { id: platformWallet.id },
      data: { availableKobo: { increment: obligation.platformShareKobo } }
    });
    entries.push({
      walletId: platformWallet.id,
      direction: "CREDIT" as const,
      amountKobo: obligation.platformShareKobo,
      memo: "Remaining commission and fees retained by NaijaDeals"
    });
  }

  const debitKobo = entries
    .filter((entry) => entry.direction === "DEBIT")
    .reduce((sum, entry) => sum + entry.amountKobo, BigInt(0));
  const creditKobo = entries
    .filter((entry) => entry.direction === "CREDIT")
    .reduce((sum, entry) => sum + entry.amountKobo, BigInt(0));
  if (debitKobo !== creditKobo) throw new Error("Escrow release journal does not balance.");
  if (debitKobo !== obligation.totalReleasedKobo) throw new Error("Escrow release journal does not post the full obligation.");

  await tx.walletTransaction.create({
    data: {
      walletId: input.escrow.vendorWalletId,
      orderId: input.order.id,
      type: "release",
      amountKobo: obligation.vendorProceedsKobo,
      reference: input.reference,
      description: input.description,
      ledger: { create: entries.filter((entry) => entry.amountKobo > BigInt(0)) }
    }
  });
  await tx.escrowEvent.create({
    data: { escrowId: input.escrow.id, from: input.escrow.status, to: "released", note: input.note }
  });

  return {
    escrowId: input.escrow.id,
    reference: input.reference,
    escrowObligationKobo: obligation.escrowObligationKobo,
    previouslyReleasedKobo: obligation.previouslyReleasedKobo,
    previouslyReleasedPayableKobo: obligation.previouslyReleasedPayableKobo,
    remainingEscrowObligationKobo: obligation.remainingEscrowObligationKobo,
    totalReleasedKobo: obligation.totalReleasedKobo,
    vendorProceedsKobo: obligation.vendorProceedsKobo,
    platformShareKobo: obligation.platformShareKobo,
    otherAllocatedKobo: obligation.otherAllocatedKobo
  };
}

/** Read the breakdown of a release that was already posted under `reference`. */
export async function readRecordedRelease(
  tx: Prisma.TransactionClient,
  orderId: string,
  reference: string
): Promise<ReleasePostingResult | null> {
  const transaction = await tx.walletTransaction.findFirst({
    where: { orderId, reference },
    include: { ledger: true }
  });
  if (!transaction) return null;

  let totalReleasedKobo = BigInt(0);
  let vendorProceedsKobo = BigInt(0);
  for (const leg of transaction.ledger) {
    if (leg.direction === "DEBIT") totalReleasedKobo += leg.amountKobo;
    else if (leg.walletId === transaction.walletId) vendorProceedsKobo += leg.amountKobo;
  }
  const platformShareKobo = totalReleasedKobo - vendorProceedsKobo;
  return {
    escrowId: "",
    reference,
    escrowObligationKobo: totalReleasedKobo,
    previouslyReleasedKobo: totalReleasedKobo,
    previouslyReleasedPayableKobo: vendorProceedsKobo,
    remainingEscrowObligationKobo: BigInt(0),
    totalReleasedKobo,
    vendorProceedsKobo,
    platformShareKobo,
    otherAllocatedKobo: BigInt(0)
  };
}

/**
 * Customer confirms receipt. Escrow is released to the seller net of commission.
 *
 * Authoritative state is re-read under an order row lock inside the transaction,
 * so a concurrent refund and a concurrent completion cannot both spend the same
 * escrowed balance. A duplicate completion is idempotent: it returns the release
 * already recorded and moves no money a second time.
 */
export async function completeOrder(userId: string, orderId: string) {
  const pre = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, customerId: true } });
  if (!pre) throw new ApiError(404, "order_not_found", "Order not found.");
  if (pre.customerId !== userId) throw new ApiError(403, "forbidden", "This order belongs to another account.");

  const result = await prisma.$transaction(async (tx) => {
    // Serialise with refundPayment and dispute release, which take the same lock
    // before touching the order's escrow balances.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
    `;
    if (locked.length === 0) throw new ApiError(404, "order_not_found", "Order not found.");

    const releaseState = await loadOrderReleaseState(tx, orderId);
    const { order, escrow, obligation } = releaseState;
    if (order.customerId !== userId) throw new ApiError(403, "forbidden", "This order belongs to another account.");

    if (order.status === "completed") {
      if (escrow && escrow.status !== "released") {
        throw new ApiError(409, "escrow_not_released", "This order is completed but its escrow state is inconsistent. Contact support.");
      }
      const recorded = escrow
        ? await readRecordedRelease(tx, order.id, `RELEASE-${order.id}`)
        : null;
      if (escrow && !recorded) {
        throw new ApiError(409, "escrow_not_released", "This order is completed but its release record is missing. Contact support.");
      }
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalKobo: order.totalKobo,
        status: "completed" as const,
        totalReleasedKobo: (recorded?.totalReleasedKobo ?? BigInt(0)).toString(),
        vendorProceedsKobo: (recorded?.vendorProceedsKobo ?? BigInt(0)).toString(),
        platformShareKobo: (recorded?.platformShareKobo ?? BigInt(0)).toString(),
        otherAllocatedKobo: "0",
        remainingEscrowObligationKobo: "0",
        previouslyReleasedKobo: (recorded?.previouslyReleasedKobo ?? BigInt(0)).toString(),
        payableKobo: (recorded?.vendorProceedsKobo ?? BigInt(0)).toString(),
        duplicate: true
      };
    }
    if (order.status !== "delivered") throw new ApiError(409, "not_delivered", "Only delivered orders can be completed.");
    // An external refund reserves `refundedKobo` before its provider call. Until
    // that call settles, the held amount has no settled record to attribute it
    // to, so completion must wait rather than release or strand it.
    if (releaseState.pendingRefundCount > 0) {
      throw new ApiError(409, "refund_pending", "A refund is still awaiting provider confirmation. Retry completion after it settles.");
    }

    let breakdown: ReleasePostingResult | null = null;
    if (escrow) {
      breakdown = await postEscrowRelease(tx, {
        order,
        escrow,
        completedRefundKobo: releaseState.completedRefundKobo,
        previouslyReleasedKobo: releaseState.previouslyReleasedKobo,
        previouslyReleasedPayableKobo: releaseState.previouslyReleasedPayableKobo,
        frozenPayableKobo: releaseState.frozenPayableKobo,
        orderTotalKobo: order.totalKobo,
        allowedStatuses: ["held", "release_eligible"],
        reference: `RELEASE-${order.id}`,
        description: `Escrow released for ${order.orderNumber}`,
        note: "Customer confirmed delivery.",
        actorId: userId
      });
    }

    await updateOrderStatus({ tx, actorId: userId, orderId: order.id, status: "completed", note: "Customer confirmed delivery; escrow released." });
    await recordAudit({
      tx,
      actorId: userId,
      action: "order.completed",
      entity: "Order",
      entityId: order.id,
      metadata: {
        totalReleasedKobo: (breakdown?.totalReleasedKobo ?? BigInt(0)).toString(),
        remainingEscrowObligationKobo: (breakdown?.remainingEscrowObligationKobo ?? BigInt(0)).toString(),
        vendorProceedsKobo: (breakdown?.vendorProceedsKobo ?? BigInt(0)).toString(),
        platformShareKobo: (breakdown?.platformShareKobo ?? BigInt(0)).toString(),
        otherAllocatedKobo: "0",
        completedRefundKobo: releaseState.completedRefundKobo.toString(),
        reservedRefundKobo: (order.refundedKobo - releaseState.completedRefundKobo).toString(),
        previouslyReleasedKobo: releaseState.previouslyReleasedKobo.toString()
      }
    });
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalKobo: order.totalKobo,
      status: "completed" as const,
      totalReleasedKobo: (breakdown?.totalReleasedKobo ?? BigInt(0)).toString(),
      vendorProceedsKobo: (breakdown?.vendorProceedsKobo ?? BigInt(0)).toString(),
      platformShareKobo: (breakdown?.platformShareKobo ?? BigInt(0)).toString(),
      otherAllocatedKobo: "0",
      remainingEscrowObligationKobo: (breakdown?.remainingEscrowObligationKobo ?? BigInt(0)).toString(),
      previouslyReleasedKobo: (breakdown?.previouslyReleasedKobo ?? BigInt(0)).toString(),
      // Retained for callers (and notifications) that predate the breakdown.
      payableKobo: (breakdown?.vendorProceedsKobo ?? (releaseState.frozenPayableKobo > BigInt(0) ? releaseState.frozenPayableKobo : BigInt(0))).toString(),
      duplicate: false
    };
  });

  // Post-commit: the customer is told the escrow moved and the order closed. An
  // idempotent replay must not send a second notification for the same release.
  if (!result.duplicate) {
    const facts = {
      id: result.orderId,
      orderNumber: result.orderNumber,
      totalKobo: result.totalKobo,
      customerId: userId
    };
    await notifyEscrowReleased(facts, BigInt(result.payableKobo));
    await notifyOrderStatus(facts, "completed");
  }

  return result;
}

export async function requestReturn(input: { userId: string; orderId: string; reason: string; detail?: string }) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId }, include: { returnRequests: true } });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");
  if (order.customerId !== input.userId) throw new ApiError(403, "forbidden", "This order belongs to another account.");
  if (!["delivered", "completed"].includes(order.status)) {
    throw new ApiError(409, "not_returnable", "Returns open after delivery.");
  }
  if (order.returnRequests.some((request) => ["REQUESTED", "APPROVED", "RECEIVED"].includes(request.status))) {
    throw new ApiError(409, "return_exists", "A return is already open for this order.");
  }
  const ageDays = (Date.now() - order.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > 14) throw new ApiError(409, "return_window_closed", "The 14-day return window has closed.");

  return prisma.$transaction(async (tx) => {
    const request = await tx.returnRequest.create({
      data: {
        orderId: order.id,
        userId: input.userId,
        vendorId: order.vendorId,
        reason: input.reason,
        detail: input.detail ?? null,
        refundKobo: order.totalKobo
      }
    });
    await recordAudit({
      tx,
      actorId: input.userId,
      action: "return.requested",
      entity: "ReturnRequest",
      entityId: request.id,
      metadata: { orderId: order.id, reason: input.reason }
    });
    return request;
  });
}
