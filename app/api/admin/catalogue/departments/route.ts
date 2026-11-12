import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { createDepartment, updateDepartment } from "@/lib/services/core/catalogue-admin.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");
    const body = await readJson<Record<string, unknown>>(request);
    const department = await createDepartment({
      actorId: admin.id,
      name: String(body.name ?? ""),
      description: String(body.description ?? ""),
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : undefined,
      isDemo: Boolean(body.isDemo)
    });
    return NextResponse.json(jsonSafe(department), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");
    const body = await readJson<Record<string, unknown>>(request);
    const department = await updateDepartment({
      actorId: admin.id,
      id: String(body.id ?? ""),
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      isDemo: typeof body.isDemo === "boolean" ? body.isDemo : undefined
    });
    return NextResponse.json(jsonSafe(department));
  } catch (error) {
    return jsonError(error);
  }
}
