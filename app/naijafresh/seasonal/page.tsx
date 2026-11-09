import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { FRESH_CATEGORIES } from "@/lib/services/fresh/catalogue";
import { FreshHeading, FreshPage } from "@/components/fresh/fresh-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Seasonal harvests — NaijaFresh", description: "What is in season now, and which African crops are typically harvested in which months." };

/**
 * Harvest months are general agronomic guidance for West Africa, not a guarantee of
 * any farm's harvest date. Available quantities always come from live listings.
 */
const CALENDAR: Array<{ crop: string; slug: string; months: string[] }> = [
  { crop: "Tomatoes", slug: "tomatoes-peppers", months: ["Nov", "Dec", "Jan", "Feb", "Mar"] },
  { crop: "Peppers (tatashe & rodo)", slug: "tomatoes-peppers", months: ["Oct", "Nov", "Dec", "Jan", "Feb"] },
  { crop: "Ugu & leafy vegetables", slug: "vegetables-ugu", months: ["Nov", "Dec", "Apr", "May", "Jun"] },
  { crop: "Citrus & mangoes", slug: "fruits", months: ["Nov", "Dec", "Jan", "Apr", "May"] },
  { crop: "Yam", slug: "yam-cassava", months: ["Nov", "Dec", "Jan", "Feb"] },
  { crop: "Cassava", slug: "yam-cassava", months: ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"] },
  { crop: "Beans & cowpea", slug: "grains-beans", months: ["Nov", "Dec", "Jan"] },
  { crop: "Rice (local)", slug: "grains-beans", months: ["Nov", "Dec", "Jan"] },
  { crop: "Plantain", slug: "plantain", months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] },
  { crop: "Eggs", slug: "poultry-eggs", months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] },
  { crop: "Fish & dried fish", slug: "fish-seafood", months: ["Nov", "Dec", "Jan", "Feb"] }
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function SeasonalPage() {
  const [counts, now] = await Promise.all([
    prisma.produceListing.groupBy({ by: ["category"], where: { available: true, farm: { verified: true } }, _count: { _all: true } }),
    new Promise<number>((resolve) => resolve(new Date().getMonth()))
  ]);
  const countByCategory = new Map(counts.map((row) => [row.category, row._count._all]));
  const current = MONTHS[now];

  return (
    <FreshPage>
      <FreshHeading
        eyebrow="Seasonal Harvests"
        title="Seasonal Harvest Calendar"
        description={`Know what is in season, plan your purchases and enjoy the best prices. Currently in season: ${current}. Months below are general West African harvest guidance, not guaranteed harvest dates — live availability is always shown on each listing.`}
      />
      <div className="overflow-x-auto rounded-2xl bg-white p-2 ring-1 ring-[#eef1ef]">
        <table className="w-full min-w-[720px] border-collapse text-[11px]">
          <caption className="sr-only">Crops and their typical harvest months in West Africa</caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 py-1 text-left font-extrabold">Crop</th>
              {MONTHS.map((month) => (
                <th key={month} scope="col" className={`px-1 py-1 text-center font-bold ${month === current ? "text-[#f26b21]" : "text-[#5d6d64]"}`} aria-current={month === current ? "date" : undefined}>{month}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CALENDAR.map((row) => (
              <tr key={row.crop} className="border-t border-[#f0f3f1]">
                <th scope="row" className="px-2 py-1 text-left font-semibold">
                  <Link href={`/naijafresh/category/${row.slug}`} className="hover:underline">{row.crop}</Link>
                </th>
                {MONTHS.map((month) => {
                  const inSeason = row.months.includes(month);
                  return (
                    <td key={month} className="px-1 py-1 text-center">
                      <span className={`mx-auto block h-4 w-4 rounded-full ${inSeason ? "bg-[#0b8f47]" : "bg-[#f0f3f1]"}`}>
                        <span className="sr-only">{inSeason ? "in season" : "out of season"}</span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section aria-labelledby="live-now" className="mt-4">
        <h2 id="live-now" className="mb-2 font-display text-[16px] font-extrabold">Live listings right now</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {FRESH_CATEGORIES.map((category) => (
            <li key={category.slug}>
              <Link href={`/naijafresh/category/${category.slug}`} className="block rounded-xl bg-white p-3 ring-1 ring-[#eef1ef] hover:shadow-md">
                <p className="text-[12px] font-extrabold">{category.label}</p>
                <p className="text-[10.5px] text-[#6b7a70]">{countByCategory.get(category.slug) ?? 0} listings available</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </FreshPage>
  );
}
