"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Sprout } from "lucide-react";
import { FRESH_CATEGORIES } from "@/lib/services/fresh/catalogue";

const field = "mt-0.5 w-full rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-normal ring-1 ring-[#dfe6e1] focus:outline-none focus:ring-2 focus:ring-[#0b5c33]";

/** Farmer registration form; the farm starts unverified. */
export function FarmerApplyForm() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", farmerName: "", state: "", city: "", description: "", specialities: "" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    const response = await fetch("/api/fresh/farms", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        specialities: form.specialities.split(",").map((row) => row.trim()).filter(Boolean)
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setMessage(response.status === 401 ? "Sign in or create an account to register a farm." : body.error ?? "Could not submit your application.");
      return;
    }
    setState("done");
    router.refresh();
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-[#eef1ef]">
        <p className="font-display text-[17px] font-extrabold text-[#0b5c33]">Application received</p>
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-6 text-[#5d6d64]">
          Your farm is now pending NaijaFresh verification. You can open your farmer workspace to see its status; produce listings can be published once the farm is verified.
        </p>
        <Link href="/naijafresh/farmers/dashboard" className="mt-4 inline-flex rounded-full bg-[#0b5c33] px-5 py-2 text-[12px] font-extrabold text-white">Open farmer workspace</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl bg-[#f2f9f0] p-4 sm:grid-cols-2">
      <label className="text-[11px] font-semibold">Farm name
        <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={field} autoComplete="organization" />
      </label>
      <label className="text-[11px] font-semibold">Farmer&apos;s full name
        <input required value={form.farmerName} onChange={(event) => setForm({ ...form, farmerName: event.target.value })} className={field} autoComplete="name" />
      </label>
      <label className="text-[11px] font-semibold">State
        <input required value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} className={field} autoComplete="address-level1" />
      </label>
      <label className="text-[11px] font-semibold">Town / city
        <input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} className={field} autoComplete="address-level2" />
      </label>
      <label className="text-[11px] font-semibold sm:col-span-2">What do you grow?
        <input value={form.specialities} onChange={(event) => setForm({ ...form, specialities: event.target.value })} placeholder="Tomatoes, ugu, yam" className={field} />
        <span className="mt-0.5 block text-[10px] font-normal text-[#6b7a70]">Separate each crop with a comma.</span>
      </label>
      <label className="text-[11px] font-semibold sm:col-span-2">About your farm
        <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} className={field} />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={state === "saving"} className="flex items-center gap-1.5 rounded-full bg-[#f26b21] px-5 py-2 text-[12px] font-extrabold text-white hover:bg-[#dd5f18] disabled:opacity-60">
          {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sprout className="h-4 w-4" aria-hidden />}
          Submit farm application
        </button>
        {message ? <p role="alert" className="mt-2 text-[11px] font-semibold text-[#a3480f]">{message}</p> : null}
      </div>
      <p className="text-[10.5px] leading-4 text-[#6b7a70] sm:col-span-2">
        NaijaFresh verifies farm details before produce is listed. Categories you can sell in: {FRESH_CATEGORIES.map((row) => row.label).join(", ")}.
      </p>
    </form>
  );
}
