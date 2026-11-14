import type { Metadata } from "next";
import { CountryDirectory } from "@/components/shop/country-discovery";
import { listPublishedCountryCards } from "@/lib/services/countries/discovery.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discover Africa — every country guide",
  description:
    "Search every published NaijaDeals country guide by name, region or theme. Country associations are editorial information with sources, not claims of marketplace supply."
};

export default async function CountriesPage() {
  const countries = await listPublishedCountryCards();
  return <CountryDirectory countries={countries} />;
}
