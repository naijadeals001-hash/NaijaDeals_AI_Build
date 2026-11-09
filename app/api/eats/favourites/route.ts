import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { listFavourites, toggleFavourite } from "@/lib/services/eats/cart";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await listFavourites(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const kind = String(body.kind ?? "");
    const targetId = String(body.targetId ?? "");
    if (kind !== "restaurant" && kind !== "dish") throw new ApiError(400, "invalid_kind", "kind must be restaurant or dish.");
    if (!targetId) throw new ApiError(400, "target_required", "targetId is required.");
    return NextResponse.json(jsonSafe(await toggleFavourite(user.id, kind, targetId)));
  } catch (error) {
    return jsonError(error);
  }
}
