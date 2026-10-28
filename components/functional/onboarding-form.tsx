"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useDemoStore } from "@/lib/demo-store";

const categoryOptions: Record<string, string[]> = {
  vendor: ["Electronics", "Fashion", "Beauty", "Home goods", "Market wholesaler"],
  driver: ["Ride hailing", "Executive rides", "Airport corridor", "Delivery bike", "Van logistics"],
  restaurant: ["Buka", "Cloud kitchen", "Quick service", "Fine dining", "Catering"],
  creator: ["Music", "Video", "Podcast", "Live room", "Education"],
  host: ["Shortlet", "Hotel", "Apartment", "Workspace", "Event stay"]
};

export function OnboardingForm({ type }: { type: string }) {
  const store = useDemoStore();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    contactName: store.account.name,
    phone: store.account.phone,
    city: store.account.city,
    category: categoryOptions[type]?.[0] ?? "General",
    notes: ""
  });

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="rounded-2xl border border-border-soft bg-canvas p-5">
      <h2 className="font-display text-2xl font-extrabold">Submit local onboarding profile</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          store.saveSubmission({ ...form, type });
          setSaved(true);
        }}
        className="mt-5 grid gap-4 sm:grid-cols-2"
      >
        <Field label="Business or display name" value={form.businessName} onChange={(value) => update("businessName", value)} />
        <Field label="Contact person" value={form.contactName} onChange={(value) => update("contactName", value)} />
        <Field label="Phone" value={form.phone} onChange={(value) => update("phone", value)} />
        <Field label="City" value={form.city} onChange={(value) => update("city", value)} />
        <label>
          <span className="text-sm font-bold">Category</span>
          <select value={form.category} onChange={(event) => update("category", event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-border-soft bg-surface-low px-3 text-sm font-semibold outline-none focus:border-primary">
            {(categoryOptions[type] ?? ["General"]).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className="text-sm font-bold">Operational notes</span>
          <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-border-soft bg-surface-low p-3 text-sm outline-none focus:border-primary" />
        </label>
        <button disabled={!form.businessName || !form.phone} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
          Save onboarding submission
        </button>
        <Link href="/admin" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-surface-low px-5 font-bold">
          View in admin
        </Link>
      </form>
      {saved ? (
        <div className="mt-5 flex gap-3 rounded-xl bg-primary-soft p-4 text-primary">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm font-bold">Submission saved locally. Admin and super admin now include this onboarding record.</p>
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-sm font-bold">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-border-soft bg-surface-low px-3 text-sm outline-none focus:border-primary" />
    </label>
  );
}
