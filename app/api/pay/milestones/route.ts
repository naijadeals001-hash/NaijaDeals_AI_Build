import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser, assertSameOrigin } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { createMilestone, listMilestones, transitionMilestone } from "@/lib/services/core/milestone.service";

export const dynamic = "force-dynamic";

/**
 * Milestone escrow for the signed-in customer.
 *
 * GET  — milestones where the caller is payer or payee.
 * POST — create a milestone, or move one through an allowed transition.
 *
 * The payer identity always comes from the session. A caller cannot create a
 * milestone on someone else's behalf or act on one they are not party to.
 */
const ACTIONS = ["fund", "submit", "accept", "release", "refund", "dispute", "cancel"] as const;

export async function GET() {
  try {
    const user = await requireUser();
    const milestones = await listMilestones(user.id);
    return NextResponse.json(jsonSafe({ milestones }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSameOrigin(request);
    const user = await requireUser();
    const body = await request.json().catch(() => null);

    if (body?.action === "create") {
      const amountKobo = Number(body?.amountKobo);
      if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) {
        return NextResponse.json({ error: "Provide amountKobo as a positive integer.", code: "invalid_amount" }, { status: 400 });
      }
      const milestone = await createMilestone(prisma, {
        payerUserId: user.id,
        payeeEmail: String(body?.payeeEmail ?? ""),
        title: String(body?.title ?? ""),
        description: typeof body?.description === "string" ? body.description : undefined,
        amountKobo: BigInt(amountKobo)
      });
      return NextResponse.json(jsonSafe({ milestone }), { status: 201 });
    }

    const reference = String(body?.reference ?? "");
    const action = String(body?.action ?? "");
    if (!reference) return NextResponse.json({ error: "A milestone reference is required.", code: "reference_required" }, { status: 400 });
    if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
      return NextResponse.json({ error: "Unknown milestone action.", code: "invalid_action" }, { status: 400 });
    }

    const milestone = await transitionMilestone(prisma, {
      reference,
      actorId: user.id,
      action: action as (typeof ACTIONS)[number],
      note: typeof body?.note === "string" ? body.note.slice(0, 300) : undefined
    });
    return NextResponse.json(jsonSafe({ milestone }));
  } catch (error) {
    return jsonError(error);
  }
}
