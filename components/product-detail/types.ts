import { koboToNaira, type ApiMoney, type ApiProduct } from "@/lib/api-client";
import { COUNTRIES } from "@/lib/config/commerce";

/**
 * The catalogue API returns the stored product row, so `attributes`,
 * `countryCode` and `categoryId` travel with the detail payload even though the
 * shared `ApiProduct` type (used by many surfaces) does not declare them yet.
 * Keep the extension here instead of widening the shared client type.
 */
export type ShopProduct = ApiProduct & {
  attributes?: unknown;
  countryCode?: string;
  categoryId?: string;
};

export type AttributeValue = string | number | boolean;

export type ProductAttributeDefinition = {
  key: string;
  label: string;
  type: string;
  options: string[] | null;
};

export type DisplayAttribute = {
  key: string;
  label: string;
  value: string;
  /** Category definitions are authoritative; stored keys fall back to a label. */
  fromCategoryDefinition: boolean;
};

export type GalleryImage = {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
};

export function productCountryCode(product: ShopProduct) {
  const code = (product.countryCode || "NG").toUpperCase();
  return COUNTRIES[code] ? code : "NG";
}

export function productCurrency(product: ShopProduct) {
  return COUNTRIES[productCountryCode(product)]?.currency ?? "NGN";
}

export function countryName(code: string | null | undefined) {
  const normalised = (code || "NG").toUpperCase();
  return COUNTRIES[normalised]?.name ?? normalised;
}

export function isDemoListing(product: ShopProduct) {
  return product.isDemo === true;
}

export function isSampleListing(product: ShopProduct) {
  return product.isSample === true;
}

export function isContactListing(product: ShopProduct) {
  return product.saleMode === "contact";
}

export function sellerListingsHref(product: ShopProduct) {
  return `/naijashop/search?q=${encodeURIComponent(product.vendor.name)}`;
}

/** Published reviews only; the detail service already filters to APPROVED. */
export function reviewSummary(product: ShopProduct) {
  const count = product.rating?.count ?? 0;
  const average = product.rating?.average ?? null;
  if (count <= 0 || average === null) {
    return { count: 0, average: null as number | null };
  }
  return { count, average };
}

export function moneyText(product: ShopProduct, amount: ApiMoney) {
  return koboToNaira(amount, productCurrency(product));
}
