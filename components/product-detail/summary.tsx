"use client";

import Link from "next/link";
import { BadgeCheck, MapPin, ShieldCheck, Star, Store } from "lucide-react";
import type { ApiVariant } from "@/lib/api-client";
import type { DisplayAttribute, ShopProduct } from "./types";
import {
  countryName,
  isContactListing,
  isDemoListing,
  isSampleListing,
  moneyText,
  productCurrency,
  reviewSummary,
  sellerListingsHref
} from "./types";

export function ProductTitleBlock({ product }: { product: ShopProduct }) {
  const demo = isDemoListing(product);
  const sample = isSampleListing(product);
  const summary = reviewSummary(product);
  return (
    <header className="min-w-0">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted">{product.category.name}</p>
      <h1
        data-testid="product-title"
        className="mt-1.5 font-display text-[25px] font-extrabold leading-[1.18] tracking-[-0.01em] text-ink sm:text-[28px] lg:text-[30px]"
      >
        {product.name}
      </h1>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {demo ? (
          <span
            data-testid="demo-badge"
            className="inline-flex rounded-full bg-[#F2D48C] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#07351f]"
          >
            DEMO
          </span>
        ) : null}
        {sample ? (
          <span className="inline-flex rounded-full bg-night px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-white">
            SAMPLE
          </span>
        ) : null}
        {summary.count > 0 && summary.average !== null ? (
          <a
            href="#reviews"
            className="inline-flex items-center gap-1 font-bold text-ink underline decoration-border-soft decoration-1 underline-offset-4 hover:decoration-primary"
            aria-label={`Rated ${summary.average} out of 5 from ${summary.count} approved reviews. Read the reviews.`}
          >
            <Star className="h-4 w-4 fill-amber text-amber" aria-hidden />
            {summary.average} out of 5
            <span className="font-semibold text-muted">· {summary.count} review{summary.count === 1 ? "" : "s"}</span>
          </a>
        ) : (
          <a href="#reviews" className="font-semibold text-muted underline decoration-border-soft underline-offset-4 hover:text-ink">
            No customer reviews yet
          </a>
        )}
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
        <Store className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        Sold by{" "}
        <Link
          href={sellerListingsHref(product)}
          className="inline-flex items-center gap-1 font-bold text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
        >
          {product.vendor.name}
          {product.vendor.status === "VERIFIED" ? <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> : null}
        </Link>
        <span className="font-semibold">
          · {demo ? "demonstration seller" : product.vendor.status === "VERIFIED" ? "verified seller" : "seller"}
        </span>
      </p>
    </header>
  );
}

export function ProductPriceBlock({
  product,
  unitPrice,
  available,
  variants,
  variantId,
  onVariantChange
}: {
  product: ShopProduct;
  unitPrice: string | number;
  available: number;
  variants: ApiVariant[];
  variantId: string | null;
  onVariantChange: (id: string | null) => void;
}) {
  const demo = isDemoListing(product);
  const contact = isContactListing(product);
  const currency = productCurrency(product);
  const compareAt = product.compareAtKobo;
  const showCompareAt = compareAt !== null && compareAt !== undefined && Number(compareAt) > Number(unitPrice);

  return (
    <section aria-labelledby="price-heading" className="min-w-0">
      <div className="rounded-2xl border border-border-soft bg-canvas p-4 shadow-sm sm:p-5">
        <h2 id="price-heading" className="sr-only">
          Price and options
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p data-testid="product-price" className="font-display text-[30px] font-extrabold leading-none text-primary sm:text-[32px]">
            {moneyText(product, unitPrice)}
          </p>
          <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">({currency})</span>
        </div>
        <p className="mt-1 text-xs font-semibold text-muted">
          {demo
            ? "Illustrative price — this demonstration listing is not a live offer."
            : contact
              ? "Listed price. Payment, inspection and delivery are agreed with the seller."
              : "Price shown in the seller's listing currency."}
        </p>
        {showCompareAt && compareAt !== null && compareAt !== undefined ? (
          <p className="mt-1 text-sm text-muted">
            List price <span className="line-through">{moneyText(product, compareAt)}</span>
          </p>
        ) : null}

        <p
          data-testid="product-availability"
          className={`mt-3 text-sm font-bold ${available > 0 || contact ? "text-primary" : "text-crimson"}`}
        >
          {contact
            ? "Contact the seller for availability"
            : available > 0
              ? demo
                ? `${available} unit${available === 1 ? "" : "s"} shown for demonstration`
                : `${available} available`
              : "Out of stock"}
        </p>

        {variants.length > 0 ? (
          <label className="mt-4 block">
            <span className="text-sm font-black text-ink">Choose an option</span>
            <select
              data-testid="product-variant"
              value={variantId ?? ""}
              onChange={(event) => onVariantChange(event.target.value || null)}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-describedby="product-availability"
            >
              {variants.map((variant) => {
                const variantAvailable = Math.max(variant.stock - variant.reserved, 0);
                return (
                  <option key={variant.id} value={variant.id} disabled={variantAvailable === 0}>
                    {variant.name} — {moneyText(product, variant.priceKobo)} (
                    {variantAvailable === 0 ? "out of stock" : `${variantAvailable} left`})
                  </option>
                );
              })}
            </select>
          </label>
        ) : null}
      </div>
    </section>
  );
}

export function ProductDetailSections({
  product,
  attributes
}: {
  product: ShopProduct;
  attributes: DisplayAttribute[];
}) {
  const description = (product.description ?? "").trim();
  const facts = [
    ...attributes.map((attribute) => ({ label: attribute.label, value: attribute.value })),
    ...(product.brand?.trim() ? [{ label: "Brand", value: product.brand.trim() }] : []),
    ...(product.condition && product.condition !== "NEW"
      ? [{ label: "Condition", value: product.condition.replaceAll("_", " ").toLowerCase().replace(/^[a-z]/, (letter) => letter.toUpperCase()) }]
      : [])
  ];

  return (
    <div className="min-w-0 space-y-4">
      <section aria-labelledby="about-heading" className="rounded-2xl border border-border-soft bg-canvas p-4 shadow-sm sm:p-5">
        <h2 id="about-heading" className="font-display text-lg font-extrabold text-ink">
          About this item
        </h2>
        {description ? (
          <p data-testid="product-description" className="mt-2 whitespace-pre-line text-sm leading-6 text-muted">
            {description}
          </p>
        ) : (
          <p
            data-testid="product-description-missing"
            className="mt-2 rounded-xl bg-surface-low p-3 text-sm font-semibold text-muted"
          >
            The seller has not provided a description for this listing.
          </p>
        )}
      </section>

      <section id="details" aria-labelledby="details-heading" className="scroll-mt-28 rounded-2xl border border-border-soft bg-canvas p-4 shadow-sm sm:p-5">
        <h2 id="details-heading" className="font-display text-lg font-extrabold text-ink">
          Details &amp; specifications
        </h2>
        {facts.length > 0 ? (
          <dl data-testid="product-attributes" className="mt-3 text-sm">
            {facts.map((fact, index) => (
              <div
                key={`${fact.label}-${index}`}
                className="flex min-w-0 items-baseline justify-between gap-4 border-b border-border-soft/70 py-2 last:border-0"
              >
                <dt className="min-w-0 text-muted">{fact.label}</dt>
                <dd className="min-w-0 break-words text-right font-semibold text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p data-testid="product-attributes-empty" className="mt-2 text-sm text-muted">
            The seller has not added category specifications to this listing.
          </p>
        )}
      </section>
    </div>
  );
}

export function ProductSellerSection({ product }: { product: ShopProduct }) {
  const demo = isDemoListing(product);
  const contact = isContactListing(product);
  return (
    <section aria-labelledby="seller-heading" className="rounded-2xl border border-border-soft bg-canvas p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <Store className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="seller-heading" className="font-display text-lg font-extrabold text-ink">
            Seller information
          </h2>
          <p className="mt-1 text-sm font-bold text-ink">
            <Link href={sellerListingsHref(product)} className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary">
              {product.vendor.name}
            </Link>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <MapPin className="h-4 w-4" aria-hidden />
            {demo ? "Recorded market: " : "Seller market: "}
            <span className="font-semibold text-ink">{product.vendor.market}</span>
            <span aria-hidden>·</span>
            <span>{countryName(product.countryCode)}</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            {demo
              ? "Demonstration seller used for catalogue review. Not a real business."
              : product.vendor.status === "VERIFIED"
                ? "Identity and business details verified by NaijaDeals."
                : "Seller verification is not complete."}
          </p>
          {contact ? (
            <p className="mt-2 rounded-xl bg-surface-low p-3 text-xs leading-5 text-muted">
              This is a contact listing. Payment, inspection and delivery are arranged with the seller. NaijaDeals escrow
              does not cover it.
            </p>
          ) : (
            <p className="mt-2 flex items-start gap-2 rounded-xl bg-surface-low p-3 text-xs leading-5 text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              {demo
                ? "Escrow and delivery shown on demonstration listings are illustrative; no real goods are dispatched."
                : "NaijaDeals holds escrow payment until you confirm delivery."}
            </p>
          )}
          <Link
            href={sellerListingsHref(product)}
            className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-border-soft px-3 text-xs font-bold text-primary hover:bg-surface-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            See listings from this seller
          </Link>
        </div>
      </div>
    </section>
  );
}
