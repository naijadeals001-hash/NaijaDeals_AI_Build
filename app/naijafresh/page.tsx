import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { freshBasketCount } from "@/lib/services/fresh/cart";
import { categorySummary, listFarms, listProduce } from "@/lib/services/fresh/catalogue";
import { FreshBenefits, FreshHero, FreshRail, ProduceCard, FarmerCard, CategoryTile } from "@/components/fresh/fresh-sections";
import { FreshHeader, FreshBottomNav } from "@/components/fresh/fresh-shell";
import { categoryImage, farmImage, produceImage, sceneImage } from "@/lib/services/fresh/images";
import { AudienceBanners, DeliveryNetwork, FreshAppBanner, FreshFooter, FreshPromoTrio, HowItWorks } from "@/components/fresh/fresh-promo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NaijaFresh — Fresh from African farms, delivered to your door",
  description: "Buy fresh produce directly from verified African farmers for your home, shop or restaurant. Pay securely with NaijaPay and track delivery with NaijaDrive and NaijaSend.",
  alternates: { canonical: "/naijafresh" }
};

/** Seasonal months shown on the promotion strip. Crops are from the live catalogue. */
const HARVEST_MONTHS = [
  { month: "Nov", crops: ["Tomatoes", "Ugu"] },
  { month: "Dec", crops: ["Yam", "Oranges"] },
  { month: "Jan", crops: ["Beans", "Plantain"] },
  { month: "Feb", crops: ["Peppers", "Rice"] },
  { month: "Mar", crops: ["Okro", "Maize"] },
  { month: "Apr", crops: ["Mango", "Cassava"] }
];

export default async function NaijaFreshHomePage() {
  const session = await getSessionUser();
  const [cartCount, produce, farms, categories, riderCount, driverCount] = await Promise.all([
    freshBasketCount(session?.id ?? null),
    listProduce({ take: 24 }),
    listFarms(12),
    categorySummary(),
    prisma.courier.count({ where: { active: true, online: true, foodDeliveryEnabled: true } }),
    prisma.driverProfile.count({ where: { active: true, online: true, foodDeliveryEnabled: true, status: "approved" } })
  ]);
  const totalRiders = riderCount + driverCount;
  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <FreshHeader cartCount={cartCount} />
      <main id="main-content" className="mx-auto max-w-[1440px] px-3 pb-6 sm:px-8">
        <FreshHero image={sceneImage("hero")} />
        <FreshBenefits />

        <section aria-labelledby="fresh-categories" className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="fresh-categories" className="font-display text-[17px] font-extrabold sm:text-[19px]">Shop by Category</h2>
            <Link href="/naijafresh/shop" className="flex items-center gap-1 text-[11.5px] font-bold text-[#0b5c33] hover:underline">
              See All Categories →
            </Link>
          </div>
          <FreshRail title="Produce categories" hideHeading>
            {categories.map((category) => (
              <CategoryTile key={category.slug} category={category} image={categoryImage(category.slug)} />
            ))}
          </FreshRail>
        </section>

        <FreshRail title="Fresh From the Farm Today" href="/naijafresh/shop" seeAll="See All Fresh Produce">
          {produce.length ? (
            produce.slice(0, 12).map((listing) => <ProduceCard key={listing.id} listing={listing} image={produceImage(listing)} />)
          ) : (
            <li className="w-full rounded-xl bg-white p-6 text-center text-[12px] text-[#5d6d64] ring-1 ring-[#eef1ef]">
              No harvests are listed yet. <Link href="/naijafresh/farmers/apply" className="font-bold text-[#0b5c33] underline">Farmers can list produce here.</Link>
            </li>
          )}
        </FreshRail>

        <FreshRail title="Meet Our Farmers" href="/naijafresh/farmers" seeAll="See All Farmers">
          {farms.length ? (
            farms.map((farm) => <FarmerCard key={farm.id} farm={farm} image={farmImage(farm.slug, farm.avatarUrl)} />)
          ) : (
            <li className="w-full rounded-xl bg-white p-6 text-center text-[12px] text-[#5d6d64] ring-1 ring-[#eef1ef]">
              No verified farms yet. <Link href="/naijafresh/farmers/apply" className="font-bold text-[#0b5c33] underline">Apply to join NaijaFresh.</Link>
            </li>
          )}
        </FreshRail>

        <AudienceBanners homeImage={sceneImage("promo-home")} businessImage={sceneImage("promo-business")} />

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <HowItWorks />
          <DeliveryNetwork
            label={
              totalRiders
                ? `${riderCount} NaijaSend couriers and ${driverCount} NaijaDrive drivers are online now.`
                : "No delivery providers are online right now."
            }
          />
        </div>

        <p className="sr-only" aria-live="polite">{HARVEST_MONTHS.map((row) => `${row.month}: ${row.crops.join(", ")}`).join("; ")}</p>
        <FreshPromoTrio farmerImage={sceneImage("promo-farmer")} seasonalImage={sceneImage("promo-seasonal")} />
        <FreshAppBanner image={sceneImage("promo-app")} />
      </main>
      <FreshFooter />
      <FreshBottomNav cartCount={cartCount} />
    </div>
  );
}
