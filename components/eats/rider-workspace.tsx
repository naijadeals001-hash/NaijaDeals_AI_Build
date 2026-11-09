"use client";

import { useCallback, useEffect, useState } from "react";
import { Bike, Car, Clock, Loader2, MapPin, Package } from "lucide-react";

type Offer = { offerId: string; dispatchId: string; orderNumber: string; restaurant: { name: string; market: string } | null; area: string | null; earningsKobo: string; expiresAt: string; vehicleNeed: string };
type Queues = { courier: Offer[]; driver: Offer[] };

const naira = (kobo: string) => `₦${(Number(kobo) / 100).toLocaleString("en-NG")}`;

/**
 * Delivery workspace for NaijaSend couriers and NaijaDrive drivers.
 *
 * Offers are time-limited and show only what a provider needs before accepting —
 * the customer's name and door number arrive after assignment. Pickup and
 * delivery both require PINs, so a rider cannot mark food delivered alone.
 */
export function RiderWorkspace() {
  const [queues, setQueues] = useState<Queues | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<{ dispatchId: string; orderNumber: string } | null>(null);
  const [pickupPin, setPickupPin] = useState("");
  const [deliveryPin, setDeliveryPin] = useState("");
  const [step, setStep] = useState<"idle" | "picked_up" | "delivered">("idle");

  const load = useCallback(async () => {
    const response = await fetch("/api/eats/dispatch/offers", { credentials: "include" });
    if (response.ok) setQueues(await response.json());
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function act(offer: Offer, action: "accept" | "decline") {
    setBusy(true);
    const response = await fetch(`/api/eats/dispatch/offers/${offer.offerId}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error ?? "That offer could not be taken.");
      return;
    }
    setMessage("");
    if (action === "accept") setActive({ dispatchId: offer.dispatchId, orderNumber: offer.orderNumber });
    await load();
  }

  async function confirm(kind: "pickup" | "delivery") {
    if (!active) return;
    setBusy(true);
    const response = await fetch("/api/eats/dispatch/status", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: kind, dispatchId: active.dispatchId, pin: kind === "pickup" ? pickupPin : deliveryPin })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error ?? "That PIN was not accepted.");
      return;
    }
    setMessage("");
    if (kind === "pickup") setStep("picked_up");
    else {
      setStep("delivered");
      setActive(null);
      setPickupPin("");
      setDeliveryPin("");
    }
  }

  const offers = [...(queues?.courier ?? []), ...(queues?.driver ?? [])];

  return (
    <div className="space-y-4">
      {message ? <p role="alert" className="rounded-lg bg-[#fff1e6] p-3 text-[12px] font-semibold text-[#a3480f]">{message}</p> : null}

      {active ? (
        <section className="rounded-xl p-4 ring-1 ring-[#eef1ef]" aria-label="Active delivery">
          <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-[#14241b]">
            <Package className="h-4 w-4 text-[#0b5c33]" aria-hidden /> Delivery for {active.orderNumber}
          </p>
          <p className="mt-1 text-[11.5px] text-[#6b7a70]">{step === "picked_up" ? "Heading to the customer. Ask for their delivery PIN at the door." : "Collect the food and confirm with the kitchen's pickup PIN."}</p>
          {step === "idle" ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-[10.5px] font-bold uppercase tracking-wide text-[#6b7a70]">
                Pickup PIN
                <input value={pickupPin} onChange={(event) => setPickupPin(event.target.value)} inputMode="numeric" className="mt-0.5 block w-32 rounded-lg border border-[#e2e6e3] px-2 py-1.5 font-mono text-[13px]" />
              </label>
              <button type="button" disabled={busy} onClick={() => void confirm("pickup")} className="rounded-full bg-[#0b5c33] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-60">
                Confirm pickup
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-[10.5px] font-bold uppercase tracking-wide text-[#6b7a70]">
                Customer delivery PIN
                <input value={deliveryPin} onChange={(event) => setDeliveryPin(event.target.value)} inputMode="numeric" className="mt-0.5 block w-32 rounded-lg border border-[#e2e6e3] px-2 py-1.5 font-mono text-[13px]" />
              </label>
              <button type="button" disabled={busy} onClick={() => void confirm("delivery")} className="rounded-full bg-[#f26b21] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-60">
                Complete delivery
              </button>
            </div>
          )}
        </section>
      ) : null}

      <section aria-label="Delivery offers">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[16px] font-extrabold text-[#14241b]">Delivery offers</h2>
          <button type="button" onClick={() => void load()} className="text-[11px] font-bold text-[#0b5c33] underline">Refresh</button>
        </div>
        {!queues ? <p className="mt-2 text-[12px] text-[#6b7a70]">Loading offers…</p> : offers.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-[#d9e2dc] p-5 text-[12px] text-[#6b7a70]">
            No open offers right now. Offers appear when a kitchen marks an order ready and you are online in the delivery zone.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {offers.map((offer) => (
              <li key={offer.offerId} data-offer={offer.offerId} className="rounded-xl p-3 ring-1 ring-[#eef1ef]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-[#14241b]">
                      {offer.vehicleNeed === "car" ? <Car className="h-4 w-4 text-[#0b5c33]" aria-hidden /> : <Bike className="h-4 w-4 text-[#0b5c33]" aria-hidden />}
                      {offer.restaurant?.name ?? "Kitchen"} → customer
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#6b7a70]">
                      <MapPin className="h-3 w-3" aria-hidden /> Pickup in {offer.area ?? "the delivery zone"} · {offer.vehicleNeed}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#6b7a70]">
                      <Clock className="h-3 w-3" aria-hidden /> Offer expires {new Date(offer.expiresAt).toLocaleTimeString("en-NG")}
                    </p>
                  </div>
                  <p className="text-[14px] font-extrabold text-[#0b5c33]">{naira(offer.earningsKobo)}</p>
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void act(offer, "accept")} className="flex items-center gap-1 rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-bold text-white disabled:opacity-60">
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null} Accept
                  </button>
                  <button type="button" disabled={busy} onClick={() => void act(offer, "decline")} className="rounded-full border border-[#e2e6e3] px-4 py-1.5 text-[11.5px] font-bold text-[#33443a] disabled:opacity-60">
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
