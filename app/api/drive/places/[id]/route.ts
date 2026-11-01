import { NextResponse } from "next/server";
import { deleteSavedPlace, updateSavedPlace } from "@/lib/services/core/drive.service";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

/** Rename a saved place, or point it at a different landmark the fare engine can price. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request).catch(
      () => ({}) as Record<string, unknown>
    );
    const place = await updateSavedPlace({
      userId: user.id,
      id: params.id,
      nickname: typeof body.nickname === "string" ? body.nickname : undefined,
      placeId: typeof body.placeId === "string" ? body.placeId : undefined
    });
    return NextResponse.json(jsonSafe(place));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await deleteSavedPlace({ userId: user.id, id: params.id })));
  } catch (error) {
    return jsonError(error);
  }
}
