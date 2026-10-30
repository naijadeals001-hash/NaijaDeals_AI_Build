/**
 * Country and city context.
 *
 * Commerce itself is only enabled for Nigeria in the payment configuration, so the
 * selector is honest: it changes browsing context, language and the phone dial code,
 * but the checkout currency stays NGN until a country is explicitly enabled for
 * selling. Delivery availability comes straight from `lib/config/commerce.ts`.
 */
import { COUNTRIES } from "@/lib/config/commerce";

export const CITIES: Record<string, string[]> = {
  NG: ["Lagos", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City", "Kaduna"],
  GH: ["Accra", "Kumasi", "Tamale"],
  KE: ["Nairobi", "Mombasa", "Kisumu"],
  ZA: ["Johannesburg", "Cape Town", "Durban"],
  GB: ["London", "Manchester", "Birmingham"],
  US: ["New York", "Atlanta", "Houston"]
};

export const DEFAULT_COUNTRY = "NG";

/** Currency the catalogue is priced and charged in today. */
export const STORE_CURRENCY = "NGN";

export function isCountryCode(value: string | null | undefined): value is string {
  return Boolean(value && COUNTRIES[value.toUpperCase()]);
}

export function citiesFor(countryCode: string) {
  return CITIES[countryCode] ?? [];
}

export function defaultCity(countryCode: string) {
  return CITIES[countryCode]?.[0] ?? "";
}

export function resolveCity(countryCode: string, city: string | null | undefined) {
  const list = citiesFor(countryCode);
  if (city && list.includes(city)) return city;
  return defaultCity(countryCode);
}
