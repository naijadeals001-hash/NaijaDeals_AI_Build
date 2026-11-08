import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { transitionBooking } from "@/lib/services/gigs/service";
import { oneOf } from "@/lib/gigs/input";

export const dynamic = "force-dynamic";

const ACTIONS = ["accept", "decline", "start", "submit", "approve", "cancel"] as const;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<{ action?: unknown }>(request);
    const action = oneOf(body.action, ACTIONS, "Action");
    const booking = await transitionBooking(user.id, params.id, action);
    return NextResponse.json(jsonSafe(booking));
  } catch (error) {
    return jsonError(error);
  }
}
