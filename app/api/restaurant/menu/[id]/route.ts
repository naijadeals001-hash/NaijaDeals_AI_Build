import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { updateMenuItem } from "@/lib/services/core/restaurant.service";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const item = await updateMenuItem(user.id, params.id, body);
    return NextResponse.json(jsonSafe(item));
  } catch (error) {
    return jsonError(error);
  }
}
