"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Horizontal rail with prev/next buttons, matching the hero carousel's
 * interaction. Native touch/trackpad scrolling still works; the arrows are an
 * additional, keyboard-reachable way to move, and disable at each end so they
 * never suggest content that isn't there.
 */
export function ScrollRail({
  children,
  label,
  className = ""
}: {
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLUListElement | null>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const node = trackRef.current;
    if (!node) return;
    // Trailing padding leaves scrollLeft at a small non-zero origin at the
    // start, so compare against the real scrollable range, not against zero.
    const max = node.scrollWidth - node.clientWidth;
    const origin = Number.parseFloat(getComputedStyle(node).paddingLeft) || 0;
    setEdges({ start: node.scrollLeft <= origin + 2, end: max <= 2 || node.scrollLeft >= max - 2 });
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

  function scrollByPage(direction: -1 | 1) {
    const node = trackRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.max(200, node.clientWidth * 0.8), behavior: "smooth" });
  }

  return (
    <div className="relative">
      <ul
        ref={trackRef}
        aria-label={label}
        className={`${className} scroll-px-3 px-3`}
        style={{ scrollSnapType: "x proximity" }}
      >
        {children}
      </ul>
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => scrollByPage(-1)}
          disabled={edges.start}
          aria-label={`Scroll ${label} left`}
          className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:border-emerald-400/60 hover:text-white disabled:opacity-30 disabled:hover:border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => scrollByPage(1)}
          disabled={edges.end}
          aria-label={`Scroll ${label} right`}
          className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:border-emerald-400/60 hover:text-white disabled:opacity-30 disabled:hover:border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99520]"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
