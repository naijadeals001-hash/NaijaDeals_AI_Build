import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assignFoodCourier } from "@/lib/services/core/eats-order.service";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("deliveries:write");
    const body = await readJson<Record<string, unknown>>(request);
    const order = await assignFoodCourier({ adminId: admin.id, orderId: params.id, courierId: String(body.courierId ?? "") });
    return NextResponse.json(jsonSafe(order));
  } catch (error) {
    return jsonError(error);
  }
}
