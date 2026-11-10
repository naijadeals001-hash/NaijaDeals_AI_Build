"use client";

import Link from "next/link";
import { ArrowRight, BedDouble, Bike, Car, ShoppingBag, Sparkles, Store, UtensilsCrossed, Wallet, Package, Briefcase } from "lucide-react";
import type { AuraCard, PendingAction } from "@/lib/aura/client";
import { naira } from "@/lib/aura/client";

/** Aura's mark: the emerald-and-gold ribbon orb from the approved mockup. */
export function AuraOrb({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/generated/aura/aura-orb.webp"
      alt=""
      width={size}
      height={size}
      className={`rounded-full object-cover ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

const VERTICAL_ICON: Record<string, { label: string; icon: typeof BedDouble }> = {
  stay: { label: "NaijaStay", icon: BedDouble },
  meal: { label: "NaijaEats", icon: UtensilsCrossed },
  product: { label: "NaijaShop", icon: ShoppingBag },
  professional: { label: "NaijaGigs", icon: Briefcase },
  ride: { label: "NaijaDrive", icon: Car },
  listening: { label: "NaijaStream", icon: Sparkles },
  wallet: { label: "NaijaPay", icon: Wallet },
  transaction: { label: "NaijaPay", icon: Wallet },
  status: { label: "Your orders", icon: Package },
  plan: { label: "Your plan", icon: Bike }
};

const FALLBACK_IMAGE: Partial<Record<AuraCard["kind"], string>> = {
  stay: "/generated/aura/aura-abuja-stay.webp",
  meal: "/generated/aura/aura-abuja-meal.webp",
  ride: "/generated/aura/aura-abuja-ride.webp",
  professional: "/generated/aura/aura-professional.webp",
  product: "/generated/aura/aura-shopping.webp"
};

/**
 * A recommendation card.
 *
 * Images come from the record when it has one. When it does not, a labelled
 * illustrative image is used for the *vertical*, and the card never claims the
 * picture is the specific listing — that would misrepresent a real record.
 */
export function AuraCardTile({ card }: { card: AuraCard }) {
  const meta = VERTICAL_ICON[card.kind] ?? { label: "NaijaDeals", icon: Store };
  const Icon = meta.icon;
  const image = card.image ?? FALLBACK_IMAGE[card.kind] ?? null;
  const body = (
    <>
      {image ? (
        <div className="relative h-32 w-full overflow-hidden rounded-t-2xl bg-aura-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-aura-canvas/85 px-2 py-1 text-[10px] font-semibold text-aura-text backdrop-blur">
            <Icon className="h-3 w-3" aria-hidden="true" /> {meta.label}
          </span>
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-2 text-sm font-bold leading-snug text-aura-text">{card.title}</p>
        {card.subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-aura-muted">{card.subtitle}</p>}
        {card.detail && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-aura-muted/80">{card.detail}</p>}
        <div className="mt-auto flex items-center justify-between pt-2">
          {typeof card.priceNaira === "number" ? (
            <span className="text-sm font-extrabold text-aura-mint">{naira(card.priceNaira)}</span>
          ) : (
            <span className="text-[11px] text-aura-muted">See details</span>
          )}
          {card.href && <ArrowRight className="h-4 w-4 text-aura-muted" aria-hidden="true" />}
        </div>
      </div>
    </>
  );

  const className =
    "group flex w-full flex-col overflow-hidden rounded-2xl border border-aura-border bg-aura-surface text-left transition hover:border-aura-mint/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aura-mint";

  return card.href ? (
    <Link href={card.href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function AuraCardRow({ cards }: { cards: AuraCard[] }) {
  if (cards.length === 0) return null;
  return (
    <ul className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
      {cards.map((card, index) => (
        <li key={`${card.kind}-${card.title}-${index}`} className="w-[210px] shrink-0 snap-start sm:w-auto">
          <AuraCardTile card={card} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The confirmation card for a prepared action.
 *
 * It shows exactly what was proposed and posts the reviewed details back. The
 * confirm button is the only route to execution; a chat message saying "yes"
 * does nothing.
 */
export function AuraActionCard({
  action,
  onConfirm,
  state
}: {
  action: PendingAction;
  onConfirm: (action: PendingAction) => void;
  state: "idle" | "confirming" | "done" | "failed";
}) {
  const review = action.review as { recipient?: { name?: string; email?: string }; amountNaira?: number; sufficientFunds?: boolean };
  const expired = Date.parse(action.expiresAt) < Date.now();
  return (
    <div className="mt-3 rounded-2xl border border-aura-mint/30 bg-aura-highlight/60 p-4">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-aura-mint">
        <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> Review before sending
      </p>
      <dl className="mt-2 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-aura-muted">To</dt>
          <dd className="text-right font-semibold text-aura-text">
            {review.recipient?.name}
            <span className="block text-xs font-normal text-aura-muted">{review.recipient?.email}</span>
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-aura-muted">Amount</dt>
          <dd className="font-extrabold text-aura-text">{naira(review.amountNaira)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-aura-muted">Fee</dt>
          <dd className="font-semibold text-aura-mint">₦0</dd>
        </div>
      </dl>
      {review.sufficientFunds === false && (
        <p className="mt-2 rounded-lg bg-aura-danger/10 px-3 py-2 text-xs text-aura-danger">
          Your balance looked too low when this was prepared. Confirming will check again and may be refused.
        </p>
      )}
      <p className="mt-2 text-[11px] text-aura-muted">
        Nothing has been sent. This cannot be undone once confirmed; transfers are final.
      </p>
      {state === "done" ? (
        <p className="mt-3 rounded-lg bg-aura-mint/15 px-3 py-2 text-sm font-semibold text-aura-mint">Sent — the server confirmed it.</p>
      ) : (
        <button
          type="button"
          disabled={state === "confirming" || expired}
          onClick={() => onConfirm(action)}
          className="mt-3 w-full rounded-full bg-aura-mint px-5 py-2.5 text-sm font-bold text-aura-canvas transition hover:brightness-105 disabled:opacity-60"
        >
          {expired ? "This proposal expired" : state === "confirming" ? "Sending…" : `Confirm and send ${naira(review.amountNaira)}`}
        </button>
      )}
      {state === "failed" && <p className="mt-2 text-xs text-aura-danger">That could not be sent. Nothing was taken; ask Aura to prepare it again.</p>}
    </div>
  );
}
