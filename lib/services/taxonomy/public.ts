import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { COUNTRY_CODE_PATTERN, effectivePublishRule, isReachable, sortCategoryRows } from "./shared";

/** Acceptance-suite rows are database categories, never public departments. */
const CATEGORY_FIXTURE = /^(refund cat|test category|fixture category)\b|^ri-cat-/i;

/**
 * Acceptance-suite listings are real rows but never public products. The
 * patterns match the catalogue's visibility filter so a taxonomy count can
 * never include a listing the storefront itself hides.
 */
const PRODUCT_FIXTURE =
  /^(variant fixture|test |upload test|last unit|product test|refund product|refund vendor)\b|-mw[0-9a-z]{8,}$|^ri-(prod|vendor)-/i;

/** Public browsing defaults to the catalogue's home market when none is named. */
export const DEFAULT_TAXONOMY_COUNTRY = "NG";

export type PublicTaxonomyNode = {
  id: string;
  key: string | null;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  level: number;
  sortOrder: number;
  isSelectable: boolean;
  showOnHomepage: boolean;
  /**
   * Browsing rail/directory visibility. A node with browsingVisible=false is
   * still published (present here) but hidden from browsing lists such as
   * `/api/taxonomy/categories`.
   */
  browsingVisible: boolean;
  /** Whether sellers in the requested country may publish into this node. */
  canPublish: boolean;
  /** Why publishing is restricted, or null when the node is publishable. */
  restrictionNote: string | null;
  /** Distinct public products attached directly to this node. */
  productCount: number;
  /** Distinct public products in this node and every live descendant. */
  subtreeProductCount: number;
  children: PublicTaxonomyNode[];
};

export type PublicCategoryLevelNode = Omit<PublicTaxonomyNode, "children">;

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
  browsingVisible: boolean;
  sortOrder: number;
  deprecatedAt: Date | null;
};

function normaliseCountry(value: string | null | undefined): string {
  if (value === undefined || value === null || value === "") return DEFAULT_TAXONOMY_COUNTRY;
  const country = value.trim().toUpperCase();
  if (!COUNTRY_CODE_PATTERN.test(country)) {
    throw new ApiError(400, "invalid_country", "country must be a two-letter ISO country code.");
  }
  return country;
}

type LoadedTaxonomy = {
  countryCode: string;
  visibleRows: PublicCategoryRow[];
  childrenByParent: Map<string, PublicCategoryRow[]>;
  roots: PublicCategoryRow[];
  /** Every visible node's effective country publication state. */
  publishState: Map<string, { canPublish: boolean; restrictionNote: string | null }>;
  /** Distinct public product ids attached to each eligible category. */
  productIdsByCategory: Map<string, Set<string>>;
};

/**
 * Loads the published tree and everything needed for its counts once.
 *
 * Only active, non-deprecated rows whose complete ancestor chain is live are
 * visible. A selectable department with no products still appears: the
 * storefront shows an honest empty state instead of pretending the category
 * does not exist. Country rules never remove a node from this publication
 * tree; they only set `canPublish` and exclude its products from counts.
 */
async function loadTaxonomy(countryInput: string | null | undefined): Promise<LoadedTaxonomy> {
  const countryCode = normaliseCountry(countryInput);
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
      browsingVisible: true,
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
  const visibleById = new Map(visibleRows.map((row) => [row.id, row]));

  const childrenByParent = new Map<string, PublicCategoryRow[]>();
  for (const row of visibleRows) {
    if (!row.parentId || !visibleById.has(row.parentId)) continue;
    const list = childrenByParent.get(row.parentId) ?? [];
    list.push(row);
    childrenByParent.set(row.parentId, list);
  }
  for (const [parentId, children] of childrenByParent) {
    childrenByParent.set(parentId, sortCategoryRows(children));
  }

  const [rules, products] = await Promise.all([
    prisma.categoryCountryRule.findMany({
      where: { countryCode },
      select: { categoryId: true, countryCode: true, canPublish: true, note: true }
    }),
    prisma.product.findMany({
      where: {
        status: "ACTIVE",
        isSample: false,
        countryCode,
        categoryId: { in: visibleRows.filter((row) => row.isSelectable).map((row) => row.id) },
        vendor: { status: "VERIFIED" }
      },
      select: { id: true, name: true, slug: true, categoryId: true }
    })
  ]);

  const ruleMap = new Map(rules.map((rule) => [`${rule.categoryId}:${countryCode}`, rule]));
  const publishState = new Map<string, { canPublish: boolean; restrictionNote: string | null }>();
  for (const row of visibleRows) {
    const effective = effectivePublishRule({
      categoryId: row.id,
      byId: visibleById,
      rules: ruleMap,
      countryCode
    });
    publishState.set(row.id, { canPublish: effective.canPublish, restrictionNote: effective.restrictionNote });
  }

  const productIdsByCategory = new Map<string, Set<string>>();
  for (const product of products) {
    if (PRODUCT_FIXTURE.test(product.name) || PRODUCT_FIXTURE.test(product.slug)) continue;
    const list = productIdsByCategory.get(product.categoryId) ?? new Set<string>();
    list.add(product.id);
    productIdsByCategory.set(product.categoryId, list);
  }

  return {
    countryCode,
    visibleRows,
    childrenByParent,
    roots: sortCategoryRows(visibleRows.filter((row) => !row.parentId)),
    publishState,
    productIdsByCategory
  };
}

type NodeCount = { direct: number; subtree: number };

/**
 * Post-order product counts.
 *
 * A product row references exactly one category, so summing each node's
 * distinct direct ids counts every eligible product once. Publish-restricted
 * and non-selectable nodes contribute nothing at all; a restricted branch
 * therefore cannot leak stale products into an ancestor's total.
 */
function countProducts(taxonomy: LoadedTaxonomy): Map<string, NodeCount> {
  const counts = new Map<string, NodeCount>();
  const walk = (row: PublicCategoryRow): NodeCount => {
    const state = taxonomy.publishState.get(row.id);
    const direct =
      row.isSelectable && state?.canPublish !== false
        ? taxonomy.productIdsByCategory.get(row.id)?.size ?? 0
        : 0;
    let subtree = direct;
    for (const child of taxonomy.childrenByParent.get(row.id) ?? []) {
      subtree += walk(child).subtree;
    }
    const count = { direct, subtree };
    counts.set(row.id, count);
    return count;
  };
  for (const root of taxonomy.roots) walk(root);
  return counts;
}

function toNodeFields(
  taxonomy: LoadedTaxonomy,
  counts: Map<string, NodeCount>,
  row: PublicCategoryRow
): PublicCategoryLevelNode {
  const publish = taxonomy.publishState.get(row.id) ?? { canPublish: true, restrictionNote: null };
  const count = counts.get(row.id) ?? { direct: 0, subtree: 0 };
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.imageUrl,
    imageAlt: row.imageAlt,
    level: row.level,
    sortOrder: row.sortOrder,
    isSelectable: row.isSelectable,
    showOnHomepage: row.showOnHomepage,
    browsingVisible: row.browsingVisible,
    canPublish: publish.canPublish,
    restrictionNote: publish.restrictionNote,
    productCount: count.direct,
    subtreeProductCount: count.subtree
  };
}

function toNode(taxonomy: LoadedTaxonomy, counts: Map<string, NodeCount>, row: PublicCategoryRow): PublicTaxonomyNode {
  return { ...toNodeFields(taxonomy, counts, row), children: [] };
}

/**
 * Public department tree.
 *
 * Every node carries its browsing flag, order, imagery, country publication
 * state and product counts. `browsingVisible` is deliberately not a filter
 * here: hiding a node from the rail must not quietly unpublish it.
 */
export async function getPublicTaxonomy(
  options: { countryCode?: string | null } = {}
): Promise<{ countryCode: string; departments: PublicTaxonomyNode[] }> {
  const taxonomy = await loadTaxonomy(options.countryCode);
  const counts = countProducts(taxonomy);
  const build = (row: PublicCategoryRow, depth: number): PublicTaxonomyNode => {
    const node = toNode(taxonomy, counts, row);
    node.children =
      depth >= 2
        ? []
        : (taxonomy.childrenByParent.get(row.id) ?? []).map((child) => build(child, depth + 1));
    return node;
  };
  return {
    countryCode: taxonomy.countryCode,
    departments: taxonomy.roots.map((root) => build(root, 0))
  };
}

/**
 * Lightweight category-level projection for browsing rails.
 *
 * Returns every active, reachable level-1 category whose browsing flag is on,
 * in merchandising order, with its aggregated counts and imagery. The caller
 * does not have to flatten the full department/leaf tree. Departments and
 * level-2 leaves stay out of this list by contract.
 */
export async function getPublicLevelOneCategories(
  options: { countryCode?: string | null } = {}
): Promise<{ countryCode: string; categories: PublicCategoryLevelNode[] }> {
  const taxonomy = await loadTaxonomy(options.countryCode);
  const counts = countProducts(taxonomy);
  const categories = sortCategoryRows(taxonomy.visibleRows)
    .filter((row) => row.level === 1 && row.browsingVisible)
    .map((row) => toNodeFields(taxonomy, counts, row));
  return { countryCode: taxonomy.countryCode, categories };
}
