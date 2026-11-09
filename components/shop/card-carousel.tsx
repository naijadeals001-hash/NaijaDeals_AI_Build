"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Dense merchandising carousel: four cards across on phones, more per row as the
 * viewport grows. Arrows scroll the real track (not an indicator), the track
 * also swipes and snaps on touch, and each arrow disables at its boundary.
 *
 * A page of cards is one viewport width of cards plus the gap, so pressing next
 * advances by exactly the four visible cards rather than an arbitrary amount.
 */
export function CardCarousel({
  label,
  children,
  className = ""
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const trackRef = useRef<HTMLUListElement | null>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const node = trackRef.current;
    if (!node) return;
    const max = node.scrollWidth - node.clientWidth;
    setEdges({ start: node.scrollLeft <= 2, end: max <= 2 || node.scrollLeft >= max - 2 });
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
    const firstCard = node.firstElementChild as HTMLElement | null;
    const cardWidth = firstCard?.getBoundingClientRect().width ?? node.clientWidth / 4;
    const gap = Number.parseFloat(getComputedStyle(node).columnGap || "8") || 8;
    const usable = Math.max(1, Math.round(node.clientWidth / (cardWidth + gap)));
    node.scrollBy({ left: direction * usable * (cardWidth + gap), behavior: "smooth" });
  }, []);

  // Arrow keys move the carousel when focus is inside it.
  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      page(event.key === "ArrowRight" ? 1 : -1);
    }
  };

  return (
    <div className="relative">
      <ul
        ref={trackRef}
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={`flex snap-x snap-mandatory gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520] sm:gap-2 ${className}`}
      >
        {children}
      </ul>
      <div className="mt-1.5 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => page(-1)}
          disabled={edges.start}
          aria-label={`Scroll ${label} left`}
          className="grid h-7 w-7 place-items-center rounded-full border border-[#e3e6e6] bg-white text-[#0f1111] shadow-sm transition hover:border-[#005f4b] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => page(1)}
          disabled={edges.end}
          aria-label={`Scroll ${label} right`}
          className="grid h-7 w-7 place-items-center rounded-full border border-[#e3e6e6] bg-white text-[#0f1111] shadow-sm transition hover:border-[#005f4b] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520]"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
