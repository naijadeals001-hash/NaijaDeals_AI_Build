"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Heart,
  Info,
  Loader2,
  MapPin,
  PackageCheck,
  ShieldCheck,
  ShoppingCart,
  Truck
} from "lucide-react";
import type { ShopProduct } from "./types";
import {
  countryName,
  isContactListing,
  isDemoListing,
  isSampleListing,
  moneyText,
  productCurrency
} from "./types";

export type CartNotice = { quantity: number; cartCount: number } | null;

export function ProductPurchasePanel({
  product,
  unitPrice,
  available,
  quantity,
  onQuantityChange,
  selectedVariantName,
  adding,
  savingSaved,
  saved,
  error,
  cartNotice,
  reviewEnvironment,
  onAddToCart,
  onToggleSaved
}: {
  product: ShopProduct;
  unitPrice: string | number;
  available: number;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  selectedVariantName: string | null;
  adding: boolean;
  savingSaved: boolean;
  saved: boolean;
  error: string;
  cartNotice: CartNotice;
  reviewEnvironment: boolean;
  onAddToCart: (thenCheckout: boolean) => void;
  onToggleSaved: () => void;
}) {
  const demo = isDemoListing(product);
  const sample = isSampleListing(product);
  const contact = isContactListing(product);
  const subtotal = Number(unitPrice) * quantity;
  const maxQuantity = Math.min(Math.max(available, 0), 10);

  return (
    <div className="space-y-3">
      <section
        data-testid="purchase-panel"
        aria-labelledby="purchase-heading"
        className="rounded-2xl border border-border-soft bg-canvas p-4 shadow-sm sm:p-5"
      >
        <h2 id="purchase-heading" className="font-display text-lg font-extrabold text-ink">
          {contact ? "Contact this seller" : "Add to basket"}
        </h2>

        {sample ? (
          <p className="mt-3 rounded-xl border border-[#B45309]/40 bg-amber-soft/70 p-3 text-sm font-bold text-[#663c00]">
            Sample listing — development demonstration data. It cannot be purchased or checked out.
          </p>
        ) : contact ? (
          <ContactSeller product={product} />
        ) : (
          <>
            {selectedVariantName ? (
              <p className="mt-1 text-sm text-muted">
                Option: <span className="font-bold text-ink">{selectedVariantName}</span>
              </p>
            ) : null}

            {available > 0 ? (
              <label className="mt-3 block">
                <span className="text-sm font-black text-ink">Quantity</span>
                <select
                  data-testid="product-quantity"
                  value={Math.min(quantity, Math.max(maxQuantity, 1))}
                  onChange={(event) => onQuantityChange(Number(event.target.value))}
                  className="mt-1 min-h-11 w-full rounded-lg border border-border-soft bg-surface-low px-3 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {Array.from({ length: Math.max(maxQuantity, 1) }).map((_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
                {available > 10 ? <span className="mt-1 block text-[11px] text-muted">Maximum 10 per order.</span> : null}
              </label>
            ) : (
              <p className="mt-3 rounded-xl bg-surface-low p-3 text-sm font-semibold text-muted">
                This listing is out of stock, so it cannot be added to the basket.
              </p>
            )}

            <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border-soft pt-3 text-sm">
              <span className="font-semibold text-muted">
                Subtotal {available > 0 ? `(${quantity})` : ""}
                {demo ? " — illustrative" : ""}
              </span>
              <span data-testid="product-subtotal" className="font-display text-xl font-extrabold text-ink">
                {moneyText(product, subtotal)}
              </span>
            </div>
            <p className="mt-0.5 text-right text-[10px] font-bold uppercase tracking-wide text-muted">
              {productCurrency(product)} · delivery calculated at checkout
            </p>

            {reviewEnvironment ? (
              <div
                data-testid="review-checkout-notice"
                role="note"
                className="mt-3 flex items-start gap-2 rounded-xl border border-[#B45309]/35 bg-amber-soft/60 p-3 text-xs leading-5 text-[#663c00]"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  <strong>REVIEW catalogue.</strong> Checkout cannot be completed: payment and financial operations are
                  disabled in this environment. You can add items to the basket for catalogue review; no order will be
                  paid or fulfilled.
                </span>
              </div>
            ) : null}

            {error ? (
              <p role="alert" data-testid="purchase-error" className="mt-3 rounded-xl bg-crimson-soft p-3 text-sm font-bold text-[#991B1B]">
                <AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden />
                {error}
              </p>
            ) : null}

            {cartNotice ? (
              <p role="status" data-testid="cart-added-notice" className="mt-3 rounded-xl bg-primary-soft p-3 text-sm font-bold text-primary">
                <CheckCircle2 className="mr-1 inline h-4 w-4" aria-hidden />
                Added {cartNotice.quantity} to your basket.{" "}
                <Link href="/cart" className="underline underline-offset-2">
                  View basket{cartNotice.cartCount > 0 ? ` (${cartNotice.cartCount})` : ""}
                </Link>
              </p>
            ) : null}

            <div className="mt-3 grid gap-2">
              <button
                type="button"
                data-testid="add-to-cart"
                onClick={() => onAddToCart(false)}
                disabled={adding || available === 0}
                aria-busy={adding}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white transition hover:bg-[#005a2f] disabled:cursor-not-allowed disabled:bg-surface-mid disabled:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShoppingCart className="h-4 w-4" aria-hidden />}
                {adding ? "Adding…" : "Add to cart"}
              </button>
              {!reviewEnvironment ? (
                <button
                  type="button"
                  onClick={() => onAddToCart(true)}
                  disabled={adding || available === 0}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-night px-5 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-surface-mid disabled:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Buy now
                </button>
              ) : null}
              <button
                type="button"
                onClick={onToggleSaved}
                disabled={savingSaved}
                aria-pressed={saved}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-soft px-5 text-sm font-bold text-ink transition hover:bg-surface-low disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {savingSaved ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Heart className={`h-4 w-4 ${saved ? "fill-crimson text-crimson" : ""}`} aria-hidden />
                )}
                {saved ? "Saved for later" : "Save for later"}
              </button>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="delivery-heading" className="rounded-2xl border border-border-soft bg-canvas p-4 shadow-sm sm:p-5">
        <h2 id="delivery-heading" className="font-display text-lg font-extrabold text-ink">
          Delivery &amp; returns
        </h2>
        <DeliveryFacts product={product} reviewEnvironment={reviewEnvironment} />
      </section>
    </div>
  );
}

function ContactSeller({ product }: { product: ShopProduct }) {
  const phone = product.vendor.pickupPhone?.trim();
  return (
    <div className="mt-3">
      <p className="text-sm leading-6 text-muted">
        This listing is fulfilled directly by <span className="font-bold text-ink">{product.vendor.name}</span> in{" "}
        {product.vendor.market}. Payment, inspection and delivery are arranged with the seller — NaijaDeals escrow does
        not cover it.
      </p>
      {phone ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`tel:${phone}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-night px-4 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Call {phone}
          </a>
          <a
            href={`https://wa.me/${phone.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-night px-4 text-sm font-bold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            WhatsApp seller
          </a>
        </div>
      ) : (
        <p className="mt-3 text-xs font-bold text-muted">Contact details appear once the seller adds a phone number.</p>
      )}
    </div>
  );
}

function DeliveryFacts({ product, reviewEnvironment }: { product: ShopProduct; reviewEnvironment: boolean }) {
  const demo = isDemoListing(product);
  const contact = isContactListing(product);
  const destination = `${product.vendor.market}, ${countryName(product.countryCode)}`;

  if (contact) {
    return (
      <div className="mt-3 space-y-2 text-sm">
        <p className="flex items-start gap-2 font-bold text-ink">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /> Seller location: {destination}
        </p>
        <p className="text-muted">Inspection, payment and delivery or collection are arranged directly with the seller.</p>
        <p className="text-muted">Marketplace delivery and escrow are not applicable to this contact listing.</p>
      </div>
    );
  }

  if (reviewEnvironment) {
    return (
      <div className="mt-3 space-y-2 text-sm">
        <p className="flex items-start gap-2 font-bold text-ink">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /> Seller location: {destination}
        </p>
        <p className="text-muted">
          This is the seller&apos;s registered market, not a verified dispatch address. No confirmed dispatch address
          is stored for this listing.
        </p>
        <p className="text-muted">
          Delivery and returns cannot be arranged because payment is disabled in this REVIEW catalogue environment.
        </p>
        <p className="text-muted">
          Checkout uses the delivery address you enter; the city selected in the header is not used as your delivery
          address.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2.5 text-sm">
      <p className="flex items-start gap-2 font-bold text-ink">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        Seller location: {destination}
      </p>
      <p className="text-muted">
        This is the seller&apos;s registered market, not a verified dispatch address. No confirmed dispatch address is
        stored for this listing.
      </p>
      <p className="flex items-start gap-2 text-muted">
        <Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        Delivery is calculated at checkout from the address you enter. The city selected in the header is not your
        delivery address.
      </p>
      <p className="flex items-start gap-2 text-muted">
        <PackageCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        Your order page shows the delivery address and any courier tracking updates recorded for the order.
      </p>
      <p className="flex items-start gap-2 text-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        Escrow payment is released after you confirm delivery. Returns are raised from your order page and reviewed by
        the seller and NaijaDeals support.
      </p>
      <Link href="/naijashop/help" className="inline-flex min-h-9 items-center text-xs font-bold text-primary underline underline-offset-2">
        Delivery and returns help
      </Link>
      {demo ? (
        <p className="rounded-xl bg-surface-low p-2.5 text-xs leading-5 text-muted">
          Demonstration listing: the delivery and returns flow is shown for catalogue review. No real goods are
          dispatched.
        </p>
      ) : null}
    </div>
  );
}
