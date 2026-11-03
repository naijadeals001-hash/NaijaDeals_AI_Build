import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createFreightRequest, listFreightForCustomer } from "@/lib/services/core/freight.service";
import { ApiError, assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await listFreightForCustomer(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const weightKg = Number(body.weightKg);
    if (!Number.isFinite(weightKg)) throw new ApiError(400, "validation_error", "Weight is required.");
    const freight = await createFreightRequest({
      customerId: user.id,
      serviceType: requireString(body.serviceType, "Service type", 20),
      originCity: requireString(body.originCity, "Origin city", 80),
      destinationCity: requireString(body.destinationCity, "Destination city", 80),
      commodity: requireString(body.commodity, "Commodity", 120),
      weightKg,
      dimensions: typeof body.dimensions === "string" ? body.dimensions : undefined,
      pickupRequired: Boolean(body.pickupRequired),
      notes: typeof body.notes === "string" ? body.notes : undefined
    });
    return NextResponse.json(jsonSafe(freight), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
