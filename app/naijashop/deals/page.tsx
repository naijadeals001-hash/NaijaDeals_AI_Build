import type { Metadata } from "next";
import { CategoryBrowse } from "@/components/shop/category-browse";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Today's deals — NaijaShop", description: "Lowest-priced listings from sellers across Africa; demonstration inventory is clearly labelled." };

export default function DealsPage() {
  return (
    <>
      <CategoryBrowse mode="deals" />
    </>
  );
}
