import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPage } from "@/components/functional/auth-page";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a NaijaDeals account to buy or apply to sell."
};

export default function Page() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-border-soft bg-canvas p-5 font-bold text-muted">Loading registration...</div>}>
      <AuthPage mode="register" />
    </Suspense>
  );
}
