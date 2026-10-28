import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const vendors = await prisma.vendor.findMany({
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
