import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { getBookingForUser } from "@/lib/services/gigs/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const booking = await getBookingForUser(user.id, params.id);
    if (!booking) return NextResponse.json({ error: "Booking not found.", code: "not_found" }, { status: 404 });
    return NextResponse.json(jsonSafe(booking));
  } catch (error) {
    return jsonError(error);
  }
}
