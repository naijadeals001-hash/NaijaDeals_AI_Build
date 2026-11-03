import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getOwnRestaurant, getOwnRestaurantApplication, submitRestaurantApplication } from "@/lib/services/core/restaurant.service";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const [application, restaurant] = await Promise.all([getOwnRestaurantApplication(user.id), getOwnRestaurant(user.id)]);
    return NextResponse.json(jsonSafe({ application, restaurant }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    const application = await submitRestaurantApplication(user.id, body);
    return NextResponse.json(jsonSafe(application), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
