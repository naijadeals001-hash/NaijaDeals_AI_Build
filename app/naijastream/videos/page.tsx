import Link from "next/link";
import { listVideos } from "@/lib/services/stream/podcasts";

export const dynamic = "force-dynamic";

function duration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default async function VideosPage() {
  const videos = await listVideos();

  return (
    <main className="px-4 py-6 sm:px-6">
      <h1 className="font-display text-[26px] font-extrabold">Videos</h1>
      <p className="mt-1 text-[12px] text-white/50">Music videos, live clips and creator video.</p>

      {videos.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 p-8 text-center text-[12.5px] text-white/50">
          No published videos yet. Creator video publishing opens with media processing.
        </p>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <li key={video.id}>
              <Link href={`/naijastream/videos/${video.slug}`} className="group block overflow-hidden rounded-xl bg-[#131a16]">
                <div className="relative aspect-video overflow-hidden bg-black">
                  {video.posterUrl ? (
                    <img src={video.posterUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[11px] font-semibold uppercase tracking-wide text-white/40">
                      Video
                    </div>
                  )}
                  <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {duration(video.durationSec)}
                  </span>
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-[13px] font-bold">{video.title}</p>
                  <p className="mt-0.5 text-[10.5px] text-white/45">
                    {video.artist?.name ?? "NaijaStream"} · {video.views.toString()} views
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
