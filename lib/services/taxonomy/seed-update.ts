import type { Prisma } from "@prisma/client";
import { isRegulatedCategoryKey } from "../../taxonomy/regulated";
import type { TaxonomyNode } from "../../data/taxonomy";

/**
 * Seed payload builders for the marketplace taxonomy.
 *
 * Image rule: `imageUrl`/`imageAlt` on a taxonomy definition are CREATE-ONLY
 * defaults. They initialise a category the seed creates; they never overwrite
 * an existing row, because an administrator may have attached different
 * approved art through the Control Center. A seed update therefore omits both
 * image columns, and the previous pair survives untouched.
 *
 * Other presentation fields keep their established behaviour: the nine
 * `isExisting` categories keep their name, slug, description, image and demo
 * flag, while taxonomy-owned nodes receive the definition's name/description.
 */

/** The definition fields the seed payload builders consume. */
export type SeedNodeSource = {
  key: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  level: number;
  isSelectable: boolean;
  showOnHomepage: boolean;
  sortOrder: number;
  isExisting: boolean;
  isRegulated?: boolean;
};

/**
 * The regulated publication flag comes from the established definition, never
 * from the editorial `reviewRequired` property. A definition may state
 * `isRegulated` explicitly; otherwise set membership decides. Writing and
 * verifying through one helper means a definition that disagrees with the set
 * fails the seed instead of silently changing market powers.
 */
export function seedRegulatedFlagFor(definition: { key: string; isRegulated?: boolean }): boolean {
  return definition.isRegulated ?? isRegulatedCategoryKey(definition.key);
}

/** Image columns a create may initialise from the definition, never an update. */
export type SeedCreateImageData = Pick<Prisma.CategoryUncheckedCreateInput, "imageUrl" | "imageAlt">;

/**
 * Row data for creating a taxonomy node. Image defaults are initialised here
 * and only here; `undefined` leaves the column to its database default (null).
 */
export function buildSeedCreateImageData(definition: SeedNodeSource): SeedCreateImageData {
  const data: SeedCreateImageData = {};
  if (definition.imageUrl !== undefined) data.imageUrl = definition.imageUrl;
  if (definition.imageAlt !== undefined) data.imageAlt = definition.imageAlt;
  return data;
}

/** Full create data for a taxonomy node. */
export function buildSeedCreateData(
  definition: SeedNodeSource,
  parentId: string | null
): Prisma.CategoryUncheckedCreateInput {
  return {
    key: definition.key,
    name: definition.name,
    slug: definition.slug,
    description: definition.description,
    parentId,
    level: definition.level,
    isSelectable: definition.isSelectable,
    showOnHomepage: definition.showOnHomepage,
    isRegulated: seedRegulatedFlagFor(definition),
    sortOrder: definition.sortOrder,
    isActive: true,
    isDemo: false,
    ...buildSeedCreateImageData(definition)
  };
}

/**
 * Update data for an existing taxonomy node. The type deliberately excludes
 * `imageUrl`/`imageAlt`: there is no code path through which a seed rerun can
 * rewrite an administrator's approved art.
 */
export type SeedCategoryUpdateData = Omit<
  Prisma.CategoryUncheckedUpdateInput,
  "imageUrl" | "imageAlt"
>;

/** Row data for updating an existing taxonomy node; image columns are omitted. */
export function buildSeedUpdateData(
  definition: SeedNodeSource,
  parentId: string | null
): SeedCategoryUpdateData {
  const shared: SeedCategoryUpdateData = {
    key: definition.key,
    parentId,
    level: definition.level,
    isSelectable: definition.isSelectable,
    showOnHomepage: definition.showOnHomepage,
    isRegulated: seedRegulatedFlagFor(definition),
    sortOrder: definition.sortOrder,
    isActive: true,
    deprecatedAt: null
  };
  if (definition.isExisting) {
    // Preserve name, slug, demo description, image and isDemo flag.
    return shared;
  }
  return {
    ...shared,
    name: definition.name,
    description: definition.description
  };
}

type Assert<T extends true> = T;
/** Compile-time guard that every authoritative node definition stays compatible. */
export type SeedNodeSourceCompatible = Assert<TaxonomyNode extends SeedNodeSource ? true : false>;
