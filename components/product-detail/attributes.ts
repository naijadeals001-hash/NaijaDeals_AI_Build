import type {
  AttributeValue,
  DisplayAttribute,
  ProductAttributeDefinition,
  ShopProduct
} from "./types";

/**
 * Units already encoded in the category attribute key. Labels from the
 * category definition stay authoritative; this only appends the matching unit
 * symbol so a stored number reads as the value the seller entered.
 */
const UNIT_BY_KEY: Record<string, string> = {
  net_weight_kg: "kg",
  net_weight_g: "g",
  capacity_kg: "kg",
  capacity_ml: "ml",
  capacity_litres: "L",
  capacity_va: "VA",
  capacity_persons: "persons",
  battery_capacity_ah: "Ah",
  capacity_kg_per_hour: "kg/hour",
  storage_gb: "GB",
  ram_gb: "GB",
  screen_inches: "inches",
  length_yards: "yd",
  warranty_months: "months",
  warranty_years: "years",
  pack_count: "pcs"
};

const numberFormat = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 });

function humaniseKey(key: string) {
  const text = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return key;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function primitive(value: unknown): AttributeValue | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : typeof entry === "number" ? String(entry) : ""))
      .filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  return null;
}

/**
 * Stored JSON is seller-entered key/value data validated against the category
 * definition on write. Render only what is present: no inferred specs, no
 * "Condition: New" filler and no promises for warranty or compatibility that
 * the seller did not supply.
 */
export function displayAttributes(
  product: ShopProduct,
  definitions: ProductAttributeDefinition[]
): DisplayAttribute[] {
  const stored =
    product.attributes && typeof product.attributes === "object" && !Array.isArray(product.attributes)
      ? (product.attributes as Record<string, unknown>)
      : {};
  const definitionByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const rows: DisplayAttribute[] = [];
  const used = new Set<string>();

  for (const definition of definitions) {
    const value = primitive(stored[definition.key]);
    if (value === null) continue;
    used.add(definition.key);
    rows.push({
      key: definition.key,
      label: definition.label || humaniseKey(definition.key),
      value: formatValue(value, definition.key, definition.options),
      fromCategoryDefinition: true
    });
  }

  // Legacy or moved-category attributes still have a stored key. Humanising the
  // stored key is a faithful label fallback, not an invented specification.
  for (const key of Object.keys(stored).sort((a, b) => a.localeCompare(b))) {
    if (used.has(key)) continue;
    const value = primitive(stored[key]);
    if (value === null) continue;
    rows.push({
      key,
      label: definitionByKey.get(key)?.label || humaniseKey(key),
      value: formatValue(value, key, definitionByKey.get(key)?.options ?? null),
      fromCategoryDefinition: false
    });
  }

  return rows;
}

function formatValue(value: AttributeValue, key: string, options: string[] | null) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    const unit = UNIT_BY_KEY[key];
    return unit ? `${numberFormat.format(value)} ${unit}` : numberFormat.format(value);
  }
  const canonical = options?.find((option) => option.toLowerCase() === value.toLowerCase());
  return canonical ?? value;
}
