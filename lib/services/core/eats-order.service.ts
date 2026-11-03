import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { ensureWallet } from "@/lib/payments/service";
import { postBalancedTransaction } from "./wallet.service";
import { recordAudit } from "./audit.service";

type FoodStatus =
  | "placed" | "kitchen_accepted" | "preparing" | "ready_for_pickup"
  | "courier_assigned" | "picked_up" | "delivered" | "cancelled";

const RESTAURANT_TRANSITIONS: Record<string, FoodStatus[]> = {
  placed: ["kitchen_accepted"],
  kitchen_accepted: ["preparing"],
  preparing: ["ready_for_pickup"]
};
const COURIER_TRANSITIONS: Record<string, FoodStatus[]> = {
  courier_assigned: ["picked_up"],
  picked_up: ["delivered"]
};
const LABELS: Record<string, string> = {
  placed: "Order placed", kitchen_accepted: "Kitchen accepted", preparing: "Preparing",
  ready_for_pickup: "Ready for pickup", courier_assigned: "Courier assigned",
  picked_up: "Picked up", delivered: "Delivered", cancelled: "Cancelled"
};

export type FoodOrderRow = {
  id: string; orderNumber: string; customerId: string; restaurantId: string;
  courierId: string | null; status: FoodStatus; paymentStatus: string;
  subtotalKobo: string | bigint; totalKobo: string | bigint; currency: string;
  deliveryAddress: string; contactName: string; contactPhone: string; notes: string | null;
  createdAt: Date; updatedAt: Date;
};

export async function createFoodOrder(input: {
  customerId: string;
  restaurantId: string;
  items: Array<{ menuItemId: string; quantity: number; notes?: string }>;
  deliveryAddress: string;
  contactName: string;
  contactPhone: string;
  notes?: string;
}) {
  const restaurantRows = await prisma.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT id, status::text AS status FROM "Restaurant" WHERE id = ${input.restaurantId} LIMIT 1`;
  const restaurant = restaurantRows[0];
  if (!restaurant) throw new ApiError(404, "restaurant_not_found", "Kitchen not found.");
  if (restaurant.status !== "VERIFIED") throw new ApiError(409, "kitchen_unavailable", "This kitchen is not accepting orders.");

  const ids = input.items.map((item) => item.menuItemId);
  const menuRows = await prisma.$queryRaw<Array<{ id: string; name: string; priceKobo: bigint; available: boolean; restaurantId: string }>>`
    SELECT id, name, "priceKobo", available, "restaurantId" FROM "MenuItem" WHERE id = ANY(${ids}::text[])`;
  const menuById = new Map(menuRows.map((row) => [row.id, row]));
  let subtotal = BigInt(0);
  const lines = input.items.map((item) => {
    const menu = menuById.get(item.menuItemId);
    if (!menu || menu.restaurantId !== input.restaurantId) throw new ApiError(400, "item_unavailable", "One of the menu items is not sold by this kitchen.");
    if (!menu.available) throw new ApiError(409, "item_unavailable", `${menu.name} is not available right now.`);
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) throw new ApiError(400, "invalid_quantity", "Quantity must be between 1 and 10.");
    subtotal += menu.priceKobo * BigInt(item.quantity);
    return { menuItemId: menu.id, name: menu.name, unitPriceKobo: menu.priceKobo, quantity: item.quantity, notes: item.notes?.trim() || null };
  });
  if (lines.length === 0) throw new ApiError(400, "empty_order", "Add at least one item.");

  const address = input.deliveryAddress.trim();
  const name = input.contactName.trim();
  const phone = input.contactPhone.trim();
  if (!address || !name || !phone) throw new ApiError(400, "validation_error", "Delivery name, phone and address are required.");

  const orderNumber = `NFE-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(2).toString("hex").toUpperCase()}`;

  return prisma.$transaction(async (tx) => {
    const buyerWallet = await ensureWallet(tx, { userId: input.customerId, ownerType: "CUSTOMER" });
    const platform = await ensureWallet(tx, { ownerType: "SYSTEM" });
    const fresh = await tx.wallet.findUniqueOrThrow({ where: { id: buyerWallet.id } });
    if (fresh.availableKobo < subtotal) {
      throw new ApiError(402, "insufficient_funds", "Your NaijaPay balance does not cover this order. Top up first.");
    }
    await tx.wallet.update({ where: { id: buyerWallet.id }, data: { availableKobo: { decrement: subtotal } } });
    await tx.wallet.update({ where: { id: platform.id }, data: { availableKobo: { increment: subtotal } } });
    await postBalancedTransaction({
      tx,
      actorId: input.customerId,
      walletId: buyerWallet.id,
      type: "debit",
      amountKobo: subtotal,
      reference: `FOOD-${orderNumber}`,
      description: `NaijaEats order ${orderNumber}`,
      entries: [
        { walletId: buyerWallet.id, direction: "DEBIT", amountKobo: subtotal, memo: "NaijaEats order paid from wallet" },
        { walletId: platform.id, direction: "CREDIT", amountKobo: subtotal, memo: "NaijaEats order received" }
      ]
    });

    const rows = await tx.$queryRaw<FoodOrderRow[]>`
      INSERT INTO "FoodOrder" (id, "orderNumber", "customerId", "restaurantId", status, "paymentStatus", "subtotalKobo", "totalKobo", currency, "deliveryAddress", "contactName", "contactPhone", notes, "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${orderNumber}, ${input.customerId}, ${input.restaurantId}, 'placed'::"FoodOrderStatus", 'paid', ${subtotal}, ${subtotal}, 'NGN', ${address}, ${name}, ${phone}, ${input.notes?.trim() || null}, NOW(), NOW())
      RETURNING *`;
    const order = rows[0];
    for (const line of lines) {
      await tx.$executeRaw`
        INSERT INTO "FoodOrderItem" (id, "orderId", "menuItemId", name, "unitPriceKobo", quantity, notes)
        VALUES (${randomUUID()}, ${order.id}, ${line.menuItemId}, ${line.name}, ${line.unitPriceKobo}, ${line.quantity}, ${line.notes})`;
    }
    await tx.$executeRaw`
      INSERT INTO "FoodOrderEvent" (id, "orderId", status, note, "actorId", "createdAt")
      VALUES (${randomUUID()}, ${order.id}, 'placed'::"FoodOrderStatus", 'Order placed and paid from NaijaPay wallet.', ${input.customerId}, NOW())`;
    await recordAudit({
      tx,
      actorId: input.customerId,
      action: "food_order.created",
      entity: "FoodOrder",
      entityId: order.id,
      metadata: { orderNumber, restaurantId: input.restaurantId, subtotalKobo: subtotal.toString(), itemCount: lines.length }
    });
    return order;
  });
}

export async function updateFoodOrderStatus(input: {
  actor: { id: string; role: "restaurant" | "courier" | "customer" | "admin" };
  orderId: string;
  status: FoodStatus;
  note?: string;
}) {
  const rows = await prisma.$queryRaw<FoodOrderRow[]>`SELECT * FROM "FoodOrder" WHERE id = ${input.orderId} LIMIT 1`;
  const order = rows[0];
  if (!order) throw new ApiError(404, "order_not_found", "Food order not found.");

  if (input.actor.role === "customer") {
    if (input.status !== "cancelled" || order.status !== "placed") {
      throw new ApiError(409, "cannot_cancel", "You can only cancel an order while the kitchen has not accepted it.");
    }
  } else if (input.actor.role === "restaurant") {
    if (!(RESTAURANT_TRANSITIONS[order.status] ?? []).includes(input.status)) {
      throw new ApiError(409, "invalid_transition", `Cannot move ${LABELS[order.status]} to ${LABELS[input.status]}.`);
    }
  } else if (input.actor.role === "courier") {
    if (!(COURIER_TRANSITIONS[order.status] ?? []).includes(input.status)) {
      throw new ApiError(409, "invalid_transition", `Cannot move ${LABELS[order.status]} to ${LABELS[input.status]}.`);
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.$queryRaw<FoodOrderRow[]>`
      UPDATE "FoodOrder" SET status = ${input.status}::"FoodOrderStatus", "updatedAt" = NOW()
      WHERE id = ${order.id} RETURNING *`;
    await tx.$executeRaw`
      INSERT INTO "FoodOrderEvent" (id, "orderId", status, note, "actorId", "createdAt")
      VALUES (${randomUUID()}, ${order.id}, ${input.status}::"FoodOrderStatus", ${input.note ?? LABELS[input.status]}, ${input.actor.id}, NOW())`;
    await recordAudit({
      tx,
      actorId: input.actor.id,
      action: "food_order.status_changed",
      entity: "FoodOrder",
      entityId: order.id,
      metadata: { from: order.status, to: input.status, note: input.note ?? null }
    });
    return updated[0];
  });
}

export async function assignFoodCourier(input: { adminId: string; orderId: string; courierId: string }) {
  const orderRows = await prisma.$queryRaw<FoodOrderRow[]>`SELECT * FROM "FoodOrder" WHERE id = ${input.orderId} LIMIT 1`;
  const order = orderRows[0];
  if (!order) throw new ApiError(404, "order_not_found", "Food order not found.");
  if (order.status !== "ready_for_pickup") throw new ApiError(409, "not_ready", "The kitchen must mark the order ready before a courier is assigned.");
  const courier = await prisma.courier.findUnique({ where: { id: input.courierId } });
  if (!courier || !courier.active) throw new ApiError(409, "courier_suspended", "Courier is not active.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.$queryRaw<FoodOrderRow[]>`
      UPDATE "FoodOrder" SET "courierId" = ${courier.id}, status = 'courier_assigned'::"FoodOrderStatus", "updatedAt" = NOW()
      WHERE id = ${order.id} RETURNING *`;
    await tx.$executeRaw`
      INSERT INTO "FoodOrderEvent" (id, "orderId", status, note, "actorId", "createdAt")
      VALUES (${randomUUID()}, ${order.id}, 'courier_assigned'::"FoodOrderStatus", ${"Assigned to " + courier.name}, ${input.adminId}, NOW())`;
    await recordAudit({
      tx,
      actorId: input.adminId,
      action: "food_order.courier_assigned",
      entity: "FoodOrder",
      entityId: order.id,
      metadata: { courierId: courier.id, courierName: courier.name }
    });
    return updated[0];
  });
}

export async function listFoodOrdersForCustomer(customerId: string) {
  const rows = await prisma.$queryRaw<Array<FoodOrderRow & { items: unknown; events: unknown; restaurantName: string }>>`
    SELECT o.*, r.name AS "restaurantName",
      COALESCE((SELECT json_agg(json_build_object('name', i.name, 'quantity', i.quantity, 'unitPriceKobo', i."unitPriceKobo", 'notes', i.notes)) FROM "FoodOrderItem" i WHERE i."orderId" = o.id), '[]') AS items,
      COALESCE((SELECT json_agg(json_build_object('status', e.status, 'note', e.note, 'createdAt', e."createdAt") ORDER BY e."createdAt") FROM "FoodOrderEvent" e WHERE e."orderId" = o.id), '[]') AS events
    FROM "FoodOrder" o JOIN "Restaurant" r ON r.id = o."restaurantId"
    WHERE o."customerId" = ${customerId} ORDER BY o."createdAt" DESC LIMIT 50`;
  return rows;
}

export async function getFoodOrder(id: string) {
  const rows = await prisma.$queryRaw<Array<FoodOrderRow & { items: unknown; events: unknown; restaurantName: string }>>`
    SELECT o.*, r.name AS "restaurantName",
      COALESCE((SELECT json_agg(json_build_object('name', i.name, 'quantity', i.quantity, 'unitPriceKobo', i."unitPriceKobo", 'notes', i.notes)) FROM "FoodOrderItem" i WHERE i."orderId" = o.id), '[]') AS items,
      COALESCE((SELECT json_agg(json_build_object('status', e.status, 'note', e.note, 'createdAt', e."createdAt") ORDER BY e."createdAt") FROM "FoodOrderEvent" e WHERE e."orderId" = o.id), '[]') AS events
    FROM "FoodOrder" o JOIN "Restaurant" r ON r.id = o."restaurantId"
    WHERE o.id = ${id} LIMIT 1`;
  return rows[0] ?? null;
}

export async function listFoodOrdersForRestaurant(restaurantId: string) {
  const rows = await prisma.$queryRaw<Array<FoodOrderRow & { items: unknown; events: unknown }>>`
    SELECT o.*,
      COALESCE((SELECT json_agg(json_build_object('name', i.name, 'quantity', i.quantity, 'unitPriceKobo', i."unitPriceKobo", 'notes', i.notes)) FROM "FoodOrderItem" i WHERE i."orderId" = o.id), '[]') AS items,
      COALESCE((SELECT json_agg(json_build_object('status', e.status, 'note', e.note, 'createdAt', e."createdAt") ORDER BY e."createdAt") FROM "FoodOrderEvent" e WHERE e."orderId" = o.id), '[]') AS events
    FROM "FoodOrder" o WHERE o."restaurantId" = ${restaurantId} ORDER BY o."createdAt" DESC LIMIT 50`;
  return rows;
}

export async function listFoodOrdersForCourier(courierId: string) {
  const rows = await prisma.$queryRaw<Array<FoodOrderRow & { items: unknown; events: unknown; restaurantName: string }>>`
    SELECT o.*, r.name AS "restaurantName",
      COALESCE((SELECT json_agg(json_build_object('name', i.name, 'quantity', i.quantity, 'unitPriceKobo', i."unitPriceKobo", 'notes', i.notes)) FROM "FoodOrderItem" i WHERE i."orderId" = o.id), '[]') AS items,
      COALESCE((SELECT json_agg(json_build_object('status', e.status, 'note', e.note, 'createdAt', e."createdAt") ORDER BY e."createdAt") FROM "FoodOrderEvent" e WHERE e."orderId" = o.id), '[]') AS events
    FROM "FoodOrder" o JOIN "Restaurant" r ON r.id = o."restaurantId"
    WHERE o."courierId" = ${courierId} ORDER BY o."createdAt" DESC LIMIT 50`;
  return rows;
}
