import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { bookShipment, cancelShipment, confirmShipmentDelivery, listQuotesForShipment } from "@/lib/services/send/shipments";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/api-error";

export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await listQuotesForShipment(params.id, user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

/** Book, cancel or confirm receipt for one shipment. */
export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const action = String(body.action ?? "");
    if (action === "book") {
      return NextResponse.json(jsonSafe(await bookShipment({ customerId: user.id, shipmentId: params.id, quoteId: String(body.quoteId ?? "") })));
    }
    if (action === "cancel") return NextResponse.json(jsonSafe(await cancelShipment({ customerId: user.id, shipmentId: params.id })));
    if (action === "confirm") {
      const shipment = await prisma.logisticsShipment.findUnique({ where: { id: params.id }, select: { id: true } });
      if (!shipment) throw new ApiError(404, "shipment_not_found", "Shipment not found.");
      return NextResponse.json(jsonSafe(await confirmShipmentDelivery({ customerId: user.id, shipmentId: params.id, pin: String(body.pin ?? "") })));
    }
    throw new ApiError(400, "invalid_action", "action must be book, cancel or confirm.");
  } catch (error) {
    return jsonError(error);
  }
}
