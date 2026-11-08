import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { addToPlaylist, removeFromPlaylist } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { slug: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const result = await addToPlaylist(user.id, params.slug, requireString(body.trackId, "Track", 60));
    return NextResponse.json(result, { status: result.added ? 201 : 200 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { slug: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const itemId = new URL(request.url).searchParams.get("itemId");
    if (!itemId) return NextResponse.json({ error: "itemId is required.", code: "invalid" }, { status: 400 });
    return NextResponse.json(await removeFromPlaylist(user.id, params.slug, itemId));
  } catch (error) {
    return jsonError(error);
  }
}
