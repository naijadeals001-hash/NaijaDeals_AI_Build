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
      actor: admin,
      name: String(body.name ?? ""),
      slug: typeof body.slug === "string" ? body.slug : undefined,
      description: String(body.description ?? ""),
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : undefined,
      imageAlt: typeof body.imageAlt === "string" ? body.imageAlt : undefined,
      sortOrder: body.sortOrder,
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
      actor: admin,
      id: String(body.id ?? ""),
      name: typeof body.name === "string" ? body.name : undefined,
      slug: typeof body.slug === "string" ? body.slug : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : undefined,
      imageAlt: typeof body.imageAlt === "string" ? body.imageAlt : undefined,
      sortOrder: body.sortOrder,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      isDemo: typeof body.isDemo === "boolean" ? body.isDemo : undefined
    });
    return NextResponse.json(jsonSafe(department));
  } catch (error) {
    return jsonError(error);
  }
}
