/**
 * Price per agricultural unit — the unit is always part of the label.
 * Kept free of "use client" so server and client code can share it.
 */
export function priceLabel(priceKobo: string | bigint, unit: string) {
  return `₦${(Number(priceKobo) / 100).toLocaleString("en-NG")} / ${unit}`;
}
