/**
 * The single stock projection for catalogue, account and Control Center UI.
 *
 * Variant stock is authoritative whenever at least one active variant exists.
 * Product-level stock is never added to variant stock and is never displayed as
 * if it were available for a variant-managed product.
 */
export type AvailabilityVariant = {
  isActive?: boolean | null;
  stock: number;
  reserved: number;
};

export type AvailabilityStock = {
  quantity: number;
  reserved: number;
};

export type AvailabilityProjection = {
  /** Units a customer can add now. */
  available: number;
  /** Physical units the seller reports, before reservations. */
  onHand: number;
  activeVariants: number;
  variantManaged: boolean;
  /** True when a variant product requires an explicit option choice. */
  requiresVariantSelection: boolean;
  /** False when no authoritative stock source was supplied. */
  known: boolean;
};

function nonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function availabilityProjection(input: {
  variants?: AvailabilityVariant[] | null;
  stock?: AvailabilityStock | null;
}): AvailabilityProjection {
  const variants = Array.isArray(input.variants)
    ? input.variants.filter((variant) => variant?.isActive !== false)
    : [];
  if (variants.length > 0) {
    const available = variants.reduce(
      (total, variant) => total + Math.max(nonNegative(variant.stock) - nonNegative(variant.reserved), 0),
      0
    );
    const onHand = variants.reduce((total, variant) => total + nonNegative(variant.stock), 0);
    return {
      available,
      onHand,
      activeVariants: variants.length,
      variantManaged: true,
      requiresVariantSelection: true,
      known: true
    };
  }
  const stock = input.stock;
  return {
    available: stock ? Math.max(nonNegative(stock.quantity) - nonNegative(stock.reserved), 0) : 0,
    onHand: stock ? nonNegative(stock.quantity) : 0,
    activeVariants: 0,
    variantManaged: false,
    requiresVariantSelection: false,
    known: Boolean(stock)
  };
}
