import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getQuote } from "@/lib/services/core/drive.service";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/** Public fare estimate. Nothing is charged until a signed-in rider requests the trip. */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const quote = getQuote({
      pickupId: params.get("pickup"),
      dropoffId: params.get("dropoff"),
      vehicleClassId: params.get("vehicleClass") ?? params.get("class")
    });
    return NextResponse.json(jsonSafe(quote));
  } catch (error) {
    return jsonError(error);
  }
}
