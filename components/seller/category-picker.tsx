"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronRight, Info, Loader2, Plus, Search, ShieldAlert, Sparkles } from "lucide-react";
import {
  getSellerCategories,
  taxonomyErrorMessage,
  type SellerCategory,
  type TaxonomyAttribute
} from "@/lib/taxonomy-api";

export type AttributeValues = Record<string, string>;

type LoadStatus = "loading" | "ready" | "error";

/**
 * A deterministic suggestion from /api/seller/category-suggest.
 *
 * The endpoint matches published names and aliases; it is not an AI guess. An
 * optional explanation may be attached later by the backend and is rendered
 * as advisory context only — it never selects a category.
 */
type CategorySuggestion = {
  categoryId: string;
  path: string;
  reason: string;
  explanation: string | null;
  explanationLabel: string | null;
};

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The API path uses " › "; older fixtures used " / ". Accept both. */
function pathSegments(path: string): string[] {
  return path
    .split(/\s*(?:›|\/)\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

async function fetchCategorySuggestions(
  query: string
): Promise<{ suggestions: CategorySuggestion[]; mode: "deterministic" | "aura" }> {
  const response = await fetch(`/api/seller/category-suggest?q=${encodeURIComponent(query.slice(0, 80))}`, {
    cache: "no-store",
    credentials: "same-origin"
  });
  if (!response.ok) throw new Error(`Suggestion request failed (HTTP ${response.status}).`);
  const body = (await response.json().catch(() => ({}))) as { suggestions?: unknown; mode?: unknown };
  const rows = Array.isArray(body?.suggestions) ? body.suggestions : [];
  const suggestions = rows
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => {
      const explanation =
        optionalString(entry.explanation) ??
        optionalString(entry.modelExplanation) ??
        optionalString(entry.aiExplanation) ??
        optionalString(entry.assistantExplanation);
      return {
        categoryId: String(entry.categoryId ?? ""),
        path: typeof entry.path === "string" ? entry.path : "",
        reason: typeof entry.reason === "string" ? entry.reason : "Matched the published name or alias",
        explanation,
        explanationLabel: explanation
          ? optionalString(entry.explanationLabel) ?? "Model-assisted explanation (advisory only)"
          : null
      };
    })
    .filter((entry) => entry.categoryId && entry.path)
    .slice(0, 3);
  // The picker only requests the default deterministic search. If the server
  // ever returns a model-assisted list, label it honestly instead of calling
  // it deterministic; it still never selects a category by itself.
  return { suggestions, mode: body?.mode === "aura" ? "aura" : "deterministic" };
}

/**
 * Searchable hierarchy picker over `/api/seller/categories`.
 *
 * The picker only offers categories the server says this seller may publish
 * into; a category restricted for the seller's country stays visible with its
 * server note and cannot be selected. Searching matches the published name,
 * key and breadcrumb locally, and the suggest endpoint adds alias matches —
 * no category is ever invented on the client.
 */
export function CategoryPicker({
  value,
  onSelect,
  onRequestCategory,
  disabled = false
}: {
  value: string;
  onSelect: (category: SellerCategory | null) => void;
  /** Opens the seller category-request form with the current search text. */
  onRequestCategory: (query: string) => void;
  disabled?: boolean;
}) {
  const [categories, setCategories] = useState<SellerCategory[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);
  const [suggestStatus, setSuggestStatus] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [suggestEngine, setSuggestEngine] = useState<"deterministic" | "aura" | null>(null);
  const [pendingSuggestion, setPendingSuggestion] = useState<CategorySuggestion | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const descriptionId = useId();

  const selected = useMemo(
    () => categories.find((category) => category.id === value) ?? null,
    [categories, value]
  );

  const load = useCallback(async () => {
    setStatus("loading");
    setLoadError("");
    try {
      const rows = await getSellerCategories();
      setCategories(rows);
      setStatus("ready");
    } catch (error) {
      setLoadError(
        taxonomyErrorMessage(error, {
          missingEndpoint: "Category selection is not available yet. The seller category service has not been enabled."
        })
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  // A restored draft stores only the id. Once the real list arrives, tell the
  // parent which category (and therefore which attributes) that id refers to.
  const resolvedRef = useRef("");
  useEffect(() => {
    if (!value || resolvedRef.current === value) return;
    const match = categories.find((category) => category.id === value);
    if (!match) return;
    resolvedRef.current = value;
    onSelect(match);
    // onSelect is intentionally not a dependency: the parent setter is stable
    // enough and re-running would notify on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, value]);

  // A saved draft can name a category that has since been removed, made
  // non-selectable or restricted for this market. Once the real list is in,
  // clear the stale id instead of letting it look selected.
  useEffect(() => {
    if (status !== "ready" || !value) return;
    if (categories.some((category) => category.id === value)) return;
    resolvedRef.current = "";
    onSelect(null);
    // The setter is intentionally omitted; it is stable for this use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, categories, value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setPendingSuggestion(null);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const trimmedQuery = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!trimmedQuery) return categories.slice(0, 40);
    return categories
      .filter((category) => {
        const haystack = `${category.name} ${category.key ?? ""} ${category.path}`.toLowerCase();
        return haystack.includes(trimmedQuery);
      })
      .slice(0, 40);
  }, [categories, trimmedQuery]);

  // Alias search lives on the server (`category-suggest`); local matching alone
  // would miss a category whose alias is not in its display name. The request
  // stays abortable so a fast typist cannot apply an older match.
  useEffect(() => {
    const q = query.trim();
    setPendingSuggestion(null);
    setSuggestions([]);
    setSuggestEngine(null);
    if (q.length < 2) {
      setSuggestStatus("idle");
      return;
    }
    const controller = new AbortController();
    setSuggestStatus("loading");
    const timer = window.setTimeout(() => {
      fetchCategorySuggestions(q)
        .then((result) => {
          if (controller.signal.aborted) return;
          setSuggestions(result.suggestions);
          setSuggestEngine(result.mode);
          setSuggestStatus("ready");
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setSuggestions([]);
          setSuggestStatus("error");
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // The confirmation is an explicit keyboard stop, not an automatic choice.
  useEffect(() => {
    if (pendingSuggestion) confirmButtonRef.current?.focus();
  }, [pendingSuggestion]);

  // Show the server's top matches with their reasons even when the same row is
  // already visible in the plain search list: the reason is the useful part.
  const suggestionRows = suggestions.slice(0, 3);

  function choose(category: SellerCategory) {
    if (!category.canPublish) return;
    resolvedRef.current = category.id;
    onSelect(category);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
    setPendingSuggestion(null);
  }

  function clearSelection() {
    resolvedRef.current = "";
    onSelect(null);
    setQuery("");
    setActiveIndex(-1);
    setPendingSuggestion(null);
    setOpen(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function moveActive(delta: number) {
    if (matches.length === 0) return;
    setOpen(true);
    setActiveIndex((current) => {
      const next = current + delta;
      if (next < 0) return matches.length - 1;
      if (next >= matches.length) return 0;
      return next;
    });
  }

  const activeId = activeIndex >= 0 && matches[activeIndex] ? `seller-category-option-${matches[activeIndex].id}` : undefined;

  return (
    <div ref={containerRef} className="rounded-xl border border-border-soft bg-surface-low p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p id={descriptionId} className="text-xs font-black uppercase tracking-wide text-muted">
            Category <span className="text-crimson">*</span>
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted">
            Search the published hierarchy. Only categories open to sellers in your market can be selected.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRequestCategory(query)}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border-soft bg-canvas px-2.5 text-[11px] font-bold text-primary"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Request a category
        </button>
      </div>

      {status === "loading" ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
          Loading seller categories…
        </p>
      ) : null}

      {status === "error" ? (
        <div role="alert" className="mt-3 rounded-lg border border-crimson/30 bg-crimson-soft p-3 text-sm font-semibold text-[#991B1B]">
          <p className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {loadError}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="min-h-9 rounded-lg bg-crimson px-3 text-xs font-bold text-white"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => onRequestCategory(query)}
              className="min-h-9 rounded-lg border border-crimson/40 px-3 text-xs font-bold text-[#991B1B]"
            >
              Request a category instead
            </button>
          </div>
        </div>
      ) : null}

      {status === "ready" && categories.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-border-soft bg-canvas p-3 text-sm text-muted">
          <p className="font-bold text-ink">No categories are open for listing yet.</p>
          <p className="mt-1 text-[12px] leading-5">
            Nothing has been published for sellers in your market. You can ask the Control Center to add the category — your
            request is reviewed, and nothing is published automatically.
          </p>
          <button
            type="button"
            onClick={() => onRequestCategory(query)}
            className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Request a category
          </button>
        </div>
      ) : null}

      {status === "ready" && selected ? (
        <div className="mt-3 rounded-lg border border-primary/25 bg-canvas p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted">Selected category</p>
              <p className="mt-1 flex flex-wrap items-center gap-1 text-sm font-extrabold text-ink">
                {pathSegments(selected.path).map((segment, index, segments) => (
                  <span key={`${segment}-${index}`} className="inline-flex items-center gap-1">
                    <span className={index === segments.length - 1 ? "text-primary" : ""}>{segment}</span>
                    {index < segments.length - 1 ? (
                      <ChevronRight className="h-3 w-3 text-muted" aria-hidden />
                    ) : null}
                  </span>
                ))}
              </p>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              disabled={disabled}
              className="min-h-9 rounded-lg border border-border-soft bg-surface-low px-3 text-xs font-bold text-primary disabled:opacity-60"
            >
              Change category
            </button>
          </div>

          {!selected.canPublish ? (
            <p role="alert" className="mt-2 rounded-lg border border-amber-300/60 bg-amber-50 p-2 text-[11px] font-semibold leading-4 text-[#7a4c00]">
              <ShieldAlert className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              {selected.restrictionNote || "This category cannot be used for your market. Choose another category."}
            </p>
          ) : null}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted">What belongs here</p>
              {selected.description ? (
                <p className="mt-1 text-[12px] leading-5 text-ink">{selected.description}</p>
              ) : null}
              {selected.examples.length > 0 ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-4 text-muted">
                  {selected.examples.map((example) => (
                    <li key={example}>{example}</li>
                  ))}
                </ul>
              ) : !selected.description ? (
                <p className="mt-1 text-[11px] leading-4 text-muted">
                  No inclusion examples are published for this category yet. The attribute list is the published requirement.
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted">
                Category attributes ({selected.attributes.length})
              </p>
              {selected.attributes.length === 0 ? (
                <p className="mt-1 text-[11px] leading-4 text-muted">No extra attributes are required by this category.</p>
              ) : (
                <ul className="mt-1 flex flex-wrap gap-1">
                  {selected.attributes.map((attribute) => (
                    <li
                      key={attribute.key}
                      className="rounded-full bg-surface-low px-2 py-0.5 text-[10px] font-bold text-ink ring-1 ring-border-soft"
                    >
                      {attribute.label}
                      {attribute.required ? <span className="text-crimson"> *</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {status === "ready" && categories.length > 0 && !selected ? (
        <div className="relative mt-3">
          <label htmlFor="seller-category-search" className="sr-only">
            Search seller categories
          </label>
          <div className="flex items-stretch overflow-hidden rounded-lg border border-border-soft bg-canvas focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
            <Search className="ml-2.5 h-4 w-4 shrink-0 self-center text-muted" aria-hidden />
            <input
              ref={inputRef}
              id="seller-category-search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-activedescendant={activeId}
              aria-describedby={descriptionId}
              autoComplete="off"
              type="text"
              value={query}
              disabled={disabled}
              placeholder={`Search ${categories.length} categories by name or alias`}
              onChange={(event) => {
                setQuery(event.target.value.slice(0, 80));
                setOpen(true);
                setActiveIndex(-1);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  moveActive(1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  moveActive(-1);
                } else if (event.key === "Home" && open) {
                  event.preventDefault();
                  setActiveIndex(0);
                } else if (event.key === "End" && open) {
                  event.preventDefault();
                  setActiveIndex(matches.length - 1);
                } else if (event.key === "Enter") {
                  if (open && activeIndex >= 0 && matches[activeIndex]) {
                    event.preventDefault();
                    choose(matches[activeIndex]);
                  }
                } else if (event.key === "Escape") {
                  setOpen(false);
                  setActiveIndex(-1);
                  setPendingSuggestion(null);
                }
              }}
              className="min-h-11 min-w-0 flex-1 bg-transparent px-2.5 text-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted disabled:opacity-60"
            />
          </div>

          {open ? (
            <div className="absolute left-0 right-0 z-20 mt-1 max-h-[70vh] overflow-y-auto overscroll-contain rounded-xl border border-border-soft bg-canvas shadow-[0_18px_40px_rgba(7,53,31,0.14)]">
              <ul
                id={listboxId}
                role="listbox"
                aria-label="Seller categories"
                className="max-h-72 overflow-y-auto overscroll-contain py-1"
              >
                {matches.length === 0 ? (
                  <li className="px-3 py-3 text-[12px] text-muted" role="presentation">
                    No published category matches “{query.trim()}”.{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onRequestCategory(query);
                      }}
                      className="font-bold text-primary underline"
                    >
                      Request it
                    </button>
                  </li>
                ) : null}
                {matches.map((category, index) => {
                  const segments = pathSegments(category.path);
                  const isActive = index === activeIndex;
                  return (
                    <li
                      key={category.id}
                      id={`seller-category-option-${category.id}`}
                      role="option"
                      aria-selected={false}
                      aria-disabled={!category.canPublish}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(category)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`flex cursor-pointer items-start justify-between gap-2 px-3 py-2 ${
                        isActive ? "bg-primary-soft" : "bg-transparent"
                      } ${category.canPublish ? "" : "cursor-not-allowed opacity-70"}`}
                      style={{ paddingLeft: `${12 + Math.min(category.level, 3) * 14}px` }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-bold text-ink">
                          {segments[segments.length - 1]}
                        </span>
                        {segments.length > 1 ? (
                          <span className="mt-0.5 block truncate text-[10.5px] text-muted">
                            {segments.slice(0, -1).join(" › ")}
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-[10.5px] text-muted">Department</span>
                        )}
                        {!category.canPublish ? (
                          <span className="mt-0.5 block text-[10px] font-semibold text-[#8a4a10]">
                            {category.restrictionNote || "Not open to sellers in your market."}
                          </span>
                        ) : null}
                      </span>
                      {category.canPublish ? (
                        <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      ) : (
                        <ShieldAlert className="mt-1 h-3.5 w-3.5 shrink-0 text-[#8a4a10]" aria-hidden />
                      )}
                    </li>
                  );
                })}
              </ul>

              {suggestionRows.length > 0 || suggestStatus === "loading" || suggestStatus === "error" || pendingSuggestion ? (
                <div className="border-t border-border-soft bg-surface-low px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted">
                      {suggestEngine === "aura" ? "Model-assisted matches" : "Deterministic matches"}
                    </p>
                    <span className="text-[9.5px] text-muted">
                      {suggestEngine === "aura"
                        ? "Advisory model output — confirm before use"
                        : "Published name & alias only — not AI"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-4 text-muted">
                    {suggestEngine === "aura"
                      ? "These are advisory matches from the published category list. Nothing is selected until you confirm one."
                      : "The server matched these existing categories. Nothing is selected until you confirm one below."}
                  </p>
                  {suggestStatus === "loading" ? (
                    <p role="status" className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      Checking published names and aliases…
                    </p>
                  ) : suggestStatus === "error" ? (
                    <p className="mt-1 text-[11px] text-muted">
                      Alias matching is unavailable. Name matching above still applies, and the request form remains usable.
                    </p>
                  ) : (
                    <ul className="mt-1.5 space-y-1.5">
                      {suggestionRows.map((suggestion) => {
                        const category = categories.find((row) => row.id === suggestion.categoryId);
                        const unavailable = !category || !category.canPublish;
                        return (
                          <li
                            key={`${suggestion.categoryId}-${suggestion.reason}`}
                            className="rounded-lg border border-border-soft bg-canvas p-2"
                          >
                            <p className="flex items-start gap-1.5 text-[11.5px] font-extrabold text-ink">
                              <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden />
                              <span className="min-w-0 break-words">{suggestion.path || "Suggested category"}</span>
                            </p>
                            <p className="mt-0.5 text-[10.5px] leading-4 text-muted">{suggestion.reason}</p>
                            {suggestion.explanation ? (
                              <p className="mt-1 rounded border border-[#e7dcc0] bg-[#fbf8ef] p-1.5 text-[10.5px] leading-4 text-[#6b5300]">
                                <span className="inline-flex items-center gap-1 font-bold">
                                  <Sparkles className="h-3 w-3" aria-hidden />
                                  {suggestion.explanationLabel ?? "Model-assisted explanation (advisory only)"}
                                </span>
                                <span className="mt-0.5 block">{suggestion.explanation}</span>
                              </p>
                            ) : null}
                            {!category ? (
                              <p className="mt-1 text-[10.5px] leading-4 text-[#8a4a10]">
                                This category is no longer open for listing in your market. Use search or request it instead.
                              </p>
                            ) : !category.canPublish ? (
                              <p className="mt-1 text-[10.5px] leading-4 text-[#8a4a10]">
                                {category.restrictionNote || "Not open to sellers in your market."}
                              </p>
                            ) : null}
                            <button
                              type="button"
                              disabled={unavailable || disabled}
                              onClick={() => setPendingSuggestion(suggestion)}
                              className="mt-1.5 inline-flex min-h-9 items-center rounded-lg border border-primary/30 bg-primary-soft px-2.5 text-[10.5px] font-extrabold text-primary disabled:opacity-50"
                            >
                              Review this match
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {pendingSuggestion ? (
                    <div
                      role="group"
                      aria-label="Confirm the suggested category"
                      className="mt-2 rounded-lg border border-primary/40 bg-canvas p-2.5"
                    >
                      {(() => {
                        const category = categories.find((row) => row.id === pendingSuggestion.categoryId) ?? null;
                        const blocked = !category || !category.canPublish || disabled;
                        return (
                          <>
                            <p className="text-[11.5px] font-extrabold text-ink">
                              Use <span className="break-words">{pendingSuggestion.path}</span>?
                            </p>
                            <p className="mt-0.5 text-[10.5px] leading-4 text-muted">
                              Match reason: {pendingSuggestion.reason}
                            </p>
                            {pendingSuggestion.explanation ? (
                              <p className="mt-1 text-[10.5px] leading-4 text-[#6b5300]">
                                <span className="font-bold">
                                  {pendingSuggestion.explanationLabel ?? "Model-assisted explanation (advisory only)"}:{" "}
                                </span>
                                {pendingSuggestion.explanation}
                              </p>
                            ) : null}
                            {!category ? (
                              <p className="mt-1 text-[10.5px] leading-4 text-[#8a4a10]">
                                This match is no longer in your publishable list, so it cannot be selected.
                              </p>
                            ) : !category.canPublish ? (
                              <p className="mt-1 text-[10.5px] leading-4 text-[#8a4a10]">
                                {category.restrictionNote || "This category is not open to your market."}
                              </p>
                            ) : (
                              <p className="mt-1 text-[10.5px] leading-4 text-muted">
                                Confirming sets the category on this draft. It does not publish the product.
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                ref={confirmButtonRef}
                                type="button"
                                disabled={blocked}
                                onClick={() => category && choose(category)}
                                className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-primary px-3 text-[11px] font-extrabold text-white disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" aria-hidden />
                                Use this category
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingSuggestion(null);
                                  window.requestAnimationFrame(() => inputRef.current?.focus());
                                }}
                                className="min-h-9 rounded-lg border border-border-soft px-3 text-[11px] font-bold text-muted"
                              >
                                Keep browsing
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="mt-1.5 flex items-start gap-1 text-[10.5px] leading-4 text-muted">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            Departments are shown first; use ↑ ↓ and Enter to choose a category.
          </p>
        </div>
      ) : null}

      {status === "ready" && categories.length > 0 && selected ? (
        <p className="mt-2 text-[10.5px] leading-4 text-muted">
          Category availability comes from the published taxonomy and your market&apos;s country rules.
        </p>
      ) : null}
    </div>
  );
}

/** Render one field per published CategoryAttribute, in the server's order. */
export function CategoryAttributeFields({
  attributes,
  values,
  onChange,
  errors = {},
  disabled = false
}: {
  attributes: TaxonomyAttribute[];
  values: AttributeValues;
  onChange: (key: string, value: string) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}) {
  if (attributes.length === 0) return null;

  return (
    <fieldset className="rounded-xl border border-border-soft bg-surface-low p-3">
      <legend className="px-1 text-xs font-black uppercase tracking-wide text-muted">
        Category attributes ({attributes.length})
      </legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {attributes.map((attribute) => {
          const inputId = `attribute-${attribute.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          const errorId = `${inputId}-error`;
          const value = values[attribute.key] ?? "";
          const error = errors[attribute.key];
          const common = {
            id: inputId,
            name: attribute.key,
            disabled,
            required: attribute.required,
            "aria-required": attribute.required,
            "aria-invalid": Boolean(error),
            "aria-describedby": error ? errorId : undefined,
            className: `mt-1 min-h-10 w-full rounded-lg border px-3 text-sm font-semibold text-ink ${
              error ? "border-crimson" : "border-border-soft"
            } bg-canvas`
          } as const;

          return (
            <label key={attribute.key} htmlFor={inputId} className="text-xs font-bold text-muted">
              {attribute.label}
              {attribute.required ? <span className="text-crimson"> *</span> : <span className="font-normal"> (optional)</span>}
              {attribute.type === "SELECT" ? (
                <select
                  {...common}
                  value={value}
                  onChange={(event) => onChange(attribute.key, event.target.value)}
                >
                  <option value="">Choose…</option>
                  {attribute.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : attribute.type === "BOOLEAN" ? (
                <select
                  {...common}
                  value={value}
                  onChange={(event) => onChange(attribute.key, event.target.value)}
                >
                  <option value="">Choose…</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : attribute.type === "NUMBER" ? (
                <input
                  {...common}
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={value}
                  onChange={(event) => onChange(attribute.key, event.target.value)}
                />
              ) : (
                <input
                  {...common}
                  type="text"
                  maxLength={200}
                  value={value}
                  onChange={(event) => onChange(attribute.key, event.target.value)}
                />
              )}
              {attribute.type === "SELECT" && attribute.options.length === 0 ? (
                <span className="mt-1 block text-[10px] font-normal text-muted">
                  The option list has not been published yet; the server will reject a value it does not accept.
                </span>
              ) : null}
              {error ? (
                <span id={errorId} role="alert" className="mt-1 block text-[11px] font-bold text-crimson">
                  {error}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-[10.5px] leading-4 text-muted">
        Attribute values are validated by the server against the published category requirements.
      </p>
    </fieldset>
  );
}

/**
 * Client-side pre-check of required/formatted attributes. The server remains
 * authoritative; this only avoids an avoidable round trip.
 */
export function validateAttributeValues(
  attributes: TaxonomyAttribute[],
  values: AttributeValues
): { errors: Record<string, string>; payload: Record<string, string | number | boolean> } {
  const errors: Record<string, string> = {};
  const payload: Record<string, string | number | boolean> = {};

  for (const attribute of attributes) {
    const raw = (values[attribute.key] ?? "").trim();
    if (!raw) {
      if (attribute.required) errors[attribute.key] = `${attribute.label} is required.`;
      continue;
    }
    if (attribute.type === "NUMBER") {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        errors[attribute.key] = `${attribute.label} must be a number.`;
        continue;
      }
      payload[attribute.key] = parsed;
      continue;
    }
    if (attribute.type === "BOOLEAN") {
      if (raw !== "true" && raw !== "false") {
        errors[attribute.key] = `${attribute.label} must be answered Yes or No.`;
        continue;
      }
      payload[attribute.key] = raw === "true";
      continue;
    }
    if (attribute.type === "SELECT" && attribute.options.length > 0 && !attribute.options.includes(raw)) {
      errors[attribute.key] = `${attribute.label} must be one of the published options.`;
      continue;
    }
    payload[attribute.key] = raw;
  }

  return { errors, payload };
}
