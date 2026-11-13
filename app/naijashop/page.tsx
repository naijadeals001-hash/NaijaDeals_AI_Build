import type { Metadata } from "next";
import { Suspense } from "react";
import { NaijaDealsMarketplace } from "@/components/shop/storefront";

export const metadata: Metadata = {
  title: "NaijaDeals Marketplace — retail and bulk buying",
  description:
    "Shop everyday retail listings from sellers across Africa, with demonstration inventory clearly labelled, or start a producer quote for bulk buying and freight through NaijaDeals."
};

export default function Page() {
  return (
    <>
      <Suspense
        fallback={
          <div className="grid min-h-[60vh] place-items-center bg-[#f4f7f2] px-4 py-16 text-center">
            <div>
              <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[#cfe0ca] border-t-[#0b5c33]" aria-hidden />
              <p className="mt-3 text-[12px] font-bold text-[#4b5b51]">Loading the NaijaDeals marketplace…</p>
            </div>
          </div>
        }
      >
        <NaijaDealsMarketplace />
      </Suspense>
    </>
  );
}
