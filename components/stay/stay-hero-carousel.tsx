"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, House, Pause, Play } from "lucide-react";

/**
 * Rotating hero. Several distinct Kie.ai scenes cross-fade every 6 seconds.
 * Pausing is a real control, reduced-motion users start paused, and the
 * carousel is a list of slides with dots + arrows so keyboard users can move.
 */
const POINTS = ["Verified Listings", "Secure Bookings", "Trusted Hosts", "Multiple Payment Options"];

export function StayHeroCarousel({ slides }: { slides: Array<{ src: string; alt: string; caption: string }> }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    if (mq.matches) setPlaying(false);
  }, []);

  const go = useCallback((next: number) => setIndex(((next % slides.length) + slides.length) % slides.length), [slides.length]);

  useEffect(() => {
    if (!playing || slides.length < 2) return;
    timer.current = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), 6000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, slides.length]);

  return (
    <section aria-labelledby="stay-hero" className="relative mt-3 overflow-hidden rounded-2xl bg-[#0b5c33]">
      <div className="relative aspect-[16/10] w-full sm:aspect-[21/9]">
        {slides.map((slide, i) => (
          <img
            key={slide.src}
            src={slide.src}
            alt={slide.alt}
            aria-hidden={i !== index}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${i === index ? "opacity-100" : "opacity-0"}`}
            loading={i === 0 ? "eager" : "lazy"}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-[#042915]/95 via-[#06301a]/70 to-transparent" aria-hidden />
        <div className="absolute inset-0 flex items-center">
          <div className="max-w-[560px] p-4 sm:p-7">
            <p className="flex items-center gap-1.5 font-display text-[18px] font-extrabold text-white"><House className="h-5 w-5 text-[#f5b52e]" aria-hidden /> Naija<span className="text-[#f5b52e]">Stay</span></p>
            <h1 id="stay-hero" className="mt-1 font-display text-[24px] font-extrabold leading-[1.08] text-white sm:text-[34px] lg:text-[40px]">
              Find a Place.<br />Stay Anywhere.<br /><span className="text-[#f5b52e]">Feel at Home.</span>
            </h1>
            <p className="mt-2 max-w-md text-[11px] leading-5 text-white/90 sm:text-[12.5px]">Africa&apos;s trusted marketplace for hotels, short stays, long-term rentals, houses, land and real estate across all African countries.</p>
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {POINTS.map((p) => <li key={p} className="flex items-center gap-1 text-[10px] font-semibold text-white"><span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[#0b8f47]"><Check className="h-2.5 w-2.5" aria-hidden /></span>{p}</li>)}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/naijastay/stays" className="rounded-full bg-[#f26b21] px-5 py-2.5 text-[12px] font-extrabold text-white hover:bg-[#dd5f18]">Book a Stay →</Link>
              <Link href="/naijastay/host" className="rounded-full bg-white px-5 py-2.5 text-[12px] font-extrabold text-[#0b5c33]">List Your Property →</Link>
            </div>
          </div>
        </div>

        {slides.length > 1 ? (
          <>
            <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause hero images" : "Play hero images"} aria-pressed={!playing} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/55">
              {playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
            </button>
            <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5" role="tablist" aria-label="Hero images">
              {slides.map((slide, i) => (
                <button key={slide.src} type="button" role="tab" aria-selected={i === index} aria-label={slide.caption} onClick={() => go(i)} className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"}`} />
              ))}
            </div>
            <p className="sr-only" aria-live="polite">{slides[index]?.caption}</p>
          </>
        ) : null}
      </div>
    </section>
  );
}
