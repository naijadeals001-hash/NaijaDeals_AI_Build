import { Suspense } from "react";
import { NaijaShopPage } from "@/components/commerce/naijashop";

export function HomePage() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-border-soft bg-canvas p-5 font-bold text-muted">Loading marketplace...</div>}>
      <NaijaShopPage />
    </Suspense>
  );
}
