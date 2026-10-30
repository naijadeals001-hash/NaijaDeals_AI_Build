import type { LanguageCode } from "@/lib/i18n/dictionary";

export type LocaleState = {
  language: LanguageCode;
  country: string;
  city: string;
};

export const LOCALE_COOKIES = {
  language: "nd_lang",
  country: "nd_country",
  city: "nd_city"
} as const;
