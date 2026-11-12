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
