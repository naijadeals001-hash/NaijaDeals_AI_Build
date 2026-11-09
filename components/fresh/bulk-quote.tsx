"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Send } from "lucide-react";

type Listing = { id: string; name: string; unit: string; priceKobo: string; farm: { name: string; slug: string } };

const field = "mt-0.5 w-full rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-normal ring-1 ring-[#dfe6e1] focus:outline-none focus:ring-2 focus:ring-[#0b5c33]";

/** Bulk quote request against a real listing; the farm answers with its own price. */
export function BulkQuoteForm({ listings }: { listings: Listing[] }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ listingId: listings[0]?.id ?? "", quantity: "50", note: "" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    const response = await fetch("/api/fresh/bulk-quotes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: form.listingId, quantity: Number(form.quantity), note: form.note })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setMessage(response.status === 401 ? "Sign in or create a business account to request a quote." : body.error ?? "Could not send the request.");
      return;
    }
    setState("done");
    router.refresh();
  }

  if (!listings.length) {
    return <p className="rounded-2xl bg-white p-4 text-[12px] text-[#5d6d64] ring-1 ring-[#eef1ef]">No produce is listed yet, so there is nothing to quote against. Check back after the next harvest.</p>;
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl bg-white p-6 ring-1 ring-[#eef1ef]">
        <p className="font-display text-[15px] font-extrabold text-[#0b5c33]">Quote request sent</p>
        <p className="mt-1 text-[12px] leading-6 text-[#5d6d64]">The farm will answer with its own price per unit. Nothing is charged until you accept a quote. You can follow every request below.</p>
        <button type="button" onClick={() => setState("idle")} className="mt-3 rounded-full bg-[#0b5c33] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Request another quote</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-2xl bg-[#f2f9f0] p-3">
      <h2 className="font-display text-[14px] font-extrabold">Request a wholesale quote</h2>
      <label className="text-[11px] font-semibold">Produce
        <select value={form.listingId} onChange={(event) => setForm({ ...form, listingId: event.target.value })} className={field}>
          {listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.name} — {listing.farm.name} (₦{(Number(listing.priceKobo) / 100).toLocaleString("en-NG")} / {listing.unit})</option>)}
        </select>
      </label>
      <label className="text-[11px] font-semibold">Quantity needed<input required inputMode="numeric" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} className={field} /></label>
      <label className="text-[11px] font-semibold">Business and delivery needs<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={2} placeholder="Weekly restaurant supply, deliver to Lekki, invoice required…" className={field} /></label>
      <button type="submit" disabled={state === "saving"} className="flex items-center justify-center gap-1.5 rounded-full bg-[#f26b21] px-4 py-2 text-[11.5px] font-extrabold text-white disabled:opacity-60">
        {state === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
        Send request to the farm
      </button>
      {message ? <p role="alert" className="text-[11px] font-semibold text-[#a3480f]">{message}</p> : null}
      <p className="text-[10px] leading-4 text-[#6b7a70]">
        NaijaFresh does not set wholesale prices or invent supplier quotes; the farm answers each request.{" "}
        <Link href="/naijafresh/shop" className="font-semibold text-[#0b5c33] underline">Browse retail produce</Link>
      </p>
    </form>
  );
}

/** Farmer-side quote answer control. */
export function QuoteAnswer({ quoteId, unit }: { quoteId: string; unit: string }) {
  const router = useRouter();
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function answer(status: "quoted" | "declined") {
    setBusy(true);
    setError("");
    const response = await fetch("/api/fresh/bulk-quotes", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: quoteId, status, quotedPriceKobo: status === "quoted" ? Math.round(Number(price) * 100) : undefined })
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not save the quote.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <label className="text-[10.5px] font-semibold">Your price / {unit}
        <input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} className="ml-1 w-24 rounded px-2 py-1 text-[11px] ring-1 ring-[#dfe6e1]" aria-label={`Your price per ${unit}`} />
      </label>
      <button type="button" disabled={busy || !price} onClick={() => void answer("quoted")} className="rounded-full bg-[#0b5c33] px-3 py-1 text-[10.5px] font-extrabold text-white disabled:opacity-50">Send quote</button>
      <button type="button" disabled={busy} onClick={() => void answer("declined")} className="rounded-full px-3 py-1 text-[10.5px] font-bold text-[#a3480f] ring-1 ring-[#f0d5c4]">Decline</button>
      {error ? <p role="alert" className="text-[10px] font-semibold text-[#a3480f]">{error}</p> : null}
    </div>
  );
}
