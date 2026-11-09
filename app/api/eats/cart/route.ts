import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { clearBasket, getBasket } from "@/lib/services/eats/cart";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await getBasket(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await clearBasket(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}
