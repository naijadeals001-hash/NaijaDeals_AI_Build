"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { COUNTRIES } from "@/lib/config/commerce";
import { citiesFor, defaultCity, resolveCity, STORE_CURRENCY } from "@/lib/config/regions";
import {
  isLanguageCode,
  isRtl,
  translate,
  type DictionaryKey,
  type LanguageCode
} from "@/lib/i18n/dictionary";
import { LOCALE_COOKIES, type LocaleState } from "@/lib/i18n/config";

type LocaleContextValue = {
  language: LanguageCode;
  country: string;
  city: string;
  cities: string[];
  currency: string;
  storeCurrency: string;
  deliveryEnabled: boolean;
  countryName: string;
  setLanguage: (language: LanguageCode) => void;
  setCountry: (country: string) => void;
  setCity: (city: string) => void;
  t: (key: DictionaryKey, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

const ONE_YEAR = 60 * 60 * 24 * 365;

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

export function LocaleProvider({ initial, children }: { initial: LocaleState; children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<LocaleState>(initial);

  const applyHtml = useCallback((language: LanguageCode) => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
    document.documentElement.dir = isRtl(language) ? "rtl" : "ltr";
  }, []);

  const commit = useCallback(
    (next: LocaleState) => {
      setState(next);
      writeCookie(LOCALE_COOKIES.language, next.language);
      writeCookie(LOCALE_COOKIES.country, next.country);
      writeCookie(LOCALE_COOKIES.city, next.city);
      applyHtml(next.language);
      router.refresh();
    },
    [applyHtml, router]
  );

  const setLanguage = useCallback(
    (language: LanguageCode) => {
      if (!isLanguageCode(language)) return;
      commit({ ...state, language });
    },
    [commit, state]
  );

  const setCountry = useCallback(
    (country: string) => {
      const nextCountry = country.toUpperCase();
      if (!COUNTRIES[nextCountry]) return;
      commit({ ...state, country: nextCountry, city: resolveCity(nextCountry, state.city) });
    },
    [commit, state]
  );

  const setCity = useCallback(
    (city: string) => {
      if (!citiesFor(state.country).includes(city)) return;
      commit({ ...state, city });
    },
    [commit, state]
  );

  const value = useMemo<LocaleContextValue>(() => {
    const config = COUNTRIES[state.country] ?? COUNTRIES.NG;
    return {
      language: state.language,
      country: state.country,
      city: state.city,
      cities: citiesFor(state.country),
      currency: config?.currency ?? STORE_CURRENCY,
      storeCurrency: STORE_CURRENCY,
      deliveryEnabled: Boolean(config?.deliveryEnabled),
      countryName: config?.name ?? state.country,
      setLanguage,
      setCountry,
      setCity,
      t: (key, vars) => translate(state.language, key, vars)
    };
  }, [setCity, setCountry, setLanguage, state]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}

export { defaultCity };
