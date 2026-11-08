import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { recentlyPlayed } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe({ items: await recentlyPlayed(user.id) }));
  } catch (error) {
    return jsonError(error);
  }
}
