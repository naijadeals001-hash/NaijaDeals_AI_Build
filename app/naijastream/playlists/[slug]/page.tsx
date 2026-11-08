import { notFound } from "next/navigation";
import { getPlaylistBySlug } from "@/lib/services/stream/service";
import { TrackList, type ListTrack } from "@/components/stream/track-list";
import { CoverArt } from "@/components/stream/cover-art";

export const dynamic = "force-dynamic";

export default async function PlaylistPage({ params }: { params: { slug: string } }) {
  const playlist = await getPlaylistBySlug(params.slug);
  if (!playlist) notFound();
  const tracks = playlist.items.map((item) => item.track).filter(Boolean) as unknown as ListTrack[];
  const minutes = Math.round(playlist.totalDurationSec / 60);

  return (
    <main>
      <header className="relative overflow-hidden px-4 pb-6 pt-8 sm:px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/40 to-transparent" aria-hidden />
        <div className="relative flex flex-wrap items-end gap-5">
          <CoverArt
            src={playlist.coverUrl}
            title={playlist.title}
            subtitle={playlist.isEditorial ? "NaijaStream" : undefined}
            className="h-36 w-36 shrink-0 rounded-2xl shadow-2xl sm:h-44 sm:w-44"
          />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">{playlist.isEditorial ? "NaijaStream playlist" : "Playlist"}</p>
            <h1 className="mt-1 font-display text-[32px] font-black leading-tight sm:text-[44px]">{playlist.title}</h1>
            <p className="mt-1 text-[12px] text-white/60">
              {tracks.length} tracks · {minutes} min · {playlist._count.follows} follows
            </p>
          </div>
        </div>
      </header>
      <div className="px-4 pb-8 sm:px-6">
        {playlist.description ? <p className="mb-4 max-w-3xl text-[13px] leading-7 text-white/70">{playlist.description}</p> : null}
        <TrackList tracks={tracks} emptyMessage="This playlist has no published tracks yet." />
      </div>
    </main>
  );
}
