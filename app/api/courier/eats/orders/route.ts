import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listFoodOrdersForCourier } from "@/lib/services/core/eats-order.service";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const couriers = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name FROM "Courier" WHERE "userId" = ${user.id} LIMIT 1`;
    const courier = couriers[0];
    if (!courier) return NextResponse.json({ error: "No courier profile is linked to this account.", code: "not_a_courier" }, { status: 403 });
    return NextResponse.json(jsonSafe({ courier: courier.name, orders: await listFoodOrdersForCourier(courier.id) }));
  } catch (error) {
    return jsonError(error);
  }
}
