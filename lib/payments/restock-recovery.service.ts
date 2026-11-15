import type { SessionUser } from "@/lib/auth/session";
import { ApiError } from "@/lib/auth/guard";
import { hasPermission } from "@/lib/auth/permissions";
import { assertRegion } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { lockOrderRow } from "@/lib/services/core/order.service";
import { recordAudit } from "@/lib/services/core/audit.service";
import { restockOrderItemsOnce, type OrderRestockResult } from "./service";

/**
 * Operational recovery for physical stock that a refund/return could not put
 * back because its authoritative source was not resolvable at that moment.
 *
 * The `OrderItemRestock` ledger is the queue. A row in `SUPPRESSED` state is
 * the only evidence that an authorized restock attempt happened and the units
 * are still outstanding; this module never creates a new restock attempt for an
 * arbitrary order. Money is never touched here.
 *
 * Authorization:
 *  - the seller that owns the order may retry its own suppressed items;
 *  - staff need the `orders:write` permission and a matching region scope.
 */

const MAX_LIST = 200;
const MIN_REASON_LENGTH = 4;

export type RestockSuppressionView = {
  orderId: string;
  orderNumber: string;
  countryCode: string;
  orderItemId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  productName: string;
  variantName: string | null;
  reason: string | null;
  attempts: number;
  lastSource: string | null;
  lastAttemptAt: string;
};

export type RestockRecoveryList = {
  suppressions: RestockSuppressionView[];
  /** Rows returned; when equal to `limit` the result is truncated. */
  count: number;
  limit: number;
  truncated: boolean;
  /** Orders whose historical marker has no provable per-item ledger. */
  legacyMarkerOrders: Array<{ orderId: string; orderNumber: string; markerCreatedAt: string }>;
};

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value) || !value) return 50;
  return Math.min(Math.max(Math.trunc(value), 1), MAX_LIST);
}

/**
 * Read the reconciliation queue. With `orderId` set it lists every suppressed
 * item of that order (including ones already fully restored? no: only
 * SUPPRESSED), otherwise it lists the oldest outstanding suppressions first.
 */
export async function listRestockRecovery(input: {
  orderId?: string;
  limit?: number;
  includeLegacyMarkers?: boolean;
} = {}): Promise<RestockRecoveryList> {
  const limit = clampLimit(input.limit);
  const rows = await prisma.orderItemRestock.findMany({
    where: { status: "SUPPRESSED", ...(input.orderId ? { orderId: input.orderId } : {}) },
    include: {
      order: { select: { id: true, orderNumber: true, countryCode: true } },
      orderItem: { select: { productName: true, variantName: true } }
    },
    orderBy: [{ updatedAt: "asc" }, { orderItemId: "asc" }],
    take: limit + 1
  });
  const truncated = rows.length > limit;
  const page = truncated ? rows.slice(0, limit) : rows;

  let legacyMarkerOrders: RestockRecoveryList["legacyMarkerOrders"] = [];
  if (input.includeLegacyMarkers) {
    const markers = await prisma.systemEvent.findMany({
      where: {
        type: "order.stock_restocked",
        entity: "Order",
        ...(input.orderId ? { entityId: input.orderId } : {})
      },
      orderBy: { createdAt: "asc" },
      take: limit
    });
    const orderIds = markers.map((marker) => marker.entityId).filter((id): id is string => Boolean(id));
    const orders = orderIds.length
      ? await prisma.order.findMany({
          where: { id: { in: orderIds }, itemRestocks: { none: {} } },
          select: { id: true, orderNumber: true }
        })
      : [];
    const numbers = new Map(orders.map((order) => [order.id, order.orderNumber]));
    legacyMarkerOrders = markers
      .filter((marker) => marker.entityId && numbers.has(marker.entityId))
      .map((marker) => ({
        orderId: marker.entityId as string,
        orderNumber: numbers.get(marker.entityId as string) as string,
        markerCreatedAt: marker.createdAt.toISOString()
      }));
  }

  return {
    suppressions: page.map((row) => ({
      orderId: row.orderId,
      orderNumber: row.order.orderNumber,
      countryCode: row.order.countryCode,
      orderItemId: row.orderItemId,
      productId: row.productId,
      variantId: row.variantId,
      quantity: row.quantity,
      productName: row.orderItem.productName,
      variantName: row.orderItem.variantName,
      reason: row.reason,
      attempts: row.attempts,
      lastSource: row.lastSource,
      lastAttemptAt: row.updatedAt.toISOString()
    })),
    count: page.length,
    limit,
    truncated,
    legacyMarkerOrders
  };
}

async function loadAuthorizedActor(input: { actorId: string; actor?: SessionUser; orderId: string }) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      orderNumber: true,
      vendorId: true,
      countryCode: true,
      items: { select: { id: true } }
    }
  });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");

  const actor =
    input.actor ??
    (await prisma.user.findUnique({
      where: { id: input.actorId },
      include: { roles: { include: { role: true } }, vendors: true }
    }));
  if (!actor) throw new ApiError(401, "unauthenticated", "Sign in to retry stock recovery.");

  const vendor = await prisma.vendor.findUnique({ where: { id: order.vendorId }, select: { ownerId: true } });
  const ownsOrder = vendor?.ownerId === actor.id;
  const canWriteOrders = hasPermission(actor as SessionUser, "orders:write");
  if (!ownsOrder && !canWriteOrders) {
    throw new ApiError(403, "forbidden", "Only the seller of this order or an authorized operator may retry its stock recovery.");
  }
  if (!ownsOrder) assertRegion(actor as SessionUser, { countryCode: order.countryCode });
  return { order, actor };
}

/**
 * Retry a previously SUPPRESSED restock after its source became resolvable
 * (for example a listing converted back to product-level stock, or a missing
 * stock row was recreated).
 *
 * Only existing `SUPPRESSED` ledger rows are eligible; callers cannot use this
 * to create a restock attempt for an arbitrary order. Attempts are serialized
 * by the order row lock, increment `attempts`, and are audited with the actor
 * and reason. `restored` is true only for physical increments performed here.
 */
export async function retrySuppressedRestock(input: {
  orderId: string;
  actorId: string;
  actor?: SessionUser;
  reason: string;
  /** Optional subset; the service still refuses items not already SUPPRESSED. */
  orderItemIds?: string[];
}): Promise<{
  orderId: string;
  orderNumber: string;
  retriedItemIds: string[];
  skippedItemIds: string[];
  result: OrderRestockResult;
}> {
  const reason = input.reason?.trim() ?? "";
  if (reason.length < MIN_REASON_LENGTH) {
    throw new ApiError(400, "reason_required", "A reason is required to retry stock recovery.");
  }
  const { order, actor } = await loadAuthorizedActor({
    actorId: input.actorId,
    actor: input.actor,
    orderId: input.orderId
  });

  return prisma.$transaction(async (tx) => {
    await lockOrderRow(tx, order.id);
    const suppressed = await tx.orderItemRestock.findMany({
      where: { orderId: order.id, status: "SUPPRESSED" },
      select: { orderItemId: true }
    });
    const suppressedIds = new Set(suppressed.map((row) => row.orderItemId));
    const requested = input.orderItemIds?.length
      ? input.orderItemIds
      : suppressed.map((row) => row.orderItemId);
    const retriedItemIds = [...new Set(requested)].filter((id) => suppressedIds.has(id));
    const skippedItemIds = [...new Set(requested)].filter((id) => !suppressedIds.has(id));

    if (retriedItemIds.length === 0) {
      throw new ApiError(
        409,
        "no_suppressed_restock",
        "This order has no suppressed stock recovery item to retry. Only items already recorded as SUPPRESSED can be retried."
      );
    }

    const result = await restockOrderItemsOnce(tx, order.id, {
      actorId: actor.id,
      source: "manual",
      reason,
      retrySuppressed: true,
      onlyOrderItemIds: retriedItemIds
    });

    await recordAudit({
      tx,
      actorId: actor.id,
      action: "order.stock_recovery_retried",
      entity: "Order",
      entityId: order.id,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        reason,
        retriedItemIds,
        skippedItemIds,
        restoredItems: result.restoredItems,
        pendingSuppressedItems: result.pendingSuppressedItems,
        restockComplete: result.restockComplete
      }
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      retriedItemIds,
      skippedItemIds,
      result
    };
  });
}
