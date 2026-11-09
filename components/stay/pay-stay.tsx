"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wallet } from "lucide-react";

/** Pays a held reservation. Waits for the server's answer before claiming success. */
export function PayStay({ reservationId, totalLabel, expiresAt }: { reservationId: string; totalLabel: string; expiresAt: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  async function pay() {
    setState("saving");
    setError("");
    const response = await fetch("/api/stay/pay", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setError(response.status === 402 ? "Your NaijaPay balance does not cover this stay." : body.error ?? "Payment did not go through.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-2xl bg-[#0b5c33] p-3 text-white">
      <p className="text-[11px] text-white/80">Held until {expiresAt ? new Date(expiresAt).toLocaleTimeString() : "—"}</p>
      <p className="mt-0.5 font-display text-[20px] font-extrabold">{totalLabel}</p>
      <button type="button" onClick={() => void pay()} disabled={state === "saving"} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full bg-[#f26b21] px-4 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-60">
        {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wallet className="h-4 w-4" aria-hidden />} Pay with NaijaPay
      </button>
      <p className="mt-1.5 text-[9.5px] leading-4 text-white/70">Funds are held by NaijaDeals until check-in. The host is paid after the stay.</p>
      {error ? (
        <p role="alert" className="mt-1.5 rounded bg-white/95 p-1.5 text-[10.5px] font-semibold text-[#a3480f]">
          {error} <a href="/wallet" className="underline">Open wallet</a>
        </p>
      ) : null}
    </div>
  );
}
