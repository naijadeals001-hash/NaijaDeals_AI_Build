import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMenuItem, getRestaurantMenu } from "@/lib/services/core/restaurant.service";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await getRestaurantMenu(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const item = await createMenuItem(user.id, body);
    return NextResponse.json(jsonSafe(item), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
