import { NextResponse } from "next/server";
import { listSellerOrders } from "@/lib/services/core/seller.service";
import { jsonError, requireVendor } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireVendor();
    return NextResponse.json(jsonSafe(await listSellerOrders(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}
