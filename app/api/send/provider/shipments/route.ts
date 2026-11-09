import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { ApiError } from "@/lib/auth/api-error";
import { providerForOwner } from "@/lib/services/send/providers";
import { listOpenShipmentsForProvider } from "@/lib/services/send/shipments";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** The provider's queue: open shipments it can quote, plus its active jobs. */
export async function GET() {
  try {
    const user = await requireUser();
    const provider = await providerForOwner(user.id);
    if (!provider) throw new ApiError(404, "provider_missing", "You are not registered as a NaijaSend provider.");
    const [open, active] = await Promise.all([
      listOpenShipmentsForProvider(provider.id),
      prisma.logisticsShipment.findMany({
        where: { status: { in: ["booked", "in_transit", "delivered"] }, quotes: { some: { providerId: provider.id, status: "accepted" } } },
        orderBy: { updatedAt: "desc" },
        take: 50,
        include: { legs: { where: { providerId: provider.id }, orderBy: { sequence: "asc" } } }
      })
    ]);
    return NextResponse.json(jsonSafe({ provider, open, active }));
  } catch (error) {
    return jsonError(error);
  }
}
