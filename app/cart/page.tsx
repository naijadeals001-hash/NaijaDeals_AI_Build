import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ShopCartPage } from "@/components/commerce/naijashop";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Cart",
  description: "Review items in your NaijaDeals cart before checkout."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/cart");
  return (
    <Suspense fallback={<div className="rounded-2xl border border-border-soft bg-canvas p-5 font-bold text-muted">Loading cart...</div>}>
      <ShopCartPage />
    </Suspense>
  );
}
