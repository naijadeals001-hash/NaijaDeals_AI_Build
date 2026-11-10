import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError, requireUser, assertSameOrigin } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { recordAudit } from "@/lib/services/core/audit.service";
import { confirmAction, expireStaleActions } from "@/lib/aura/chat";

export const dynamic = "force-dynamic";

/**
 * Confirms a proposal Aura prepared.
 *
 * This is the only path from a conversation to a real money movement. The body
 * must carry the `inputHash` the review card displayed; if the proposal changed,
 * expired, or belongs to someone else, nothing happens.
 *
 * A conversational "yes" is not enough: the confirm button posts this exact
 * hash, so the user's approval is bound to the details they actually saw.
 */
export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    const user = await requireUser();
    await expireStaleActions(user.id);

    const body = await request.json().catch(() => null);
    const actionId = String(body?.actionId ?? "");
    const confirmedInputHash = String(body?.inputHash ?? "");
    if (!actionId || !confirmedInputHash) {
      return NextResponse.json({ error: "The proposal and the details you reviewed are both required.", code: "missing_confirmation" }, { status: 400 });
    }

    const result = await confirmAction({ userId: user.id, actionId, confirmedInputHash });
    await recordAudit({
      actorId: user.id,
      action: "aura.action_confirmed",
      entity: "AuraAction",
      entityId: actionId,
      metadata: { status: result.status, reference: result.reference ?? null }
    });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
