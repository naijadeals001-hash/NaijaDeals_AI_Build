"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";

/**
 * Booking panel. Shows a live estimate for the chosen dates; the authoritative
 * price and availability check happen on the server when the hold is created.
 * Never claims a booking succeeded until the server returns one.
 */
export function StayBookingPanel({
  propertyId,
  slug,
  nightlyKobo,
  cleaningKobo,
  serviceFeeBps,
  currency,
  maxGuests,
  minimumNights,
  unavailable
}: {
  propertyId: string;
  slug: string;
  nightlyKobo: string;
  cleaningKobo: string;
  serviceFeeBps: number;
  currency: string;
  maxGuests: number;
  minimumNights: number;
  unavailable: Array<{ start: string; end: string }>;
}) {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  const nights = checkIn && checkOut ? Math.max(0, Math.round((new Date(`${checkOut}T00:00:00Z`).getTime() - new Date(`${checkIn}T00:00:00Z`).getTime()) / 86_400_000)) : 0;
  const subtotal = nights * Number(nightlyKobo);
  const service = Math.round((subtotal * serviceFeeBps) / 10000);
  const total = subtotal > 0 ? subtotal + Number(cleaningKobo) + service : 0;
  const naira = (v: number) => `₦${(v / 100).toLocaleString("en-NG")}`;

  async function reserve(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    setError("");
    const response = await fetch("/api/stay/hold", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, checkIn, checkOut, guests, guestName: name, guestPhone: phone })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setError(
        response.status === 401 ? "Sign in to book this stay." : body.error ?? "Could not reserve those dates."
      );
      return;
    }
    router.push(`/naijastay/bookings/${body.reference}`);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={reserve} className="sticky top-28 space-y-2 rounded-2xl bg-white p-3 ring-1 ring-[#eef1ef]">
      <p className="text-[16px] font-extrabold text-[#0b5c33]">{naira(Number(nightlyKobo))} <span className="text-[11px] font-semibold text-[#6b7a70]">/ night · {currency}</span></p>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[10px] font-bold uppercase tracking-wide text-[#6b7a70]">Check-in
          <input type="date" required min={today} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="mt-0.5 w-full rounded-lg bg-white px-2 py-1.5 text-[12px] font-normal ring-1 ring-[#dfe6e1]" />
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wide text-[#6b7a70]">Check-out
          <input type="date" required min={checkIn || today} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="mt-0.5 w-full rounded-lg bg-white px-2 py-1.5 text-[12px] font-normal ring-1 ring-[#dfe6e1]" />
        </label>
      </div>
      <label className="block text-[10px] font-bold uppercase tracking-wide text-[#6b7a70]">Guests
        <select value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="mt-0.5 w-full rounded-lg bg-white px-2 py-1.5 text-[12px] font-normal ring-1 ring-[#dfe6e1]" aria-label="Guests">
          {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} guest{n === 1 ? "" : "s"}</option>)}
        </select>
      </label>
      <label className="block text-[10px] font-bold uppercase tracking-wide text-[#6b7a70]">Your name
        <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-0.5 w-full rounded-lg bg-white px-2 py-1.5 text-[12px] font-normal ring-1 ring-[#dfe6e1]" autoComplete="name" />
      </label>
      <label className="block text-[10px] font-bold uppercase tracking-wide text-[#6b7a70]">Phone
        <input required value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="mt-0.5 w-full rounded-lg bg-white px-2 py-1.5 text-[12px] font-normal ring-1 ring-[#dfe6e1]" autoComplete="tel" />
      </label>

      {nights > 0 ? (
        <dl className="space-y-0.5 border-t border-[#eef1ef] pt-2 text-[11.5px]">
          <div className="flex justify-between"><dt className="text-[#5d6d64]">{naira(Number(nightlyKobo))} × {nights} night{nights === 1 ? "" : "s"}</dt><dd className="font-semibold">{naira(subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-[#5d6d64]">Cleaning</dt><dd className="font-semibold">{naira(Number(cleaningKobo))}</dd></div>
          <div className="flex justify-between"><dt className="text-[#5d6d64]">Service fee ({(serviceFeeBps / 100).toFixed(2)}%)</dt><dd className="font-semibold">{naira(service)}</dd></div>
          <div className="flex justify-between border-t border-[#eef1ef] pt-1 text-[13px] font-extrabold"><dt>Total</dt><dd>{naira(total)}</dd></div>
        </dl>
      ) : (
        <p className="text-[10.5px] leading-4 text-[#6b7a70]">Choose dates to see the full price. Minimum stay {minimumNights} night{minimumNights === 1 ? "" : "s"}.</p>
      )}

      <button type="submit" disabled={state === "saving"} className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#f26b21] px-4 py-2.5 text-[12.5px] font-extrabold text-white hover:bg-[#dd5f18] disabled:opacity-60">
        {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Reserve &amp; pay with NaijaPay
      </button>
      <p className="flex items-start gap-1 text-[9.5px] leading-4 text-[#6b7a70]"><ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-[#0b8f47]" aria-hidden /> Dates are held for 20 minutes while you pay. Availability is re-checked on the server.</p>
      {unavailable.length ? (
        <p className="text-[9.5px] leading-4 text-[#a3480f]">Unavailable dates: {unavailable.map((u) => `${u.start} → ${u.end}`).join(", ")}</p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-[#fff3e8] p-2 text-[10.5px] font-semibold text-[#a3480f]">
          {error} {error.includes("Sign in") ? <a href={`/login?next=/naijastay/stays/${slug}`} className="underline">Sign in</a> : null}
        </p>
      ) : null}
    </form>
  );
}
