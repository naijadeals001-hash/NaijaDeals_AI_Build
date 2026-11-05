import { NextResponse } from "next/server";
import type { OrderStatus } from "@prisma/client";
import { adminUpdateOrderStatus } from "@/lib/services/core/admin.service";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission, requireString } from "@/lib/auth/guard";
import { assertOrderRegion } from "@/lib/auth/scope";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

const statuses: OrderStatus[] = [
  "created",
  "payment_pending",
  "escrow_held",
  "vendor_notified",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "courier_assigned",
  "picked_up",
  "in_transit",
  "delivered",
  "completed",
  "cancelled",
  "disputed",
  "refunded"
];

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("orders:write");
    await assertOrderRegion(admin, params.id);
    const body = await readJson<Record<string, unknown>>(request);
    const status = requireString(body.status, "Status", 40) as OrderStatus;
    if (!statuses.includes(status)) {
      return NextResponse.json({ error: "Unknown order status.", code: "invalid_status" }, { status: 400 });
    }
    const note = typeof body.note === "string" ? body.note : undefined;
    const order = await adminUpdateOrderStatus({ adminId: admin.id, orderId: params.id, status, note });
    return NextResponse.json(jsonSafe(order));
  } catch (error) {
    return jsonError(error);
  }
}
