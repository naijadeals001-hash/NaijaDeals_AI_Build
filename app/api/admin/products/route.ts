import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { countryScopeWhere } from "@/lib/auth/scope";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requireAdminPermission("products:read");
    const products = await prisma.product.findMany({
      where: countryScopeWhere(admin),
      include: {
        vendor: { select: { id: true, name: true, status: true } },
        category: true,
        images: { take: 1 },
        stock: true,
        variants: true
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return NextResponse.json(jsonSafe(products));
  } catch (error) {
    return jsonError(error);
  }
}
