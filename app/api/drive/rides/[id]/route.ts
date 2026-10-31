import { NextResponse } from "next/server";
import { getRideForUser } from "@/lib/services/core/drive.service";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { isAdmin } from "@/lib/auth/session";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const ride = await getRideForUser({ userId: user.id, isAdmin: isAdmin(user), rideId: params.id });
    return NextResponse.json(jsonSafe(ride));
  } catch (error) {
    return jsonError(error);
  }
}
