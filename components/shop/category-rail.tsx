"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, LayoutGrid } from "lucide-react";
import type { PublicCategoryLevel, PublicTaxonomyNode } from "@/lib/taxonomy-api";

/**
 * Shared catalogue helpers for the storefront category rail and the full
 * category directory.
 *
 * The rail and the directory must describe exactly the same set of categories,
 * so both derive it here from the effective public taxonomy response:
 *   - level 0 = department (grouping only, never a category card)
 *   - level 1 = category (the complete rail/directory set)
 *   - level 2 = leaf (reachable through its category, never a card)
 *
 * `/api/taxonomy/categories` returns the active, reachable, browsing-visible
 * level-1 categories in the selected market's merchandising order, with
 * imagery, effective country publication state and server-computed
 * direct/subtree listing counts. We never invent a category, a count or an
 * image: a node without a server count stays `null` and says so. Browsing and
 * publishing are separate: a browsing-visible category with
 * `canPublish:false` remains in the rail with its restriction notice and a
 * zero count, while `browsingVisible:false` stays out of browsing.
 */

/**
 * Acceptance suites create throwaway listings named "Variant Fixture …",
 * "Test checkout …" and similar. They are real database rows but never part of
 * the storefront. The taxonomy count already excludes them; this rule keeps the
 * same visibility for product shelves.
 */
const FIXTURE_LISTING = /^(variant fixture|test |upload test|last unit|product test)\b|-mw[0-9a-z]{8,}$/i;

export type CategoryListingLike = {
  name: string;
  slug?: string | null;
  isSample?: boolean;
  category?: { slug?: string | null } | null;
};

/** Same visibility rule the storefront applies to every public shelf. */
export function isStorefrontListing(product: CategoryListingLike): boolean {
  if (product.isSample) return false;
  return !FIXTURE_LISTING.test(product.name) && !FIXTURE_LISTING.test(product.slug ?? "");
}

export type CategoryRailEntry = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  imageAlt: string | null;
  isSelectable: boolean;
  /** `null` means the taxonomy did not supply a count; never rendered as zero. */
  count: number | null;
  /** Browsing does not imply publishing in the selected market. */
  canPublish: boolean;
  restrictionNote: string | null;
};

function finiteCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/**
 * Map one taxonomy node to a rail entry.
 *
 * Eligibility is the taxonomy's own contract, not a local category list:
 *   - only level 1 (category); roots/leaves are excluded
 *   - `browsingVisible === false` stays out of browsing lists
 *   - `canPublish === false` stays browsable with a restriction notice and a
 *     zero listing count; it never becomes publishable from this projection
 *
 * Counts are the server's subtree product counts, which exclude fixtures,
 * non-public products and publish-restricted branches. A response without a
 * count stays `null` and is rendered as unavailable, never as zero.
 */
export function categoryRailEntry(node: PublicTaxonomyNode | PublicCategoryLevel): CategoryRailEntry | null {
  if (!node || !node.id || !node.slug || !node.name) return null;
  if (typeof node.level === "number" && node.level !== 1) return null;
  if (node.browsingVisible === false) return null;
  return {
    id: node.id,
    name: node.name,
    slug: node.slug,
    imageUrl: node.imageUrl ?? null,
    imageAlt: node.imageAlt ?? null,
    isSelectable: node.isSelectable !== false,
    count: finiteCount(node.subtreeProductCount) ?? finiteCount(node.productCount),
    canPublish: node.canPublish !== false,
    restrictionNote: typeof node.restrictionNote === "string" ? node.restrictionNote : null
  };
}

/** Map the `/api/taxonomy/categories` projection in the server's order. */
export function categoryRailEntries(categories: PublicCategoryLevel[]): CategoryRailEntry[] {
  const entries: CategoryRailEntry[] = [];
  const seen = new Set<string>();
  for (const node of categories ?? []) {
    const entry = categoryRailEntry(node);
    if (!entry || seen.has(entry.slug)) continue;
    seen.add(entry.slug);
    entries.push(entry);
  }
  return entries;
}

/**
 * Flatten eligible level-1 categories from the full published tree. Kept for
 * tree-based consumers; the storefront and directory use the dedicated
 * `/api/taxonomy/categories` projection.
 */
export function deriveCategoryRail(departments: PublicTaxonomyNode[]): CategoryRailEntry[] {
  const entries: CategoryRailEntry[] = [];
  const seen = new Set<string>();
  for (const department of departments ?? []) {
    for (const node of department.children ?? []) {
      const entry = categoryRailEntry(node);
      if (!entry || seen.has(entry.slug)) continue;
      seen.add(entry.slug);
      entries.push(entry);
    }
  }
  return entries;
}

export type CountsStatus = "loading" | "ready" | "error";

/** Honest listing count copy. A missing taxonomy count is never reported as zero. */
export function categoryCountLabel(
  entry: Pick<CategoryRailEntry, "count" | "canPublish" | "restrictionNote">,
  countsStatus: CountsStatus
): string {
  if (!entry.canPublish) return "Not open in this market";
  if (entry.count !== null) {
    if (entry.count === 0) return "No listings yet";
    return `${entry.count} ${entry.count === 1 ? "listing" : "listings"}`;
  }
  return countsStatus === "loading" ? "Counting listings…" : "Listing count unavailable";
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    apply();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", apply);
      return () => query.removeEventListener("change", apply);
    }
    query.addListener(apply);
    return () => query.removeListener(apply);
  }, []);
  return reduced;
}

const CARD_QUERY = "[data-category-card]";

/**
 * Compact "Shop by category" carousel.
 *
 * Native horizontal scrolling gives touch swiping and trackpad scrolling for
 * free; the controls and keyboard handler move it one card at a time. The
 * controls use `aria-disabled` instead of `disabled` so focus is never lost at a
 * boundary. There is no auto-rotation, and reduced-motion users get instant
 * jumps with no image zoom transition.
 */
export function CategoryRail({
  entries,
  countsStatus,
  summary,
  headingId = "category-shortcuts-heading",
  directoryHref = "/naijashop/categories"
}: {
  entries: CategoryRailEntry[];
  countsStatus: CountsStatus;
  /** Listing-level context shown under the heading; no live-stock claims. */
  summary: string;
  headingId?: string;
  directoryHref?: string;
}) {
  const trackId = useId();
  const trackRef = useRef<HTMLUListElement | null>(null);
  const [bounds, setBounds] = useState({ start: true, end: true });
  const [brokenArt, setBrokenArt] = useState<Record<string, boolean>>({});
  const reducedMotion = usePrefersReducedMotion();

  // The final scroll position is the true maximum, not the last card's snap
  // point. A card that starts beyond the maximum still becomes fully visible at
  // `max`; gating Next on a previous snap point left the last card unreachable
  // with the arrow controls.
  const updateBounds = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    const start = track.scrollLeft <= 2;
    const end = max <= 2 || track.scrollLeft >= max - 3;
    setBounds((current) => (current.start === start && current.end === end ? current : { start, end }));
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    updateBounds();
    const observer = new ResizeObserver(() => updateBounds());
    observer.observe(track);
    return () => observer.disconnect();
  }, [updateBounds, entries.length]);

  const behavior = useCallback((): ScrollBehavior => (reducedMotion ? "auto" : "smooth"), [reducedMotion]);

  const step = useCallback((direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>(CARD_QUERY);
    const styles = window.getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
    const distance = (card?.getBoundingClientRect().width ?? 160) + gap;
    const max = track.scrollWidth - track.clientWidth;
    const target = Math.min(Math.max(track.scrollLeft + direction * distance, 0), Math.max(max, 0));
    track.scrollTo({ left: target, behavior: behavior() });
  }, [behavior]);

  const toEdge = useCallback((edge: "start" | "end") => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({
      left: edge === "start" ? 0 : Math.max(track.scrollWidth - track.clientWidth, 0),
      behavior: behavior()
    });
  }, [behavior]);

  function onTrackKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    if (key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (key === "Home" || key === "End") {
      event.preventDefault();
      toEdge(key === "Home" ? "start" : "end");
    }
  }

  const sectionCountsStatus =
    entries.length === 0
      ? "empty"
      : entries.every((entry) => entry.count !== null)
        ? "ready"
        : countsStatus === "loading"
          ? "loading"
          : "unavailable";
  const categoryLabel = `${entries.length} ${entries.length === 1 ? "category" : "categories"}`;

  return (
    <section aria-labelledby={headingId} data-category-rail-section data-counts-status={sectionCountsStatus} className="mt-4 min-w-0 max-w-full">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 id={headingId} className="font-display text-[19px] font-extrabold tracking-tight text-[#14241b] sm:text-[21px]">
            Shop by category
          </h2>
          <p className="mt-0.5 max-w-2xl text-[10.5px] leading-5 text-[#566359]">
            <span className="font-bold text-[#3d4d43]">{categoryLabel}</span>
            {summary ? <span> · {summary}</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={directoryHref}
            className="inline-flex min-h-10 items-center gap-1 rounded-full px-1.5 text-[11px] font-extrabold text-[#0b5c33] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4f7f2]"
          >
            View all categories
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Show earlier categories"
              aria-controls={trackId}
              aria-disabled={bounds.start}
              data-rail-prev
              data-disabled={bounds.start ? "true" : "false"}
              onClick={() => {
                if (!bounds.start) step(-1);
              }}
              className={`grid h-10 w-10 place-items-center rounded-full border border-[#dfe8dc] bg-white text-[#0b5c33] shadow-[0_2px_8px_rgba(7,53,31,0.06)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4f7f2] ${
                bounds.start ? "cursor-not-allowed opacity-40" : "hover:border-[#b9cbb4] hover:bg-[#eef5eb]"
              }`}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Show later categories"
              aria-controls={trackId}
              aria-disabled={bounds.end}
              data-rail-next
              data-disabled={bounds.end ? "true" : "false"}
              onClick={() => {
                if (!bounds.end) step(1);
              }}
              className={`grid h-10 w-10 place-items-center rounded-full border border-[#dfe8dc] bg-white text-[#0b5c33] shadow-[0_2px_8px_rgba(7,53,31,0.06)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4f7f2] ${
                bounds.end ? "cursor-not-allowed opacity-40" : "hover:border-[#b9cbb4] hover:bg-[#eef5eb]"
              }`}
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <p role="status" className="mt-2.5 rounded-xl border border-[#eadfc6] bg-[#fbf4e4] px-3 py-2 text-[11px] leading-5 text-[#7a4c00]">
          No published categories are available right now. The catalogue and All departments remain available.
        </p>
      ) : (
        <ul
          id={trackId}
          ref={trackRef}
          tabIndex={0}
          aria-label="Shop by category cards"
          data-category-rail
          data-reduced-motion={reducedMotion ? "true" : "false"}
          onScroll={updateBounds}
          onKeyDown={onTrackKeyDown}
          className="mt-2.5 flex max-w-full snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain scroll-smooth pb-1.5 pt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4f7f2] motion-reduce:scroll-auto"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {entries.map((entry) => {
            const countLabel = categoryCountLabel(entry, countsStatus);
            const showImage = Boolean(entry.imageUrl) && !brokenArt[entry.imageUrl as string];
            return (
              <li
                key={entry.id}
                data-category-card
                data-category-slug={entry.slug}
                data-category-count={entry.count === null ? "" : String(entry.count)}
                data-category-selectable={entry.isSelectable ? "true" : "false"}
                data-category-restricted={entry.canPublish ? "false" : "true"}
                className="w-[132px] shrink-0 snap-start sm:w-[150px] lg:w-[164px]"
              >
                <Link
                  href={`/naijashop/c/${entry.slug}`}
                  aria-label={`${entry.name} — ${countLabel}${
                    !entry.canPublish && entry.restrictionNote ? `. ${entry.restrictionNote}` : ""
                  }`}
                  title={!entry.canPublish ? entry.restrictionNote ?? "Not open for listings in this market." : undefined}
                  className="group flex h-full min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-[#e1e8de] bg-white p-2 text-center transition hover:-translate-y-0.5 hover:border-[#c7d7c2] hover:shadow-[0_10px_22px_rgba(7,53,31,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
                >
                  <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#eef4ea] sm:h-16 sm:w-16">
                    {showImage ? (
                      <img
                        src={entry.imageUrl as string}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={() => {
                          const url = entry.imageUrl as string;
                          setBrokenArt((current) => (current[url] ? current : { ...current, [url]: true }));
                        }}
                        className="h-full w-full object-contain transition duration-300 group-hover:scale-105 motion-reduce:transition-none"
                      />
                    ) : (
                      <LayoutGrid className="h-5 w-5 text-[#7a9c80]" aria-hidden />
                    )}
                  </span>
                  <span className="line-clamp-2 min-h-[2.2em] break-words text-[10.5px] font-extrabold leading-[1.15] text-[#14241b] sm:text-[11px]">
                    {entry.name}
                  </span>
                  <span
                    className={`text-[9.5px] font-semibold leading-tight ${
                      !entry.canPublish || entry.count === 0 ? "text-[#7a4c00]" : "text-[#566359]"
                    }`}
                  >
                    {countLabel}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
