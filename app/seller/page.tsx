import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SellerDashboard } from "@/components/functional/seller-dashboard";
import { getSessionUser, isVendor } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Seller dashboard",
  description: "Manage NaijaDeals products, orders, stock and returns."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/seller");
  if (!isVendor(user)) redirect("/sell");
  return <SellerDashboard />;
}
