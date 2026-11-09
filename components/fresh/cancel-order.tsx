"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Lets the buyer cancel before the farm accepts; the API enforces the window. */
export function CancelOrder({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function cancel() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/fresh/orders/${orderId}/status`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" })
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not cancel this order.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={() => void cancel()} disabled={busy} className="rounded-full px-3 py-1 text-[11px] font-bold text-[#a3480f] ring-1 ring-[#f0d5c4] hover:bg-[#fdf1e9] disabled:opacity-50">
        {busy ? "Cancelling…" : "Cancel order"}
      </button>
      <span className="ml-2 text-[10.5px] text-[#6b7a70]">Cancelling before the farm accepts refunds your NaijaPay wallet.</span>
      {error ? <p role="alert" className="mt-1 text-[10.5px] font-semibold text-[#a3480f]">{error}</p> : null}
    </div>
  );
}
