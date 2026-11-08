import Link from "next/link";
import { notFound } from "next/navigation";
import { getTrackBySlug, listTracks } from "@/lib/services/stream/service";
import { TrackList, type ListTrack } from "@/components/stream/track-list";

export const dynamic = "force-dynamic";

export default async function TrackPage({ params }: { params: { slug: string } }) {
  const track = await getTrackBySlug(params.slug);
  if (!track) notFound();
  const related = await listTracks({ genre: track.genre ?? undefined, take: 8 });
  const others = (related.items as unknown as ListTrack[]).filter((item) => item.id !== track.id);

  return (
    <main className="px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end gap-6">
        {track.artworkUrl ? (
          <img src={track.artworkUrl} alt={track.title} className="h-40 w-40 rounded-2xl object-cover shadow-2xl sm:h-52 sm:w-52" />
        ) : (
          <div className="h-40 w-40 rounded-2xl bg-white/10 sm:h-52 sm:w-52" />
        )}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Track</p>
          <h1 className="mt-1 font-display text-[30px] font-black leading-tight sm:text-[42px]">{track.title}</h1>
          <p className="mt-1 text-[13px] text-white/65">
            <Link href={`/naijastream/artists/${track.artist.slug}`} className="font-bold hover:text-emerald-300">
              {track.artist.name}
            </Link>
            {track.genre ? ` · ${track.genre}` : ""} · {track.playCount} plays
          </p>
          <p className="mt-1 text-[11px] text-white/40">
            {track.audioUrl ? "Audio published" : "Audio not yet published — playback is unavailable"}
            {track.isSample ? " · Demonstration release" : ""}
          </p>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-widest text-white/45">More like this</h2>
        <TrackList tracks={others} emptyMessage="No related tracks yet." />
      </section>
    </main>
  );
}
