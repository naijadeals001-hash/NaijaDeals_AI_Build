import { NextResponse } from "next/server";
import { createDeliveryRequest } from "@/lib/services/core/delivery.service";
import { assertSameOrigin, jsonError, readJson, requireAdmin, requireString } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/** Manual delivery creation is an operations action; customers get deliveries from checkout. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const body = await readJson<Record<string, unknown>>(request);
    const fee = body.feeKobo === undefined ? undefined : BigInt(String(body.feeKobo));
    const delivery = await createDeliveryRequest({
      actorId: admin.id,
      orderId: requireString(body.orderId, "Order", 100),
      pickupAddress: requireString(body.pickupAddress, "Pickup address", 300),
      dropoffAddress: requireString(body.dropoffAddress, "Dropoff address", 300),
      feeKobo: fee
    });
    return NextResponse.json(jsonSafe(delivery), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
