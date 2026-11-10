"use client";

import Link from "next/link";
import { ArrowRight, Car, BedDouble, UtensilsCrossed, Check } from "lucide-react";

/**
 * The pieces of the mobile Aura screen that the approved mockup defines, built as
 * real components over real data.
 *
 * The mockup shows a seated conversation ("Let's make a day of it.") with two
 * large image cards, a ride strip and a Saturday-plan card. Those are reproduced
 * here: the same proportions, the same mint "Review options" action, the same
 * "Nothing is booked until you confirm." disclaimer. The content inside them is
 * whatever the signed-in user's conversation actually produced.
 */

export type PlanStep = { key: string; label: string; href?: string | null; done?: boolean; detail?: string | null };

/** One large result card, as in the mockup's 2-up image row. */
export function AuraHeroCard({
  vertical,
  title,
  image,
  href,
  footer,
  onClick
}: {
  vertical: "stay" | "meal" | "ride";
  title: string;
  image: string;
  href?: string | null;
  /** The service label row under the image (mockup shows NaijaStay / NaijaEats / NaijaDrive). */
  footer?: string;
  onClick?: () => void;
}) {
  const Icon = vertical === "stay" ? BedDouble : vertical === "meal" ? UtensilsCrossed : Car;
  const label = vertical === "stay" ? "NaijaStay" : vertical === "meal" ? "NaijaEats" : "NaijaDrive";
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
      <span className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent" aria-hidden="true" />
      <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/40 to-transparent" aria-hidden="true" />
      <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-aura-canvas/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
      </span>
      <span className="absolute inset-x-2.5 bottom-2.5 flex items-end justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold leading-tight text-white">{title}</span>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[10.5px] font-semibold text-white/90">
            <Icon className="h-3 w-3" aria-hidden="true" /> {footer ?? label}
          </span>
        </span>
        <span className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/45 bg-black/30">
          <ArrowRight className="h-3.5 w-3.5 text-white" aria-hidden="true" />
        </span>
      </span>
    </>
  );

  const className = "group relative block aspect-[4/3] overflow-hidden rounded-2xl border border-aura-gold/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aura-mint";

  return href ? (
    <Link href={href} className={className} onClick={onClick}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={`${className} w-full text-left`}>
      {inner}
    </button>
  );
}

/**
 * A slot with no catalogue result.
 *
 * The mockup's row always has three cards. When a service genuinely has nothing
 * for this request, the slot keeps its place and size but says so plainly, with
 * a link to browse the service. No business, price or photo is invented.
 */
export function AuraEmptyCard({ vertical, label }: { vertical: "stay" | "meal" | "ride"; label: string }) {
  const Icon = vertical === "stay" ? BedDouble : vertical === "meal" ? UtensilsCrossed : Car;
  const service = vertical === "stay" ? "NaijaStay" : vertical === "meal" ? "NaijaEats" : "NaijaDrive";
  const href = vertical === "stay" ? "/naijastay" : vertical === "meal" ? "/naijaeats" : "/naijadrive";
  return (
    <Link
      href={href}
      className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-aura-border bg-aura-surface/40 p-4 text-center transition hover:border-aura-mint/40"
    >
      <Icon className="h-6 w-6 text-white/45" aria-hidden="true" />
      <span className="text-[13px] font-semibold text-white/80">{label}</span>
      <span className="inline-flex items-center gap-1 rounded-full border border-white/20 px-2.5 py-0.5 text-[10.5px] font-semibold text-white/60">
        Open {service}
      </span>
    </Link>
  );
}

/** The full-width ride strip under the image row. */
export function AuraRideStrip({ href, onClick }: { href?: string | null; onClick?: () => void }) {
  const content = (
    <>
      <Car className="h-5 w-5 shrink-0 text-aura-mint" aria-hidden="true" />
      <span className="flex-1 text-left text-[15px] font-semibold text-white">Add a ride with NaijaDrive</span>
      <ArrowRight className="h-4.5 w-4.5 shrink-0 text-white/85" aria-hidden="true" />
    </>
  );
  const className =
    "flex w-full items-center gap-3 rounded-xl border border-aura-border bg-aura-surface/70 px-4 py-3.5 transition hover:border-aura-mint/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aura-mint";
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

/**
 * "Your Saturday plan" — the Stay -> Meal -> Ride progress row with the mint
 * review button. Steps come from the real draft plan; nothing is ever marked
 * booked here, because a plan is a draft by definition.
 */
export function AuraPlanCard({
  title,
  steps,
  onReview,
  reviewHref
}: {
  title: string;
  steps: PlanStep[];
  onReview?: () => void;
  reviewHref?: string;
}) {
  const shown = steps.slice(0, 3);
  return (
    <section className="rounded-2xl border border-aura-border bg-aura-surface/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[17px] font-extrabold leading-tight text-white">{title}</h2>
        <span className="shrink-0 rounded-full border border-aura-gold/60 px-2.5 py-0.5 text-[11px] font-bold text-aura-gold">Draft</span>
      </div>

      <ol className="mt-4 flex items-center justify-between gap-1" aria-label="Plan steps">
        {shown.map((step, index) => (
          <li key={step.key} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${step.done ? "border-aura-mint bg-aura-mint" : "border-aura-gold/70"}`}
                aria-hidden="true"
              >
                {step.done && <Check className="h-3 w-3 text-aura-canvas" />}
              </span>
              <span className="whitespace-nowrap text-[13px] text-white/90">{step.label}</span>
            </span>
            {index < shown.length - 1 && <span className="mx-1 h-px flex-1 bg-aura-border" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      {reviewHref ? (
        <Link
          href={reviewHref}
          className="mt-4 block rounded-xl bg-aura-mint py-3 text-center text-[15px] font-extrabold text-aura-canvas transition hover:brightness-105"
        >
          Review options
        </Link>
      ) : (
        <button
          type="button"
          onClick={onReview}
          className="mt-4 w-full rounded-xl bg-aura-mint py-3 text-[15px] font-extrabold text-aura-canvas transition hover:brightness-105"
        >
          Review options
        </button>
      )}

      <p className="mt-3 text-center text-[13px] text-white/70">Nothing is booked until you confirm.</p>
    </section>
  );
}
