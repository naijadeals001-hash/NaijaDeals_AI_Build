import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { PlusAwarenessCard as PlusAwarenessCardData } from "@/lib/data/plus";
import { PlusMedia } from "./plus-media";

/** One published awareness card. All copy and destinations come from the DB. */
export function PlusAwarenessCard({ card }: { card: PlusAwarenessCardData }) {
  const internal = card.href.startsWith("/") && !card.href.startsWith("//");
  const cta = (
    <>
      {internal ? "Explore" : "Visit"}
      {internal ? (
        <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
      ) : (
        <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
      )}
    </>
  );
  const ctaClass =
    "inline-flex min-h-9 items-center gap-1.5 rounded-full text-[12px] font-extrabold text-[#0b5c33] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2";

  return (
    <article
      data-plus-awareness-card={card.key}
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#dbe6d8] bg-white"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#e7f3e9]">
        <PlusMedia src={card.imageUrl} alt={card.imageAlt} sizes="(min-width: 1024px) 32vw, (min-width: 640px) 48vw, 86vw" />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-[18px] font-extrabold leading-tight tracking-[-0.015em]">{card.title}</h3>
        <p className="mt-2 text-[12.5px] leading-6 text-[#4b5b51]">{card.description}</p>
        <div className="mt-auto pt-4">
          {internal ? (
            <Link href={card.href} className={ctaClass} data-plus-awareness-cta={card.key}>
              {cta}
            </Link>
          ) : (
            <a href={card.href} className={ctaClass} rel="noopener noreferrer" data-plus-awareness-cta={card.key}>
              {cta}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
