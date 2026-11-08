import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { fundBooking } from "@/lib/services/gigs/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const booking = await fundBooking(user.id, params.id);
    return NextResponse.json(jsonSafe(booking));
  } catch (error) {
    return jsonError(error);
  }
}
