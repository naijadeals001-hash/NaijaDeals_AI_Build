import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { onboardingFlows } from "@/lib/data/ecosystem";
import { TrustBadge } from "@/components/ui/badge";
import { OnboardingForm } from "@/components/functional/onboarding-form";
import { contactAddress, mailtoFor, type ContactKey } from "@/lib/data/contact-directory";

/**
 * Contact routing per supported onboarding flow. The flows themselves are
 * defined in `onboardingFlows`; this map only chooses the published address and
 * subject, never eligibility or programme terms.
 */
const onboardingContacts: Record<string, { key: ContactKey; label: string; subject: string }> = {
  vendor: { key: "partners", label: "Vendor and partner enquiries", subject: "Vendor onboarding" },
  driver: { key: "drivers", label: "Driver and courier enquiries", subject: "Driver onboarding" },
  restaurant: { key: "partners", label: "Restaurant partnerships", subject: "Restaurant onboarding" },
  creator: { key: "partners", label: "Creator and artist partnerships", subject: "Creator onboarding" },
  host: { key: "partners", label: "Host and property-partner enquiries", subject: "Host onboarding" }
};

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
  const partnerContact = onboardingContacts[flow.slug] ?? onboardingContacts.vendor;
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
      <OnboardingForm type={params.type} />

      <section aria-label="Onboarding contacts" className="rounded-2xl border border-border-soft bg-canvas p-5 text-sm text-muted">
        <p>
          {partnerContact.label}:{" "}
          <a
            href={mailtoFor(partnerContact.key, { subject: partnerContact.subject })}
            className="font-bold text-primary underline-offset-2 hover:underline"
          >
            {contactAddress(partnerContact.key)}
          </a>
        </p>
        <p className="mt-1">
          Onboarding help:{" "}
          <a href={mailtoFor("support")} className="font-bold text-primary underline-offset-2 hover:underline">
            {contactAddress("support")}
          </a>
        </p>
      </section>
    </div>
  );
}
