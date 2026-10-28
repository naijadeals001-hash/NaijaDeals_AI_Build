import { NextResponse } from "next/server";
import { getOrder } from "@/lib/services/core/order.service";
import { ApiError, jsonError, requireUser } from "@/lib/auth/guard";
import { isAdmin } from "@/lib/auth/session";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const order = await getOrder(params.id);
    if (order.customerId !== user.id && order.vendor.ownerId !== user.id && !isAdmin(user)) {
      throw new ApiError(403, "forbidden", "You do not have access to this order.");
    }
    return NextResponse.json(jsonSafe(order));
  } catch (error) {
    return jsonError(error);
  }
}
