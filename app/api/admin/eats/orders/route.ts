import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminPermission("deliveries:read");
    const orders = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT o.id, o."orderNumber", o.status, o."totalKobo", o."deliveryAddress", o."contactName",
        r.name AS "restaurantName", c.name AS "courierName", c.id AS "courierId"
      FROM "FoodOrder" o
      JOIN "Restaurant" r ON r.id = o."restaurantId"
      LEFT JOIN "Courier" c ON c.id = o."courierId"
      ORDER BY o."createdAt" DESC LIMIT 50`;
    const couriers = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name FROM "Courier" WHERE active = true ORDER BY name ASC`;
    return NextResponse.json(jsonSafe({ orders, couriers }));
  } catch (error) {
    return jsonError(error);
  }
}
