"use client";

import { useCallback, useEffect, useState } from "react";

interface FoodOrder {
  id: string;
  orderNumber: string;
  status: string;
  restaurantName: string;
  deliveryAddress: string;
  contactName: string;
  totalKobo: string;
  items: Array<{ name: string; quantity: number }>;
}

const ACTIONS: Record<string, { status: string; label: string }> = {
  courier_assigned: { status: "picked_up", label: "Mark picked up" },
  picked_up: { status: "delivered", label: "Mark delivered" }
};

export function CourierFoodOrders() {
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/courier/eats/orders", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Request failed with HTTP ${res.status}`);
      setOrders(Array.isArray(body.orders) ? body.orders : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load food deliveries.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function advance(id: string, status: string) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/eats/orders/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Update failed with HTTP ${res.status}`);
      setNotice("Food delivery updated.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the delivery.");
    } finally {
      setBusy("");
    }
  }

  if (orders.length === 0 && !error) return null;

  return (
    <section className="rounded-2xl border border-border-soft bg-canvas p-5">
      <h2 className="font-display text-lg font-extrabold">NaijaEats deliveries</h2>
      <p className="text-xs text-muted">Kitchen orders assigned to you by the Control Center.</p>
      {notice ? <p role="status" className="mt-2 rounded-lg bg-primary-soft p-2 text-xs font-bold text-primary">{notice}</p> : null}
      {error ? <p role="alert" className="mt-2 rounded-lg border border-crimson/30 bg-crimson-soft p-2 text-xs font-bold text-[#991B1B]">{error}</p> : null}
      <ul className="mt-3 divide-y divide-border-soft">
        {orders.map((order) => {
          const action = ACTIONS[order.status];
          return (
            <li key={order.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">{order.orderNumber} · {order.restaurantName}</p>
                  <p className="text-xs text-muted">{order.contactName} · {order.deliveryAddress}</p>
                  <ul className="mt-1 text-xs text-muted">
                    {(order.items ?? []).map((item, index) => <li key={index}>{item.quantity} × {item.name}</li>)}
                  </ul>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-surface-low px-2 py-1 text-[10px] font-bold uppercase">{order.status.replace(/_/g, " ")}</span>
                  {action ? (
                    <button type="button" disabled={busy === order.id} onClick={() => void advance(order.id, action.status)} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                      {busy === order.id ? "Working…" : action.label}
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
