import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TrackingPageReal } from "@/components/commerce/naijashop";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Delivery tracking",
  description: "Track pickup, transit and delivery events for a NaijaDeals order."
};

export const dynamic = "force-dynamic";

export default async function TrackingPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/tracking/${encodeURIComponent(params.id)}`);
  return <TrackingPageReal id={params.id} />;
}
