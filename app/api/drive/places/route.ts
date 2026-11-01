import { NextResponse } from "next/server";
import { listSavedPlaces, savePlace } from "@/lib/services/core/drive.service";
import { assertSameOrigin, jsonError, readJson, requireString, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/** The rider's own nicknames for bookable Lagos landmarks. */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await listSavedPlaces(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request).catch(
      () => ({}) as Record<string, unknown>
    );
    const place = await savePlace({
      userId: user.id,
      nickname: requireString(body.nickname, "Nickname", 40),
      placeId: requireString(body.placeId, "Landmark", 80)
    });
    return NextResponse.json(jsonSafe(place), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
