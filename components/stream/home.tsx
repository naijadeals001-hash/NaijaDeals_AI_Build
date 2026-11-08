"use client";

import Link from "next/link";
import { BadgeCheck, Pause, Play, Plus } from "lucide-react";
import { useStreamPlayer } from "./player-context";
import { CoverArt } from "./cover-art";

export type StreamCardTrack = {
  id: string;
  slug: string;
  title: string;
  durationSec: number;
  artworkUrl: string | null;
  audioUrl: string | null;
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
  trending: StreamCardTrack[];
  playlists: StreamCardPlaylist[];
  artists: StreamCardArtist[];
  genres: Array<{ genre: string; tracks: number }>;
  live: StreamCardPlaylist[];
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

export function StreamHome({ data, signedIn }: { data: StreamHomeData; signedIn: boolean }) {
  const player = useStreamPlayer();
  const toPlayer = (track: StreamCardTrack) => ({
    id: track.id,
    slug: track.slug,
    title: track.title,
    durationSec: track.durationSec,
    artworkUrl: track.artworkUrl,
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
        {/* Hero — left-negative-space composition per the approved reference */}
        {data.hero ? (
          <section className="relative isolate overflow-hidden rounded-2xl bg-[#0b1410]">
            <img
              src="/generated/stream/opt-v2/stream-v2-hero.jpg"
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover object-[70%_center]"
            />
            <div
              className="absolute inset-0 bg-[linear-gradient(95deg,#050d09_0%,#050d09f2_32%,#050d09a8_52%,transparent_78%)]"
              aria-hidden
            />
            <div className="relative flex min-h-[330px] flex-col justify-between p-6 sm:min-h-[400px] sm:p-8 lg:min-h-[430px]">
              <div className="max-w-[560px]">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">Featured artist</p>
                <h1 className="mt-2 font-display text-[40px] font-black uppercase leading-[0.9] tracking-[-0.02em] sm:text-[62px] lg:text-[70px]">
                  Africa
                  <br />
                  to the <span className="text-emerald-400">world</span>
                </h1>
                <p className="mt-3 font-display text-[17px] font-extrabold sm:text-[19px]">{data.hero.artist.name}</p>
                <p className="text-[12.5px] text-white/60">
                  {data.hero.track ? `Latest release · ${data.hero.track.title}` : "Live on NaijaStream"}
                  {data.hero.artist.isSample ? " · Demonstration catalogue" : ""}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      // Queue the whole trending rail starting at the featured
                      // track so Next/Previous actually have somewhere to go.
                      const list = data.trending.length ? data.trending : data.hero?.track ? [data.hero.track] : [];
                      if (!list.length) return;
                      const start = data.hero?.track ? Math.max(0, list.findIndex((t) => t.id === data.hero!.track!.id)) : 0;
                      player.play(list.map(toPlayer), start);
                    }}
                    className="flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-[13px] font-extrabold text-black transition hover:bg-emerald-400"
                  >
                    <Play className="h-4 w-4 fill-current" aria-hidden /> Play now
                  </button>
                  <button
                    type="button"
                    onClick={() => void follow(data.hero!.artist.id)}
                    className="flex items-center gap-2 rounded-full border border-white/25 px-5 py-3 text-[13px] font-bold text-white transition hover:bg-white/10"
                  >
                    <Plus className="h-4 w-4" aria-hidden /> Follow
                  </button>
                  <Link
                    href={`/naijastream/artists/${data.hero.artist.slug}`}
                    className="rounded-full border border-white/25 px-5 py-3 text-[13px] font-bold text-white transition hover:bg-white/10"
                  >
                    View artist
                  </Link>
                </div>
              </div>
              <div className="mt-6 flex items-end justify-between gap-4">
                <p className="hidden max-w-xs text-[11px] uppercase tracking-[0.2em] text-white/45 sm:block">
                  Listen. Discover. Create. Earn.
                </p>
                <div className="flex gap-1.5" aria-hidden>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className={`h-1.5 rounded-full ${i === 0 ? "w-5 bg-white" : "w-1.5 bg-white/35"}`} />
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* Genre chips */}
        {data.genres.length > 0 ? (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {data.genres.slice(0, 10).map((genre) => (
              <Link
                key={genre.genre}
                href={`/naijastream/music?genre=${encodeURIComponent(genre.genre)}`}
                className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[11.5px] font-bold text-white/75 hover:border-emerald-400/40 hover:text-emerald-300"
              >
                {genre.genre}
              </Link>
            ))}
          </div>
        ) : null}

        <Rail title="Trending in Africa" href="/naijastream/charts">
          {data.trending.length === 0 ? (
            <EmptyRail message="No published tracks yet. Verified creators' releases appear here as soon as they go live." />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {data.trending.map((track, index) => (
                <li key={track.id}>
                  <div className="group relative overflow-hidden rounded-xl bg-[#131a16] p-3 transition hover:bg-[#18201b]">
                    <span className="absolute left-3 top-3 z-10 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-black text-white/80">{index + 1}</span>
                    <div className="relative aspect-square overflow-hidden rounded-lg bg-black/40">
                      {track.artworkUrl ? (
                        <img src={track.artworkUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl text-white/30">♪</div>
                      )}
                      <button
                        type="button"
                        onClick={() => player.play(data.trending.map(toPlayer), index)}
                        aria-label={`Play ${track.title}`}
                        className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-black opacity-0 shadow-lg transition group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <Play className="h-4 w-4 fill-current" aria-hidden />
                      </button>
                    </div>
                    <p className="mt-2 truncate text-[12.5px] font-bold">{track.title}</p>
                    <p className="flex items-center gap-1 truncate text-[10.5px] text-white/50">
                      {track.artist.name}
                      {track.artist.verified && !track.artist.isSample ? <BadgeCheck className="h-3 w-3 text-emerald-400" aria-label="Verified" /> : null}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Rail>

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

      {/* Right panel */}
      <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
        <NowPlayingPanel />
        <section className="rounded-xl border border-white/10 bg-[#101613] p-4">
          <h2 className="text-[12px] font-extrabold uppercase tracking-widest text-white/45">Live now</h2>
          {data.live.length === 0 ? (
            <p className="mt-2 text-[11.5px] leading-5 text-white/55">
              No live sessions are streaming. Live audio requires verified ingest and transcoding, which are not configured yet.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {data.live.map((item) => (
                <li key={item.id} className="text-[12px] font-semibold text-white/80">{item.title}</li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border border-white/10 bg-[#101613] p-4">
          <h2 className="text-[12px] font-extrabold uppercase tracking-widest text-white/45">Creator tools</h2>
          <ul className="mt-2 space-y-1.5 text-[12px] font-semibold text-white/70">
            <li><Link href="/naijastream/studio" className="hover:text-emerald-300">Creator studio →</Link></li>
            <li><Link href="/naijastream/studio/upload" className="hover:text-emerald-300">Upload a release →</Link></li>
            <li><Link href="/naijastream/studio/royalties" className="hover:text-emerald-300">Royalties &amp; payouts →</Link></li>
          </ul>
        </section>
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
