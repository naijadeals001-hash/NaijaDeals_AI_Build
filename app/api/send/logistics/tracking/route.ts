import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { getShipmentTracking } from "@/lib/services/send/fulfilment";

export const dynamic = "force-dynamic";

/**
 * One authoritative tracking record, resolvable by tracking number, shipment id,
 * or the originating vertical's order. Every vertical uses this same endpoint so
 * there is never a second timeline.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const tracking = await getShipmentTracking({
      trackingNumber: url.searchParams.get("tracking") ?? undefined,
      shipmentId: url.searchParams.get("shipmentId") ?? undefined,
      originVertical: url.searchParams.get("vertical") ?? undefined,
      orderId: url.searchParams.get("order") ?? undefined,
      viewerId: user.id
    });
    if (!tracking) throw new ApiError(404, "shipment_not_found", "No shipment matches that reference.");
    return NextResponse.json(jsonSafe(tracking));
  } catch (error) {
    return jsonError(error);
  }
}
