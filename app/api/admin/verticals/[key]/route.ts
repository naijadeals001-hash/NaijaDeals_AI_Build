import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  assertSameOrigin,
  jsonError,
  readJson,
  requireAdminPermission
} from "@/lib/auth/guard";
import {
  clearVerticalActivation,
  updateVerticalActivation,
  verticalDefinition
} from "@/lib/services/core/vertical-activation.service";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

function verticalKeyFromParams(params: { key: string }) {
  const key = decodeURIComponent(params.key ?? "").trim().toLowerCase();
  // Validation is centralised in the service; `verticalDefinition` throws the
  // stable 400 unknown_vertical error for an unrecognised or empty key.
  return verticalDefinition(key).key;
}

export async function PATCH(request: NextRequest, { params }: { params: { key: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("verticals:write");
    const key = verticalKeyFromParams(params);
    const body = await readJson<Record<string, unknown>>(request);
    const updated = await updateVerticalActivation({
      actor: admin,
      verticalKey: key,
      scopeType: body.scopeType,
      countryCode: body.countryCode,
      cityCode: body.cityCode,
      city: body.city,
      status: body.status,
      reason: body.reason
    });
    return NextResponse.json(jsonSafe(updated), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { key: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("verticals:write");
    const key = verticalKeyFromParams(params);
    const body = await readJson<Record<string, unknown>>(request);
    const updated = await clearVerticalActivation({
      actor: admin,
      verticalKey: key,
      scopeType: body.scopeType,
      countryCode: body.countryCode,
      cityCode: body.cityCode,
      city: body.city,
      reason: body.reason
    });
    return NextResponse.json(jsonSafe(updated), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
