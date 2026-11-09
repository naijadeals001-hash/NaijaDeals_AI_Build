import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EatsHeader } from "@/components/eats/eats-header";
import { EatsBottomNav } from "@/components/eats/eats-bottom-nav";
import { RiderWorkspace } from "@/components/eats/rider-workspace";
import { getSessionUser } from "@/lib/auth/session";
import { listCuisineRail, listStorefrontRestaurants } from "@/lib/services/eats/storefront";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery workspace — NaijaEats" };

/**
 * Delivery workspace for NaijaSend couriers and NaijaDrive drivers. Access is
 * for providers only; other accounts are told plainly rather than shown an
 * empty queue.
 */
export default async function CourierPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/naijaeats/courier");
  const [courier, driver, all] = await Promise.all([
    prisma.courier.findUnique({ where: { userId: user.id }, select: { name: true, vehicleType: true, online: true } }),
    prisma.driverProfile.findUnique({ where: { userId: user.id }, select: { foodVehicleType: true, online: true, foodDeliveryEnabled: true } }),
    listStorefrontRestaurants()
  ]);
  const cuisines = await listCuisineRail(all);
  const provider = courier ? `NaijaSend courier · ${courier.vehicleType}` : driver ? `NaijaDrive driver · ${driver.foodVehicleType}` : null;

  return (
    <div className="min-h-screen bg-white pb-20 lg:pb-0">
      <EatsHeader destination="Lagos, Nigeria" cartCount={0} cuisines={cuisines} />
      <main className="mx-auto max-w-[820px] px-3 py-5 sm:px-8">
        <h1 className="font-display text-[22px] font-extrabold text-[#14241b]">Delivery workspace</h1>
        {provider ? (
          <>
            <p className="mt-1 text-[11.5px] text-[#6b7a70]">{provider}</p>
            <div className="mt-4">
              <RiderWorkspace />
            </div>
          </>
        ) : (
          <p className="mt-3 rounded-xl bg-[#f7f9f8] p-4 text-[12.5px] leading-6 text-[#4a5a50]">
            This account is not registered as a delivery provider. Couriers join through NaijaSend and drivers through NaijaDrive, then opt in to food
            delivery once verified.
          </p>
        )}
      </main>
      <EatsBottomNav cartCount={0} />
    </div>
  );
}
