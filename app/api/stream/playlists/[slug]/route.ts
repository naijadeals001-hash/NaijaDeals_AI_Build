import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { getPlaylistBySlug, removeFromPlaylist } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  try {
    const playlist = await getPlaylistBySlug(params.slug);
    if (!playlist) return NextResponse.json({ error: "Playlist not found.", code: "not_found" }, { status: 404 });
    return NextResponse.json(jsonSafe(playlist));
  } catch (error) {
    return jsonError(error);
  }
}
