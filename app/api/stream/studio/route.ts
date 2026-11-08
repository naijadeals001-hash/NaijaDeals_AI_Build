import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { artistEarnings } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

/** Creator studio overview for the signed-in artist (earnings + catalog). */
export async function GET() {
  try {
    const user = await requireUser();
    const earnings = await artistEarnings(user.id);
    if (!earnings) return NextResponse.json({ error: "No artist profile for this account.", code: "no_artist" }, { status: 404 });
    return NextResponse.json(jsonSafe(earnings));
  } catch (error) {
    return jsonError(error);
  }
}
