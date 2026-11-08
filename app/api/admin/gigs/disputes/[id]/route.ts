import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireAdminPermission, requireString } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { resolveDispute } from "@/lib/services/gigs/service";
import { oneOf } from "@/lib/gigs/input";

export const dynamic = "force-dynamic";

const OUTCOMES = ["refund", "release", "none"] as const;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdminPermission("gigs:moderate");
    const body = await readJson<Record<string, unknown>>(request);
    const dispute = await resolveDispute(admin, params.id, {
      resolution: requireString(body.resolution, "Resolution", 2000),
      outcome: oneOf(body.outcome, OUTCOMES, "Outcome")
    });
    return NextResponse.json(jsonSafe(dispute));
  } catch (error) {
    return jsonError(error);
  }
}
