"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type ShopHeroSlide = {
  id: string;
  eyebrow?: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  imageUrl: string;
  /** Optional right-hand secondary image/panel (mockup shows a Prime card). */
  sideTitle?: string;
  sideBody?: string;
  sideCtaLabel?: string;
  sideCtaHref?: string;
};

/**
 * Promotional hero. Slides either come from the Control Center or fall back to
 * the approved launch campaign; every CTA points at a real route. Rotation
 * pauses on hover, on focus and for reduced-motion users, and every dot is a
 * labelled button so the carousel is operable without a mouse.
 */
export function ShopHeroCarousel({ slides, intervalMs = 7000 }: { slides: ShopHeroSlide[]; intervalMs?: number }) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [touched, setTouched] = useState(false);
  const paused = hovered || touched;
  const regionRef = useRef<HTMLDivElement | null>(null);
  const count = slides.length;

  // Once the shopper interacts, stop auto-rotating so focus and reading are
  // never interrupted mid-way through a promotion.
  const go = useCallback((next: number) => {
    setTouched(true);
    setIndex(((next % count) + count) % count);
  }, [count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % count), intervalMs);
    return () => window.clearInterval(timer);
  }, [count, paused, intervalMs]);

  useEffect(() => {
    if (index > count - 1) setIndex(0);
  }, [count, index]);

  if (count === 0) return null;
  const slide = slides[Math.min(index, count - 1)];

  return (
    <div
      ref={regionRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured promotions"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}
      className="relative overflow-hidden rounded-lg bg-[#1a1a1a]"
    >
      <div className="grid">
        <div className="relative min-h-[240px] sm:min-h-[300px] lg:min-h-[360px]">
          <img
            key={slide.id}
            src={slide.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/5" aria-hidden />
          <div className="relative flex h-full flex-col justify-center gap-1.5 p-5 pl-11 sm:p-7 sm:pl-12">
            {slide.eyebrow ? (
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#f7c948]">{slide.eyebrow}</p>
            ) : null}
            <h1 className="font-display text-[22px] font-extrabold leading-tight text-white sm:text-[30px] lg:text-[36px]">{slide.headline}</h1>
            <p className="max-w-md text-[12px] leading-5 text-white/85 sm:text-[13.5px]">{slide.body}</p>
            <Link href={slide.ctaHref} className="mt-1 w-fit rounded-full bg-[#f7c948] px-5 py-2 text-[12.5px] font-extrabold text-[#12100a] transition hover:bg-[#ffd75e]">
              {slide.ctaLabel}
            </Link>
            {count > 1 ? (
              <div className="absolute bottom-3 left-5 flex gap-1.5 sm:left-7 lg:left-9" role="tablist" aria-label="Choose a promotion">
                {slides.map((item, dot) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={dot === index}
                    aria-label={`Show promotion ${dot + 1} of ${count}`}
                    onClick={() => go(dot)}
                    className={`h-2 rounded-full transition-all ${dot === index ? "w-5 bg-white" : "w-2 bg-white/45 hover:bg-white/70"}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {slide.sideTitle ? (
          <aside className="hidden">
            <p className="font-display text-[18px] font-extrabold leading-tight">{slide.sideTitle}</p>
            <p className="text-[12px] leading-5 text-[#565959]">{slide.sideBody}</p>
            {slide.sideCtaLabel && slide.sideCtaHref ? (
              <Link href={slide.sideCtaHref} className="mt-1 w-fit rounded-full bg-[#12100a] px-4 py-2 text-[12px] font-extrabold text-white hover:bg-black">
                {slide.sideCtaLabel}
              </Link>
            ) : null}
          </aside>
        ) : null}
      </div>

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous promotion"
            className="absolute left-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next promotion"
            className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:right-[316px]"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </>
      ) : null}
    </div>
  );
}
