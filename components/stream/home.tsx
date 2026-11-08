"use client";

import Link from "next/link";
import { BadgeCheck, Pause, Play, Plus } from "lucide-react";
import { useStreamPlayer } from "./player-context";
import { CoverArt } from "./cover-art";
import { StreamRightPanel } from "./right-panel";
import { HeroCarousel, type HeroSlide } from "./hero-carousel";
import { CategoryStrip, CityRail, FeaturedSongs, GenreChips, LiveNowCard, RecommendedArtists, ShowRail, TrendingArtists } from "./desktop-rails";

export type StreamCardTrack = {
  id: string;
  slug: string;
  title: string;
  durationSec: number;
  artworkUrl: string | null;
  audioUrl: string | null;
  genre?: string | null;
  isSample?: boolean;
  artist: { id: string; name: string; slug: string; verified: boolean; isSample?: boolean; avatarUrl?: string | null | undefined };
};

export type StreamCardPlaylist = { id: string; title: string; slug: string; coverUrl: string | null; description?: string | null; isEditorial?: boolean };
export type StreamCardArtist = { id: string; name: string; slug: string; avatarUrl: string | null; isSample?: boolean; totalPlays?: string };

export type StreamHomeData = {
  hero: {
    artist: { id: string; name: string; slug: string; verified?: boolean; avatarUrl?: string | null; isSample?: boolean };
    track: StreamCardTrack | null;
    playlist: StreamCardPlaylist | null;
  } | null;
  heroSlides: HeroSlide[];
  trending: StreamCardTrack[];
  playlists: StreamCardPlaylist[];
  artists: StreamCardArtist[];
  genres: Array<{ genre: string; tracks: number }>;
  live: StreamCardPlaylist[];
  cities?: Array<{ slug: string; name: string; countryCode: string; countryName: string; region: string; imageUrl: string | null; artists: number; tracks: number }>;
  shows?: Array<{ slug: string; title: string; category: string; coverUrl: string | null; episodes: number; language: string; creator: string }>;
};

function Rail({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-[17px] font-extrabold text-white">{title}</h2>
        {href ? (
          <Link href={href} className="text-[11.5px] font-bold text-white/50 hover:text-emerald-300">
            See all
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

type TrendingArtist = {
  id: string; name: string; slug: string; avatarUrl: string | null; genre: string | null; trackCount: number;
  firstTrack: { id: string; title: string; slug: string; durationSec: number; artworkUrl: string | null; audioUrl: string | null } | null;
};
type LiveEvent = { slug: string; title: string; artworkUrl: string | null; status: string; startsAt: string } | null;

export function StreamHome({
  data,
  signedIn,
  trendingArtists = [],
  liveEvent = null
}: {
  data: StreamHomeData;
  signedIn: boolean;
  trendingArtists?: TrendingArtist[];
  liveEvent?: LiveEvent;
}) {
  const player = useStreamPlayer();
  const toPlayer = (track: StreamCardTrack) => ({
    id: track.id,
    slug: track.slug,
    title: track.title,
    durationSec: track.durationSec,
    artworkUrl: track.artist.avatarUrl ?? track.artworkUrl,
    artistImageUrl: track.artist.avatarUrl ?? null,
    artistSlug: track.artist.slug,
    audioUrl: track.audioUrl,
    artistName: track.artist.name,
    isSample: track.isSample
  });

  async function follow(artistId: string) {
    if (!signedIn) {
      window.location.href = "/login?next=/naijastream";
      return;
    }
    await fetch("/api/stream/follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ artistId })
    });
  }

  return (
    <div className="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-6">
      <main className="min-w-0">
        {/* Hero — rotating cinematic carousel of African entertainment */}
        {data.heroSlides && data.heroSlides.length > 0 ? <HeroCarousel slides={data.heroSlides} intervalMs={6000} /> : null}

        <CategoryStrip />

        <div className="mt-4">
          <GenreChips genres={data.genres} />
        </div>

        <Rail title="Featured songs" href="/naijastream/charts">
          {data.trending.length > 0 ? (
            <FeaturedSongs tracks={data.trending} />
          ) : (
            <EmptyRail message="No published tracks yet. Verified creators' releases appear here as soon as they go live." />
          )}
        </Rail>

        <Rail title="Artists to explore" href="/naijastream/charts">
          {trendingArtists.length > 0 ? (
            <TrendingArtists artists={trendingArtists.slice(0, 8)} />
          ) : (
            <EmptyRail message="No published tracks yet. Verified creators' releases appear here as soon as they go live." />
          )}
        </Rail>

        {data.cities && data.cities.length > 0 ? (
          <Rail title="Explore Africa" href="/naijastream/explore">
            <CityRail cities={data.cities} />
          </Rail>
        ) : null}

        {data.shows && data.shows.length > 0 ? (
          <Rail title="Featured podcasts" href="/naijastream/podcasts">
            <ShowRail shows={data.shows} />
          </Rail>
        ) : null}

        <Rail title="African playlists for you" href="/naijastream/playlists">
          {data.playlists.length === 0 ? (
            <EmptyRail message="Editorial playlists arrive with the curated catalogue." />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {data.playlists.map((playlist) => (
                <li key={playlist.id}>
                  <Link href={`/naijastream/playlists/${playlist.slug}`} className="group block rounded-xl bg-[#131a16] p-3 transition hover:bg-[#18201b]">
                    <CoverArt
                      src={playlist.coverUrl}
                      title={playlist.title}
                      subtitle={playlist.isEditorial ? "NaijaStream" : undefined}
                      className="aspect-square w-full"
                    />
                    <p className="mt-2 truncate text-[12.5px] font-bold">{playlist.title}</p>
                    <p className="truncate text-[10.5px] text-white/50">{playlist.isEditorial ? "NaijaStream" : "Community playlist"}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Rail>

        <Rail title="Artists to discover" href="/naijastream/artists">
          {data.artists.length === 0 ? (
            <EmptyRail message="Verified artists will appear here after onboarding." />
          ) : (
            <ul className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
              {data.artists.map((artist) => (
                <li key={artist.id} className="w-[132px] shrink-0">
                  <Link href={`/naijastream/artists/${artist.slug}`} className="group block text-center">
                    <div className="mx-auto h-[132px] w-[132px] overflow-hidden rounded-full bg-[#131a16]">
                      {artist.avatarUrl ? (
                        <img src={artist.avatarUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-display text-3xl font-black text-white/25">{artist.name.charAt(0)}</div>
                      )}
                    </div>
                    <p className="mt-2 truncate text-[12.5px] font-bold">{artist.name}</p>
                    <p className="text-[10.5px] text-white/45">Artist</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Rail>
      </main>

      {/* Right panel — Recommended for You + On Repeat (real data) */}
      <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
        <LiveNowCard event={liveEvent} />
        <RecommendedArtists artists={data.artists} />
        <StreamRightPanel />
      </aside>
    </div>
  );
}

function EmptyRail({ message }: { message: string }) {
  return <p className="rounded-xl border border-dashed border-white/15 p-6 text-[12px] text-white/50">{message}</p>;
}

function NowPlayingPanel() {
  const player = useStreamPlayer();
  return (
    <section className="rounded-xl border border-white/10 bg-[#101613] p-4">
      <h2 className="text-[12px] font-extrabold uppercase tracking-widest text-white/45">Now playing</h2>
      {player.current ? (
        <div className="mt-2 flex items-center gap-3">
          {player.current.artworkUrl ? (
            <img src={player.current.artworkUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />
          ) : (
            <div className="h-14 w-14 rounded-lg bg-white/10" />
          )}
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-bold">{player.current.title}</p>
            <p className="truncate text-[11px] text-white/50">{player.current.artistName}</p>
            <button type="button" onClick={player.toggle} className="mt-1 text-[11px] font-bold text-emerald-400">
              {player.playing ? <span className="inline-flex items-center gap-1"><Pause className="h-3 w-3" aria-hidden /> Pause</span> : <span className="inline-flex items-center gap-1"><Play className="h-3 w-3" aria-hidden /> Play</span>}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[11.5px] text-white/50">Nothing playing — pick a track from a rail.</p>
      )}
    </section>
  );
}
