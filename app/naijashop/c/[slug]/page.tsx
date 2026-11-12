import type { Metadata } from "next";
import { CategoryBrowse } from "@/components/shop/category-browse";
import { ShopFooter } from "@/components/commerce/shop-footer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Shop by category — NaijaShop", description: "Browse verified Nigerian sellers by department." };

export default function CategoryPage({ params }: { params: { slug: string } }) {
  return (
    <>
      <CategoryBrowse categorySlug={params.slug} />
      <ShopFooter />
    </>
  );
}
