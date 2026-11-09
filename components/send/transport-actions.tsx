"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, MapPin, PackageCheck, Truck } from "lucide-react";

/**
 * Transporter navigation actions. Each button posts a real state transition with
 * the shipment version and a fresh idempotency key; the server decides whether the
 * caller is the assigned transporter and whether the evidence is valid.
 */
type Step = { to: string; label: string; needsPin?: boolean; icon: "go" | "arrive" | "pickup" | "deliver" | "problem" };

const NEXT: Record<string, Step | null> = {
  assigned: { to: "en_route_to_pickup", label: "Start navigation to pickup", icon: "go" },
  en_route_to_pickup: { to: "arrived_at_pickup", label: "Arrived at pickup", icon: "arrive" },
  arrived_at_pickup: { to: "picked_up", label: "Verify pickup with PIN", needsPin: true, icon: "pickup" },
  picked_up: { to: "in_transit", label: "Start transport navigation", icon: "go" },
  in_transit: { to: "arrived_at_destination", label: "Arrived at destination", icon: "arrive" },
  out_for_delivery: { to: "arrived_at_destination", label: "Arrived at destination", icon: "arrive" },
  arrived_at_destination: { to: "delivered", label: "Verify delivery with PIN", needsPin: true, icon: "deliver" },
  delayed: { to: "in_transit", label: "Resume transport", icon: "go" },
  delivery_failed: null,
  delivered: null,
  completed: null,
  cancelled: null
};

function newKey() {
  return `nav-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function TransportActions({
  shipmentId,
  version,
  state,
  customerPhone
}: {
  shipmentId: string;
  version: number;
  state: string;
  customerPhone: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pin, setPin] = useState("");
  const [problem, setProblem] = useState(false);
  const [problemNote, setProblemNote] = useState("");
  const step = NEXT[state] ?? null;

  async function send(to: string, opts: { pin?: string; note?: string } = {}) {
    setBusy(to);
    setError("");
    setNotice("");
    const response = await fetch(`/api/send/driver/shipments/${shipmentId}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, version, idempotencyKey: newKey(), ...opts })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(body.error ?? "That action was refused.");
      router.refresh();
      return;
    }
    setNotice(body.replayed ? "Already recorded." : "Updated.");
    setPin("");
    setProblem(false);
    setProblemNote("");
    router.refresh();
  }

  const Icon = step?.icon === "pickup" || step?.icon === "deliver" ? PackageCheck : step?.icon === "arrive" ? MapPin : Truck;

  return (
    <div className="space-y-2">
      {step ? (
        step.needsPin ? (
          <div className="rounded-xl bg-[#f2f9f0] p-3">
            <label className="block text-[11px] font-extrabold text-[#14241b]">
              {step.icon === "pickup" ? "Ask the sender for the pickup PIN" : "Ask the recipient for the delivery PIN"}
              <input value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" autoComplete="one-time-code" aria-label={step.icon === "pickup" ? "Pickup PIN" : "Delivery PIN"} className="mt-1 block w-40 rounded-lg bg-white px-3 py-2 font-display text-[16px] tracking-[0.3em] ring-1 ring-[#cfe0d5] focus:outline-none focus:ring-2 focus:ring-[#0b5c33]" />
            </label>
            <button type="button" onClick={() => void send(step.to, { pin })} disabled={busy !== null || pin.trim().length < 4} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full bg-[#0b5c33] px-4 py-2.5 text-[12px] font-extrabold text-white disabled:opacity-50">
              {busy === step.to ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />} {step.label}
            </button>
            <p className="mt-1 text-[10px] leading-4 text-[#6b7a70]">The PIN is issued by the sender or recipient. NaijaSend never shows it here — the server checks it and records the handover once.</p>
          </div>
        ) : (
          <button type="button" onClick={() => void send(step.to)} disabled={busy !== null} className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#f26b21] px-4 py-2.5 text-[12px] font-extrabold text-white hover:bg-[#dd5f18] disabled:opacity-50">
            {busy === step.to ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />} {step.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        )
      ) : (
        <p className="flex items-center gap-1.5 rounded-xl bg-[#e8f3e4] px-3 py-2 text-[11.5px] font-semibold text-[#0b5c33]">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> {state === "completed" || state === "delivered" ? "This job is complete." : "No navigation action is available in this state."}
        </p>
      )}

      {["assigned", "en_route_to_pickup", "arrived_at_pickup", "picked_up", "in_transit", "out_for_delivery"].includes(state) ? (
        <div>
          {!problem ? (
            <button type="button" onClick={() => setProblem(true)} className="text-[11px] font-bold text-[#a3480f] underline">
              <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden /> Report a problem
            </button>
          ) : (
            <div className="rounded-xl bg-[#fff3e8] p-2.5">
              <label className="block text-[10.5px] font-semibold text-[#a3480f]">
                What happened?
                <input value={problemNote} onChange={(event) => setProblemNote(event.target.value)} placeholder="Vehicle breakdown, recipient unavailable…" className="mt-1 w-full rounded-lg bg-white px-2 py-1.5 text-[11.5px] ring-1 ring-[#f0d5c4]" />
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button type="button" disabled={busy !== null || problemNote.trim().length < 4} onClick={() => void send("delayed", { note: problemNote })} className="rounded-full bg-[#a3480f] px-3 py-1 text-[10.5px] font-extrabold text-white disabled:opacity-50">Mark delayed</button>
                <button type="button" disabled={busy !== null || problemNote.trim().length < 4} onClick={() => void send(state === "picked_up" || state === "in_transit" || state === "out_for_delivery" ? "delivery_failed" : "failed_pickup", { note: problemNote })} className="rounded-full px-3 py-1 text-[10.5px] font-extrabold text-[#a3480f] ring-1 ring-[#f0d5c4] disabled:opacity-50">
                  End this leg as failed
                </button>
                <button type="button" onClick={() => setProblem(false)} className="rounded-full px-3 py-1 text-[10.5px] font-bold text-[#5d6d64]">Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {customerPhone ? (
        <p className="text-[10.5px] text-[#5d6d64]">
          Recipient contact: <a href={`tel:${customerPhone}`} className="font-bold text-[#0b5c33] underline">{customerPhone}</a>
        </p>
      ) : null}
      {notice ? <p className="text-[10.5px] font-semibold text-[#0b8f47]">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-[#fff3e8] p-2 text-[10.5px] font-semibold text-[#a3480f]">{error}</p> : null}
    </div>
  );
}
