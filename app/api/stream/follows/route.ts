import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { toggleFollow } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    return NextResponse.json(await toggleFollow(user.id, requireString(body.artistId, "Artist", 60)));
  } catch (error) {
    return jsonError(error);
  }
}
