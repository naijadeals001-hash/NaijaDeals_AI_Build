"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

export type HeroSlide = {
  id: string;
  eyebrow: string;
  headline: string;
  accent: string;
  body: string;
  imageUrl: string;
  posterUrl?: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
};

/**
 * Cinematic hero carousel.
 *
 * Accessibility and honesty rules baked in: every slide's CTAs point at routes
 * that exist, rotation pauses on hover/focus/interaction and when the tab is
 * hidden, reduced-motion disables auto-rotation, and there is an explicit
 * play/pause control. Touch users can swipe. Keyboard users get arrows and
 * home/end on the region.
 */
export function HeroCarousel({
  slides,
  intervalMs = 6000,
  initialIndex = 0
}: {
  slides: HeroSlide[];
  intervalMs?: number;
  initialIndex?: number;
}) {
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(slides.length - 1, 0)));
  const [paused, setPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStart = useRef<number | null>(null);
  const regionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const go = useCallback(
    (delta: number) => {
      if (slides.length === 0) return;
      setIndex((current) => (current + delta + slides.length) % slides.length);
    },
    [slides.length]
  );

  const rotating = !paused && !userPaused && !reducedMotion && slides.length > 1;
  useEffect(() => {
    if (!rotating) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, rotating, slides.length]);

  if (slides.length === 0) return null;

  return (
    <section
      ref={regionRef}
      aria-roledescription="carousel"
      aria-label="Featured on NaijaStream"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          go(1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          go(-1);
        } else if (event.key === "Home") {
          setIndex(0);
        } else if (event.key === "End") {
          setIndex(slides.length - 1);
        }
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return;
        const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStart.current;
        if (Math.abs(delta) > 44) go(delta < 0 ? 1 : -1);
        touchStart.current = null;
      }}
      className="relative isolate overflow-hidden rounded-2xl bg-[#0b1410] outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
    >
      {slides.map((slide, i) => (
        <div
          key={slide.id}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${slides.length}`}
          aria-hidden={i !== index}
          className={`${i === index ? "block" : "hidden"} absolute inset-0`}
        >
          <img
            src={slide.imageUrl}
            alt=""
            aria-hidden
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : "auto"}
            className="h-full w-full object-cover object-[70%_center] sm:object-center"
          />
          <div className="absolute inset-0 bg-[linear-gradient(95deg,#050d09_0%,#050d09f2_32%,#050d09a8_52%,transparent_78%)]" aria-hidden />
          {/* Mobile keeps a heavier bottom-up scrim: artwork crops tighter and text sits over it. */}
          <div className="absolute inset-0 bg-[linear-gradient(to_top,#050d09fc_0%,#050d09e8_38%,#050d0973_70%,#050d0933_100%)] sm:hidden" aria-hidden />
        </div>
      ))}

      {/* Active slide content is kept in normal flow so the hero sizes itself. */}
      <div className="relative flex min-h-[300px] flex-col justify-between p-5 sm:min-h-[400px] sm:p-8 lg:min-h-[430px]">
        {slides.map((slide, i) => (
          <div
            key={`${slide.id}-content`}
            className={i === index ? "block max-w-[560px]" : "hidden"}
            aria-hidden={i !== index}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">{slide.eyebrow}</p>
            <h1 className="mt-2 font-display text-[34px] font-black uppercase leading-[0.9] tracking-[-0.02em] sm:text-[56px] lg:text-[64px]">
              {slide.headline}{" "}
              <span className="text-emerald-400">{slide.accent}</span>
            </h1>
            <p className="mt-2 max-w-md text-[12px] leading-5 text-white/70 sm:text-[13px] sm:leading-6">{slide.body}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href={slide.primary.href}
                className="rounded-full bg-emerald-500 px-5 py-2.5 text-[12.5px] font-extrabold text-black transition hover:bg-emerald-400"
              >
                {slide.primary.label}
              </Link>
              <Link
                href={slide.secondary.href}
                className="rounded-full border border-white/25 px-5 py-2.5 text-[12.5px] font-bold text-white transition hover:bg-white/10"
              >
                {slide.secondary.label}
              </Link>
            </div>
          </div>
        ))}

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-2 bg-white/35 hover:bg-white/60"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => go(-1)} aria-label="Previous slide" className="rounded-full bg-white/10 p-2 text-white/80 hover:bg-white/20">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              aria-label={userPaused ? "Resume automatic rotation" : "Pause automatic rotation"}
              aria-pressed={userPaused}
              className="rounded-full bg-white/10 p-2 text-white/80 hover:bg-white/20"
            >
              {userPaused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next slide" className="rounded-full bg-white/10 p-2 text-white/80 hover:bg-white/20">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
