import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdminPermission } from "@/lib/auth/guard";
import { vendorScopeWhere } from "@/lib/auth/scope";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requireAdminPermission("vendors:read");
    const vendors = await prisma.vendor.findMany({
      where: vendorScopeWhere(admin),
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { products: true, orders: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    return NextResponse.json(jsonSafe(vendors));
  } catch (error) {
    return jsonError(error);
  }
}
