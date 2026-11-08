import Link from "next/link";
import { notFound } from "next/navigation";
import { getVideoBySlug, listVideos } from "@/lib/services/stream/podcasts";

export const dynamic = "force-dynamic";

export default async function VideoPage({ params }: { params: { slug: string } }) {
  const video = await getVideoBySlug(params.slug);
  if (!video) notFound();
  const others = (await listVideos()).filter((item) => item.slug !== video.slug).slice(0, 6);

  return (
    <main className="px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="overflow-hidden rounded-2xl bg-black">
          <video
            src={video.videoUrl}
            poster={video.posterUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full"
          >
            Your browser does not support embedded video.
          </video>
        </div>
        <h1 className="mt-4 font-display text-[22px] font-extrabold">{video.title}</h1>
        <p className="mt-1 text-[12px] text-white/50">
          {video.artist?.name ?? "NaijaStream"} · {video.views.toString()} views · {video.kind.replace("_", " ").toLowerCase()}
        </p>
        {video.description ? <p className="mt-3 text-[13px] leading-7 text-white/70">{video.description}</p> : null}
      </div>

      {others.length > 0 ? (
        <section className="mx-auto mt-8 max-w-4xl">
          <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-widest text-white/45">More videos</h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {others.map((item) => (
              <li key={item.id}>
                <Link href={`/naijastream/videos/${item.slug}`} className="block rounded-lg bg-[#131a16] p-2 text-[12px] font-semibold">
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
