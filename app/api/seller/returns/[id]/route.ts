import { NextResponse } from "next/server";
import { resolveReturn } from "@/lib/services/core/seller.service";
import { assertSameOrigin, jsonError, readJson, requireString, requireVendor } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireVendor();
    const body = await readJson<Record<string, unknown>>(request);
    const action = requireString(body.action, "Action", 20);
    if (action !== "approve" && action !== "reject" && action !== "receive") {
      return NextResponse.json({ error: "Unsupported return action.", code: "invalid_action" }, { status: 400 });
    }
    const result = await resolveReturn(user.id, params.id, action);
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
