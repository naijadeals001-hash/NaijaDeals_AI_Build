import { NextResponse } from "next/server";
import { getOptionalUserId, jsonError } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { getArtistBySlug } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  try {
    const viewerId = await getOptionalUserId();
    const result = await getArtistBySlug(params.slug, viewerId);
    if (!result) return NextResponse.json({ error: "Artist not found.", code: "not_found" }, { status: 404 });
    return NextResponse.json(jsonSafe(result));
  } catch (error) {
    return jsonError(error);
  }
}
