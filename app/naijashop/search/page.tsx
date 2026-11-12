import type { Metadata } from "next";
import { CategoryBrowse } from "@/components/shop/category-browse";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search — NaijaShop", description: "Search NaijaShop products." };

export default function ShopSearchPage({ searchParams }: { searchParams: { q?: string } }) {
  return (
    <>
      <CategoryBrowse mode="all" initialQuery={searchParams.q ?? ""} />
    </>
  );
}
