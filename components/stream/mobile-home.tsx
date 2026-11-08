"use client";

import Link from "next/link";
import { ChevronRight, Crown, Heart, ListPlus, Mic2, MoreHorizontal, Music2, Pause, Play, Podcast, Radio, Search, Video } from "lucide-react";
import { useStreamPlayer } from "./player-context";
import { CoverArt } from "./cover-art";
import { HeroCarousel, type HeroSlide } from "./hero-carousel";
import { CityCard } from "./city-card";
import { ScrollRail } from "./scroll-rail";
import { CATEGORY_BY_KEY, type StreamCategoryKey } from "@/lib/stream/categories";

type Track = {
  id: string;
  slug: string;
  title: string;
  durationSec: number;
  artworkUrl: string | null;
  audioUrl: string | null;
  genre?: string | null;
  artist: { name: string; slug: string; avatarUrl?: string | null };
};
type City = {
  slug: string;
  name: string;
  countryCode: string;
  countryName: string;
  region: string;
  imageUrl: string | null;
  artists: number;
  tracks: number;
};
type Show = {
  slug: string;
  title: string;
  category: string;
  coverUrl: string | null;
  episodes: number;
  language: string;
  creator: string;
  countryCode: string;
};

const SERVICE_TILES: { key: StreamCategoryKey; icon: typeof Music2 }[] = [
  { key: "music", icon: Music2 },
  { key: "podcasts", icon: Podcast },
  { key: "videos", icon: Video },
  { key: "live", icon: Radio },
  { key: "premium", icon: Crown }
];

function fmtDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/**
 * Mobile homepage composition following the approved reference: colour-coded
 * service tiles, Explore Africa city cards, artwork-led featured songs and the
 * podcast rail. City imagery is only shown when that city has an approved
 * photograph; otherwise the card says so instead of borrowing another city's.
 */
export function MobileSections({
  tracks,
  cities,
  shows,
  slides
}: {
  tracks: Track[];
  cities: City[];
  shows: Show[];
  slides: HeroSlide[];
}) {
  const player = useStreamPlayer();
  const queue = tracks.map((track) => ({
    id: track.id,
    slug: track.slug,
    title: track.title,
    durationSec: track.durationSec,
    artworkUrl: track.artist.avatarUrl ?? track.artworkUrl,
    artistImageUrl: track.artist.avatarUrl ?? null,
    artistSlug: track.artist.slug,
    audioUrl: track.audioUrl,
    artistName: track.artist.name
  }));

  return (
    <div className="space-y-7 px-3 pb-4 pt-3 lg:hidden">
      <HeroCarousel slides={slides} intervalMs={6000} />

      <section aria-label="Browse by category">
        <ul className="grid grid-cols-5 gap-2">
          {SERVICE_TILES.map((tile) => {
            const category = CATEGORY_BY_KEY[tile.key];
            const Icon = tile.icon;
            return (
              <li key={category.key}>
                <Link
                  href={category.href}
                  data-category={category.key}
                  className="flex h-full flex-col items-center gap-1.5 rounded-xl border px-1 py-3 text-center transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520]"
                  style={{ borderColor: `${category.accent}55`, background: category.accentSoft }}
                >
                  <Icon className="h-5 w-5" style={{ color: category.accent }} aria-hidden />
                  <span className="text-[9.5px] font-semibold leading-tight text-white/85">{category.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {cities.length > 0 ? (
        <section aria-labelledby="explore-africa">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="explore-africa" className="font-display text-[17px] font-extrabold">Explore Africa</h2>
            <Link href="/naijastream/explore" className="text-[11.5px] font-bold text-emerald-400">View All</Link>
          </div>
          <ScrollRail label="Explore Africa cities" className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {cities.slice(0, 12).map((city) => (
              <li key={city.slug} className="w-[168px] shrink-0 snap-start">
                <CityCard city={city} className="h-[184px]" sizes="168px" />
              </li>
            ))}
          </ScrollRail>
        </section>
      ) : null}

      {tracks.length > 0 ? (
        <section aria-labelledby="featured-songs">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="featured-songs" className="font-display text-[17px] font-extrabold">Featured songs</h2>
            <Link href="/naijastream/charts" className="text-[11.5px] font-bold text-emerald-400">See all</Link>
          </div>
          <ol className="space-y-1">
            {tracks.slice(0, 5).map((track, index) => {
              const isCurrent = player.current?.id === track.id;
              const playingThis = isCurrent && player.playing;
              return (
                <li key={track.id} data-track={track.slug} className="flex items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-white/5">
                  <button
                    type="button"
                    onClick={() => (isCurrent ? player.toggle() : player.play(queue, index))}
                    aria-label={playingThis ? `Pause ${track.title}` : `Play ${track.title}`}
                    className="relative shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520]"
                  >
                    {track.artist.avatarUrl ? (
                      <img src={track.artist.avatarUrl} alt={`${track.artist.name} portrait`} className="h-12 w-12 rounded-lg object-cover" loading="lazy" />
                    ) : (
                      <CoverArt src={track.artworkUrl} title={track.title} className="h-12 w-12" />
                    )}
                    <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/45">
                      {playingThis ? <Pause className="h-4 w-4 fill-white text-white" aria-hidden /> : <Play className="h-4 w-4 translate-x-[1px] fill-white text-white" aria-hidden />}
                    </span>
                  </button>
                  <Link href={`/naijastream/tracks/${track.slug}`} className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">{track.title}</span>
                    <span className="block truncate text-[11px] text-white/45">
                      {track.artist.name}
                      {track.genre ? ` · ${track.genre}` : ""}
                      {track.durationSec ? ` · ${fmtDuration(track.durationSec)}` : ""}
                    </span>
                  </Link>
                  <button type="button" aria-label={`Like ${track.title}`} className="shrink-0 p-2 text-white/35 hover:text-emerald-400">
                    <Heart className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" aria-label={`Add ${track.title} to a playlist`} className="shrink-0 p-2 text-white/35 hover:text-white">
                    <ListPlus className="h-4 w-4" aria-hidden />
                  </button>
                  <Link href={`/naijastream/artists/${track.artist.slug}`} aria-label={`More from ${track.artist.name}`} className="shrink-0 p-2 text-white/30 hover:text-white">
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {shows.length > 0 ? (
        <section aria-labelledby="featured-podcasts">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="featured-podcasts" className="font-display text-[17px] font-extrabold">Featured podcasts</h2>
            <Link href="/naijastream/podcasts" className="text-[11.5px] font-bold text-emerald-400">View All</Link>
          </div>
          <ScrollRail label="Featured podcasts" className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {shows.map((show) => (
              <li key={show.slug} className="w-[156px] shrink-0 snap-start">
                <Link href={`/naijastream/podcasts/${show.slug}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520]">
                  <div className="overflow-hidden rounded-xl border border-[#8B5CF6]/40 bg-[#1a1426]">
                    {show.coverUrl ? (
                      <img src={show.coverUrl} alt={`${show.title} cover`} loading="lazy" className="aspect-square w-full object-cover" />
                    ) : (
                      <CoverArt src={null} title={show.title} subtitle={show.category} className="aspect-square w-full" />
                    )}
                  </div>
                  <span className="mt-1.5 block truncate text-[12.5px] font-bold">{show.title}</span>
                  <span className="block truncate text-[10.5px] text-[#8B5CF6]">{show.category}</span>
                  <span className="block truncate text-[10px] text-white/45">
                    {show.creator} · {show.language} · {show.episodes} ep
                  </span>
                </Link>
              </li>
            ))}
          </ScrollRail>
        </section>
      ) : null}

      <section className="rounded-xl border border-white/10 bg-[#101613] p-4">
        <p className="flex items-center gap-2 text-[12px] font-extrabold text-white/80">
          <Mic2 className="h-4 w-4 text-emerald-400" aria-hidden /> Create on NaijaStream
        </p>
        <p className="mt-1 text-[11.5px] leading-5 text-white/55">Upload music, publish a podcast episode or host a live session.</p>
        <Link href="/naijastream/studio/upload" className="mt-2 inline-block text-[11.5px] font-bold text-emerald-400">
          Open creator studio →
        </Link>
      </section>

      <Link href="/naijastream/search" className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#101613] px-4 py-3 text-[12px] text-white/50">
        <Search className="h-4 w-4" aria-hidden /> Search songs, artists, podcasts…
        <ChevronRight className="ml-auto h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
