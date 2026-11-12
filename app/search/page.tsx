import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchPage } from "@/components/commerce/naijashop";
import { ShopShell } from "@/components/shop/shop-header";

export const metadata: Metadata = {
  title: "Search",
  description: "Search live NaijaShop product inventory by category and price."
};

export default function Page() {
  return (
    <ShopShell>
      <div className="mx-auto w-full max-w-[1180px] px-3 py-5 sm:px-5 lg:px-8 lg:py-7">
        <Suspense
          fallback={
            <div className="rounded-2xl border border-[#dce6d8] bg-white p-5 text-sm font-bold text-[#4b5b51]">
              Loading search…
            </div>
          }
        >
          <SearchPage />
        </Suspense>
      </div>
    </ShopShell>
  );
}
