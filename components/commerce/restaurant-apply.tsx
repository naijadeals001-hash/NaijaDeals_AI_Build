"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Application {
  id: string;
  kitchenName: string;
  cuisine: string;
  market: string;
  address: string;
  phone: string;
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  note: string | null;
}

export function RestaurantApply() {
  const router = useRouter();
  const [application, setApplication] = useState<Application | null>(null);
  const [restaurant, setRestaurant] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ kitchenName: "", cuisine: "", market: "", address: "", phone: "" });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/restaurant/application", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (res.ok) {
          setApplication(body.application ?? null);
          setRestaurant(body.restaurant ?? null);
          if (body.application) {
            setForm({
              kitchenName: body.application.kitchenName ?? "",
              cuisine: body.application.cuisine ?? "",
              market: body.application.market ?? "",
              address: body.application.address ?? "",
              phone: body.application.phone ?? ""
            });
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/restaurant/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Submit failed with HTTP ${res.status}`);
      setApplication(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit the application.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="rounded-2xl border border-border-soft bg-canvas p-6 text-sm text-muted">Loading application…</p>;

  if (restaurant) {
    return (
      <section className="rounded-2xl border border-border-soft bg-canvas p-6">
        <p className="text-xs font-black uppercase tracking-wide text-primary">Kitchen approved</p>
        <h1 className="font-display text-2xl font-extrabold">{restaurant.name}</h1>
        <p className="mt-1 text-sm text-muted">Your kitchen is live. Publish your first menu item.</p>
        <button type="button" onClick={() => router.push("/restaurant")} className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">Open kitchen workspace</button>
      </section>
    );
  }

  if (application && application.status === "SUBMITTED") {
    return (
      <section className="rounded-2xl border border-border-soft bg-canvas p-6">
        <p className="text-xs font-black uppercase tracking-wide text-primary">Application received</p>
        <h1 className="font-display text-2xl font-extrabold">{application.kitchenName}</h1>
        <p className="mt-1 text-sm text-muted">An administrator is reviewing your kitchen. You will get an update when it is approved.</p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs font-bold uppercase text-muted">Cuisine</dt><dd>{application.cuisine}</dd></div>
          <div><dt className="text-xs font-bold uppercase text-muted">Delivery area</dt><dd>{application.market}</dd></div>
          <div><dt className="text-xs font-bold uppercase text-muted">Address</dt><dd>{application.address}</dd></div>
          <div><dt className="text-xs font-bold uppercase text-muted">Phone</dt><dd>{application.phone}</dd></div>
        </dl>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <p className="text-xs font-black uppercase tracking-wide text-primary">NaijaEats partner</p>
        <h1 className="font-display text-3xl font-extrabold">Apply to run a kitchen</h1>
        <p className="mt-1 text-sm text-muted">Approval gives you a kitchen workspace where you publish your menu to customers in your delivery area.</p>
      </header>
      {application?.status === "REJECTED" ? (
        <p className="rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-bold text-[#991B1B]">
          Your previous application was rejected: {application.note ?? "No reason given."} You can correct the details and submit again.
        </p>
      ) : null}
      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold uppercase tracking-wide text-muted">Kitchen name
            <input value={form.kitchenName} onChange={(e) => setForm({ ...form, kitchenName: e.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted">Cuisine
            <input value={form.cuisine} onChange={(e) => setForm({ ...form, cuisine: e.target.value })} placeholder="Nigerian home cooking" className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted">Delivery area
            <input value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} placeholder="Yaba, Lagos" className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted">Phone
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted sm:col-span-2">Kitchen address
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink" />
          </label>
        </div>
        {error ? <p role="alert" className="mt-3 rounded-lg border border-crimson/30 bg-crimson-soft p-2 text-xs font-bold text-[#991B1B]">{error}</p> : null}
        <button type="button" onClick={() => void submit()} disabled={saving || !form.kitchenName || !form.cuisine || !form.market || !form.address || !form.phone} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-extrabold text-white disabled:opacity-50">
          {saving ? "Submitting…" : "Submit application"}
        </button>
      </section>
      <p className="text-center text-xs text-muted">
        Already approved? <Link href="/restaurant" className="font-bold text-primary underline">Open your kitchen</Link>
      </p>
    </div>
  );
}
