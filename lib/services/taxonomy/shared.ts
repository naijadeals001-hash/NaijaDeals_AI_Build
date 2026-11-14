import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/auth/guard";

/**
 * Shared taxonomy invariants.
 *
 * The tree is intentionally shallow: level 0 is a department, level 1 a
 * category and level 2 the deepest selectable subcategory. Every public and
 * seller consumer relies on that shape, so creation and reparenting enforce it
 * rather than letting a deeper node disappear from navigation.
 */
export const MAX_CATEGORY_LEVEL = 2;
export const CATEGORY_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ATTRIBUTE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export const ALIAS_LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;
export const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

export type CategorySummary = {
  id: string;
  parentId: string | null;
  name: string;
  level: number;
  isActive: boolean;
  isSelectable: boolean;
  deprecatedAt: Date | null;
  sortOrder: number;
  /**
   * Regulated nodes need an explicit country rule. Optional because a few
   * read-only projections (public catalogue search) do not select the column;
   * publishing gates select it and treat only an explicit `true` as regulated.
   */
  isRegulated?: boolean;
};

export type CountryRuleRow = {
  categoryId: string;
  countryCode: string;
  canPublish: boolean;
  note: string | null;
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sortCategoryRows<T extends { sortOrder: number; name: string; id: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id)
  );
}

export function normaliseCountryCode(value: unknown, field = "Country code"): string {
  const countryCode = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!COUNTRY_CODE_PATTERN.test(countryCode)) {
    throw new ApiError(400, "validation_error", `${field} must be a two-letter ISO country code.`);
  }
  return countryCode;
}

export function readText(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") throw new ApiError(400, "validation_error", `${field} is required.`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new ApiError(400, "validation_error", `${field} must be ${min}-${max} characters.`);
  }
  return trimmed;
}

/** Undefined means "not supplied"; null or a blank string means "clear". */
export function readNullableText(value: unknown, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new ApiError(400, "validation_error", `${field} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ApiError(400, "validation_error", `${field} must be ${max} characters or fewer.`);
  return trimmed || null;
}

export function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new ApiError(400, "validation_error", `${field} must be true or false.`);
  return value;
}

export function readInteger(value: unknown, field: string, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ApiError(400, "validation_error", `${field} must be a whole number between ${min} and ${max}.`);
  }
  return parsed;
}

/**
 * Taxonomy imagery is either an HTTPS location or a path inside the project's
 * public assets. Traversal, protocol-relative URLs and non-HTTPS remotes are
 * rejected so a category image can never point outside the approved surface.
 */
export function readImagePath(value: unknown, field = "Image"): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new ApiError(400, "invalid_image", `${field} must be an image location.`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 500) throw new ApiError(400, "invalid_image", `${field} must be 500 characters or fewer.`);
  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith("//") || trimmed.includes("\\") || trimmed.split("/").includes("..")) {
      throw new ApiError(400, "invalid_image", `${field} must stay inside the project's public assets.`);
    }
    return trimmed;
  }
  if (!/^https:\/\//i.test(trimmed)) {
    throw new ApiError(400, "invalid_image", `${field} must be an HTTPS URL or a project path starting with "/".`);
  }
  return trimmed;
}

export function readDate(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new ApiError(400, "validation_error", `${field} must be an ISO date or null.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ApiError(400, "validation_error", `${field} must be a valid ISO date.`);
  return parsed;
}

export function normaliseOptions(value: Prisma.JsonValue | null | undefined): string[] | null {
  if (!Array.isArray(value)) return null;
  const options = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 100);
  return options.length ? [...new Set(options)] : null;
}

export function categoryPath(categoryId: string, byId: Map<string, { id: string; parentId: string | null; name: string }>): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(categoryId);
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.join(" › ");
}

/**
 * A node is reachable only when the complete ancestor chain exists and is
 * active and non-deprecated. A selectable node under a hidden department must
 * not become publishable after the parent is switched off.
 */
export function isReachable(
  category: { id: string; parentId: string | null },
  byId: Map<string, { parentId: string | null; isActive: boolean; deprecatedAt: Date | null }>
): boolean {
  const seen = new Set<string>([category.id]);
  let parentId = category.parentId;
  while (parentId) {
    if (seen.has(parentId)) return false;
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return false;
    if (!parent.isActive || parent.deprecatedAt) return false;
    parentId = parent.parentId;
  }
  return true;
}

/** Stable machine reason for a publish restriction; UI can branch on it. */
export type PublishRestrictionReason = "country_rule" | "market_eligibility_unresolved";

export type EffectivePublishRule = {
  canPublish: boolean;
  restrictionNote: string | null;
  /** Null when publishable; otherwise the machine-checkable cause. */
  restrictionReason: PublishRestrictionReason | null;
  restrictedBy: string | null;
};

/**
 * Country publication rights are evaluated along the ancestor chain. A
 * disallowing rule on the node or any ancestor restricts the branch; the
 * nearest disallowing rule supplies the explanation. This keeps a market-level
 * switch meaningful without silently publishing into a disabled department.
 *
 * Regulated goods are fail-closed: an `isRegulated` node without an explicit
 * rule for the requested country is not publishable. The absence of a rule is
 * unresolved market eligibility, never permission, and only an explicit rule
 * (allow or deny) resolves it. Rules on ancestors continue to apply.
 */
export function effectivePublishRule(input: {
  categoryId: string;
  byId: Map<string, CategorySummary>;
  rules: Map<string, CountryRuleRow>;
  countryCode: string;
}): EffectivePublishRule {
  const countryCode = input.countryCode.trim().toUpperCase();
  const seen = new Set<string>();
  let current = input.byId.get(input.categoryId);
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    const rule = input.rules.get(`${current.id}:${countryCode}`);
    if (rule) {
      if (!rule.canPublish) {
        return {
          canPublish: false,
          restrictionNote:
            rule.note?.trim() || `Publishing into ${current.name} is currently restricted for ${countryCode}.`,
          restrictionReason: "country_rule",
          restrictedBy: current.id
        };
      }
    } else if (current.isRegulated === true) {
      return {
        canPublish: false,
        restrictionNote: `Publishing into ${current.name} is not approved for ${countryCode} yet; an explicit market rule is required.`,
        restrictionReason: "market_eligibility_unresolved",
        restrictedBy: current.id
      };
    }
    current = current.parentId ? input.byId.get(current.parentId) : undefined;
  }
  return { canPublish: true, restrictionNote: null, restrictionReason: null, restrictedBy: null };
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}
