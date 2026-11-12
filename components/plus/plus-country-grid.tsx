import Link from "next/link";
import { Globe2 } from "lucide-react";
import type { PlusCountryAvailability } from "@/lib/services/plus/availability";

/**
 * Plus+ eligibility by country. Availability is derived only from active plans,
 * enabled plan-country rows and effective approved terms; marketplace delivery
 * settings are not shown here because they are not Plus+ eligibility.
 */
export function PlusCountryGrid({ countries }: { countries: PlusCountryAvailability[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {countries.map((country) => (
        <li
          key={country.code}
          data-plus-country={country.code}
          data-plus-country-status={country.available ? "available" : "not_available"}
          className={`flex h-full min-w-0 flex-col rounded-2xl border p-4 ${
            country.available ? "border-[#bfe0c4] bg-white" : "border-[#dbe6d8] bg-[#f7faf5]"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e7f3e9] text-[#0b5c33]">
                <Globe2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-extrabold text-[#14241b]">{country.name}</p>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#4b5b51]">
                  {country.code} · {country.currency}
                </p>
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] ${
                country.available ? "bg-[#e7f8ed] text-[#0b5c33]" : "bg-[#f2f4f2] text-[#4b5b51] ring-1 ring-[#4b5b51]/10"
              }`}
            >
              {country.available ? "Available" : "Not yet available"}
            </span>
          </div>

          {country.available ? (
            <ul className="mt-3 space-y-2 border-t border-[#eef3ea] pt-3">
              {country.plans.map((plan) => (
                <li key={plan.id} className="text-[11.5px] leading-5">
                  <p className="font-bold text-[#14241b]">{plan.name}</p>
                  <p className="text-[#4b5b51]">{plan.priceLabel}</p>
                  {plan.cancellationSummary ? (
                    <p className="text-[10.5px] leading-4 text-[#4b5b51]">{plan.cancellationSummary}</p>
                  ) : null}
                  {plan.termsUrl ? (
                    <Link
                      href={plan.termsUrl}
                      className="mt-0.5 inline-flex min-h-6 items-center text-[10.5px] font-bold text-[#0b5c33] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] focus-visible:ring-offset-2"
                    >
                      Plan terms
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-auto pt-3 text-[11px] leading-5 text-[#4b5b51]">
              No active Plus+ plan is enabled for this country.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
