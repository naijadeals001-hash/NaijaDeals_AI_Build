import type { CategoryAttributeType, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/auth/guard";
import { assistSellerCategories } from "./assist";
import {
  MAX_CATEGORY_LEVEL,
  categoryPath,
  effectivePublishRule,
  isPlainObject,
  isReachable,
  normaliseOptions,
  sortCategoryRows,
  type CategorySummary,
  type CountryRuleRow
} from "./shared";

export type TaxonomyDb = PrismaClient | Prisma.TransactionClient;

export type AttributeDefinition = {
  key: string;
  label: string;
  type: CategoryAttributeType;
  required: boolean;
  options: string[] | null;
};

export type SellerCategoryOption = {
  id: string;
  key: string | null;
  name: string;
  path: string;
  description: string | null;
  level: number;
  isSelectable: boolean;
  attributes: AttributeDefinition[];
  canPublish: boolean;
  restrictionNote: string | null;
};

export type CategorySuggestion = {
  categoryId: string;
  path: string;
  reason: string;
};

export type CategorySuggestionResult = {
  suggestions: CategorySuggestion[];
  /** Which engine produced the returned list. The default is deterministic. */
  mode: "deterministic" | "aura";
  /** Present only when Aura assistance was explicitly requested. */
  assist?: {
    requested: boolean;
    used: boolean;
    available: boolean;
    reason: string | null;
    model: string | null;
    retryAfterSeconds?: number;
  };
};

type CategoryWithAttributes = CategorySummary & {
  key: string | null;
  slug: string;
  attributes: Array<{
    key: string;
    label: string;
    type: CategoryAttributeType;
    required: boolean;
    options: Prisma.JsonValue | null;
  }>;
};

type CategoryWithAliases = CategorySummary & {
  key: string | null;
  aliases: Array<{ alias: string; locale: string }>;
};

function rulesByKey(rules: CountryRuleRow[]): Map<string, CountryRuleRow> {
  return new Map(rules.map((rule) => [`${rule.categoryId}:${rule.countryCode.toUpperCase()}`, rule]));
}

function definitions(attributes: CategoryWithAttributes["attributes"]): AttributeDefinition[] {
  return [...attributes]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((attribute) => ({
      key: attribute.key,
      label: attribute.label,
      type: attribute.type,
      required: attribute.required,
      options: normaliseOptions(attribute.options)
    }));
}

/**
 * Seller-visible category picker.
 *
 * Only active, non-deprecated selectable nodes whose complete ancestor chain
 * is live are returned. A country restriction keeps the node visible with a
 * reason so the seller understands why publishing is disabled, rather than
 * seeing a category silently disappear.
 */
export async function listSellerCategories(countryCode: string): Promise<{ categories: SellerCategoryOption[] }> {
  const country = countryCode.trim().toUpperCase();
  const [rows, rules] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true, deprecatedAt: null },
      select: {
        id: true,
        key: true,
        name: true,
        slug: true,
        description: true,
        parentId: true,
        level: true,
        isActive: true,
        isSelectable: true,
        deprecatedAt: true,
        sortOrder: true,
        attributes: {
          select: { key: true, label: true, type: true, required: true, options: true },
          orderBy: { key: "asc" }
        }
      }
    }),
    prisma.categoryCountryRule.findMany({
      where: { countryCode: country },
      select: { categoryId: true, countryCode: true, canPublish: true, note: true }
    })
  ]);

  const byId = new Map(rows.map((row) => [row.id, row]));
  const ruleMap = rulesByKey(rules);
  const categories = sortCategoryRows(rows)
    .filter((row) => row.level <= MAX_CATEGORY_LEVEL && row.isSelectable && isReachable(row, byId))
    .map((row) => {
      const rule = effectivePublishRule({ categoryId: row.id, byId, rules: ruleMap, countryCode: country });
      return {
        id: row.id,
        key: row.key,
        name: row.name,
        path: categoryPath(row.id, byId),
        description: row.description,
        level: row.level,
        isSelectable: row.isSelectable,
        attributes: definitions(row.attributes),
        canPublish: rule.canPublish,
        restrictionNote: rule.restrictionNote
      } satisfies SellerCategoryOption;
    });

  return { categories };
}

type MatchSource = "name" | "alias";

function normaliseQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Deterministic alias/name suggestions. No model is called and no request
 * leaves the application: the same query always yields the same three
 * publishable categories, ordered by match quality and taxonomy order.
 */
export async function suggestSellerCategories(input: {
  countryCode: string;
  query: string;
  /** Explicit opt-in; absent means the default deterministic search only. */
  assist?: "aura";
  /** Authenticated seller id. Required for the shared Aura rate limit. */
  userId?: string;
}): Promise<CategorySuggestionResult> {
  const query = normaliseQuery(input.query ?? "");
  if (query.length < 2) return { suggestions: [], mode: "deterministic" };
  if (query.length > 80) throw new ApiError(400, "validation_error", "Search text must be 80 characters or fewer.");

  const country = input.countryCode.trim().toUpperCase();
  const [rows, rules] = await Promise.all([
    prisma.category.findMany({
      // Non-selectable departments must stay in the result: reachability is
      // checked through the full ancestor chain, not only selectable nodes.
      where: { isActive: true, deprecatedAt: null },
      select: {
        id: true,
        key: true,
        name: true,
        slug: true,
        parentId: true,
        level: true,
        isActive: true,
        isSelectable: true,
        deprecatedAt: true,
        sortOrder: true,
        aliases: { select: { alias: true, locale: true }, orderBy: { alias: "asc" } }
      }
    }),
    prisma.categoryCountryRule.findMany({
      where: { countryCode: country },
      select: { categoryId: true, countryCode: true, canPublish: true, note: true }
    })
  ]);

  const byId = new Map(rows.map((row) => [row.id, row]));
  const ruleMap = rulesByKey(rules);

  const matches: Array<{
    row: CategoryWithAliases;
    score: number;
    matched: string;
    source: MatchSource;
  }> = [];

  for (const row of rows) {
    if (row.level > MAX_CATEGORY_LEVEL || !row.isSelectable || !isReachable(row, byId)) continue;
    const publishRule = effectivePublishRule({ categoryId: row.id, byId, rules: ruleMap, countryCode: country });
    if (!publishRule.canPublish) continue;

    const name = normaliseQuery(row.name);
    let best: { score: number; matched: string; source: MatchSource } | null = null;
    if (name === query) best = { score: 0, matched: row.name, source: "name" };
    else if (name.startsWith(query)) best = { score: 2, matched: row.name, source: "name" };
    else if (name.includes(query)) best = { score: 4, matched: row.name, source: "name" };

    for (const alias of row.aliases) {
      const value = normaliseQuery(alias.alias);
      let candidate: { score: number; matched: string; source: MatchSource } | null = null;
      if (value === query) candidate = { score: 1, matched: alias.alias, source: "alias" };
      else if (value.startsWith(query)) candidate = { score: 3, matched: alias.alias, source: "alias" };
      else if (value.includes(query)) candidate = { score: 5, matched: alias.alias, source: "alias" };
      if (candidate && (!best || candidate.score < best.score)) best = candidate;
    }

    if (best) matches.push({ row, ...best });
  }

  matches.sort(
    (left, right) =>
      left.score - right.score ||
      left.row.sortOrder - right.row.sortOrder ||
      left.row.name.localeCompare(right.row.name) ||
      left.row.id.localeCompare(right.row.id)
  );

  const deterministic = matches.slice(0, 3).map((match) => ({
    categoryId: match.row.id,
    path: categoryPath(match.row.id, byId),
    reason:
      match.source === "alias"
        ? `Alias "${match.matched}" matches a category name.`
        : `Category name "${match.matched}" matches your search.`
  }));

  if (input.assist !== "aura" || !input.userId) {
    return { suggestions: deterministic, mode: "deterministic" };
  }

  // A deterministic exact/alias match is already the most defensible answer;
  // do not spend a model call to re-rank it. Assistance is for queries the
  // local vocabulary could not resolve.
  if (deterministic.length > 0) {
    return {
      suggestions: deterministic,
      mode: "deterministic",
      assist: {
        requested: true,
        used: false,
        available: true,
        reason: "deterministic_match",
        model: null
      }
    };
  }

  const assisted = await assistSellerCategories({
    userId: input.userId,
    countryCode: country,
    query
  });
  return {
    suggestions: assisted.suggestions,
    mode: assisted.usedModel ? "aura" : "deterministic",
    assist: {
      requested: true,
      used: assisted.usedModel,
      available: assisted.available,
      reason: assisted.reason,
      model: assisted.model,
      ...(assisted.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: assisted.retryAfterSeconds }
        : {})
    }
  };
}

function attributeError(attribute: AttributeDefinition, message: string, code = "attribute_invalid") {
  return new ApiError(400, code, message, { attribute: attribute.key });
}

/**
 * Validates a seller-supplied attribute object against the category's
 * definitions. Unknown keys are rejected (fail closed), required attributes
 * must be non-empty, and SELECT values must be one of the configured options.
 * The normalised object is what gets stored on the product.
 */
export function validateProductAttributes(
  raw: unknown,
  attributes: AttributeDefinition[]
): Record<string, string | number | boolean> | null {
  if (raw === undefined || raw === null) {
    const missing = attributes.filter((attribute) => attribute.required);
    if (missing.length > 0) {
      throw new ApiError(400, "attribute_required", `${missing[0].label} is required.`, { attribute: missing[0].key });
    }
    return null;
  }
  if (!isPlainObject(raw)) {
    throw new ApiError(400, "validation_error", "Attributes must be a JSON object keyed by attribute name.");
  }

  const byKey = new Map(attributes.map((attribute) => [attribute.key, attribute]));
  for (const key of Object.keys(raw)) {
    if (!byKey.has(key)) {
      throw new ApiError(400, "unknown_attribute", `"${key}" is not an attribute of this category.`, { attribute: key });
    }
  }

  const result: Record<string, string | number | boolean> = {};
  for (const attribute of attributes) {
    const value = raw[attribute.key];
    const empty = value === undefined || value === null || (typeof value === "string" && value.trim() === "");
    if (empty) {
      if (attribute.required) {
        throw new ApiError(400, "attribute_required", `${attribute.label} is required.`, { attribute: attribute.key });
      }
      continue;
    }

    switch (attribute.type) {
      case "TEXT": {
        if (typeof value !== "string") throw attributeError(attribute, `${attribute.label} must be text.`);
        const text = value.trim();
        if (text.length > 500) throw attributeError(attribute, `${attribute.label} must be 500 characters or fewer.`);
        result[attribute.key] = text;
        break;
      }
      case "NUMBER": {
        const parsed =
          typeof value === "number"
            ? value
            : typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())
              ? Number(value.trim())
              : Number.NaN;
        if (typeof parsed !== "number" || !Number.isFinite(parsed) || Math.abs(parsed) > 1e15) {
          throw attributeError(attribute, `${attribute.label} must be a number.`);
        }
        result[attribute.key] = parsed;
        break;
      }
      case "SELECT": {
        if (!attribute.options?.length) {
          throw attributeError(
            attribute,
            `${attribute.label} has no configured options. Ask an administrator to complete the category setup.`,
            "attribute_options_missing"
          );
        }
        if (typeof value !== "string") throw attributeError(attribute, `${attribute.label} must be one of its options.`);
        const selected = value.trim();
        if (!attribute.options.includes(selected)) {
          throw new ApiError(400, "attribute_option_invalid", `${attribute.label} must be one of: ${attribute.options.join(", ")}.`, {
            attribute: attribute.key,
            options: attribute.options
          });
        }
        result[attribute.key] = selected;
        break;
      }
      case "BOOLEAN": {
        if (typeof value === "boolean") {
          result[attribute.key] = value;
        } else if (typeof value === "string" && /^(true|false)$/i.test(value.trim())) {
          result[attribute.key] = value.trim().toLowerCase() === "true";
        } else {
          throw attributeError(attribute, `${attribute.label} must be true or false.`);
        }
        break;
      }
      default:
        throw attributeError(attribute, `${attribute.label} has an unsupported attribute type.`);
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

export type EligibleSellerCategory = {
  category: { id: string; name: string; level: number };
  attributeDefinitions: AttributeDefinition[];
};

/**
 * Category eligibility without product attributes.
 *
 * Shared by product validation and by request approval: approving a requested
 * category must not fail merely because a product has not supplied attributes
 * yet, but the category must still be live and publishable in the seller's
 * country.
 */
export async function assertSellerCategoryEligibility(input: {
  categoryId: string;
  countryCode: string;
  db?: TaxonomyDb;
}): Promise<EligibleSellerCategory> {
  const db = input.db ?? prisma;
  const country = input.countryCode.trim().toUpperCase();
  const categoryId = typeof input.categoryId === "string" ? input.categoryId.trim() : "";
  if (!categoryId) throw new ApiError(400, "invalid_category", "Choose a category.");
  if (!country) throw new ApiError(400, "vendor_country_missing", "Your seller account has no operating country.");

  const [category, rows, rules] = await Promise.all([
    db.category.findUnique({
      where: { id: categoryId },
      include: {
        attributes: {
          select: { key: true, label: true, type: true, required: true, options: true },
          orderBy: { key: "asc" }
        }
      }
    }),
    db.category.findMany({
      select: {
        id: true,
        parentId: true,
        name: true,
        level: true,
        isActive: true,
        isSelectable: true,
        deprecatedAt: true,
        sortOrder: true
      }
    }),
    db.categoryCountryRule.findMany({
      where: { countryCode: country },
      select: { categoryId: true, countryCode: true, canPublish: true, note: true }
    })
  ]);

  if (!category) throw new ApiError(400, "invalid_category", "Choose a valid category.");
  if (!category.isActive) throw new ApiError(400, "category_inactive", "This category is not currently available.");
  if (category.deprecatedAt) throw new ApiError(400, "category_deprecated", "This category has been retired.");
  if (!category.isSelectable) {
    throw new ApiError(400, "category_not_selectable", "Products cannot be listed directly in this category.");
  }
  if (category.level > MAX_CATEGORY_LEVEL) {
    throw new ApiError(400, "category_too_deep", "This category is below the deepest supported public level.");
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  if (!isReachable(category, byId)) {
    throw new ApiError(400, "category_unavailable", "This category is hidden because a parent category is unavailable.");
  }

  const rule = effectivePublishRule({
    categoryId: category.id,
    byId,
    rules: rulesByKey(rules),
    countryCode: country
  });
  if (!rule.canPublish) {
    throw new ApiError(403, "category_restricted", rule.restrictionNote ?? "Publishing in this category is restricted.", {
      categoryId: category.id,
      countryCode: country,
      restrictedBy: rule.restrictedBy
    });
  }

  return {
    category: { id: category.id, name: category.name, level: category.level },
    attributeDefinitions: definitions(category.attributes)
  };
}

export type ResolvedProductCategory = EligibleSellerCategory & {
  attributes: Record<string, string | number | boolean> | null;
};

/**
 * Single fail-closed gate for publishing into a category.
 *
 * Used by seller product creation and updates inside the same transaction as
 * the write, so a category cannot be deprecated or restricted between
 * validation and persistence.
 */
export async function resolveSellerProductCategory(input: {
  categoryId: string;
  countryCode: string;
  attributes: unknown;
  db?: TaxonomyDb;
}): Promise<ResolvedProductCategory> {
  const eligible = await assertSellerCategoryEligibility(input);
  return {
    ...eligible,
    attributes: validateProductAttributes(input.attributes, eligible.attributeDefinitions)
  };
}
