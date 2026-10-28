import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { NaijaPayPage } from "@/components/commerce/naijashop";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "NaijaPay wallet",
  description: "Your ledger-backed NaijaPay wallet balance and escrow holds."
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/wallet");
  return (
    <Suspense fallback={<div className="rounded-2xl border border-border-soft bg-canvas p-5 font-bold text-muted">Loading wallet...</div>}>
      <NaijaPayPage />
    </Suspense>
  );
}
