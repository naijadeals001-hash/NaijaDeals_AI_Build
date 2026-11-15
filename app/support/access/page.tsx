import type { Metadata } from "next";
import { Suspense } from "react";
import { GuestAccessExchange } from "@/components/support/guest-access-exchange";

export const metadata: Metadata = {
  title: "Support access — NaijaDeals",
  robots: { index: false, follow: false }
};

export default function SupportAccessPage() {
  return (
    <div className="min-h-screen bg-[#f6f8f5]">
      <Suspense fallback={<main className="mx-auto max-w-xl px-4 py-16 text-[13px] text-[#4b5b51]">Opening…</main>}>
        <GuestAccessExchange />
      </Suspense>
    </div>
  );
}
