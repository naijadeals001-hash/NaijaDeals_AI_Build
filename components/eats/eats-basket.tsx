"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Minus, Plus, Trash2 } from "lucide-react";

type BasketLine = { id: string; menuItemId: string; name: string; imageUrl: string | null; unitPriceKobo: string; quantity: number; available: boolean };
type BasketGroup = { restaurantId: string; restaurantName: string; restaurantSlug: string; deliveryFeeKobo: string; subtotalKobo: string; lines: BasketLine[] };
type Basket = { groups: BasketGroup[]; totalKobo: string; count: number };

const naira = (kobo: string) => `₦${(Number(kobo) / 100).toLocaleString("en-NG")}`;

/**
 * Food basket and checkout.
 *
 * Each kitchen is its own order — the API creates one food order per
 * restaurant, so the UI never pretends a mixed basket ships as one. Totals come
 * from the server, and a failed payment leaves the basket intact.
 */
export function EatsBasket({ signedIn }: { signedIn: boolean }) {
  const [basket, setBasket] = useState<Basket | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [address, setAddress] = useState("12 Adeola Odeku Street, Victoria Island, Lagos");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [placed, setPlaced] = useState<Array<{ orderNumber: string; restaurantName: string }>>([]);

  const load = useCallback(async () => {
    if (!signedIn) return;
    const response = await fetch("/api/eats/cart", { credentials: "include" });
    if (response.ok) setBasket(await response.json());
  }, [signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(url: string, init: RequestInit) {
    setBusy(true);
    const response = await fetch(url, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error ?? "That change could not be saved.");
      return;
    }
    setMessage("");
    if (body.groups) setBasket(body);
  }

  async function checkout(group: BasketGroup) {
    if (!contactName.trim() || !contactPhone.trim() || !address.trim()) {
      setMessage("Add a contact name, phone number and delivery address to check out.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/eats/orders", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId: group.restaurantId,
        items: group.lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
        deliveryAddress: address,
        contactName,
        contactPhone
      })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error ?? "Your order could not be placed.");
      return;
    }
    setPlaced((current) => [...current, { orderNumber: body.orderNumber ?? "placed", restaurantName: group.restaurantName }]);
    setMessage("");
    await load();
  }

  if (!signedIn) {
    return (
      <p className="rounded-xl bg-[#f7f9f8] p-4 text-[12.5px] text-[#4a5a50]">
        <Link href="/login?next=/naijaeats/cart" className="font-bold text-[#0b5c33] underline">Sign in</Link> to keep a basket and check out.
      </p>
    );
  }

  if (!basket) return <p className="py-8 text-center text-[12px] text-[#6b7a70]">Loading your basket…</p>;

  if (basket.groups.length === 0) {
    return (
      <div>
        {placed.length > 0 ? (
          <ul className="mb-4 space-y-2">
            {placed.map((order) => (
              <li key={order.orderNumber} className="rounded-xl bg-[#e7f6ec] p-3 text-[12.5px] font-semibold text-[#0b5c33]">
                Order {order.orderNumber} placed with {order.restaurantName}. <Link href="/naijaeats/orders" className="underline">Track it</Link>.
              </li>
            ))}
          </ul>
        ) : null}
        <p className="rounded-xl border border-dashed border-[#d9e2dc] p-8 text-center text-[12.5px] text-[#6b7a70]">
          Your basket is empty. <Link href="/naijaeats/restaurants" className="font-bold text-[#0b5c33] underline">Browse restaurants</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {placed.length > 0 ? (
        <ul className="space-y-2">
          {placed.map((order) => (
            <li key={order.orderNumber} className="rounded-xl bg-[#e7f6ec] p-3 text-[12.5px] font-semibold text-[#0b5c33]">
              Order {order.orderNumber} placed with {order.restaurantName}. <Link href="/naijaeats/orders" className="underline">Track it</Link>.
            </li>
          ))}
        </ul>
      ) : null}
      {message ? <p role="alert" className="rounded-lg bg-[#fff1e6] p-3 text-[12px] font-semibold text-[#a3480f]">{message}</p> : null}

      {basket.groups.map((group) => (
        <section key={group.restaurantId} className="rounded-xl p-3 ring-1 ring-[#eef1ef]" aria-label={`Basket from ${group.restaurantName}`}>
          <div className="flex items-baseline justify-between gap-2">
            <Link href={`/naijaeats/restaurants/${group.restaurantSlug}`} className="text-[13.5px] font-extrabold text-[#14241b] hover:underline">
              {group.restaurantName}
            </Link>
            <span className="text-[11px] text-[#6b7a70]">Separate order · delivery {naira(group.deliveryFeeKobo)}</span>
          </div>
          <ul className="mt-2 divide-y divide-[#f2f5f3]">
            {group.lines.map((line) => (
              <li key={line.id} data-line={line.id} className="flex items-center gap-2 py-2">
                <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#f4f6f5]">
                  {line.imageUrl ? <img src={line.imageUrl} alt="" className="h-full w-full object-cover" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-bold text-[#14241b]">{line.name}</span>
                  <span className="block text-[11px] text-[#6b7a70]">{naira(line.unitPriceKobo)} each{line.available ? "" : " · unavailable"}</span>
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Decrease ${line.name}`}
                    disabled={busy}
                    onClick={() => void mutate(`/api/eats/cart/items/${line.id}`, { method: "PATCH", body: JSON.stringify({ quantity: Math.max(1, line.quantity - 1) }) })}
                    className="grid h-7 w-7 place-items-center rounded-full border border-[#e2e6e3]"
                  >
                    <Minus className="h-3 w-3" aria-hidden />
                  </button>
                  <span className="w-5 text-center text-[12px] font-bold">{line.quantity}</span>
                  <button
                    type="button"
                    aria-label={`Increase ${line.name}`}
                    disabled={busy || line.quantity >= 10}
                    onClick={() => void mutate(`/api/eats/cart/items/${line.id}`, { method: "PATCH", body: JSON.stringify({ quantity: line.quantity + 1 }) })}
                    className="grid h-7 w-7 place-items-center rounded-full border border-[#e2e6e3] disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${line.name}`}
                    disabled={busy}
                    onClick={() => void mutate(`/api/eats/cart/items/${line.id}`, { method: "DELETE" })}
                    className="ml-1 grid h-7 w-7 place-items-center rounded-full text-[#b45309]"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-right text-[12.5px] font-extrabold text-[#14241b]">Subtotal {naira(group.subtotalKobo)}</p>
        </section>
      ))}

      <section className="rounded-xl p-3 ring-1 ring-[#eef1ef]" aria-label="Delivery details">
        <p className="text-[12.5px] font-extrabold text-[#14241b]">Delivery details</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-[10.5px] font-bold uppercase tracking-wide text-[#6b7a70]">
            Name
            <input value={contactName} onChange={(event) => setContactName(event.target.value)} className="mt-0.5 block min-h-9 w-full rounded-lg border border-[#e2e6e3] px-2 text-[12.5px] font-normal normal-case tracking-normal" />
          </label>
          <label className="text-[10.5px] font-bold uppercase tracking-wide text-[#6b7a70]">
            Phone
            <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} inputMode="tel" className="mt-0.5 block min-h-9 w-full rounded-lg border border-[#e2e6e3] px-2 text-[12.5px] font-normal normal-case tracking-normal" />
          </label>
          <label className="text-[10.5px] font-bold uppercase tracking-wide text-[#6b7a70] sm:col-span-2">
            Delivery address
            <input value={address} onChange={(event) => setAddress(event.target.value)} className="mt-0.5 block min-h-9 w-full rounded-lg border border-[#e2e6e3] px-2 text-[12.5px] font-normal normal-case tracking-normal" />
          </label>
        </div>
      </section>

      <div className="space-y-2">
        {basket.groups.map((group) => (
          <button
            key={group.restaurantId}
            type="button"
            disabled={busy || group.lines.some((line) => !line.available)}
            onClick={() => void checkout(group)}
            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#f26b21] px-4 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Place order with {group.restaurantName} · {naira(group.subtotalKobo)}
          </button>
        ))}
      </div>
    </div>
  );
}
