import Link from "next/link";
import { listGenres, listTracks } from "@/lib/services/stream/service";
import { TrackList, type ListTrack } from "@/components/stream/track-list";

export const dynamic = "force-dynamic";

export default async function MusicPage({ searchParams }: { searchParams?: { genre?: string; q?: string } }) {
  const genre = searchParams?.genre?.trim() || undefined;
  const [result, genres] = await Promise.all([listTracks({ genre, q: searchParams?.q, take: 60 }), listGenres()]);
  const tracks = (result.items as unknown as ListTrack[]).map((track) => ({ ...track }));

  return (
    <main className="px-4 py-6 sm:px-6">
      <h1 className="font-display text-[26px] font-extrabold">Music</h1>
      <p className="mt-1 text-[12px] text-white/50">{result.total} published track{result.total === 1 ? "" : "s"}{genre ? ` in ${genre}` : ""}.</p>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
        <Link href="/naijastream/music" aria-current={!genre ? "page" : undefined} className={`shrink-0 rounded-full px-4 py-1.5 text-[11.5px] font-bold ${!genre ? "bg-emerald-500 text-black" : "border border-white/10 bg-white/5 text-white/70"}`}>All</Link>
        {genres.map((item) => (
          <Link key={item.genre} href={`/naijastream/music?genre=${encodeURIComponent(item.genre)}`} aria-current={genre === item.genre ? "page" : undefined} className={`shrink-0 rounded-full px-4 py-1.5 text-[11.5px] font-bold ${genre === item.genre ? "bg-emerald-500 text-black" : "border border-white/10 bg-white/5 text-white/70 hover:text-emerald-300"}`}>
            {item.genre}
          </Link>
        ))}
      </div>
      <div className="mt-4">
        <TrackList tracks={tracks} emptyMessage="No published tracks match this filter. Verified creators' releases appear here once published." />
      </div>
    </main>
  );
}
