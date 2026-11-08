"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

type Episode = {
  id: string;
  title: string;
  audioUrl: string | null;
  durationLabel: string;
  description: string | null;
  label: string;
};

/**
 * Podcast episode player driven by a real <audio> element. One episode plays at
 * a time; progress and seeking are real, and missing audio is reported instead
 * of faking playback.
 */
export function EpisodePlayer({ episodes, showTitle }: { episodes: Episode[]; showTitle: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const current = episodes[index];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setTime(audio.currentTime);
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onError = () => {
      setPlaying(false);
      setError("This episode's audio could not be loaded.");
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setError(null);
    setTime(0);
    if (!current?.audioUrl) {
      audio.pause();
      audio.removeAttribute("src");
      setPlaying(false);
      setError("This episode has no published audio yet.");
      return;
    }
    audio.src = current.audioUrl;
    audio.load();
    if (playing) void audio.play().catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current?.audioUrl) return;
    if (playing) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, [playing, current]);

  function move(delta: number) {
    setIndex((value) => Math.max(0, Math.min(value + delta, episodes.length - 1)));
  }

  function fmt(seconds: number) {
    if (!Number.isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  if (episodes.length === 0) {
    return <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-[12.5px] text-white/50">No published episodes yet.</p>;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#101613] p-5">
      <audio ref={audioRef} data-episode-audio aria-hidden className="sr-only" />
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">{showTitle}</p>
      <h2 className="mt-1 font-display text-lg font-extrabold">
        {current.label} · {current.title}
      </h2>
      {error ? (
        <p role="status" className="mt-2 rounded-lg bg-amber-500/15 p-2 text-[11.5px] font-semibold text-amber-300">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => move(-1)} disabled={index === 0} aria-label="Previous episode" className="rounded-full p-2 text-white/70 disabled:opacity-30">
          <SkipBack className="h-4 w-4 fill-current" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause episode" : "Play episode"}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-black"
        >
          {playing ? <Pause className="h-5 w-5 fill-current" aria-hidden /> : <Play className="h-5 w-5 translate-x-[1px] fill-current" aria-hidden />}
        </button>
        <button type="button" onClick={() => move(1)} disabled={index === episodes.length - 1} aria-label="Next episode" className="rounded-full p-2 text-white/70 disabled:opacity-30">
          <SkipForward className="h-4 w-4 fill-current" aria-hidden />
        </button>
        <span className="w-10 text-right text-[10px] tabular-nums text-white/50">{fmt(time)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(Math.round(duration || Number(current.durationLabel.split(" ")[0]) * 60), 1)}
          step={1}
          value={Math.min(Math.round(time), Math.max(Math.round(duration), 1))}
          onChange={(event) => {
            const audio = audioRef.current;
            if (!audio) return;
            audio.currentTime = Number(event.target.value);
            setTime(Number(event.target.value));
          }}
          aria-label="Seek episode"
          className="h-1 flex-1 accent-emerald-500"
        />
        <span className="w-12 text-[10px] tabular-nums text-white/50">{duration ? fmt(duration) : current.durationLabel}</span>
      </div>

      <ul className="mt-5 divide-y divide-white/5">
        {episodes.map((episode, i) => (
          <li key={episode.id}>
            <button
              type="button"
              onClick={() => {
                setIndex(i);
                setPlaying(true);
              }}
              className={`flex w-full items-start justify-between gap-3 py-3 text-left text-[12.5px] transition hover:bg-white/5 ${i === index ? "text-emerald-300" : "text-white/80"}`}
            >
              <span className="min-w-0">
                <span className="block font-semibold">
                  {episode.label} · {episode.title}
                </span>
                {episode.description ? <span className="mt-0.5 block truncate text-[11px] text-white/45">{episode.description}</span> : null}
              </span>
              <span className="shrink-0 text-[11px] text-white/40">{episode.durationLabel}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
