"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Minus, Plus, ShoppingBasket } from "lucide-react";

/** Quantity + add control for one produce listing. */
export function AddProduce({ listingId, name, unit, minimumOrder, stock }: { listingId: string; name: string; unit: string; minimumOrder: number; stock: number }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(Math.min(minimumOrder, Math.max(stock, minimumOrder)));
  const [state, setState] = useState<"idle" | "saving" | "added" | "error">("idle");
  const [message, setMessage] = useState("");
  const disabled = stock <= 0;

  async function add() {
    setState("saving");
    setMessage("");
    const response = await fetch("/api/fresh/cart/items", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, quantity })
    });
    if (response.ok) {
      setState("added");
      router.refresh();
      return;
    }
    const body = await response.json().catch(() => ({}));
    setState("error");
    setMessage(response.status === 401 ? "Sign in to add produce to your basket." : body.error ?? "Could not add this item.");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] font-semibold text-[#5d6d64]">Quantity ({unit})</span>
        <div className="flex items-center rounded-full ring-1 ring-[#dfe6e1]">
          <button type="button" onClick={() => setQuantity((value) => Math.max(minimumOrder, value - 1))} disabled={disabled || quantity <= minimumOrder} aria-label={`Reduce ${name} quantity`} className="grid h-8 w-8 place-items-center rounded-l-full text-[#0b5c33] disabled:opacity-40">
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <input
            aria-label={`${name} quantity in ${unit}`}
            type="number"
            min={minimumOrder}
            max={Math.max(stock, minimumOrder)}
            value={quantity}
            onChange={(event) => {
              const next = Number(event.target.value);
              setQuantity(Number.isFinite(next) ? Math.min(Math.max(next, minimumOrder), Math.max(stock, 1)) : minimumOrder);
            }}
            className="w-12 border-0 bg-transparent text-center text-[12.5px] font-bold outline-none"
          />
          <button type="button" onClick={() => setQuantity((value) => Math.min(Math.max(stock, minimumOrder), value + 1))} disabled={disabled || quantity >= stock} aria-label={`Increase ${name} quantity`} className="grid h-8 w-8 place-items-center rounded-r-full text-[#0b5c33] disabled:opacity-40">
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void add()}
        disabled={disabled || state === "saving"}
        className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#f26b21] px-5 py-2.5 text-[12.5px] font-extrabold text-white hover:bg-[#dd5f18] disabled:opacity-50"
      >
        {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShoppingBasket className="h-4 w-4" aria-hidden />}
        {disabled ? "Out of stock" : state === "added" ? "Added to basket" : "Add to basket"}
      </button>
      <p className="text-[11px] text-[#5d6d64]">
        Minimum order {minimumOrder} {unit}.{" "}
        <Link href="/naijafresh/cart" className="font-bold text-[#0b5c33] underline">View basket</Link>
      </p>
      {message ? <p role="alert" className="text-[11px] font-semibold text-[#a3480f]">{message}</p> : null}
    </div>
  );
}

/**
 * Full product panel: price, stock, quantity control and add-to-basket.
 * Rendered from the server listing page so price text stays server-rendered.
 */
export function AddProducePanel({ listingId, name, unit, minimumOrder, stock, priceText, deliveryText, prepText }: { listingId: string; name: string; unit: string; minimumOrder: number; stock: number; priceText: string; deliveryText: string; prepText: string }) {
  return (
    <div>
      <p className="mt-3 text-[22px] font-extrabold text-[#0b5c33]">{priceText}</p>
      <p className={`text-[11.5px] font-semibold ${stock > 0 ? "text-[#0b8f47]" : "text-[#a3480f]"}`}>
        {stock > 0 ? `${stock} ${unit} currently listed` : "Out of stock"}
      </p>
      <dl className="mt-3 grid max-w-lg grid-cols-2 gap-2 text-[11.5px]">
        <div className="rounded-xl bg-white p-2.5 ring-1 ring-[#eef1ef]"><dt className="text-[#6b7a70]">Sold by</dt><dd className="font-bold">{unit}</dd></div>
        <div className="rounded-xl bg-white p-2.5 ring-1 ring-[#eef1ef]"><dt className="text-[#6b7a70]">Packing</dt><dd className="font-bold">{prepText}</dd></div>
        <div className="rounded-xl bg-white p-2.5 ring-1 ring-[#eef1ef]"><dt className="text-[#6b7a70]">Delivery fee</dt><dd className="font-bold">{deliveryText}</dd></div>
        <div className="rounded-xl bg-white p-2.5 ring-1 ring-[#eef1ef]"><dt className="text-[#6b7a70]">Payment</dt><dd className="font-bold">NaijaPay wallet</dd></div>
      </dl>
      <div className="mt-4 max-w-md">
        <AddProduce listingId={listingId} name={name} unit={unit} minimumOrder={minimumOrder} stock={stock} />
      </div>
    </div>
  );
}
