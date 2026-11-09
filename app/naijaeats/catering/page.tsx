import type { Metadata } from "next";
import Link from "next/link";
import { EatsHeader } from "@/components/eats/eats-header";
import { EatsFooter } from "@/components/eats/eats-footer";
import { EatsBottomNav } from "@/components/eats/eats-bottom-nav";
import { listCuisineRail, listStorefrontRestaurants } from "@/lib/services/eats/storefront";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Catering & bulk orders — NaijaEats" };

/**
 * Catering, events and bulk orders are brokered by the platform team. There is
 * no self-serve catering pipeline yet, so this page explains the real route
 * instead of showing a form that would silently fail.
 */
export default async function CateringPage() {
  const all = await listStorefrontRestaurants();
  const cuisines = await listCuisineRail(all);
  return (
    <div className="min-h-screen bg-white pb-20 lg:pb-0">
      <EatsHeader destination="Lagos, Nigeria" cartCount={0} cuisines={cuisines} />
      <main className="mx-auto max-w-[900px] px-3 py-6 sm:px-8">
        <h1 className="font-display text-[24px] font-extrabold text-[#14241b]">Catering, events and bulk orders</h1>
        <p className="mt-2 text-[12.5px] leading-7 text-[#4a5a50]">
          Catering is arranged with the kitchen directly. Browse verified restaurants, pick the one you want, and contact them with your date,
          headcount and menu. Self-serve catering checkout is not enabled yet.
        </p>
        <ul className="mt-4 space-y-2 text-[12.5px]">
          <li className="rounded-xl bg-[#f7f9f8] p-3">1. Choose a verified kitchen from <Link href="/naijaeats/restaurants" className="font-bold text-[#0b5c33] underline">Restaurants</Link>.</li>
          <li className="rounded-xl bg-[#f7f9f8] p-3">2. Open their page to see the menu and dishes they actually prepare.</li>
          <li className="rounded-xl bg-[#f7f9f8] p-3">3. Contact the kitchen with quantities and date; they confirm availability and pricing.</li>
        </ul>
        <p className="mt-4 text-[11.5px] text-[#6b7a70]">Restaurants can list here by applying through <Link href="/restaurant/apply" className="font-bold underline">Join NaijaEats</Link>.</p>
      </main>
      <EatsFooter />
      <EatsBottomNav cartCount={0} />
    </div>
  );
}
