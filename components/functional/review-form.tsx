"use client";

import { useEffect, useState } from "react";
import { Loader2, Star } from "lucide-react";

type EligibleOrder = { id: string; orderNumber: string; createdAt: string };

/**
 * Write-a-review entry point on the product page.
 *
 * Only orders the shopper actually received can be reviewed — the server
 * enforces this too (`createReview` requires a delivered order containing the
 * product). Reviews are submitted as PENDING and appear once an administrator
 * approves them, so ratings shown on cards are always moderated.
 */
export function ReviewForm({ productId, productName }: { productId: string; productName: string }) {
  const [eligible, setEligible] = useState<EligibleOrder[] | null>(null);
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/orders", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active) return;
        const orders = Array.isArray(payload) ? payload : payload?.orders ?? [];
        const delivered = orders
          .filter((order: { status?: string; items?: Array<{ productId?: string; product?: { id?: string } }> }) => {
            const deliveredStatus = ["delivered", "completed"].includes(String(order.status ?? "").toLowerCase());
            const hasProduct = (order.items ?? []).some((item) => item.productId === productId || item.product?.id === productId);
            return deliveredStatus && hasProduct;
          })
          .map((order: { id: string; orderNumber?: string; createdAt?: string }) => ({
            id: order.id,
            orderNumber: order.orderNumber ?? order.id.slice(-6),
            createdAt: order.createdAt ?? ""
          }));
        setEligible(delivered);
      })
      .catch(() => active && setEligible([]));
    return () => {
      active = false;
    };
  }, [productId]);

  // Signed-out visitors and shoppers without a delivered order see the honest
  // reason rather than a form that would be rejected on submit.
  if (eligible === null) return null;
  if (eligible.length === 0 && !open) {
    return (
      <p className="mt-4 rounded-xl bg-surface-low p-3 text-xs text-muted">
        Reviews can be written after a delivered order of this product. Buy it from a verified seller and you can rate it here.
      </p>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (rating < 1) {
      setState("error");
      setMessage("Choose a rating from 1 to 5 stars.");
      return;
    }
    setState("sending");
    setMessage("");
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ orderId, productId, rating, title, body })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      setState("sent");
      setMessage("Thank you — your review is with our moderators and will appear once approved.");
    } else {
      setState("error");
      setMessage(payload.error ?? "Your review could not be submitted.");
    }
  }

  if (state === "sent") {
    return <p role="status" className="mt-4 rounded-xl bg-primary-soft p-3 text-xs font-semibold text-primary">{message}</p>;
  }

  return (
    <div className="mt-4">
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setOrderId(eligible[0]?.id ?? "");
          }}
          className="rounded-lg border border-border-soft px-4 py-2 text-sm font-bold hover:bg-surface-low"
        >
          Write a review
        </button>
      ) : (
        <form onSubmit={submit} className="rounded-xl bg-surface-low p-4">
          <p className="text-sm font-bold">Review {productName}</p>
          <label className="mt-3 block text-xs font-bold">
            Order
            <select
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
              className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-canvas px-2 text-sm"
            >
              {eligible.map((order) => (
                <option key={order.id} value={order.id}>
                  Order {order.orderNumber}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="mt-3">
            <legend className="text-xs font-bold">Rating</legend>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  aria-label={`${value} star${value === 1 ? "" : "s"}`}
                  aria-pressed={rating === value}
                  className="rounded p-1"
                >
                  <Star className={`h-6 w-6 ${value <= rating ? "fill-amber text-amber" : "text-muted"}`} aria-hidden />
                </button>
              ))}
            </div>
          </fieldset>
          <label className="mt-3 block text-xs font-bold">
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={120}
              className="mt-1 block min-h-10 w-full rounded-lg border border-border-soft bg-canvas px-2 text-sm"
            />
          </label>
          <label className="mt-3 block text-xs font-bold">
            Your review
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
              maxLength={2000}
              rows={4}
              className="mt-1 block w-full rounded-lg border border-border-soft bg-canvas px-2 py-1 text-sm"
            />
          </label>
          {state === "error" ? <p role="alert" className="mt-2 text-xs font-semibold text-crimson">{message}</p> : null}
          <button
            type="submit"
            disabled={state === "sending"}
            className="mt-3 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Submit review
          </button>
        </form>
      )}
    </div>
  );
}
