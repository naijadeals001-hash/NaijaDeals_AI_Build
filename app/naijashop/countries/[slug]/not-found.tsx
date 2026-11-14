import Link from "next/link";
import { Compass, ArrowRight } from "lucide-react";

export default function CountryNotFound() {
  return (
    <main className="grid min-h-[55vh] place-items-center bg-[#f7faf4] px-4 py-14">
      <div className="max-w-lg rounded-3xl border border-[#dfe8dc] bg-white p-6 text-center">
        <Compass className="mx-auto h-8 w-8 text-[#0b5c33]" aria-hidden />
        <h1 className="mt-2 font-display text-[26px] font-extrabold text-[#14241b]">Country guide not found</h1>
        <p className="mt-1 text-[11.5px] leading-6 text-[#4b5b51]">
          The guide may be unpublished, renamed or unavailable. Published country guides remain listed in the directory.
        </p>
        <Link
          href="/naijashop/countries"
          className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-[#07351f] px-4 text-[11px] font-extrabold text-white"
        >
          View all countries
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </main>
  );
}
