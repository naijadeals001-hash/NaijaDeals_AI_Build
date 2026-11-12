import { ApiError } from "@/lib/auth/api-error";
import { COUNTRIES } from "@/lib/config/commerce";
import { publicServices } from "@/lib/data/public-services";

/**
 * Shared validation for the Plus+ configuration surface.
 *
 * These checks run on the server for every write. The public page repeats the
 * URL checks defensively because rows may predate a validator change.
 */

export const PLUS_KEYS = /^[a-z0-9][a-z0-9_-]{2,79}$/;
const PLAN_CODES = /^[a-z0-9][a-z0-9_-]{2,49}$/;
const CURRENCY = /^[A-Z]{3}$/;
const LANGUAGE = /^[a-z]{2}(-[A-Za-z0-9]{2,8})*$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function parseKey(value: unknown, field = "key"): string {
  if (typeof value !== "string") throw new ApiError(400, "validation_error", `${field} is required.`);
  const key = value.trim().toLowerCase();
  if (!PLUS_KEYS.test(key)) {
    throw new ApiError(400, "validation_error", `${field} must be 3-80 lowercase letters, digits, hyphens or underscores.`);
  }
  return key;
}

export function parsePlanCode(value: unknown): string {
  if (typeof value !== "string") throw new ApiError(400, "validation_error", "code is required.");
  const code = value.trim().toLowerCase();
  if (!PLAN_CODES.test(code)) {
    throw new ApiError(400, "validation_error", "code must be 3-50 lowercase letters, digits, hyphens or underscores.");
  }
  return code;
}

export function requiredText(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string") throw new ApiError(400, "validation_error", `${field} is required.`);
  const text = value.trim();
  if (!text) throw new ApiError(400, "validation_error", `${field} is required.`);
  if (text.length > max) throw new ApiError(400, "validation_error", `${field} must be ${max} characters or fewer.`);
  if (CONTROL_CHARACTERS.test(text)) throw new ApiError(400, "validation_error", `${field} contains invalid control characters.`);
  return text;
}

export function optionalText(value: unknown, field: string, max = 500): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ApiError(400, "validation_error", `${field} must be text.`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > max) throw new ApiError(400, "validation_error", `${field} must be ${max} characters or fewer.`);
  if (CONTROL_CHARACTERS.test(text)) throw new ApiError(400, "validation_error", `${field} contains invalid control characters.`);
  return text;
}

export function parseLanguage(value: unknown, fallback = "en"): string {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") throw new ApiError(400, "validation_error", "language must be a language tag.");
  const language = value.trim();
  if (!LANGUAGE.test(language)) throw new ApiError(400, "validation_error", "language must be a valid language tag such as en or en-NG.");
  return language;
}

export function parseSortOrder(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1_000_000) {
    throw new ApiError(400, "validation_error", "sortOrder must be an integer between 0 and 1000000.");
  }
  return parsed;
}

export function parseOptionalDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw new ApiError(400, "validation_error", `${field} must be an ISO date.`);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "validation_error", `${field} must be a valid ISO date.`);
  return date;
}

export function parseRequiredDate(value: unknown, field: string): Date {
  const date = parseOptionalDate(value, field);
  if (!date) throw new ApiError(400, "validation_error", `${field} is required.`);
  return date;
}

export function assertWindow(startsAt: Date | null, endsAt: Date | null): void {
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new ApiError(400, "invalid_window", "endsAt must be later than startsAt.");
  }
}

/** BigInt minor units. Accepts a JSON-safe decimal integer string or number. */
export function parsePriceMinor(value: unknown, field = "priceMinor"): bigint | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") throw new ApiError(400, "validation_error", `${field} must be an integer amount.`);
  let text: string;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ApiError(400, "validation_error", `${field} must be a non-negative integer in minor units.`);
    }
    text = String(value);
  } else if (typeof value === "string") {
    text = value.trim();
    if (!/^\d+$/.test(text)) {
      throw new ApiError(400, "validation_error", `${field} must be a non-negative integer in minor units.`);
    }
  } else {
    throw new ApiError(400, "validation_error", `${field} must be a non-negative integer in minor units.`);
  }
  const amount = BigInt(text);
  // 10^15 minor units is far beyond any realistic monthly plan and keeps
  // display formatting and JavaScript boundaries safe.
  if (amount > BigInt("1000000000000000")) {
    throw new ApiError(400, "validation_error", `${field} is too large.`);
  }
  return amount;
}

export function normaliseCurrency(value: unknown, fallback?: string | null): string {
  const raw = value === undefined || value === null || value === "" ? fallback : value;
  if (typeof raw !== "string") throw new ApiError(400, "validation_error", "currency is required.");
  const currency = raw.trim().toUpperCase();
  if (!CURRENCY.test(currency)) throw new ApiError(400, "validation_error", "currency must be a three-letter ISO code.");
  return currency;
}

/** Country codes must exist in the one shared commerce registry. */
export function normaliseCountries(value: unknown, field = "countries"): string[] {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value)) throw new ApiError(400, "validation_error", `${field} must be an array of country codes.`);
  const codes = value.map((entry) => {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new ApiError(400, "validation_error", `${field} must contain only country codes.`);
    }
    return entry.trim().toUpperCase();
  });
  const unknown = codes.filter((code) => !COUNTRIES[code]);
  if (unknown.length > 0) {
    throw new ApiError(400, "unknown_country", `Unknown country code(s): ${[...new Set(unknown)].join(", ")}.`);
  }
  return [...new Set(codes)];
}

/** The configured marketplace countries used for empty-country targeting. */
export function marketplaceCountryCodes(): string[] {
  return Object.values(COUNTRIES)
    .filter((country) => country.enabled)
    .map((country) => country.code);
}


function isProjectPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}

export function isSafeImageUrl(value: string): boolean {
  if (isProjectPath(value)) return true;
  if (!/^https:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Internal project path or an HTTPS destination. Credential-bearing and
 * script URLs are rejected before they can become a rendered link. */
export function isSafeHref(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:") || lower.startsWith("data:")) return false;
  if (isProjectPath(trimmed)) return true;
  if (!/^https:\/\//i.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    return true;
  } catch {
    return false;
  }
}

export function assertImageUrl(value: unknown, field = "imageUrl"): string {
  const text = requiredText(value, field, 2000);
  if (!isSafeImageUrl(text)) {
    throw new ApiError(400, "invalid_url", `${field} must be a project path starting with / or an https URL.`);
  }
  return text;
}

export function assertLinkUrl(value: unknown, field = "href"): string {
  const text = requiredText(value, field, 2000);
  if (!isSafeHref(text)) {
    throw new ApiError(400, "invalid_url", `${field} must be a project path starting with / or an https URL.`);
  }
  return text;
}

export function optionalImageUrl(value: unknown, field = "imageUrl"): string | null {
  if (value === undefined || value === null || value === "") return null;
  return assertImageUrl(value, field);
}

export function optionalLinkUrl(value: unknown, field = "href"): string | null {
  if (value === undefined || value === null || value === "") return null;
  return assertLinkUrl(value, field);
}

/** Image and alternative text travel together: neither is useful alone. */
export function imagePair(imageUrl: unknown, imageAlt: unknown): { imageUrl: string | null; imageAlt: string | null } {
  const url = optionalImageUrl(imageUrl);
  const alt = optionalText(imageAlt === undefined ? null : imageAlt, "imageAlt", 400);
  if (url && !alt) throw new ApiError(400, "validation_error", "imageAlt is required when imageUrl is provided.");
  if (!url && alt) throw new ApiError(400, "validation_error", "imageUrl is required when imageAlt is provided.");
  return { imageUrl: url, imageAlt: alt };
}

export function assertServiceKey(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ApiError(400, "validation_error", "serviceKey must be text.");
  const key = value.trim().toLowerCase();
  if (!publicServices.some((service) => service.key === key)) {
    throw new ApiError(400, "unknown_service", `serviceKey must be one of: ${publicServices.map((service) => service.key).join(", ")}.`);
  }
  return key;
}

export function parseMetadata(value: unknown, field = "metadata"): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "validation_error", `${field} must be a JSON object.`);
  }
  const json = JSON.stringify(value);
  if (json.length > 4000) throw new ApiError(400, "validation_error", `${field} is too large.`);
  return JSON.parse(json) as Record<string, unknown>;
}

/** True when a timestamp window covers `now`. */
export function windowContains(now: Date, startsAt: Date | null, endsAt: Date | null): boolean {
  if (startsAt && startsAt.getTime() > now.getTime()) return false;
  if (endsAt && endsAt.getTime() <= now.getTime()) return false;
  return true;
}

/** Empty country scope targets every configured marketplace country. */
export function targetsMarketplace(countries: readonly string[]): boolean {
  if (countries.length === 0) return true;
  const marketplace = new Set(marketplaceCountryCodes());
  return countries.some((code) => marketplace.has(code));
}

