import { NextResponse } from "next/server";
import { getOrders } from "@/lib/services/core/order.service";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await getOrders(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}
