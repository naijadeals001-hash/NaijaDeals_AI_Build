"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert, Star } from "lucide-react";
import { DriveApiError, getRideRatingState, submitRideRating, submitSafetyReport } from "./api";
import type { ParticipantRatingSummary, RideRatingState } from "./types";

const focus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5c33]";

function errorText(caught: unknown, fallback: string) {
  if (caught instanceof DriveApiError) return caught.message;
  return caught instanceof Error ? caught.message : fallback;
}

function Summary({ label, summary }: { label: string; summary: ParticipantRatingSummary }) {
  if (summary.count === 0) {
    return (
      <p className="text-[10.5px] text-[#5d6d64]">
        {label}: no ratings yet. Nothing is averaged until a real trip is rated.
      </p>
    );
  }
  return (
    <p className="text-[10.5px] text-[#5d6d64]">
      {label}: <span className="font-extrabold text-[#14241b]">{summary.average?.toFixed(1)}</span> from{" "}
      {summary.count} completed-trip rating{summary.count === 1 ? "" : "s"}.
    </p>
  );
}

export function RideRatingPanel({
  rideId,
  role,
  compact = false
}: {
  rideId: string;
  role: "customer" | "driver";
  compact?: boolean;
}) {
  const [state, setState] = useState<RideRatingState | null>(null);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    getRideRatingState(rideId)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  async function submit() {
    if (score < 1) {
      setError("Choose a rating from 1 to 5.");
      return;
    }
    setBusy("rating");
    setError("");
    setNotice("");
    try {
      const result = await submitRideRating({ rideId, score, feedback: feedback.trim() || null });
      setState((current) =>
        current
          ? { ...current, canRate: false, own: result.rating }
          : current
      );
      setNotice("Rating recorded. Thank you.");
    } catch (caught) {
      if (caught instanceof DriveApiError && caught.status === 409) {
        const next = await getRideRatingState(rideId).catch(() => null);
        if (next) setState(next);
      }
      setError(errorText(caught, "Unable to record this rating."));
    } finally {
      setBusy("");
    }
  }

  if (!state) return null;
  if (state.own) {
    return (
      <div className={compact ? "mt-1.5" : "mt-3"}>
        <p className="flex items-center gap-1 text-[10.5px] font-bold text-[#0b5c33]">
          <CheckCircle2 className="h-3 w-3" aria-hidden />
          You rated this trip {state.own.score}/5.
        </p>
        {!compact ? (
          <div className="mt-1 space-y-1">
            <Summary label="Driver rating" summary={state.driverSummary} />
            <Summary label="Passenger rating" summary={state.customerSummary} />
          </div>
        ) : null}
      </div>
    );
  }
  if (!state.canRate) return null;

  const label = role === "customer" ? "Rate your driver" : "Rate your passenger";

  return (
    <div className={`${compact ? "mt-2 rounded-lg bg-[#f7f8f6] p-2" : "mt-3 rounded-xl border border-[#e2e6e3] bg-white p-3"}`}>
      <p className="text-[11px] font-extrabold text-[#14241b]">{label}</p>
      <div className="mt-1 flex items-center gap-1" role="radiogroup" aria-label={`${label}, 1 to 5`}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={score === value}
            aria-label={`${value} out of 5`}
            onClick={() => setScore(value)}
            className={`grid h-8 w-8 place-items-center rounded-full transition ${focus} ${
              score >= value ? "bg-[#eaf5ec] text-[#0b5c33]" : "bg-white text-[#9aa79f]"
            }`}
          >
            <Star className="h-4 w-4" fill={score >= value ? "currentColor" : "none"} aria-hidden />
          </button>
        ))}
        <span className="ml-1 text-[10.5px] font-bold text-[#5d6d64]">{score ? `${score}/5` : "Choose"}</span>
      </div>
      <label htmlFor={`rating-feedback-${rideId}`} className="mt-1.5 block text-[10px] font-bold text-[#5d6d64]">
        Optional feedback (not published)
      </label>
      <textarea
        id={`rating-feedback-${rideId}`}
        value={feedback}
        onChange={(event) => setFeedback(event.target.value.slice(0, 1000))}
        rows={compact ? 2 : 3}
        maxLength={1000}
        className="mt-0.5 w-full rounded-lg border border-[#dfe7df] bg-white px-2 py-1.5 text-[11.5px] text-[#14241b]"
      />
      {error ? (
        <p role="alert" className="mt-1 text-[10.5px] font-bold text-[#b91c1c]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-1 text-[10.5px] font-bold text-[#0b5c33]">
          {notice}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy === "rating" || score < 1}
        className={`mt-1.5 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#0b5c33] px-3 text-[10.5px] font-extrabold text-white disabled:opacity-50 ${focus}`}
      >
        {busy === "rating" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Star className="h-3 w-3" aria-hidden />}
        Submit rating
      </button>
    </div>
  );
}

const SAFETY_CATEGORIES = [
  ["unsafe_driving", "Unsafe driving"],
  ["harassment", "Harassment or threat"],
  ["vehicle_condition", "Vehicle condition or plate mismatch"],
  ["route_deviation", "Unexpected route"],
  ["payment", "Payment or fare concern"],
  ["other", "Something else"]
] as const;

export function SafetyReportForm({ rideId }: { rideId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("unsafe_driving");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await submitSafetyReport({ rideId, category, details });
      setNotice("Safety report sent to NaijaDrive support. It is not published as a review.");
      setDetails("");
      setOpen(false);
    } catch (caught) {
      setError(errorText(caught, "Unable to send the safety report."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-[#e2cfae] bg-[#fffaf2] p-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 text-left text-[11px] font-extrabold text-[#8a4b12] ${focus}`}
      >
        <span className="flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
          Report a safety concern
        </span>
        <span className="text-[10px] font-bold text-[#a3480f]">{open ? "Close" : "Open"}</span>
      </button>
      {open ? (
        <div className="mt-2 space-y-1.5">
          <p className="text-[10px] leading-4 text-[#7a5a35]">
            This goes to support, not to the public. For an emergency, contact local emergency services.
          </p>
          <label htmlFor={`safety-category-${rideId}`} className="sr-only">
            Safety concern type
          </label>
          <select
            id={`safety-category-${rideId}`}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="min-h-9 w-full rounded-lg border border-[#e2cfae] bg-white px-2 text-[11.5px]"
          >
            {SAFETY_CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label htmlFor={`safety-details-${rideId}`} className="sr-only">
            Safety concern details
          </label>
          <textarea
            id={`safety-details-${rideId}`}
            value={details}
            onChange={(event) => setDetails(event.target.value.slice(0, 1500))}
            rows={3}
            maxLength={1500}
            placeholder="What happened?"
            className="w-full rounded-lg border border-[#e2cfae] bg-white px-2 py-1.5 text-[11.5px]"
          />
          {error ? (
            <p role="alert" className="text-[10.5px] font-bold text-[#b91c1c]">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || details.trim().length < 5}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#a3480f] px-3 text-[10.5px] font-extrabold text-white disabled:opacity-50 ${focus}`}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <ShieldAlert className="h-3 w-3" aria-hidden />}
            Send to support
          </button>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="mt-1 text-[10.5px] font-bold text-[#0b5c33]">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
