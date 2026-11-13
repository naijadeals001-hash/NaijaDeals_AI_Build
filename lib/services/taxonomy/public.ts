import { prisma } from "@/lib/prisma";
import { sortCategoryRows } from "./shared";

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
  isSelectable: boolean;
  showOnHomepage: boolean;
  sortOrder: number;
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
      isSelectable: true,
      showOnHomepage: true,
      sortOrder: true
    }
  });

  const byId = new Map(rows.map((row) => [row.id, row]));
  const childrenByParent = new Map<string, PublicCategoryRow[]>();
  for (const row of rows) {
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

  const roots = sortCategoryRows(rows.filter((row) => !row.parentId));
  return { departments: roots.map((root) => toNode(root, 0)) };
}
