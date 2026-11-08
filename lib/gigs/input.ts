import { ApiError } from "@/lib/auth/api-error";

/** Parse a kobo amount that may arrive as an integer string or a safe number. */
export function requireMoney(value: unknown, field: string): bigint {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(text)) throw new ApiError(400, "invalid_amount", `${field} must be a whole number of kobo.`);
  const amount = BigInt(text);
  if (amount <= BigInt(0)) throw new ApiError(400, "invalid_amount", `${field} must be greater than zero.`);
  return amount;
}

export function optionalMoney(value: unknown, field: string): bigint | null {
  if (value === undefined || value === null || value === "") return null;
  return requireMoney(value, field);
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new ApiError(400, "invalid_value", `${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function optionalDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "invalid_date", `${field} is not a valid date.`);
  return date;
}

export function optionalInt(value: unknown, field: string, min: number, max: number): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ApiError(400, "invalid_number", `${field} must be a whole number between ${min} and ${max}.`);
  }
  return number;
}

export function stringList(value: unknown, field: string, max = 10): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max) {
    throw new ApiError(400, "invalid_list", `${field} must be a list of at most ${max} items.`);
  }
  return value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new ApiError(400, "invalid_list", `${field} contains an invalid item.`);
    }
    return item.trim().slice(0, 120);
  });
}

export function pageParams(url: string) {
  const params = new URL(url).searchParams;
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = Math.min(48, Math.max(1, Number(params.get("pageSize") ?? 12) || 12));
  return { params, page, pageSize };
}
