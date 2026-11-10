"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { LANGUAGES } from "@/lib/i18n/dictionary";
import { useLocale } from "@/lib/i18n/locale-provider";

/**
 * Language selector for Aura.
 *
 * Wires to the app's existing locale provider, so choosing a language sets the
 * `nd_lang` cookie, updates <html lang/dir> and persists across pages. Only the
 * three languages the app actually ships strings for are offered.
 */
export function AuraLanguageSelect({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${current.label}`}
        className={`flex items-center gap-1.5 rounded-lg text-white/85 transition hover:text-white ${compact ? "px-1.5 py-1 text-[12px]" : "px-2 py-1.5 text-[13px]"}`}
      >
        {current.label}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Choose a language"
          className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-lg border border-aura-border bg-aura-surface py-1 shadow-xl"
        >
          {LANGUAGES.map((option) => (
            <li key={option.code}>
              <button
                type="button"
                role="option"
                aria-selected={option.code === language}
                onClick={() => {
                  setLanguage(option.code);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-white/90 hover:bg-aura-highlight/60"
              >
                <span>
                  {option.label}
                  <span className="ml-1.5 text-[11px] text-white/50">{option.native}</span>
                </span>
                {option.code === language && <Check className="h-3.5 w-3.5 text-aura-mint" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
