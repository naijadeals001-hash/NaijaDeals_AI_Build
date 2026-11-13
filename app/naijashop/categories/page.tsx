import type { Metadata } from "next";
import { CategoryDirectory } from "@/components/shop/category-directory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All categories — NaijaShop",
  description:
    "Every published NaijaShop category, grouped by department, with listing counts and links into the catalogue. Demonstration inventory is labelled; counts are not live-stock claims."
};

export default function CategoriesPage() {
  return <CategoryDirectory />;
}
