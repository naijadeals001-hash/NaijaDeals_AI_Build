import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Heart, Play, Share2 } from "lucide-react";
import { getArtistBySlug } from "@/lib/services/stream/service";
import { getSessionUser } from "@/lib/auth/session";
import { TrackList, type ListTrack } from "@/components/stream/track-list";

export const dynamic = "force-dynamic";

export default async function ArtistPage({ params }: { params: { slug: string } }) {
  const user = await getSessionUser();
  const result = await getArtistBySlug(params.slug, user?.id);
  if (!result) notFound();
  const { artist, tracks, playlists, totalPlays } = result;
  const cards = tracks as unknown as ListTrack[];

  return (
    <main>
      <header className="relative overflow-hidden px-4 pb-6 pt-8 sm:px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/50 to-transparent" aria-hidden />
        <div className="relative flex flex-wrap items-end gap-5">
          {artist.avatarUrl ? (
            <img src={artist.avatarUrl} alt={artist.name} className="h-36 w-36 rounded-2xl object-cover shadow-2xl sm:h-44 sm:w-44" />
          ) : (
            <div className="flex h-36 w-36 items-center justify-center rounded-2xl bg-white/10 font-display text-5xl font-black text-white/30 sm:h-44 sm:w-44">
              {artist.name.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
              {artist.isSample ? "Demonstration artist" : "Verified artist"}
            </p>
            <h1 className="mt-1 flex items-center gap-2 font-display text-[34px] font-black leading-tight sm:text-[46px]">
              {artist.name}
              {artist.verified && !artist.isSample ? <BadgeCheck className="h-6 w-6 text-emerald-400" aria-label="Verified" /> : null}
            </h1>
            <p className="mt-1 text-[12px] text-white/60">
              {artist._count.follows} follower{artist._count.follows === 1 ? "" : "s"} · {totalPlays} plays · {artist.genres.join(" · ") || "African music"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/naijastream/artists/${artist.slug}#tracks`} className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-[12.5px] font-extrabold text-black">
                <Play className="h-4 w-4 fill-current" aria-hidden /> Play
              </Link>
              <Link href={`/naijastream/studio`} className="flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-[12.5px] font-bold text-white">
                <Heart className="h-4 w-4" aria-hidden /> Support artist
              </Link>
              <Link href="#share" className="flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-[12.5px] font-bold text-white">
                <Share2 className="h-4 w-4" aria-hidden /> Share
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 pb-8 sm:px-6">
        {artist.bio ? <p className="max-w-3xl text-[13px] leading-7 text-white/70">{artist.bio}</p> : null}

        <section id="tracks" className="mt-6">
          <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-widest text-white/45">Popular tracks</h2>
          <TrackList tracks={cards} emptyMessage="This artist has no published tracks yet." />
        </section>

        {playlists.length > 0 ? (
          <section className="mt-6">
            <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-widest text-white/45">Playlists</h2>
            <ul className="flex gap-3 overflow-x-auto pb-2">
              {playlists.map((playlist) => (
                <li key={playlist.id} className="w-[140px] shrink-0">
                  <Link href={`/naijastream/playlists/${playlist.slug}`}>
                    {playlist.coverUrl ? (
                      <img src={playlist.coverUrl} alt="" className="aspect-square w-full rounded-lg object-cover" />
                    ) : (
                      <div className="aspect-square w-full rounded-lg bg-white/10" />
                    )}
                    <span className="mt-1 block truncate text-[12px] font-bold">{playlist.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section id="share" className="mt-6 rounded-xl border border-white/10 bg-[#101613] p-4 text-[12px] leading-6 text-white/60">
          <strong className="text-white/80">Fan support and memberships</strong> run through NaijaPay. Direct tips are available from a fan&apos;s wallet; fan
          clubs and paid releases activate once their entitlement checks and provider settlement are configured.
        </section>
      </div>
    </main>
  );
}
