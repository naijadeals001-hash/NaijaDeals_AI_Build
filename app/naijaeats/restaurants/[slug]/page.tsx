import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Clock, Star } from "lucide-react";
import { EatsHeader } from "@/components/eats/eats-header";
import { EatsFooter } from "@/components/eats/eats-footer";
import { EatsBottomNav } from "@/components/eats/eats-bottom-nav";
import { listCuisineRail, listStorefrontRestaurants } from "@/lib/services/eats/storefront";
import { AddToBasket } from "@/components/eats/add-to-basket";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: params.slug }, select: { name: true } });
  return { title: restaurant ? `${restaurant.name} — NaijaEats` : "Restaurant — NaijaEats" };
}

export default async function RestaurantPage({ params }: { params: { slug: string } }) {
  const [restaurant, all] = await Promise.all([
    prisma.restaurant.findFirst({
      where: { slug: params.slug, status: "VERIFIED" },
      select: {
        id: true,
        name: true,
        cuisine: true,
        market: true,
        address: true,
        description: true,
        coverUrl: true,
        logoUrl: true,
        dishes: true,
        prepMinMinutes: true,
        prepMaxMinutes: true,
        deliveryFeeKobo: true,
        ratings: { select: { rating: true, customerName: true, comment: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5 },
        menuItems: {
          where: { published: true },
          orderBy: [{ featured: "desc" }, { name: "asc" }],
          select: { id: true, name: true, description: true, priceKobo: true, imageUrl: true, available: true, category: true }
        }
      }
    }),
    listStorefrontRestaurants()
  ]);
  if (!restaurant) notFound();

  const cuisines = await listCuisineRail(all);
  const average = restaurant.ratings.length
    ? Math.round((restaurant.ratings.reduce((sum, row) => sum + row.rating, 0) / restaurant.ratings.length) * 10) / 10
    : null;
  const window = restaurant.prepMinMinutes && restaurant.prepMaxMinutes ? `${restaurant.prepMinMinutes} – ${restaurant.prepMaxMinutes} min` : null;

  return (
    <div className="min-h-screen bg-white pb-20 lg:pb-0">
      <EatsHeader destination="Lagos, Nigeria" cartCount={0} cuisines={cuisines} />
      <main className="mx-auto max-w-[1200px] px-3 py-4 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-[11px] text-[#6b7a70]">
          <Link href="/naijaeats" className="hover:text-[#0b5c33]">NaijaEats</Link>
          <span aria-hidden> › </span>
          <Link href="/naijaeats/restaurants" className="hover:text-[#0b5c33]">Restaurants</Link>
          <span aria-hidden> › </span>
          <span>{restaurant.name}</span>
        </nav>

        <header className="mt-2 overflow-hidden rounded-2xl bg-[#0b5c33]">
          {restaurant.coverUrl ? <img src={restaurant.coverUrl} alt="" className="h-36 w-full object-cover sm:h-52" /> : null}
          <div className="flex items-center gap-3 p-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
              {restaurant.logoUrl ? (
                <img src={restaurant.logoUrl} alt={restaurant.name} className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-xl font-black text-[#0b5c33]">{restaurant.name.charAt(0)}</span>
              )}
            </span>
            <div className="min-w-0">
              <h1 className="flex items-center gap-1 font-display text-[20px] font-extrabold text-white sm:text-[24px]">
                {restaurant.name} <BadgeCheck className="h-4 w-4 text-[#8ed14b]" aria-label="Verified" />
              </h1>
              <p className="text-[11.5px] text-white/75">{restaurant.cuisine} · {restaurant.market} · {restaurant.address}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/85">
                {average ? (
                  <span className="flex items-center gap-0.5 font-bold"><Star className="h-3 w-3 fill-[#f5a623] text-[#f5a623]" aria-hidden /> {average.toFixed(1)} ({restaurant.ratings.length})</span>
                ) : (
                  <span className="text-white/60">No ratings yet</span>
                )}
                <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5">
                  <Clock className="h-3 w-3" aria-hidden /> {window ?? "Timing set by kitchen"}
                </span>
              </p>
            </div>
          </div>
        </header>

        {restaurant.description ? <p className="mt-3 text-[12.5px] leading-6 text-[#4a5a50]">{restaurant.description}</p> : null}

        <section className="mt-5" aria-labelledby="menu-heading">
          <h2 id="menu-heading" className="font-display text-[18px] font-extrabold text-[#14241b]">Menu</h2>
          {restaurant.menuItems.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-[#d9e2dc] p-6 text-center text-[12px] text-[#6b7a70]">
              This kitchen has not published any dishes yet.
            </p>
          ) : (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {restaurant.menuItems.map((dish) => (
                <li key={dish.id} data-dish={dish.id} className="flex gap-3 rounded-xl bg-white p-2.5 ring-1 ring-[#eef1ef]">
                  <span className="block h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[#f4f6f5]">
                    {dish.imageUrl ? (
                      <img src={dish.imageUrl} alt={dish.name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-[10px] text-[#8a938d]">No photo</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold text-[#14241b]">{dish.name}</span>
                    {dish.description ? <span className="mt-0.5 line-clamp-2 block text-[10.5px] leading-4 text-[#6b7a70]">{dish.description}</span> : null}
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-extrabold text-[#0b5c33]">₦{(Number(dish.priceKobo) / 100).toLocaleString("en-NG")}</span>
                      <AddToBasket menuItemId={dish.id} name={dish.name} available={dish.available} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="reviews" className="mt-6 scroll-mt-24" aria-labelledby="ratings-heading">
          <h2 id="ratings-heading" className="font-display text-[18px] font-extrabold text-[#14241b]">Customer ratings</h2>
          {restaurant.ratings.length === 0 ? (
            <p className="mt-2 text-[12px] text-[#6b7a70]">Ratings appear once customers receive their orders.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {restaurant.ratings.map((rating, index) => (
                <li key={index} className="rounded-xl bg-[#f7f9f8] p-3">
                  <p className="flex items-center gap-1 text-[12px] font-bold text-[#14241b]">
                    <Star className="h-3.5 w-3.5 fill-[#f5a623] text-[#f5a623]" aria-hidden /> {rating.rating}.0
                    <span className="ml-1 font-normal text-[#6b7a70]">· {rating.customerName}</span>
                  </p>
                  {rating.comment ? <p className="mt-1 text-[11.5px] leading-5 text-[#4a5a50]">{rating.comment}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <EatsFooter />
      <EatsBottomNav cartCount={0} />
    </div>
  );
}
