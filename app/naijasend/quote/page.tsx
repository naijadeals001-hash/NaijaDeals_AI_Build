import type { Metadata } from "next";
import { Suspense } from "react";
import { SendHeading, SendPage } from "@/components/send/send-page";
import { ShipForm } from "@/components/send/ship-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Get a quote — NaijaSend", alternates: { canonical: "/naijasend/quote" } };

/** Mode/category entry points from the homepage land here with the selection applied. */
export default function QuotePage() {
  return (
    <SendPage>
      <SendHeading eyebrow="Get a Quote" title="Get a shipping quote" description="Providers quote from your details, so a complete request gets faster, more accurate offers. Nothing is charged until you book." />
      <Suspense fallback={<p className="text-[12px] text-[#5d6d64]">Loading form…</p>}>
        <ShipForm />
      </Suspense>
    </SendPage>
  );
}
