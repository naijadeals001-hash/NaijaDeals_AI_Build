"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, LayoutGrid, RefreshCw } from "lucide-react";
import { getPublicLevelOneCategories, taxonomyErrorMessage, type PublicCategoryLevel } from "@/lib/taxonomy-api";
import { useLocale } from "@/lib/i18n/locale-provider";
import { categoryCountLabel, categoryRailEntry, type CategoryRailEntry } from "./category-rail";

/**
 * Full category directory.
 *
 * Lists exactly the same eligible level-1 categories as the storefront rail,
 * grouped by their published department for orientation. Level 0 departments
 * are group headings only and level 2 leaves are reached through their
 * category, so the expandable hierarchy continues to live in All departments.
 *
 * Nothing here is fixed: categories, order, images, names and counts come from
 * `/api/taxonomy`. `browsingVisible=false` stays out. A browsing-visible
 * category with `canPublish=false` remains listed with its restriction notice
 * and a zero count; browsing does not grant publishing permission. Counts are
 * server-computed subtree counts; a missing count is shown as unavailable,
 * never as zero and never as a live-stock claim.
 */
export function CategoryDirectory() {
  const { country, city } = useLocale();
  const [categories, setCategories] = useState<PublicCategoryLevel[]>([]);
  const [taxonomyStatus, setTaxonomyStatus] = useState<"loading" | "ready" | "error">("loading");
  const [taxonomyError, setTaxonomyError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [brokenArt, setBrokenArt] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const controller = new AbortController();
    setTaxonomyStatus("loading");
    setTaxonomyError("");

    getPublicLevelOneCategories({ country, city, signal: controller.signal })
      .then(({ categories: rows }) => {
        if (controller.signal.aborted) return;
        setCategories(Array.isArray(rows) ? rows : []);
        setTaxonomyStatus("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setTaxonomyError(
          taxonomyErrorMessage(error, {
            missingEndpoint: "The published category directory is not enabled on this build."
          })
        );
        setTaxonomyStatus("error");
      });

    return () => controller.abort();
  }, [attempt, country, city]);

  const groups = useMemo(() => {
    const byParent = new Map<string, { id: string; name: string; entries: CategoryRailEntry[] }>();
    for (const node of categories) {
      const entry = categoryRailEntry(node);
      if (!entry) continue;
      const id = node.parentId ?? "unassigned";
      const group =
        byParent.get(id) ??
        ({
          id,
          name: node.parentName ?? "Other categories",
          entries: []
        } satisfies { id: string; name: string; entries: CategoryRailEntry[] });
      group.entries.push(entry);
      byParent.set(id, group);
    }
    return [...byParent.values()];
  }, [categories]);

  const allEntries = useMemo<CategoryRailEntry[]>(() => groups.flatMap((group) => group.entries), [groups]);
  const countsMissing = allEntries.some((entry) => entry.count === null);
  const withListings = allEntries.filter((entry) => (entry.count ?? 0) > 0).length;
  const restricted = allEntries.filter((entry) => !entry.canPublish).length;
  const restrictedNote =
    restricted > 0
      ? ` ${restricted} ${restricted === 1 ? "category is" : "categories are"} browsing-visible but not open for listings in this market.`
      : "";

  const summary =
    allEntries.length === 0
      ? ""
      : countsMissing
        ? `${allEntries.length} ${allEntries.length === 1 ? "category" : "categories"} across ${groups.length} ${
            groups.length === 1 ? "department" : "departments"
          }. Some server listing counts are unavailable; no zero counts are inferred.${restrictedNote}`
        : `${allEntries.length} ${allEntries.length === 1 ? "category" : "categories"} across ${groups.length} ${
            groups.length === 1 ? "department" : "departments"
          }. ${
            allEntries.every((entry) => entry.count === 0)
              ? "No published listings yet."
              : `${withListings} have published listings; counts reflect the published catalogue, including labelled demonstration inventory where present.`
          }${restrictedNote}`;

  const directoryCountsStatus = taxonomyStatus !== "ready" ? taxonomyStatus : countsMissing ? "unavailable" : "ready";

  return (
    <div className="w-full max-w-full bg-[#f4f7f2] text-[#14241b]">
      <div className="mx-auto w-full max-w-[1440px] px-3 pb-12 pt-4 sm:px-6 lg:px-8">
        <header className="rounded-[24px] border border-[#e1e8de] bg-white px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-[#0f7a4a]">Full category directory</p>
              <h1 className="mt-1 font-display text-[26px] font-extrabold leading-tight tracking-tight text-[#14241b] sm:text-[32px]">
                All categories
              </h1>
              <p className="mt-1.5 max-w-2xl text-[11.5px] leading-5 text-[#566359]">
                Every category visible in browsing for your selected market, with the number of published listings in it
                and its subcategories. The full department → category → subcategory tree stays in <strong>All departments</strong>.
              </p>
            </div>
            <Link
              href="/naijashop/search"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#b9cbb4] px-3.5 text-[11px] font-extrabold text-[#0b5c33] transition hover:bg-[#eef5eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
            >
              Browse every listing
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          {summary ? (
            <p data-directory-summary className="mt-2.5 text-[10.5px] leading-5 text-[#566359]">
              {summary}
            </p>
          ) : null}
        </header>

        {taxonomyStatus === "loading" ? (
          <section aria-busy="true" aria-label="Loading the category directory" className="mt-5">
            <p className="sr-only">Loading the published category directory…</p>
            <div className="h-4 w-48 animate-pulse rounded-full bg-[#e3ebdf]" />
            <ul className="mt-3 grid grid-cols-1 gap-2 min-[430px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <li key={index} className="flex items-center gap-2.5 rounded-2xl border border-[#e1e8de] bg-white p-2.5" aria-hidden>
                  <span className="h-11 w-11 animate-pulse rounded-xl bg-[#eef3ec]" />
                  <span className="min-w-0 flex-1 space-y-1.5">
                    <span className="block h-3 w-3/4 animate-pulse rounded-full bg-[#eef3ec]" />
                    <span className="block h-2.5 w-1/3 animate-pulse rounded-full bg-[#eef3ec]" />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {taxonomyStatus === "error" ? (
          <div role="alert" className="mt-5 rounded-3xl border border-[#f0c8c2] bg-[#fdf2f0] p-5">
            <AlertCircle className="h-6 w-6 text-[#b42318]" aria-hidden />
            <h2 className="mt-2 font-display text-[20px] font-extrabold text-[#7a1c12]">The category directory could not be loaded</h2>
            <p className="mt-1 max-w-2xl text-[11.5px] leading-5 text-[#8a1c14]">
              {taxonomyError || "The published taxonomy is unavailable right now."} Nothing is shown in its place so the
              directory never looks emptier than it is.
            </p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-[#7a1c12] px-4 text-[11.5px] font-extrabold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7a1c12] focus-visible:ring-offset-2"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Try again
            </button>
          </div>
        ) : null}

        {taxonomyStatus === "ready" && allEntries.length === 0 ? (
          <div role="status" className="mt-5 rounded-3xl border border-[#dfe8dc] bg-white px-5 py-8 text-center">
            <LayoutGrid className="mx-auto h-7 w-7 text-[#7a9c80]" aria-hidden />
            <h2 className="mt-2 font-display text-[20px] font-extrabold text-[#14241b]">No published categories yet</h2>
            <p className="mx-auto mt-1 max-w-xl text-[11.5px] leading-5 text-[#566359]">
              The directory is empty because the public taxonomy returned no eligible categories. Categories appear here as
              soon as the Control Center publishes them.
            </p>
          </div>
        ) : null}

        {taxonomyStatus === "ready" && countsMissing && groups.length > 0 ? (
          <p role="status" className="mt-4 rounded-xl border border-[#eadfc6] bg-[#fbf4e4] px-3 py-2 text-[11px] leading-5 text-[#7a4c00]">
            The taxonomy response did not include listing counts, so the categories are listed without counts. This is not a
            zero-listing result.
          </p>
        ) : null}

        {taxonomyStatus === "ready" && groups.length > 0 ? (
          <div data-category-directory data-counts-status={directoryCountsStatus} className="mt-6 space-y-7">
            {groups.map(({ id, name, entries }) => (
              <section key={id} aria-labelledby={`directory-dept-${id}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <h2
                    id={`directory-dept-${id}`}
                    className="font-display text-[16px] font-extrabold tracking-tight text-[#14241b] sm:text-[18px]"
                  >
                    {name}
                  </h2>
                  <p className="text-[10px] font-semibold text-[#566359]">
                    {entries.length} {entries.length === 1 ? "category" : "categories"}
                  </p>
                </div>
                <ul className="mt-2 grid grid-cols-1 gap-2 min-[430px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {entries.map((entry) => {
                    const countLabel = categoryCountLabel(entry, "ready");
                    const showImage = Boolean(entry.imageUrl) && !brokenArt[entry.imageUrl as string];
                    return (
                      <li key={entry.id} className="min-w-0">
                        <Link
                          href={`/naijashop/c/${entry.slug}`}
                          aria-label={`${entry.name} — ${countLabel}${
                            !entry.canPublish && entry.restrictionNote ? `. ${entry.restrictionNote}` : ""
                          }`}
                          title={!entry.canPublish ? entry.restrictionNote ?? "Not open for listings in this market." : undefined}
                          data-category-directory-card
                          data-category-slug={entry.slug}
                          data-category-count={entry.count === null ? "" : String(entry.count)}
                          data-category-restricted={entry.canPublish ? "false" : "true"}
                          className="group flex h-full min-w-0 items-center gap-2.5 rounded-2xl border border-[#e1e8de] bg-white p-2.5 transition hover:border-[#c7d7c2] hover:shadow-[0_10px_22px_rgba(7,53,31,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
                        >
                          <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#eef4ea]">
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
                              <LayoutGrid className="h-4 w-4 text-[#7a9c80]" aria-hidden />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 break-words text-[11px] font-extrabold leading-[1.2] text-[#14241b]">
                              {entry.name}
                            </span>
                            <span
                              className={`mt-0.5 block text-[9.5px] font-semibold leading-tight ${
                                !entry.canPublish || entry.count === 0 ? "text-[#7a4c00]" : "text-[#566359]"
                              }`}
                            >
                              {countLabel}
                            </span>
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#7a9c80] transition group-hover:text-[#0b5c33]" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
