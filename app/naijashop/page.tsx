import type { Metadata } from "next";
import { Suspense } from "react";
import { NaijaDealsMarketplace } from "@/components/shop/storefront";
import { readLocale } from "@/lib/i18n/server";
import {
  previewAuthorizationForRequest,
  unavailableMessage,
  verticalAccess,
  verticalDefinition
} from "@/lib/services/core/vertical-activation.service";

export const metadata: Metadata = {
  title: "NaijaDeals Marketplace — shop everyday retail",
  description:
    "Browse retail shelves for phones, computing, home, fashion, groceries, power, beauty and gaming from sellers across Africa. Demonstration listings are labelled; bulk buying and freight stay available through NaijaDeals."
};

export default async function Page() {
  const { country, city } = readLocale();
  const { previewAuthorized } = await previewAuthorizationForRequest();
  const shop = await verticalAccess("shop", {
    countryCode: country,
    cityCode: city,
    previewAuthorized
  }).catch(() => null);
  const initialShopAvailability = shop
    ? {
        available: shop.accessible,
        status: shop.effective.status,
        message: shop.accessible
          ? null
          : unavailableMessage(verticalDefinition("shop"), shop.effective)
      }
    : null;
  return (
    <>
      <Suspense
        fallback={
          <div className="grid min-h-[60vh] place-items-center bg-[#f4f7f2] px-4 py-16 text-center">
            <div>
              <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[#cfe0ca] border-t-[#0b5c33]" aria-hidden />
              <p className="mt-3 text-[12px] font-bold text-[#4b5b51]">Loading the NaijaDeals marketplace…</p>
            </div>
          </div>
        }
      >
        <NaijaDealsMarketplace initialShopAvailability={initialShopAvailability} />
      </Suspense>
    </>
  );
}
