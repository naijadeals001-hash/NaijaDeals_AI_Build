import { NextResponse } from "next/server";
import { moderateProduct } from "@/lib/services/core/admin.service";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission, requireString } from "@/lib/auth/guard";
import { assertProductRegion } from "@/lib/auth/scope";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("products:moderate");
    await assertProductRegion(admin, params.id);
    const body = await readJson<Record<string, unknown>>(request);
    const status = requireString(body.status, "Status", 20);
    if (status !== "ACTIVE" && status !== "SUSPENDED" && status !== "ARCHIVED") {
      return NextResponse.json({ error: "Unsupported moderation status.", code: "invalid_status" }, { status: 400 });
    }
    const product = await moderateProduct({
      adminId: admin.id,
      productId: params.id,
      status,
      note: typeof body.note === "string" ? body.note : undefined
    });
    return NextResponse.json(jsonSafe(product));
  } catch (error) {
    return jsonError(error);
  }
}
