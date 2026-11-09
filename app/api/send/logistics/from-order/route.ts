import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { createShipmentFromOrder, ORIGIN_VERTICALS, type OriginVertical } from "@/lib/services/send/fulfilment";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Cross-vertical entry point: a participating vertical asks NaijaSend to execute
 * the transport for one of its orders.
 *
 * The caller must own the order. The order is read from its own table so the
 * shipment's details (amount, customer, addresses) come from the real order, not
 * from client-supplied text. Repeating the call returns the same shipment.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const vertical = String(body.originVertical ?? "") as OriginVertical;
    const orderId = String(body.orderId ?? "");
    if (!ORIGIN_VERTICALS.includes(vertical)) throw new ApiError(400, "invalid_vertical", "originVertical must be naijashop, naijafresh, naijaeats or naijasend.");
    if (!orderId) throw new ApiError(400, "order_required", "orderId is required.");

    const source = await resolveOrder(vertical, orderId);
    if (!source) throw new ApiError(404, "order_not_found", "That order was not found.");
    if (source.customerId !== user.id) throw new ApiError(403, "forbidden", "This order belongs to another account.");

    const shipment = await createShipmentFromOrder({ ...source, vertical });
    return NextResponse.json(jsonSafe(shipment), { status: shipment.created ? 201 : 200 });
  } catch (error) {
    return jsonError(error);
  }
}

/** Reads the authoritative order row for a vertical. */
async function resolveOrder(vertical: OriginVertical, orderId: string) {
  if (vertical === "naijafresh") {
    const order = await prisma.freshOrder.findFirst({
      where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
      select: { id: true, orderNumber: true, customerId: true, deliveryAddress: true, contactName: true, contactPhone: true, farm: { select: { name: true, city: true, state: true } }, items: { select: { name: true, quantity: true, unit: true } } }
    });
    if (!order) return null;
    const weight = Math.max(1, order.items.reduce((sum, item) => sum + item.quantity, 0));
    return {
      orderId: order.orderNumber,
      customerId: order.customerId,
      description: `NaijaFresh order ${order.orderNumber}: ${order.items.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(", ")}`.slice(0, 240),
      weightKg: weight,
      pickupLabel: `${order.farm.name}, ${order.farm.city}, ${order.farm.state}`,
      deliveryLabel: order.deliveryAddress,
      senderName: order.farm.name,
      senderPhone: "on file with NaijaFresh",
      recipientName: order.contactName,
      recipientPhone: order.contactPhone,
      cargoClass: "bulk" as const
    };
  }
  if (vertical === "naijaeats") {
    const order = await prisma.foodOrder.findFirst({
      where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
      select: { id: true, orderNumber: true, customerId: true, deliveryAddress: true, contactName: true, contactPhone: true, restaurant: { select: { name: true, address: true, market: true } }, items: { select: { name: true, quantity: true } } }
    });
    if (!order) return null;
    return {
      orderId: order.orderNumber,
      customerId: order.customerId,
      description: `NaijaEats order ${order.orderNumber}: ${order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}`.slice(0, 240),
      weightKg: 5,
      pickupLabel: `${order.restaurant.name}, ${order.restaurant.address}`,
      deliveryLabel: order.deliveryAddress,
      senderName: order.restaurant.name,
      senderPhone: "on file with NaijaEats",
      recipientName: order.contactName,
      recipientPhone: order.contactPhone,
      preferredMode: "motorcycle",
      cargoClass: "parcel" as const
    };
  }
  if (vertical === "naijashop") {
    const order = await prisma.order.findFirst({
      where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
      select: {
        id: true,
        orderNumber: true,
        customerId: true,
        deliveryAddress: true,
        contactName: true,
        contactPhone: true,
        status: true,
        vendor: { select: { name: true, pickupAddress: true } },
        items: { select: { quantity: true, product: { select: { name: true } } } }
      }
    });
    if (!order) return null;
    return {
      orderId: order.orderNumber,
      customerId: order.customerId,
      description: `NaijaShop order ${order.orderNumber}: ${order.items.map((i) => `${i.quantity}× ${i.product.name}`).join(", ")}`.slice(0, 240),
      weightKg: Math.max(1, order.items.reduce((sum, i) => sum + i.quantity, 0)),
      pickupLabel: `${order.vendor.name}, ${order.vendor.pickupAddress}`,
      deliveryLabel: order.deliveryAddress,
      senderName: order.vendor.name,
      senderPhone: "on file with NaijaShop",
      recipientName: order.contactName,
      recipientPhone: order.contactPhone,
      cargoClass: "goods" as const
    };
  }
  return null;
}
