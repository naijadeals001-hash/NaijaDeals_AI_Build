"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const field = "mt-0.5 w-full rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-normal ring-1 ring-[#dfe6e1] focus:outline-none focus:ring-2 focus:ring-[#0b5c33]";

/** Host application. Starts pending; verification happens in the Control Center. */
export function HostApplyForm() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ displayName: "", phone: "", country: "Nigeria", documentRef: "" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    setError("");
    const response = await fetch("/api/stay/host", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setError(response.status === 401 ? "Sign in or create an account to apply." : body.error ?? "Could not submit the application.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 rounded-2xl bg-[#f2f9f0] p-3 sm:grid-cols-2">
      <label className="text-[11px] font-semibold">Your name or business name<input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className={field} /></label>
      <label className="text-[11px] font-semibold">Contact phone<input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" className={field} /></label>
      <label className="text-[11px] font-semibold">Country<input required value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className={field} /></label>
      <label className="text-[11px] font-semibold">ID / business registration reference<input value={form.documentRef} onChange={(e) => setForm({ ...form, documentRef: e.target.value })} className={field} /></label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={state === "saving"} className="flex items-center gap-1.5 rounded-full bg-[#f26b21] px-5 py-2 text-[12px] font-extrabold text-white disabled:opacity-60">
          {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Apply to host
        </button>
        {error ? <p role="alert" className="mt-2 text-[11px] font-semibold text-[#a3480f]">{error}</p> : null}
      </div>
      <p className="text-[10px] leading-4 text-[#6b7a70] sm:col-span-2">NaijaStay verifies host details but does not licence you. Property listings are moderated before publication.</p>
    </form>
  );
}
