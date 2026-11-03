import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { listCityActivations, updateCityActivation } from "@/lib/services/core/city.service";
import { jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminPermission("dashboard:read");
    return NextResponse.json(await listCityActivations());
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminPermission("countries:write");
    const body = await readJson<Record<string, unknown>>(request);
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean.", code: "validation_error" }, { status: 400 });
    }
    const updated = await updateCityActivation({
      actorId: admin.id,
      countryCode: String(body.countryCode ?? ""),
      city: String(body.city ?? ""),
      enabled: body.enabled
    });
    return NextResponse.json(updated);
  } catch (error) {
    return jsonError(error);
  }
}
