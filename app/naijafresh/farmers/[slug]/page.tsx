import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Clock, MapPin, Sprout, Truck } from "lucide-react";
import { getFarmBySlug } from "@/lib/services/fresh/catalogue";
import { ProduceCard } from "@/components/fresh/fresh-sections";
import { farmImage, produceImage } from "@/lib/services/fresh/images";
import { FreshEmpty, FreshPage } from "@/components/fresh/fresh-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const farm = await getFarmBySlug(params.slug);
  return farm
    ? { title: `${farm.name} — NaijaFresh farmers`, description: farm.description ?? `Buy fresh produce directly from ${farm.name} in ${farm.city}, ${farm.state}.`, alternates: { canonical: `/naijafresh/farmers/${params.slug}` } }
    : { title: "Farm not found — NaijaFresh" };
}

export default async function FreshFarmPage({ params }: { params: { slug: string } }) {
  const farm = await getFarmBySlug(params.slug);
  if (!farm) notFound();
  const prep = farm.prepMinMinutes && farm.prepMaxMinutes ? `${farm.prepMinMinutes}–${farm.prepMaxMinutes} minutes` : "Packed to order";

  return (
    <FreshPage>
      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#eef1ef]">
        <div className="h-28 bg-[radial-gradient(circle_at_30%_20%,#2f8f55,#0b5c33)] sm:h-36">
          {farm.coverUrl ? <img src={farm.coverUrl} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <div className="flex flex-wrap items-start gap-3 p-4">
          <span className="-mt-10 grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f2f9f0] ring-4 ring-white">
            {farmImage(farm.slug, farm.avatarUrl) ? <img src={farmImage(farm.slug, farm.avatarUrl) ?? undefined} alt={`${farm.farmerName} of ${farm.name}`} className="h-full w-full object-cover" /> : <span className="font-display text-2xl font-black text-[#0b5c33]/40">{farm.name.charAt(0)}</span>}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-1.5 font-display text-[22px] font-extrabold leading-tight sm:text-[26px]">
              {farm.name}
              {farm.verified ? <BadgeCheck className="h-5 w-5 text-[#0b8f47]" aria-label="Verified farm" /> : null}
              {farm.isSample ? <span className="rounded bg-[#fff3e8] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-[#a3480f]">Demo farm</span> : null}
            </h1>
            <p className="text-[12px] font-semibold text-[#5d6d64]">Farmer: {farm.farmerName}</p>
            <p className="mt-1 flex flex-wrap items-center gap-3 text-[11.5px] text-[#5d6d64]">
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden /> {farm.city}, {farm.country}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden /> {prep} to pack</span>
              <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" aria-hidden /> Delivery ₦{(Number(farm.deliveryFeeKobo) / 100).toLocaleString("en-NG")}</span>
            </p>
            {farm.specialities.length ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {farm.specialities.map((item) => (
                  <li key={item} className="rounded-full bg-[#f2f9f0] px-2.5 py-0.5 text-[10.5px] font-semibold text-[#0b5c33]">{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        {farm.description ? <p className="px-4 pb-4 text-[12.5px] leading-6 text-[#3f4d45]">{farm.description}</p> : null}
      </section>

      <section aria-labelledby="farm-produce" className="mt-5">
        <h2 id="farm-produce" className="mb-2 font-display text-[17px] font-extrabold">Produce from {farm.name}</h2>
        {farm.listings.length ? (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {farm.listings.map((listing) => <ProduceCard key={listing.id} listing={listing} variant="grid" image={produceImage(listing)} />)}
          </ul>
        ) : (
          <FreshEmpty title="Nothing in stock right now" body="This farm has no available produce listed. Check back after the next harvest." cta={{ href: "/naijafresh/shop", label: "Browse other farms" }} />
        )}
      </section>
      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-[#6b7a70]">
        <Sprout className="h-3.5 w-3.5" aria-hidden /> Farm details are published by the farm owner and verified by NaijaFresh.{" "}
        <Link href="/support" className="font-semibold text-[#0b5c33] underline">Report inaccurate details</Link>
      </p>
    </FreshPage>
  );
}
