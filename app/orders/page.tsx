import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { OrdersPageApi } from "@/components/commerce/naijashop";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Orders",
  description: "Track payment, fulfilment and delivery status for your NaijaDeals orders."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/orders");
  return (
    <Suspense fallback={<div className="rounded-2xl border border-border-soft bg-canvas p-5 font-bold text-muted">Loading orders...</div>}>
      <OrdersPageApi />
    </Suspense>
  );
}
