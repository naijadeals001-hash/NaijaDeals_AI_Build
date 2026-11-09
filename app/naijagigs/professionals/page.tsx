import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, MapPin } from "lucide-react";
import { listGigCategories, listGigProfessionals } from "@/lib/services/gigs/service";
import { GigFilters, EmptyState, SampleBanner } from "@/components/gigs/discovery-shared";

export const metadata: Metadata = {
  title: "Professionals — NaijaGigs",
  description: "Browse verified skilled professionals and local service providers."
};

export const dynamic = "force-dynamic";

const MODE_LABEL: Record<string, string> = { LOCAL: "Local", REMOTE: "Remote", PROJECT: "Projects" };

export default async function ProfessionalsPage({
  searchParams
}: {
  searchParams?: { q?: string; category?: string; city?: string };
}) {
  const q = searchParams?.q?.trim() || undefined;
  const category = searchParams?.category?.trim() || undefined;
  const city = searchParams?.city?.trim() || undefined;

  const [categories, result] = await Promise.all([
    listGigCategories(),
    listGigProfessionals({ q, category, city, countryCode: undefined, page: 1, pageSize: 48 })
  ]);
  const professionals = result.items ?? [];
  const sampleCount = professionals.filter((profile) => Boolean((profile as { isSample?: boolean }).isSample)).length;

  return (
    <main id="main-content" className="mx-auto max-w-[1440px] px-4 py-9 sm:px-6 lg:px-10">
      <header className="mb-5">
        <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-[#0B1F16] sm:text-[34px]">Professionals</h1>
        <p className="mt-1 text-[12.5px] text-[#6B7A72]">
          {result.total} verified professional{result.total === 1 ? "" : "s"}
          {q ? ` matching “${q}”` : ""}
          {city ? ` in ${city}` : ""}.
        </p>
      </header>

      <GigFilters
        base="/naijagigs/professionals"
        categories={categories}
        current={{ q, category, city }}
        queryLabel="Search professionals or skills"
      />

      {sampleCount > 0 ? (
        <div className="mt-4">
          <SampleBanner count={sampleCount} />
        </div>
      ) : null}

      <div className="mt-5">
        {professionals.length === 0 ? (
          <EmptyState
            title="No professionals match these filters"
            body="Try another category or city, or clear the filters. New verified professionals appear as they are approved."
            action={{ href: "/naijagigs", label: "Back to NaijaGigs" }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {professionals.map((profile) => {
              const isSample = Boolean((profile as { isSample?: boolean }).isSample);
              const modes = (profile.serviceModes ?? []).map((mode) => MODE_LABEL[mode] ?? mode).join(" · ");
              const listingCount = (profile as { _count?: { listings?: number } })._count?.listings;
              return (
                <article
                  data-gig-card
                  key={profile.id}
                  className="flex h-full flex-col overflow-hidden rounded-xl border border-[#E5DFD2] bg-white shadow-[0_2px_10px_rgba(33,55,42,0.04)] transition hover:shadow-[0_14px_30px_rgba(33,55,42,0.1)]"
                >
                  <div className="flex items-start gap-3 p-4 pb-0">
                    {profile.avatarUrl ? (
                      <img src={profile.avatarUrl} alt={profile.displayName} className="h-14 w-14 rounded-2xl object-cover" />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#DDECE3] font-display text-xl font-extrabold text-[#0F7A4A]">
                        {profile.displayName.charAt(0)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <h2 className="truncate text-[13.5px] font-extrabold text-[#0B1F16]">{profile.displayName}</h2>
                      <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-[#6B7A72]">
                        <MapPin className="h-3 w-3" aria-hidden /> {profile.city || profile.state}
                      </p>
                      <span
                        className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${
                          isSample ? "bg-[#FFF3D6] text-[#7A5B12]" : "bg-[#EAF4EE] text-[#0F7A4A]"
                        }`}
                      >
                        {isSample ? (
                          "Demonstration"
                        ) : (
                          <>
                            <BadgeCheck className="h-3 w-3" aria-hidden /> Verified
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="line-clamp-2 text-[11.5px] text-[#6B7A72]">{profile.headline}</p>
                    <p className="mt-2 text-[10.5px] font-semibold text-[#45564C]">{modes}</p>
                    {typeof listingCount === "number" ? (
                      <p className="mt-1 text-[10.5px] text-[#6B7A72]">
                        {listingCount} service{listingCount === 1 ? "" : "s"}
                      </p>
                    ) : null}
                    <div className="mt-auto">
                      <Link
                        href={`/naijagigs/professionals/${profile.id}`}
                        className="mt-3 block rounded-xl bg-[#0F7A4A] py-2.5 text-center text-[12px] font-bold text-white transition hover:bg-[#0B6540]"
                      >
                        View profile
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
