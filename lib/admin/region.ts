/**
 * Administrative region filter.
 *
 * Regions are derived from the country catalogue (`COUNTRIES`), never hard-coded:
 * adding or enabling a country there makes it selectable here with no code change.
 * The filter is country-level because the schema records `countryCode`, not a
 * normalised city column.
 */
import { COUNTRIES } from "@/lib/config/commerce";

export type AdminRegion = "ALL" | string;

export type RegionOption = { value: string; label: string };

/** Enabled countries, alphabetical, plus the genuine "All regions" option. */
export function adminRegionOptions(): RegionOption[] {
  const countries = Object.values(COUNTRIES)
    .filter((country) => country.enabled)
    .sort((a, b) => a.name.localeCompare(b.name));
  return [
    { value: "all", label: "All regions" },
    ...countries.map((country) => ({ value: country.code, label: country.name }))
  ];
}

function allowedCodes(): Set<string> {
  return new Set(
    Object.values(COUNTRIES)
      .filter((country) => country.enabled)
      .map((country) => country.code.toUpperCase())
  );
}

/** Normalise a query-string value; unknown or disabled input falls back to ALL. */
export function normalizeRegion(raw: string | null | undefined): AdminRegion {
  const value = String(raw ?? "").trim().toUpperCase();
  if (value === "" || value === "ALL") return "ALL";
  return allowedCodes().has(value) ? value : "ALL";
}

/** Lower-case value used by the <select>. */
export function regionOptionValue(region: AdminRegion): string {
  return region === "ALL" ? "all" : region;
}

/**
 * A scoped staff member may never widen their region through the URL, so the
 * requested value is clamped to their assigned country.
 */
export function resolveAdminRegion(
  requested: string | null | undefined,
  scopeCountryCode: string | null | undefined
): { region: AdminRegion; restricted: boolean } {
  const scope = String(scopeCountryCode ?? "").trim().toUpperCase();
  if (scope && allowedCodes().has(scope)) {
    return { region: scope, restricted: true };
  }
  return { region: normalizeRegion(requested), restricted: false };
}

/** Country recorded on an admin row, if any. */
export function rowCountry(row: Record<string, any>): string | undefined {
  const candidates = [
    row.countryCode,
    row.scopeCountryCode,
    row.vendor?.countryCode,
    row.customer?.countryCode,
    row.order?.countryCode
  ];
  const match = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return match ? String(match).toUpperCase() : undefined;
}

/** Keep rows whose country matches; ALL keeps everything. */
export function filterRowsByRegion<T extends Record<string, any>>(rows: T[], region: AdminRegion): T[] {
  if (region === "ALL") return rows;
  return rows.filter((row) => rowCountry(row) === region);
}
