"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const field = "mt-0.5 w-full rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-normal ring-1 ring-[#dfe6e1] focus:outline-none focus:ring-2 focus:ring-[#0b5c33]";

const TYPES = [
  ["courier", "Motorcycle courier"],
  ["car", "Car delivery"],
  ["van", "Van owner"],
  ["truck", "Truck owner"],
  ["fleet", "Fleet operator"],
  ["air", "Air cargo service"],
  ["sea", "Sea freight service"],
  ["rail", "Rail logistics operator"],
  ["warehouse", "Warehouse provider"],
  ["forwarder", "Freight forwarder"],
  ["logistics", "Logistics company"]
];

/** Transporter application. Starts pending; verification happens in the Control Center. */
export function TransporterApplyForm() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", providerType: "truck", country: "Nigeria", cities: "", contactPhone: "", licenceRef: "", insuranceRef: "", capacityKg: "" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    const response = await fetch("/api/send/provider", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        providerType: form.providerType,
        country: form.country,
        operatingCities: form.cities.split(",").map((city) => city.trim()).filter(Boolean),
        contactPhone: form.contactPhone,
        licenceRef: form.licenceRef || undefined,
        insuranceRef: form.insuranceRef || undefined,
        capacityKg: form.capacityKg ? Number(form.capacityKg) : undefined
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setMessage(response.status === 401 ? "Sign in or create an account to register." : body.error ?? "Could not submit the application.");
      return;
    }
    router.push("/naijasend/transporter/dashboard");
  }

  async function enrolDrive() {
    setState("saving");
    setMessage("");
    const response = await fetch("/api/send/provider", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "naijadrive" }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setMessage(response.status === 401 ? "Sign in first." : body.error ?? "Could not enrol your NaijaDrive profile.");
      return;
    }
    router.push("/naijasend/transporter/dashboard");
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl bg-[#f2f9f0] p-3 sm:grid-cols-2">
      <label className="text-[11px] font-semibold">Provider or company name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} /></label>
      <label className="text-[11px] font-semibold">What do you operate?
        <select value={form.providerType} onChange={(e) => setForm({ ...form, providerType: e.target.value })} className={field}>
          {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="text-[11px] font-semibold">Country<input required value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className={field} /></label>
      <label className="text-[11px] font-semibold">Operating cities<input value={form.cities} onChange={(e) => setForm({ ...form, cities: e.target.value })} placeholder="Lagos, Ibadan" className={field} /></label>
      <label className="text-[11px] font-semibold">Contact phone<input required inputMode="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className={field} /></label>
      <label className="text-[11px] font-semibold">Capacity (kg)<input inputMode="numeric" value={form.capacityKg} onChange={(e) => setForm({ ...form, capacityKg: e.target.value })} className={field} /></label>
      <label className="text-[11px] font-semibold">Licence / registration reference<input value={form.licenceRef} onChange={(e) => setForm({ ...form, licenceRef: e.target.value })} className={field} /></label>
      <label className="text-[11px] font-semibold">Insurance reference<input value={form.insuranceRef} onChange={(e) => setForm({ ...form, insuranceRef: e.target.value })} className={field} /></label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={state === "saving"} className="flex items-center gap-1.5 rounded-full bg-[#f26b21] px-5 py-2 text-[12px] font-extrabold text-white disabled:opacity-60">
          {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Submit application
        </button>
        <button type="button" onClick={() => void enrolDrive()} disabled={state === "saving"} className="ml-2 rounded-full px-4 py-2 text-[12px] font-extrabold text-[#0b5c33] ring-1 ring-[#cfe3ca] disabled:opacity-60">I drive with NaijaDrive</button>
        {message ? <p role="alert" className="mt-2 text-[11px] font-semibold text-[#a3480f]">{message}</p> : null}
      </div>
      <p className="text-[10px] leading-4 text-[#6b7a70] sm:col-span-2">Licence requirements depend on the mode and jurisdiction. Claims that require a licence — airline, shipping line, rail operator or customs broker — must be supported by the provider&apos;s own documents.</p>
    </form>
  );
}
