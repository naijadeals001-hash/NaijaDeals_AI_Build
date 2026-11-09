import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ApiCategory } from "@/lib/api-client";

/**
 * Left department panel from the approved desktop mockup: a tall white card of
 * compact department links with chevrons. Only real departments are listed, so
 * every row navigates somewhere that exists.
 */
export function DepartmentSidebar({ categories }: { categories: ApiCategory[] }) {
  return (
    <nav aria-label="Shop by category" className="hidden shrink-0 flex-col rounded-lg bg-white p-2.5 shadow-sm ring-1 ring-[#e3e6e6] lg:flex lg:w-[15%]">
      <p className="mb-1 px-1 text-[12px] font-bold text-[#0f1111]">Shop by category</p>
      <ul className="flex-1">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href={`/naijashop/c/${category.slug}`}
              className="flex items-center gap-1.5 rounded px-1 py-[5px] text-[11.5px] font-medium text-[#0f1111] hover:bg-[#f3f4f6] hover:text-[#c45500]"
            >
              <ChevronRight className="h-3 w-3 shrink-0 text-[#565959]" aria-hidden />
              <span className="truncate">{category.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/naijashop/categories" className="mt-1 flex items-center gap-1.5 rounded px-1 py-1.5 text-[11.5px] font-bold hover:bg-[#f3f4f6]">
        <ChevronRight className="h-3 w-3" aria-hidden /> All categories
      </Link>
    </nav>
  );
}

/** Prime panel that sits to the right of the hero on the approved mockup. */
export function PrimePanel() {
  return (
    <aside aria-labelledby="prime-panel" className="hidden shrink-0 flex-col justify-between rounded-lg bg-[#e8f2ff] p-3 lg:flex lg:w-[17%]">
      <div>
        <p id="prime-panel" className="font-display text-[15px] font-extrabold leading-tight">
          NaijaShop <span className="text-[#1a4fb4]">Prime</span>
        </p>
        <p className="mt-1 text-[10.5px] leading-4 text-[#414d63]">Fast delivery, exclusive deals and more benefits.</p>
        <ul className="mt-2 space-y-1 text-[10px] font-semibold text-[#243049]">
          <li className="flex items-start gap-1">
            <span aria-hidden>✓</span> Free &amp; faster delivery
          </li>
          <li className="flex items-start gap-1">
            <span aria-hidden>✓</span> Prime-only deals
          </li>
          <li className="flex items-start gap-1">
            <span aria-hidden>✓</span> Early access to sales
          </li>
          <li className="flex items-start gap-1">
            <span aria-hidden>✓</span> Exclusive offers
          </li>
        </ul>
      </div>
      <div className="mt-2 overflow-hidden rounded">
        <img src="/generated/shop/category-gaming.webp" alt="" aria-hidden className="h-[58px] w-full object-cover" />
      </div>
      <Link href="/naijashop/prime" className="mt-2 rounded-md bg-[#f7a12b] px-2 py-1.5 text-center text-[11.5px] font-bold text-[#12100a] hover:bg-[#e8931c]">
        Join Prime
      </Link>
    </aside>
  );
}
