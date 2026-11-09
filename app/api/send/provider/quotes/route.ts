import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { providerForOwner } from "@/lib/services/send/providers";
import { submitQuote } from "@/lib/services/send/shipments";

export const dynamic = "force-dynamic";

/** A verified provider submits or revises its own quotation for a shipment. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const provider = await providerForOwner(user.id);
    if (!provider) throw new ApiError(404, "provider_missing", "Register as a transporter before quoting.");
    const body = await readJson<Record<string, unknown>>(request);
    const shipmentId = String(body.shipmentId ?? "");
    if (!shipmentId) throw new ApiError(400, "shipment_required", "Choose a shipment to quote.");
    const quote = await submitQuote({
      providerId: provider.id,
      actorId: user.id,
      shipmentId,
      amountKobo: String(Math.round(Number(body.amountNaira ?? 0) * 100)),
      transitDays: Number(body.transitDays ?? 0),
      modes: Array.isArray(body.modes) ? body.modes.map(String) : [],
      message: typeof body.message === "string" ? body.message : undefined
    });
    return NextResponse.json(jsonSafe(quote), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
