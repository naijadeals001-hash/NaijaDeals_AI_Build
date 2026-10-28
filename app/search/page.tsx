import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchPage } from "@/components/commerce/naijashop";

export const metadata: Metadata = {
  title: "Search",
  description: "Search live NaijaShop product inventory by category and price."
};

export default function Page() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-border-soft bg-canvas p-5 font-bold text-muted">Loading search...</div>}>
      <SearchPage />
    </Suspense>
  );
}
