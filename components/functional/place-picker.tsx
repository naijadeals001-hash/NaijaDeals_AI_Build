"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { DRIVE_PLACES, searchPlaces, type DrivePlace } from "@/lib/config/drive";

/**
 * Landmark picker used for both pick-up and drop-off.
 *
 * Search runs entirely against bundled Lagos landmarks, so it works with the map
 * switched off and on a slow connection. Everything is reachable by keyboard and
 * announced to screen readers: it is a real ARIA combobox, not a styled `<select>`.
 *
 * The two ends are distinguished by shape as well as colour (circle vs square) so
 * the route stays readable for riders who cannot separate red from green.
 */

type PlacePickerProps = {
  id: string;
  label: string;
  value: string;
  onChange: (placeId: string) => void;
  accent: "pickup" | "dropoff";
  recentIds?: string[];
  /** The other end of the trip; offered but marked, never silently excluded. */
  counterpartId?: string;
};

export function PlacePicker({ id, label, value, onChange, accent, recentIds = [], counterpartId }: PlacePickerProps) {
  const selected = useMemo(() => DRIVE_PLACES.find((place) => place.id === value) ?? null, [value]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const baseId = useId();

  const listId = `${baseId}-listbox`;
  const optionId = useCallback((index: number) => `${baseId}-option-${index}`, [baseId]);

  const options = useMemo(() => {
    const matches = searchPlaces(query);
    if (query.trim()) {
      return matches.map((place) => ({ place, group: place.zone as string }));
    }
    // Empty query: recent landmarks first, then everything grouped by zone.
    const recent = recentIds
      .map((recentId) => DRIVE_PLACES.find((place) => place.id === recentId))
      .filter((place): place is DrivePlace => Boolean(place));
    const recentSet = new Set(recent.map((place) => place.id));
    return [
      ...recent.map((place) => ({ place, group: "Recent" })),
      ...DRIVE_PLACES.filter((place) => !recentSet.has(place.id)).map((place) => ({ place, group: place.zone as string }))
    ];
  }, [query, recentIds]);

  // Keep the highlighted row in sync with the current selection when opening.
  useEffect(() => {
    if (!open) return;
    const index = options.findIndex((option) => option.place.id === value);
    setActiveIndex(index >= 0 ? index : 0);
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    const element = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(activeIndex))}`);
    element?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, optionId]);

  // Close when the rider taps anywhere else.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function commit(place: DrivePlace) {
    onChange(place.id);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => {
        const next = index + delta;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === "Enter") {
      if (!open) {
        setOpen(true);
        return;
      }
      const option = options[activeIndex];
      if (option) {
        event.preventDefault();
        commit(option.place);
      }
      return;
    }
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setQuery("");
      }
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      setQuery("");
    }
  }

  const accentRing = accent === "pickup" ? "text-primary" : "text-night";
  let lastGroup = "";

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className="text-xs font-black uppercase tracking-wide text-muted">
        {label}
      </label>

      <div className="relative mt-1">
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-3 top-1/2 z-10 h-3 w-3 -translate-y-1/2 bg-current rtl:left-auto rtl:right-3 ${accentRing} ${
            accent === "pickup" ? "rounded-full" : "rounded-[2px]"
          }`}
        />
        <Search className="pointer-events-none absolute right-9 top-1/2 h-4 w-4 -translate-y-1/2 text-muted rtl:left-9 rtl:right-auto" aria-hidden="true" />
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition rtl:left-3 rtl:right-auto ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? optionId(activeIndex) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={open ? query : (selected?.label ?? "")}
          placeholder={selected ? selected.label : "Search a Lagos landmark"}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="min-h-12 w-full rounded-xl border border-border-soft bg-surface-low pl-8 pr-9 text-sm font-semibold outline-none focus:border-primary focus:bg-canvas rtl:pl-9 rtl:pr-8"
        />
      </div>

      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={`${label} landmark`}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto overscroll-contain rounded-xl border border-border-soft bg-canvas p-1 shadow-soft"
        >
          {options.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted">
              No landmark matches “{query}”. NaijaDrive books between named Lagos landmarks only.
            </li>
          ) : (
            options.map((option, index) => {
              const isSelected = option.place.id === value;
              const isCounterpart = option.place.id === counterpartId;
              const showHeading = option.group !== lastGroup;
              lastGroup = option.group;

              return (
                <li key={`${option.group}-${option.place.id}`} role="presentation">
                  {showHeading ? (
                    <p className="px-2 pb-1 pt-2 text-[10px] font-black uppercase tracking-wide text-muted">{option.group}</p>
                  ) : null}
                  <div
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commit(option.place)}
                    onPointerEnter={() => setActiveIndex(index)}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 ${
                      index === activeIndex ? "bg-primary-soft" : "bg-transparent"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1 h-2.5 w-2.5 shrink-0 ${
                        accent === "pickup" ? "rounded-full bg-primary" : "rounded-[2px] bg-night"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold">{option.place.label}</span>
                        {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" /> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted">{option.place.address}</span>
                      {isCounterpart ? (
                        <span className="mt-1 inline-block rounded-full bg-amber-soft px-2 py-0.5 text-[10px] font-bold text-ink">
                          Same as the other end — not allowed
                        </span>
                      ) : null}
                    </span>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
