import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { createShipment, listCustomerShipments } from "@/lib/services/send/shipments";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await listCustomerShipments(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

/** Creates a shipment request. No price is set; providers quote it. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    if (!body.originLabel || !body.destinationLabel) throw new ApiError(400, "validation_error", "Pickup and delivery locations are required.");
    if (!body.senderName || !body.recipientName) throw new ApiError(400, "validation_error", "Sender and recipient names are required.");
    if (!body.senderPhone || !body.recipientPhone) throw new ApiError(400, "validation_error", "Sender and recipient phone numbers are required.");
    if (body.quick === true) {
      // The quick-quote card captures only route and cargo, so the account holder
      // is recorded as both parties until the full ship form collects contacts.
      body.senderName = user.name;
      body.recipientName = user.name;
      body.senderPhone = "Not yet supplied";
      body.recipientPhone = "Not yet supplied";
    }
    const shipment = await createShipment({
      customerId: user.id,
      cargoClass: String(body.cargoClass ?? "parcel"),
      cargoCategory: typeof body.cargoCategory === "string" ? body.cargoCategory : undefined,
      description: String(body.description ?? ""),
      weightKg: Number(body.weightKg ?? 0),
      quantity: body.quantity ? Number(body.quantity) : 1,
      dimensions: typeof body.dimensions === "string" ? body.dimensions : undefined,
      declaredValueKobo: body.declaredValueNaira ? String(Math.round(Number(body.declaredValueNaira) * 100)) : undefined,
      handling: typeof body.handling === "string" ? body.handling : undefined,
      originLabel: String(body.originLabel),
      originCountry: typeof body.originCountry === "string" ? body.originCountry : undefined,
      destinationLabel: String(body.destinationLabel),
      destinationCountry: typeof body.destinationCountry === "string" ? body.destinationCountry : undefined,
      senderName: String(body.senderName),
      senderPhone: String(body.senderPhone),
      recipientName: String(body.recipientName),
      recipientPhone: String(body.recipientPhone),
      pickupDate: typeof body.pickupDate === "string" && body.pickupDate ? body.pickupDate : undefined,
      preferredMode: typeof body.preferredMode === "string" && body.preferredMode ? body.preferredMode : undefined,
      customerKind: typeof body.customerKind === "string" ? body.customerKind : undefined
    });
    return NextResponse.json(jsonSafe(shipment), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
