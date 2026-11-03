import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KitchenOrders } from "@/components/commerce/kitchen-orders";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Kitchen orders" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/restaurant");
  return <KitchenOrders />;
}
