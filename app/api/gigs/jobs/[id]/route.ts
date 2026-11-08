import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireNumber, requireString, requireUser } from "@/lib/auth/guard";
import { getSessionUser } from "@/lib/auth/session";
import { jsonSafe } from "@/lib/services/core/serialize";
import { getGigJob, submitProposal } from "@/lib/services/gigs/service";
import { requireMoney } from "@/lib/gigs/input";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getSessionUser();
    const job = await getGigJob(params.id, user);
    if (!job) return NextResponse.json({ error: "Job not found.", code: "not_found" }, { status: 404 });
    return NextResponse.json(jsonSafe(job));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const proposal = await submitProposal(user.id, params.id, {
      amountKobo: requireMoney(body.amountKobo, "Proposal amount"),
      message: requireString(body.message, "Proposal message", 2000),
      deliveryDays: requireNumber(body.deliveryDays, "Delivery days", 1, 365)
    });
    return NextResponse.json(jsonSafe(proposal), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
