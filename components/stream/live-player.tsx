"use client";

import { useEffect, useRef, useState } from "react";

/**
 * HLS live player. Uses native HLS where the browser supports it (Safari, and
 * Chrome 120+ on some platforms) and falls back to a clear message otherwise —
 * it never pretends to be playing when no frames are arriving.
 */
export function LivePlayer({ src, poster }: { src: string; poster: string | null }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<"loading" | "playing" | "buffering" | "unsupported" | "error">("loading");

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const onPlaying = () => setState("playing");
    const onWaiting = () => setState("buffering");
    const onError = () => setState("error");
    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("error", onError);
    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";
    if (!nativeHls) {
      setState("unsupported");
      return;
    }
    video.src = src;
    void video.play().catch(() => setState("buffering"));
    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("error", onError);
    };
  }, [src]);

  return (
    <div className="relative">
      <video ref={ref} poster={poster ?? undefined} controls muted playsInline className="aspect-video w-full bg-black" aria-label="Live stream" />
      <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-black uppercase text-white">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden /> Live
      </span>
      {state !== "playing" ? (
        <p className="absolute inset-x-0 bottom-0 bg-black/70 p-2 text-center text-[11px] text-white/75">
          {state === "unsupported"
            ? "Your browser cannot play HLS directly. Open this event in Safari, or install the stream player."
            : state === "error"
              ? "The live stream is unavailable right now."
              : "Connecting to the live stream…"}
        </p>
      ) : null}
    </div>
  );
}
