import Link from "next/link";
import { Globe2 } from "lucide-react";
import { exploreAfrica, listGenres } from "@/lib/services/stream/service";
import { listCities } from "@/lib/services/stream/cities";
import { ExploreCities } from "@/components/stream/explore-cities";

export const dynamic = "force-dynamic";

/**
 * Explore Africa — the editorial city catalogue (region tabs + country filter)
 * above live catalogue views by country and genre. Counts come from published
 * records; nothing is ranked by invented statistics.
 */
export default async function ExplorePage() {
  const [cities, countries, genres] = await Promise.all([listCities(), exploreAfrica(), listGenres()]);

  return (
    <main className="px-4 py-6 sm:px-6">
      <h1 className="flex items-center gap-2 font-display text-[26px] font-extrabold">
        <Globe2 className="h-6 w-6 text-emerald-400" aria-hidden /> Explore Africa
      </h1>
      <p className="mt-1 text-[12px] text-white/50">Fifty-plus sounds across five regions. City pages list only what creators there have published.</p>

      <section className="mt-5" aria-labelledby="cities-heading">
        <h2 id="cities-heading" className="sr-only">
          Cities
        </h2>
        <ExploreCities cities={cities} />
      </section>

      {countries.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-white/45">Creators by country</h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {countries.map((group) => (
              <li key={group.countryCode} className="rounded-xl border border-white/10 bg-[#101613] p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-display text-[16px] font-extrabold">{group.countryCode}</p>
                  <span className="text-[10.5px] text-white/40">
                    {group.artists.length} artist{group.artists.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {group.artists.slice(0, 6).map((artist) => (
                    <li key={artist.id}>
                      <Link href={`/naijastream/artists/${artist.slug}`} className="flex items-center gap-2 rounded-lg py-1 hover:bg-white/5">
                        {artist.avatarUrl ? (
                          <img src={artist.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[11px]">{artist.name.charAt(0)}</span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{artist.name}</span>
                        <span className="text-[10px] text-white/35">
                          {artist.tracks} track{artist.tracks === 1 ? "" : "s"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-white/45">By genre</h2>
        {genres.length === 0 ? (
          <p className="mt-2 text-[12px] text-white/50">No published tracks yet.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {genres.map((genre) => (
              <li key={genre.genre}>
                <Link
                  href={`/naijastream/music?genre=${encodeURIComponent(genre.genre)}`}
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[12px] font-bold text-white/75 hover:border-emerald-400/40 hover:text-emerald-300"
                >
                  {genre.genre}
                  <span className="text-[10px] text-white/35">{genre.tracks}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
