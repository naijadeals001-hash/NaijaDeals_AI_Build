import type { Metadata } from "next";
import Link from "next/link";
import { CategoryBrowse } from "@/components/shop/category-browse";
import { ShopFooter } from "@/components/commerce/shop-footer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Shop by category — NaijaShop", description: "Browse verified Nigerian sellers by department." };

export default function CategoryPage({ params }: { params: { slug: string } }) {
  const label = params.slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return (
    <>
      <CategoryBrowse categorySlug={params.slug} />
      <p className="bg-white px-5 pb-6 text-[12px] text-[#565959]">
        Browsing <span className="font-semibold">{label}</span>. <Link href="/naijashop/categories" className="text-[#007185] hover:underline">See all departments</Link>.
      </p>
      <ShopFooter />
    </>
  );
}
