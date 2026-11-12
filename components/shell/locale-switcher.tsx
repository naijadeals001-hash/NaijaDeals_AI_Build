"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { COUNTRIES } from "@/lib/config/commerce";
import { STORE_CURRENCY } from "@/lib/config/regions";
import { LANGUAGES } from "@/lib/i18n/dictionary";
import { useLocale } from "@/lib/i18n/locale-provider";

export function LocaleSwitcher() {
  const { language, country, city, cities, countryName, deliveryEnabled, setLanguage, setCountry, setCity, t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activeLanguage = LANGUAGES.find((item) => item.code === language);
  const countryOptions = Object.values(COUNTRIES).filter((item) => item.enabled);

  return (
    <div ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${city}, ${countryName}. ${t("common.language")}: ${activeLanguage?.native ?? language}.`}
        className="flex min-h-10 max-w-[7.5rem] items-center gap-1 rounded-full px-2.5 text-xs font-bold text-ink/80 transition hover:bg-surface-low hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:max-w-none"
      >
        <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="hidden truncate min-[360px]:inline">{city}</span>
        <ChevronDown className={`hidden h-3.5 w-3.5 shrink-0 transition min-[360px]:block ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={`${t("common.language")}, ${t("common.country")} and ${t("common.city")}`}
          className="absolute left-3 right-3 top-[calc(100%+0.5rem)] z-50 max-h-[calc(100vh-6rem)] w-auto overflow-y-auto rounded-2xl border border-border-soft bg-canvas p-4 shadow-soft sm:left-auto sm:right-6 sm:w-80 sm:rtl:left-6 sm:rtl:right-auto lg:right-8"
        >
          <fieldset>
            <legend className="text-xs font-black uppercase tracking-wide text-muted">{t("common.language")}</legend>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {LANGUAGES.map((item) => {
                const active = item.code === language;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setLanguage(item.code)}
                    aria-pressed={active}
                    lang={item.code}
                    className={`flex min-h-11 flex-col items-center justify-center rounded-xl border px-1 text-xs font-bold transition ${
                      active ? "border-primary bg-primary-soft text-primary" : "border-border-soft bg-surface-low text-ink hover:border-primary/40"
                    }`}
                  >
                    <span>{item.native}</span>
                    {active ? <Check className="mt-0.5 h-3 w-3" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-muted">{t("common.country")}</span>
              <span className="relative mt-1 block">
                <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted rtl:left-auto rtl:right-2.5" aria-hidden="true" />
                <select
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  className="min-h-10 w-full appearance-none rounded-lg border border-border-soft bg-surface-low pl-8 pr-2 text-sm font-semibold outline-none focus:border-primary rtl:pl-2 rtl:pr-8"
                >
                  {countryOptions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-muted">{t("common.city")}</span>
              <select
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="mt-1 min-h-10 w-full rounded-lg border border-border-soft bg-surface-low px-2 text-sm font-semibold outline-none focus:border-primary"
              >
                {cities.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 space-y-1.5 rounded-xl bg-surface-low p-3 text-xs text-muted">
            <p className="font-semibold text-ink">{t("common.chargedIn", { currency: STORE_CURRENCY })}</p>
            <p>{deliveryEnabled ? t("common.deliveryYes") : t("common.deliveryNo")}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
