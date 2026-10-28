import { NextResponse } from "next/server";
import { listCourierDeliveries } from "@/lib/services/core/courier.service";
import { jsonError, requireCourier } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCourier();
    return NextResponse.json(jsonSafe(await listCourierDeliveries(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}
