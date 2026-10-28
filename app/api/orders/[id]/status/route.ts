import type { OrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { adminUpdateOrderStatus } from "@/lib/services/core/admin.service";
import { assertSameOrigin, jsonError, readJson, requireAdmin, requireString } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Legacy endpoint kept for compatibility. Only administrators may use it.
 * Sellers use /api/seller/orders/[id]/status and couriers use their own route.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const body = await readJson<Record<string, unknown>>(request);
    const status = requireString(body.status, "Status", 40) as OrderStatus;
    const order = await adminUpdateOrderStatus({
      adminId: admin.id,
      orderId: params.id,
      status,
      note: typeof body.note === "string" ? body.note : undefined
    });
    return NextResponse.json(jsonSafe(order));
  } catch (error) {
    return jsonError(error);
  }
}
