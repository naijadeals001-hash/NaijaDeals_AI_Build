import Link from "next/link";
import { CalendarClock, Radio } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type EventRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  artworkUrl: string | null;
  startsAt: Date;
  status: string;
  streamUrl: string | null;
};

/**
 * Live events. Status is derived from real fields: an event is LIVE only when
 * the organiser has published a playable stream URL. Live ingestion (RTMP/HLS)
 * is not configured in this environment, so live streaming itself is blocked and
 * the page says so — scheduled events and their resources still work.
 */
async function loadEvents(): Promise<EventRow[]> {
  try {
    return (await prisma.$queryRaw<EventRow[]>`
      SELECT "id","title","slug","description","artworkUrl","startsAt","status","streamUrl"
      FROM "StreamLiveEvent" ORDER BY "startsAt" ASC LIMIT 24`) ?? [];
  } catch {
    return [];
  }
}

function statusOf(event: EventRow) {
  if (event.status === "CANCELLED") return { label: "Cancelled", tone: "text-red-300 bg-red-500/10" };
  if (event.status === "ENDED") return { label: "Ended", tone: "text-white/60 bg-white/10" };
  if (event.status === "LIVE") return { label: "Live", tone: "text-black bg-emerald-400" };
  return { label: "Upcoming", tone: "text-emerald-300 bg-emerald-500/10" };
}

export default async function LivePage() {
  const events = await loadEvents();

  return (
    <main className="px-4 py-6 sm:px-6">
      <h1 className="font-display text-[26px] font-extrabold">Live events</h1>
      <p className="mt-1 text-[12px] text-white/50">Concerts, listening sessions and creator broadcasts.</p>

      <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/[0.07] p-4 text-[12px] leading-6 text-amber-100/80">
        <p className="font-extrabold">Live streaming is not enabled</p>
        <p className="mt-1">Broadcast ingestion (RTMP/HLS) requires media infrastructure that is not configured here. Scheduled events are real; an event only shows as LIVE once an organiser publishes a working stream.</p>
      </div>

      {events.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 p-8 text-center text-[12.5px] text-white/50">
          No events scheduled yet.
        </p>
      ) : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const status = statusOf(event);
            return (
              <li key={event.id}>
                <Link href={`/naijastream/live/${event.slug}`} className="block overflow-hidden rounded-xl bg-[#131a16]">
                  <div className="relative aspect-video bg-black">
                    {event.artworkUrl ? <img src={event.artworkUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
                    <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${status.tone}`}>{status.label}</span>
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-[13px] font-bold">{event.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-[10.5px] text-white/45">
                      <CalendarClock className="h-3 w-3" aria-hidden /> {new Date(event.startsAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <section className="mt-8 rounded-xl border border-white/10 bg-[#101613] p-5 text-[12px] leading-6 text-white/60">
        <p className="flex items-center gap-2 font-extrabold text-white/80">
          <Radio className="h-4 w-4 text-emerald-400" aria-hidden /> For organisers
        </p>
        <p className="mt-1">Event creation, scheduling and ticket configuration arrive with the events service. Publish a stream URL and the event status flips to LIVE automatically.</p>
      </section>
    </main>
  );
}
