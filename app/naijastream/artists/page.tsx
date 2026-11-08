import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { listArtists } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

export default async function ArtistsPage() {
  const artists = await listArtists({ take: 60 });
  return (
    <main className="px-4 py-6 sm:px-6">
      <h1 className="font-display text-[26px] font-extrabold">Artists &amp; creators</h1>
      <p className="mt-1 text-[12px] text-white/50">
        {artists.length} verified artist{artists.length === 1 ? "" : "s"} on NaijaStream.
      </p>
      {artists.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 p-8 text-center text-[12.5px] text-white/50">
          No verified artists yet. Creators appear here once their profile is approved.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {artists.map((artist) => (
            <li key={artist.id}>
              <Link href={`/naijastream/artists/${artist.slug}`} className="group block text-center">
                {artist.avatarUrl ? (
                  <img src={artist.avatarUrl} alt="" className="mx-auto aspect-square w-full rounded-full object-cover transition group-hover:scale-105" loading="lazy" />
                ) : (
                  <span className="mx-auto flex aspect-square w-full items-center justify-center rounded-full bg-white/10 font-display text-3xl font-black text-white/30">
                    {artist.name.charAt(0)}
                  </span>
                )}
                <p className="mt-2 flex items-center justify-center gap-1 truncate text-[13px] font-bold">
                  {artist.name}
                  {artist.verified ? <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" aria-label="Verified" /> : null}
                </p>
                <p className="text-[10.5px] text-white/45">
                  {artist._count.tracks} release{artist._count.tracks === 1 ? "" : "s"} · {artist._count.follows} follower{artist._count.follows === 1 ? "" : "s"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
