import { NextResponse } from "next/server";
import { assertSameOrigin, jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { getFreshBasket } from "@/lib/services/fresh/cart";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(jsonSafe(await getFreshBasket(user.id)));
  } catch (error) {
    return jsonError(error);
  }
}

/** Empties the signed-in account's basket. */
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await prisma.freshCartItem.deleteMany({ where: { userId: user.id } });
    return NextResponse.json(await getFreshBasket(user.id));
  } catch (error) {
    return jsonError(error);
  }
}
