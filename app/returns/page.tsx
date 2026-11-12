import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ReturnsCasePage } from "@/components/shop/returns-case";
import { ShopShell } from "@/components/shop/shop-header";
import { getSessionUser, isVendor } from "@/lib/auth/session";

/**
 * The dedicated customer return-case journey: eligibility, real return
 * requests, seller decisions, the recorded timeline and a separate refund
 * status. `/orders` stays the order-tracking surface and links here.
 */
export const metadata: Metadata = {
  title: "Returns & refunds",
  description: "Raise a return, follow seller decisions and see recorded refund status for your NaijaDeals orders."
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
            <div
              aria-busy="true"
              className="rounded-2xl border border-[#dce6d8] bg-white p-5 text-sm font-bold text-[#4b5b51]"
            >
              Loading returns and refunds…
            </div>
          }
        >
          <ReturnsCasePage showSellerTools={isVendor(user)} />
        </Suspense>
      </div>
    </ShopShell>
  );
}
