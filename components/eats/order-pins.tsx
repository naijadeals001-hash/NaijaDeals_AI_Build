"use client";

import { useEffect, useState } from "react";

type Pins = { pickupPin?: string; deliveryPin?: string; status?: string; assignedType?: string | null };

/**
 * Shows the order's delivery PIN once a rider is assigned. The PIN is what
 * proves the handoff — the rider cannot mark the order delivered without it.
 */
export function OrderPins({ orderId, status }: { orderId: string; status: string }) {
  const [pins, setPins] = useState<Pins | null>(null);

  useEffect(() => {
    if (!["courier_assigned", "picked_up", "delivered"].includes(status)) return;
    let active = true;
    fetch(`/api/eats/orders/${orderId}/pins`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => active && body && setPins(body))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [orderId, status]);

  if (!pins?.deliveryPin || status === "delivered") return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[#0b5c33] px-3 py-2 text-[11px] text-white">
      <span className="font-semibold">Delivery PIN</span>
      <span className="rounded bg-white px-2 py-0.5 font-mono text-[13px] font-black tracking-widest text-[#0b5c33]">{pins.deliveryPin}</span>
      <span className="text-white/70">
        {status === "courier_assigned" ? "Your rider is on the way to the kitchen." : "Share it with the rider at the door."}
      </span>
    </p>
  );
}
