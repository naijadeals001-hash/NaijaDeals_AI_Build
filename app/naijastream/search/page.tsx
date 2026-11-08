import Link from "next/link";
import { listArtists, listPlaylists, listTracks } from "@/lib/services/stream/service";
import { TrackList, type ListTrack } from "@/components/stream/track-list";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams?: { q?: string } }) {
  const q = searchParams?.q?.trim() ?? "";
  const [tracksResult, artists, playlists] = q
    ? await Promise.all([listTracks({ q, take: 30 }), listArtists({ q, take: 8 }), listPlaylists({ take: 8 })])
    : [{ items: [] as unknown as ListTrack[], total: 0 }, [], []];

  return (
    <main className="px-4 py-6 sm:px-6">
      <h1 className="font-display text-[26px] font-extrabold">Search</h1>
      <form action="/naijastream/search" className="mt-3 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="Songs, artists, playlists…"
          aria-label="Search catalogue"
          className="h-11 flex-1 rounded-full border border-white/10 bg-white/5 px-4 text-[13px] text-white outline-none placeholder:text-white/40 focus:border-emerald-400/50"
        />
        <button type="submit" className="rounded-full bg-emerald-500 px-6 text-[13px] font-bold text-black">Search</button>
      </form>

      {!q ? (
        <p className="mt-6 text-[12.5px] text-white/50">Type a song, artist or playlist name to search the catalogue.</p>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-white/45">Tracks · {tracksResult.total}</h2>
            <div className="mt-2">
              <TrackList tracks={tracksResult.items as unknown as ListTrack[]} emptyMessage={`No tracks match “${q}”.`} />
            </div>
          </section>
          <section className="mt-6">
            <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-white/45">Artists</h2>
            {artists.length === 0 ? (
              <p className="mt-2 text-[12px] text-white/50">No artists match.</p>
            ) : (
              <ul className="mt-2 flex gap-3 overflow-x-auto pb-2">
                {artists.map((artist) => (
                  <li key={artist.id} className="w-[110px] shrink-0 text-center">
                    <Link href={`/naijastream/artists/${artist.slug}`}>
                      {artist.avatarUrl ? <img src={artist.avatarUrl} alt="" className="mx-auto h-[110px] w-[110px] rounded-full object-cover" /> : <span className="mx-auto flex h-[110px] w-[110px] items-center justify-center rounded-full bg-white/10 text-2xl">{artist.name.charAt(0)}</span>}
                      <span className="mt-1 block truncate text-[12px] font-bold">{artist.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="mt-6">
            <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-white/45">Playlists</h2>
            <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {playlists.map((playlist) => (
                <li key={playlist.id}>
                  <Link href={`/naijastream/playlists/${playlist.slug}`} className="block rounded-lg bg-[#131a16] p-2">
                    {playlist.coverUrl ? <img src={playlist.coverUrl} alt="" className="aspect-square w-full rounded object-cover" /> : <div className="aspect-square w-full rounded bg-white/10" />}
                    <span className="mt-1 block truncate text-[12px] font-bold">{playlist.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
