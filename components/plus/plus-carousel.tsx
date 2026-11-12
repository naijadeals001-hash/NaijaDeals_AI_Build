"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type EdgeState = { start: boolean; end: boolean };

/**
 * A contained, non-rotating card rail.
 *
 * - Native horizontal scrolling gives touch swipe and momentum without a
 *   custom drag implementation.
 * - Arrows page by the number of cards actually visible and disable at each
 *   boundary.
 * - The track itself is focusable so ArrowLeft/ArrowRight/Home/End work from
 *   the keyboard without hijacking keys while a card link has focus.
 * - Scrolling honours `prefers-reduced-motion`; nothing auto-advances.
 * - Boundary maths and key direction account for RTL.
 */
export function PlusCarousel({
  label,
  hint,
  children
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  const trackId = useId();
  const instructionsId = useId();
  const trackRef = useRef<HTMLUListElement | null>(null);
  // Start fully disabled so SSR and hydration agree, then measure the real
  // track. An enabled arrow before measurement would be a false affordance.
  const [edges, setEdges] = useState<EdgeState>({ start: true, end: true });

  const measure = useCallback(() => {
    const node = trackRef.current;
    if (!node) return;
    const max = Math.max(0, node.scrollWidth - node.clientWidth);
    const position = Math.abs(node.scrollLeft);
    setEdges({ start: position <= 2, end: max <= 2 || position >= max - 2 });
  }, []);

  useEffect(() => {
    const node = trackRef.current;
    if (!node) return;
    measure();
    node.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  const page = useCallback((direction: -1 | 1) => {
    const node = trackRef.current;
    if (!node) return;
    const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rtl = getComputedStyle(node).direction === "rtl";
    const firstCard = node.firstElementChild as HTMLElement | null;
    const cardWidth = firstCard?.getBoundingClientRect().width ?? node.clientWidth * 0.8;
    const gap = Number.parseFloat(getComputedStyle(node).columnGap || "12") || 12;
    const step = Math.max(cardWidth + gap, 1);
    const visible = Math.max(1, Math.round(node.clientWidth / step));
    node.scrollBy({
      left: direction * visible * step * (rtl ? -1 : 1),
      behavior: reducedMotion ? "auto" : "smooth"
    });
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    // Only handle keys while the rail itself has focus. Card CTAs remain normal
    // links, and arrow keys pressed there are left to the browser.
    if (event.target !== event.currentTarget) return;
    const node = trackRef.current;
    if (!node) return;
    const rtl = getComputedStyle(node).direction === "rtl";

    if (event.key === "ArrowRight") {
      event.preventDefault();
      page(rtl ? -1 : 1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      page(rtl ? 1 : -1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const max = Math.max(0, node.scrollWidth - node.clientWidth);
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const target = event.key === "Home" ? 0 : max;
      node.scrollTo({ left: rtl ? -target : target, behavior: reducedMotion ? "auto" : "smooth" });
    }
  };

  return (
    <div className="min-w-0 max-w-full">
      <div role="region" aria-roledescription="carousel" aria-label={`${label} carousel`} className="min-w-0 max-w-full">
        <ul
          id={trackId}
          ref={trackRef}
          tabIndex={0}
          aria-label={label}
          aria-describedby={instructionsId}
          onKeyDown={onKeyDown}
          className="flex w-full min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 [&::-webkit-scrollbar]:hidden"
        >
          {children}
        </ul>
        <p id={instructionsId} className="sr-only">
          Use the left and right arrow keys, Home or End to move through this carousel. Each card can be reached with Tab.
        </p>
        <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-[11px] leading-5 text-[#4b5b51]">{hint}</p>
          <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => page(-1)}
              disabled={edges.start}
              aria-controls={trackId}
              aria-label={`Show previous ${label}`}
              className="grid h-10 w-10 place-items-center rounded-full border border-[#cbdacb] bg-white text-[#14241b] shadow-sm transition hover:border-[#0b5c33] hover:bg-[#f3f8f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#cbdacb] disabled:hover:bg-white motion-reduce:transition-none"
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => page(1)}
              disabled={edges.end}
              aria-controls={trackId}
              aria-label={`Show next ${label}`}
              className="grid h-10 w-10 place-items-center rounded-full border border-[#cbdacb] bg-white text-[#14241b] shadow-sm transition hover:border-[#0b5c33] hover:bg-[#f3f8f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#cbdacb] disabled:hover:bg-white motion-reduce:transition-none"
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
