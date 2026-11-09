"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Minus, Plus, Trash2, Wallet } from "lucide-react";

type Line = { id: string; listingId: string; slug: string; name: string; unit: string; quantity: number; stock: number; minimumOrder: number; unitPriceKobo: string; lineTotalKobo: string; imageUrl: string | null; available: boolean };
type Group = { farmId: string; farmSlug: string; farmName: string; city: string; state: string; country: string; deliveryFeeKobo: string; subtotalKobo: string; lines: Line[] };
export type Basket = { groups: Group[]; subtotalKobo: string; deliveryKobo: string; totalKobo: string; count: number };

function naira(kobo: string) {
  return `₦${(Number(kobo) / 100).toLocaleString("en-NG")}`;
}

/** Basket, per-farm grouping and NaijaPay checkout. */
export function FreshBasket({ initial }: { initial: Basket }) {
  const router = useRouter();
  const [basket, setBasket] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState<Array<{ orderNumber: string; farm: string }>>([]);
  const [form, setForm] = useState({ contactName: "", contactPhone: "", deliveryAddress: "", notes: "" });

  async function send(url: string, method: string, body?: unknown) {
    setBusy(url + method);
    setError("");
    const response = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      if (response.status === 401) setError("Sign in to change your basket.");
      else setError(payload.error ?? "That did not work. Try again.");
      return null;
    }
    setBasket(payload);
    router.refresh();
    return payload;
  }

  async function checkout(group: Group) {
    if (!form.contactName.trim() || !form.contactPhone.trim() || !form.deliveryAddress.trim()) {
      setError("Add a contact name, phone number and delivery address first.");
      return;
    }
    const order = await send("/api/fresh/orders", "POST", {
      farmId: group.farmId,
      items: group.lines.map((line) => ({ listingId: line.listingId, quantity: line.quantity })),
      deliveryAddress: form.deliveryAddress,
      contactName: form.contactName,
      contactPhone: form.contactPhone,
      notes: form.notes || undefined
    });
    if (order) {
      setPlaced((rows) => [...rows, { orderNumber: order.orderNumber, farm: group.farmName }]);
      router.refresh();
    }
  }

  if (placed.length && !basket.groups.length) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-[#eef1ef]">
        <p className="font-display text-[18px] font-extrabold text-[#0b5c33]">Order placed</p>
        <p className="mt-1 text-[12.5px] text-[#5d6d64]">Paid from your NaijaPay wallet. The farm has been notified to pack your produce.</p>
        <ul className="mt-3 space-y-1 text-[12.5px] font-semibold">
          {placed.map((row) => <li key={row.orderNumber}>{row.farm}: {row.orderNumber}</li>)}
        </ul>
        <Link href="/naijafresh/orders" className="mt-4 inline-flex rounded-full bg-[#0b5c33] px-5 py-2 text-[12px] font-extrabold text-white">Track your orders</Link>
      </div>
    );
  }

  if (!basket.groups.length) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-[#eef1ef]">
        <p className="font-display text-[16px] font-extrabold">Your basket is empty</p>
        <p className="mt-1 text-[12px] text-[#5d6d64]">Add fresh produce from a verified farm to get started.</p>
        <Link href="/naijafresh/shop" className="mt-4 inline-flex rounded-full bg-[#0b5c33] px-5 py-2 text-[12px] font-extrabold text-white">Shop fresh produce</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-3">
        {basket.groups.map((group) => (
          <section key={group.farmId} aria-labelledby={`farm-${group.farmId}`} className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <div className="flex flex-wrap items-baseline justify-between gap-1">
              <h2 id={`farm-${group.farmId}`} className="font-display text-[14px] font-extrabold">
                <Link href={`/naijafresh/farmers/${group.farmSlug}`} className="hover:underline">{group.farmName}</Link>
              </h2>
              <p className="text-[10.5px] text-[#6b7a70]">{group.city}, {group.country} · delivery {naira(group.deliveryFeeKobo)}</p>
            </div>
            <ul className="mt-2 divide-y divide-[#f0f3f1]">
              {group.lines.map((line) => (
                <li key={line.id} data-line={line.slug} className="flex items-center gap-2.5 py-2">
                  <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#f4f6f5]">
                    {line.imageUrl ? <img src={line.imageUrl} alt="" className="h-full w-full object-cover" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link href={`/naijafresh/shop/${line.slug}`} className="block truncate text-[12.5px] font-bold hover:underline">{line.name}</Link>
                    <span className="block text-[10.5px] text-[#6b7a70]">{naira(line.unitPriceKobo)} / {line.unit}</span>
                    {!line.available ? <span className="block text-[10px] font-semibold text-[#a3480f]">No longer in stock — remove it to continue.</span> : null}
                  </span>
                  <span className="flex items-center rounded-full ring-1 ring-[#dfe6e1]">
                    <button type="button" disabled={busy === `/api/fresh/cart/items/${line.id}PATCH`} onClick={() => void send(`/api/fresh/cart/items/${line.id}`, "PATCH", { quantity: line.quantity - 1 })} aria-label={`Reduce ${line.name}`} className="grid h-7 w-7 place-items-center rounded-l-full text-[#0b5c33] disabled:opacity-40"><Minus className="h-3 w-3" aria-hidden /></button>
                    <span className="w-8 text-center text-[12px] font-bold" aria-live="polite">{line.quantity}</span>
                    <button type="button" disabled={busy === `/api/fresh/cart/items/${line.id}PATCH` || line.quantity >= line.stock} onClick={() => void send(`/api/fresh/cart/items/${line.id}`, "PATCH", { quantity: line.quantity + 1 })} aria-label={`Increase ${line.name}`} className="grid h-7 w-7 place-items-center rounded-r-full text-[#0b5c33] disabled:opacity-40"><Plus className="h-3 w-3" aria-hidden /></button>
                  </span>
                  <span className="w-20 text-right text-[12.5px] font-extrabold">{naira(line.lineTotalKobo)}</span>
                  <button type="button" onClick={() => void send(`/api/fresh/cart/items/${line.id}`, "DELETE")} aria-label={`Remove ${line.name}`} className="grid h-7 w-7 place-items-center rounded text-[#a3480f] hover:bg-[#fdf1e9]"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#f0f3f1] pt-2">
              <p className="text-[11.5px] text-[#5d6d64]">Subtotal {naira(group.subtotalKobo)} + delivery {naira(group.deliveryFeeKobo)}</p>
              <button type="button" onClick={() => void checkout(group)} disabled={!group.lines.every((line) => line.available) || busy === "/api/fresh/ordersPOST"} className="flex items-center gap-1.5 rounded-full bg-[#0b5c33] px-4 py-2 text-[11.5px] font-extrabold text-white hover:bg-[#094a29] disabled:opacity-50">
                {busy === "/api/fresh/ordersPOST" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Wallet className="h-3.5 w-3.5" aria-hidden />}
                Pay {naira((BigInt(group.subtotalKobo) + BigInt(group.deliveryFeeKobo)).toString())} with NaijaPay
              </button>
            </div>
          </section>
        ))}
      </div>
      <aside aria-labelledby="fresh-summary" className="h-fit space-y-3 rounded-2xl bg-white p-4 ring-1 ring-[#eef1ef] lg:sticky lg:top-28">
        <h2 id="fresh-summary" className="font-display text-[14px] font-extrabold">Delivery details</h2>
        <label className="block text-[11px] font-semibold">Contact name
          <input value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} className="mt-0.5 w-full rounded-lg px-2.5 py-1.5 text-[12px] font-normal ring-1 ring-[#dfe6e1] focus:outline-none focus:ring-2 focus:ring-[#0b5c33]" autoComplete="name" />
        </label>
        <label className="block text-[11px] font-semibold">Phone number
          <input value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} inputMode="tel" className="mt-0.5 w-full rounded-lg px-2.5 py-1.5 text-[12px] font-normal ring-1 ring-[#dfe6e1] focus:outline-none focus:ring-2 focus:ring-[#0b5c33]" autoComplete="tel" />
        </label>
        <label className="block text-[11px] font-semibold">Delivery address
          <textarea value={form.deliveryAddress} onChange={(event) => setForm({ ...form, deliveryAddress: event.target.value })} rows={2} className="mt-0.5 w-full rounded-lg px-2.5 py-1.5 text-[12px] font-normal ring-1 ring-[#dfe6e1] focus:outline-none focus:ring-2 focus:ring-[#0b5c33]" autoComplete="street-address" />
        </label>
        <label className="block text-[11px] font-semibold">Notes for the farmer (optional)
          <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="mt-0.5 w-full rounded-lg px-2.5 py-1.5 text-[12px] font-normal ring-1 ring-[#dfe6e1]" />
        </label>
        <dl className="space-y-1 border-t border-[#f0f3f1] pt-2 text-[12px]">
          <div className="flex justify-between"><dt className="text-[#5d6d64]">Items</dt><dd className="font-semibold">{naira(basket.subtotalKobo)}</dd></div>
          <div className="flex justify-between"><dt className="text-[#5d6d64]">Delivery</dt><dd className="font-semibold">{naira(basket.deliveryKobo)}</dd></div>
          <div className="flex justify-between text-[14px] font-extrabold"><dt>Total</dt><dd>{naira(basket.totalKobo)}</dd></div>
        </dl>
        <p className="text-[10.5px] leading-4 text-[#6b7a70]">Each farm is paid separately, so a basket with several farms becomes one order per farm.</p>
        {error ? <p role="alert" className="rounded-lg bg-[#fdf1e9] p-2 text-[11px] font-semibold text-[#a3480f]">{error}</p> : null}
      </aside>
    </div>
  );
}
