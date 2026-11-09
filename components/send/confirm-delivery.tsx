"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** Customer confirms receipt with the delivery PIN; this releases payment. */
export function ConfirmDelivery({ shipmentId }: { shipmentId: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    setError("");
    const response = await fetch(`/api/send/shipments/${shipmentId}/quotes`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", pin })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setError(body.error ?? "Could not confirm delivery.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-xl bg-[#f2f9f0] p-3">
      <label className="text-[11px] font-semibold">Give the delivery PIN only once the goods arrive safely
        <input required value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" className="mt-0.5 w-32 rounded-lg bg-white px-2.5 py-1.5 font-display text-[14px] tracking-widest ring-1 ring-[#cfe0d5]" aria-label="Delivery PIN" />
      </label>
      <button type="submit" disabled={state === "saving"} className="ml-2 mt-2 inline-flex items-center gap-1 rounded-full bg-[#0b5c33] px-4 py-1.5 text-[11.5px] font-extrabold text-white disabled:opacity-60">
        {state === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Confirm delivery
      </button>
      {error ? <p role="alert" className="mt-1 text-[10.5px] font-semibold text-[#a3480f]">{error}</p> : null}
    </form>
  );
}
