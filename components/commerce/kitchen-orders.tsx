"use client";

import { useCallback, useEffect, useState } from "react";

interface KitchenOrder {
  id: string;
  orderNumber: string;
  status: string;
  contactName: string;
  deliveryAddress: string;
  totalKobo: string;
  items: Array<{ name: string; quantity: number }>;
}

const ACTIONS: Record<string, Array<{ status: string; label: string }>> = {
  placed: [{ status: "kitchen_accepted", label: "Accept order" }],
  kitchen_accepted: [{ status: "preparing", label: "Start preparing" }],
  preparing: [{ status: "ready_for_pickup", label: "Ready for pickup" }]
};

const LABELS: Record<string, string> = {
  placed: "New", kitchen_accepted: "Accepted", preparing: "Preparing",
  ready_for_pickup: "Ready", courier_assigned: "Courier assigned", picked_up: "Picked up", delivered: "Delivered", cancelled: "Cancelled"
};

export function KitchenOrders() {
  const [state, setState] = useState<{ kitchen: string; orders: KitchenOrder[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/restaurant/orders", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Request failed with HTTP ${res.status}`);
      setState({ kitchen: body.restaurant?.name ?? "Kitchen", orders: Array.isArray(body.orders) ? body.orders : [] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load kitchen orders.");
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
      setNotice("Order updated.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the order.");
    } finally {
      setBusy("");
    }
  }

  if (error && !state) return <p role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-4 font-bold text-[#991B1B]">{error}</p>;
  if (!state) return <p className="rounded-2xl border border-border-soft bg-canvas p-6 text-sm text-muted">Loading kitchen orders…</p>;

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-border-soft bg-canvas p-5">
        <p className="text-xs font-black uppercase tracking-wide text-primary">Kitchen dashboard</p>
        <h1 className="font-display text-2xl font-extrabold">{state.kitchen}</h1>
        <p className="text-sm text-muted">Accept orders, mark preparation and signal pickup. Courier assignment is handled by the Control Center.</p>
      </header>
      {notice ? <p role="status" className="rounded-xl bg-primary-soft p-3 text-sm font-bold text-primary">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-3 text-sm font-bold text-[#991B1B]">{error}</p> : null}
      {state.orders.length === 0 ? <p className="rounded-2xl border border-border-soft bg-canvas p-5 text-sm text-muted">No orders yet.</p> : null}
      <div className="space-y-3">
        {state.orders.map((order) => (
          <article key={order.id} className="rounded-2xl border border-border-soft bg-canvas p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-bold">{order.orderNumber}</h2>
                <p className="text-xs text-muted">{order.contactName} · {order.deliveryAddress}</p>
                <ul className="mt-1 text-xs text-muted">
                  {(order.items ?? []).map((item, index) => <li key={index}>{item.quantity} × {item.name}</li>)}
                </ul>
              </div>
              <span className="rounded-full bg-surface-low px-3 py-1 text-xs font-bold">{LABELS[order.status] ?? order.status}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(ACTIONS[order.status] ?? []).map((action) => (
                <button
                  key={action.status}
                  type="button"
                  disabled={busy === order.id}
                  onClick={() => void advance(order.id, action.status)}
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {busy === order.id ? "Working…" : action.label}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
