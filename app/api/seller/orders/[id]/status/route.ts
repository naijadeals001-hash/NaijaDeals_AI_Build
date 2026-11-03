import { NextResponse } from "next/server";
import { advanceSellerOrder } from "@/lib/services/core/seller.service";
import { assertSameOrigin, jsonError, readJson, requireString, requireVendor } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireVendor();
    const body = await readJson<Record<string, unknown>>(request);
    const status = requireString(body.status, "Status", 30);
    if (status !== "accepted" && status !== "preparing" && status !== "ready_for_pickup") {
      return NextResponse.json({ error: "Unsupported seller status.", code: "invalid_status" }, { status: 400 });
    }
    const note = typeof body.note === "string" ? body.note : undefined;
    const order = await advanceSellerOrder(user.id, params.id, status, note);
    return NextResponse.json(jsonSafe(order));
  } catch (error) {
    return jsonError(error);
  }
}
