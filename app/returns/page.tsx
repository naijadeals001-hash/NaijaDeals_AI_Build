import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { OrdersPageApi } from "@/components/commerce/naijashop";
import { ShopShell } from "@/components/shop/shop-header";
import { getSessionUser } from "@/lib/auth/session";

/**
 * `/returns` mirrors the returns and refunds view that already lives on the
 * orders page. The catch-all route previously rendered it with the ecosystem
 * chrome; this explicit route keeps the single Marketplace shell instead.
 */
export const metadata: Metadata = {
  title: "Returns",
  description: "View return and refund status for your NaijaDeals orders."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/returns");
  return (
    <ShopShell>
      <div className="mx-auto w-full max-w-[1180px] px-3 py-5 sm:px-5 lg:px-8 lg:py-7">
        <Suspense
          fallback={
            <div className="rounded-2xl border border-[#dce6d8] bg-white p-5 text-sm font-bold text-[#4b5b51]">
              Loading returns…
            </div>
          }
        >
          <OrdersPageApi mode="returns" />
        </Suspense>
      </div>
    </ShopShell>
  );
}
