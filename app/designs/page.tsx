import type { Metadata } from "next";
import Link from "next/link";
import { loadVariants, resolveVariant } from "@/lib/home/assignment";
import { DESIGNS, type DesignKey } from "@/lib/home/designs";
import { ChooseDesign } from "@/components/home/choose-design";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Choose your NaijaDeals homepage",
  description: "Preview the four NaijaDeals homepage designs and pick the one you prefer.",
  alternates: { canonical: "/designs" }
};

const PREVIEWS: Record<DesignKey, { title: string; summary: string; image: string }> = {
  original: { title: "Original NaijaDeals", summary: "The established homepage: NaijaDrive-led hero, ecosystem grid and the original sections.", image: "/generated/home/home-hero-drive.webp" },
  "africa-super-app": { title: "Africa Super-App", summary: "The approved redesign: Abuja landmarks, every vertical and a premium front door.", image: "/generated/home/home-hero-abuja.webp" },
  mobility: { title: "Mobility & Services", summary: "Rides, deliveries, food and local services first — clean and fast.", image: "/generated/home/home-hero-mobility.webp" },
  commerce: { title: "Commerce & Lifestyle", summary: "Shopping, food, stays and entertainment, with African businesses centre stage.", image: "/generated/home/home-hero-commerce.webp" }
};

export default async function DesignsPage() {
  const [{ variant, manual }, variants] = await Promise.all([resolveVariant(), loadVariants()]);
  const enabled = new Set(variants.filter((row) => row.enabled).map((row) => row.key));
  return (
    <main id="main-content" className="mx-auto max-w-[1100px] px-4 pb-16 pt-6">
      <h1 className="font-display text-[26px] font-extrabold">Choose your homepage</h1>
      <p className="mt-1 max-w-2xl text-[12.5px] leading-6 text-[#5d6d64]">
        NaijaDeals has four homepage designs. Each one reaches every service — they differ in what they put first.
        {manual ? " You have chosen your design; it will not change automatically." : " You were assigned one at random, and you can change it any time."}
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {(Object.keys(PREVIEWS) as DesignKey[]).map((key) => {
          const preview = PREVIEWS[key];
          const design = DESIGNS[key];
          const isCurrent = variant === key;
          const available = key === "original" || enabled.has(key);
          return (
            <li key={key}>
              <article className={`overflow-hidden rounded-2xl bg-white ring-1 ${isCurrent ? "ring-2 ring-[#0b5c33]" : "ring-[#e6ebe7]"}`}>
                <div className="relative aspect-[16/9] w-full bg-[#eef2ef]">
                  <img src={preview.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                  {isCurrent ? <span className="absolute left-2 top-2 rounded-full bg-[#0b5c33] px-2 py-0.5 text-[10px] font-extrabold text-white">Current design</span> : null}
                </div>
                <div className="p-3">
                  <h2 className="font-display text-[15px] font-extrabold">{preview.title}</h2>
                  <p className="mt-0.5 text-[11px] leading-5 text-[#5d6d64]">{preview.summary}</p>
                  <p className="mt-1 text-[10px] text-[#8a938d]">{design.slides.length} hero slides · all {10} services linked</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ChooseDesign designKey={key} disabled={!available || isCurrent} current={isCurrent} />
                    <Link href="/" className="rounded-full px-3 py-1.5 text-[11px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca]">See live homepage</Link>
                  </div>
                  {!available ? <p className="mt-1 text-[10px] font-semibold text-[#a3480f]">This design is currently disabled by NaijaDeals.</p> : null}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
