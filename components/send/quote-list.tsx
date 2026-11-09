"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ShieldCheck, Truck } from "lucide-react";

type Quote = {
  id: string;
  amountKobo: string;
  transitDays: number;
  modes: string[];
  message: string | null;
  status: string;
  expiresAt: string;
  provider: { id: string; name: string; providerType: string; country: string; operatingCities: string[]; capacityKg: number | null; sourcePlatform: string };
};

function naira(kobo: string) {
  return `₦${(Number(kobo) / 100).toLocaleString("en-NG")}`;
}

/** Quote comparison and booking. Each quote is the provider's own price. */
export function QuoteList({ shipmentId, quotes, canBook }: { shipmentId: string; quotes: Quote[]; canBook: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState<{ reference: string; pickupPin: string; deliveryPin: string } | null>(null);

  async function book(quoteId: string) {
    setBusy(quoteId);
    setError("");
    const response = await fetch(`/api/send/shipments/${shipmentId}/quotes`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "book", quoteId })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(response.status === 402 ? "Your NaijaPay balance does not cover this quote. Top up your wallet first." : body.error ?? "Could not book this quote.");
      return;
    }
    setBooked(body);
    router.refresh();
  }

  if (booked) {
    return (
      <div className="rounded-2xl bg-white p-4 ring-1 ring-[#eef1ef]">
        <p className="font-display text-[15px] font-extrabold text-[#0b5c33]">Shipment booked</p>
        <p className="mt-1 text-[12px] text-[#5d6d64]">Paid from your NaijaPay wallet. Funds are released to the provider only after you confirm delivery.</p>
        <dl className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2">
          <div className="rounded-lg bg-[#f2f9f0] p-2"><dt className="text-[10px] text-[#6b7a70]">Reference</dt><dd className="font-extrabold">{booked.reference}</dd></div>
          <div className="rounded-lg bg-[#f2f9f0] p-2"><dt className="text-[10px] text-[#6b7a70]">Pickup PIN (give to the driver)</dt><dd className="font-display text-[16px] tracking-widest font-extrabold">{booked.pickupPin}</dd></div>
          <div className="rounded-lg bg-[#f2f9f0] p-2"><dt className="text-[10px] text-[#6b7a70]">Delivery PIN (keep until arrival)</dt><dd className="font-display text-[16px] tracking-widest font-extrabold">{booked.deliveryPin}</dd></div>
        </dl>
        <Link href="/naijasend/orders" className="mt-3 inline-flex rounded-full bg-[#0b5c33] px-4 py-1.5 text-[11.5px] font-extrabold text-white">Track your shipment</Link>
      </div>
    );
  }

  if (!quotes.length) {
    return (
      <div className="rounded-2xl bg-white p-5 text-center ring-1 ring-[#eef1ef]">
        <p className="font-display text-[14px] font-extrabold">No quotes yet</p>
        <p className="mx-auto mt-1 max-w-md text-[11.5px] leading-6 text-[#5d6d64]">Verified providers will submit itemised quotes for this shipment. You will be charged only when you book one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error ? <p role="alert" className="rounded-lg bg-[#fff3e8] p-2 text-[11px] font-semibold text-[#a3480f]">{error}</p> : null}
      <ul className="space-y-2">
        {quotes.map((quote) => (
          <li key={quote.id} data-quote={quote.id} className="rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-[13px] font-extrabold">{quote.provider.name} <ShieldCheck className="h-3.5 w-3.5 text-[#0b8f47]" aria-label="Verified provider" /></p>
                <p className="text-[10.5px] text-[#6b7a70]">{quote.provider.providerType} · {quote.provider.operatingCities.join(", ") || quote.provider.country}{quote.provider.sourcePlatform === "naijadrive" ? " · enrolled via NaijaDrive" : ""}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1 text-[10.5px] text-[#5d6d64]">
                  <Truck className="h-3 w-3" aria-hidden /> {quote.modes.join(" → ")}{quote.modes.length > 1 ? " (multimodal)" : ""} · {quote.transitDays} day{quote.transitDays === 1 ? "" : "s"}
                </p>
                {quote.message ? <p className="mt-1 text-[11px] italic text-[#5d6d64]">“{quote.message}”</p> : null}
              </div>
              <div className="text-right">
                <p className="text-[17px] font-extrabold text-[#0b5c33]">{naira(quote.amountKobo)}</p>
                <p className="text-[9.5px] text-[#6b7a70]">valid until {new Date(quote.expiresAt).toLocaleDateString()}</p>
                {canBook ? (
                  <button type="button" onClick={() => void book(quote.id)} disabled={busy !== null} className="mt-1.5 flex items-center gap-1 rounded-full bg-[#f26b21] px-4 py-1.5 text-[11.5px] font-extrabold text-white disabled:opacity-60">
                    {busy === quote.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null} Book &amp; pay
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
