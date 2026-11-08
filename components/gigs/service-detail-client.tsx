"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarCheck, CheckCircle2, Loader2, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { koboToNaira } from "@/lib/api-client";

type Props = {
  slug: string;
  listingId: string;
  title: string;
  pricingType: string;
  priceKobo: string | null;
  mode: string;
  city: string | null;
  state: string | null;
  isSample: boolean;
  signedIn: boolean;
  professionalProfileId: string;
  professionalName: string;
};

function nairaToKobo(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const kobo = Math.round(Number(trimmed) * 100);
  return Number.isSafeInteger(kobo) && kobo > 0 ? kobo : null;
}

/**
 * Booking panel for a service: requests a real booking (status REQUESTED) on
 * the shared gig engine. Quotes-required services let the customer state a
 * budget. Demonstration listings are visibly not bookable and the server
 * enforces the same rule.
 */
export function ServiceBookingPanel(props: Props) {
  const fixedPrice = props.pricingType !== "QUOTE" && props.priceKobo !== null;
  const [amount, setAmount] = useState(props.priceKobo ? String(Number(props.priceKobo) / 100) : "");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState("");

  if (props.isSample) {
    return (
      <div className="rounded-2xl border border-[#F0D48A] bg-[#FFF8E6] p-5">
        <p className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-wide text-[#7A5B12]">
          <Sparkles className="h-4 w-4" aria-hidden /> Demonstration listing
        </p>
        <p className="mt-2 text-[12px] leading-6 text-[#7A5B12]">
          This example shows how a service page works. It cannot be booked, paid for or reviewed. Browse other services
          or become a verified professional to appear here for real.
        </p>
        <Link href="/naijagigs/services" className="mt-4 block rounded-xl bg-[#0F7A4A] py-3 text-center text-[13px] font-bold text-white transition hover:bg-[#0B6540]">
          Browse bookable services
        </Link>
      </div>
    );
  }

  if (!props.signedIn) {
    return (
      <div className="rounded-2xl border border-[#E5DFD2] bg-white p-5 shadow-sm">
        <p className="text-[13px] font-extrabold text-[#0B1F16]">Sign in to book this service</p>
        <p className="mt-1 text-[11.5px] leading-5 text-[#6B7A72]">
          Payments are held safely in NaijaPay escrow until you confirm the work is done.
        </p>
        <Link
          href={`/login?next=/naijagigs/services/${props.slug}`}
          className="mt-4 block rounded-xl bg-[#0F7A4A] py-3 text-center text-[13px] font-bold text-white transition hover:bg-[#0B6540]"
        >
          Sign in to continue
        </Link>
        <Link href="/register" className="mt-2 block rounded-xl border border-[#0F7A4A]/40 py-3 text-center text-[13px] font-bold text-[#0F7A4A] transition hover:bg-[#F2F8F3]">
          Create an account
        </Link>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
    const amountKobo = fixedPrice && props.priceKobo ? Number(props.priceKobo) : nairaToKobo(amount);
    if (!amountKobo) {
      setMessage("Enter the amount you'd like to offer for this job.");
      setStatus("error");
      return;
    }
    if (description.trim().length < 10) {
      setMessage("Describe the work you need (at least 10 characters).");
      setStatus("error");
      return;
    }
    try {
      const res = await fetch("/api/gigs/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          listingId: props.listingId,
          title: props.title,
          description: description.trim(),
          amountKobo,
          address: address.trim() || undefined,
          scheduledAt: scheduledAt || undefined
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Booking failed (HTTP ${res.status}).`);
      setReference(body.reference ?? "");
      setStatus("success");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Booking failed.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-[#DCE8DF] bg-[#F2F8F3] p-5 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-[#0F7A4A]" aria-hidden />
        <h3 className="mt-2 font-display text-lg font-extrabold text-[#0B1F16]">Booking request sent</h3>
        <p className="mt-1 text-[12px] leading-6 text-[#45564C]">
          {props.professionalName} will accept or decline. Once accepted you pay from your NaijaPay wallet and funds are
          held in escrow until you confirm completion.
        </p>
        {reference ? <p className="mt-2 text-[11px] font-bold text-[#0F7A4A]">Reference {reference}</p> : null}
        <Link href="/naijagigs/bookings" className="mt-4 block rounded-xl bg-[#0F7A4A] py-3 text-center text-[13px] font-bold text-white transition hover:bg-[#0B6540]">
          Track my bookings
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#E5DFD2] bg-white p-5 shadow-sm">
      <p className="font-display text-lg font-extrabold text-[#0B1F16]">{fixedPrice ? "Book this service" : "Request a quote"}</p>
      <p className="mt-1 text-[11.5px] text-[#6B7A72]">
        {fixedPrice ? (
          <>Price: <strong className="text-[#0B1F16]">{koboToNaira(props.priceKobo ?? "0")}</strong> — you pay only after the professional accepts.</>
        ) : (
          <>This professional quotes per job. Tell them your budget and requirements.</>
        )}
      </p>

      <label className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-[#6B7A72]">
        What do you need done?
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          maxLength={3000}
          placeholder="Describe the work, materials and access details…"
          className="mt-1 w-full resize-none rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-[13px] font-medium normal-case tracking-normal text-[#16241D] outline-none placeholder:text-[#8A978F] focus:border-[#0F7A4A]"
        />
      </label>

      {!fixedPrice && (
        <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-[#6B7A72]">
          Your budget (₦)
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="e.g. 45000"
            className="mt-1 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-[13px] font-medium normal-case tracking-normal text-[#16241D] outline-none placeholder:text-[#8A978F] focus:border-[#0F7A4A]"
          />
        </label>
      )}

      <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-[#6B7A72]">
        When? (optional)
        <input
          type="date"
          value={scheduledAt}
          onChange={(event) => setScheduledAt(event.target.value)}
          className="mt-1 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-[13px] font-medium normal-case tracking-normal text-[#16241D] outline-none focus:border-[#0F7A4A]"
        />
      </label>

      {props.mode !== "REMOTE" && (
        <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-[#6B7A72]">
          Service address (optional)
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            maxLength={300}
            placeholder="Street, area, city"
            className="mt-1 w-full rounded-xl border border-[#E5DFD2] bg-white px-3 py-2.5 text-[13px] font-medium normal-case tracking-normal text-[#16241D] outline-none placeholder:text-[#8A978F] focus:border-[#0F7A4A]"
          />
        </label>
      )}

      {message ? (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-[#FEF2F2] p-3 text-[11.5px] font-bold text-[#B91C1C]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F7A4A] py-3.5 text-[13px] font-bold text-white transition hover:bg-[#0B6540] disabled:opacity-60"
      >
        {status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarCheck className="h-4 w-4" aria-hidden />}
        {status === "submitting" ? "Sending request…" : fixedPrice ? "Request booking" : "Send quote request"}
      </button>
      <p className="mt-3 flex items-start gap-1.5 text-[10.5px] leading-4 text-[#6B7A72]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0F7A4A]" aria-hidden />
        Escrow protected: payment is released only after you confirm the work. Disputes are supported.
      </p>
      <p className="mt-1 flex items-center gap-1 text-[10.5px] text-[#6B7A72]">
        <MapPin className="h-3 w-3" aria-hidden /> {props.city || props.state || "Remote"}
      </p>
    </form>
  );
}
