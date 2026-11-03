import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { setVendorStatus } from "@/lib/services/core/admin.service";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("vendors:review");
    const body = await readJson<Record<string, unknown>>(request);
    if (body.status !== "VERIFIED" && body.status !== "SUSPENDED") {
      return NextResponse.json({ error: "status must be VERIFIED or SUSPENDED.", code: "validation_error" }, { status: 400 });
    }
    const vendor = await setVendorStatus({
      adminId: admin.id,
      vendorId: params.id,
      status: body.status,
      reason: typeof body.reason === "string" ? body.reason : undefined
    });
    return NextResponse.json(jsonSafe(vendor));
  } catch (error) {
    return jsonError(error);
  }
}
