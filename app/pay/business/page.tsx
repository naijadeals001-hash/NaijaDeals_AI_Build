import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NaijaPayBusinessDashboard } from "@/components/pay/business-dashboard";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "NaijaPay Business — Merchant finance",
  description: "Escrow settlements, payouts and sales for NaijaDeals merchants."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/pay/business");
  return <NaijaPayBusinessDashboard />;
}
