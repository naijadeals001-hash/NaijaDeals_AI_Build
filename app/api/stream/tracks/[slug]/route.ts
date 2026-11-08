import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { getTrackBySlug } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  try {
    const track = await getTrackBySlug(params.slug);
    if (!track) return NextResponse.json({ error: "Track not found.", code: "not_found" }, { status: 404 });
    return NextResponse.json(jsonSafe(track));
  } catch (error) {
    return jsonError(error);
  }
}
