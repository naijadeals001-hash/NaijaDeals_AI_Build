"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type EdgeState = { start: boolean; end: boolean };

/**
 * A contained, non-rotating card rail.
 *
 * - Native horizontal scrolling gives touch swipe and momentum without a
 *   custom drag implementation.
 * - Arrows are rendered only when the track genuinely overflows. A rail whose
 *   cards all fit shows no arrows at all, rather than two permanently disabled
 *   controls.
 * - When arrows exist they page by the number of cards actually visible and
 *   expose `aria-disabled` at each boundary while remaining focusable, so focus
 *   is never dropped when the boundary changes.
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
  // Start with no overflow and no arrows so SSR and hydration agree, then
  // measure the real track. An arrow before measurement would be a false
  // affordance.
  const [edges, setEdges] = useState<EdgeState>({ start: true, end: true });
  const [overflowing, setOverflowing] = useState(false);

  const measure = useCallback(() => {
    const node = trackRef.current;
    if (!node) return;
    const max = Math.max(0, node.scrollWidth - node.clientWidth);
    const position = Math.abs(node.scrollLeft);
    const next = { start: position <= 2, end: max <= 2 || position >= max - 2 };
    // Scroll fires every frame; only a real boundary change should re-render.
    setEdges((previous) => (previous.start === next.start && previous.end === next.end ? previous : next));
    const nextOverflowing = max > 2;
    setOverflowing((previous) => (previous === nextOverflowing ? previous : nextOverflowing));
  }, []);

  useEffect(() => {
    const node = trackRef.current;
    if (!node) return;
    measure();
    node.addEventListener("scroll", measure, { passive: true });
    // The track box keeps its width when cards are added or removed, so watch
    // the child list as well; otherwise the arrows would keep a stale boundary.
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(node);
    const contentObserver = new MutationObserver(measure);
    contentObserver.observe(node, { childList: true });
    return () => {
      node.removeEventListener("scroll", measure);
      resizeObserver.disconnect();
      contentObserver.disconnect();
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
      <div role="region" aria-roledescription="carousel" aria-label={label} data-plus-carousel className="min-w-0 max-w-full">
        <ul
          id={trackId}
          ref={trackRef}
          tabIndex={0}
          aria-label={label}
          aria-describedby={instructionsId}
          onKeyDown={onKeyDown}
          data-plus-carousel-track
          className="flex w-full min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 [&::-webkit-scrollbar]:hidden"
        >
          {children}
        </ul>
        <p id={instructionsId} className="sr-only">
          Use the left and right arrow keys, Home or End to move through this carousel when it has more cards than fit. Each card
          can be reached with Tab.
        </p>
        <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-[11px] leading-5 text-[#4b5b51]">{hint}</p>
          {overflowing ? (
          <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto" data-plus-carousel-controls>
            <button
              type="button"
              onClick={() => {
                if (!edges.start) page(-1);
              }}
              aria-disabled={edges.start}
              data-plus-carousel-arrow="prev"
              aria-controls={trackId}
              aria-label={`Show previous ${label}`}
              className="grid h-10 w-10 place-items-center rounded-full border border-[#cbdacb] bg-white text-[#14241b] shadow-sm transition hover:border-[#0b5c33] hover:bg-[#f3f8f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:border-[#cbdacb] aria-disabled:hover:bg-white motion-reduce:transition-none"
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!edges.end) page(1);
              }}
              aria-disabled={edges.end}
              data-plus-carousel-arrow="next"
              aria-controls={trackId}
              aria-label={`Show next ${label}`}
              className="grid h-10 w-10 place-items-center rounded-full border border-[#cbdacb] bg-white text-[#14241b] shadow-sm transition hover:border-[#0b5c33] hover:bg-[#f3f8f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:border-[#cbdacb] aria-disabled:hover:bg-white motion-reduce:transition-none"
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </button>
          </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
