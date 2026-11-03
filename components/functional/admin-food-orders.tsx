"use client";

import { useCallback, useEffect, useState } from "react";

interface FoodOrder {
  id: string;
  orderNumber: string;
  status: string;
  restaurantName: string;
  contactName: string;
  deliveryAddress: string;
  courierName: string | null;
  courierId: string | null;
}
interface Courier { id: string; name: string }

export function AdminFoodOrders() {
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/eats/orders", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Request failed with HTTP ${res.status}`);
      setOrders(Array.isArray(body.orders) ? body.orders : []);
      setCouriers(Array.isArray(body.couriers) ? body.couriers : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load food orders.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function assign(id: string) {
    const courierId = choice[id] ?? couriers[0]?.id;
    if (!courierId) return;
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/eats/orders/${id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Assignment failed with HTTP ${res.status}`);
      setNotice("Courier assigned.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not assign the courier.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="rounded-2xl border border-[#30363D] bg-[#161B22] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">NaijaEats orders</h2>
          <p className="text-xs text-[#8B949E]">Assign a courier once the kitchen marks the order ready.</p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-[#30363D] px-3 py-1.5 text-xs font-bold text-[#F0F6FC]">Refresh</button>
      </div>
      {notice ? <p role="status" className="mt-2 rounded-lg bg-[#00E676]/10 p-2 text-xs font-bold text-[#00E676]">{notice}</p> : null}
      {error ? <p role="alert" className="mt-2 rounded-lg bg-crimson/10 p-2 text-xs font-bold text-crimson">{error}</p> : null}
      {orders.length === 0 ? <p className="mt-3 text-sm text-[#8B949E]">No food orders yet.</p> : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[#8B949E]">
              <tr><th className="p-2">Order</th><th className="p-2">Kitchen</th><th className="p-2">Status</th><th className="p-2">Courier</th><th className="p-2">Action</th></tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-[#30363D]">
                  <td className="p-2">
                    <p className="font-bold text-[#F0F6FC]">{order.orderNumber}</p>
                    <p className="text-xs text-[#8B949E]">{order.contactName} · {order.deliveryAddress}</p>
                  </td>
                  <td className="p-2 text-[#F0F6FC]">{order.restaurantName}</td>
                  <td className="p-2"><span className="rounded-full bg-[#30363D] px-2 py-1 text-[10px] font-bold uppercase text-[#F0F6FC]">{order.status.replace(/_/g, " ")}</span></td>
                  <td className="p-2 text-[#F0F6FC]">{order.courierName ?? "Unassigned"}</td>
                  <td className="p-2">
                    {order.status === "ready_for_pickup" ? (
                      <div className="flex gap-2">
                        <select
                          value={choice[order.id] ?? couriers[0]?.id ?? ""}
                          onChange={(e) => setChoice({ ...choice, [order.id]: e.target.value })}
                          aria-label={`Courier for ${order.orderNumber}`}
                          className="rounded-lg border border-[#30363D] bg-[#0B0E14] px-2 py-1.5 text-xs text-[#F0F6FC]"
                        >
                          {couriers.map((courier) => <option key={courier.id} value={courier.id}>{courier.name}</option>)}
                        </select>
                        <button type="button" disabled={busy === order.id} onClick={() => void assign(order.id)} className="rounded-lg bg-[#00E676] px-2.5 py-1.5 text-xs font-bold text-[#0B0E14] disabled:opacity-50">Assign</button>
                      </div>
                    ) : <span className="text-xs text-[#8B949E]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
