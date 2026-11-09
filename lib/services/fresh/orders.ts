import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { recordAudit } from "@/lib/services/core/audit.service";

/**
 * NaijaFresh order lifecycle.
 *
 * A basket spanning several farms becomes one order per farm. Each order is
 * paid from the buyer's NaijaPay wallet into the platform ledger, then follows
 * the farm → courier chain:
 *
 *   payment_pending → placed → accepted → packing → ready_for_pickup
 *   → courier_assigned → picked_up → delivered → completed
 *
 * The farm, not the customer, decides each forward step; the customer may only
 * cancel before the farm accepts. Settlement runs once after delivery PIN
 * confirmation (see dispatch.ts) and is guarded by a unique reference.
 */

export { FRESH_LABELS } from "@/lib/services/fresh/labels";
import { FRESH_LABELS } from "@/lib/services/fresh/labels";

const FARM_TRANSITIONS: Record<string, string[]> = {
  placed: ["accepted", "cancelled"],
  accepted: ["packing"],
  packing: ["ready_for_pickup"]
};

const COURIER_TRANSITIONS: Record<string, string[]> = {
  ready_for_pickup: ["picked_up"],
  courier_assigned: ["picked_up"],
  picked_up: ["delivered"]
};

function orderNumber() {
  return `NFR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

export type CheckoutLine = { listingId: string; quantity: number };

/**
 * Creates one order for a single farm with the given lines. Prices, units and
 * stock come from the listing rows, locked inside the transaction.
 */
export async function createFreshOrder(input: {
  customerId: string;
  farmId: string;
  lines: CheckoutLine[];
  deliveryAddress: string;
  contactName: string;
  contactPhone: string;
  notes?: string;
  orderKind?: "customer" | "business";
}) {
  const address = input.deliveryAddress.trim();
  const name = input.contactName.trim();
  const phone = input.contactPhone.trim();
  if (!address || !name || !phone) throw new ApiError(400, "validation_error", "Delivery name, phone and address are required.");
  if (!input.lines.length) throw new ApiError(400, "empty_order", "Add at least one item.");

  const number = orderNumber();
  return prisma.$transaction(async (tx) => {
    const farm = await tx.farm.findUnique({ where: { id: input.farmId }, select: { id: true, name: true, deliveryFeeKobo: true } });
    if (!farm) throw new ApiError(404, "farm_not_found", "That farm is not available.");

    let subtotal = BigInt(0);
    const rows: Array<{ listing: { id: string; name: string; unit: string; priceKobo: bigint; quantity: number }; quantity: number }> = [];
    for (const line of input.lines) {
      if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new ApiError(400, "invalid_quantity", "Quantities must be whole numbers above zero.");
      const listing = await tx.produceListing.findUnique({
        where: { id: line.listingId },
        select: { id: true, name: true, unit: true, priceKobo: true, available: true, quantity: true, minimumOrder: true, farmId: true }
      });
      if (!listing || listing.farmId !== input.farmId) throw new ApiError(400, "item_unavailable", "One of the items is not sold by this farm.");
      if (!listing.available || listing.quantity <= 0) throw new ApiError(409, "out_of_stock", `${listing.name} is out of stock.`);
      if (line.quantity < listing.minimumOrder) throw new ApiError(400, "below_minimum", `${listing.name} has a minimum order of ${listing.minimumOrder}.`);
      if (line.quantity > listing.quantity) throw new ApiError(409, "insufficient_stock", `Only ${listing.quantity} available for ${listing.name}.`);
      subtotal += listing.priceKobo * BigInt(line.quantity);
      rows.push({ listing, quantity: line.quantity });
    }

    const delivery = farm.deliveryFeeKobo;
    const total = subtotal + delivery;

    const { ensureWallet } = await import("@/lib/payments/service");
    const { postBalancedTransaction } = await import("@/lib/services/core/wallet.service");
    const buyerWallet = await ensureWallet(tx, { userId: input.customerId, ownerType: "CUSTOMER" });
    const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: buyerWallet.id } });
    if (wallet.availableKobo < total) {
      throw new ApiError(402, "insufficient_funds", "Your NaijaPay balance does not cover this order. Top up your wallet first.");
    }

    await tx.wallet.update({ where: { id: buyerWallet.id }, data: { availableKobo: { decrement: total } } });
    await tx.wallet.update({ where: { id: platform.id }, data: { availableKobo: { increment: total } } });
    await postBalancedTransaction({
      tx,
      actorId: input.customerId,
      walletId: buyerWallet.id,
      type: "debit",
      amountKobo: total,
      reference: `FRESH-${number}`,
      description: `NaijaFresh order ${number}`,
      entries: [
        { walletId: buyerWallet.id, direction: "DEBIT", amountKobo: total, memo: "NaijaFresh order paid from wallet" },
        { walletId: platform.id, direction: "CREDIT", amountKobo: total, memo: "NaijaFresh order received" }
      ]
    });

    const order = await tx.freshOrder.create({
      data: {
        orderNumber: number,
        customerId: input.customerId,
        farmId: farm.id,
        orderKind: input.orderKind ?? "customer",
        status: "placed",
        paymentStatus: "paid",
        subtotalKobo: subtotal,
        deliveryFeeKobo: delivery,
        totalKobo: total,
        deliveryAddress: address,
        contactName: name,
        contactPhone: phone,
        notes: input.notes?.trim() || null,
        items: {
          create: rows.map((row) => ({
            listingId: row.listing.id,
            name: row.listing.name,
            unit: row.listing.unit,
            unitPriceKobo: row.listing.priceKobo,
            quantity: row.quantity
          }))
        },
        events: { create: { status: "placed", note: "Order placed and paid from NaijaPay wallet.", actorId: input.customerId } }
      }
    });

    // Stock is reserved at checkout so two buyers cannot take the same harvest.
    for (const row of rows) {
      await tx.produceListing.update({
        where: { id: row.listing.id },
        data: { quantity: { decrement: row.quantity }, ...(row.listing.quantity - row.quantity <= 0 ? { available: false } : {}) }
      });
    }

    await recordAudit({
      tx,
      actorId: input.customerId,
      action: "fresh_order.created",
      entity: "FreshOrder",
      entityId: order.id,
      metadata: { orderNumber: number, farmId: farm.id, subtotalKobo: subtotal.toString(), deliveryFeeKobo: delivery.toString(), itemCount: rows.length }
    });
    return order;
  });
}

/** Moves an order forward with the transition table for the actor's role. */
export async function transitionFreshOrder(input: {
  actor: { id: string; role: "customer" | "farm" | "courier" | "admin" };
  orderId: string;
  status: string;
  note?: string;
}) {
  const order = await prisma.freshOrder.findUnique({ where: { id: input.orderId }, select: { id: true, status: true, farmId: true } });
  if (!order) throw new ApiError(404, "order_not_found", "Order not found.");

  if (input.actor.role === "customer") {
    if (input.status !== "cancelled" || order.status !== "placed") {
      throw new ApiError(409, "cannot_cancel", "You can only cancel before the farm accepts your order.");
    }
  } else if (input.actor.role === "farm") {
    if (!(FARM_TRANSITIONS[order.status] ?? []).includes(input.status)) {
      throw new ApiError(409, "invalid_transition", `Cannot move ${FRESH_LABELS[order.status] ?? order.status} to ${FRESH_LABELS[input.status] ?? input.status}.`);
    }
  } else if (input.actor.role === "courier") {
    if (!(COURIER_TRANSITIONS[order.status] ?? []).includes(input.status)) {
      throw new ApiError(409, "invalid_transition", `Cannot move ${FRESH_LABELS[order.status] ?? order.status} to ${FRESH_LABELS[input.status] ?? input.status}.`);
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.freshOrder.update({ where: { id: order.id }, data: { status: input.status } });
    await tx.freshOrderEvent.create({
      data: { orderId: order.id, status: input.status, note: input.note ?? FRESH_LABELS[input.status] ?? input.status, actorId: input.actor.id }
    });

    if (input.status === "cancelled") {
      // Cancelling before acceptance returns the money to the buyer and the
      // reserved stock to the farm.
      const { ensureWallet } = await import("@/lib/payments/service");
      const { postBalancedTransaction } = await import("@/lib/services/core/wallet.service");
      const buyerWallet = await ensureWallet(tx, { userId: updated.customerId, ownerType: "CUSTOMER" });
      const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
      await tx.wallet.update({ where: { id: buyerWallet.id }, data: { availableKobo: { increment: updated.totalKobo } } });
      await tx.wallet.update({ where: { id: platform.id }, data: { availableKobo: { decrement: updated.totalKobo } } });
      await postBalancedTransaction({
        tx,
        actorId: input.actor.id,
        walletId: buyerWallet.id,
        type: "credit",
        amountKobo: updated.totalKobo,
        reference: `FRESH-CANCEL-${updated.id}`,
        description: `NaijaFresh refund for ${updated.orderNumber}`,
        entries: [
          { walletId: platform.id, direction: "DEBIT", amountKobo: updated.totalKobo, memo: "Cancelled order refunded" },
          { walletId: buyerWallet.id, direction: "CREDIT", amountKobo: updated.totalKobo, memo: "Refund to wallet" }
        ]
      });
      const items = await tx.freshOrderItem.findMany({ where: { orderId: order.id }, select: { listingId: true, quantity: true } });
      for (const item of items) {
        if (!item.listingId) continue;
        await tx.produceListing.update({ where: { id: item.listingId }, data: { quantity: { increment: item.quantity }, available: true } });
      }
    }

    await recordAudit({ tx, actorId: input.actor.id, action: "fresh_order.status_changed", entity: "FreshOrder", entityId: order.id, metadata: { from: order.status, to: input.status } });
    return updated;
  });
}

export async function listCustomerOrders(customerId: string) {
  return prisma.freshOrder.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      farm: { select: { name: true, slug: true, city: true, state: true } },
      items: true,
      events: { orderBy: { createdAt: "desc" }, take: 1 },
      dispatch: { select: { status: true, assignedType: true, assignedId: true, deliveryPin: true } }
    }
  });
}

export async function listFarmOrders(farmId: string) {
  return prisma.freshOrder.findMany({
    where: { farmId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { items: true, customer: { select: { name: true, email: true } }, dispatch: true }
  });
}
