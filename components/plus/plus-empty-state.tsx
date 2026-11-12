import type { ReactNode } from "react";

/** Honest empty state. No carousel, arrows or invented cards surround it. */
export function PlusEmptyState({
  icon,
  eyebrow,
  title,
  children,
  testId
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-plus-empty-state={testId ?? "plus"}
      className="relative overflow-hidden rounded-2xl border border-dashed border-[#abc4aa] bg-[#f8fbf6] p-5 sm:p-7"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#07351f] text-[#F2D48C]">{icon}</span>
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#0b5c33]">{eyebrow}</p>
          <h3 className="mt-1 font-display text-[20px] font-extrabold leading-tight tracking-[-0.015em] sm:text-[23px]">{title}</h3>
          <div className="mt-2 max-w-3xl text-[12.5px] leading-6 text-[#4b5b51]">{children}</div>
        </div>
      </div>
    </div>
  );
}
