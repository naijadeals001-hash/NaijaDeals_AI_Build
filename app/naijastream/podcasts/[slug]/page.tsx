import { notFound } from "next/navigation";
import { getShowBySlug } from "@/lib/services/stream/podcasts";
import { CoverArt } from "@/components/stream/cover-art";
import { EpisodePlayer } from "@/components/stream/episode-player";

export const dynamic = "force-dynamic";

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  return `${m} min`;
}

export default async function ShowPage({ params }: { params: { slug: string } }) {
  const show = await getShowBySlug(params.slug);
  if (!show) notFound();

  return (
    <main>
      <header className="relative overflow-hidden px-4 pb-6 pt-8 sm:px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/40 to-transparent" aria-hidden />
        <div className="relative flex flex-wrap items-end gap-5">
          <CoverArt src={show.coverUrl} title={show.title} subtitle={show.category} className="h-36 w-36 shrink-0 rounded-2xl shadow-2xl sm:h-44 sm:w-44" />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Podcast · {show.category}</p>
            <h1 className="mt-1 font-display text-[30px] font-black leading-tight sm:text-[40px]">{show.title}</h1>
            <p className="mt-1 text-[12px] text-white/60">
              {show.artist.name} · {show.episodes.length} episode{show.episodes.length === 1 ? "" : "s"} · {show.language}
            </p>
          </div>
        </div>
      </header>
      <div className="px-4 pb-10 sm:px-6">
        {show.description ? <p className="mb-4 max-w-3xl text-[13px] leading-7 text-white/70">{show.description}</p> : null}
        <EpisodePlayer
          showTitle={show.title}
          episodes={show.episodes.map((episode) => ({
            id: episode.id,
            title: episode.title,
            audioUrl: episode.audioUrl,
            durationLabel: fmt(episode.durationSec),
            description: episode.description,
            label: `S${episode.season}E${episode.episodeNo}`
          }))}
        />
      </div>
    </main>
  );
}
