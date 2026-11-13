"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { ReviewForm } from "@/components/functional/review-form";
import type { ShopProduct } from "./types";
import { reviewSummary } from "./types";

/**
 * Approved reviews only. The detail service filters reviews to APPROVED and
 * computes the rating from that same set, so the summary and the list cannot
 * disagree. No count, rating or "verified purchase" claim is invented.
 */
export function ProductReviews({ product, signedIn }: { product: ShopProduct; signedIn: boolean }) {
  const reviews = product.reviews ?? [];
  const summary = reviewSummary(product);
  return (
    <section
      id="reviews"
      data-testid="product-reviews"
      aria-labelledby="reviews-heading"
      className="scroll-mt-28 rounded-2xl border border-border-soft bg-canvas p-4 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="reviews-heading" className="font-display text-xl font-extrabold text-ink">
            Customer reviews
          </h2>
          {summary.count > 0 && summary.average !== null ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Star className="h-4 w-4 fill-amber text-amber" aria-hidden />
              {summary.average} out of 5
              <span className="font-normal text-muted">· {summary.count} approved review{summary.count === 1 ? "" : "s"}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">No approved customer reviews yet.</p>
          )}
        </div>
      </div>

      {reviews.length === 0 ? (
        <p className="mt-3 rounded-xl bg-surface-low p-3 text-sm leading-6 text-muted">
          Reviews appear here after a delivered order and moderator approval. Nothing has been published for this
          listing yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {reviews.map((review) => (
            <li key={review.id}>
              <article className="rounded-xl bg-surface-low p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-sm font-black text-ink">
                    <Star className="h-4 w-4 fill-amber text-amber" aria-hidden />
                    {review.rating} out of 5
                  </span>
                  <h3 className="font-bold text-ink">{review.title}</h3>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm leading-6 text-muted">{review.body}</p>
                <p className="mt-1 text-xs text-muted">By {review.user.name}</p>
              </article>
            </li>
          ))}
        </ul>
      )}

      {signedIn ? (
        <ReviewForm productId={product.id} productName={product.name} />
      ) : (
        <p className="mt-4 rounded-xl bg-surface-low p-3 text-xs leading-5 text-muted">
          Reviews can be written after a delivered order of this product.{" "}
          <Link href={`/login?next=${encodeURIComponent(`/product/${product.slug}`)}`} className="font-bold text-primary underline">
            Sign in
          </Link>{" "}
          to see your eligible orders.
        </p>
      )}
    </section>
  );
}
