"use client";

import Link from "next/link";
import { ChevronRight, Crown, Mic2, MoreHorizontal, Music2, Pause, Play, Podcast, Radio, Search, Video } from "lucide-react";
import { useStreamPlayer } from "./player-context";
import { CoverArt } from "./cover-art";
import { HeroCarousel, type HeroSlide } from "./hero-carousel";

type Track = {
  id: string;
  slug: string;
  title: string;
  durationSec: number;
  artworkUrl: string | null;
  audioUrl: string | null;
  artist: { name: string; slug: string };
};
type City = { city: string; countryCode: string; artists: number };
type Show = { slug: string; title: string; category: string; coverUrl: string | null; episodes: number };

const SERVICE_TILES = [
  { label: "Music", href: "/naijastream/music", icon: Music2 },
  { label: "Podcasts", href: "/naijastream/podcasts", icon: Podcast },
  { label: "Videos", href: "/naijastream/videos", icon: Video },
  { label: "Live Events", href: "/naijastream/live", icon: Radio },
  { label: "Premium", href: "/naijastream/premium", icon: Crown }
];

/**
 * Mobile homepage composition matching the approved NaijaStream mobile
 * reference: service tiles, Explore Africa city cards, ranked trending list,
 * featured podcasts. Every list is driven by real records — cities only appear
 * when artists actually exist there.
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
    artworkUrl: track.artworkUrl,
    audioUrl: track.audioUrl,
    artistName: track.artist.name
  }));

  return (
    <div className="space-y-7 px-3 pb-4 pt-3 lg:hidden">
      <HeroCarousel slides={slides} intervalMs={6000} />

      <section aria-label="Services">
        <ul className="grid grid-cols-5 gap-2">
          {SERVICE_TILES.map((tile) => (
            <li key={tile.label}>
              <Link href={tile.href} className="flex flex-col items-center gap-1.5 rounded-xl bg-[#131a16] px-1 py-3 text-center">
                <tile.icon className="h-5 w-5 text-emerald-400" aria-hidden />
                <span className="text-[9.5px] font-semibold leading-tight text-white/80">{tile.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {cities.length > 0 ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-[17px] font-extrabold">Explore Africa</h2>
            <Link href="/naijastream/explore" className="text-[11.5px] font-bold text-emerald-400">View All</Link>
          </div>
          <ul className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {cities.map((city) => (
              <li key={`${city.city}-${city.countryCode}`} className="w-[130px] shrink-0">
                <Link
                  href={`/naijastream/music?city=${encodeURIComponent(city.city)}`}
                  className="relative block h-[92px] overflow-hidden rounded-xl bg-gradient-to-br from-emerald-800 to-[#0d1a14] p-3"
                >
                  <span className="absolute inset-0 opacity-25" aria-hidden style={{ backgroundImage: "radial-gradient(circle at 70% 20%, #34d399 0, transparent 60%)" }} />
                  <span className="relative block font-display text-[14px] font-extrabold leading-tight">{city.city}</span>
                  <span className="relative mt-0.5 block text-[10px] text-white/60">{city.countryCode} · {city.artists} artist{city.artists === 1 ? "" : "s"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tracks.length > 0 ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-[17px] font-extrabold">Trending songs</h2>
            <Link href="/naijastream/charts" className="text-[11.5px] font-bold text-emerald-400">View All</Link>
          </div>
          <ol className="space-y-1">
            {tracks.slice(0, 5).map((track, index) => {
              const isCurrent = player.current?.id === track.id;
              return (
                <li key={track.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-4 text-center text-[12px] font-bold text-white/35">{index + 1}</span>
                  <CoverArt src={track.artworkUrl} title={track.title} className="h-11 w-11 shrink-0" />
                  <Link href={`/naijastream/tracks/${track.slug}`} className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">{track.title}</span>
                    <span className="block truncate text-[11px] text-white/45">{track.artist.name}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => (isCurrent ? player.toggle() : player.play(queue, index))}
                    aria-label={isCurrent && player.playing ? `Pause ${track.title}` : `Play ${track.title}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 text-white"
                  >
                    {isCurrent && player.playing ? <Pause className="h-3.5 w-3.5 fill-current" aria-hidden /> : <Play className="h-3.5 w-3.5 translate-x-[1px] fill-current" aria-hidden />}
                  </button>
                  <Link href={`/naijastream/artists/${track.artist.slug}`} aria-label={`More from ${track.artist.name}`} className="shrink-0 text-white/35">
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {shows.length > 0 ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-[17px] font-extrabold">Featured podcasts</h2>
            <Link href="/naijastream/podcasts" className="text-[11.5px] font-bold text-emerald-400">View All</Link>
          </div>
          <ul className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {shows.map((show) => (
              <li key={show.slug} className="w-[150px] shrink-0">
                <Link href={`/naijastream/podcasts/${show.slug}`} className="block">
                  <CoverArt src={show.coverUrl} title={show.title} subtitle={show.category} className="aspect-[4/3] w-full" />
                  <span className="mt-1.5 block truncate text-[12px] font-bold">{show.category}</span>
                </Link>
              </li>
            ))}
          </ul>
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
