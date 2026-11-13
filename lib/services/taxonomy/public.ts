import { prisma } from "@/lib/prisma";
import { isReachable, sortCategoryRows } from "./shared";

/** Acceptance-suite rows are database categories, never public departments. */
const CATEGORY_FIXTURE = /^(refund cat|test category|fixture category)\b|^ri-cat-/i;

export type PublicTaxonomyNode = {
  id: string;
  key: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  isSelectable: boolean;
  showOnHomepage: boolean;
  children: PublicTaxonomyNode[];
};

type PublicCategoryRow = {
  id: string;
  key: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  parentId: string | null;
  level: number;
  isActive: boolean;
  isSelectable: boolean;
  showOnHomepage: boolean;
  sortOrder: number;
  deprecatedAt: Date | null;
};

/**
 * Public department tree.
 *
 * Only active, non-deprecated rows are loaded and only nodes reachable from a
 * real root are returned. A selectable department with no products still
 * appears: the storefront shows an honest empty state instead of pretending
 * the category does not exist.
 */
export async function getPublicTaxonomy(): Promise<{ departments: PublicTaxonomyNode[] }> {
  const rows = await prisma.category.findMany({
    where: { isActive: true, deprecatedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      key: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      imageAlt: true,
      parentId: true,
      level: true,
      isActive: true,
      isSelectable: true,
      showOnHomepage: true,
      sortOrder: true,
      deprecatedAt: true
    }
  });

  // Fixture-named rows are treated as unavailable when walking ancestors so an
  // active child of an acceptance fixture cannot appear in public navigation.
  const reachabilityById = new Map(
    rows.map((row) => [
      row.id,
      {
        ...row,
        isActive: row.isActive && !CATEGORY_FIXTURE.test(row.name) && !CATEGORY_FIXTURE.test(row.slug)
      }
    ])
  );
  const visibleRows = rows.filter(
    (row) =>
      !CATEGORY_FIXTURE.test(row.name) &&
      !CATEGORY_FIXTURE.test(row.slug) &&
      isReachable(row, reachabilityById)
  );

  const byId = new Map(visibleRows.map((row) => [row.id, row]));
  const childrenByParent = new Map<string, PublicCategoryRow[]>();
  for (const row of visibleRows) {
    if (!row.parentId || !byId.has(row.parentId)) continue;
    const list = childrenByParent.get(row.parentId) ?? [];
    list.push(row);
    childrenByParent.set(row.parentId, list);
  }

  const toNode = (row: PublicCategoryRow, depth: number): PublicTaxonomyNode => {
    const children =
      depth >= 2
        ? []
        : sortCategoryRows(childrenByParent.get(row.id) ?? []).map((child) => toNode(child, depth + 1));
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      slug: row.slug,
      description: row.description,
      imageUrl: row.imageUrl,
      imageAlt: row.imageAlt,
      isSelectable: row.isSelectable,
      showOnHomepage: row.showOnHomepage,
      children
    };
  };

  const roots = sortCategoryRows(visibleRows.filter((row) => !row.parentId));
  return { departments: roots.map((root) => toNode(root, 0)) };
}
