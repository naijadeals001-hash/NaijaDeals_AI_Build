import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, readJson, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { removeBasketLine, setBasketQuantity } from "@/lib/services/eats/cart";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);
    return NextResponse.json(jsonSafe(await setBasketQuantity(user.id, params.id, Number(body.quantity ?? 1))));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await removeBasketLine(user.id, params.id)));
  } catch (error) {
    return jsonError(error);
  }
}
