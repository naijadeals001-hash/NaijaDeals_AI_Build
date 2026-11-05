import type { Metadata } from "next";
import { PayLanding } from "@/components/pay/pay-landing";

export const metadata: Metadata = {
  title: "NaijaPay — Your Money. A Brighter Nigeria.",
  description:
    "NaijaPay is the NaijaDeals wallet: one ledger-backed balance for payments, escrow, rides and refunds. Pay. Send. Receive. Do More."
};

export default function Page() {
  return <PayLanding />;
}
