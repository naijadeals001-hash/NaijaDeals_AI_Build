"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Heart, MapPin, Star } from "lucide-react";

/**
 * Tabbed featured-properties section from the mockup: Stays / For Rent / For Sale / Land.
 * Tabs filter client-side over the already-loaded published set (no invented rows).
 */
export type FeaturedItem = {
  id: string;
  slug: string;
  title: string;
  city: string;
  country: string;
  listingType: string;
  nightlyKobo: string;
  salePriceKobo: string | null;
  imageUrl: string | null;
  imageKind: string;
  isDemo: boolean;
  featured: boolean;
  stars: number;
  reviews: number;
};

const TABS = [
  { key: "stays", label: "Stays" },
  { key: "rent", label: "For Rent" },
  { key: "sale", label: "For Sale" },
  { key: "land", label: "Land" }
];

export function FeaturedProperties({ items }: { items: FeaturedItem[] }) {
  const [tab, setTab] = useState("stays");
  const filtered = items.filter((item) =>
    tab === "stays" ? item.listingType === "stay" : tab === "rent" ? item.listingType === "rent" : tab === "land" ? item.listingType === "land" : item.listingType === "sale"
  );
  return (
    <section aria-labelledby="featured-properties" className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="featured-properties" className="font-display text-[17px] font-extrabold text-[#14241b] sm:text-[19px]">Featured Properties</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <div role="tablist" aria-label="Featured property type" className="flex gap-1">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={`rounded-full px-3 py-1 text-[11px] font-extrabold transition ${tab === t.key ? "bg-[#0b5c33] text-white" : "bg-white text-[#14241b] ring-1 ring-[#e3e8e4] hover:bg-[#f2f9f0]"}`}>{t.label}</button>
            ))}
          </div>
          <Link href={`/naijastay/search?type=${tab === "stays" ? "stay" : tab}`} className="ml-1 text-[11.5px] font-bold text-[#0b5c33] hover:underline">See More →</Link>
        </div>
      </div>

      {filtered.length ? (
        <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.slice(0, 3).map((item) => {
            const isSale = item.listingType === "sale" || item.listingType === "land";
            const price = isSale ? item.salePriceKobo : item.nightlyKobo;
            return (
              <li key={item.id} data-featured={item.slug}>
                <article className="group h-full overflow-hidden rounded-2xl bg-white ring-1 ring-[#e6ebe7] transition hover:shadow-[0_8px_28px_rgba(15,40,28,0.12)]">
                  <Link href={`/naijastay/stays/${item.slug}`} className="relative block aspect-[16/10] w-full overflow-hidden bg-[#eef2ef]">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.isDemo ? `${item.title} — demonstration image` : item.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                    ) : null}
                    {item.featured ? <span className="absolute left-2 top-2 rounded-full bg-[#0b8f47] px-2 py-0.5 text-[10px] font-extrabold text-white">Featured</span> : null}
                    {item.isDemo ? <span className="absolute left-2 bottom-2 rounded bg-[#14241b]/70 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-white">Demo</span> : null}
                    <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-[#0b5c33] shadow"><Heart className="h-3.5 w-3.5" aria-hidden /></span>
                  </Link>
                  <div className="p-2.5">
                    <Link href={`/naijastay/stays/${item.slug}`} className="line-clamp-2 font-display text-[14px] font-extrabold leading-tight text-[#14241b] hover:text-[#0b5c33]">{item.title}</Link>
                    <p className="mt-1 flex items-center gap-1 text-[10.5px] text-[#5d6d64]"><MapPin className="h-3 w-3" aria-hidden /> {item.city}, {item.country}</p>
                    <p className="mt-1 flex items-center gap-1 text-[11px]">
                      {item.reviews > 0 ? (
                        <><Star className="h-3.5 w-3.5 fill-[#f5b52e] text-[#f5b52e]" aria-hidden /><b className="text-[#14241b]">{item.stars.toFixed(1)}</b><span className="text-[#6b7a70]">({item.reviews} review{item.reviews === 1 ? "" : "s"})</span></>
                      ) : (
                        <span className="rounded bg-[#f2f9f0] px-1.5 py-0.5 text-[9.5px] font-extrabold text-[#0b5c33]">New — no reviews yet</span>
                      )}
                    </p>
                    <p className="mt-1 text-[13px] font-extrabold text-[#c4551a]">
                      From ₦{(Number(price ?? "0") / 100).toLocaleString("en-NG")}{isSale ? "" : " / night"}
                    </p>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 rounded-2xl bg-white p-5 text-center text-[11.5px] text-[#5d6d64] ring-1 ring-[#eef1ef]">
          No {TABS.find((t) => t.key === tab)?.label.toLowerCase()} listings published yet.{" "}
          <Link href="/naijastay/host" className="font-bold text-[#0b5c33] underline">List a property</Link>
        </p>
      )}
    </section>
  );
}

const STORIES = [
  { quote: "Booking on NaijaStay was so easy. I found a great apartment in Abuja for my business trip.", name: "Chinedu M.", role: "Business Traveller", stars: 5 },
  { quote: "I listed my apartment on NaijaStay and started getting bookings within a week. It's a great platform!", name: "Ngozi A.", role: "Property Owner — Lagos", stars: 5 },
  { quote: "We found a perfect family home to rent in Enugu. The verification and payment process was smooth.", name: "Emeka O.", role: "Tenant", stars: 5 }
];

/**
 * Success stories. These are labelled as testimonials supplied with the approved
 * mockup, not verified customer reviews, so nobody mistakes them for real reviews.
 */
export function SuccessStories() {
  return (
    <section aria-labelledby="stories" className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="stories" className="font-display text-[17px] font-extrabold sm:text-[19px]">Success Stories from Our Community</h2>
        <span className="text-[10px] font-semibold text-[#6b7a70]">Illustrative testimonials</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {STORIES.map((story) => (
          <li key={story.name} className="rounded-2xl bg-white p-3 ring-1 ring-[#e6ebe7]">
            <blockquote className="text-[11.5px] italic leading-5 text-[#3f4d45]">“{story.quote}”</blockquote>
            <p className="mt-2 text-[11.5px] font-extrabold">{story.name}</p>
            <p className="text-[9.5px] text-[#6b7a70]">{story.role}</p>
            <p className="mt-0.5 text-[10px] text-[#f5b52e]" aria-label={`${story.stars} stars`}>{"★".repeat(story.stars)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { ArrowRight };
