import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ShopCheckoutPage } from "@/components/commerce/naijashop";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Review delivery, escrow fee and payment options for your order."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/checkout");
  return (
    <Suspense fallback={<div className="rounded-2xl border border-border-soft bg-canvas p-5 font-bold text-muted">Loading checkout...</div>}>
      <ShopCheckoutPage />
    </Suspense>
  );
}
