"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, PackageCheck, Plus, Truck } from "lucide-react";
import { FRESH_CATEGORIES } from "@/lib/services/fresh/catalogue";
import { FRESH_LABELS } from "@/lib/services/fresh/labels";

const field = "mt-0.5 w-full rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-normal ring-1 ring-[#dfe6e1] focus:outline-none focus:ring-2 focus:ring-[#0b5c33]";

export function ListingForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<{ name: string; category: string; unit: string; priceNaira: string; quantity: string; minimumOrder: string; description: string }>({ name: "", category: FRESH_CATEGORIES[0].slug, unit: "kg", priceNaira: "", quantity: "", minimumOrder: "1", description: "" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    const response = await fetch("/api/fresh/farms", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, priceNaira: Number(form.priceNaira), quantity: Number(form.quantity), minimumOrder: Number(form.minimumOrder) })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setMessage(body.error ?? "Could not publish this listing.");
      return;
    }
    setState("done");
    setMessage("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef] sm:grid-cols-2">
      <h2 className="font-display text-[14px] font-extrabold sm:col-span-2">List new produce</h2>
      {disabled ? (
        <p className="rounded-lg bg-[#fff3e8] p-2 text-[11px] text-[#a3480f] sm:col-span-2">Your farm must be verified before you can publish listings.</p>
      ) : null}
      <label className="text-[11px] font-semibold">Produce name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={field} /></label>
      <label className="text-[11px] font-semibold">Category
        <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={field}>
          {FRESH_CATEGORIES.map((row) => <option key={row.slug} value={row.slug}>{row.label}</option>)}
        </select>
      </label>
      <label className="text-[11px] font-semibold">Sold by<select value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} className={field}>{["kg", "bunch", "tuber", "tray", "bag (50kg)", "bag (25kg)", "crate", "piece", "litre"].map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
      <label className="text-[11px] font-semibold">Price per unit (₦)<input required inputMode="decimal" value={form.priceNaira} onChange={(event) => setForm({ ...form, priceNaira: event.target.value })} className={field} /></label>
      <label className="text-[11px] font-semibold">Quantity available<input required inputMode="numeric" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} className={field} /></label>
      <label className="text-[11px] font-semibold">Minimum order<input inputMode="numeric" value={form.minimumOrder} onChange={(event) => setForm({ ...form, minimumOrder: event.target.value })} className={field} /></label>
      <label className="text-[11px] font-semibold sm:col-span-2">Description<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={field} /></label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={disabled || state === "saving"} className="flex items-center gap-1.5 rounded-full bg-[#0b5c33] px-4 py-2 text-[11.5px] font-extrabold text-white disabled:opacity-50">
          {state === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
          Publish listing
        </button>
        {state === "done" ? <span className="ml-2 text-[11px] font-semibold text-[#0b8f47]">Listing published.</span> : null}
        {message ? <p role="alert" className="mt-1 text-[11px] font-semibold text-[#a3480f]">{message}</p> : null}
      </div>
    </form>
  );
}

const NEXT: Record<string, { status: string; label: string }> = {
  placed: { status: "accepted", label: "Accept order" },
  accepted: { status: "packing", label: "Start packing" },
  packing: { status: "ready_for_pickup", label: "Mark ready for pickup" }
};

export function FarmOrderActions({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const step = NEXT[status];

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/fresh/orders/${orderId}/dispatch`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setBusy(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "That action failed.");
      return;
    }
    router.refresh();
  }

  if (!step && status !== "ready_for_pickup") return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {step ? (
        <button type="button" onClick={() => void act({ action: "advance", status: step.status })} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-[#0b5c33] px-3 py-1.5 text-[11px] font-extrabold text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {step.label}
        </button>
      ) : null}
      {status === "ready_for_pickup" ? (
        <button type="button" onClick={() => void act({ action: "open" })} disabled={busy} className="flex items-center gap-1.5 rounded-full bg-[#f26b21] px-3 py-1.5 text-[11px] font-extrabold text-white disabled:opacity-50">
          <Truck className="h-3.5 w-3.5" aria-hidden /> Request delivery
        </button>
      ) : null}
      {status === "packing" ? <span className="flex items-center gap-1 text-[10.5px] text-[#6b7a70]"><PackageCheck className="h-3 w-3" aria-hidden /> Mark ready to let NaijaDrive or NaijaSend collect.</span> : null}
      {error ? <p role="alert" className="text-[10.5px] font-semibold text-[#a3480f]">{error}</p> : null}
    </div>
  );
}

export function FarmOrderStatusLabel({ status }: { status: string }) {
  return <span className="text-[10.5px] font-extrabold text-[#0b5c33]">{FRESH_LABELS[status] ?? status}</span>;
}

export function FarmerSignInPrompt() {
  return (
    <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-[#eef1ef]">
      <p className="font-display text-[16px] font-extrabold">Sign in to open your farm</p>
      <Link href="/login?next=/naijafresh/farmers/dashboard" className="mt-4 inline-flex rounded-full bg-[#0b5c33] px-5 py-2 text-[12px] font-extrabold text-white">Sign in</Link>
    </div>
  );
}
