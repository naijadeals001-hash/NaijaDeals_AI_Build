import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { NaijaPayEscrowPage } from "@/components/pay/escrow-page";

export const metadata: Metadata = {
  title: "Escrow Protection Dashboard",
  description: "Monitor your NaijaDeals order escrow status and release conditions."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/pay/escrow");
  
  return (
    <Suspense fallback={<div className="p-8 text-pay-ink-muted animate-pulse font-bold">Loading escrow...</div>}>
      <NaijaPayEscrowPage />
    </Suspense>
  );
}
