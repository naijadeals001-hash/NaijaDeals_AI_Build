import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, requireAdmin } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const products = await prisma.product.findMany({
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
