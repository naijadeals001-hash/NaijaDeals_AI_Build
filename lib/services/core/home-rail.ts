import type { HomeProduct } from "@/components/home/ecosystem-home-2026";
import { availabilityProjection } from "./availability";

/**
 * Homepage rail selection.
 *
 * Kept out of the page module so the eligibility and availability rules can be
 * exercised directly without exporting non-page symbols from `app/page.tsx`
 * (Next's generated page types reject extra exports).
 */

/** Seeded demo/fixture rows must never appear as real deals on the homepage. */
const FIXTURE_NAME = /^(variant fixture|test |upload test|last unit|product test|refund product)/i;

function naira(kobo: bigint | number | string) {
  return `₦${(Number(kobo) / 100).toLocaleString("en-NG")}`;
}

/**
 * Local fixture vendors are used by the test seeds. A listing is only eligible
 * for the homepage rail when it has a real image and a non-fixture vendor; the
 * section is omitted entirely when the catalogue has nothing genuine to show.
 */
function isGenuineListing(product: {
  isSample: boolean;
  name: string;
  slug: string;
  images: { url: string }[];
  vendor: { name: string; owner: { email: string } | null } | null;
}) {
  if (product.isSample) return false;
  if (FIXTURE_NAME.test(product.name) || /mw[0-9a-z]{8,}/i.test(product.slug)) return false;
  if (!product.images[0]?.url) return false;
  if (!product.vendor) return false;
  if (/demo|fixture|preview only/i.test(product.vendor.name)) return false;
  if (product.vendor.owner?.email?.toLowerCase().endsWith("@naijadeals.local")) return false;
  return true;
}

export type HomepageDeal = {
  id: string;
  name: string;
  slug: string;
  priceKobo: bigint | number | string;
  isSample: boolean;
  images: Array<{ url: string }>;
  stock: { quantity: number; reserved: number } | null;
  variants: Array<{ stock: number; reserved: number; isActive?: boolean | null }>;
  vendor: { name: string; owner: { email: string } | null } | null;
};

/**
 * Select the homepage rail from catalogue rows.
 *
 * Variant stock is authoritative for variant products; product-level stock is
 * never added to it or used as a fallback. Rows without available stock never
 * reach client props.
 */
export function homeRailProducts(deals: HomepageDeal[]): HomeProduct[] {
  return deals
    .filter((product) => availabilityProjection({ variants: product.variants, stock: product.stock }).available > 0)
    .filter(isGenuineListing)
    .slice(0, 4)
    .map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: naira(product.priceKobo),
      image: product.images[0]?.url ?? null
    }));
}
