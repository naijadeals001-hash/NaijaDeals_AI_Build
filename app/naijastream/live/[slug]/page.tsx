import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Info } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type EventRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  artworkUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  status: string;
  streamUrl: string | null;
  isFree: boolean;
};

export default async function LiveEventPage({ params }: { params: { slug: string } }) {
  const rows = await prisma
    .$queryRaw<EventRow[]>`SELECT "id","title","slug","description","artworkUrl","startsAt","endsAt","status","streamUrl","isFree" FROM "StreamLiveEvent" WHERE "slug" = ${params.slug} LIMIT 1`
    .catch(() => []);
  const event = rows[0];
  if (!event) notFound();

  const isLive = event.status === "LIVE" && Boolean(event.streamUrl);
  const ended = event.status === "ENDED";
  const cancelled = event.status === "CANCELLED";

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="overflow-hidden rounded-2xl bg-black">
        {isLive && event.streamUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={event.streamUrl} controls autoPlay muted playsInline className="aspect-video w-full" />
        ) : (
          <div className="relative aspect-video w-full">
            {event.artworkUrl ? <img src={event.artworkUrl} alt="" className="h-full w-full object-cover opacity-60" /> : null}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-center">
              <Info className="h-6 w-6 text-white/70" aria-hidden />
              <p className="max-w-md px-6 text-[12.5px] text-white/80">
                {cancelled
                  ? "This event was cancelled."
                  : ended
                    ? "This event has ended. A replay appears here when the organiser publishes one."
                    : "This event has not started streaming yet. Playback unlocks when the organiser goes live."}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${isLive ? "bg-emerald-400 text-black" : "bg-white/10 text-white/70"}`}>
          {cancelled ? "Cancelled" : ended ? "Ended" : isLive ? "Live" : "Upcoming"}
        </span>
        <h1 className="font-display text-[24px] font-extrabold">{event.title}</h1>
      </div>
      <p className="mt-1 flex items-center gap-1 text-[12px] text-white/50">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        {new Date(event.startsAt).toLocaleString("en-NG", { dateStyle: "full", timeStyle: "short" })}
      </p>
      {event.description ? <p className="mt-3 text-[13px] leading-7 text-white/70">{event.description}</p> : null}

      <p className="mt-4 rounded-xl border border-white/10 bg-[#101613] p-3 text-[11.5px] text-white/50">
        Access: {event.isFree ? "Free" : "Paid — ticketing requires configured payment settlement and is not enabled here."}
      </p>

      <Link href="/naijastream/live" className="mt-5 inline-block rounded-full border border-white/20 px-5 py-2.5 text-[12px] font-bold text-white">
        ← All live events
      </Link>
    </main>
  );
}
