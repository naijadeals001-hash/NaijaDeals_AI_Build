import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TrackingPageReal } from "@/components/commerce/naijashop";
import { ShopShell } from "@/components/shop/shop-header";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Delivery tracking",
  description: "Track pickup, transit and delivery events for a NaijaDeals order."
};

export const dynamic = "force-dynamic";

export default async function TrackingPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/tracking/${encodeURIComponent(params.id)}`);
  return (
    <ShopShell>
      <div className="mx-auto w-full max-w-[1000px] px-3 py-5 sm:px-5 lg:px-8 lg:py-7">
        <TrackingPageReal id={params.id} />
      </div>
    </ShopShell>
  );
}
