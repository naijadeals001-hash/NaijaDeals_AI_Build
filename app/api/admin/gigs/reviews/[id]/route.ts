import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, optionalString, readJson, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { moderateReview } from "@/lib/services/gigs/service";
import { oneOf } from "@/lib/gigs/input";

export const dynamic = "force-dynamic";

const ACTIONS = ["PUBLISH", "HIDE"] as const;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("gigs:moderate");
    const body = await readJson<Record<string, unknown>>(request);
    const review = await moderateReview(admin, params.id, oneOf(body.action, ACTIONS, "Action"), optionalString(body.note, 500) ?? undefined);
    return NextResponse.json(jsonSafe(review));
  } catch (error) {
    return jsonError(error);
  }
}
