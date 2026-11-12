import { Plus } from "lucide-react";
import type { PlusFaqItem } from "@/lib/data/plus";

/**
 * Native disclosure FAQ. No JavaScript is required to open an answer, and the
 * summary remains a real focus target for keyboard and screen-reader users.
 */
export function PlusFaq({ items }: { items: PlusFaqItem[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#dbe6d8] bg-white">
      {items.map((item) => (
        <details key={item.question} className="group border-b border-[#e3ebe0] last:border-b-0">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-[13.5px] font-extrabold leading-6 text-[#14241b] hover:bg-[#f7faf5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0b5c33] sm:px-5 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">{item.question}</span>
            <Plus
              className="h-4 w-4 shrink-0 text-[#0b5c33] transition-transform group-open:rotate-45 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>
          <div className="px-4 pb-4 pe-10 text-[12.5px] leading-6 text-[#4b5b51] sm:px-5 sm:pe-12">
            <p>{item.answer}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
