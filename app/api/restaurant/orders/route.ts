import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listFoodOrdersForRestaurant } from "@/lib/services/core/eats-order.service";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const restaurant = await prisma.restaurant.findFirst({ where: { ownerId: user.id, status: "VERIFIED" } });
    if (!restaurant) return NextResponse.json({ error: "No verified kitchen is linked to this account.", code: "not_a_kitchen" }, { status: 403 });
    return NextResponse.json(jsonSafe({ restaurant: { id: restaurant.id, name: restaurant.name }, orders: await listFoodOrdersForRestaurant(restaurant.id) }));
  } catch (error) {
    return jsonError(error);
  }
}
