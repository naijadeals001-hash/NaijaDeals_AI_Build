import Link from "next/link";
import { listPlaylists } from "@/lib/services/stream/service";

export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const playlists = await listPlaylists({ take: 60 });
  return (
    <main className="px-4 py-6 sm:px-6">
      <h1 className="font-display text-[26px] font-extrabold">Playlists</h1>
      {playlists.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 p-8 text-center text-[12.5px] text-white/50">
          No public playlists yet. Create one from your library.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <Link href={`/naijastream/playlists/${playlist.slug}`} className="block rounded-xl bg-[#131a16] p-3 hover:bg-[#18201b]">
                {playlist.coverUrl ? (
                  <img src={playlist.coverUrl} alt="" className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
                ) : (
                  <div className="aspect-square w-full rounded-lg bg-white/10" />
                )}
                <p className="mt-2 truncate text-[13px] font-bold">{playlist.title}</p>
                <p className="text-[10.5px] text-white/45">
                  {playlist._count.items} tracks{playlist.isEditorial ? " · NaijaStream" : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
