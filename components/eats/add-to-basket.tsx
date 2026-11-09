"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, Plus } from "lucide-react";

/** Adds a menu item to the signed-in basket. Guests are sent to sign in. */
export function AddToBasket({ menuItemId, name, available }: { menuItemId: string; name: string; available: boolean }) {
  const [state, setState] = useState<"idle" | "saving" | "added" | "error">("idle");
  const [message, setMessage] = useState("");

  if (!available) {
    return <span className="rounded-full bg-[#f3f4f5] px-2.5 py-1 text-[10px] font-bold text-[#8a938d]">Sold out</span>;
  }

  return (
    <span className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        aria-label={`Add ${name} to basket`}
        disabled={state === "saving"}
        onClick={async () => {
          setState("saving");
          const response = await fetch("/api/eats/cart/items", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ menuItemId, quantity: 1 })
          });
          if (response.ok) {
            setState("added");
            window.setTimeout(() => setState("idle"), 1800);
            return;
          }
          const body = await response.json().catch(() => ({}));
          if (response.status === 401) {
            setMessage("Sign in to add");
            setState("error");
            return;
          }
          setMessage(body.error ?? "Could not add");
          setState("error");
        }}
        className="flex items-center gap-1 rounded-full bg-[#0b5c33] px-3 py-1 text-[10.5px] font-bold text-white hover:bg-[#094a29] disabled:opacity-60"
      >
        {state === "saving" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : state === "added" ? <Check className="h-3 w-3" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />}
        {state === "added" ? "Added" : "Add"}
      </button>
      {state === "error" && message ? (
        <span className="text-[9.5px] font-semibold text-[#a3480f]">
          {message === "Sign in to add" ? <Link href="/login?next=/naijaeats/restaurants" className="underline">Sign in to add</Link> : message}
        </span>
      ) : null}
    </span>
  );
}
