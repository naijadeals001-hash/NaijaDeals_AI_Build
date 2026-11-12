import type { ReactNode } from "react";
import { ShopShell } from "@/components/shop/shop-header";

/**
 * Every /naijashop route renders the same header, panels, single main landmark
 * and Marketplace footer. Adding a route below this layout cannot drift into a
 * landing-only header or a second mobile navigation.
 */
export default function NaijaShopLayout({ children }: { children: ReactNode }) {
  const reviewCatalogue = process.env.NEXT_PUBLIC_REVIEW_CATALOGUE === "1";
  return (
    <>
      {reviewCatalogue ? (
        <div role="note" className="bg-[#07351f] px-4 py-1.5 text-center text-[11px] font-bold text-[#F2D48C]">
          REVIEW CATALOGUE — demonstration departments and products only. Not live supply.
        </div>
      ) : null}
      <ShopShell>{children}</ShopShell>
    </>
  );
}
