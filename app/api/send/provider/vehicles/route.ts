import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { addVehicle, providerForOwner } from "@/lib/services/send/providers";

export const dynamic = "force-dynamic";

/** Fleet management: add a vehicle or transport asset to the signed-in provider. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const provider = await providerForOwner(user.id);
    if (!provider) throw new ApiError(404, "provider_missing", "Register as a transporter before adding vehicles.");
    const body = await readJson<Record<string, unknown>>(request);
    const vehicle = await addVehicle({
      ownerId: user.id,
      providerId: provider.id,
      vehicleType: String(body.vehicleType ?? ""),
      make: typeof body.make === "string" ? body.make : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
      plate: typeof body.plate === "string" ? body.plate : undefined,
      capacityKg: Number(body.capacityKg ?? 0)
    });
    return NextResponse.json(jsonSafe(vehicle), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
