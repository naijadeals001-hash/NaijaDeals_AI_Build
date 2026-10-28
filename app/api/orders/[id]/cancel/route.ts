import { NextResponse } from "next/server";
import { cancelOrder } from "@/lib/services/core/checkout.service";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request).catch(() => ({}) as Record<string, unknown>);
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "Cancelled by customer.";
    const result = await cancelOrder({ orderId: params.id, userId: user.id, reason });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
