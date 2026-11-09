"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const field = "mt-0.5 w-full rounded-lg bg-white px-2 py-1.5 text-[11.5px] font-normal ring-1 ring-[#dfe6e1]";

/** Provider submits a quotation. The price is theirs, never NaijaSend's. */
export function QuoteForm({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ amountNaira: "", transitDays: "2", modes: [] as string[], message: "" });
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  function toggle(mode: string) {
    setForm((current) => ({ ...current, modes: current.modes.includes(mode) ? current.modes.filter((m) => m !== mode) : [...current.modes, mode] }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    setError("");
    const response = await fetch("/api/send/provider/quotes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shipmentId, ...form, transitDays: Number(form.transitDays) })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setError(body.error ?? "Could not submit the quote.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-2 rounded-xl bg-[#f9fbf9] p-2">
      <div className="grid gap-1.5 sm:grid-cols-2">
        <label className="text-[10.5px] font-semibold">Your price (₦)<input required inputMode="decimal" value={form.amountNaira} onChange={(e) => setForm({ ...form, amountNaira: e.target.value })} className={field} /></label>
        <label className="text-[10.5px] font-semibold">Transit (days)<input required inputMode="numeric" value={form.transitDays} onChange={(e) => setForm({ ...form, transitDays: e.target.value })} className={field} /></label>
      </div>
      <fieldset className="mt-1.5">
        <legend className="text-[10.5px] font-semibold">Modes covered (in order for multimodal)</legend>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {["motorcycle", "car", "van", "truck", "air", "sea", "rail", "warehouse"].map((mode) => (
            <button key={mode} type="button" aria-pressed={form.modes.includes(mode)} onClick={() => toggle(mode)} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${form.modes.includes(mode) ? "bg-[#0b5c33] text-white" : "bg-white ring-1 ring-[#dfe6e1]"}`}>{mode}</button>
          ))}
        </div>
      </fieldset>
      <input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Message to customer (optional)" className={`${field} mt-1.5`} />
      <button type="submit" disabled={state === "saving"} className="mt-1.5 flex items-center gap-1 rounded-full bg-[#f26b21] px-3 py-1 text-[10.5px] font-extrabold text-white disabled:opacity-60">
        {state === "saving" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null} Send quote
      </button>
      {error ? <p role="alert" className="mt-1 text-[10px] font-semibold text-[#a3480f]">{error}</p> : null}
    </form>
  );
}

/** Provider advances one of its legs (pickup → transit → arrived). */
export function LegActions({ shipmentId, legId, status, needsPin }: { shipmentId: string; legId: string; status: string; needsPin: boolean }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = status === "assigned" || status === "pending" ? "in_transit" : status === "in_transit" ? "arrived" : null;
  if (!next) return null;

  async function run() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/send/shipments/${shipmentId}/legs/${legId}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next, pin: pin || undefined })
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not update the leg.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {next === "in_transit" && needsPin ? (
        <label className="text-[10px] font-semibold">Pickup PIN
          <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" className="ml-1 w-20 rounded px-1.5 py-0.5 text-[11px] ring-1 ring-[#dfe6e1]" aria-label="Pickup PIN" />
        </label>
      ) : null}
      <button type="button" onClick={() => void run()} disabled={busy} className="rounded-full bg-[#0b5c33] px-3 py-1 text-[10.5px] font-extrabold text-white disabled:opacity-50">
        {busy ? "Saving…" : next === "in_transit" ? "Confirm pickup" : "Mark arrived"}
      </button>
      {error ? <span className="text-[10px] font-semibold text-[#a3480f]">{error}</span> : null}
    </div>
  );
}

/** Fleet: add a vehicle or transport asset. */
export function VehicleForm({ providerId }: { providerId: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ vehicleType: "truck", make: "", model: "", plate: "", capacityKg: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/send/provider/vehicles", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, capacityKg: Number(form.capacityKg) }) });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not add the vehicle.");
      return;
    }
    setForm({ vehicleType: "truck", make: "", model: "", plate: "", capacityKg: "" });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-2 grid gap-1.5 rounded-xl bg-[#f9fbf9] p-2 sm:grid-cols-2" data-provider-id={providerId}>
      <label className="text-[10.5px] font-semibold">Type<select value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })} className={field}>{["motorcycle","car","van","truck","container","refrigerated","tipper","flatbed","heavy_haul","aircraft","vessel","rail_wagon","warehouse"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></label>
      <label className="text-[10.5px] font-semibold">Capacity (kg)<input required inputMode="numeric" value={form.capacityKg} onChange={(e) => setForm({ ...form, capacityKg: e.target.value })} className={field} /></label>
      <label className="text-[10.5px] font-semibold">Make<input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className={field} /></label>
      <label className="text-[10.5px] font-semibold">Plate / registration<input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} className={field} /></label>
      <button type="submit" disabled={busy} className="sm:col-span-2 rounded-full bg-[#0b5c33] px-3 py-1 text-[10.5px] font-extrabold text-white disabled:opacity-60">{busy ? "Adding…" : "Add vehicle"}</button>
      {error ? <p role="alert" className="text-[10px] font-semibold text-[#a3480f] sm:col-span-2">{error}</p> : null}
    </form>
  );
}
