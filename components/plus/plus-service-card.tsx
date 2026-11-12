import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { PlusServiceCardData } from "@/lib/data/plus";

const STATUS_CHIP: Record<PlusServiceCardData["status"], string> = {
  live: "bg-white/95 text-[#0b5c33] ring-[#0b5c33]/15",
  preview: "bg-[#fff8e6] text-[#7a5300] ring-[#7a5300]/20",
  setup: "bg-[#fff4e5] text-[#8a4b00] ring-[#8a4b00]/20",
  coming: "bg-[#f2f4f2] text-[#4b5b51] ring-[#4b5b51]/20"
};

const STATUS_DOT: Record<PlusServiceCardData["status"], string> = {
  live: "bg-[#0b8f4d]",
  preview: "bg-[#b77900]",
  setup: "bg-[#b26a00]",
  coming: "bg-[#7d8a81]"
};

/**
 * One real ecosystem service in the awareness rail. The image, label,
 * destination and availability all come from the public service directory;
 * only the classification and short headline are Plus+ page copy.
 */
export function PlusServiceCard({ service }: { service: PlusServiceCardData }) {
  return (
    <article
      data-plus-service-card={service.key}
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#dbe6d8] bg-white shadow-[0_2px_10px_rgba(7,53,31,0.04)] transition hover:border-[#b7cdb5] hover:shadow-[0_8px_24px_rgba(7,53,31,0.08)] motion-reduce:transition-none"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#e7f3e9]">
        <Image
          src={service.image}
          alt={service.imageAlt}
          fill
          sizes="(min-width: 1280px) 23vw, (min-width: 1024px) 31vw, (min-width: 640px) 46vw, 82vw"
          className="object-cover"
        />
        <span
          className={`absolute end-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] shadow-sm ring-1 ${STATUS_CHIP[service.status]}`}
        >
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[service.status]}`} />
          {service.statusLabel}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#7a5c10]">{service.classification}</p>
        <h3 className="mt-1 font-display text-[18px] font-extrabold leading-tight tracking-[-0.015em] text-[#14241b]">{service.label}</h3>
        <p className="mt-1 text-[12.5px] font-bold leading-5 text-[#0b5c33]">{service.headline}</p>
        <p className="mt-1 text-[12px] leading-5 text-[#4b5b51]">{service.benefit}</p>
        <div className="mt-auto pt-4">
          <Link
            href={service.href}
            data-plus-service-cta={service.key}
            aria-label={`${service.action} with NaijaDeals ${service.label}`}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full text-[12px] font-extrabold text-[#0b5c33] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
          >
            {service.action}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
