import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { StayFooter } from "@/components/stay/stay-home";
import { DESTINATIONS } from "@/lib/services/stay/discovery";
import { stayImage } from "@/lib/services/stay/images";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Destinations — NaijaStay", alternates: { canonical: "/naijastay/destinations" } };

export default async function DestinationsPage() {
  // Only cities with published inventory are shown as bookable.
  const counts = await prisma.stayProperty.groupBy({ by: ["city"], where: { status: "published" }, _count: { _all: true } });
  const byCity = new Map(counts.map((c) => [c.city.toLowerCase(), c._count._all]));
  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[1200px] px-3 pb-24 sm:px-6 lg:pb-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">Top destinations in Africa</h1>
        <p className="mt-0.5 text-[12px] text-[#5d6d64]">Cities where NaijaStay actually has published properties. Unlisted cities are shown without live inventory.</p>
        <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {DESTINATIONS.map((d) => {
            const live = byCity.get(d.city.toLowerCase()) ?? 0;
            const img = stayImage(d.image);
            return (
              <li key={d.slug} data-destination={d.slug}>
                <Link href={`/naijastay/stays?q=${encodeURIComponent(d.city)}`} className="block overflow-hidden rounded-2xl bg-white ring-1 ring-[#eef1ef] hover:shadow-md">
                  <span className="block aspect-[16/10] w-full overflow-hidden bg-[#f2f9f0]">{img ? <img src={img} alt={d.city} loading="lazy" className="h-full w-full object-cover" /> : null}</span>
                  <span className="flex items-center justify-between p-2">
                    <span>
                      <span className="block text-[12px] font-extrabold">{d.city}</span>
                      <span className="block text-[10px] text-[#6b7a70]">{d.country}</span>
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-extrabold ${live ? "bg-[#e8f3e4] text-[#0b5c33]" : "bg-[#f2f9f0] text-[#6b7a70]"}`}>
                      {live ? `${live} ${live === 1 ? "stay" : "stays"}` : "No live inventory"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
