import { NextResponse } from "next/server";
import { completeOrder, requestReturn } from "@/lib/services/core/order.service";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request).catch(() => ({}) as Record<string, unknown>);
    const action = typeof body.action === "string" ? body.action : "complete";

    if (action === "return") {
      const reason = requireString(body.reason, "Return reason", 300);
      const detail = typeof body.detail === "string" ? body.detail : undefined;
      const result = await requestReturn({ userId: user.id, orderId: params.id, reason, detail });
      return NextResponse.json(jsonSafe(result), { status: 201 });
    }

    const result = await completeOrder(user.id, params.id);
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
