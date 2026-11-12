import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrderDetailClient } from "@/components/functional/order-detail-client";
import { ShopShell } from "@/components/shop/shop-header";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Order details", description: "View items, delivery and status for a NaijaDeals order." };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=" + encodeURIComponent("/orders/" + params.id));
  return (
    <ShopShell>
      <div className="mx-auto w-full max-w-[1000px] px-3 py-5 sm:px-5 lg:px-8 lg:py-7">
        <OrderDetailClient id={params.id} />
      </div>
    </ShopShell>
  );
}
