"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface FoodEvent { status: string; note: string | null; createdAt: string }
interface FoodItem { name: string; quantity: number; unitPriceKobo: string }
interface FoodOrder {
  id: string;
  orderNumber: string;
  status: string;
  restaurantName: string;
  deliveryAddress: string;
  contactName: string;
  contactPhone: string;
  subtotalKobo: string;
  totalKobo: string;
  createdAt: string;
  items: FoodItem[];
  events: FoodEvent[];
}

const STATUS_LABELS: Record<string, string> = {
  placed: "Order placed",
  kitchen_accepted: "Kitchen accepted",
  preparing: "Preparing",
  ready_for_pickup: "Ready for pickup",
  courier_assigned: "Courier assigned",
  picked_up: "Picked up",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

function naira(value: string) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value) / 100);
}

export function EatsOrderClient({ id }: { id: string }) {
  const [order, setOrder] = useState<FoodOrder | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/eats/orders/${id}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Request failed with HTTP ${res.status}`);
      setOrder(body as FoodOrder);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this order.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading) return <p className="rounded-2xl border border-border-soft bg-canvas p-6 text-sm text-muted">Loading order…</p>;
  if (error) return <p role="alert" className="rounded-xl border border-crimson/30 bg-crimson-soft p-4 font-bold text-[#991B1B]">{error}</p>;
  if (!order) return null;

  return (
    <div className="space-y-4">
      <Link href="/naijaeats" className="text-sm font-bold text-primary underline">Back to NaijaEats</Link>
      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-primary">NaijaEats order</p>
            <h1 className="font-display text-2xl font-extrabold">{order.orderNumber}</h1>
            <p className="mt-1 text-sm text-muted">{order.restaurantName} · {order.deliveryAddress}</p>
            <p className="text-xs text-muted">{order.contactName} · {order.contactPhone}</p>
          </div>
          <span className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary">{STATUS_LABELS[order.status] ?? order.status}</span>
        </div>
        <ul className="mt-4 divide-y divide-border-soft">
          {order.items.map((item, index) => (
            <li key={index} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>{item.quantity} × {item.name}</span>
              <span className="font-bold">{naira(String(Number(item.unitPriceKobo) * item.quantity))}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center justify-between border-t border-border-soft pt-3 text-sm font-extrabold">
          <span>Total paid with NaijaPay</span>
          <span>{naira(order.totalKobo)}</span>
        </p>
      </section>

      <section aria-label="Order timeline" className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-lg font-extrabold">Order timeline</h2>
        <ol className="mt-3 space-y-3">
          {order.events.map((event, index) => (
            <li key={index} className="flex gap-3">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold">{STATUS_LABELS[event.status] ?? event.status}</p>
                {event.note ? <p className="text-xs text-muted">{event.note}</p> : null}
                <p className="text-[10px] text-muted">{new Date(event.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => void load()} className="mt-4 rounded-xl border border-border-soft px-4 py-2 text-xs font-bold">Refresh status</button>
      </section>
    </div>
  );
}
