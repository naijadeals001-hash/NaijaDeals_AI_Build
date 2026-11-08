"use client";

import Link from "next/link";
import { Pause, Play, Plus } from "lucide-react";
import { useStreamPlayer } from "./player-context";
import { STREAM_CATEGORIES } from "@/lib/stream/categories";

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
    <ul className="grid grid-cols-4 gap-3">
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

type FeaturedTrack = {
  id: string;
  title: string;
  slug: string;
  durationSec: number;
  artworkUrl: string | null;
  audioUrl: string | null;
  genre?: string | null;
  artist: { id: string; name: string; slug: string; avatarUrl?: string | null };
};

function fmtSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/**
 * Featured Songs — artwork-led rows feeding the shared player. Labelled
 * "Featured" rather than "Trending" because there is no verified listen-count
 * ranking behind it; each row can have its artwork or artist portrait.
 */
export function FeaturedSongs({ tracks }: { tracks: FeaturedTrack[] }) {
  const player = useStreamPlayer();
  const queue = tracks.map((track) => ({
    id: track.id,
    slug: track.slug,
    title: track.title,
    durationSec: track.durationSec,
    artworkUrl: track.artworkUrl,
    audioUrl: track.audioUrl,
    artistName: track.artist.name
  }));
  if (tracks.length === 0) return null;

  return (
    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {tracks.slice(0, 8).map((track, index) => {
        const isCurrent = player.current?.id === track.id;
        const playingThis = isCurrent && player.playing;
        const image = track.artworkUrl ?? track.artist.avatarUrl ?? null;
        return (
          <li key={track.id} className="flex items-center gap-3 rounded-xl bg-[#111815] p-2 transition hover:bg-[#172019]">
            <button
              type="button"
              onClick={() => (isCurrent ? player.toggle() : player.play(queue, index))}
              aria-label={playingThis ? `Pause ${track.title}` : `Play ${track.title}`}
              className="relative shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520]"
            >
              {image ? (
                <img src={image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white/10 font-display text-lg font-black text-white/30">
                  {track.title.charAt(0)}
                </span>
              )}
              <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/40 opacity-0 transition group-hover:opacity-100 hover:opacity-100">
                {playingThis ? <Pause className="h-4 w-4 fill-white text-white" aria-hidden /> : <Play className="h-4 w-4 translate-x-[1px] fill-white text-white" aria-hidden />}
              </span>
            </button>
            <Link href={`/naijastream/tracks/${track.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold">{track.title}</span>
                <span className="block truncate text-[11px] text-white/45">
                  {track.artist.name}
                  {track.genre ? ` · ${track.genre}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-white/40">{fmtSeconds(track.durationSec)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Five verticals, five accents — Music emerald, Podcasts purple, Videos blue, Live orange, Premium gold. */
export function CategoryStrip() {
  return (
    <section aria-labelledby="categories-heading" className="mt-6">
      <h2 id="categories-heading" className="sr-only">
        Browse by category
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STREAM_CATEGORIES.map((category) => (
          <li key={category.key}>
            <Link
              href={category.href}
              data-category={category.key}
              className="group flex h-full flex-col gap-1 rounded-xl border p-3 transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520]"
              style={{ borderColor: `${category.accent}55`, background: category.accentSoft }}
            >
              <span className="text-[12.5px] font-extrabold" style={{ color: category.accent }}>
                {category.label}
              </span>
              <span className="text-[10.5px] leading-4 text-white/55">{category.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

type ExploreCityCard = { slug: string; name: string; countryCode: string; countryName: string; region: string; imageUrl: string | null; artists: number; tracks: number };

/** Explore Africa rail — the same approved-imagery rules as the Explore page. */
export function CityRail({ cities }: { cities: ExploreCityCard[] }) {
  const featured = [...cities].sort((a, b) => b.artists - a.artists || b.tracks - a.tracks).slice(0, 8);
  if (featured.length === 0) return null;
  return (
    <ul className="grid grid-cols-4 gap-3 xl:grid-cols-8">
      {featured.map((city) => (
        <li key={city.slug}>
          <Link
            href={`/naijastream/cities/${city.slug}`}
            data-city={city.slug}
            className="group relative flex h-[124px] flex-col justify-end overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-emerald-900 to-[#0b0f0d] p-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520]"
          >
            {city.imageUrl ? (
              <>
                <img src={city.imageUrl} alt={`${city.name}, ${city.countryName}`} className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" aria-hidden />
              </>
            ) : (
              <span className="relative mb-1 text-[8.5px] font-bold uppercase tracking-wide text-white/40">Photo pending</span>
            )}
            <span className="relative block truncate font-display text-[13.5px] font-extrabold leading-tight text-white">{city.name}</span>
            <span className="relative block truncate text-[10px] text-white/60">
              {city.countryName}
              {city.artists > 0 ? ` · ${city.artists} artist${city.artists === 1 ? "" : "s"}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

type ShowCard = { slug: string; title: string; category: string; coverUrl: string | null; episodes: number; language: string; creator: string };

/** Featured Podcasts rail with the purple category identity. */
export function ShowRail({ shows }: { shows: ShowCard[] }) {
  if (shows.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {shows.slice(0, 10).map((show) => (
        <li key={show.slug}>
          <Link href={`/naijastream/podcasts/${show.slug}`} className="group block rounded-xl border border-[#8B5CF6]/25 bg-[#131a16] p-2.5 transition hover:border-[#8B5CF6]/60">
            <div className="aspect-square w-full overflow-hidden rounded-lg bg-[#1a1426]">
              {show.coverUrl ? (
                <img src={show.coverUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
              ) : (
                <div className="grid h-full w-full place-items-center font-display text-2xl font-black text-[#8B5CF6]/50">{show.title.charAt(0)}</div>
              )}
            </div>
            <p className="mt-2 truncate text-[12.5px] font-bold">{show.title}</p>
            <p className="truncate text-[10.5px] font-semibold text-[#8B5CF6]">{show.category}</p>
            <p className="truncate text-[10px] text-white/45">
              {show.creator} · {show.language} · {show.episodes} ep
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
