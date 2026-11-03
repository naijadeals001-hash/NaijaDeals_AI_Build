import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { FREIGHT_ACTIONS, updateFreightRequest, type FreightAction } from "@/lib/services/core/freight.service";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("deliveries:write");
    const body = await readJson<Record<string, unknown>>(request);
    const action = String(body.action ?? "") as FreightAction;
    if (!FREIGHT_ACTIONS.includes(action)) {
      return NextResponse.json({ error: "action must be quote, assign, transit, deliver or cancel.", code: "validation_error" }, { status: 400 });
    }
    const updated = await updateFreightRequest({
      adminId: admin.id,
      requestId: params.id,
      action,
      quoteKobo: typeof body.quoteKobo === "string" ? body.quoteKobo : undefined,
      carrierName: typeof body.carrierName === "string" ? body.carrierName : undefined,
      note: typeof body.note === "string" ? body.note : undefined
    });
    return NextResponse.json(jsonSafe(updated));
  } catch (error) {
    return jsonError(error);
  }
}
