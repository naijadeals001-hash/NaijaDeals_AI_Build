import Link from "next/link";
import { Headphones, Play } from "lucide-react";
import { listShows } from "@/lib/services/stream/podcasts";
import { CoverArt } from "@/components/stream/cover-art";

export const dynamic = "force-dynamic";

export default async function PodcastsPage() {
  const shows = await listShows();

  return (
    <main className="px-4 py-6 sm:px-6">
      <h1 className="font-display text-[26px] font-extrabold">Podcasts &amp; talk shows</h1>
      <p className="mt-1 text-[12px] text-white/50">Conversations on business, culture, technology and faith across Africa.</p>

      {shows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 p-8 text-center text-[12.5px] text-white/50">
          No published shows yet. Creators publish episodes from the studio once their audio is uploaded.
        </p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {shows.map((show) => (
            <li key={show.id}>
              <Link href={`/naijastream/podcasts/${show.slug}`} className="group block">
                <CoverArt src={show.coverUrl} title={show.title} subtitle={show.category} className="aspect-square w-full" />
                <p className="mt-2 line-clamp-2 text-[13px] font-bold">{show.title}</p>
                <p className="truncate text-[10.5px] text-white/45">
                  {show.artist.name} · {show._count.episodes} episode{show._count.episodes === 1 ? "" : "s"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-8 rounded-xl border border-white/10 bg-[#101613] p-5 text-[12px] leading-6 text-white/60">
        <p className="flex items-center gap-2 font-extrabold text-white/80">
          <Headphones className="h-4 w-4 text-emerald-400" aria-hidden /> For podcast creators
        </p>
        <p className="mt-1">
          Show creation and episode publishing use the same audio pipeline as music. Episode upload opens when object storage
          is configured; playback of published episodes works today.
        </p>
        <Link href="/naijastream/studio" className="mt-2 inline-flex items-center gap-1 font-bold text-emerald-400 hover:underline">
          <Play className="h-3 w-3" aria-hidden /> Open creator studio
        </Link>
      </section>
    </main>
  );
}
