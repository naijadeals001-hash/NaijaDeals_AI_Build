import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, MapPin, Sprout } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ProduceCard } from "@/components/fresh/fresh-sections";
import { AddProducePanel } from "@/components/fresh/add-produce";
import { FreshPage } from "@/components/fresh/fresh-page";
import { produceImage } from "@/lib/services/fresh/images";
import { priceLabel } from "@/lib/services/fresh/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const listing = await prisma.produceListing.findUnique({ where: { slug: params.slug }, select: { name: true, farm: { select: { name: true } } } });
  return listing
    ? { title: `${listing.name} from ${listing.farm.name} — NaijaFresh`, alternates: { canonical: `/naijafresh/shop/${params.slug}` } }
    : { title: "Produce not found — NaijaFresh" };
}

export default async function FreshListingPage({ params }: { params: { slug: string } }) {
  const listing = await prisma.produceListing.findUnique({
    where: { slug: params.slug },
    include: {
      farm: { select: { id: true, slug: true, name: true, farmerName: true, city: true, state: true, country: true, verified: true, avatarUrl: true, prepMinMinutes: true, prepMaxMinutes: true, deliveryFeeKobo: true } }
    }
  });
  if (!listing || !listing.farm.verified) notFound();

  const more = await prisma.produceListing.findMany({
    where: { farmId: listing.farmId, available: true, id: { not: listing.id } },
    take: 6,
    select: { id: true, slug: true, name: true, unit: true, priceKobo: true, quantity: true, imageUrl: true, farm: { select: { name: true } } }
  });
  const prep = listing.farm.prepMinMinutes && listing.farm.prepMaxMinutes ? `${listing.farm.prepMinMinutes}–${listing.farm.prepMaxMinutes} min to pack` : "Packed to order";
  const image = produceImage(listing);

  return (
    <FreshPage>
      <nav aria-label="Breadcrumb" className="mb-3 text-[11px] text-[#6b7a70]">
        <Link href="/naijafresh" className="hover:underline">NaijaFresh</Link>
        <span aria-hidden> / </span>
        <Link href={`/naijafresh/category/${listing.category}`} className="hover:underline">{listing.category.replace(/-/g, " ")}</Link>
        <span aria-hidden> / </span>
        <span className="font-semibold text-[#14241b]">{listing.name}</span>
      </nav>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#eef1ef]">
          <div className="aspect-square w-full bg-[#f4f6f5]">
            {image ? (
              <img src={image} alt={listing.name} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-[11px] font-semibold uppercase tracking-wide text-[#9aa59e]">Photo pending</div>
            )}
          </div>
        </div>
        <div>
          <h1 className="font-display text-[24px] font-extrabold leading-tight sm:text-[30px]">{listing.name}</h1>
          <Link href={`/naijafresh/farmers/${listing.farm.slug}`} className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-[#0b5c33] hover:underline">
            <Sprout className="h-3.5 w-3.5" aria-hidden /> {listing.farm.name}
            {listing.farm.verified ? <BadgeCheck className="h-3.5 w-3.5 text-[#0b8f47]" aria-label="Verified farm" /> : null}
          </Link>
          <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[#5d6d64]"><MapPin className="h-3 w-3" aria-hidden /> {listing.farm.city}, {listing.farm.country}</p>
          {listing.description ? <p className="mt-3 max-w-xl text-[12.5px] leading-6 text-[#3f4d45]">{listing.description}</p> : null}
          <AddProducePanel
            listingId={listing.id}
            name={listing.name}
            unit={listing.unit}
            minimumOrder={listing.minimumOrder}
            stock={listing.available ? listing.quantity : 0}
            priceText={priceLabel(listing.priceKobo, listing.unit)}
            deliveryText={priceLabel(listing.farm.deliveryFeeKobo, "order")}
            prepText={prep}
          />
          <p className="mt-3 max-w-md text-[11px] leading-5 text-[#6b7a70]">
            Price is the farm&apos;s own listing price per {listing.unit}; NaijaFresh does not set market prices.{" "}
            <Link href="/naijafresh/business" className="font-semibold text-[#0b5c33] underline">Need a bulk quantity? Request a quote.</Link>
          </p>
        </div>
      </div>
      {more.length ? (
        <section aria-labelledby="more-from-farm" className="mt-6">
          <h2 id="more-from-farm" className="mb-2 font-display text-[17px] font-extrabold">More from {listing.farm.name}</h2>
          <ul className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {more.map((row) => <ProduceCard key={row.id} listing={row} image={produceImage(row)} />)}
          </ul>
        </section>
      ) : null}
    </FreshPage>
  );
}
