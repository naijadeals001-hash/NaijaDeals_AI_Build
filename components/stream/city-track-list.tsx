"use client";

import Link from "next/link";
import { Pause, Play } from "lucide-react";
import { useStreamPlayer } from "./player-context";
import { CoverArt } from "./cover-art";

type CityTrack = {
  id: string;
  title: string;
  slug: string;
  durationSec: number;
  artworkUrl: string | null;
  genre: string | null;
  audioUrl: string | null;
  artist: { id: string; name: string; slug: string; avatarUrl: string | null };
};

function fmt(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/** City tracks feed the shared player, so playback continues across pages. */
export function CityTrackList({ tracks }: { tracks: CityTrack[] }) {
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
    <ol className="mt-3 space-y-1">
      {tracks.map((track, index) => {
        const isCurrent = player.current?.id === track.id;
        const playingThis = isCurrent && player.playing;
        return (
          <li key={track.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5">
            <button
              type="button"
              onClick={() => (isCurrent ? player.toggle() : player.play(queue, index))}
              aria-label={playingThis ? `Pause ${track.title}` : `Play ${track.title}`}
              className="relative shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520]"
            >
              <CoverArt src={track.artworkUrl} title={track.title} className="h-11 w-11" />
              <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/40">
                {playingThis ? <Pause className="h-4 w-4 fill-white text-white" aria-hidden /> : <Play className="h-4 w-4 translate-x-[1px] fill-white text-white" aria-hidden />}
              </span>
            </button>
            <Link href={`/naijastream/tracks/${track.slug}`} className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold">{track.title}</span>
              <span className="block truncate text-[11px] text-white/45">
                {track.artist.name}
                {track.genre ? ` · ${track.genre}` : ""}
              </span>
            </Link>
            <span className="text-[11px] tabular-nums text-white/40">{fmt(track.durationSec)}</span>
          </li>
        );
      })}
    </ol>
  );
}
