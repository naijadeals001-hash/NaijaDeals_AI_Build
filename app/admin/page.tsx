import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/functional/admin-dashboard";
import { getSessionUser, isAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Control Center",
  description: "NaijaDeals administration for orders, sellers, payments, deliveries and payouts."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdmin(user)) redirect("/");
  return <AdminDashboard />;
}
