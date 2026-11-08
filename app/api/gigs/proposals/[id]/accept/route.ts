import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { acceptProposal } from "@/lib/services/gigs/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const booking = await acceptProposal(user.id, params.id);
    return NextResponse.json(jsonSafe(booking), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
