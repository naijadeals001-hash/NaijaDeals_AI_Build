import type { Metadata } from "next";
import { Suspense } from "react";
import { NaijaShopPage } from "@/components/commerce/naijashop";

export const metadata: Metadata = {
  title: "NaijaShop marketplace",
  description: "Shop verified Nigerian sellers with escrow-protected payment and tracked delivery."
};

export default function Page() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-border-soft bg-canvas p-5 font-bold text-muted">Loading marketplace...</div>}>
      <NaijaShopPage />
    </Suspense>
  );
}
