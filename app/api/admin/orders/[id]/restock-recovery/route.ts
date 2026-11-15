import { NextResponse } from "next/server";
import { listRestockRecovery, retrySuppressedRestock } from "@/lib/payments/restock-recovery.service";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission, requireString } from "@/lib/auth/guard";
import { assertOrderRegion } from "@/lib/auth/scope";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/**
 * Control Center → order stock recovery.
 *
 * A completed refund can leave physical units outstanding when the original
 * stock source was not resolvable (product converted to variants, missing stock
 * row, missing variant). The per-item ledger keeps those items visible here.
 * GET lists them; POST retries only items already recorded as SUPPRESSED after
 * the operator has made the source resolvable. No money is moved by this route.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdminPermission("orders:read");
    await assertOrderRegion(admin, params.id);
    return NextResponse.json(jsonSafe(await listRestockRecovery({ orderId: params.id, includeLegacyMarkers: true })), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("orders:write");
    await assertOrderRegion(admin, params.id);
    const body = await readJson<Record<string, unknown>>(request);
    const reason = requireString(body.reason, "Reason", 300);
    const rawIds = body.orderItemIds;
    if (rawIds !== undefined && !Array.isArray(rawIds)) {
      return NextResponse.json({ error: "orderItemIds must be an array.", code: "validation_error" }, { status: 400 });
    }
    const orderItemIds = Array.isArray(rawIds)
      ? rawIds
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .slice(0, 100)
      : undefined;
    const result = await retrySuppressedRestock({
      orderId: params.id,
      actorId: admin.id,
      actor: admin,
      reason,
      orderItemIds
    });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
