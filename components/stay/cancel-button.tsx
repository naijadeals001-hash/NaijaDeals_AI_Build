"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Cancels a reservation; the refund percentage comes from the stored policy. */
export function CancelButton({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function cancel() {
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/stay/reservations/${reservationId}/cancel`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error ?? "Could not cancel.");
      return;
    }
    setMessage(`Cancelled — ${body.refundPercent}% refunded.`);
    router.refresh();
  }

  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
      <button type="button" onClick={() => void cancel()} disabled={busy} className="w-full rounded-full px-4 py-2 text-[11.5px] font-extrabold text-[#a3480f] ring-1 ring-[#f0d5c4] disabled:opacity-50">
        {busy ? "Cancelling…" : "Cancel reservation"}
      </button>
      <p className="mt-1 text-[9.5px] leading-4 text-[#6b7a70]">The refund follows the policy accepted when you booked.</p>
      {message ? <p role="status" className="mt-1 text-[10.5px] font-semibold text-[#0b5c33]">{message}</p> : null}
    </div>
  );
}
