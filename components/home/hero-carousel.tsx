"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Pause, Play } from "lucide-react";

/**
 * Shared homepage hero carousel.
 *
 * Behaviour required by the brief:
 *  - rotates every 7s, pauses on hover, focus and when the tab is hidden;
 *  - arrows, dots, swipe and keyboard arrows all work;
 *  - reduced-motion users start paused and get no cross-fade;
 *  - the slide never navigates by itself; every CTA is an explicit user action;
 *  - only the active image is loaded eagerly; the rest are lazy.
 */

export type CarouselSlide = {
  slug: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel?: string | null;
  secondaryHref?: string | null;
  imageUrl: string | null;
  alt: string;
};

const ROTATE_MS = 7000;

export function HeroCarousel({
  slides,
  variantKey,
  points = ["Verified Providers", "Secure Payments", "Real-Time Services"],
  badge,
  overlay = "left",
  eyebrow
}: {
  slides: CarouselSlide[];
  variantKey: string;
  points?: string[];
  badge?: React.ReactNode;
  overlay?: "left" | "center";
  eyebrow?: string;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [hovered, setHovered] = useState(false);
  const touchStart = useRef<number | null>(null);
  const countedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    if (mq.matches) setPlaying(false);
  }, []);

  const go = useCallback((next: number) => setIndex(((next % slides.length) + slides.length) % slides.length), [slides.length]);

  useEffect(() => {
    if (!playing || hovered || slides.length < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), ROTATE_MS);
    const onVisibility = () => {
      if (document.hidden) window.clearInterval(timer);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playing, hovered, slides.length]);

  // Aggregate impression counting: one beacon per slide per page view.
  useEffect(() => {
    const slide = slides[index];
    if (!slide || countedRef.current.has(slide.slug)) return;
    countedRef.current.add(slide.slug);
    const payload = JSON.stringify({ variant: variantKey, kind: "hero_impression", slide: slide.slug });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/home/metrics", new Blob([payload], { type: "application/json" }));
    else void fetch("/api/home/metrics", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: payload }).catch(() => null);
  }, [index, slides, variantKey]);

  const track = (kind: "hero_click" | "cta_click", slide: string) => {
    const payload = JSON.stringify({ variant: variantKey, kind, slide });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/home/metrics", new Blob([payload], { type: "application/json" }));
  };

  if (!slides.length) return null;
  const slide = slides[index];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured NaijaDeals services"
      className="relative mt-3 overflow-hidden rounded-2xl bg-[#0b3d21] text-white"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setHovered(false);
      }}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return;
        const delta = event.changedTouches[0].clientX - touchStart.current;
        touchStart.current = null;
        if (Math.abs(delta) > 40) go(index + (delta < 0 ? 1 : -1));
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") go(index + 1);
        if (event.key === "ArrowLeft") go(index - 1);
      }}
      tabIndex={0}
    >
      <div className="relative aspect-[16/11] w-full sm:aspect-[16/8] lg:aspect-[2.45/1]">
        {slides.map((item, i) => (
          <img
            key={item.slug}
            src={item.imageUrl ?? ""}
            alt={i === index ? item.alt : ""}
            aria-hidden={i !== index}
            loading={i === 0 ? "eager" : "lazy"}
            className={`absolute inset-0 h-full w-full object-cover ${reduced ? "" : "transition-opacity duration-700"} ${i === index ? "opacity-100" : "opacity-0"}`}
          />
        ))}
        <div className={`absolute inset-0 ${overlay === "left" ? "bg-gradient-to-r from-[#04220f]/85 via-[#04220f]/55 via-45% to-transparent" : "bg-[#04220f]/60"}`} aria-hidden />
        <div className={`absolute inset-0 flex items-center ${overlay === "center" ? "justify-center text-center" : ""}`}>
          <div className={`p-4 sm:p-7 ${overlay === "center" ? "max-w-xl" : "max-w-[580px]"}`}>
            {badge}
            {eyebrow ? <p className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#f5b52e]">{eyebrow}</p> : null}
            <h1 aria-live="polite" className="mt-1 font-display text-[25px] font-extrabold leading-[1.05] sm:text-[34px] lg:text-[40px]">
              {slide.headline}
            </h1>
            <p className="mt-2 max-w-md text-[11.5px] leading-5 text-white/90 sm:text-[12.5px]">{slide.body}</p>
            {points.length ? (
              <ul className={`mt-2 grid gap-x-3 gap-y-1 ${overlay === "center" ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2"}`}>
                {points.map((point) => (
                  <li key={point} className="flex items-center gap-1 text-[10.5px] font-semibold text-white">
                    <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[#0b8f47]"><Check className="h-2.5 w-2.5" aria-hidden /></span>{point}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className={`mt-3 flex flex-wrap gap-2 ${overlay === "center" ? "justify-center" : ""}`}>
              <Link href={slide.ctaHref} onClick={() => track("hero_click", slide.slug)} className="rounded-full bg-[#f26b21] px-5 py-2.5 text-[12px] font-extrabold text-white hover:bg-[#dd5f18]">
                {slide.ctaLabel} →
              </Link>
              {slide.secondaryLabel && slide.secondaryHref ? (
                <Link href={slide.secondaryHref} onClick={() => track("hero_click", slide.slug)} className="rounded-full bg-white px-5 py-2.5 text-[12px] font-extrabold text-[#0b5c33]">
                  {slide.secondaryLabel}
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {slides.length > 1 ? (
          <>
            <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
              {slides.map((item, i) => (
                <button key={item.slug} type="button" onClick={() => go(i)} aria-label={`Show slide ${i + 1}: ${item.headline}`} aria-current={i === index ? "true" : undefined} className={`h-2 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-2 bg-white/50 hover:bg-white/80"}`} />
              ))}
            </div>
            <button type="button" onClick={() => go(index - 1)} aria-label="Previous slide" className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white backdrop-blur hover:bg-black/50 sm:grid">‹</button>
            <button type="button" onClick={() => go(index + 1)} aria-label="Next slide" className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white backdrop-blur hover:bg-black/50 sm:grid">›</button>
            <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause slideshow" : "Play slideshow"} aria-pressed={!playing} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/55">
              {playing && !reduced ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
