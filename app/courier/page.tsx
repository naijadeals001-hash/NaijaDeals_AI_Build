import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CourierDashboard } from "@/components/functional/courier-dashboard";
import { CourierFoodOrders } from "@/components/functional/courier-food-orders";
import { PartnerNotifications } from "@/components/functional/partner-notifications";
import { getSessionUser, isCourier } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Courier dashboard",
  description: "Update NaijaSend delivery status and tracking events."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/courier");
  if (!isCourier(user)) redirect("/");
  return (
    <div className="space-y-5">
      <PartnerNotifications />
      <CourierDashboard />
      <CourierFoodOrders />
    </div>
  );
}
