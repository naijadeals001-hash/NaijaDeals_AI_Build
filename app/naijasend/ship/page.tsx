import type { Metadata } from "next";
import { Suspense } from "react";
import { SendHeading, SendPage } from "@/components/send/send-page";
import { ShipForm } from "@/components/send/ship-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ship now — NaijaSend", alternates: { canonical: "/naijasend/ship" } };

export default function ShipPage() {
  return (
    <SendPage>
      <SendHeading eyebrow="Ship Now" title="Request a shipment" description="Tell us what you are moving. Verified independent providers respond with itemised quotes you can compare before you pay." />
      <Suspense fallback={<p className="text-[12px] text-[#5d6d64]">Loading form…</p>}>
        <ShipForm />
      </Suspense>
    </SendPage>
  );
}
