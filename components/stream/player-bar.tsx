"use client";

import { Heart, ListMusic, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useStreamPlayer } from "./player-context";

function fmt(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Persistent bottom player. Controls drive a real <audio> element; the queue
 * panel and like button call the authenticated APIs.
 */
export function StreamPlayerBar() {
  const player = useStreamPlayer();
  const { current } = player;
  const [showQueue, setShowQueue] = useState(false);
  const [liked, setLiked] = useState(false);

  async function toggleLike() {
    if (!current) return;
    const res = await fetch("/api/stream/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ trackId: current.id })
    });
    if (res.ok) {
      const body = await res.json();
      setLiked(Boolean(body.liked));
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 lg:pl-[240px] lg:pr-[300px]">
      <div className="pointer-events-auto border-t border-white/10 bg-[#0b0f0d]/95 backdrop-blur">
        {player.error ? (
          <p role="status" className="bg-amber-500/15 px-4 py-1 text-center text-[11px] font-semibold text-amber-300">
            {player.error}
          </p>
        ) : null}
        <div className="flex items-center gap-3 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {current?.artworkUrl ? (
              <img src={current.artworkUrl} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white/10 text-xs text-white/50">♪</div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-bold text-white">{current?.title ?? "Nothing playing"}</p>
              <p className="truncate text-[11px] text-white/50">{current?.artistName ?? "Choose a track to start"}</p>
            </div>
            <button
              type="button"
              onClick={() => void toggleLike()}
              disabled={!current}
              aria-label={liked ? "Unlike track" : "Like track"}
              aria-pressed={liked}
              className={`hidden shrink-0 rounded-full p-2 transition sm:block ${liked ? "text-emerald-400" : "text-white/60 hover:text-white"} disabled:opacity-30`}
            >
              <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} aria-hidden />
            </button>
          </div>

          <div className="flex flex-1 flex-col items-center gap-1">
            <div className="flex items-center gap-3 sm:gap-4">
              <button type="button" onClick={player.toggleShuffle} aria-pressed={player.shuffle} aria-label="Shuffle" className={`hidden rounded p-1 sm:block ${player.shuffle ? "text-emerald-400" : "text-white/60 hover:text-white"}`}>
                <Shuffle className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" onClick={player.prev} aria-label="Previous track" className="rounded p-1 text-white/80 hover:text-white">
                <SkipBack className="h-4 w-4 fill-current" aria-hidden />
              </button>
              <button
                type="button"
                onClick={player.toggle}
                disabled={!current}
                aria-label={player.playing ? "Pause" : "Play"}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-black transition hover:scale-105 disabled:opacity-40"
              >
                {player.playing ? <Pause className="h-4 w-4 fill-current" aria-hidden /> : <Play className="h-4 w-4 translate-x-[1px] fill-current" aria-hidden />}
              </button>
              <button type="button" onClick={player.next} aria-label="Next track" className="rounded p-1 text-white/80 hover:text-white">
                <SkipForward className="h-4 w-4 fill-current" aria-hidden />
              </button>
              <button type="button" onClick={player.cycleRepeat} aria-label={`Repeat: ${player.repeat}`} className={`hidden rounded p-1 sm:block ${player.repeat !== "off" ? "text-emerald-400" : "text-white/60 hover:text-white"}`}>
                <Repeat className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="flex w-full max-w-md items-center gap-2">
              <span className="w-9 text-right text-[10px] tabular-nums text-white/50">{fmt(player.time)}</span>
              <input
                type="range"
                min={0}
                max={Math.max(player.duration, 1)}
                step={1}
                value={Math.min(player.time, Math.max(player.duration, 1))}
                onChange={(event) => player.seek(Number(event.target.value))}
                aria-label="Seek"
                className="h-1 w-full accent-emerald-500"
              />
              <span className="w-9 text-[10px] tabular-nums text-white/50">{fmt(player.duration || current?.durationSec || 0)}</span>
            </div>
          </div>

          <div className="hidden flex-1 items-center justify-end gap-2 lg:flex">
            <button type="button" onClick={() => setShowQueue((v) => !v)} aria-pressed={showQueue} aria-label="Queue" className="rounded p-1.5 text-white/60 hover:text-white">
              <ListMusic className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" onClick={player.toggleMute} aria-label={player.muted ? "Unmute" : "Mute"} className="rounded p-1.5 text-white/60 hover:text-white">
              {player.muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={player.volume}
              onChange={(event) => player.setVolume(Number(event.target.value))}
              aria-label="Volume"
              className="h-1 w-24 accent-emerald-500"
            />
          </div>
        </div>
        {showQueue ? (
          <div className="max-h-64 overflow-y-auto border-t border-white/10 px-4 py-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/40">Queue · {player.queue.length}</p>
            {player.queue.length === 0 ? <p className="text-xs text-white/50">Queue is empty.</p> : null}
            <ul>
              {player.queue.map((track, i) => (
                <li key={`${track.id}-${i}`} className={`flex items-center justify-between gap-3 rounded px-2 py-1.5 text-[12px] ${i === player.index ? "bg-white/10 text-white" : "text-white/70"}`}>
                  <span className="truncate">
                    {i + 1}. <span className="font-semibold">{track.title}</span> · {track.artistName}
                  </span>
                  <button type="button" onClick={() => player.removeFromQueue(i)} className="shrink-0 text-[10px] text-white/40 hover:text-white" aria-label={`Remove ${track.title} from queue`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <Link href="/naijastream/library" className="mt-2 inline-block text-[11px] font-bold text-emerald-400 hover:underline">
              Open library →
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
