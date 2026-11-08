"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { TrackList, type ListTrack } from "./track-list";

type Library = {
  liked: Array<{ id: string; slug: string; title: string; durationSec: number; artworkUrl: string | null; audioUrl: string | null; playCount: string; artist: { name: string; slug: string } }>;
  artists: Array<{ id: string; name: string; slug: string; avatarUrl: string | null; _count: { tracks: number } }>;
  playlists: Array<{ id: string; title: string; slug: string; coverUrl: string | null; _count: { items: number } }>;
};

export function StreamLibrary({ initialTab = "liked" }: { initialTab?: string }) {
  const [data, setData] = useState<Library | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [tab, setTab] = useState<"liked" | "artists" | "playlists">(
    initialTab === "artists" ? "artists" : initialTab === "playlists" ? "playlists" : "liked"
  );
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    fetch("/api/stream/library", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(Object.assign(new Error("Sign in required."), { status: res.status }))))
      .then((body) => {
        setData(body);
        setState("ready");
      })
      .catch((err) => setState(err.status === 401 ? "signed-out" : "error"));
  }, []);

  useEffect(load, [load]);

  async function createPlaylist(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const res = await fetch("/api/stream/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title: title.trim() })
    });
    const body = await res.json().catch(() => ({}));
    setMessage(res.ok ? `Playlist “${body.title}” created.` : body.error ?? "Could not create the playlist.");
    if (res.ok) {
      setTitle("");
      load();
      setTab("playlists");
    }
  }

  if (state === "signed-out") {
    return (
      <div className="rounded-xl border border-white/10 bg-[#101613] p-8 text-center">
        <h2 className="font-display text-lg font-extrabold">Sign in to open your library</h2>
        <p className="mt-1 text-[12px] text-white/55">Liked songs, followed artists and your playlists are saved to your NaijaDeals account.</p>
        <Link href="/login?next=/naijastream/library" className="mt-4 inline-block rounded-full bg-emerald-500 px-5 py-2.5 text-[12.5px] font-bold text-black">
          Sign in
        </Link>
      </div>
    );
  }
  if (state === "loading") {
    return (
      <div className="flex justify-center py-16" aria-busy="true">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-400" aria-hidden />
      </div>
    );
  }
  if (state === "error" || !data) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-[12.5px] text-red-200">
        Library could not be loaded.{" "}
        <button type="button" onClick={load} className="font-bold underline">Try again</button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {(["liked", "artists", "playlists"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={`rounded-full px-4 py-1.5 text-[11.5px] font-bold ${tab === value ? "bg-emerald-500 text-black" : "border border-white/10 bg-white/5 text-white/70"}`}
          >
            {value === "liked" ? "Liked songs" : value === "artists" ? "Followed artists" : "Playlists"}
          </button>
        ))}
      </div>

      {message ? <p role="status" className="mt-3 rounded-lg bg-emerald-500/10 p-3 text-[12px] font-semibold text-emerald-200">{message}</p> : null}

      <div className="mt-4">
        {tab === "liked" ? (
          <TrackList tracks={data.liked as unknown as ListTrack[]} emptyMessage="No liked songs yet. Tap the heart in the player to save a track." />
        ) : null}

        {tab === "artists" ? (
          data.artists.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-[12.5px] text-white/50">You are not following any artists yet.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {data.artists.map((artist) => (
                <li key={artist.id}>
                  <Link href={`/naijastream/artists/${artist.slug}`} className="block text-center">
                    {artist.avatarUrl ? <img src={artist.avatarUrl} alt="" className="mx-auto aspect-square w-full rounded-full object-cover" /> : <span className="mx-auto flex aspect-square w-full items-center justify-center rounded-full bg-white/10 text-2xl">{artist.name.charAt(0)}</span>}
                    <span className="mt-1 block truncate text-[12px] font-bold">{artist.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === "playlists" ? (
          <div>
            <form onSubmit={createPlaylist} className="flex gap-2">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="New playlist name"
                maxLength={80}
                aria-label="New playlist name"
                className="h-10 flex-1 rounded-full border border-white/10 bg-white/5 px-4 text-[12.5px] text-white outline-none"
              />
              <button type="submit" className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 text-[12px] font-bold text-black">
                <Plus className="h-3.5 w-3.5" aria-hidden /> Create
              </button>
            </form>
            {data.playlists.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-white/15 p-6 text-center text-[12.5px] text-white/50">No playlists yet — create your first one above.</p>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
                {data.playlists.map((playlist) => (
                  <li key={playlist.id}>
                    <Link href={`/naijastream/playlists/${playlist.slug}`} className="block rounded-xl bg-[#131a16] p-3">
                      {playlist.coverUrl ? <img src={playlist.coverUrl} alt="" className="aspect-square w-full rounded-lg object-cover" /> : <div className="aspect-square w-full rounded-lg bg-white/10" />}
                      <p className="mt-2 truncate text-[12.5px] font-bold">{playlist.title}</p>
                      <p className="text-[10.5px] text-white/45">{playlist._count.items} tracks</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
