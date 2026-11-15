import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Order, Payment, PrismaClient, Refund } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCountry, commissionFor } from "@/lib/config/commerce";
import { ApiError } from "@/lib/auth/guard";
import { assertFinancialOperationsAllowed } from "./review-financial-guard";
import { adapters, isDefinitiveProviderRejection, type AdapterId, isTestPaymentsEnabled } from "./adapters";
import {
  loadRefundLifecycle,
  recordRefundLifecycle
} from "./refund-lifecycle";
import type { PaymentVerifyResult } from "./types";
import { lockOrderRow, updateOrderStatus } from "@/lib/services/core/order.service";
import { recordAudit } from "@/lib/services/core/audit.service";
import { recordSystemEvent } from "@/lib/services/core/event.service";
import { createDelivery, settleRefundDeliveryCustody } from "@/lib/services/core/delivery.service";
import { notifyOrderPaid } from "@/lib/notifications/domain-events";
import { recordConversion } from "@/lib/services/affiliate/service";
import { log } from "@/lib/infra/logger";

type Db = PrismaClient | Prisma.TransactionClient;

export type AvailableMethod = {
  id: AdapterId;
  label: string;
  description: string;
  configured: boolean;
  supportsCountry: boolean;
  reason?: string;
};

export function listPaymentMethods(countryCode: string): AvailableMethod[] {
  return (Object.keys(adapters) as AdapterId[]).map((id) => {
    const adapter = adapters[id];
    const supportsCountry = adapter.supportsCountry(countryCode);
    const configured = adapter.isConfigured();
    let reason: string | undefined;
    if (!supportsCountry) reason = `Not supported in ${getCountry(countryCode).name}.`;
    else if (!configured) {
      if (id === "paystack") reason = "PAYSTACK_SECRET_KEY is not configured.";
      else if (id === "flutterwave") reason = "FLUTTERWAVE_SECRET_KEY is not configured.";
      else if (id === "test") reason = "Set ENABLE_TEST_PAYMENTS=true in a non-production environment.";
    }
    return { id, label: adapter.label, description: adapter.description, configured, supportsCountry, reason };
  });
}

export function availablePaymentMethods(countryCode: string) {
  return listPaymentMethods(countryCode).filter((method) => method.configured && method.supportsCountry);
}

export async function ensureWallet(tx: Db, input: { userId?: string; vendorId?: string; ownerType: "CUSTOMER" | "VENDOR" | "COURIER" | "DRIVER" | "SYSTEM" }) {
  // Ownership rules: SYSTEM is platform-wide, VENDOR belongs to a vendor row,
  // and every personal wallet belongs to a user. Reject mixed or missing ids.
  if (input.ownerType === "SYSTEM") {
    if (input.userId || input.vendorId) throw new ApiError(400, "invalid_wallet_identity", "The platform wallet cannot belong to a user or vendor.");
  } else if (input.ownerType === "VENDOR") {
    if (!input.vendorId || input.userId) throw new ApiError(400, "invalid_wallet_identity", "A vendor wallet requires a vendorId and no userId.");
  } else if (!input.userId || input.vendorId) {
    throw new ApiError(400, "invalid_wallet_identity", "A personal wallet requires a userId and no vendorId.");
  }
  // Resolve by owner type as well as identity: one user can hold CUSTOMER,
  // DRIVER and COURIER wallets, and paying the wrong one is a financial bug.
  const identity = input.userId
    ? { userId: input.userId, ownerType: input.ownerType }
    : input.vendorId
      ? { vendorId: input.vendorId, ownerType: input.ownerType }
      : { ownerType: "SYSTEM" as const };
  const existing = await tx.wallet.findFirst({ where: identity });
  if (existing) return existing;
  try {
    return await tx.wallet.create({
      data: {
        ownerType: input.ownerType,
        userId: input.userId ?? null,
        vendorId: input.vendorId ?? null
      }
    });
  } catch (error) {
    // Partial unique indexes are the authority: a concurrent creator won, so
    // return its canonical row instead of failing the caller or making a second.
    if ((error as { code?: string }).code === "P2002") {
      const winner = await tx.wallet.findFirst({ where: identity });
      if (winner) return winner;
    }
    throw error;
  }
}

async function getPaymentByReference(reference: string) {
  const payment = await prisma.payment.findUnique({
    where: { providerReference: reference },
    include: { order: { include: { items: true, vendor: true, customer: true } } }
  });
  if (!payment) throw new ApiError(404, "payment_not_found", "Payment reference was not found.");
  return payment;
}

export async function initializePayment(input: {
  orderId: string;
  userId: string;
  provider: AdapterId;
  callbackUrl: string;
}) {

  await assertFinancialOperationsAllowed("Payment initialization");  const adapter = adapters[input.provider];
  if (!adapter) throw new ApiError(400, "unknown_provider", "Unknown payment provider.");

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { customer: true, payments: true }
  });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");
  if (order.customerId !== input.userId) throw new ApiError(403, "forbidden", "This order belongs to another account.");
  if (order.paymentStatus === "paid") throw new ApiError(409, "already_paid", "This order is already paid.");
  if (["cancelled", "refunded"].includes(order.status)) throw new ApiError(409, "order_closed", "This order is closed.");

  if (!adapter.supportsCountry(order.countryCode)) {
    throw new ApiError(400, "provider_unsupported", `${adapter.label} does not support ${order.countryCode}.`);
  }
  if (!adapter.isConfigured()) {
    throw new ApiError(503, "provider_unconfigured", `${adapter.label} is not configured on this server.`);
  }

  const existing = order.payments.find(
    (payment) => payment.provider === input.provider && payment.status === "PENDING"
  );
  if (existing) {
    const raw = existing.raw as { data?: { authorization_url?: unknown; link?: unknown } } | null;
    let redirectUrl =
      input.provider === "paystack" && typeof raw?.data?.authorization_url === "string"
        ? raw.data.authorization_url
        : input.provider === "flutterwave" && typeof raw?.data?.link === "string"
          ? raw.data.link
          : null;

    // If the stored provider response did not include a checkout URL, ask the
    // provider to initialize the same reference again rather than silently
    // returning a payment that the customer cannot complete.
    if (!redirectUrl && (input.provider === "paystack" || input.provider === "flutterwave")) {
      const retried = await adapter.initialize({
        reference: existing.providerReference,
        amountMinor: order.totalKobo,
        currency: order.currency,
        email: order.customer.email,
        orderNumber: order.orderNumber,
        callbackUrl: input.callbackUrl,
        metadata: { orderId: order.id, customerId: input.userId }
      });
      redirectUrl = retried.redirectUrl ?? null;
      if (retried.raw !== undefined) {
        await prisma.payment.update({
          where: { id: existing.id },
          data: { raw: JSON.parse(JSON.stringify(retried.raw)) }
        });
      }
    }

    return {
      paymentId: existing.id,
      reference: existing.providerReference,
      provider: existing.provider,
      redirectUrl,
      instructions: existing.provider === "wallet"
        ? "Confirm to debit your NaijaPay wallet."
        : existing.provider === "test"
          ? "Local test provider: confirm on this page to simulate a verified payment for testing only."
          : "Continue with the payment provider to finish this payment."
    };
  }

  const reference = `NDP-${order.orderNumber}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: input.provider,
      providerReference: reference,
      idempotencyKey: `${order.id}:${input.provider}:${randomBytes(8).toString("hex")}`,
      amountKobo: order.totalKobo,
      currency: order.currency,
      status: "PENDING"
    }
  });

  try {
    const result = await adapter.initialize({
      reference,
      amountMinor: order.totalKobo,
      currency: order.currency,
      email: order.customer.email,
      orderNumber: order.orderNumber,
      callbackUrl: input.callbackUrl,
      metadata: { orderId: order.id, customerId: input.userId }
    });
    if (result.raw !== undefined) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { raw: JSON.parse(JSON.stringify(result.raw)) }
      });
    }
    return {
      paymentId: payment.id,
      reference,
      provider: input.provider,
      redirectUrl: result.redirectUrl ?? null,
      instructions: result.instructions ?? null
    };
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failureReason: error instanceof Error ? error.message : "Provider initialization failed."
      }
    });
    throw new ApiError(502, "provider_error", error instanceof Error ? error.message : "Payment provider failed.");
  }
}

/**
 * Lock the inventory rows an order touches in the canonical order:
 *
 *   order (already taken by the caller) -> product stock (sorted) -> variant rows (sorted)
 *
 * The conditional updates below are atomic on their own, but two orders that
 * contain the same products in a different item order could otherwise update
 * the rows in opposite order and deadlock. The order row lock already
 * serialises work on one order; this helper serialises stock/source changes
 * across orders and against checkout/seller transitions, which use the same
 * stock -> variant order.
 *
 * Existing rows are locked only. A product-level item whose stock row is
 * missing is deliberately left missing so restock keeps its documented
 * `stock_row_missing` suppression instead of reviving a zero row.
 */
async function lockOrderInventoryRows(
  tx: Db,
  items: Array<{ productId: string; variantId: string | null }>
) {
  const productIds = [...new Set(items.filter((item) => !item.variantId).map((item) => item.productId))].sort();
  for (const productId of productIds) {
    await tx.$queryRaw`
      SELECT id FROM "InventoryStock" WHERE "productId" = ${productId} FOR UPDATE
    `;
  }
  const variantIds = [
    ...new Set(items.map((item) => item.variantId).filter((variantId): variantId is string => Boolean(variantId)))
  ].sort();
  if (variantIds.length > 0) {
    await tx.$queryRaw`
      SELECT id FROM "ProductVariant"
      WHERE id IN (${Prisma.join(variantIds)})
      ORDER BY id
      FOR UPDATE
    `;
  }
}

async function commitReservedStock(tx: Db, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  await lockOrderInventoryRows(tx, items);
  for (const item of items) {
    if (item.variantId) {
      const updated = await tx.productVariant.updateMany({
        where: { id: item.variantId, reserved: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity }, reserved: { decrement: item.quantity } }
      });
      if (updated.count === 0) throw new ApiError(409, "stock_conflict", "Reserved stock is no longer available.");
    } else {
      const updated = await tx.inventoryStock.updateMany({
        where: { productId: item.productId, reserved: { gte: item.quantity } },
        data: { quantity: { decrement: item.quantity }, reserved: { decrement: item.quantity } }
      });
      if (updated.count === 0) throw new ApiError(409, "stock_conflict", "Reserved stock is no longer available.");
    }
  }
}

export async function releaseReservedStock(tx: Db, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  await lockOrderInventoryRows(tx, items);
  for (const item of items) {
    if (item.variantId) {
      await tx.productVariant.updateMany({
        where: { id: item.variantId, reserved: { gte: item.quantity } },
        data: { reserved: { decrement: item.quantity } }
      });
    } else {
      await tx.inventoryStock.updateMany({
        where: { productId: item.productId, reserved: { gte: item.quantity } },
        data: { reserved: { decrement: item.quantity } }
      });
    }
  }
}

/**
 * Legacy order-level marker that an order restock was attempted exactly once.
 *
 * Kept for compatibility with receipts and reconciliation written before the
 * per-item ledger. New decisions read `OrderItemRestock`; the marker alone can
 * no longer be treated as proof that every unit was physically restored.
 */
export const ORDER_RESTOCK_EVENT = "order.stock_restocked";
/** An authorized retry changed per-item recovery state after the first attempt. */
export const ORDER_RESTOCK_RECOVERED_EVENT = "order.stock_restock_recovered";

export type RestockSuppressionReason = "variant_managed" | "stock_row_missing" | "variant_missing";

export type RestockItemRecord = {
  orderItemId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  status: "RESTORED" | "SUPPRESSED" | "LEGACY_RECORDED";
  reason: string | null;
  attempts: number;
};

export type OrderRestockResult = {
  /** True only when this call physically restored at least one item. */
  restored: boolean;
  /**
   * True when an earlier restock attempt was already recorded for this order.
   * This does NOT mean every item was restored: inspect
   * `pendingSuppressedItems` and `restockComplete`.
   */
  alreadyRestocked: boolean;
  /** Set when the caller only needed the marker (legacy `restocked` receipt). */
  recordedOnly: boolean;
  restoredItems: Array<{ orderItemId: string; productId: string; variantId: string | null; quantity: number }>;
  suppressedItems: Array<{ orderItemId: string; productId: string; quantity: number; reason: string }>;
  /** Every item still waiting for physical recovery after this call. */
  pendingSuppressedItems: Array<{ orderItemId: string; productId: string; quantity: number; reason: string }>;
  /** True when every order item is RESTORED or LEGACY_RECORDED. */
  restockComplete: boolean;
  /**
   * True when a historical order-level marker exists but its payload cannot
   * prove the per-item outcome. Those units are deliberately not retried:
   * incrementing them could double-restock an order whose restore succeeded
   * before the ledger existed. They stay visible for reconciliation.
   */
  legacyMarkerOnly: boolean;
  /** True when the per-item ledger was derived from a complete historical marker. */
  legacyLedgerRecovered: boolean;
  /** Current per-item ledger after this call. */
  items: RestockItemRecord[];
};

type RestockOrderItem = {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
};

type RestockAttempt = { ok: true } | { ok: false; reason: RestockSuppressionReason };

/**
 * Restore one order item into its authoritative stock source.
 *
 * `OrderItem.variantId` decides the source. Variant units always return to
 * their own variant row, even when that variant is now inactive. A
 * product-level item is only added back to `InventoryStock` while the listing
 * still uses product-level stock; after a conversion to variants, the pool is
 * no longer on sale and the item is suppressed.
 *
 * Callers must hold the order row lock and `lockOrderInventoryRows`.
 */
async function restoreOneOrderItem(tx: Db, item: RestockOrderItem): Promise<RestockAttempt> {
  if (item.variantId) {
    const updated = await tx.productVariant.updateMany({
      where: { id: item.variantId },
      data: { stock: { increment: item.quantity } }
    });
    return updated.count === 0 ? { ok: false, reason: "variant_missing" } : { ok: true };
  }
  // Lock the product-level row before deciding: `syncProductVariants` takes the
  // same lock before zeroing/adding variants, so a concurrent transition cannot
  // make this increment unsafe.
  const stock = await tx.$queryRaw<Array<{ quantity: number; reserved: number }>>`
    SELECT "quantity", "reserved" FROM "InventoryStock" WHERE "productId" = ${item.productId} FOR UPDATE
  `;
  const activeVariants = await tx.productVariant.count({
    where: { productId: item.productId, isActive: true }
  });
  if (activeVariants > 0) return { ok: false, reason: "variant_managed" };
  if (stock.length === 0) return { ok: false, reason: "stock_row_missing" };
  await tx.inventoryStock.update({
    where: { productId: item.productId },
    data: { quantity: { increment: item.quantity } }
  });
  return { ok: true };
}

type LegacyMarkerLedgerRow = {
  orderItemId: string;
  status: "RESTORED" | "SUPPRESSED";
  reason: string | null;
};

/**
 * Derive the per-item ledger from a historical `order.stock_restocked` payload.
 *
 * Only a payload that names every current order item with the exact stored
 * quantity is accepted. Anything else (older payload shape, a `recordOnly`
 * marker with empty lists, or an order whose items changed) is unprovable and
 * must not be guessed.
 */
function parseLegacyRestockLedger(payload: unknown, items: RestockOrderItem[]): LegacyMarkerLedgerRow[] | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as { restoredItems?: unknown; suppressedItems?: unknown };
  if (!Array.isArray(candidate.restoredItems) || !Array.isArray(candidate.suppressedItems)) return null;
  const expected = new Map(items.map((item) => [item.id, item.quantity]));
  const seen = new Set<string>();
  const rows: LegacyMarkerLedgerRow[] = [];

  const readRows = (
    source: unknown[],
    status: "RESTORED" | "SUPPRESSED"
  ): LegacyMarkerLedgerRow[] | null => {
    const parsed: LegacyMarkerLedgerRow[] = [];
    for (const raw of source) {
      if (!raw || typeof raw !== "object") return null;
      const row = raw as { orderItemId?: unknown; quantity?: unknown; reason?: unknown };
      const orderItemId = typeof row.orderItemId === "string" ? row.orderItemId : "";
      if (!expected.has(orderItemId) || seen.has(orderItemId)) return null;
      if (row.quantity !== expected.get(orderItemId)) return null;
      if (status === "SUPPRESSED" && typeof row.reason !== "string") return null;
      seen.add(orderItemId);
      parsed.push({
        orderItemId,
        status,
        reason: status === "SUPPRESSED" ? String(row.reason) : null
      });
    }
    return parsed;
  };

  const restored = readRows(candidate.restoredItems, "RESTORED");
  const suppressed = readRows(candidate.suppressedItems, "SUPPRESSED");
  if (!restored || !suppressed) return null;
  rows.push(...restored, ...suppressed);
  return seen.size === expected.size ? rows : null;
}

/**
 * Restore the authoritative stock source for an order with per-item durability.
 *
 * The order row lock is taken here (re-entrant inside the refund/return
 * transaction that already holds it), so refunds, seller receipts and manual
 * recoveries cannot interleave. The order-level `SystemEvent` remains the
 * legacy exactly-once attempt marker; `OrderItemRestock` is the authoritative
 * per-item record:
 *
 *  - RESTORED is terminal: the units were incremented back exactly once;
 *  - SUPPRESSED records a restore that was refused because the source was not
 *    resolvable. The units are NOT back and stay visible for reconciliation;
 *  - LEGACY_RECORDED marks a pre-ledger receipt that was accounted without a
 *    stock movement; it is terminal and never retried.
 *
 * A later authorized retry (`retrySuppressed: true`, or a seller return receipt
 * whose source is `return`) re-evaluates SUPPRESSED items only. RESTORED items
 * are never incremented again.
 *
 * `recordOnly` marks a legacy return that was received before this contract
 * existed without touching stock, so a later refund cannot double-restore it.
 */
export async function restockOrderItemsOnce(
  tx: Db,
  orderId: string,
  input: {
    actorId?: string | null;
    source: "refund" | "return" | "manual";
    reason?: string;
    recordOnly?: boolean;
    /**
     * Re-evaluate previously SUPPRESSED items. A seller return receipt is
     * itself evidence that the physical units are back, so it retries by
     * default; a refund and other callers must opt in explicitly.
     */
    retrySuppressed?: boolean;
    /** Restrict new attempts to these order item ids (explicit recovery). */
    onlyOrderItemIds?: string[];
  }
): Promise<OrderRestockResult> {
  await lockOrderRow(tx, orderId);
  const items = await tx.orderItem.findMany({ where: { orderId }, orderBy: { id: "asc" } });
  await lockOrderInventoryRows(tx, items);

  const marker = await tx.systemEvent.findFirst({
    where: { type: ORDER_RESTOCK_EVENT, entity: "Order", entityId: orderId },
    orderBy: { createdAt: "asc" },
    select: { id: true, payload: true }
  });
  let ledger = await tx.orderItemRestock.findMany({ where: { orderId }, orderBy: { orderItemId: "asc" } });
  let legacyLedgerRecovered = false;
  let legacyMarkerOnly = false;

  if (marker && ledger.length === 0 && items.length > 0) {
    const derived = parseLegacyRestockLedger(marker.payload, items);
    if (derived) {
      const byId = new Map(items.map((item) => [item.id, item]));
      await tx.orderItemRestock.createMany({
        data: derived.map((row) => ({
          orderId,
          orderItemId: row.orderItemId,
          productId: byId.get(row.orderItemId)!.productId,
          variantId: byId.get(row.orderItemId)!.variantId,
          quantity: byId.get(row.orderItemId)!.quantity,
          status: row.status,
          reason: row.reason,
          attempts: 1,
          lastSource: "legacy-marker",
          lastActorId: null,
          restoredAt: row.status === "RESTORED" ? new Date() : null
        }))
      });
      ledger = await tx.orderItemRestock.findMany({ where: { orderId }, orderBy: { orderItemId: "asc" } });
      legacyLedgerRecovered = true;
    } else {
      legacyMarkerOnly = true;
    }
  } else if (marker && ledger.length > 0 && ledger.length < items.length) {
    // Partially backfilled history: the unrecorded items have no provable
    // outcome and must not be incremented again.
    legacyMarkerOnly = true;
  }

  const rowByItem = new Map(ledger.map((row) => [row.orderItemId, row]));
  const source = input.source;
  const retrySuppressed = input.retrySuppressed ?? source === "return";
  const result: OrderRestockResult = {
    restored: false,
    alreadyRestocked: Boolean(marker || ledger.length > 0),
    recordedOnly: Boolean(input.recordOnly),
    restoredItems: [],
    suppressedItems: [],
    pendingSuppressedItems: [],
    restockComplete: false,
    legacyMarkerOnly,
    legacyLedgerRecovered,
    items: []
  };
  const attempted = new Set<string>();

  if (input.recordOnly) {
    if (!marker && ledger.length === 0 && items.length > 0) {
      await tx.orderItemRestock.createMany({
        data: items.map((item) => ({
          orderId,
          orderItemId: item.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          status: "LEGACY_RECORDED" as const,
          reason: null,
          attempts: 1,
          lastSource: source,
          lastActorId: input.actorId ?? null,
          restoredAt: null
        }))
      });
    }
  } else {
    const only = input.onlyOrderItemIds ? new Set(input.onlyOrderItemIds) : null;
    for (const item of items) {
      if (only && !only.has(item.id)) continue;
      const row = rowByItem.get(item.id);
      if (row?.status === "RESTORED" || row?.status === "LEGACY_RECORDED") continue;
      if (row?.status === "SUPPRESSED" && !retrySuppressed) continue;
      // An unprovable legacy marker owns the outcome of unrecorded items.
      if (!row && legacyMarkerOnly) continue;
      attempted.add(item.id);
      const attempt = await restoreOneOrderItem(tx, item);
      if (attempt.ok) {
        await tx.orderItemRestock.upsert({
          where: { orderItemId: item.id },
          create: {
            orderId,
            orderItemId: item.id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            status: "RESTORED",
            reason: null,
            attempts: 1,
            lastSource: source,
            lastActorId: input.actorId ?? null,
            restoredAt: new Date()
          },
          update: {
            status: "RESTORED",
            reason: null,
            attempts: { increment: 1 },
            lastSource: source,
            lastActorId: input.actorId ?? null,
            restoredAt: new Date()
          }
        });
        result.restoredItems.push({
          orderItemId: item.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity
        });
      } else {
        await tx.orderItemRestock.upsert({
          where: { orderItemId: item.id },
          create: {
            orderId,
            orderItemId: item.id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            status: "SUPPRESSED",
            reason: attempt.reason,
            attempts: 1,
            lastSource: source,
            lastActorId: input.actorId ?? null,
            restoredAt: null
          },
          update: {
            status: "SUPPRESSED",
            reason: attempt.reason,
            attempts: { increment: 1 },
            lastSource: source,
            lastActorId: input.actorId ?? null,
            restoredAt: null
          }
        });
        result.suppressedItems.push({
          orderItemId: item.id,
          productId: item.productId,
          quantity: item.quantity,
          reason: attempt.reason
        });
      }
    }
    result.restored = result.restoredItems.length > 0;
  }

  ledger = await tx.orderItemRestock.findMany({ where: { orderId }, orderBy: { orderItemId: "asc" } });
  result.items = ledger.map((row) => ({
    orderItemId: row.orderItemId,
    productId: row.productId,
    variantId: row.variantId,
    quantity: row.quantity,
    status: row.status,
    reason: row.reason,
    attempts: row.attempts
  }));
  result.pendingSuppressedItems = ledger
    .filter((row) => row.status === "SUPPRESSED")
    .map((row) => ({
      orderItemId: row.orderItemId,
      productId: row.productId,
      quantity: row.quantity,
      reason: row.reason ?? "unknown"
    }));
  result.restockComplete =
    !legacyMarkerOnly &&
    items.length > 0 &&
    items.every((item) => {
      const row = ledger.find((entry) => entry.orderItemId === item.id);
      return row?.status === "RESTORED" || row?.status === "LEGACY_RECORDED";
    });

  const summary = {
    orderId,
    source,
    reason: input.reason ?? null,
    recordOnly: result.recordedOnly,
    retrySuppressed,
    restoredItems: result.restoredItems,
    suppressedItems: result.suppressedItems,
    pendingSuppressedItems: result.pendingSuppressedItems,
    restockComplete: result.restockComplete,
    legacyMarkerOnly: result.legacyMarkerOnly,
    legacyLedgerRecovered: result.legacyLedgerRecovered
  };

  if (!marker) {
    await recordAudit({
      tx,
      actorId: input.actorId ?? null,
      action: ORDER_RESTOCK_EVENT,
      entity: "Order",
      entityId: orderId,
      metadata: summary
    });
  } else if (result.restoredItems.length > 0 || (retrySuppressed && attempted.size > 0)) {
    // The first-attempt marker is immutable history. A later authorized
    // recovery (or a still-failing retry) is recorded separately so the
    // reconciliation trail never rewrites the original outcome.
    await recordAudit({
      tx,
      actorId: input.actorId ?? null,
      action: ORDER_RESTOCK_RECOVERED_EVENT,
      entity: "Order",
      entityId: orderId,
      metadata: summary
    });
  }

  return result;
}

/**
 * Mark a payment failed exactly once. Reserved stock is released and an
 * unpaid order is cancelled, so a failed attempt cannot strand inventory.
 */
async function markPaymentFailed(input: {
  paymentId: string;
  orderId: string;
  reason: string;
  raw?: unknown;
}) {
  await prisma.$transaction(async (tx) => {
    // Order before Payment, the canonical lock order. `confirmPayment` and the
    // checkout sweep take the same locks in the same order, so a failure
    // callback and a verification callback cannot deadlock or both act on one
    // attempt.
    await lockOrderRow(tx, input.orderId);
    const locked = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM "Payment" WHERE id = ${input.paymentId} FOR UPDATE
    `;
    if (locked[0]?.status === "COMPLETED") return;
    await tx.payment.update({
      where: { id: input.paymentId },
      data: {
        status: "FAILED",
        failureReason: input.reason,
        raw: input.raw ? JSON.parse(JSON.stringify(input.raw)) : undefined
      }
    });
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (order && ["created", "payment_pending"].includes(order.status)) {
      await releaseReservedStock(tx, order.id);
      await updateOrderStatus({
        tx,
        actorId: null,
        orderId: order.id,
        status: "cancelled",
        note: "Payment failed; reserved stock released."
      });
    }
  });
}

async function recordEscrow(tx: Db, input: {
  order: Order;
  buyerWalletId: string;
  vendorWalletId: string;
  walletDebit: boolean;
  actorId: string;
}) {
  const amount = input.order.totalKobo;
  let escrowBuyerWalletId = input.buyerWalletId;
  if (input.walletDebit) {
    const locked = await tx.$queryRaw<Array<{ availableKobo: bigint }>>`
      SELECT "availableKobo" FROM "Wallet" WHERE id = ${input.buyerWalletId} FOR UPDATE
    `;
    if (!locked[0] || locked[0].availableKobo < amount) {
      throw new ApiError(402, "insufficient_wallet", "NaijaPay wallet balance is insufficient for this order.");
    }
    await tx.wallet.update({
      where: { id: input.buyerWalletId },
      data: { availableKobo: { decrement: amount }, heldKobo: { increment: amount } }
    });
    await tx.wallet.update({ where: { id: input.vendorWalletId }, data: { heldKobo: { increment: amount } } });
    await tx.walletTransaction.create({
      data: {
        walletId: input.buyerWalletId,
        orderId: input.order.id,
        type: "hold",
        amountKobo: amount,
        reference: `ESCROW-HOLD-${input.order.id}`,
        description: `Escrow hold for ${input.order.orderNumber}`,
        ledger: {
          create: [
            { walletId: input.buyerWalletId, direction: "DEBIT", amountKobo: amount, memo: "Buyer wallet moved to escrow" },
            { walletId: input.vendorWalletId, direction: "CREDIT", amountKobo: amount, memo: "Vendor payable held in escrow" }
          ]
        }
      }
    });
  } else {
    // The platform is the buyer of record for an external payment: no customer
    // wallet was debited, so the customer cannot be the holder. The journal posts
    // a platform DEBIT (external funds entering the escrow) against the vendor
    // CREDIT (payable held); the platform's stored position must move with that
    // journal exactly — `availableKobo` down and `heldKobo` up by the same amount.
    // Incrementing `availableKobo` here previously left the projection 2× the
    // amount away from the journal, and the vendor's release could not reconcile.
    const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
    await tx.wallet.update({
      where: { id: platform.id },
      data: { availableKobo: { decrement: amount }, heldKobo: { increment: amount } }
    });
    await tx.wallet.update({ where: { id: input.vendorWalletId }, data: { heldKobo: { increment: amount } } });
    await tx.walletTransaction.create({
      data: {
        walletId: platform.id,
        orderId: input.order.id,
        type: "hold",
        amountKobo: amount,
        reference: `ESCROW-HOLD-${input.order.id}`,
        description: `Verified external payment held for ${input.order.orderNumber}`,
        ledger: {
          create: [
            { walletId: platform.id, direction: "DEBIT", amountKobo: amount, memo: "External payment received into escrow" },
            { walletId: input.vendorWalletId, direction: "CREDIT", amountKobo: amount, memo: "Vendor payable held in escrow" }
          ]
        }
      }
    });
    escrowBuyerWalletId = platform.id;
  }

  return tx.escrowHold.create({
    data: {
      orderId: input.order.id,
      buyerWalletId: escrowBuyerWalletId,
      vendorWalletId: input.vendorWalletId,
      amountKobo: amount,
      status: "held",
      reason: `Payment verified for ${input.order.orderNumber}`,
      events: { create: { from: "pending", to: "held", note: "Payment verified server-side; funds held in escrow." } }
    }
  });
}

async function finalizePaidOrder(tx: Db, input: { order: Order; payment: Payment; walletDebit: boolean; actorId: string }) {
  const { order } = input;
  const buyerWallet = await ensureWallet(tx, { userId: order.customerId, ownerType: "CUSTOMER" });
  const vendorWallet = await ensureWallet(tx, { vendorId: order.vendorId, ownerType: "VENDOR" });

  await recordEscrow(tx, {
    order,
    buyerWalletId: buyerWallet.id,
    vendorWalletId: vendorWallet.id,
    walletDebit: input.walletDebit,
    actorId: input.actorId
  });

  await commitReservedStock(tx, order.id);

  const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: order.vendorId } });
  await tx.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: "paid",
      commissionKobo: commissionFor(order.subtotalKobo, vendor.commissionBps)
    }
  });
  if (order.status === "created") {
    await updateOrderStatus({ tx, actorId: input.actorId, orderId: order.id, status: "payment_pending", note: "Payment initialized." });
  }
  await updateOrderStatus({ tx, actorId: input.actorId, orderId: order.id, status: "escrow_held", note: "Payment verified; escrow hold created." });

  await createDelivery({
    tx,
    actorId: input.actorId,
    orderId: order.id,
    pickupAddress: vendor.pickupAddress,
    dropoffAddress: order.deliveryAddress,
    feeKobo: order.deliveryFeeKobo
  });
  await updateOrderStatus({ tx, actorId: input.actorId, orderId: order.id, status: "vendor_notified", note: "Seller notified to accept the order." });

  await recordAudit({
    tx,
    actorId: input.actorId,
    action: "payment.verified",
    entity: "Payment",
    entityId: input.payment.id,
    metadata: { reference: input.payment.providerReference, amountKobo: input.payment.amountKobo.toString(), provider: input.payment.provider }
  });
}

export async function confirmPayment(input: { reference: string; provider: AdapterId; rawWebhook?: unknown }) {

  await assertFinancialOperationsAllowed("Payment confirmation");  const payment = await getPaymentByReference(input.reference);
  if (payment.provider !== input.provider) {
    throw new ApiError(400, "provider_mismatch", "Payment reference does not belong to this provider.");
  }
  if (payment.status === "COMPLETED") {
    return { status: "COMPLETED" as const, orderId: payment.orderId, duplicate: true };
  }
  if (payment.status === "FAILED") {
    throw new ApiError(409, "payment_failed", "This payment attempt has already failed. Start a new payment.");
  }
  if (payment.order.paymentStatus === "paid") {
    return { status: "COMPLETED" as const, orderId: payment.orderId, duplicate: true };
  }

  let verification: PaymentVerifyResult | null = null;

  if (input.provider === "wallet") {
    verification = {
      status: "COMPLETED",
      amountMinor: payment.amountKobo,
      currency: payment.currency,
      providerReference: payment.providerReference
    };
  } else if (input.provider === "test") {
    if (!isTestPaymentsEnabled()) {
      throw new ApiError(503, "provider_unconfigured", "Local test payments are disabled.");
    }
    verification = {
      status: "COMPLETED",
      amountMinor: payment.amountKobo,
      currency: payment.currency,
      providerReference: payment.providerReference,
      raw: { simulated: true, note: "Local test provider verification. Not a real payment." }
    };
  } else {
    verification = await adapters[input.provider].verify(payment.providerReference);
  }

  if (!verification || verification.status !== "COMPLETED") {
    await markPaymentFailed({
      paymentId: payment.id,
      orderId: payment.orderId,
      reason: verification?.failureReason || "Payment was not completed by the provider.",
      raw: input.rawWebhook
    });
    throw new ApiError(402, "payment_failed", verification?.failureReason || "Payment failed.");
  }

  if (verification.amountMinor !== payment.amountKobo || verification.currency !== payment.currency) {
    await markPaymentFailed({
      paymentId: payment.id,
      orderId: payment.orderId,
      reason: `Amount/currency mismatch: expected ${payment.amountKobo} ${payment.currency}, received ${verification.amountMinor} ${verification.currency}.`
    });
    throw new ApiError(409, "amount_mismatch", "Verified payment amount does not match the order total.");
  }

  /**
   * Whether this call actually moved the payment from PENDING to COMPLETED.
   *
   * The pre-transaction read is only a fast path: two concurrent verifications
   * of the same reference both see PENDING. Exactly one wins the order lock and
   * commits the escrow; the loser must report `duplicate: true` and must not
   * re-send the paid notification or the affiliate conversion.
   */
  const settlement = await prisma.$transaction(async (tx) => {
    await lockOrderRow(tx, payment.orderId);
    const locked = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM "Payment" WHERE id = ${payment.id} FOR UPDATE
    `;
    if (locked[0]?.status === "COMPLETED") return { settledNow: false };
    if (locked[0]?.status === "FAILED") {
      // The provider verification above reported completion, but a concurrent
      // cancellation/failure callback marked the attempt FAILED while that
      // request was in flight. The money may have left the customer, so this is
      // a reconciliation signal, not an ordinary "already failed" response.
      await recordAudit({
        tx,
        actorId: payment.order.customerId,
        action: "payment.verified_after_failure",
        entity: "Payment",
        entityId: payment.id,
        metadata: {
          orderId: payment.orderId,
          provider: payment.provider,
          providerReference: payment.providerReference,
          amountKobo: payment.amountKobo.toString(),
          currency: payment.currency,
          note: "Provider verification completed after the local attempt was marked failed. No escrow was created; finance must reconcile the charge."
        }
      });
      throw new ApiError(
        409,
        "payment_reconciliation_required",
        "The provider reported this payment as completed after the local attempt was marked failed. No escrow was created; the charge needs reconciliation."
      );
    }

    // Re-read the order under the lock. A cancellation, expiry or refund can
    // commit after the pre-read; finalizing a payment onto a closed order would
    // create escrow/delivery rows for an order that no longer exists
    // operationally. The provider result is recorded for reconciliation and the
    // escrow is deliberately not created.
    const currentOrder = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
    if (["cancelled", "refunded"].includes(currentOrder.status)) {
      await recordAudit({
        tx,
        actorId: currentOrder.customerId,
        action: "payment.verified_order_closed",
        entity: "Payment",
        entityId: payment.id,
        metadata: {
          orderId: currentOrder.id,
          provider: payment.provider,
          providerReference: payment.providerReference,
          amountKobo: payment.amountKobo.toString(),
          currency: payment.currency,
          orderStatus: currentOrder.status,
          note: "Provider reported completion after the order closed. No escrow was created; reconcile with the provider."
        }
      });
      throw new ApiError(
        409,
        "order_closed",
        "This order closed before the payment was confirmed. No escrow was created; the provider result needs reconciliation."
      );
    }
    if (currentOrder.paymentStatus === "paid") return { settledNow: false };

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "COMPLETED",
        verifiedAt: new Date(),
        raw: input.rawWebhook
          ? JSON.parse(JSON.stringify(input.rawWebhook))
          : verification.raw
            ? JSON.parse(JSON.stringify(verification.raw))
            : undefined
      }
    });
    await finalizePaidOrder(tx, {
      order: currentOrder,
      payment,
      walletDebit: input.provider === "wallet",
      actorId: currentOrder.customerId
    });
    return { settledNow: true };
  });

  if (!settlement.settledNow) {
    return { status: "COMPLETED" as const, orderId: payment.orderId, duplicate: true };
  }

  // Post-commit: a notification failure must never undo a verified payment.
  await notifyOrderPaid({
    id: payment.orderId,
    orderNumber: payment.order.orderNumber,
    totalKobo: payment.order.totalKobo,
    customerId: payment.order.customerId
  });

  // Commission is created from the attribution frozen at checkout, never from a
  // cookie or request value. It runs after the payment transaction commits: a
  // commission failure must not undo a verified payment, and the frozen row and
  // the unique dedupe key make a retry safe.
  try {
    const attribution = await prisma.orderAttribution.findUnique({ where: { orderId: payment.orderId } });
    if (attribution) {
      const outcome = await recordConversion({
        entityType: "Order",
        entityId: payment.orderId,
        attributionTouchId: attribution.touchId,
        customerId: payment.order.customerId,
        basisKobo: payment.order.totalKobo,
        subtotalKobo: payment.order.subtotalKobo,
        totalKobo: payment.order.totalKobo
      });
      if (!outcome.created) {
        log.warn("affiliate.conversion_not_created", { orderId: payment.orderId, reason: outcome.reason });
      }
    }
  } catch (error) {
    log.warn("affiliate.conversion_failed", {
      orderId: payment.orderId,
      error: error instanceof Error ? error.message.slice(0, 160) : "unknown"
    });
  }

  return { status: "COMPLETED" as const, orderId: payment.orderId, duplicate: false };
}

/**
 * Split a refund between the seller and the platform.
 *
 * The split is the *increment* of each party's cumulative share, not a fresh
 * proportional calculation for every request. Two independent floor divisions
 * (one per refund) can allocate one kobo more than the released payable over a
 * sequence of refunds, which matters because the refund path only has the
 * released payable and platform cut to reverse. The cumulative form makes the
 * shares of a fully refunded order add up exactly to `payableKobo` and
 * `totalKobo - payableKobo`.
 */
export function allocateRefundShares(input: {
  totalKobo: bigint;
  payableKobo: bigint;
  alreadyRefundedKobo: bigint;
  requestedKobo: bigint;
}) {
  const { totalKobo, payableKobo, alreadyRefundedKobo, requestedKobo } = input;
  if (totalKobo <= BigInt(0)) {
    return { vendorShareKobo: BigInt(0), platformShareKobo: requestedKobo };
  }
  const priorVendor = (payableKobo * alreadyRefundedKobo) / totalKobo;
  const cumulativeVendor = (payableKobo * (alreadyRefundedKobo + requestedKobo)) / totalKobo;
  const vendorShareKobo = cumulativeVendor - priorVendor;
  return { vendorShareKobo, platformShareKobo: requestedKobo - vendorShareKobo };
}

type LockedRefundOrder = Awaited<ReturnType<typeof lockAndReadRefundOrder>>;

type RefundBasis = {
  alreadyRefundedKobo: bigint;
  requestedKobo: bigint;
  isFullRefund: boolean;
};

/**
 * Take the order row lock every money-moving refund and completion needs, then
 * read the authoritative payment and escrow state under that lock. Postgres row
 * locks make the later conditional wallet updates refuse instead of overdrawing
 * when another writer changed the order first.
 */
async function lockAndReadRefundOrder(tx: Prisma.TransactionClient, orderId: string) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
  `;
  if (locked.length === 0) throw new ApiError(404, "order_not_found", "Order not found.");
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true, escrowHolds: { orderBy: { createdAt: "asc" } } }
  });
  const completedPayment = order.payments.find((payment) => payment.status === "COMPLETED");
  if (!completedPayment) throw new ApiError(409, "no_payment", "No completed payment was found for this order.");
  return { order, completedPayment, escrow: order.escrowHolds[0] ?? null };
}

/**
 * Refuse a refund whose buyer-of-record is not the wallet that funded the hold.
 *
 * `EscrowHold.buyerWalletId` is the wallet a refund debits/credits. Legacy
 * external escrows were created with the customer as the buyer of record even
 * though `recordEscrow` had debited the SYSTEM wallet (incident
 * ND-20261109-285D47). Trusting the escrow row then refunds out of the
 * customer's held pool, which may be backing unrelated orders.
 *
 * The hold transaction is the authoritative funding record: `recordEscrow`
 * always writes exactly one `type = "hold"` transaction whose `walletId` is the
 * wallet it debited. When it exists, the escrow buyer of record must match it.
 * Rows that predate the hold journal (manual fixtures, very old imports) have
 * no proof either way and keep the historical behaviour; they are reported in
 * reconciliation instead of being silently treated as consistent.
 */
async function assertRefundFundingSource(
  db: Db,
  orderId: string,
  escrow: { buyerWalletId: string; amountKobo: bigint } | null
) {
  if (!escrow) return;
  const holds = await db.walletTransaction.findMany({
    where: { orderId, type: "hold" },
    select: { reference: true, walletId: true, amountKobo: true },
    orderBy: { createdAt: "asc" }
  });
  if (holds.length === 0) return;
  if (holds.length > 1) {
    throw new ApiError(
      409,
      "refund_funding_source_unknown",
      "This order has more than one escrow funding journal. Reconcile it before any refund."
    );
  }
  const hold = holds[0];
  if (hold.amountKobo !== escrow.amountKobo) {
    throw new ApiError(
      409,
      "refund_funding_source_mismatch",
      "The escrow amount does not match the journal that funded it. Reconcile the order before any refund."
    );
  }
  if (hold.walletId !== escrow.buyerWalletId) {
    throw new ApiError(
      409,
      "refund_funding_source_mismatch",
      "The escrow buyer of record is not the wallet that funded the hold. The refund is refused so unrelated held funds cannot be debited. Correct the legacy escrow record under operator approval first."
    );
  }
}

function computeRefundBasis(
  order: { paymentStatus: string; refundedKobo: bigint; totalKobo: bigint },
  requestedKobo: bigint | undefined,
  mode: "initial" | "locked"
): RefundBasis {
  if (order.paymentStatus === "refunded") {
    throw new ApiError(409, "already_refunded", "This order has already been fully refunded.");
  }
  if (!["paid", "partially_refunded", "refund_pending"].includes(order.paymentStatus)) {
    throw new ApiError(409, "not_paid", "Only paid orders can be refunded.");
  }
  const alreadyRefundedKobo = order.refundedKobo ?? BigInt(0);
  const remainingKobo = order.totalKobo - alreadyRefundedKobo;
  if (remainingKobo <= BigInt(0)) {
    throw new ApiError(409, "already_refunded", "This order has already been fully refunded.");
  }
  const requested = requestedKobo ?? remainingKobo;
  if (requested <= BigInt(0) || requested > remainingKobo) {
    // Inside the lock the only way this fails is that another request changed
    // the order after the caller read it, so it is a conflict, not bad input.
    if (mode === "locked") {
      throw new ApiError(409, "refund_conflict", "Another refund changed this order. Reload and try again.");
    }
    throw new ApiError(400, "invalid_refund_amount", `Refund must be between 1 and ${remainingKobo} kobo.`);
  }
  return {
    alreadyRefundedKobo,
    requestedKobo: requested,
    isFullRefund: requested === remainingKobo
  };
}

async function claimRefund(
  tx: Prisma.TransactionClient,
  input: { orderId: string; paymentId: string; actorId: string; reason: string; idempotencyKey: string },
  basis: RefundBasis,
  meta: { provider: string; escrowReleasedAtClaim: boolean }
) {
  const claim = await tx.order.updateMany({
    where: { id: input.orderId, refundedKobo: basis.alreadyRefundedKobo },
    data: { refundedKobo: { increment: basis.requestedKobo } }
  });
  if (claim.count === 0) {
    throw new ApiError(409, "refund_conflict", "Another refund changed this order. Reload and try again.");
  }
  const refund = await tx.refund.create({
    data: {
      orderId: input.orderId,
      paymentId: input.paymentId,
      actorId: input.actorId,
      amountKobo: basis.requestedKobo,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      status: "PENDING"
    }
  });
  // The reservation and its lifecycle event commit together: a crash can leave
  // a reserved attempt but never a reservation with no record of why it exists.
  await recordRefundLifecycle(tx, {
    refundId: refund.id,
    actorId: input.actorId,
    payload: {
      state: "reserved",
      provider: meta.provider,
      amountKobo: basis.requestedKobo.toString(),
      priorRefundedKobo: basis.alreadyRefundedKobo.toString(),
      escrowReleasedAtClaim: meta.escrowReleasedAtClaim,
      note: input.reason
    }
  });
  return refund;
}

/**
 * Move the money for a claimed refund and close the claim.
 *
 * The buyer of record is the escrow's `buyerWalletId`: the customer for a wallet
 * payment, the platform for a verified external payment. That keeps stored
 * balances and the journal on the same side of every movement.
 *
 * The vendor/platform split is computed from the refunds that have actually
 * settled (`COMPLETED`), not from the order's reservation total. That matters
 * for odd-kobo cumulative allocations: a pending claim can fail, and a split
 * based on its reservation would leave the vendor one kobo over its exact share.
 * Settlements are serialised by the order row lock, so the completed total is
 * stable while this function runs.
 */
async function settleRefund(
  tx: Prisma.TransactionClient,
  input: {
    locked: LockedRefundOrder;
    refund: Refund;
    providerReference?: string | null;
    reason: string;
    restock?: boolean;
  }
) {
  const { locked, refund } = input;
  const { order, completedPayment, escrow } = locked;
  if (refund.status === "COMPLETED") {
    const completed = await tx.refund.aggregate({
      where: { orderId: order.id, status: "COMPLETED" },
      _sum: { amountKobo: true }
    });
    // A replayed refund reports the *current* per-item stock state instead of
    // inventing a restore. No ledger rows means the order predates the ledger
    // (or was never restocked); that is reported as unknown, not as restored.
    const ledger = await tx.orderItemRestock.findMany({ where: { orderId: order.id } });
    const pending = ledger.filter((row) => row.status === "SUPPRESSED");
    const complete =
      ledger.length > 0 &&
      (await tx.orderItem.count({ where: { orderId: order.id } })) ===
        ledger.filter((row) => row.status === "RESTORED" || row.status === "LEGACY_RECORDED").length;
    return {
      orderId: order.id,
      refundedKobo: refund.amountKobo.toString(),
      totalRefundedKobo: (completed._sum.amountKobo ?? refund.amountKobo).toString(),
      reservedKobo: order.refundedKobo.toString(),
      refundId: refund.id,
      idempotent: true,
      status: "COMPLETED" as const,
      stockRecovery: {
        status: pending.length > 0 ? ("suppressed" as const) : complete ? ("already_recorded" as const) : ("unknown" as const),
        restockComplete: complete,
        legacyMarkerOnly: ledger.length === 0,
        restoredItems: [],
        suppressedItems: [],
        pendingSuppressedItems: pending.map((row) => ({
          orderItemId: row.orderItemId,
          productId: row.productId,
          quantity: row.quantity,
          reason: row.reason ?? "unknown"
        }))
      }
    };
  }
  if (refund.status !== "PENDING") {
    throw new ApiError(409, "refund_failed", "This refund attempt is no longer pending and cannot be settled.");
  }

  // The buyer of record must be the wallet that actually funded the hold. A
  // legacy external escrow that points at the customer while SYSTEM funded it
  // would otherwise refund from another order's held pool.
  await assertRefundFundingSource(tx, order.id, escrow);

  const requested = refund.amountKobo;
  const completed = await tx.refund.aggregate({
    where: { orderId: order.id, status: "COMPLETED" },
    _sum: { amountKobo: true }
  });
  const alreadySettledKobo = completed._sum.amountKobo ?? BigInt(0);
  const settledAfterKobo = alreadySettledKobo + requested;
  if (settledAfterKobo > order.totalKobo) {
    throw new ApiError(409, "refund_conflict", "Refund settlement would exceed the order total.");
  }
  const isFullRefund = settledAfterKobo === order.totalKobo;
  const escrowReleased = !escrow || escrow.status === "released";

  const vendorWallet = await ensureWallet(tx, { vendorId: order.vendorId, ownerType: "VENDOR" });
  const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
  const buyerWalletId = escrow
    ? escrow.buyerWalletId
    : completedPayment.provider === "wallet"
      ? (await ensureWallet(tx, { userId: order.customerId, ownerType: "CUSTOMER" })).id
      : platform.id;
  const payable = order.subtotalKobo - order.commissionKobo + order.deliveryFeeKobo;
  const { vendorShareKobo: vendorShare, platformShareKobo: platformShare } = allocateRefundShares({
    totalKobo: order.totalKobo,
    payableKobo: payable,
    alreadyRefundedKobo: alreadySettledKobo,
    requestedKobo: requested
  });

  if (escrowReleased) {
    // Money already left escrow: reverse each recipient's spendable balance.
    if (completedPayment.provider === "wallet") {
      await tx.wallet.update({ where: { id: buyerWalletId }, data: { availableKobo: { increment: requested } } });
      if (vendorShare > BigInt(0)) {
        const debit = await tx.wallet.updateMany({
          where: { id: vendorWallet.id, availableKobo: { gte: vendorShare } },
          data: { availableKobo: { decrement: vendorShare } }
        });
        if (debit.count === 0) throw new ApiError(409, "refund_conflict", "Seller payable is no longer available to reverse.");
      }
      if (platformShare > BigInt(0)) {
        const debit = await tx.wallet.updateMany({
          where: { id: platform.id, availableKobo: { gte: platformShare } },
          data: { availableKobo: { decrement: platformShare } }
        });
        if (debit.count === 0) throw new ApiError(409, "refund_conflict", "Platform fee balance is no longer available to reverse.");
      }
    } else {
      // The platform was the buyer of record for the external payment. The
      // external inflow credit (`requested`) and the platform's own share
      // reversal (`platformShare`) net to `requested - platformShare`, which is
      // the vendor share clawed back before the provider refund leaves. SYSTEM
      // is negative by convention after an external hold, so demanding a
      // positive fee balance here would reject every correct external refund.
      if (vendorShare > BigInt(0)) {
        const debit = await tx.wallet.updateMany({
          where: { id: vendorWallet.id, availableKobo: { gte: vendorShare } },
          data: { availableKobo: { decrement: vendorShare } }
        });
        if (debit.count === 0) throw new ApiError(409, "refund_conflict", "Seller payable is no longer available to reverse.");
      }
      const platformNetCreditKobo = requested - platformShare;
      if (platformNetCreditKobo < BigInt(0)) throw new Error("Refund platform share exceeds the refund amount.");
      await tx.wallet.update({
        where: { id: platform.id },
        data: { availableKobo: { increment: platformNetCreditKobo } }
      });
    }
  } else {
    // The escrow is still open: return the refunded amount from the buyer's hold
    // and reduce the vendor's payable hold. Both parties held `requested` after
    // the previous partial refunds, so the conditional updates cannot overdraw.
    const buyer = await tx.wallet.updateMany({
      where: { id: buyerWalletId, heldKobo: { gte: requested } },
      data: { heldKobo: { decrement: requested }, availableKobo: { increment: requested } }
    });
    if (buyer.count === 0) throw new ApiError(409, "refund_conflict", "The remaining escrow hold is no longer available to refund.");
    const vendor = await tx.wallet.updateMany({
      where: { id: vendorWallet.id, heldKobo: { gte: requested } },
      data: { heldKobo: { decrement: requested } }
    });
    if (vendor.count === 0) throw new ApiError(409, "refund_conflict", "Seller escrow hold is no longer available to reverse.");
  }

  const ledgerEntries = escrowReleased
    ? completedPayment.provider === "wallet"
      ? [
          { walletId: buyerWalletId, direction: "CREDIT" as const, amountKobo: requested, memo: "Buyer partial refund credited to wallet" },
          { walletId: vendorWallet.id, direction: "DEBIT" as const, amountKobo: vendorShare, memo: "Seller payable reversed" },
          { walletId: platform.id, direction: "DEBIT" as const, amountKobo: platformShare, memo: "Commission and fee reversed" }
        ]
      : [
          { walletId: vendorWallet.id, direction: "DEBIT" as const, amountKobo: vendorShare, memo: "Seller payable reversed" },
          { walletId: platform.id, direction: "DEBIT" as const, amountKobo: platformShare, memo: "Commission and fee reversed" },
          { walletId: platform.id, direction: "CREDIT" as const, amountKobo: requested, memo: "External refund settled through the platform account" }
        ]
    : [
        { walletId: buyerWalletId, direction: "CREDIT" as const, amountKobo: requested, memo: "Escrow returned to the buyer of record" },
        { walletId: vendorWallet.id, direction: "DEBIT" as const, amountKobo: requested, memo: "Vendor escrow payable reversed" }
      ];

  const postings = ledgerEntries.filter((entry) => entry.amountKobo > BigInt(0));
  const debitKobo = postings
    .filter((entry) => entry.direction === "DEBIT")
    .reduce((sum, entry) => sum + entry.amountKobo, BigInt(0));
  const creditKobo = postings
    .filter((entry) => entry.direction === "CREDIT")
    .reduce((sum, entry) => sum + entry.amountKobo, BigInt(0));
  if (debitKobo !== creditKobo) throw new Error("Refund journal does not balance.");

  await tx.walletTransaction.create({
    data: {
      walletId: buyerWalletId,
      orderId: order.id,
      type: "refund",
      amountKobo: requested,
      reference: `REFUND-${refund.id}`,
      description: `${isFullRefund ? "Refund" : "Partial refund"} for ${order.orderNumber}: ${input.reason}`,
      ledger: { create: postings }
    }
  });

  const closed = await tx.refund.updateMany({
    where: { id: refund.id, status: "PENDING" },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      providerReference: input.providerReference ?? refund.providerReference ?? null
    }
  });
  if (closed.count !== 1) {
    throw new ApiError(409, "refund_conflict", "This refund changed while it was settling. Reload and try again.");
  }
  await recordRefundLifecycle(tx, {
    refundId: refund.id,
    actorId: refund.actorId,
    payload: {
      state: "confirmed",
      provider: completedPayment.provider,
      providerReference: input.providerReference ?? refund.providerReference ?? null,
      providerStatus: "SETTLED",
      amountKobo: requested.toString(),
      priorRefundedKobo: alreadySettledKobo.toString(),
      note: isFullRefund ? "Refund settled in full." : "Partial refund settled."
    }
  });

  // Durable affiliate reversal intent, written in the same transaction as the
  // confirmed refund. A crash cannot lose it and a rollback cannot leave one.
  // The worker processes it independently, so an affiliate failure can never
  // fail or roll back the customer's refund.
  // Allocate the eligible portion from the conversion's frozen snapshot. Only
  // the part of the refund that falls inside the commission basis can reduce
  // commission; when the basis is SUBTOTAL the delivery component is excluded.
  const conversion = await tx.affiliateConversion.findFirst({
    where: { entityType: "Order", entityId: order.id },
    orderBy: { createdAt: "desc" }
  });
  let eligibleKobo: bigint | null = null;
  let allocationPolicy: string | null = null;

  if (!conversion) {
    // Nothing was ever commissioned on this order, so there is nothing to adjust.
    eligibleKobo = 0n;
    allocationPolicy = "no_conversion_v1";
  } else if (!conversion.basisType) {
    // Historical row with no frozen basis: the eligible portion is unknowable and
    // must be reviewed rather than guessed from the editable campaign.
    eligibleKobo = null;
    allocationPolicy = null;
  } else {
    const priorIntents = await tx.affiliateReversalIntent.findMany({
      where: { orderId: order.id, eligibleKobo: { not: null } },
      select: { eligibleKobo: true }
    });
    const priorEligible = priorIntents.reduce((sum, row) => sum + (row.eligibleKobo ?? 0n), 0n);
    // Cumulative proportional allocation, not "consume the subtotal first".
    // A refund of the whole order includes delivery, and only the part that is
    // inside the basis may reduce commission: eligible = requested x basis / paid.
    const paid = order.totalKobo > 0n ? order.totalKobo : conversion.basisKobo;
    const priorGross = await tx.affiliateReversalIntent.aggregate({
      where: { orderId: order.id },
      _sum: { amountKobo: true }
    });
    const cumulativeGross = (priorGross._sum.amountKobo ?? 0n) + requested;
    const cumulativeEligible = (cumulativeGross * conversion.basisKobo) / paid;
    const delta = cumulativeEligible - priorEligible;
    const remainingBasis = conversion.basisKobo - priorEligible;
    const capped = remainingBasis > 0n ? remainingBasis : 0n;
    eligibleKobo = delta < capped ? delta : capped;
    allocationPolicy = `proportional_${conversion.basisType.toLowerCase()}_v1`;
  }

  await tx.affiliateReversalIntent.upsert({
    where: { dedupeKey: `refund:${refund.id}` },
    create: {
      dedupeKey: `refund:${refund.id}`,
      refundId: refund.id,
      orderId: order.id,
      amountKobo: requested,
      eligibleKobo,
      allocationPolicy
    },
    update: {}
  });

  let custody: Awaited<ReturnType<typeof settleRefundDeliveryCustody>> | null = null;
  let stockRestored = false;
  let restockOutcome: Awaited<ReturnType<typeof restockOrderItemsOnce>> | null = null;
  type RefundStockRecoveryStatus =
    | "not_requested"
    | "not_restockable"
    | "restored"
    | "already_recorded"
    | "partially_restored"
    | "suppressed"
    | "unknown";
  const stockRecovery: {
    status: RefundStockRecoveryStatus;
    restockComplete: boolean;
    legacyMarkerOnly: boolean;
    restoredItems: OrderRestockResult["restoredItems"];
    suppressedItems: OrderRestockResult["suppressedItems"];
    pendingSuppressedItems: OrderRestockResult["pendingSuppressedItems"];
  } = {
    status: "not_requested",
    restockComplete: false,
    legacyMarkerOnly: false,
    restoredItems: [],
    suppressedItems: [],
    pendingSuppressedItems: []
  };
  if (isFullRefund) {
    await tx.payment.update({ where: { id: completedPayment.id }, data: { status: "REFUNDED" } });
    // The order-level payment state must move with the payment record, or a
    // fully refunded order keeps reporting `paymentStatus: "paid"`.
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "refunded" } });
    // A hold that was already released keeps its real history; the refund is
    // recorded on the order and the refund row instead.
    if (escrow && !escrowReleased) {
      await tx.escrowHold.update({
        where: { id: escrow.id },
        data: { status: "refunded", events: { create: { from: escrow.status, to: "refunded", note: input.reason } } }
      });
    }

    // Custody first, then stock. A refund does not make a collected parcel
    // disappear: uncollected deliveries are cancelled, collected ones are
    // retained with a custody event, and the restock decision comes from that
    // physical state. `input.restock` remains the caller's request, but it is
    // clamped so stock can never be restored for goods a courier already holds
    // or the customer already received.
    custody = await settleRefundDeliveryCustody({
      tx,
      actorId: refund.actorId,
      orderId: order.id,
      reason: `Order refunded in full: ${input.reason}`,
      refundId: refund.id
    });
    restockOutcome =
      Boolean(input.restock) && custody.restockable
        ? await restockOrderItemsOnce(tx, order.id, {
            actorId: refund.actorId,
            source: "refund",
            reason: input.reason
          })
        : null;
    stockRestored = Boolean(restockOutcome?.restored);

    // The refund is financially complete, but physical recovery can still be
    // pending. Record that separately and durably so reconciliation does not
    // have to infer stock state from a successful refund.
    if (restockOutcome && (restockOutcome.pendingSuppressedItems.length > 0 || !restockOutcome.restockComplete)) {
      await recordSystemEvent({
        tx,
        type: "order.stock_recovery_pending",
        actorId: refund.actorId,
        entity: "Order",
        entityId: order.id,
        payload: {
          refundId: refund.id,
          orderId: order.id,
          reason: input.reason,
          restockComplete: restockOutcome.restockComplete,
          legacyMarkerOnly: restockOutcome.legacyMarkerOnly,
          suppressedItems: restockOutcome.pendingSuppressedItems
        }
      });
    }

    if (!input.restock) {
      stockRecovery.status = "not_requested";
    } else if (!custody.restockable) {
      stockRecovery.status = "not_restockable";
    } else if (restockOutcome) {
      stockRecovery.restockComplete = restockOutcome.restockComplete;
      stockRecovery.legacyMarkerOnly = restockOutcome.legacyMarkerOnly;
      stockRecovery.restoredItems = restockOutcome.restoredItems;
      stockRecovery.suppressedItems = restockOutcome.suppressedItems;
      stockRecovery.pendingSuppressedItems = restockOutcome.pendingSuppressedItems;
      if (restockOutcome.restockComplete) {
        stockRecovery.status = restockOutcome.restored ? "restored" : "already_recorded";
      } else {
        stockRecovery.status = restockOutcome.restored ? "partially_restored" : "suppressed";
      }
    }

    await updateOrderStatus({
      tx,
      actorId: refund.actorId,
      orderId: order.id,
      status: "refunded",
      note: `Refund issued: ${input.reason}`
    });
  } else {
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "partially_refunded" } });
  }

  await recordAudit({
    tx,
    actorId: refund.actorId,
    action: isFullRefund ? "payment.refunded" : "payment.partially_refunded",
    entity: "Order",
    entityId: order.id,
    metadata: {
      refundId: refund.id,
      idempotencyKey: refund.idempotencyKey,
      before: {
        paymentStatus: order.paymentStatus,
        orderStatus: order.status,
        refundedKobo: order.refundedKobo.toString(),
        completedRefundKobo: alreadySettledKobo.toString()
      },
      after: {
        paymentStatus: isFullRefund ? "refunded" : "partially_refunded",
        orderStatus: isFullRefund ? "refunded" : order.status,
        completedRefundKobo: settledAfterKobo.toString()
      },
      amountKobo: requested.toString(),
      vendorShareKobo: vendorShare.toString(),
      platformShareKobo: platformShare.toString(),
      reason: input.reason,
      provider: completedPayment.provider,
      restocked: stockRestored,
      restockRequested: Boolean(input.restock) && isFullRefund,
      restockSuppressed:
        Boolean(input.restock) &&
        isFullRefund &&
        (stockRecovery.status === "suppressed" ||
          stockRecovery.status === "partially_restored" ||
          stockRecovery.status === "not_restockable"),
      stockRecovery,
      deliveryCustody: custody?.custody ?? null,
      deliveryOutcomes: custody?.outcomes ?? []
    }
  });

  return {
    orderId: order.id,
    refundedKobo: requested.toString(),
    totalRefundedKobo: settledAfterKobo.toString(),
    reservedKobo: order.refundedKobo.toString(),
    refundId: refund.id,
    status: "COMPLETED" as const,
    restocked: stockRestored,
    stockRecovery,
    deliveryCustody: custody?.custody ?? null,
    deliveryOutcomes: custody?.outcomes ?? []
  };
}

/* ------------------------------------------------- external refund state --- */

type RefundRowWithPayment = Prisma.RefundGetPayload<{ include: { payment: true } }>;

/**
 * Reserve an external refund without contacting the provider.
 *
 * A reservation is a promise that `Order.refundedKobo` covers the amount, so it
 * must be committed before the provider call. Exporting it separately lets a
 * recovery path prove the interrupted-reservation case with the same production
 * code that `refundPayment` uses; it is not a second booking implementation.
 */
export async function reserveExternalRefundClaim(input: {
  orderId: string;
  actorId: string;
  reason: string;
  idempotencyKey: string;
  amountKobo?: bigint;
  restock?: boolean;
}) {

  await assertFinancialOperationsAllowed("External refund reservation");  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { payments: true }
  });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");
  const initialBasis = computeRefundBasis(order, input.amountKobo, "initial");
  if (input.restock && !initialBasis.isFullRefund) {
    throw new ApiError(400, "invalid_restock", "Stock can only be restocked on a full refund.");
  }
  const completed = order.payments.find((payment) => payment.status === "COMPLETED");
  if (!completed) throw new ApiError(409, "no_payment", "No completed payment was found for this order.");
  if (completed.provider === "wallet") {
    throw new ApiError(400, "not_external_refund", "Wallet refunds must settle atomically; use refundPayment.");
  }

  const claimed = await prisma.$transaction(async (tx) => {
    const locked = await lockAndReadRefundOrder(tx, order.id);
    // Validate before reserving anything: a refused recovery must not strand a
    // claim against the order.
    await assertRefundFundingSource(tx, order.id, locked.escrow);
    const basis = computeRefundBasis(locked.order, input.amountKobo, "locked");
    if (input.restock && !basis.isFullRefund) {
      throw new ApiError(400, "invalid_restock", "Stock can only be restocked on a full refund.");
    }
    const refund = await claimRefund(
      tx,
      {
        orderId: order.id,
        paymentId: locked.completedPayment.id,
        actorId: input.actorId,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey
      },
      basis,
      {
        provider: completed.provider,
        escrowReleasedAtClaim: locked.escrow?.status === "released"
      }
    );
    return {
      refundId: refund.id,
      requestedKobo: basis.requestedKobo,
      alreadyRefundedKobo: basis.alreadyRefundedKobo,
      escrowReleasedAtClaim: locked.escrow?.status === "released"
    };
  });
  return claimed;
}

const defaultRefundReason = (refund: Refund) => refund.reason;

/**
 * Mark the reservation as submitted, in its own committed transaction, before
 * the provider is called. If the process dies immediately after this point the
 * attempt is unacknowledged and therefore unknown, never silently repeated.
 */
async function beginExternalRefundSubmission(input: {
  refundId: string;
  actorId: string;
  provider: string;
}): Promise<{ submitted: boolean; state: string; acknowledged: boolean }> {
  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: input.refundId } });
    await lockAndReadRefundOrder(tx, refund.orderId);
    const fresh = await tx.refund.findUniqueOrThrow({ where: { id: input.refundId } });
    if (fresh.status === "COMPLETED") return { submitted: false, state: "confirmed", acknowledged: true };
    if (fresh.status === "FAILED") return { submitted: false, state: "failed", acknowledged: false };
    const lifecycle = await loadRefundLifecycle(tx, input.refundId);
    if (!lifecycle) {
      return { submitted: false, state: "legacy", acknowledged: false };
    }
    if (lifecycle.state === "reserved") {
      await recordRefundLifecycle(tx, {
        refundId: input.refundId,
        actorId: input.actorId,
        payload: {
          state: "submitted",
          acknowledged: false,
          provider: input.provider,
          providerStatus: "REQUEST_SENT",
          amountKobo: fresh.amountKobo.toString()
        }
      });
      return { submitted: true, state: "reserved", acknowledged: false };
    }
    return { submitted: false, state: lifecycle.state ?? "legacy", acknowledged: lifecycle.acknowledged };
  });
}

/**
 * Release a reservation after a definitive outcome. The order lock and the
 * lifecycle check make this refuse once the provider has confirmed the money
 * moved: a confirmed refund must be settled, never reverted.
 */
async function failExternalRefundReservation(input: {
  refundId: string;
  providerReference?: string | null;
  reason: string;
  note: string;
}) {
  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: input.refundId } });
    await lockAndReadRefundOrder(tx, refund.orderId);
    const fresh = await tx.refund.findUniqueOrThrow({ where: { id: input.refundId } });
    if (fresh.status === "FAILED") return { reverted: false, status: "FAILED" as const, refundId: fresh.id };
    if (fresh.status === "COMPLETED") {
      throw new ApiError(409, "refund_settled", "This refund has already settled and cannot be reverted.");
    }
    const lifecycle = await loadRefundLifecycle(tx, fresh.id);
    if (lifecycle?.state === "confirmed") {
      throw new ApiError(
        409,
        "refund_confirmed",
        "The provider confirmed this refund. It must be settled locally, never released back to the order."
      );
    }
    const reverted = await tx.order.updateMany({
      where: { id: fresh.orderId, refundedKobo: { gte: fresh.amountKobo } },
      data: { refundedKobo: { decrement: fresh.amountKobo } }
    });
    if (reverted.count !== 1) {
      throw new ApiError(
        409,
        "reconciliation_required",
        "The refund reservation no longer matches the order. Reconcile before retrying."
      );
    }
    await tx.refund.update({
      where: { id: fresh.id },
      data: {
        status: "FAILED",
        providerReference: input.providerReference ?? fresh.providerReference ?? null
      }
    });
    await recordRefundLifecycle(tx, {
      refundId: fresh.id,
      actorId: fresh.actorId,
      payload: {
        state: "failed",
        providerReference: input.providerReference ?? fresh.providerReference ?? null,
        amountKobo: fresh.amountKobo.toString(),
        note: `${input.reason}: ${input.note}`
      }
    });
    return { reverted: true, status: "FAILED" as const, refundId: fresh.id };
  });
}

/** Record an ambiguous provider outcome. The reservation deliberately stays. */
async function markExternalRefundUnknown(refundId: string, note: string) {
  await prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    await lockAndReadRefundOrder(tx, refund.orderId);
    const fresh = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    if (fresh.status !== "PENDING") return;
    const lifecycle = await loadRefundLifecycle(tx, refundId);
    if (lifecycle?.state === "confirmed") return;
    await recordRefundLifecycle(tx, {
      refundId,
      actorId: fresh.actorId,
      payload: {
        state: "unknown",
        amountKobo: fresh.amountKobo.toString(),
        note
      }
    });
  });
}

/** Provider acknowledged the request but reports it as still processing. */
async function recordExternalRefundPending(input: {
  refundId: string;
  provider: string;
  providerReference?: string | null;
}) {
  await prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: input.refundId } });
    await lockAndReadRefundOrder(tx, refund.orderId);
    const fresh = await tx.refund.findUniqueOrThrow({ where: { id: input.refundId } });
    if (fresh.status !== "PENDING") return;
    const lifecycle = await loadRefundLifecycle(tx, input.refundId);
    if (lifecycle?.state === "confirmed" || lifecycle?.state === "failed") return;
    await tx.refund.update({
      where: { id: fresh.id },
      data: { providerReference: input.providerReference ?? fresh.providerReference ?? null }
    });
    await recordRefundLifecycle(tx, {
      refundId: fresh.id,
      actorId: fresh.actorId,
      payload: {
        state: "submitted",
        acknowledged: true,
        provider: input.provider,
        providerReference: input.providerReference ?? null,
        providerStatus: "PENDING",
        amountKobo: fresh.amountKobo.toString()
      }
    });
  });
}

/** Provider confirmed completion. Settlement is a separate, recoverable step. */
async function recordExternalRefundConfirmed(input: {
  refundId: string;
  provider: string;
  providerReference?: string | null;
}) {
  await prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: input.refundId } });
    await lockAndReadRefundOrder(tx, refund.orderId);
    const fresh = await tx.refund.findUniqueOrThrow({ where: { id: input.refundId } });
    if (fresh.status === "COMPLETED") return;
    if (fresh.status === "FAILED") {
      throw new ApiError(409, "refund_failed", "This refund is already failed; a confirmation cannot reopen it.");
    }
    await tx.refund.update({
      where: { id: fresh.id },
      data: { providerReference: input.providerReference ?? fresh.providerReference ?? null }
    });
    await recordRefundLifecycle(tx, {
      refundId: fresh.id,
      actorId: fresh.actorId,
      payload: {
        state: "confirmed",
        provider: input.provider,
        providerReference: input.providerReference ?? null,
        providerStatus: "COMPLETED",
        amountKobo: fresh.amountKobo.toString()
      }
    });
  });
}

/**
 * Settle a provider-confirmed refund from local evidence. This is the recovery
 * path after a crash between confirmation and posting; it never contacts the
 * provider again.
 */
export async function settleConfirmedExternalRefund(input: {
  refundId: string;
  actorId?: string;
  reason?: string;
  restock?: boolean;
}) {

  await assertFinancialOperationsAllowed("External refund settlement");  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: input.refundId } });
    const locked = await lockAndReadRefundOrder(tx, refund.orderId);
    const fresh = await tx.refund.findUniqueOrThrow({ where: { id: input.refundId } });
    if (fresh.status === "COMPLETED") {
      const completed = await tx.refund.aggregate({
        where: { orderId: fresh.orderId, status: "COMPLETED" },
        _sum: { amountKobo: true }
      });
      return {
        orderId: fresh.orderId,
        refundedKobo: fresh.amountKobo.toString(),
        totalRefundedKobo: (completed._sum.amountKobo ?? fresh.amountKobo).toString(),
        reservedKobo: locked.order.refundedKobo.toString(),
        refundId: fresh.id,
        idempotent: true,
        status: "COMPLETED" as const
      };
    }
    if (fresh.status === "FAILED") {
      throw new ApiError(409, "refund_failed", "This refund attempt failed. Use a new idempotency key.");
    }
    const lifecycle = await loadRefundLifecycle(tx, fresh.id);
    if (lifecycle?.state !== "confirmed") {
      throw new ApiError(
        409,
        "refund_not_confirmed",
        "The provider has not confirmed this refund, so it cannot be settled."
      );
    }
    return settleRefund(tx, {
      locked,
      refund: fresh,
      providerReference: lifecycle.providerReference,
      reason: input.reason ?? defaultRefundReason(fresh),
      restock: input.restock
    });
  });
}

async function submitExternalRefundClaim(input: {
  refundId: string;
  actorId: string;
  reason: string;
  restock?: boolean;
  idempotencyKey: string;
}) {
  const refund = await prisma.refund.findUnique({
    where: { id: input.refundId },
    include: { payment: true }
  });
  if (!refund) throw new ApiError(404, "refund_not_found", "Refund attempt not found.");
  if (refund.status === "COMPLETED") {
    return {
      orderId: refund.orderId,
      refundedKobo: refund.amountKobo.toString(),
      idempotent: true,
      refundId: refund.id,
      status: "COMPLETED" as const
    };
  }
  if (refund.status === "FAILED") {
    throw new ApiError(409, "refund_failed", "This refund attempt failed. Use a new idempotency key.");
  }

  const provider = refund.payment.provider as AdapterId;
  if (provider === "wallet") {
    throw new ApiError(400, "not_external_refund", "Wallet refunds settle atomically and cannot be submitted externally.");
  }
  const adapter = adapters[provider];
  if (!adapter?.refund) {
    await failExternalRefundReservation({
      refundId: refund.id,
      reason: "Provider does not support refunds",
      note: `${provider} refunds are not configured on this server.`
    });
    throw new ApiError(503, "refund_unsupported", `${provider} refunds are not configured on this server.`);
  }

  // Check the funding record before the provider is contacted. The settlement
  // path repeats this under the order lock; a legacy mismatch must never send a
  // refund request that the local books cannot post to the correct wallet.
  const escrow = await prisma.escrowHold.findFirst({
    where: { orderId: refund.orderId },
    orderBy: { createdAt: "asc" },
    select: { buyerWalletId: true, amountKobo: true }
  });
  await assertRefundFundingSource(prisma, refund.orderId, escrow);

  const begin = await beginExternalRefundSubmission({
    refundId: refund.id,
    actorId: input.actorId,
    provider
  });
  if (!begin.submitted) {
    if (begin.state === "confirmed") {
      return settleConfirmedExternalRefund({
        refundId: refund.id,
        actorId: input.actorId,
        reason: input.reason,
        restock: input.restock
      });
    }
    if (begin.state === "failed") {
      throw new ApiError(409, "refund_failed", "This refund attempt failed. Use a new idempotency key.");
    }
    if (begin.state === "submitted" && begin.acknowledged) {
      throw new ApiError(
        409,
        "refund_pending",
        "This refund request is already with the provider and has not completed. Do not resubmit it."
      );
    }
    if (begin.state === "submitted" || begin.state === "unknown") {
      throw new ApiError(
        409,
        "refund_unknown",
        "This refund request was already submitted and its provider outcome is not confirmed. Do not resubmit it; reconcile first."
      );
    }
    throw new ApiError(
      409,
      "refund_pending",
      "This refund attempt has no recorded provider submission. It must be reconciled before any retry."
    );
  }

  let result;
  try {
    result = await adapter.refund({
      reference: refund.payment.providerReference,
      amountMinor: refund.amountKobo,
      currency: refund.payment.currency,
      idempotencyKey: input.idempotencyKey
    });
  } catch (error) {
    if (isDefinitiveProviderRejection(error)) {
      const message = error instanceof Error ? error.message : "The provider rejected the refund request.";
      await failExternalRefundReservation({
        refundId: refund.id,
        reason: "Provider rejected the refund",
        note: message
      });
      throw new ApiError(502, "refund_failed", `${message} The amount was released back to the order.`);
    }
    await markExternalRefundUnknown(
      refund.id,
      error instanceof Error ? error.message : "The provider request did not return a definitive outcome."
    );
    throw new ApiError(
      502,
      "refund_unknown",
      "The provider did not confirm whether this refund was processed. It is not retried automatically; reconcile the attempt first."
    );
  }

  if (result.status === "COMPLETED") {
    await recordExternalRefundConfirmed({
      refundId: refund.id,
      provider,
      providerReference: result.providerReference ?? null
    });
    return settleConfirmedExternalRefund({
      refundId: refund.id,
      actorId: input.actorId,
      reason: input.reason,
      restock: input.restock
    });
  }

  if (result.status === "FAILED") {
    await failExternalRefundReservation({
      refundId: refund.id,
      providerReference: result.providerReference ?? null,
      reason: "Provider reported the refund as failed",
      note: "The provider rejected the refund request."
    });
    throw new ApiError(502, "refund_failed", "The provider reported that this refund failed. The amount was released back to the order.");
  }

  await recordExternalRefundPending({
    refundId: refund.id,
    provider,
    providerReference: result.providerReference ?? null
  });
  throw new ApiError(
    502,
    "refund_pending",
    `${adapter.label} accepted the refund request and has not completed it. The amount remains reserved and blocks release until it settles.`
  );
}

async function resumeRefundAttempt(
  prior: RefundRowWithPayment,
  input: { orderId: string; actorId: string; reason: string; restock?: boolean; idempotencyKey?: string }
) {
  if (prior.status === "COMPLETED") {
    return { orderId: prior.orderId, refundedKobo: prior.amountKobo.toString(), idempotent: true, refundId: prior.id, status: "COMPLETED" as const };
  }
  if (prior.status === "FAILED") {
    throw new ApiError(409, "refund_failed", "This refund attempt failed. Use a new idempotency key.");
  }
  if (prior.payment.provider === "wallet") {
    throw new ApiError(409, "refund_pending", "This wallet refund is still settling. Reload before retrying.");
  }
  const lifecycle = await loadRefundLifecycle(prisma, prior.id);
  if (!lifecycle) {
    throw new ApiError(
      409,
      "refund_pending",
      "This refund attempt predates lifecycle tracking and is still pending. Do not resubmit it; reconcile first."
    );
  }
  if (lifecycle.state === "confirmed") {
    return settleConfirmedExternalRefund({
      refundId: prior.id,
      actorId: input.actorId,
      reason: input.reason,
      restock: input.restock
    });
  }
  if (lifecycle.state === "reserved") {
    return submitExternalRefundClaim({
      refundId: prior.id,
      actorId: input.actorId,
      reason: input.reason,
      restock: input.restock,
      idempotencyKey: input.idempotencyKey ?? prior.idempotencyKey
    });
  }
  if (lifecycle.state === "submitted" && lifecycle.acknowledged) {
    throw new ApiError(
      409,
      "refund_pending",
      "The provider accepted this refund request and has not completed it. The amount stays reserved; do not resubmit."
    );
  }
  if (lifecycle.state === "submitted" || lifecycle.state === "unknown") {
    throw new ApiError(
      409,
      "refund_unknown",
      "This refund was already submitted and its provider outcome is not confirmed. Do not resubmit it; reconcile first."
    );
  }
  throw new ApiError(
    409,
    "reconciliation_required",
    "This refund is pending but its lifecycle says it failed. Reconcile the attempt before retrying."
  );
}

/**
 * Operator recovery for an attempt whose provider outcome was unknown or whose
 * confirmation never settled. The caller must have verified the outcome in the
 * provider dashboard; this function records that decision and never calls the
 * provider. `confirmed` settles the refund, `failed` releases the reservation.
 */
export async function reconcileExternalRefundOutcome(input: {
  refundId: string;
  actorId: string;
  outcome: "confirmed" | "failed";
  providerReference?: string;
  note?: string;
}) {

  await assertFinancialOperationsAllowed("External refund reconciliation");  const refund = await prisma.refund.findUnique({
    where: { id: input.refundId },
    include: { payment: true }
  });
  if (!refund) throw new ApiError(404, "refund_not_found", "Refund attempt not found.");
  if (refund.payment.provider === "wallet") {
    throw new ApiError(400, "not_external_refund", "Wallet refunds settle atomically and need no manual reconciliation.");
  }
  if (refund.status === "COMPLETED") {
    return {
      orderId: refund.orderId,
      refundedKobo: refund.amountKobo.toString(),
      idempotent: true,
      refundId: refund.id,
      status: "COMPLETED" as const
    };
  }
  if (refund.status === "FAILED") {
    throw new ApiError(409, "refund_failed", "This refund attempt already failed. Use a new idempotency key.");
  }
  const lifecycle = await loadRefundLifecycle(prisma, refund.id);
  if (!lifecycle) {
    throw new ApiError(
      409,
      "reconciliation_required",
      "This refund has no lifecycle record. Establish its provider state outside this service before recording an outcome."
    );
  }

  if (input.outcome === "confirmed") {
    if (lifecycle.state === "reserved") {
      throw new ApiError(
        409,
        "refund_not_submitted",
        "This refund was never submitted to the provider, so it cannot be confirmed. Resume it instead."
      );
    }
    if (lifecycle.state === "failed") {
      throw new ApiError(409, "reconciliation_required", "A failed refund cannot be confirmed. Check the provider reference.");
    }
    await recordExternalRefundConfirmed({
      refundId: refund.id,
      provider: refund.payment.provider,
      providerReference: input.providerReference ?? lifecycle.providerReference ?? null
    });
    return settleConfirmedExternalRefund({
      refundId: refund.id,
      actorId: input.actorId,
      reason: input.note ?? defaultRefundReason(refund)
    });
  }

  if (lifecycle.state === "confirmed") {
    throw new ApiError(409, "refund_confirmed", "A provider-confirmed refund must be settled, not released.");
  }
  return failExternalRefundReservation({
    refundId: refund.id,
    providerReference: input.providerReference ?? lifecycle.providerReference ?? null,
    reason: "Operator established the refund was not processed",
    note: input.note ?? "Recorded from provider reconciliation."
  });
}

async function resolveRefundConflict(
  error: unknown,
  input: { orderId: string; actorId: string; reason: string; restock?: boolean; idempotencyKey?: string },
  external: boolean
) {
  const sameKeyConflict =
    (error as { code?: string }).code === "P2002" ||
    (!external && error instanceof ApiError && error.code === "refund_conflict");
  if (!sameKeyConflict) throw error;
  const raced = await prisma.refund.findUnique({
    where: { idempotencyKey: input.idempotencyKey ?? "" },
    include: { payment: true }
  });
  if (!raced) throw error;
  if (raced.status === "COMPLETED") {
    return { orderId: raced.orderId, refundedKobo: raced.amountKobo.toString(), idempotent: true, refundId: raced.id, status: "COMPLETED" as const };
  }
  if (!external) {
    throw new ApiError(409, "refund_pending", "An identical refund request is still being settled. Reload before retrying.");
  }
  return resumeRefundAttempt(raced, input);
}

export async function refundPayment(input: {
  orderId: string;
  actorId: string;
  reason: string;
  restock?: boolean;
  /** Partial refund in kobo. Omit to refund the remaining balance. */
  amountKobo?: bigint;
  /** Caller-supplied retry key; the same key never calls the provider twice. */
  idempotencyKey?: string;
}) {

  await assertFinancialOperationsAllowed("Refund");  const idempotencyKey = input.idempotencyKey ?? `refund:${input.orderId}:${randomBytes(10).toString("hex")}`;
  const prior = await prisma.refund.findUnique({
    where: { idempotencyKey },
    include: { payment: true }
  });
  if (prior) {
    return resumeRefundAttempt(prior, { ...input, idempotencyKey });
  }

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { payments: true, escrowHolds: true }
  });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");
  // Validate before reserving anything. The same checks run again under the
  // order lock, where a mismatch means a concurrent writer changed the order.
  const initialBasis = computeRefundBasis(order, input.amountKobo, "initial");
  if (input.restock && !initialBasis.isFullRefund) {
    throw new ApiError(400, "invalid_restock", "Stock can only be restocked on a full refund.");
  }
  const completed = order.payments.find((payment) => payment.status === "COMPLETED");
  if (!completed) throw new ApiError(409, "no_payment", "No completed payment was found for this order.");
  const external = completed.provider !== "wallet";

  try {
    if (external) {
      const claimed = await reserveExternalRefundClaim({
        orderId: order.id,
        actorId: input.actorId,
        reason: input.reason,
        idempotencyKey,
        amountKobo: input.amountKobo,
        restock: input.restock
      });
      return await submitExternalRefundClaim({
        refundId: claimed.refundId,
        actorId: input.actorId,
        reason: input.reason,
        restock: input.restock,
        idempotencyKey
      });
    }

    // Wallet refunds claim and settle in one transaction: a refused movement
    // rolls the claim and the PENDING row back with it, so the order never
    // reports money returned that never moved.
    return await prisma.$transaction(async (tx) => {
      const locked = await lockAndReadRefundOrder(tx, order.id);
      await assertRefundFundingSource(tx, order.id, locked.escrow);
      const basis = computeRefundBasis(locked.order, input.amountKobo, "locked");
      if (input.restock && !basis.isFullRefund) {
        throw new ApiError(400, "invalid_restock", "Stock can only be restocked on a full refund.");
      }
      const refund = await claimRefund(
        tx,
        {
          orderId: order.id,
          paymentId: locked.completedPayment.id,
          actorId: input.actorId,
          reason: input.reason,
          idempotencyKey
        },
        basis,
        {
          provider: completed.provider,
          escrowReleasedAtClaim: !locked.escrow || locked.escrow.status === "released"
        }
      );
      return settleRefund(tx, {
        locked,
        refund,
        reason: input.reason,
        restock: input.restock
      });
    });
  } catch (error) {
    return resolveRefundConflict(error, { ...input, idempotencyKey }, external);
  }
}

export async function processWebhook(provider: "paystack" | "flutterwave", rawBody: string, headers: Headers) {

  await assertFinancialOperationsAllowed("Payment callback");  const adapter = adapters[provider];
  if (!adapter.verifyWebhook) throw new ApiError(400, "webhook_unsupported", "This provider does not accept webhooks.");
  const verified = await adapter.verifyWebhook(rawBody, headers);
  if (!verified) throw new ApiError(401, "invalid_signature", "Webhook signature verification failed.");

  const eventKey = { provider, eventId: verified.eventId };
  const existing = await prisma.webhookEvent.findUnique({ where: { provider_eventId: eventKey } });
  if (existing?.status === "processed") {
    return { received: true, duplicate: true };
  }

  if (existing) {
    // A previous attempt failed. Retry processing the same event instead of
    // treating the provider's retry as a duplicate and leaving it stuck.
    await prisma.webhookEvent.update({
      where: { provider_eventId: eventKey },
      data: { status: "received", payload: JSON.parse(JSON.stringify(verified.raw)) }
    });
  } else {
    try {
      await prisma.webhookEvent.create({
        data: { provider, eventId: verified.eventId, payload: JSON.parse(JSON.stringify(verified.raw)) }
      });
    } catch {
      return { received: true, duplicate: true };
    }
  }

  try {
    if (verified.status === "COMPLETED") {
      await confirmPayment({ reference: verified.reference, provider, rawWebhook: verified.raw });
    } else if (verified.status === "FAILED") {
      const payment = await prisma.payment.findUnique({ where: { providerReference: verified.reference } });
      if (payment) {
        await markPaymentFailed({
          paymentId: payment.id,
          orderId: payment.orderId,
          reason: "Provider reported the payment as failed.",
          raw: verified.raw
        });
      }
    }
    await prisma.webhookEvent.update({
      where: { provider_eventId: eventKey },
      data: { status: "processed", processedAt: new Date() }
    });
    return { received: true, duplicate: false };
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { provider_eventId: eventKey },
      data: { status: "failed", processedAt: new Date() }
    });
    throw error;
  }
}

export { getPaymentByReference };
