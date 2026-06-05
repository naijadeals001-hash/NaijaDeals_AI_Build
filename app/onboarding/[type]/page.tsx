import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { onboardingFlows } from "@/lib/data/ecosystem";
import { TrustBadge } from "@/components/ui/badge";

export function generateStaticParams() {
  return onboardingFlows.map((flow) => ({ type: flow.slug }));
}

export function generateMetadata({ params }: { params: { type: string } }): Metadata {
  const flow = onboardingFlows.find((item) => item.slug === params.type);
  return {
    title: flow?.title ?? "Onboarding",
    description: "NaijaDeals onboarding flow."
  };
}

export default function OnboardingPage({ params }: { params: { type: string } }) {
  const flow = onboardingFlows.find((item) => item.slug === params.type) ?? onboardingFlows[0];
  const Icon = flow.icon;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-2xl border border-border-soft bg-canvas p-6 shadow-sm">
        <TrustBadge>Auth-ready onboarding</TrustBadge>
        <Icon className="mt-5 h-10 w-10 text-primary" />
        <h1 className="mt-4 font-display text-3xl font-extrabold sm:text-4xl">{flow.title}</h1>
        <p className="mt-3 text-muted">A backend-ready onboarding structure for KYC, profile data, service setup, wallet payouts, and verification status.</p>
      </section>
      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <div className="space-y-4">
          {flow.steps.map((step, index) => (
            <div key={step} className="flex gap-4 rounded-xl bg-surface-low p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-white">{index + 1}</span>
              <div className="flex-1">
                <h2 className="font-bold">{step}</h2>
                <p className="mt-1 text-sm text-muted">Collect, validate, and persist this data through a future API endpoint.</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-primary" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
