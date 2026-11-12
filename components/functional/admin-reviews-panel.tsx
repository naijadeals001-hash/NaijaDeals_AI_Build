"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Star,
  XCircle
} from "lucide-react";
import { apiClient, type ApiAdminReview } from "@/lib/api-client";

type ReviewFilter = "PENDING" | "APPROVED" | "REJECTED" | "ALL";

const FILTERS: Array<{ id: ReviewFilter; label: string }> = [
  { id: "PENDING", label: "Pending" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
  { id: "ALL", label: "All" }
];

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function statusClasses(status: ApiAdminReview["status"]): string {
  if (status === "APPROVED") return "border-[#00E676]/40 bg-[#00E676]/10 text-[#00E676]";
  if (status === "REJECTED") return "border-crimson/40 bg-crimson/10 text-crimson";
  return "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]";
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          aria-hidden="true"
          className={`h-3.5 w-3.5 ${value <= rating ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#30363D]"}`}
        />
      ))}
      <span className="ml-1 text-xs font-bold text-[#8B949E]">{rating}/5</span>
    </span>
  );
}

function ReviewCard({
  review,
  busy,
  note,
  onNote,
  onModerate
}: {
  review: ApiAdminReview;
  busy: boolean;
  note: string;
  onNote: (value: string) => void;
  onModerate: (action: "APPROVE" | "REJECT") => void;
}) {
  const image = review.product.images[0];
  const reasonId = `review-reason-${review.id}`;
  return (
    <article className="rounded-xl border border-[#21262D] bg-[#0B0E14] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.url}
              alt={image.alt ?? review.product.name}
              className="h-14 w-14 shrink-0 rounded-lg border border-[#21262D] object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-[#21262D] bg-[#161B22] text-[#8B949E]"
            >
              <Star className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <a
              href={`/product/${review.product.slug}`}
              target="_blank"
              rel="noreferrer"
              className="break-words font-bold text-[#F0F6FC] underline decoration-[#30363D] underline-offset-4 hover:decoration-[#00E676]"
            >
              {review.product.name}
            </a>
            <p className="mt-0.5 text-xs text-[#8B949E]">
              {review.product.vendor.name}
              {review.order?.orderNumber ? ` · Order ${review.order.orderNumber}` : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <StarRating rating={review.rating} />
              <span className="text-xs text-[#8B949E]">{formatDate(review.createdAt)}</span>
              {review.verifiedPurchase ? (
                <span className="rounded-full border border-[#00E676]/30 px-2 py-0.5 text-[10px] font-bold text-[#00E676]">
                  Verified purchase
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <span className={`inline-flex w-fit whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusClasses(review.status)}`}>
          {review.status}
        </span>
      </div>

      <div className="mt-3 border-t border-[#21262D] pt-3">
        <p className="font-bold text-[#F0F6FC]">{review.title}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#C9D1D9]">{review.body}</p>
        <p className="mt-2 text-xs text-[#8B949E]">By {review.user.name}</p>
      </div>

      {review.status === "PENDING" ? (
        <div className="mt-3 rounded-lg border border-[#21262D] bg-[#161B22] p-3">
          <label htmlFor={reasonId} className="text-xs font-bold text-[#F0F6FC]">
            Moderation note <span className="font-normal text-[#8B949E]">(required to reject, optional to approve)</span>
          </label>
          <textarea
            id={reasonId}
            value={note}
            onChange={(event) => onNote(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Explain the decision. This is stored in the audit log, not shown publicly."
            className="mt-1.5 w-full rounded-lg border border-[#21262D] bg-[#0B0E14] px-3 py-2 text-sm text-[#F0F6FC] placeholder:text-[#8B949E] focus:border-[#00E676] focus:outline-none focus:ring-2 focus:ring-[#00E676]/30"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onModerate("APPROVE")}
              className="flex min-h-10 items-center gap-1.5 rounded-lg border border-[#00E676]/40 bg-[#00E676]/10 px-3 text-xs font-bold text-[#00E676] hover:bg-[#00E676]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              {busy ? "Working…" : "Approve and publish"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onModerate("REJECT")}
              className="flex min-h-10 items-center gap-1.5 rounded-lg border border-crimson/40 bg-crimson/10 px-3 text-xs font-bold text-crimson hover:bg-crimson/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
              {busy ? "Working…" : "Reject"}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Control Center → NaijaShop → Reviews.
 *
 * Only `products:moderate` holders reach this panel; the API enforces the same
 * permission. Approved reviews become visible through the catalogue rating
 * aggregation, which counts APPROVED rows only.
 */
export function AdminReviewsPanel({ canModerate }: { canModerate: boolean }) {
  const [reviews, setReviews] = useState<ApiAdminReview[]>([]);
  const [loading, setLoading] = useState(canModerate);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<ReviewFilter>("PENDING");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiClient.adminReviews("ALL");
      setReviews(Array.isArray(data.reviews) ? data.reviews : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reviews could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canModerate) return;
    void load();
  }, [canModerate, load]);

  async function moderate(review: ApiAdminReview, action: "APPROVE" | "REJECT") {
    const reason = (notes[review.id] ?? "").trim();
    if (action === "REJECT" && reason.length === 0) {
      setError("Enter a moderation note before rejecting a review.");
      return;
    }
    setBusyId(review.id);
    setError("");
    setMessage("");
    try {
      await apiClient.adminModerateReview(review.id, action, reason || undefined);
      setNotes((current) => {
        const next = { ...current };
        delete next[review.id];
        return next;
      });
      setMessage(
        action === "APPROVE"
          ? "Review approved. It is now counted in the product rating."
          : "Review rejected. The reason was recorded in the audit log."
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The review could not be moderated.");
    } finally {
      setBusyId("");
    }
  }

  if (!canModerate) {
    return (
      <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-6 shadow-soft">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#F59E0B]" aria-hidden="true" />
          <div>
            <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Review moderation</h2>
            <p className="mt-1 max-w-2xl text-sm text-[#8B949E]">
              Product reviews are hidden from the storefront until they are approved. Approving or rejecting a review
              requires the <code className="rounded bg-[#0B0E14] px-1 py-0.5 text-xs">products:moderate</code> permission.
              Your account does not hold it, so no review content is shown.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const counts = {
    PENDING: reviews.filter((review) => review.status === "PENDING").length,
    APPROVED: reviews.filter((review) => review.status === "APPROVED").length,
    REJECTED: reviews.filter((review) => review.status === "REJECTED").length,
    ALL: reviews.length
  };
  const visible = filter === "ALL" ? reviews : reviews.filter((review) => review.status === filter);

  return (
    <section className="overflow-hidden rounded-2xl border border-[#21262D] bg-[#161B22] shadow-soft">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Reviews</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#8B949E]">
            Customer reviews are created pending. Only approved reviews are aggregated into the product rating and
            rendered on the product page. Decisions and rejection reasons are written to the audit log.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-[#21262D] bg-[#0B0E14] px-3 text-sm font-bold text-[#F0F6FC] hover:bg-[#21262D] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-y border-[#21262D] px-4 py-2" role="group" aria-label="Filter reviews by status">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={filter === entry.id}
            onClick={() => setFilter(entry.id)}
            className={`min-h-9 whitespace-nowrap rounded-full px-3 text-xs font-bold transition-colors ${
              filter === entry.id
                ? "bg-[#00E676] text-[#0B0E14]"
                : "bg-[#21262D] text-[#8B949E] hover:text-[#F0F6FC]"
            }`}
          >
            {entry.label} ({counts[entry.id]})
          </button>
        ))}
      </div>

      {message ? (
        <p role="status" className="m-4 rounded-xl border border-[#00E676]/30 bg-[#00E676]/10 p-3 text-sm font-bold text-[#00E676]">
          {message}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="m-4 rounded-xl border border-crimson/30 bg-crimson/10 p-3 text-sm font-bold text-crimson">
          <p className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {error}
          </p>
          {reviews.length === 0 && !loading ? (
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 min-h-9 rounded-lg border border-crimson/40 px-3 text-xs font-bold text-crimson hover:bg-crimson/20"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-[#8B949E]" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading reviews…
        </div>
      ) : visible.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-[#8B949E]">
          {reviews.length === 0
            ? "No customer reviews have been submitted yet."
            : `No ${filter === "ALL" ? "" : filter.toLowerCase()} reviews match this filter.`}
        </p>
      ) : (
        <div className="space-y-3 p-4">
          {visible.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              busy={busyId === review.id}
              note={notes[review.id] ?? ""}
              onNote={(value) => setNotes((current) => ({ ...current, [review.id]: value }))}
              onModerate={(action) => void moderate(review, action)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
