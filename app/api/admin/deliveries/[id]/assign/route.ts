import { NextResponse } from "next/server";
import { assignCourier } from "@/lib/services/core/admin.service";
import { assertSameOrigin, jsonError, readJson, requireAdmin, requireString } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const body = await readJson<Record<string, unknown>>(request);
    const delivery = await assignCourier({
      adminId: admin.id,
      deliveryId: params.id,
      courierId: requireString(body.courierId, "Courier", 100)
    });
    return NextResponse.json(jsonSafe(delivery));
  } catch (error) {
    return jsonError(error);
  }
}
