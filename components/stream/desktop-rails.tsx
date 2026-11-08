"use client";

import Link from "next/link";
import { Play, Plus } from "lucide-react";
import { useStreamPlayer } from "./player-context";

type TrendArtist = { id: string; name: string; slug: string; avatarUrl: string | null; trackCount: number; genre: string | null; firstTrack: { id: string; title: string; slug: string; durationSec: number; artworkUrl: string | null; audioUrl: string | null } | null };

/**
 * "Trending in Africa" as artist portrait cards (matching the reference). Each
 * card plays the artist's first published track; the portrait is the artist's
 * own artwork, and the rank reflects catalogue order rather than invented
 * popularity statistics.
 */
export function TrendingArtists({ artists }: { artists: TrendArtist[] }) {
  const player = useStreamPlayer();
  if (artists.length === 0) return null;

  return (
    <ul className="grid grid-cols-4 gap-3 xl:grid-cols-8">
      {artists.map((artist, index) => (
        <li key={artist.id}>
          <div className="group relative overflow-hidden rounded-xl bg-[#131a16]">
            <div className="relative aspect-[4/5] overflow-hidden bg-black/40">
              {artist.avatarUrl ? (
                <img src={artist.avatarUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-3xl font-black text-white/25">{artist.name.charAt(0)}</div>
              )}
              <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-black text-white/85">{index + 1}</span>
              {artist.firstTrack ? (
                <button
                  type="button"
                  onClick={() =>
                    player.play(
                      [
                        {
                          id: artist.firstTrack!.id,
                          slug: artist.firstTrack!.slug,
                          title: artist.firstTrack!.title,
                          durationSec: artist.firstTrack!.durationSec,
                          artworkUrl: artist.firstTrack!.artworkUrl,
                          audioUrl: artist.firstTrack!.audioUrl,
                          artistName: artist.name
                        }
                      ],
                      0
                    )
                  }
                  aria-label={`Play ${artist.firstTrack.title}`}
                  className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-black opacity-0 shadow-lg transition group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
                </button>
              ) : null}
            </div>
            <div className="p-2">
              <p className="truncate text-[12px] font-bold">{artist.firstTrack?.title ?? artist.name}</p>
              <p className="truncate text-[10.5px] text-white/45">{artist.name}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function GenreChips({ genres }: { genres: Array<{ genre: string; tracks: number }> }) {
  const all = [{ genre: "All", tracks: 0 }, ...genres];
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" role="list" aria-label="Genres">
      {all.map((item, index) => (
        <Link
          key={item.genre}
          role="listitem"
          href={item.genre === "All" ? "/naijastream/music" : `/naijastream/music?genre=${encodeURIComponent(item.genre)}`}
          className={`shrink-0 rounded-full px-4 py-1.5 text-[11.5px] font-bold transition ${
            index === 0 ? "bg-emerald-500 text-black" : "border border-white/10 bg-white/5 text-white/75 hover:border-emerald-400/40 hover:text-emerald-300"
          }`}
        >
          {item.genre}
        </Link>
      ))}
    </div>
  );
}

export function LiveNowCard({
  event
}: {
  event: { slug: string; title: string; artworkUrl: string | null; status: string; startsAt: string } | null;
}) {
  if (!event) return null;
  const live = event.status === "LIVE";
  return (
    <section className="rounded-xl border border-white/10 bg-[#101613] p-4">
      <h2 className="text-[12px] font-extrabold uppercase tracking-widest text-white/45">Live now</h2>
      <Link href={`/naijastream/live/${event.slug}`} className="group mt-2 block overflow-hidden rounded-lg bg-black">
        <div className="relative aspect-[4/3]">
          {event.artworkUrl ? <img src={event.artworkUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
          {live ? (
            <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-red-600 px-1.5 py-0.5 text-[9px] font-black uppercase text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden /> Live
            </span>
          ) : null}
        </div>
        <div className="p-2">
          <p className="truncate text-[12.5px] font-bold">{event.title}</p>
          <p className="text-[10.5px] text-white/45">
            {live ? "Streaming now" : `Starts ${new Date(event.startsAt).toLocaleDateString("en-NG", { dateStyle: "medium" })}`}
          </p>
        </div>
      </Link>
    </section>
  );
}

export function RecommendedArtists({ artists }: { artists: Array<{ id: string; name: string; slug: string; avatarUrl: string | null }> }) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#101613] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-extrabold uppercase tracking-widest text-white/45">Recommended for you</h2>
        <Link href="/naijastream/artists" className="text-[10.5px] font-bold text-white/40 hover:text-emerald-300">See all</Link>
      </div>
      {artists.length === 0 ? (
        <p className="mt-2 text-[11.5px] text-white/50">Artists appear here as they join NaijaStream.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {artists.slice(0, 5).map((artist) => (
            <li key={artist.id}>
              <Link href={`/naijastream/artists/${artist.slug}`} className="group flex items-center gap-3 rounded-lg py-1.5 hover:bg-white/5">
                {artist.avatarUrl ? (
                  <img src={artist.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[12px] font-bold">{artist.name.charAt(0)}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-bold">{artist.name}</span>
                  <span className="block text-[10.5px] text-white/45">Artist</span>
                </span>
                <span className="rounded-full border border-white/25 p-1 text-white/60 opacity-0 transition group-hover:opacity-100" aria-hidden>
                  <Plus className="h-3 w-3" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
