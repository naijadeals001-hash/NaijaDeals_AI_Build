import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { StayBottomNav, StayHeader } from "@/components/stay/stay-shell";
import { PropertyCard, StayFooter } from "@/components/stay/stay-home";
import { STAY_CATEGORIES, searchStay } from "@/lib/services/stay/discovery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Search stays — NaijaStay", alternates: { canonical: "/naijastay/search" } };

const TYPE_LABEL: Record<string, string> = { stay: "Stays", rent: "For rent", sale: "For sale", land: "Land" };

export default async function StaySearchPage({ searchParams }: { searchParams?: { q?: string; type?: string; category?: string; guests?: string; checkIn?: string; checkOut?: string } }) {
  const q = searchParams?.q?.trim() || undefined;
  const type = searchParams?.type;
  const category = searchParams?.category;
  const guests = Number(searchParams?.guests ?? 0) || undefined;
  const listings = await searchStay({ q, category, guests, take: 60 });

  return (
    <div className="min-h-screen bg-[#f7f9f7] text-[#14241b]">
      <StayHeader />
      <main id="main-content" className="mx-auto max-w-[1440px] px-3 pb-6 sm:px-6">
        <h1 className="mt-3 font-display text-[22px] font-extrabold">{q ? `Stays in ${q}` : "Explore stays"}</h1>
        <p className="mt-0.5 text-[12px] text-[#5d6d64]">{listings.length} published {listings.length === 1 ? "property" : "properties"}. Ratings appear only after a guest completes a stay.</p>

        <form action="/naijastay/search" method="get" className="mt-3 flex flex-wrap gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-white px-3 py-2 ring-1 ring-[#dfe6e1]">
            <Search className="h-3.5 w-3.5 text-[#6b7a70]" aria-hidden />
            <span className="sr-only">Destination or property</span>
            <input name="q" defaultValue={q} placeholder="City, country or property" className="w-full bg-transparent text-[12px] outline-none" />
          </label>
          <select name="category" defaultValue={category ?? ""} aria-label="Category" className="rounded-full bg-white px-3 py-2 text-[12px] ring-1 ring-[#dfe6e1]">
            <option value="">All categories</option>
            {STAY_CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
          </select>
          <select name="guests" defaultValue={String(guests ?? "")} aria-label="Guests" className="rounded-full bg-white px-3 py-2 text-[12px] ring-1 ring-[#dfe6e1]">
            <option value="">Any guests</option>
            {[1, 2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{n} guest{n === 1 ? "" : "s"}</option>)}
          </select>
          <button type="submit" className="rounded-full bg-[#0b5c33] px-5 py-2 text-[12px] font-extrabold text-white">Search</button>
        </form>

        <nav aria-label="Filter by listing type" className="mt-3 flex flex-wrap gap-1.5">
          {[["", "All"], ["stay", "Stays"], ["rent", "For rent"], ["sale", "For sale"], ["land", "Land"]].map(([value, label]) => {
            const active = (type ?? "") === value;
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            if (category) params.set("category", category);
            if (guests) params.set("guests", String(guests));
            if (value) params.set("type", value);
            return (
              <Link key={label} href={`/naijastay/search?${params.toString()}`} aria-current={active ? "page" : undefined} className={`rounded-full px-3 py-1.5 text-[11.5px] font-bold ${active ? "bg-[#0b5c33] text-white" : "bg-white text-[#14241b] ring-1 ring-[#dfe6e1]"}`}>{label}</Link>
            );
          })}
        </nav>

        {listings.length ? (
          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {listings.map((property) => <PropertyCard key={property.id} property={property} />)}
          </ul>
        ) : (
          <div className="mt-4 rounded-2xl bg-white p-6 text-center ring-1 ring-[#eef1ef]">
            <p className="font-display text-[15px] font-extrabold">No properties match that search</p>
            <p className="mx-auto mt-1 max-w-md text-[11.5px] leading-5 text-[#5d6d64]">NaijaStay only lists properties that hosts have published. Try a different city or category.</p>
            <Link href="/naijastay/search" className="mt-3 inline-flex rounded-full bg-[#0b5c33] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Clear search</Link>
          </div>
        )}
      </main>
      <StayFooter />
      <StayBottomNav />
    </div>
  );
}
