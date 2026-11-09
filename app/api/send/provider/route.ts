import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { createProvider, enrolFromNaijaDrive, providerForOwner } from "@/lib/services/send/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await providerForOwner(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

/** Register an independent provider, or enrol an existing NaijaDrive driver. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    if (body.source === "naijadrive") {
      return NextResponse.json(jsonSafe(await enrolFromNaijaDrive(user.id)), { status: 201 });
    }
    if (body.providerType === undefined) throw new ApiError(400, "validation_error", "Choose the type of provider you operate.");
    const provider = await createProvider({
      ownerId: user.id,
      name: String(body.name ?? ""),
      providerType: String(body.providerType),
      country: typeof body.country === "string" ? body.country : undefined,
      operatingCities: Array.isArray(body.operatingCities) ? body.operatingCities.map(String) : [],
      contactPhone: String(body.contactPhone ?? ""),
      licenceRef: typeof body.licenceRef === "string" ? body.licenceRef : undefined,
      insuranceRef: typeof body.insuranceRef === "string" ? body.insuranceRef : undefined,
      capacityKg: body.capacityKg ? Number(body.capacityKg) : undefined
    });
    return NextResponse.json(jsonSafe(provider), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
