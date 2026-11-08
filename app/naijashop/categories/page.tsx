import type { Metadata } from "next";
import { CategoryBrowse } from "@/components/shop/category-browse";
import { ShopFooter } from "@/components/commerce/shop-footer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "All departments — NaijaShop", description: "Every department on NaijaShop." };

export default function CategoriesPage() {
  return (
    <>
      <CategoryBrowse mode="all" />
      <ShopFooter />
    </>
  );
}
