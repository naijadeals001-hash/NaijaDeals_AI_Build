import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { PlusPublicPromotion } from "@/lib/data/plus";
import { PlusMedia } from "./plus-media";

/**
 * A house or sponsored promotion. Sponsored content always renders its
 * disclosure label and sponsor name; no advertiser is invented.
 */
export function PlusPromotionCard({ promotion }: { promotion: PlusPublicPromotion }) {
  const sponsored = promotion.kind === "SPONSORED";
  const internal = promotion.href?.startsWith("/") && !promotion.href.startsWith("//");
  const ctaClass =
    "inline-flex min-h-9 items-center gap-1.5 rounded-full text-[12px] font-extrabold text-[#0b5c33] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2";

  return (
    <article
      data-plus-promotion-card={promotion.key}
      data-plus-promotion-kind={promotion.kind}
      className={`flex h-full flex-col overflow-hidden rounded-2xl border bg-white ${
        sponsored ? "border-[#e5d3a2]" : "border-[#dbe6d8]"
      }`}
    >
      {promotion.imageUrl && promotion.imageAlt ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#e7f3e9]">
          <PlusMedia
            src={promotion.imageUrl}
            alt={promotion.imageAlt}
            sizes="(min-width: 1024px) 32vw, (min-width: 640px) 48vw, 86vw"
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] ${
              sponsored ? "bg-[#fff4d6] text-[#6b4c05] ring-1 ring-[#e5d3a2]" : "bg-[#e7f3e9] text-[#0b5c33]"
            }`}
            data-plus-disclosure={sponsored ? promotion.disclosureLabel : "NaijaDeals"}
          >
            {sponsored ? promotion.disclosureLabel : "NaijaDeals"}
          </span>
          {sponsored && promotion.sponsorName ? (
            <span className="text-[10.5px] font-bold text-[#4b5b51]">{promotion.sponsorName}</span>
          ) : null}
        </div>
        <h3 className="mt-3 font-display text-[18px] font-extrabold leading-tight">{promotion.title}</h3>
        <p className="mt-2 text-[12.5px] leading-6 text-[#4b5b51]">{promotion.body}</p>
        {promotion.href ? (
          <div className="mt-auto pt-4">
            {internal ? (
              <Link href={promotion.href} className={ctaClass} data-plus-promotion-cta={promotion.key}>
                Learn more
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
              </Link>
            ) : (
              <a
                href={promotion.href}
                className={ctaClass}
                rel="noopener noreferrer"
                data-plus-promotion-cta={promotion.key}
              >
                Learn more
                <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
              </a>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
