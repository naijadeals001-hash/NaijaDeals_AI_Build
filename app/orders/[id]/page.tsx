import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrderDetailClient } from "@/components/functional/order-detail-client";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Order details", description: "View items, delivery and status for a NaijaDeals order." };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/orders/" + params.id);
  return <OrderDetailClient id={params.id} />;
}
