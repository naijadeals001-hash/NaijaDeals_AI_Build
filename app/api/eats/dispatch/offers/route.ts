import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth/guard";
import { jsonSafe } from "@/lib/services/core/serialize";
import { prisma } from "@/lib/prisma";
import { expireStaleOffers, offersForProvider } from "@/lib/services/eats/dispatch";

export const dynamic = "force-dynamic";

/** The signed-in provider's open delivery offers (NaijaSend or NaijaDrive). */
export async function GET() {
  try {
    const user = await requireUser();
    await expireStaleOffers();
    const [courier, driver] = await Promise.all([
      prisma.courier.findUnique({ where: { userId: user.id }, select: { id: true } }),
      prisma.driverProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
    ]);
    const courierOffers = courier ? await offersForProvider("courier", courier.id) : [];
    const driverOffers = driver ? await offersForProvider("driver", driver.id) : [];
    return NextResponse.json(jsonSafe({ courier: courierOffers, driver: driverOffers }));
  } catch (error) {
    return jsonError(error);
  }
}
