import Link from "next/link";
import { Globe2 } from "lucide-react";
import { exploreAfrica, listGenres } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

const COUNTRY_NAMES: Record<string, string> = {
  NG: "Nigeria",
  GH: "Ghana",
  KE: "Kenya",
  ZA: "South Africa",
  TZ: "Tanzania",
  SN: "Senegal",
  CI: "Côte d'Ivoire"
};

/**
 * Explore Africa — real catalogue grouped by artist country and by genre.
 * No invented regional popularity: groups simply reflect which artists and
 * tracks actually exist, with counts taken from the database.
 */
export default async function ExplorePage() {
  const [countries, genres] = await Promise.all([exploreAfrica(), listGenres()]);

  return (
    <main className="px-4 py-6 sm:px-6">
      <h1 className="flex items-center gap-2 font-display text-[26px] font-extrabold">
        <Globe2 className="h-6 w-6 text-emerald-400" aria-hidden /> Explore Africa
      </h1>
      <p className="mt-1 text-[12px] text-white/50">Music by country and genre, drawn from live catalogue data — never ranked by invented statistics.</p>

      {countries.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 p-8 text-center text-[12.5px] text-white/50">
          No artists with published music yet.
        </p>
      ) : (
        <section className="mt-5">
          <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-white/45">By country</h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {countries.map((group) => (
              <li key={group.countryCode} className="rounded-xl border border-white/10 bg-[#101613] p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-display text-[16px] font-extrabold">{COUNTRY_NAMES[group.countryCode] ?? group.countryCode}</p>
                  <span className="text-[10.5px] text-white/40">{group.artists.length} artist{group.artists.length === 1 ? "" : "s"}</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {group.artists.slice(0, 5).map((artist) => (
                    <li key={artist.id}>
                      <Link href={`/naijastream/artists/${artist.slug}`} className="flex items-center gap-2 rounded-lg py-1 hover:bg-white/5">
                        {artist.avatarUrl ? (
                          <img src={artist.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[11px]">{artist.name.charAt(0)}</span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{artist.name}</span>
                        <span className="text-[10px] text-white/35">{artist.tracks} track{artist.tracks === 1 ? "" : "s"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
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
