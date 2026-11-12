import type { Metadata } from "next";
import { CategoryBrowse } from "@/components/shop/category-browse";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "All departments — NaijaShop", description: "Every department on NaijaShop." };

export default function CategoriesPage() {
  return (
    <>
      <CategoryBrowse mode="all" />
    </>
  );
}
