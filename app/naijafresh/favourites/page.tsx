import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { listFreshFavourites } from "@/lib/services/fresh/cart";
import { ProduceCard } from "@/components/fresh/fresh-sections";
import { produceImage } from "@/lib/services/fresh/images";
import { FreshEmpty, FreshHeading, FreshPage } from "@/components/fresh/fresh-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Favourites — NaijaFresh" };

export default async function FreshFavouritesPage() {
  const session = await getSessionUser();
  if (!session) {
    return (
      <FreshPage>
        <FreshHeading eyebrow="Favourites" title="Your favourites" />
        <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-[#eef1ef]">
          <p className="font-display text-[16px] font-extrabold">Sign in to save favourites</p>
          <Link href="/login?next=/naijafresh/favourites" className="mt-4 inline-flex rounded-full bg-[#0b5c33] px-5 py-2 text-[12px] font-extrabold text-white">Sign in</Link>
        </div>
      </FreshPage>
    );
  }
  const { listings, farms } = await listFreshFavourites(session.id);
  return (
    <FreshPage>
      <FreshHeading eyebrow="Favourites" title="Your favourites" description="Saved produce and farms, so you can reorder the same harvest." />
      {listings.length || farms.length ? (
        <>
          {listings.length ? (
            <section aria-labelledby="fav-produce">
              <h2 id="fav-produce" className="mb-2 font-display text-[16px] font-extrabold">Saved produce</h2>
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                {listings.map((listing) => <ProduceCard key={listing.id} listing={listing} variant="grid" favourited image={produceImage(listing)} />)}
              </ul>
            </section>
          ) : null}
          {farms.length ? (
            <section aria-labelledby="fav-farms" className="mt-5">
              <h2 id="fav-farms" className="mb-2 font-display text-[16px] font-extrabold">Saved farms</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {farms.map((farm) => (
                  <li key={farm.id}>
                    <Link href={`/naijafresh/farmers/${farm.slug}`} className="block rounded-xl bg-white p-3 ring-1 ring-[#eef1ef] hover:shadow-md">
                      <p className="text-[12.5px] font-extrabold">{farm.name}</p>
                      <p className="text-[10.5px] text-[#6b7a70]">{farm.city}, {farm.state} · {farm.specialities.join(", ")}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <FreshEmpty title="No favourites yet" body="Tap the heart on any produce card to save it here." cta={{ href: "/naijafresh/shop", label: "Browse produce" }} />
      )}
    </FreshPage>
  );
}
