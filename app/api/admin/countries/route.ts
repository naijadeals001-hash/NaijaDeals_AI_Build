import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { listCountryActivations, updateCountryActivation } from "@/lib/services/core/country.service";
import { jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminPermission("dashboard:read");
    return NextResponse.json(await listCountryActivations());
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminPermission("countries:write");
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.enabled !== "boolean" || typeof body.deliveryEnabled !== "boolean") {
      return NextResponse.json({ error: "enabled and deliveryEnabled must be booleans.", code: "validation_error" }, { status: 400 });
    }
    const updated = await updateCountryActivation({
      actorId: admin.id,
      code: String(body.code ?? ""),
      enabled: body.enabled,
      deliveryEnabled: body.deliveryEnabled
    });
    return NextResponse.json(updated);
  } catch (error) {
    return jsonError(error);
  }
}
