import type { Metadata } from "next";
import Link from "next/link";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayFooter, PropertyCard, StayRail } from "@/components/stay/stay-home";
import { DESTINATIONS, searchStay } from "@/lib/services/stay/discovery";
import { stayImage } from "@/lib/services/stay/images";
import { StayPaused } from "@/components/stay/stay-paused";
import { stayPageAccess } from "@/lib/services/stay/access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Stays & accommodation — NaijaStay", alternates: { canonical: "/naijastay/stays" } };

export default async function StaysPage({ searchParams }: { searchParams?: { q?: string; guests?: string } }) {
  const access = await stayPageAccess();
  if (!access.accessible) return <StayPaused message={access.message} />;
  const q = searchParams?.q?.trim() || undefined;
  const guests = Number(searchParams?.guests ?? 0) || undefined;
  const listings = await searchStay({ q, guests, take: 60 });
  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[1440px] px-3 pb-24 sm:px-6 lg:pb-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">{q ? `Stays in ${q}` : "Stays & accommodation"}</h1>
        <p className="mt-0.5 text-[12px] text-[#5d6d64]">{listings.length} published {listings.length === 1 ? "property" : "properties"} on NaijaStay.</p>
        {listings.length ? (
          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {listings.map((property) => <PropertyCard key={property.id} property={property} />)}
          </ul>
        ) : (
          <div className="mt-4 rounded-2xl bg-white p-6 text-center ring-1 ring-[#eef1ef]">
            <p className="font-display text-[15px] font-extrabold">No stays match that search</p>
            <Link href="/naijastay/stays" className="mt-3 inline-flex rounded-full bg-[#0b5c33] px-4 py-1.5 text-[11.5px] font-extrabold text-white">See all stays</Link>
          </div>
        )}

        <StayRail title="Top Destinations in Africa" href="/naijastay/destinations" seeAll="Explore All Destinations" label="Destinations">
          {DESTINATIONS.map((d) => {
            const img = stayImage(d.image);
            return (
              <li key={d.slug} className="w-[160px] shrink-0 snap-start">
                <Link href={`/naijastay/stays?q=${encodeURIComponent(d.city)}`} className="block overflow-hidden rounded-xl bg-white ring-1 ring-[#eef1ef] hover:shadow-md">
                  <span className="block aspect-[16/10] w-full overflow-hidden bg-[#f2f9f0]">{img ? <img src={img} alt={d.city} loading="lazy" className="h-full w-full object-cover" /> : null}</span>
                  <span className="block p-1.5"><span className="block text-[11px] font-extrabold">{d.city}</span><span className="block text-[9.5px] text-[#6b7a70]">{d.country}</span></span>
                </Link>
              </li>
            );
          })}
        </StayRail>
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
