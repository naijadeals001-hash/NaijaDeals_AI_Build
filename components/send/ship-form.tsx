"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

const field = "mt-0.5 w-full rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-normal ring-1 ring-[#dfe6e1] focus:outline-none focus:ring-2 focus:ring-[#0b5c33]";
const CARGO = [
  { key: "goods", label: "Goods / Cargo" },
  { key: "parcel", label: "Parcel" },
  { key: "freight", label: "Freight" },
  { key: "bulk", label: "Bulk / Farm" }
];
const MODES = ["motorcycle", "car", "van", "truck", "air", "sea", "rail", "warehouse"];
const CATEGORIES = ["farm-produce", "food-perishables", "market-retail", "industrial", "construction", "machinery", "ecommerce", "household", ""];

/** Full shipment request. One shipment, many providers quoting. */
export function ShipForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    cargoClass: params.get("cargoClass") ?? "goods",
    cargoCategory: "",
    preferredMode: params.get("mode") ?? "",
    originLabel: "",
    originCountry: "Nigeria",
    destinationLabel: "",
    destinationCountry: "Nigeria",
    description: "",
    weightKg: "",
    quantity: "1",
    dimensions: "",
    declaredValueNaira: "",
    handling: "",
    senderName: "",
    senderPhone: "",
    recipientName: "",
    recipientPhone: "",
    pickupDate: "",
    customerKind: "individual"
  });

  useEffect(() => {
    const cargo = params.get("cargo") ?? params.get("category");
    if (cargo && CATEGORIES.includes(cargo)) setForm((current) => ({ ...current, cargoCategory: cargo, cargoClass: current.cargoClass === "parcel" ? "goods" : current.cargoClass }));
    const customer = params.get("customer");
    if (customer === "business" || customer === "institution" || customer === "enterprise") {
      setForm((current) => ({ ...current, customerKind: customer === "enterprise" ? "enterprise" : customer }));
    }
  }, [params]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    setError("");
    const response = await fetch("/api/send/shipments", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, weightKg: Number(form.weightKg), quantity: Number(form.quantity || 1) })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setError(response.status === 401 ? "Sign in to book a shipment." : body.error ?? "Could not create the shipment.");
      return;
    }
    router.push(`/naijasend/shipments/${body.id}`);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 lg:grid-cols-2">
      <section aria-labelledby="cargo" className="rounded-2xl bg-[#f2f9f0] p-3">
        <h2 id="cargo" className="font-display text-[14px] font-extrabold">Cargo</h2>
        <div role="radiogroup" aria-label="Cargo type" className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {CARGO.map((row) => (
            <button key={row.key} type="button" role="radio" aria-checked={form.cargoClass === row.key} onClick={() => setForm({ ...form, cargoClass: row.key })} className={`rounded-lg px-2 py-1.5 text-[11px] font-extrabold ${form.cargoClass === row.key ? "bg-[#0b5c33] text-white" : "bg-white ring-1 ring-[#dfe6e1]"}`}>{row.label}</button>
          ))}
        </div>
        <label className="mt-2 block text-[11px] font-semibold">What are you shipping?
          <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. 12 bags of rice, 3 cartons" className={field} />
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[11px] font-semibold">Weight (kg)<input required inputMode="numeric" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} className={field} /></label>
          <label className="text-[11px] font-semibold">Quantity<input inputMode="numeric" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={field} /></label>
          <label className="text-[11px] font-semibold">Dimensions<input value={form.dimensions} onChange={(e) => setForm({ ...form, dimensions: e.target.value })} placeholder="L × W × H cm" className={field} /></label>
          <label className="text-[11px] font-semibold">Declared value (₦)<input inputMode="decimal" value={form.declaredValueNaira} onChange={(e) => setForm({ ...form, declaredValueNaira: e.target.value })} className={field} /></label>
        </div>
        <label className="mt-2 block text-[11px] font-semibold">Category
          <select value={form.cargoCategory} onChange={(e) => setForm({ ...form, cargoCategory: e.target.value })} className={field}>
            {CATEGORIES.map((slug) => <option key={slug || "none"} value={slug}>{slug ? slug.replace(/-/g, " ") : "Not specified"}</option>)}
          </select>
        </label>
        <label className="mt-2 block text-[11px] font-semibold">Handling requirements<input value={form.handling} onChange={(e) => setForm({ ...form, handling: e.target.value })} placeholder="Fragile, keep cold, stack upright…" className={field} /></label>
      </section>

      <section aria-labelledby="route" className="rounded-2xl bg-[#f2f9f0] p-3">
        <h2 id="route" className="font-display text-[14px] font-extrabold">Route</h2>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          <label className="text-[11px] font-semibold">Pickup location<input required value={form.originLabel} onChange={(e) => setForm({ ...form, originLabel: e.target.value })} placeholder="City, town or address" className={field} /></label>
          <label className="text-[11px] font-semibold">Pickup country<select value={form.originCountry} onChange={(e) => setForm({ ...form, originCountry: e.target.value })} className={field}>{["Nigeria","Ghana","Kenya","South Africa","Cameroon","Ethiopia","Senegal","Tanzania","Uganda","Zambia","Rwanda","Mozambique","Egypt"].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="text-[11px] font-semibold">Delivery location<input required value={form.destinationLabel} onChange={(e) => setForm({ ...form, destinationLabel: e.target.value })} placeholder="City, town or address" className={field} /></label>
          <label className="text-[11px] font-semibold">Delivery country<select value={form.destinationCountry} onChange={(e) => setForm({ ...form, destinationCountry: e.target.value })} className={field}>{["Nigeria","Ghana","Kenya","South Africa","Cameroon","Ethiopia","Senegal","Tanzania","Uganda","Zambia","Rwanda","Mozambique","Egypt"].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="text-[11px] font-semibold">Preferred transport
            <select value={form.preferredMode} onChange={(e) => setForm({ ...form, preferredMode: e.target.value })} className={field}>
              <option value="">Any eligible mode</option>
              {MODES.map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold">Pickup date<input type="date" value={form.pickupDate} onChange={(e) => setForm({ ...form, pickupDate: e.target.value })} className={field} /></label>
        </div>
        <h3 className="mt-3 text-[12px] font-extrabold">Sender</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[11px] font-semibold">Name<input required value={form.senderName} onChange={(e) => setForm({ ...form, senderName: e.target.value })} className={field} /></label>
          <label className="text-[11px] font-semibold">Phone<input required inputMode="tel" value={form.senderPhone} onChange={(e) => setForm({ ...form, senderPhone: e.target.value })} className={field} /></label>
        </div>
        <h3 className="mt-3 text-[12px] font-extrabold">Recipient</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-[11px] font-semibold">Name<input required value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} className={field} /></label>
          <label className="text-[11px] font-semibold">Phone<input required inputMode="tel" value={form.recipientPhone} onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })} className={field} /></label>
        </div>
        <button type="submit" disabled={state === "saving"} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-[#f26b21] px-4 py-2.5 text-[12.5px] font-extrabold text-white hover:bg-[#dd5f18] disabled:opacity-60">
          {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Request quotes →
        </button>
        {error ? <p role="alert" className="mt-1.5 rounded bg-[#fff3e8] p-2 text-[11px] font-semibold text-[#a3480f]">{error}</p> : null}
        <p className="mt-1.5 text-[10px] leading-4 text-[#6b7a70]">Verified providers quote your shipment. You are only charged when you book a quote you accept.</p>
      </section>
    </form>
  );
}
