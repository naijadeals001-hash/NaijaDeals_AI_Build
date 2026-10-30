import { cookies } from "next/headers";
import { DEFAULT_COUNTRY, isCountryCode, resolveCity } from "@/lib/config/regions";
import { isLanguageCode, type LanguageCode } from "@/lib/i18n/dictionary";
import { LOCALE_COOKIES, type LocaleState } from "@/lib/i18n/config";

export type { LocaleState } from "@/lib/i18n/config";
export { LOCALE_COOKIES } from "@/lib/i18n/config";

/** Read the visitor's language/country/city from cookies, validating every value. */
export function readLocale(): LocaleState {
  const store = cookies();
  const rawLanguage = store.get(LOCALE_COOKIES.language)?.value;
  const rawCountry = store.get(LOCALE_COOKIES.country)?.value?.toUpperCase();
  const rawCity = store.get(LOCALE_COOKIES.city)?.value;

  const language: LanguageCode = isLanguageCode(rawLanguage) ? rawLanguage : "en";
  const country = isCountryCode(rawCountry) ? rawCountry : DEFAULT_COUNTRY;
  const city = resolveCity(country, rawCity ?? null);

  return { language, country, city };
}
