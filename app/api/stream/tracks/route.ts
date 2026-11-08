import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { listTracks, listGenres } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

/** Public catalog: published tracks only, optionally filtered by genre or query. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const [result, genres] = await Promise.all([
      listTracks({
        genre: params.get("genre")?.slice(0, 60) || undefined,
        q: params.get("q")?.slice(0, 120) || undefined,
        artistId: params.get("artistId") || undefined,
        take: params.get("take") ? Number(params.get("take")) : undefined
      }),
      listGenres()
    ]);
    return NextResponse.json(jsonSafe({ ...result, genres }));
  } catch (error) {
    return jsonError(error);
  }
}
