import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import type { SessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/services/core/audit.service";
import {
  ALIAS_LOCALE_PATTERN,
  ATTRIBUTE_KEY_PATTERN,
  CATEGORY_KEY_PATTERN,
  CATEGORY_SLUG_PATTERN,
  MAX_CATEGORY_LEVEL,
  isUniqueViolation,
  normaliseCountryCode,
  readBoolean,
  readDate,
  readImagePath,
  readInteger,
  readNullableText,
  readText
} from "./shared";

export const ADMIN_CATEGORY_INCLUDE = {
  aliases: { orderBy: { alias: "asc" } },
  attributes: { orderBy: { key: "asc" } },
  countryRules: { orderBy: { countryCode: "asc" } },
  parent: { select: { id: true, name: true, slug: true, level: true } },
  _count: { select: { products: true } }
} satisfies Prisma.CategoryInclude;

export type AdminCategoryRecord = Prisma.CategoryGetPayload<{ include: typeof ADMIN_CATEGORY_INCLUDE }>;

type Db = Prisma.TransactionClient;

export type CategoryCreateValues = {
  parentId: string | null;
  key: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  level: number;
  isSelectable: boolean;
  showOnHomepage: boolean;
  /** Browsing rail/directory visibility, independent of publication. */
  browsingVisible: boolean;
  /** Regulated goods require an explicit country rule before publication. */
  isRegulated: boolean;
  isActive: boolean;
  sortOrder: number;
};

function optionalParentId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ApiError(400, "validation_error", "parentId must be a category id or null.");
  return value.trim() || null;
}

function readKey(value: unknown): string {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!CATEGORY_KEY_PATTERN.test(key)) {
    throw new ApiError(
      400,
      "invalid_key",
      'Category key must be lowercase letters, numbers, dots, underscores or hyphens (for example "phones.accessories").'
    );
  }
  return key;
}

function readSlug(value: unknown): string {
  const slug = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!CATEGORY_SLUG_PATTERN.test(slug) || slug.length > 80) {
    throw new ApiError(400, "invalid_slug", 'Slug must be lowercase words separated by single hyphens (for example "home-kitchen").');
  }
  return slug;
}

export function slugifyCategoryName(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "category"
  );
}

/**
 * The regulated flag is a platform-wide publication decision, not a
 * country-scoped merchandising choice. A scoped administrator may resend the
 * current value (the editor submits every flag on save, so an unchanged value
 * must not block an in-scope edit) but may not change it.
 */
function assertRegulatedFlagInScope(actor: SessionUser, requested: boolean, current: boolean) {
  const scopeCountry = actor.scopeCountryCode ? actor.scopeCountryCode.toUpperCase() : null;
  if (!scopeCountry || requested === current) return;
  throw new ApiError(
    403,
    "region_forbidden",
    "Regulated status is a platform-wide taxonomy decision; a country-scoped administrator cannot change it. Ask a platform-wide administrator."
  );
}

/** Who made this regulated-flag decision, recorded in the audit trail. */
export function regulatedScopeDecision(actor: SessionUser) {
  const scopeCountryCode = actor.scopeCountryCode ? actor.scopeCountryCode.toUpperCase() : null;
  return {
    scopeCountryCode,
    isRegulatedFlagAuthority: scopeCountryCode ? "country_scoped_admin" : "platform_admin"
  };
}

async function assertUniqueCategory(
  tx: Db,
  input: { key?: string | null; name?: string | null; slug?: string | null; excludeId?: string }
) {
  const or: Prisma.CategoryWhereInput[] = [];
  if (input.key) or.push({ key: input.key });
  if (input.slug) or.push({ slug: input.slug });
  if (input.name) or.push({ name: { equals: input.name, mode: "insensitive" } });
  if (or.length === 0) return;

  const conflict = await tx.category.findFirst({
    where: { ...(input.excludeId ? { id: { not: input.excludeId } } : {}), OR: or },
    select: { id: true, key: true, name: true, slug: true }
  });
  if (!conflict) return;
  throw new ApiError(409, "duplicate_category", "A category with that key, name or slug already exists.", {
    conflictsWith: { id: conflict.id, key: conflict.key, name: conflict.name, slug: conflict.slug }
  });
}

/**
 * Validates a create payload and resolves the hierarchy. The parent must be a
 * live node so an active child cannot be attached under a deprecated branch,
 * and the resulting level may never exceed the public tree depth.
 */
export async function validateCategoryCreateInput(tx: Db, body: Record<string, unknown>): Promise<CategoryCreateValues> {
  const parentId = optionalParentId(body.parentId);
  let parentLevel: number | null = null;
  if (parentId) {
    const parent = await tx.category.findUnique({
      where: { id: parentId },
      select: { id: true, level: true, isActive: true, deprecatedAt: true }
    });
    if (!parent) throw new ApiError(400, "invalid_parent", "Choose a valid parent category.");
    if (!parent.isActive || parent.deprecatedAt) {
      throw new ApiError(400, "parent_unavailable", "The parent category is inactive or deprecated.");
    }
    if (parent.level >= MAX_CATEGORY_LEVEL) {
      throw new ApiError(400, "category_too_deep", `The taxonomy supports ${MAX_CATEGORY_LEVEL + 1} levels.`);
    }
    parentLevel = parent.level;
  }

  const level = parentId ? (parentLevel as number) + 1 : 0;
  if (body.level !== undefined && body.level !== null) {
    const supplied = readInteger(body.level, "level", 0, MAX_CATEGORY_LEVEL);
    if (supplied !== level) {
      throw new ApiError(400, "invalid_level", `level must be ${level} for the chosen parent.`);
    }
  }

  const name = readText(body.name, "Category name", 2, 120);
  const slugInput = typeof body.slug === "string" ? body.slug.trim() : "";
  const slug = slugInput ? readSlug(body.slug) : slugifyCategoryName(name);
  const keyInput = typeof body.key === "string" ? body.key.trim() : "";
  const key = keyInput ? readKey(body.key) : slug.replace(/-/g, "_").slice(0, 64);

  const values: CategoryCreateValues = {
    parentId,
    key,
    name,
    slug,
    description: readNullableText(body.description, "Description", 2000) ?? null,
    imageUrl: readImagePath(body.imageUrl) ?? null,
    imageAlt: readNullableText(body.imageAlt, "Image alt text", 220) ?? null,
    level,
    isSelectable: body.isSelectable === undefined ? true : readBoolean(body.isSelectable, "isSelectable"),
    showOnHomepage: body.showOnHomepage === undefined ? false : readBoolean(body.showOnHomepage, "showOnHomepage"),
    browsingVisible: body.browsingVisible === undefined ? true : readBoolean(body.browsingVisible, "browsingVisible"),
    isRegulated: body.isRegulated === undefined ? false : readBoolean(body.isRegulated, "isRegulated"),
    isActive: body.isActive === undefined ? true : readBoolean(body.isActive, "isActive"),
    sortOrder: body.sortOrder === undefined ? 0 : readInteger(body.sortOrder, "sortOrder", 0, 100_000)
  };

  await assertUniqueCategory(tx, { key: values.key, name: values.name, slug: values.slug });
  return values;
}

/** Creates a category row inside the caller's transaction. The caller audits. */
export async function createCategoryRecord(
  tx: Db,
  _actorId: string,
  values: CategoryCreateValues
): Promise<AdminCategoryRecord> {
  return tx.category.create({
    data: {
      parentId: values.parentId,
      key: values.key,
      name: values.name,
      slug: values.slug,
      description: values.description,
      imageUrl: values.imageUrl,
      imageAlt: values.imageAlt,
      level: values.level,
      isSelectable: values.isSelectable,
      showOnHomepage: values.showOnHomepage,
      browsingVisible: values.browsingVisible,
      isRegulated: values.isRegulated,
      isActive: values.isActive,
      sortOrder: values.sortOrder
    },
    include: ADMIN_CATEGORY_INCLUDE
  });
}

export async function createCategoryNode(actor: SessionUser, body: Record<string, unknown>): Promise<AdminCategoryRecord> {
  try {
    return await prisma.$transaction(async (tx) => {
      const values = await validateCategoryCreateInput(tx, body);
      // Enforced before the category row, aliases, attributes or country rules
      // are written: a scoped administrator cannot establish the platform-wide
      // regulated flag.
      assertRegulatedFlagInScope(actor, values.isRegulated, false);
      const created = await createCategoryRecord(tx, actor.id, values);
      const aliasCount = body.aliases === undefined ? 0 : await replaceAliases(tx, created.id, body.aliases);
      const attributeCount = body.attributes === undefined ? 0 : await replaceAttributes(tx, created.id, body.attributes);
      const countryRuleCount =
        body.countryRules === undefined ? 0 : await replaceCountryRules(tx, created.id, body.countryRules, actor);
      await recordAudit({
        tx,
        actorId: actor.id,
        action: "taxonomy.category.created",
        entity: "Category",
        entityId: created.id,
        metadata: {
          key: values.key,
          name: values.name,
          slug: values.slug,
          parentId: values.parentId,
          level: values.level,
          isSelectable: values.isSelectable,
          showOnHomepage: values.showOnHomepage,
          browsingVisible: values.browsingVisible,
          isRegulated: values.isRegulated,
          scope: regulatedScopeDecision(actor),
          isActive: values.isActive,
          aliasCount,
          attributeCount,
          countryRuleCount
        }
      });
      return tx.category.findUniqueOrThrow({ where: { id: created.id }, include: ADMIN_CATEGORY_INCLUDE });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const target = (error as { meta?: { target?: unknown } }).meta?.target;
      if (Array.isArray(target) && target.some((field) => String(field).includes("alias"))) {
        throw new ApiError(409, "alias_conflict", "That alias already belongs to another category.");
      }
      throw new ApiError(409, "duplicate_category", "A category with that key, name or slug already exists.");
    }
    throw error;
  }
}

type AliasInput = { alias: string; locale: string };
type AttributeInput = {
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "SELECT" | "BOOLEAN";
  required: boolean;
  options: string[] | null;
};
type CountryRuleInput = { countryCode: string; canPublish: boolean; note: string | null };

function readAliases(value: unknown): AliasInput[] {
  if (!Array.isArray(value)) throw new ApiError(400, "validation_error", "aliases must be an array.");
  if (value.length > 100) throw new ApiError(400, "validation_error", "At most 100 aliases are supported.");
  const seen = new Set<string>();
  const aliases: AliasInput[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new ApiError(400, "validation_error", "Each alias must be an object with alias and locale.");
    }
    const record = entry as Record<string, unknown>;
    const alias = readText(record.alias, "Alias", 1, 80);
    const locale = record.locale === undefined ? "en" : readText(record.locale, "Alias locale", 2, 5);
    if (!ALIAS_LOCALE_PATTERN.test(locale)) {
      throw new ApiError(400, "validation_error", 'Alias locale must look like "en" or "en-NG".');
    }
    const dedupeKey = `${alias.toLowerCase()}:${locale}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    aliases.push({ alias, locale });
  }
  return aliases;
}

function readAttributes(value: unknown): AttributeInput[] {
  if (!Array.isArray(value)) throw new ApiError(400, "validation_error", "attributes must be an array.");
  if (value.length > 100) throw new ApiError(400, "validation_error", "At most 100 attributes are supported.");
  const seen = new Set<string>();
  const attributes: AttributeInput[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new ApiError(400, "validation_error", "Each attribute must be an object.");
    }
    const record = entry as Record<string, unknown>;
    const key = typeof record.key === "string" ? record.key.trim().toLowerCase() : "";
    if (!ATTRIBUTE_KEY_PATTERN.test(key)) {
      throw new ApiError(400, "invalid_attribute_key", 'Attribute key must be lowercase letters, numbers, underscores or hyphens.');
    }
    if (seen.has(key)) throw new ApiError(400, "duplicate_attribute", `Attribute "${key}" appears more than once.`);
    seen.add(key);

    const type = typeof record.type === "string" ? record.type.trim().toUpperCase() : "";
    if (type !== "TEXT" && type !== "NUMBER" && type !== "SELECT" && type !== "BOOLEAN") {
      throw new ApiError(400, "invalid_attribute_type", "Attribute type must be TEXT, NUMBER, SELECT or BOOLEAN.");
    }

    let options: string[] | null = null;
    if (type === "SELECT") {
      if (!Array.isArray(record.options)) {
        throw new ApiError(400, "attribute_options_required", `Attribute "${key}" needs a list of options.`);
      }
      const values = record.options
        .map((option) => (typeof option === "string" ? option.trim() : ""))
        .filter(Boolean);
      options = [...new Set(values)];
      if (options.length === 0 || options.length > 50) {
        throw new ApiError(400, "invalid_attribute_options", `Attribute "${key}" needs 1-50 non-empty options.`);
      }
      if (options.some((option) => option.length > 80)) {
        throw new ApiError(400, "invalid_attribute_options", `Attribute "${key}" options must be 80 characters or fewer.`);
      }
    } else if (record.options !== undefined && record.options !== null && !(Array.isArray(record.options) && record.options.length === 0)) {
      throw new ApiError(400, "invalid_attribute_options", "Only SELECT attributes can define options.");
    }

    attributes.push({
      key,
      label: readText(record.label, "Attribute label", 1, 80),
      type,
      required: record.required === undefined ? false : readBoolean(record.required, "Attribute required"),
      options
    });
  }
  return attributes;
}

function readCountryRules(value: unknown): CountryRuleInput[] {
  if (!Array.isArray(value)) throw new ApiError(400, "validation_error", "countryRules must be an array.");
  if (value.length > 250) throw new ApiError(400, "validation_error", "At most 250 country rules are supported.");
  const seen = new Set<string>();
  const rules: CountryRuleInput[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new ApiError(400, "validation_error", "Each country rule must be an object.");
    }
    const record = entry as Record<string, unknown>;
    const countryCode = normaliseCountryCode(record.countryCode);
    if (seen.has(countryCode)) throw new ApiError(400, "duplicate_country_rule", `Country ${countryCode} appears more than once.`);
    seen.add(countryCode);
    if (typeof record.canPublish !== "boolean") {
      throw new ApiError(400, "validation_error", "Each country rule needs canPublish true or false.");
    }
    rules.push({
      countryCode,
      canPublish: record.canPublish,
      note: readNullableText(record.note, "Country rule note", 300) ?? null
    });
  }
  return rules;
}

async function replaceAliases(tx: Db, categoryId: string, raw: unknown): Promise<number> {
  const aliases = readAliases(raw);
  if (aliases.length > 0) {
    const conflict = await tx.categoryAlias.findFirst({
      where: {
        categoryId: { not: categoryId },
        OR: aliases.map((alias) => ({ alias: alias.alias, locale: alias.locale }))
      },
      select: { alias: true, locale: true, categoryId: true }
    });
    if (conflict) {
      throw new ApiError(409, "alias_conflict", `The alias "${conflict.alias}" (${conflict.locale}) belongs to another category.`);
    }
  }
  await tx.categoryAlias.deleteMany({ where: { categoryId } });
  if (aliases.length > 0) {
    await tx.categoryAlias.createMany({
      data: aliases.map((alias) => ({ categoryId, alias: alias.alias, locale: alias.locale }))
    });
  }
  return aliases.length;
}

async function replaceAttributes(tx: Db, categoryId: string, raw: unknown): Promise<number> {
  const attributes = readAttributes(raw);
  await tx.categoryAttribute.deleteMany({ where: { categoryId } });
  if (attributes.length > 0) {
    await tx.categoryAttribute.createMany({
      data: attributes.map((attribute) => ({
        categoryId,
        key: attribute.key,
        label: attribute.label,
        type: attribute.type,
        required: attribute.required,
        ...(attribute.type === "SELECT" && attribute.options ? { options: attribute.options } : {})
      }))
    });
  }
  return attributes.length;
}

async function replaceCountryRules(
  tx: Db,
  categoryId: string,
  raw: unknown,
  actor: SessionUser
): Promise<number> {
  const rules = readCountryRules(raw);
  const scopeCountry = actor.scopeCountryCode ? actor.scopeCountryCode.toUpperCase() : null;
  if (scopeCountry) {
    const outside = rules.find((rule) => rule.countryCode !== scopeCountry);
    if (outside) {
      throw new ApiError(
        403,
        "region_forbidden",
        `Your administrative scope is ${scopeCountry}; you cannot configure ${outside.countryCode} rules.`
      );
    }
    await tx.categoryCountryRule.deleteMany({ where: { categoryId, countryCode: scopeCountry } });
  } else {
    await tx.categoryCountryRule.deleteMany({ where: { categoryId } });
  }
  if (rules.length > 0) {
    await tx.categoryCountryRule.createMany({
      data: rules.map((rule) => ({
        categoryId,
        countryCode: rule.countryCode,
        canPublish: rule.canPublish,
        note: rule.note
      }))
    });
  }
  return rules.length;
}

async function loadDescendants(
  tx: Db,
  categoryId: string
): Promise<{ ids: string[]; height: number; depths: Map<string, number> }> {
  const rows = await tx.category.findMany({ select: { id: true, parentId: true } });
  const childrenByParent = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const list = childrenByParent.get(row.parentId) ?? [];
    list.push(row.id);
    childrenByParent.set(row.parentId, list);
  }

  const ids: string[] = [];
  const depths = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [{ id: categoryId, depth: 0 }];
  const seen = new Set<string>([categoryId]);
  let height = 0;
  while (queue.length > 0) {
    const current = queue.shift() as { id: string; depth: number };
    height = Math.max(height, current.depth);
    for (const childId of childrenByParent.get(current.id) ?? []) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      ids.push(childId);
      depths.set(childId, current.depth + 1);
      queue.push({ id: childId, depth: current.depth + 1 });
    }
  }
  return { ids, height, depths };
}

/**
 * Edits a category, its aliases, attributes and country rules.
 *
 * Reparenting is checked against the live tree: cycles are refused, level is
 * derived from the new parent, the subtree cannot exceed the three public
 * levels, and a category that already has products directly attached cannot
 * move until the caller confirms the exact product count.
 */
export async function updateCategoryNode(
  actor: SessionUser,
  categoryId: string,
  body: Record<string, unknown>
): Promise<AdminCategoryRecord> {
  if (!categoryId) throw new ApiError(400, "validation_error", "Category id is required.");

  try {
    return await prisma.$transaction(async (tx) => {
      // Reparenting is a whole-tree invariant. A transaction-scoped advisory
      // lock serialises concurrent moves so two administrators cannot each
      // validate against the old tree and jointly create a cycle.
      if (body.parentId !== undefined) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('naijadeals:taxonomy:category-tree'))`;
      }
      const existing = await tx.category.findUnique({
        where: { id: categoryId },
        include: ADMIN_CATEGORY_INCLUDE
      });
      if (!existing) throw new ApiError(404, "category_not_found", "Category not found.");

      // Parse and authorise the regulated flag before any write (including the
      // audit row): only a platform-wide administrator may change it.
      const requestedRegulated =
        body.isRegulated === undefined ? undefined : readBoolean(body.isRegulated, "isRegulated");
      if (requestedRegulated !== undefined) {
        assertRegulatedFlagInScope(actor, requestedRegulated, existing.isRegulated);
      }

      const key =
        body.key === undefined || body.key === null || body.key === "" ? undefined : readKey(body.key);
      const name = body.name === undefined ? undefined : readText(body.name, "Category name", 2, 120);
      const slug =
        body.slug === undefined || body.slug === null || body.slug === "" ? undefined : readSlug(body.slug);
      await assertUniqueCategory(tx, { key, name, slug, excludeId: categoryId });

      const parentChanged = body.parentId !== undefined && optionalParentId(body.parentId) !== existing.parentId;
      let newParentId = existing.parentId;
      let newLevel = existing.level;
      let descendants: string[] = [];
      let descendantDepths = new Map<string, number>();

      if (parentChanged) {
        const requestedParentId = optionalParentId(body.parentId);
        let parentLevel: number | null = null;
        if (requestedParentId) {
          const parent = await tx.category.findUnique({
            where: { id: requestedParentId },
            select: { id: true, level: true, isActive: true, deprecatedAt: true }
          });
          if (!parent) throw new ApiError(400, "invalid_parent", "Choose a valid parent category.");
          if (!parent.isActive || parent.deprecatedAt) {
            throw new ApiError(400, "parent_unavailable", "The parent category is inactive or deprecated.");
          }
          if (parent.id === categoryId) throw new ApiError(400, "category_cycle", "A category cannot be its own parent.");
          parentLevel = parent.level;
        }

        const subtree = await loadDescendants(tx, categoryId);
        if (requestedParentId && (requestedParentId === categoryId || subtree.ids.includes(requestedParentId))) {
          throw new ApiError(400, "category_cycle", "A category cannot be moved under itself or one of its descendants.");
        }

        const derivedLevel = requestedParentId ? (parentLevel as number) + 1 : 0;
        if (derivedLevel + subtree.height > MAX_CATEGORY_LEVEL) {
          throw new ApiError(
            400,
            "category_too_deep",
            `Moving this category would exceed the ${MAX_CATEGORY_LEVEL + 1}-level taxonomy.`
          );
        }

        // Products reference the node they were listed in, so the explicit
        // confirmation is the count a product row would actually move with.
        const productCount = await tx.product.count({ where: { categoryId } });
        if (productCount > 0) {
          if (body.confirmProductCount === undefined || body.confirmProductCount === null) {
            throw new ApiError(
              409,
              "category_products_attached",
              `This category has ${productCount} product(s) attached. Resend with confirmProductCount=${productCount} to move them.`,
              { productCount }
            );
          }
          const confirmed = readInteger(body.confirmProductCount, "confirmProductCount", 0, Number.MAX_SAFE_INTEGER);
          if (confirmed !== productCount) {
            throw new ApiError(
              409,
              "category_product_count_mismatch",
              `The category now has ${productCount} product(s) attached; confirm that exact count.`,
              { productCount }
            );
          }
        }

        descendants = subtree.ids;
        descendantDepths = subtree.depths;
        newParentId = requestedParentId;
        newLevel = derivedLevel;
      } else if (body.level !== undefined && body.level !== null) {
        const supplied = readInteger(body.level, "level", 0, MAX_CATEGORY_LEVEL);
        if (supplied !== existing.level) {
          throw new ApiError(400, "invalid_level", "Change the parent to move a category to another level.");
        }
      }

      const data: Prisma.CategoryUpdateInput = {
        ...(key !== undefined ? { key } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(body.description !== undefined ? { description: readNullableText(body.description, "Description", 2000) ?? null } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: readImagePath(body.imageUrl) ?? null } : {}),
        ...(body.imageAlt !== undefined ? { imageAlt: readNullableText(body.imageAlt, "Image alt text", 220) ?? null } : {}),
        ...(body.isSelectable !== undefined ? { isSelectable: readBoolean(body.isSelectable, "isSelectable") } : {}),
        ...(body.showOnHomepage !== undefined ? { showOnHomepage: readBoolean(body.showOnHomepage, "showOnHomepage") } : {}),
        ...(body.browsingVisible !== undefined
          ? { browsingVisible: readBoolean(body.browsingVisible, "browsingVisible") }
          : {}),
        ...(requestedRegulated !== undefined ? { isRegulated: requestedRegulated } : {}),
        ...(body.isActive !== undefined ? { isActive: readBoolean(body.isActive, "isActive") } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: readInteger(body.sortOrder, "sortOrder", 0, 100_000) } : {}),
        ...(body.deprecatedAt !== undefined ? { deprecatedAt: readDate(body.deprecatedAt, "deprecatedAt") ?? null } : {})
      };

      if (parentChanged) {
        data.parent = newParentId ? { connect: { id: newParentId } } : { disconnect: true };
        data.level = newLevel;
      }

      const updated = await tx.category.update({ where: { id: categoryId }, data });

      if (parentChanged && descendants.length > 0) {
        // Recompute levels from the new root instead of shifting stale stored
        // levels: legacy/inconsistent rows then become a valid hierarchy.
        for (const descendantId of descendants) {
          const depth = descendantDepths.get(descendantId);
          if (depth === undefined) continue;
          await tx.category.update({ where: { id: descendantId }, data: { level: newLevel + depth } });
        }
      }

      if (body.aliases !== undefined) {
        await replaceAliases(tx, categoryId, body.aliases);
      }

      if (body.attributes !== undefined) {
        await replaceAttributes(tx, categoryId, body.attributes);
      }

      if (body.countryRules !== undefined) {
        await replaceCountryRules(tx, categoryId, body.countryRules, actor);
      }

      await recordAudit({
        tx,
        actorId: actor.id,
        action: "taxonomy.category.updated",
        entity: "Category",
        entityId: categoryId,
        metadata: {
          before: {
            key: existing.key,
            name: existing.name,
            slug: existing.slug,
            parentId: existing.parentId,
            level: existing.level,
            isActive: existing.isActive,
            isSelectable: existing.isSelectable,
            showOnHomepage: existing.showOnHomepage,
            browsingVisible: existing.browsingVisible,
            isRegulated: existing.isRegulated,
            sortOrder: existing.sortOrder,
            imageUrl: existing.imageUrl,
            imageAlt: existing.imageAlt,
            deprecatedAt: existing.deprecatedAt ? existing.deprecatedAt.toISOString() : null
          },
          after: {
            key: updated.key,
            name: updated.name,
            slug: updated.slug,
            parentId: newParentId,
            level: updated.level,
            isActive: updated.isActive,
            isSelectable: updated.isSelectable,
            showOnHomepage: updated.showOnHomepage,
            browsingVisible: updated.browsingVisible,
            isRegulated: updated.isRegulated,
            sortOrder: updated.sortOrder,
            imageUrl: updated.imageUrl,
            imageAlt: updated.imageAlt,
            deprecatedAt: updated.deprecatedAt ? updated.deprecatedAt.toISOString() : null
          },
          changed: {
            aliases: body.aliases !== undefined,
            attributes: body.attributes !== undefined,
            countryRules: body.countryRules !== undefined
          },
          scope: regulatedScopeDecision(actor),
          regulatedChangeRequested: requestedRegulated !== undefined
        }
      });

      return tx.category.findUniqueOrThrow({ where: { id: categoryId }, include: ADMIN_CATEGORY_INCLUDE });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const target = (error as { meta?: { target?: unknown } }).meta?.target;
      if (Array.isArray(target) && target.some((field) => String(field).includes("alias"))) {
        throw new ApiError(409, "alias_conflict", "That alias already belongs to another category.");
      }
      throw new ApiError(409, "duplicate_category", "A category with that key, name or slug already exists.");
    }
    throw error;
  }
}
