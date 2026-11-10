import type { Metadata } from "next";
import { Suspense } from "react";
import { AffiliateHome } from "@/components/affiliate/affiliate-home";

export const metadata: Metadata = {
  title: "NaijaDeals Affiliate",
  description: "Earn commission when people you refer complete a paid, fulfilled order."
};

export default function Page() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-border-soft bg-canvas p-5 font-bold text-muted">Loading the affiliate programme…</div>}>
      <AffiliateHome />
    </Suspense>
  );
}
