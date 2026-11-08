"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type PlayerTrack = {
  id: string;
  slug: string;
  title: string;
  durationSec: number;
  artworkUrl: string | null;
  audioUrl: string | null;
  artistName: string;
  isSample?: boolean;
};

type PlayerState = {
  queue: PlayerTrack[];
  index: number;
  current: PlayerTrack | null;
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  error: string | null;
  /** Play a list from a position. */
  play: (tracks: PlayerTrack[], startIndex?: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  removeFromQueue: (index: number) => void;
};

const PlayerContext = createContext<PlayerState | null>(null);
const STORAGE_KEY = "naijastream.player";

/**
 * Real HTMLAudioElement-backed player. Playback only starts when a track has an
 * authorized audioUrl; tracks without media show an honest error instead of a
 * simulated progress bar. Queue survives client-side navigation via React
 * context and page reload via sessionStorage (metadata only).
 */
export function StreamPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<PlayerTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "all" | "one">("off");
  const [error, setError] = useState<string | null>(null);
  const restored = useRef(false);

  const current = queue[index] ?? null;

  // Ensure the <audio> element exists exactly once.
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "metadata";
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    const onTime = () => setTime(audio.currentTime);
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEnd = () => setPlaying(false);
    const onError = () => {
      setPlaying(false);
      setError("This track's audio is unavailable right now.");
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onError);
    };
  }, []);

  // Restore the queue (not playback) after a reload.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { queue: PlayerTrack[]; index: number; volume: number };
        if (Array.isArray(saved.queue) && saved.queue.length > 0) {
          setQueue(saved.queue);
          setIndex(Math.min(saved.index ?? 0, saved.queue.length - 1));
          setVolumeState(saved.volume ?? 0.8);
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ queue: queue.slice(0, 50), index, volume }));
    } catch {
      /* storage may be unavailable */
    }
  }, [queue, index, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
      audio.muted = muted;
    }
  }, [volume, muted]);

  // Load the new source when the current track changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setError(null);
    setTime(0);
    setDuration(current?.durationSec ?? 0);
    if (!current) {
      audio.pause();
      audio.removeAttribute("src");
      return;
    }
    if (!current.audioUrl) {
      audio.pause();
      audio.removeAttribute("src");
      setPlaying(false);
      setError("Audio for this track has not been published yet.");
      return;
    }
    if (audio.src !== new URL(current.audioUrl, window.location.href).href) {
      audio.src = current.audioUrl;
      audio.load();
    }
  }, [current]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing && current?.audioUrl) {
      audio.play().catch(() => {
        setPlaying(false);
        setError("Playback was blocked by the browser or the file failed to load.");
      });
    } else {
      audio.pause();
    }
  }, [playing, current]);

  const play = useCallback((tracks: PlayerTrack[], startIndex = 0) => {
    if (tracks.length === 0) return;
    setQueue(tracks);
    setIndex(Math.max(0, Math.min(startIndex, tracks.length - 1)));
    setPlaying(true);
  }, []);

  const toggle = useCallback(() => {
    setPlaying((value) => !value);
  }, []);

  const advance = useCallback(
    (direction: 1 | -1) => {
      setQueue((currentQueue) => {
        setIndex((currentIndex) => {
          if (currentQueue.length === 0) return 0;
          if (shuffle && direction === 1) {
            return Math.floor(Math.random() * currentQueue.length);
          }
          const next = currentIndex + direction;
          if (next < 0) return repeat === "all" ? currentQueue.length - 1 : 0;
          if (next >= currentQueue.length) return repeat === "all" ? 0 : currentQueue.length - 1;
          return next;
        });
        return currentQueue;
      });
    },
    [repeat, shuffle]
  );

  // Auto-advance on end according to repeat mode.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handler = () => {
      if (repeat === "one" && current?.audioUrl) {
        audio.currentTime = 0;
        void audio.play();
        return;
      }
      if (index < queue.length - 1 || repeat === "all") advance(1);
    };
    audio.addEventListener("ended", handler);
    return () => audio.removeEventListener("ended", handler);
  }, [advance, current, index, queue.length, repeat]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setTime(seconds);
  }, []);

  const setVolume = useCallback((value: number) => {
    setVolumeState(Math.min(1, Math.max(0, value)));
    setMuted(false);
  }, []);

  const value = useMemo<PlayerState>(
    () => ({
      queue,
      index,
      current,
      playing,
      time,
      duration,
      volume,
      muted,
      shuffle,
      repeat,
      error,
      play,
      toggle,
      next: () => advance(1),
      prev: () => advance(-1),
      seek,
      setVolume,
      toggleMute: () => setMuted((m) => !m),
      toggleShuffle: () => setShuffle((s) => !s),
      cycleRepeat: () => setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off")),
      removeFromQueue: (target: number) =>
        setQueue((q) => {
          const nextQueue = q.filter((_, i) => i !== target);
          setIndex((i) => (target < i ? i - 1 : Math.min(i, Math.max(0, nextQueue.length - 1))));
          return nextQueue;
        })
    }),
    [queue, index, current, playing, time, duration, volume, muted, shuffle, repeat, error, play, toggle, advance, seek, setVolume]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function useStreamPlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("useStreamPlayer must be used inside StreamPlayerProvider");
  return context;
}
