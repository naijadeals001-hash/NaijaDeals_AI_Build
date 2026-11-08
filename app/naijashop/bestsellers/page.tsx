import type { Metadata } from "next";
import { CategoryBrowse } from "@/components/shop/category-browse";
import { ShopFooter } from "@/components/commerce/shop-footer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bestsellers — NaijaShop", description: "Popular products across NaijaShop departments." };

export default function BestsellersPage() {
  return (
    <>
      <div className="bg-white px-5 pt-4 text-[12px] text-[#565959]">
        Ordered by price, not by sales volume — NaijaShop has no verified sales ranking yet, so we do not claim one.
      </div>
      <CategoryBrowse mode="all" />
      <ShopFooter />
    </>
  );
}
