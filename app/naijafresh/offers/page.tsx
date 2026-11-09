import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ProduceCard } from "@/components/fresh/fresh-sections";
import { produceImage } from "@/lib/services/fresh/images";
import { FreshEmpty, FreshHeading, FreshPage } from "@/components/fresh/fresh-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Offers & deals — NaijaFresh", description: "Produce farms have priced for bulk purchase, and the best value per agricultural unit today." };

/**
 * "Offers" only lists listings the farm itself has priced as a bulk or
 * minimum-order deal. NaijaFresh does not discount prices on a farm's behalf,
 * so there is never a manufactured was/now price on this page.
 */
export default async function FreshOffersPage() {
  const [bulk, cheapest] = await Promise.all([
    prisma.produceListing.findMany({
      where: { available: true, farm: { verified: true }, minimumOrder: { gte: 5 } },
      orderBy: { minimumOrder: "desc" },
      take: 20,
      select: { id: true, slug: true, name: true, unit: true, priceKobo: true, quantity: true, minimumOrder: true, imageUrl: true, farm: { select: { name: true } } }
    }),
    prisma.produceListing.findMany({
      where: { available: true, farm: { verified: true } },
      orderBy: { priceKobo: "asc" },
      take: 10,
      select: { id: true, slug: true, name: true, unit: true, priceKobo: true, quantity: true, minimumOrder: true, imageUrl: true, farm: { select: { name: true } } }
    })
  ]);

  return (
    <FreshPage>
      <FreshHeading
        eyebrow="Offers"
        title="Offers & deals"
        description="Value that comes from the farms themselves: bulk minimums and today's lowest listed prices per unit. NaijaFresh does not invent discounts or cross out prices a farm never charged."
      />
      <section aria-labelledby="bulk-offers">
        <h2 id="bulk-offers" className="mb-2 font-display text-[16px] font-extrabold">Bulk-friendly listings</h2>
        {bulk.length ? (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {bulk.map((listing) => (
              <ProduceCard key={listing.id} listing={listing} variant="grid" image={produceImage(listing)} />
            ))}
          </ul>
        ) : (
          <FreshEmpty title="No bulk listings yet" body="Farms with a minimum order of five units or more appear here." cta={{ href: "/naijafresh/business", label: "Request a wholesale quote instead" }} />
        )}
      </section>
      <section aria-labelledby="value" className="mt-5">
        <h2 id="value" className="mb-2 font-display text-[16px] font-extrabold">Lowest price per unit today</h2>
        <ul className="divide-y divide-[#f0f3f1] rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
          {cheapest.map((listing) => (
            <li key={listing.id} className="flex flex-wrap items-center justify-between gap-1 py-1.5 text-[12px]">
              <Link href={`/naijafresh/shop/${listing.slug}`} className="font-semibold hover:underline">{listing.name} <span className="font-normal text-[#6b7a70]">· {listing.farm.name}</span></Link>
              <span className="font-extrabold text-[#0b5c33]">₦{(Number(listing.priceKobo) / 100).toLocaleString("en-NG")} / {listing.unit}</span>
            </li>
          ))}
          {!cheapest.length ? <li className="py-1.5 text-[12px] text-[#5d6d64]">No listings available.</li> : null}
        </ul>
      </section>
    </FreshPage>
  );
}
