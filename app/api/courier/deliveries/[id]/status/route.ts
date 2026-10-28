import { NextResponse } from "next/server";
import type { DeliveryStatus } from "@prisma/client";
import { updateCourierDelivery } from "@/lib/services/core/courier.service";
import { assertSameOrigin, jsonError, readJson, requireCourier, requireString } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

const statuses: DeliveryStatus[] = [
  "pickup_started",
  "picked_up",
  "in_transit",
  "delivery_attempted",
  "delivered",
  "failed",
  "returned"
];

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireCourier();
    const body = await readJson<Record<string, unknown>>(request);
    const status = requireString(body.status, "Status", 40) as DeliveryStatus;
    if (!statuses.includes(status)) {
      return NextResponse.json({ error: "Unknown delivery status.", code: "invalid_status" }, { status: 400 });
    }
    const delivery = await updateCourierDelivery({
      userId: user.id,
      deliveryId: params.id,
      status,
      note: typeof body.note === "string" ? body.note : undefined,
      proofCode: typeof body.proofCode === "string" ? body.proofCode : undefined
    });
    return NextResponse.json(jsonSafe(delivery));
  } catch (error) {
    return jsonError(error);
  }
}
