import { prisma } from "@/lib/prisma";
import { EcosystemHome2026 } from "@/components/home/ecosystem-home-2026";
import { previewAuthorizationForRequest, verticalAccess } from "@/lib/services/core/vertical-activation.service";
import { listEligiblePublicCategoryIds } from "@/lib/services/core/catalog.service";
import { homeRailProducts } from "@/lib/services/core/home-rail";
import { readLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/**
 * The public ecosystem homepage.
 *
 * The four legacy design variants were retired from `/` with the 2026-11
 * direction: every visitor now gets the same light, mobility-led NaijaDeals
 * entrance. The variant code remains in the repository for recovery only; it
 * is no longer rendered here or offered by the public navigation.
 */
export default async function HomePage() {
  const { previewAuthorized } = await previewAuthorizationForRequest();
  // The rail follows the visitor's selected market. The eligibility ids come
  // from the canonical public category tree (active, reachable, selectable,
  // non-fixture, not publish-restricted/unresolved for the country), so a
  // regulated or otherwise ineligible leaf cannot surface a deal here.
  const locale = readLocale();
  const countryCode = locale.country;
  const shop = await verticalAccess("shop", { countryCode, cityCode: locale.city, previewAuthorized }).catch(() => null);
  const canBrowseShop = shop?.accessible === true;
  const eligibleCategoryIds = canBrowseShop
    ? await listEligiblePublicCategoryIds(countryCode).catch(() => [])
    : [];
  const deals =
    eligibleCategoryIds.length > 0
      ? await prisma.product
          .findMany({
            where: {
              status: "ACTIVE",
              isSample: false,
              countryCode,
              categoryId: { in: eligibleCategoryIds },
              vendor: { status: "VERIFIED" }
            },
            orderBy: { createdAt: "desc" },
            take: 40,
            select: {
              id: true,
              name: true,
              slug: true,
              priceKobo: true,
              isSample: true,
              images: { take: 1, select: { url: true } },
              stock: { select: { quantity: true, reserved: true } },
              variants: { where: { isActive: true }, select: { stock: true, reserved: true } },
              // Read server-side only, for the demo-vendor filter below. The
              // mapped HomeProduct sent to the client never includes the owner.
              vendor: { select: { name: true, owner: { select: { email: true } } } }
            }
          })
          .catch(() => [])
      : [];

  const products = homeRailProducts(deals);

  const initialShopAvailability = shop
    ? { available: shop.accessible, status: shop.effective.status }
    : null;
  return <EcosystemHome2026 products={products} initialShopAvailability={initialShopAvailability} />;
}
