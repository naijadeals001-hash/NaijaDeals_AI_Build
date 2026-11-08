"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, Star } from "lucide-react";
import { koboToNaira } from "@/lib/api-client";

type Booking = {
  id: string;
  reference: string;
  title: string;
  status: string;
  paymentStatus: string;
  amountKobo: string;
  createdAt: string;
  scheduledAt: string | null;
  professionalProfile?: { displayName: string | null; city: string | null };
  listing?: { slug: string; title: string } | null;
  review?: { id: string; status: string } | null;
  disputes?: Array<{ id: string }>;
};

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: "bg-[#FFF3D6] text-[#7A5B12]",
  ACCEPTED: "bg-[#E8F0FE] text-[#1D4ED8]",
  IN_PROGRESS: "bg-[#EAF4EE] text-[#0F7A4A]",
  SUBMITTED: "bg-[#EDE9FE] text-[#5B21B6]",
  COMPLETED: "bg-[#EAF4EE] text-[#0F7A4A]",
  CANCELLED: "bg-[#FEE2E2] text-[#B91C1C]",
  DECLINED: "bg-[#FEE2E2] text-[#B91C1C]"
};

/**
 * Customer booking tracker: real bookings from /api/gigs/bookings with the
 * actions the customer is allowed to take (fund, cancel, approve completion,
 * review, dispute). Every action calls the server, which re-checks ownership
 * and state; errors are shown verbatim.
 */
export function CustomerBookingsPage() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [disputeFor, setDisputeFor] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");

  const load = useCallback(() => {
    fetch("/api/gigs/bookings", { credentials: "include" })
      .then((res) =>
        res.ok
          ? res.json()
          : res.json().then((body) => Promise.reject(Object.assign(new Error(body.error ?? "Unable to load bookings."), { status: res.status })))
      )
      .then((body) => {
        setBookings(Array.isArray(body) ? body : body.bookings ?? []);
        setState("ready");
      })
      .catch((err) => {
        if (err.status === 401) setState("signed-out");
        else {
          setError(err instanceof Error ? err.message : "Unable to load bookings.");
          setState("error");
        }
      });
  }, []);

  useEffect(load, [load]);

  async function act(bookingId: string, url: string, body?: unknown, success = "Done.") {
    setBusy(bookingId);
    setNotice("");
    setError("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? `Request failed (HTTP ${res.status}).`);
      setNotice(success);
      setReviewFor(null);
      setDisputeFor(null);
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setBusy("");
    }
  }

  if (state === "signed-out") {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <h1 className="font-display text-xl font-extrabold text-[#0B1F16]">Sign in to see your bookings</h1>
        <Link href="/login?next=/naijagigs/bookings" className="mt-4 inline-block rounded-xl bg-[#0F7A4A] px-6 py-3 text-sm font-bold text-white">
          Sign in
        </Link>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="mx-auto max-w-md py-12 text-center" aria-busy="true">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#0F7A4A]" aria-hidden />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[#FECACA] bg-white p-8 text-center">
        <p className="text-sm font-bold text-[#B91C1C]">{error}</p>
        <button type="button" onClick={load} className="mt-3 rounded-xl bg-[#0F7A4A] px-5 py-2.5 text-sm font-bold text-white">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-5">
        <h1 className="font-display text-[26px] font-extrabold text-[#0B1F16]">My bookings</h1>
        <p className="mt-1 text-[12.5px] text-[#6B7A72]">Track requests, pay securely and confirm completed work.</p>
      </header>

      {notice ? (
        <p role="status" className="mb-3 rounded-xl bg-[#EAF4EE] p-3 text-[12px] font-bold text-[#0F7A4A]">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-3 flex items-start gap-2 rounded-xl bg-[#FEF2F2] p-3 text-[12px] font-bold text-[#B91C1C]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
        </p>
      ) : null}

      {bookings === null || bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D8D2C4] bg-[#FAF7F0] p-10 text-center">
          <h2 className="font-display text-lg font-extrabold text-[#0B1F16]">No bookings yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-6 text-[#6B7A72]">
            Browse services and request a booking — it will appear here with live status.
          </p>
          <Link href="/naijagigs/services" className="mt-4 inline-block rounded-xl bg-[#0F7A4A] px-5 py-3 text-[12.5px] font-bold text-white">
            Browse services
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {bookings.map((booking) => {
            const canFund = booking.status === "ACCEPTED" && booking.paymentStatus === "UNPAID";
            const canCancel = ["REQUESTED", "ACCEPTED"].includes(booking.status);
            const canApprove = booking.status === "SUBMITTED" && booking.paymentStatus === "HELD";
            const canReview = booking.status === "COMPLETED" && !booking.review;
            const canDispute = booking.paymentStatus === "HELD" && (booking.disputes ?? []).length === 0;
            return (
              <li key={booking.id} className="rounded-2xl border border-[#E5DFD2] bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-extrabold text-[#0B1F16]">{booking.title}</p>
                    <p className="mt-0.5 text-[11px] text-[#6B7A72]">
                      {booking.professionalProfile?.displayName ?? "Professional"} · {booking.reference} ·{" "}
                      {new Date(booking.createdAt).toLocaleDateString("en-NG")}
                      {booking.scheduledAt ? ` · scheduled ${new Date(booking.scheduledAt).toLocaleDateString("en-NG")}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-[16px] font-extrabold text-[#0B1F16]">{koboToNaira(booking.amountKobo)}</p>
                    <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[booking.status] ?? "bg-[#F4F0E4] text-[#5C6A62]"}`}>
                      {booking.status.replace("_", " ")}
                    </span>
                  </div>
                </div>

                <p className="mt-2 text-[11px] text-[#6B7A72]">
                  Payment: <strong className="text-[#34443A]">{booking.paymentStatus.toLowerCase()}</strong>
                  {booking.review ? ` · review ${booking.review.status.toLowerCase()}` : ""}
                  {(booking.disputes ?? []).length > 0 ? " · dispute open" : ""}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {booking.listing ? (
                    <Link href={`/naijagigs/services/${booking.listing.slug}`} className="rounded-lg border border-[#E5DFD2] px-3 py-2 text-[11.5px] font-bold text-[#34443A] hover:bg-[#F5F7F6]">
                      View service
                    </Link>
                  ) : null}
                  {canFund ? (
                    <button
                      type="button"
                      disabled={busy === booking.id}
                      onClick={() => void act(booking.id, `/api/gigs/bookings/${booking.id}/fund`, {}, "Payment held in escrow. The professional can start work.")}
                      className="rounded-lg bg-[#0F7A4A] px-3.5 py-2 text-[11.5px] font-bold text-white hover:bg-[#0B6540] disabled:opacity-60"
                    >
                      Pay from wallet
                    </button>
                  ) : null}
                  {canApprove ? (
                    <button
                      type="button"
                      disabled={busy === booking.id}
                      onClick={() => void act(booking.id, `/api/gigs/bookings/${booking.id}/action`, { action: "approve" }, "Work approved — payment released to the professional.")}
                      className="rounded-lg bg-[#0F7A4A] px-3.5 py-2 text-[11.5px] font-bold text-white hover:bg-[#0B6540] disabled:opacity-60"
                    >
                      Confirm completion
                    </button>
                  ) : null}
                  {canReview ? (
                    <button type="button" onClick={() => setReviewFor(booking.id)} className="rounded-lg border border-[#0F7A4A]/40 px-3 py-2 text-[11.5px] font-bold text-[#0F7A4A] hover:bg-[#F2F8F3]">
                      Leave a review
                    </button>
                  ) : null}
                  {canDispute ? (
                    <button type="button" onClick={() => setDisputeFor(booking.id)} className="rounded-lg border border-[#F0A15D] px-3 py-2 text-[11.5px] font-bold text-[#D9630B] hover:bg-[#FFF9F2]">
                      Report a problem
                    </button>
                  ) : null}
                  {canCancel ? (
                    <button
                      type="button"
                      disabled={busy === booking.id}
                      onClick={() => {
                        if (!window.confirm("Cancel this booking? Any escrow payment is refunded to your wallet.")) return;
                        void act(booking.id, `/api/gigs/bookings/${booking.id}/action`, { action: "cancel" }, "Booking cancelled.");
                      }}
                      className="rounded-lg border border-[#E5DFD2] px-3 py-2 text-[11.5px] font-bold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>

                {reviewFor === booking.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void act(booking.id, `/api/gigs/bookings/${booking.id}/review`, { rating, comment }, "Review submitted — it appears after moderation.");
                    }}
                    className="mt-3 rounded-xl border border-[#E5DFD2] bg-[#FFFDF8] p-3"
                  >
                    <p className="flex items-center gap-1 text-[11.5px] font-bold text-[#0B1F16]">
                      <Star className="h-3.5 w-3.5 fill-[#F0A15D] text-[#F0A15D]" aria-hidden /> Your rating
                    </p>
                    <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Rating">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={rating === value}
                          onClick={() => setRating(value)}
                          className={`h-8 w-8 rounded-lg border text-[12px] font-bold ${rating === value ? "border-[#0F7A4A] bg-[#0F7A4A] text-white" : "border-[#E5DFD2] bg-white text-[#34443A]"}`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      rows={3}
                      maxLength={1000}
                      required
                      placeholder="How did it go?"
                      className="mt-2 w-full resize-none rounded-lg border border-[#E5DFD2] px-3 py-2 text-[12px] text-[#16241D] outline-none focus:border-[#0F7A4A]"
                    />
                    <div className="mt-2 flex gap-2">
                      <button type="submit" disabled={busy === booking.id} className="rounded-lg bg-[#0F7A4A] px-4 py-2 text-[11.5px] font-bold text-white disabled:opacity-60">
                        Submit review
                      </button>
                      <button type="button" onClick={() => setReviewFor(null)} className="rounded-lg border border-[#E5DFD2] px-4 py-2 text-[11.5px] font-bold text-[#34443A]">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}

                {disputeFor === booking.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void act(booking.id, `/api/gigs/bookings/${booking.id}/dispute`, { reason: disputeReason }, "Problem reported — our team will review it.");
                    }}
                    className="mt-3 rounded-xl border border-[#F0A15D] bg-[#FFF9F2] p-3"
                  >
                    <label className="text-[11.5px] font-bold text-[#0B1F16]">
                      What went wrong?
                      <textarea
                        value={disputeReason}
                        onChange={(event) => setDisputeReason(event.target.value)}
                        rows={3}
                        required
                        minLength={5}
                        className="mt-1 w-full resize-none rounded-lg border border-[#E5DFD2] px-3 py-2 text-[12px] font-medium text-[#16241D] outline-none focus:border-[#0F7A4A]"
                      />
                    </label>
                    <div className="mt-2 flex gap-2">
                      <button type="submit" disabled={busy === booking.id} className="rounded-lg bg-[#D9630B] px-4 py-2 text-[11.5px] font-bold text-white disabled:opacity-60">
                        Report problem
                      </button>
                      <button type="button" onClick={() => setDisputeFor(null)} className="rounded-lg border border-[#E5DFD2] px-4 py-2 text-[11.5px] font-bold text-[#34443A]">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}

                {booking.status === "COMPLETED" ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-[#0F7A4A]">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Completed and paid
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
