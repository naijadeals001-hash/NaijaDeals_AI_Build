import { Sparkles } from "lucide-react";
import type { PlusPublicBenefit } from "@/lib/data/plus";

/**
 * A genuine benefit attached to an available plan. Standard NaijaDeals services
 * never appear here; the page only receives rows the Control Center published.
 */
export function PlusBenefitCard({ benefit }: { benefit: PlusPublicBenefit }) {
  return (
    <article
      data-plus-benefit-card={benefit.key}
      className="flex h-full flex-col rounded-2xl border border-[#dbe6d8] bg-white p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#07351f] text-[#F2D48C]">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="rounded-full bg-[#e7f8ed] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#0b5c33]">
          Plus+ benefit
        </span>
      </div>
      <h3 className="mt-3 font-display text-[18px] font-extrabold leading-tight">{benefit.title}</h3>
      <p className="mt-1.5 text-[12.5px] leading-6 text-[#4b5b51]">{benefit.description}</p>
      <div className="mt-auto pt-4">
        <p className="text-[11px] font-bold text-[#0b5c33]">
          {benefit.planName} · {benefit.priceLabel}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-[#4b5b51]">
          Available in {benefit.eligibleCountries.map((country) => country.name).join(", ")}
        </p>
      </div>
    </article>
  );
}
