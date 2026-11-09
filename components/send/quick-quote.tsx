"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const CARGO_TABS = [
  { key: "goods", label: "Goods / Cargo" },
  { key: "parcel", label: "Parcel" },
  { key: "freight", label: "Freight" },
  { key: "bulk", label: "Bulk / Farm" }
];

const field = "mt-0.5 w-full rounded-md bg-white px-2.5 py-1.5 text-[11.5px] font-normal text-[#14241b] ring-1 ring-[#cfe0d5] focus:outline-none focus:ring-2 focus:ring-[#0b5c33]";

/**
 * D — Quick Shipping Quote. This does not price anything itself: it records a
 * real shipment request, which verified providers then quote. No number is
 * invented on the customer's behalf.
 */
export function QuickQuote({ defaultCargo = "goods", compact = false }: { defaultCargo?: string; compact?: boolean }) {
  const router = useRouter();
  const [cargo, setCargo] = useState(defaultCargo);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ origin: "", destination: "", mode: "", weight: "", description: "" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    setError("");
    const response = await fetch("/api/send/shipments", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cargoClass: cargo,
        originLabel: form.origin,
        destinationLabel: form.destination,
        preferredMode: form.mode || undefined,
        weightKg: Number(form.weight || 1),
        description: form.description || `${CARGO_TABS.find((tab) => tab.key === cargo)?.label} shipment`,
        quick: true,
        senderName: "pending",
        senderPhone: "pending",
        recipientName: "pending",
        recipientPhone: "pending"
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setError(response.status === 401 ? "Sign in to request a shipping quote." : body.error ?? "Could not create the request.");
      return;
    }
    router.push(`/naijasend/shipments/${body.id}`);
  }

  return (
    <section aria-labelledby={compact ? undefined : "quick-quote"} aria-label="Get a quick shipping quote" className="rounded-xl bg-[#0b5c33] p-3 text-white">
      {!compact ? <h2 id="quick-quote" className="font-display text-[15px] font-extrabold">Get a Quick Shipping Quote</h2> : null}
      <form onSubmit={submit} className="mt-1.5 space-y-1.5">
        <div role="tablist" aria-label="Cargo type" className="grid grid-cols-4 gap-1 rounded-lg bg-white/10 p-1">
          {CARGO_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={cargo === tab.key}
              onClick={() => setCargo(tab.key)}
              className={`rounded-md px-1 py-1.5 text-[10px] font-extrabold leading-tight ${cargo === tab.key ? "bg-[#f26b21] text-white" : "text-white/85 hover:bg-white/10"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <label className="block text-[10px] font-bold">Pickup Location
          <input required value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Enter pick-up city, address or state" className={field} />
        </label>
        <label className="block text-[10px] font-bold">Delivery Location
          <input required value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Enter delivery city, address or state" className={field} />
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="block text-[10px] font-bold">Type of Transport
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className={field}>
              <option value="">Select transport type</option>
              {["motorcycle", "car", "van", "truck", "air", "sea", "rail", "warehouse"].map((mode) => <option key={mode} value={mode}>{mode[0].toUpperCase() + mode.slice(1)}</option>)}
            </select>
          </label>
          <label className="block text-[10px] font-bold">Weight (kg)
            <input required inputMode="numeric" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} placeholder="e.g. 25" className={field} />
          </label>
        </div>
        <label className="block text-[10px] font-bold">What are you shipping?
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. 3 cartons of textiles" className={field} />
        </label>
        <button type="submit" disabled={state === "saving"} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[#f26b21] px-3 py-2 text-[12px] font-extrabold text-white hover:bg-[#dd5f18] disabled:opacity-60">
          {state === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Get Quote →
        </button>
        {error ? <p role="alert" className="rounded bg-white/95 p-1.5 text-[10px] font-semibold text-[#a3480f]">{error}</p> : null}
        <p className="text-[9px] leading-3.5 text-white/70">We request itemised quotes from verified providers. NaijaSend does not set the price.</p>
      </form>
    </section>
  );
}
