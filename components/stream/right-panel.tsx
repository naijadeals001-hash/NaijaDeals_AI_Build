"use client";

import Link from "next/link";
import { ListMusic, Plus } from "lucide-react";
import { useStreamPlayer } from "./player-context";

type Recommendation = { id: string; name: string; slug: string; avatarUrl: string | null; isSample?: boolean };

/**
 * Right-hand discovery panel from the approved reference: "Recommended for You"
 * (real artists from the catalogue) and "On Repeat" (the current playback queue,
 * which reflects what the listener actually queued).
 */
export function StreamRightPanel({ artists }: { artists?: Recommendation[] } = {}) {
  const player = useStreamPlayer();

  return (
    <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
      <section className="rounded-xl border border-white/10 bg-[#101613] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[12px] font-extrabold uppercase tracking-widest text-white/45">On repeat</h2>
          {player.queue.length > 0 ? (
            <button type="button" onClick={player.toggle} className="text-[10.5px] font-bold text-white/40 hover:text-emerald-300">
              {player.playing ? "Pause" : "Play"}
            </button>
          ) : null}
        </div>
        {player.queue.length === 0 ? (
          <p className="mt-2 text-[11.5px] leading-5 text-white/50">Your queue is empty — play a track and it appears here.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {player.queue.slice(0, 5).map((track, index) => (
              <li key={`${track.id}-${index}`}>
                <button
                  type="button"
                  onClick={() => player.play(player.queue, index)}
                  className={`flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-white/5 ${index === player.index ? "bg-white/5" : ""}`}
                >
                  {track.artistImageUrl || track.artworkUrl ? (
                    <img
                      data-repeat-artwork
                      src={track.artistImageUrl ?? track.artworkUrl ?? ""}
                      alt={`${track.artistName} — ${track.title}`}
                      loading="lazy"
                      className="h-9 w-9 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/10 text-[11px] text-white/40" aria-hidden>
                      ♪
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-bold">{track.title}</span>
                    <span className="block truncate text-[10.5px] text-white/45">{track.artistName}</span>
                  </span>
                  <ListMusic className="ml-auto h-3.5 w-3.5 shrink-0 text-white/25" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
