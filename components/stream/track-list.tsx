"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { useStreamPlayer, type PlayerTrack } from "./player-context";

export type ListTrack = {
  id: string;
  slug: string;
  title: string;
  durationSec: number;
  artworkUrl: string | null;
  audioUrl: string | null;
  genre?: string | null;
  playCount?: string;
  artist: { name: string; slug: string; avatarUrl?: string | null };
};

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/** Reusable track table. Playback uses the persistent player. */
export function TrackList({ tracks, emptyMessage }: { tracks: ListTrack[]; emptyMessage: string }) {
  const player = useStreamPlayer();
  const queue: PlayerTrack[] = tracks.map((track) => ({
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

  if (tracks.length === 0) {
    return <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-[12.5px] text-white/50">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <table className="w-full text-left text-[12.5px]">
        <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-white/40">
          <tr>
            <th className="w-10 px-3 py-2">#</th>
            <th className="px-3 py-2">Title</th>
            <th className="hidden px-3 py-2 sm:table-cell">Artist</th>
            <th className="hidden px-3 py-2 md:table-cell">Plays</th>
            <th className="px-3 py-2 text-right">Length</th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((track, index) => (
            <tr key={track.id} className="group border-t border-white/5 hover:bg-white/5">
              <td className="px-3 py-2 text-white/40">
                <button
                  type="button"
                  onClick={() => player.play(queue, index)}
                  aria-label={`Play ${track.title}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-white/50 hover:bg-emerald-500 hover:text-black"
                >
                  <Play className="h-3 w-3 fill-current" aria-hidden />
                </button>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-3">
                  {track.artworkUrl ? (
                    <img src={track.artworkUrl} alt="" className="h-9 w-9 rounded object-cover" loading="lazy" />
                  ) : (
                    <div className="h-9 w-9 rounded bg-white/10" />
                  )}
                  <div className="min-w-0">
                    <Link href={`/naijastream/tracks/${track.slug}`} className="block truncate font-semibold text-white hover:text-emerald-300">
                      {track.title}
                    </Link>
                    <span className="block truncate text-[10.5px] text-white/45 sm:hidden">{track.artist.name}</span>
                  </div>
                </div>
              </td>
              <td className="hidden px-3 py-2 text-white/60 sm:table-cell">
                <Link href={`/naijastream/artists/${track.artist.slug}`} className="hover:text-emerald-300">{track.artist.name}</Link>
              </td>
              <td className="hidden px-3 py-2 text-white/40 md:table-cell">{track.playCount ?? "0"}</td>
              <td className="px-3 py-2 text-right text-white/40">{fmt(track.durationSec)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
