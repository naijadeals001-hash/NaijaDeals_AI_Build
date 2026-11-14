import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { ArrowRight, FolderTree } from "lucide-react";
import { CategoryBrowse } from "@/components/shop/category-browse";
import type { PublicTaxonomyNode } from "@/lib/taxonomy-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop by category — NaijaShop",
  description: "Browse sellers across Africa by department, with demonstration inventory clearly labelled."
};

type TrailEntry = { id: string; name: string; slug: string };

/**
 * The grid itself is CategoryBrowse. This header only adds facts the grid
 * cannot know: the published hierarchy position and, when the category has no
 * live listings, an honest empty state with real alternative departments.
 * If the taxonomy or catalogue endpoints are unavailable the page renders
 * exactly as before rather than inventing a position or a count.
 */
async function internalBase() {
  const headerList = headers();
  const host = headerList.get("host");
  if (!host) return null;
  const forwarded = headerList.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwarded || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}`;
}

async function fetchInternal<T>(path: string): Promise<T | null> {
  const base = await internalBase();
  if (!base) return null;
  try {
    const response = await fetch(`${base}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500)
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function findTrail(
  nodes: PublicTaxonomyNode[],
  slug: string,
  trail: TrailEntry[] = []
): { node: PublicTaxonomyNode; trail: TrailEntry[] } | null {
  for (const node of nodes) {
    const nextTrail = [...trail, { id: node.id, name: node.name, slug: node.slug }];
    if (node.slug === slug) return { node, trail: nextTrail };
    const found = findTrail(node.children ?? [], slug, nextTrail);
    if (found) return found;
  }
  return null;
}

function alternativesFor(
  roots: PublicTaxonomyNode[],
  match: { node: PublicTaxonomyNode; trail: TrailEntry[] } | null,
  slug: string
): TrailEntry[] {
  const siblings =
    match && match.trail.length > 1
      ? (() => {
          const parentTrail = match.trail.slice(0, -1);
          const parentSlug = parentTrail[parentTrail.length - 1].slug;
          const parent = (function locate(nodes: PublicTaxonomyNode[]): PublicTaxonomyNode | null {
            for (const node of nodes) {
              if (node.slug === parentSlug) return node;
              const child = locate(node.children ?? []);
              if (child) return child;
            }
            return null;
          })(roots);
          return (parent?.children ?? []).map((node) => ({ id: node.id, name: node.name, slug: node.slug }));
        })()
      : [];
  const pool = siblings.length > 0 ? siblings : roots.map((node) => ({ id: node.id, name: node.name, slug: node.slug }));
  return pool.filter((entry) => entry.slug !== slug).slice(0, 6);
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  let slug = params.slug;
  try {
    slug = decodeURIComponent(params.slug);
  } catch {
    /* keep the raw segment */
  }

  const cookieStore = cookies();
  const country = (cookieStore.get("nd_country")?.value ?? "NG").toUpperCase().slice(0, 2);
  const city = (cookieStore.get("nd_city")?.value ?? "").toLowerCase().slice(0, 40);
  const taxonomyQuery = new URLSearchParams({ country, ...(city ? { city } : {}) }).toString();
  const taxonomy = await fetchInternal<{ departments?: PublicTaxonomyNode[] }>(`/api/taxonomy?${taxonomyQuery}`);
  const roots = Array.isArray(taxonomy?.departments) ? taxonomy.departments : [];
  const match = roots.length > 0 ? findTrail(roots, slug) : null;

  // The catalogue applies the category filter (including a parent's published
  // subtree once aggregation is enabled by the API). The page only reads the
  // total for honest context; CategoryBrowse renders those products once.
  const productQuery = new URLSearchParams({
    category: slug,
    country,
    page: "1",
    pageSize: "1"
  }).toString();
  const page = match ? await fetchInternal<{ total?: number }>(`/api/products?${productQuery}`) : null;
  const total = typeof page?.total === "number" ? page.total : null;
  const marketRestricted = match?.node.canPublish === false;
  const restrictionNote = match?.node.restrictionNote?.trim();
  const alternatives = alternativesFor(roots, match, slug);
  const children = match?.node.children ?? [];
  const isBranch = children.length > 0;

  return (
    <>
      {roots.length > 0 ? (
        <div className="bg-white px-3 pt-3 sm:px-5">
          <div className="rounded-xl border border-[#e3e6e6] bg-[#fbfcfb] px-3 py-2.5">
            <nav
              aria-label="Department hierarchy"
              className="flex max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 text-[11.5px] text-[#565959]"
            >
              <Link href="/naijashop" className="shrink-0 hover:text-[#c45500] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]">
                NaijaShop
              </Link>
              {match
                ? match.trail.map((entry) => (
                    <span key={entry.id} className="inline-flex min-w-0 flex-wrap items-center gap-1">
                      <span aria-hidden>›</span>
                      {entry.slug === slug ? (
                        <span className="min-w-0 break-words font-bold text-[#0f1111]" aria-current="page">
                          {entry.name}
                        </span>
                      ) : (
                        <Link
                          href={`/naijashop/c/${entry.slug}`}
                          className="min-w-0 break-words hover:text-[#c45500] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                        >
                          {entry.name}
                        </Link>
                      )}
                    </span>
                  ))
                : null}
            </nav>

            {!match ? (
              <div role="status" className="mt-2 flex flex-wrap items-start gap-2 rounded-lg border border-[#eadfc6] bg-[#fbf4e4] p-2.5 text-[11.5px] leading-5 text-[#7a4c00]">
                <FolderTree className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">
                  This department is not in the published directory. It may have been renamed, merged or deprecated.{" "}
                  <Link href="/naijashop/categories" className="font-bold underline">
                    Browse all departments
                  </Link>
                </span>
              </div>
            ) : isBranch ? (
              <div className="mt-2 rounded-lg border border-[#dbe7d8] bg-white p-3">
                <p className="break-words text-[12px] font-extrabold text-[#0f1111]">
                  {match.node.name}
                  <span className="ml-1.5 rounded-full bg-[#eef4ea] px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-[#0b5c33]">
                    Parent selection
                  </span>
                </p>
                <p className="mt-1 text-[11.5px] leading-5 text-[#565959]">
                  {marketRestricted
                    ? `${restrictionNote ?? "Publishing into this category is not approved for this market yet."} The catalogue does not show listings here until an explicit market rule is approved.`
                    : total === null
                      ? "The catalogue count could not be checked. The grid below loads the listings, or its own error state."
                      : total === 0
                        ? "No demonstration listings were returned for this branch as a whole yet. Its published subcategories may still contain demonstration listings."
                        : "Listings for this branch are returned by the catalogue and shown once in the grid below."}{" "}
                  {marketRestricted ? "" : "Each listing appears once; nothing is repeated from the subcategories."}
                </p>
                <p className="mt-2 text-[10.5px] font-bold uppercase tracking-wide text-[#565959]">
                  Published subcategories
                </p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {children.map((child) => (
                    <li key={child.id} className="min-w-0">
                      <Link
                        href={`/naijashop/c/${child.slug}`}
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#d5d9d9] bg-white px-2.5 py-1 text-[11px] font-bold text-[#0b5c33] hover:border-[#b9cbb4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                      >
                        <span className="min-w-0 break-words">{child.name}</span>
                        <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : total === 0 ? (
              <div className="mt-2 rounded-lg border border-dashed border-[#cfdccb] bg-white p-3">
                <p className="break-words text-[12px] font-extrabold text-[#0f1111]">
                  {marketRestricted
                    ? `${match.node.name} is not open for listings in ${country} yet.`
                    : `No demonstration listings in ${match.node.name} yet.`}
                </p>
                <p className="mt-1 text-[11.5px] leading-5 text-[#565959]">
                  {marketRestricted
                    ? `${restrictionNote ?? "Publishing into this category is not approved for this market yet."} An explicit market rule is required before listings appear.`
                    : "The category is published and open for listings, but no seller has published a demonstration listing here. Nothing is hidden and no listing is invented."}
                </p>
                {alternatives.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#565959]">Try instead</p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {alternatives.map((entry) => (
                        <li key={entry.id} className="min-w-0">
                          <Link
                            href={`/naijashop/c/${entry.slug}`}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#d5d9d9] bg-white px-2.5 py-1 text-[11px] font-bold text-[#0b5c33] hover:border-[#b9cbb4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
                          >
                            <span className="min-w-0 break-words">{entry.name}</span>
                            <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {marketRestricted ? null : (
                  <p className="mt-2 text-[11px] text-[#565959]">
                    Sell this kind of product?{" "}
                    <Link href="/sell" className="font-bold text-[#0b5c33] underline">
                      Open a seller account
                    </Link>
                    .
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <CategoryBrowse categorySlug={params.slug} />
    </>
  );
}
