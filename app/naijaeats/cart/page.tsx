import type { Metadata } from "next";
import { EatsHeader } from "@/components/eats/eats-header";
import { EatsFooter } from "@/components/eats/eats-footer";
import { EatsBottomNav } from "@/components/eats/eats-bottom-nav";
import { EatsBasket } from "@/components/eats/eats-basket";
import { listCuisineRail, listStorefrontRestaurants } from "@/lib/services/eats/storefront";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your basket — NaijaEats" };

export default async function EatsCartPage() {
  const [user, all] = await Promise.all([getSessionUser(), listStorefrontRestaurants()]);
  const cuisines = await listCuisineRail(all);
  return (
    <div className="min-h-screen bg-white pb-20 lg:pb-0">
      <EatsHeader destination="Lagos, Nigeria" cartCount={0} cuisines={cuisines} />
      <main className="mx-auto max-w-[820px] px-3 py-5 sm:px-8">
        <h1 className="font-display text-[22px] font-extrabold text-[#14241b]">Your basket</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7a70]">Each kitchen is ordered separately, so you always know where your food is coming from.</p>
        <div className="mt-4">
          <EatsBasket signedIn={Boolean(user)} />
        </div>
      </main>
      <EatsFooter />
      <EatsBottomNav cartCount={0} />
    </div>
  );
}
