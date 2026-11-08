import type { Metadata } from "next";
import { CategoryBrowse } from "@/components/shop/category-browse";
import { ShopFooter } from "@/components/commerce/shop-footer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search — NaijaShop", description: "Search NaijaShop products." };

export default function ShopSearchPage({ searchParams }: { searchParams: { q?: string } }) {
  return (
    <>
      <CategoryBrowse mode="all" initialQuery={searchParams.q ?? ""} />
      <ShopFooter />
    </>
  );
}
