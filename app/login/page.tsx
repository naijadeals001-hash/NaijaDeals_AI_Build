import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPage } from "@/components/functional/auth-page";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your NaijaDeals account."
};

export default function Page() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-border-soft bg-canvas p-5 font-bold text-muted">Loading sign in...</div>}>
      <AuthPage mode="login" />
    </Suspense>
  );
}
