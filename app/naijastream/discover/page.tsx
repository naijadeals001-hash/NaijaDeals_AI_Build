import Link from "next/link";
import { listArtists, listGenres, listTracks } from "@/lib/services/stream/service";
import { TrackList, type ListTrack } from "@/components/stream/track-list";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const [genres, newest, artists] = await Promise.all([listGenres(), listTracks({ take: 12 }), listArtists({ take: 8 })]);
  return (
    <main className="px-4 py-6 sm:px-6">
      <h1 className="font-display text-[26px] font-extrabold">Discover</h1>
      <p className="mt-1 text-[12px] text-white/50">Browse by genre, meet new artists and hear what&apos;s new.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {genres.map((genre) => (
          <Link key={genre.genre} href={`/naijastream/music?genre=${encodeURIComponent(genre.genre)}`} className="rounded-xl bg-gradient-to-br from-emerald-700/40 to-[#131a16] p-4 hover:from-emerald-600/50">
            <p className="font-display text-[15px] font-extrabold">{genre.genre}</p>
            <p className="text-[10.5px] text-white/50">{genre.tracks} tracks</p>
          </Link>
        ))}
      </div>
      <section className="mt-8">
        <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-widest text-white/45">New on NaijaStream</h2>
        <TrackList tracks={newest.items as unknown as ListTrack[]} emptyMessage="Nothing published yet." />
      </section>
      <section className="mt-8">
        <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-widest text-white/45">Artists</h2>
        <ul className="flex gap-3 overflow-x-auto pb-2">
          {artists.map((artist) => (
            <li key={artist.id} className="w-[110px] shrink-0 text-center">
              <Link href={`/naijastream/artists/${artist.slug}`}>
                {artist.avatarUrl ? <img src={artist.avatarUrl} alt="" className="mx-auto h-[110px] w-[110px] rounded-full object-cover" loading="lazy" /> : <span className="mx-auto flex h-[110px] w-[110px] items-center justify-center rounded-full bg-white/10 text-2xl">{artist.name.charAt(0)}</span>}
                <span className="mt-1 block truncate text-[12px] font-bold">{artist.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
