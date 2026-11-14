"use client";

import { useEffect, useState } from "react";

type DiscoveryCard = {
  id: string;
  label: string;
  description: string;
  href: string;
  imageUrl: string;
  imageAlt: string;
  enabled: boolean;
  sortOrder: number;
};

type DiscoveryLink = { label: string; href: string };

type Candidate = {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  categorySlug: string;
  priceKobo: string;
  isDemo: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
};

type Config = {
  announcement: string;
  heroTitle: string;
  heroSubtitle: string;
  visibleCategories: string[];
  categoryOrder: string[];
  shelfLimit: number;
  showDemoProducts: boolean;
  showHero: boolean;
  showShelves: boolean;
  showAfricanDiscovery: boolean;
  africanFeaturedProductIds: string[];
  africanDiscoveryEyebrow: string;
  africanDiscoveryTitle: string;
  africanDiscoveryIntro: string;
  africanDiscoveryLinks: DiscoveryLink[];
  discoveryCards: DiscoveryCard[];
  version: number;
};

type AdminState = {
  published: Config;
  draft: Config | null;
  draftSavedBy: string | null;
  draftSavedAt: string | null;
  featuredCandidates: Candidate[];
  discoveryCardHrefs: string[];
  discoveryImageOptions: Array<{ url: string; label: string }>;
};

const MAX_FEATURED = 4;

const EMPTY: Config = {
  announcement: "",
  heroTitle: "",
  heroSubtitle: "",
  visibleCategories: [],
  categoryOrder: [],
  shelfLimit: 4,
  showDemoProducts: true,
  showHero: true,
  showShelves: true,
  showAfricanDiscovery: true,
  africanFeaturedProductIds: [],
  africanDiscoveryEyebrow: "",
  africanDiscoveryTitle: "",
  africanDiscoveryIntro: "",
  africanDiscoveryLinks: [],
  discoveryCards: [],
  version: 0
};

const CONFIG_KEYS: Array<keyof Config> = [
  "announcement",
  "heroTitle",
  "heroSubtitle",
  "visibleCategories",
  "categoryOrder",
  "shelfLimit",
  "showDemoProducts",
  "showHero",
  "showShelves",
  "showAfricanDiscovery",
  "africanFeaturedProductIds",
  "africanDiscoveryEyebrow",
  "africanDiscoveryTitle",
  "africanDiscoveryIntro",
  "africanDiscoveryLinks",
  "discoveryCards",
  "version"
];

const inputClass =
  "mt-1 block min-h-10 w-full rounded border border-[#30363D] bg-[#0B0E14] px-2 text-sm text-[#F0F6FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676]";
const labelClass = "text-xs font-bold text-[#8B949E]";

function pickConfig(source: Record<string, unknown>): Config {
  const next = { ...EMPTY };
  for (const key of CONFIG_KEYS) {
    if (source[key] !== undefined) {
      // The API owns these shapes; the cast keeps this merge readable while the
      // server remains the validator.
      (next as unknown as Record<string, unknown>)[key] = source[key];
    }
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** The admin endpoint returns published fields at the top level. */
function normalizeState(body: Record<string, unknown>): AdminState {
  return {
    published: pickConfig(body),
    draft: isRecord(body.draft) ? pickConfig(body.draft) : null,
    draftSavedBy: typeof body.draftSavedBy === "string" ? body.draftSavedBy : null,
    draftSavedAt: typeof body.draftSavedAt === "string" ? body.draftSavedAt : null,
    featuredCandidates: Array.isArray(body.featuredCandidates) ? (body.featuredCandidates as Candidate[]) : [],
    discoveryCardHrefs: Array.isArray(body.discoveryCardHrefs) ? (body.discoveryCardHrefs as string[]) : [],
    discoveryImageOptions: Array.isArray(body.discoveryImageOptions)
      ? (body.discoveryImageOptions as Array<{ url: string; label: string }>)
      : []
  };
}

function mergeState(current: AdminState, body: Record<string, unknown>): AdminState {
  return {
    ...current,
    published: pickConfig(body),
    draft: isRecord(body.draft) ? pickConfig(body.draft) : null,
    draftSavedBy: typeof body.draftSavedBy === "string" ? body.draftSavedBy : null,
    draftSavedAt: typeof body.draftSavedAt === "string" ? body.draftSavedAt : null
  };
}

function formatSavedAt(value: string | null) {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function naira(priceKobo: string) {
  const amount = Number(priceKobo);
  if (!Number.isFinite(amount)) return "Price unavailable";
  return `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(amount / 100)}`;
}

export function AdminStorefrontPanel() {
  const [state, setState] = useState<AdminState | null>(null);
  const [form, setForm] = useState<Config | null>(null);
  const [orderText, setOrderText] = useState("");
  const [visibleText, setVisibleText] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function applyConfig(config: Config) {
    setForm(config);
    setOrderText((config.categoryOrder ?? []).join(", "));
    setVisibleText((config.visibleCategories ?? []).join(", "));
  }

  async function load() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/storefront", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not load storefront settings.");
      const next = normalizeState((body ?? {}) as Record<string, unknown>);
      setState(next);
      applyConfig(next.draft ?? next.published);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load storefront settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function update<K extends keyof Config>(key: K, value: Config[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateCard(index: number, patch: Partial<DiscoveryCard>) {
    setForm((current) => {
      if (!current) return current;
      const cards = current.discoveryCards.map((card, cardIndex) =>
        cardIndex === index ? { ...card, ...patch } : card
      );
      return { ...current, discoveryCards: normaliseCardOrder(cards) };
    });
  }

  function normaliseCardOrder(cards: DiscoveryCard[]) {
    return cards.map((card, index) => ({ ...card, sortOrder: index + 1 }));
  }

  function moveCard(index: number, delta: number) {
    setForm((current) => {
      if (!current) return current;
      const target = index + delta;
      if (target < 0 || target >= current.discoveryCards.length) return current;
      const cards = [...current.discoveryCards];
      [cards[index], cards[target]] = [cards[target], cards[index]];
      return { ...current, discoveryCards: normaliseCardOrder(cards) };
    });
  }

  function toggleFeatured(id: string) {
    setForm((current) => {
      if (!current) return current;
      const ids = current.africanFeaturedProductIds;
      if (ids.includes(id)) {
        return { ...current, africanFeaturedProductIds: ids.filter((entry) => entry !== id) };
      }
      if (ids.length >= MAX_FEATURED) return current;
      return { ...current, africanFeaturedProductIds: [...ids, id] };
    });
  }

  function moveFeatured(index: number, delta: number) {
    setForm((current) => {
      if (!current) return current;
      const target = index + delta;
      const ids = [...current.africanFeaturedProductIds];
      if (target < 0 || target >= ids.length) return current;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      return { ...current, africanFeaturedProductIds: ids };
    });
  }

  function payload(mode: "draft") {
    if (!form || !state) return null;
    return {
      ...form,
      categoryOrder: orderText.split(",").map((item) => item.trim()).filter(Boolean),
      visibleCategories: visibleText.split(",").map((item) => item.trim()).filter(Boolean),
      version: state.published.version,
      mode
    };
  }

  async function saveDraft() {
    if (!form || !state) return;
    const body = payload("draft");
    if (!body) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/storefront", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Could not save the draft.");
      const nextState = mergeState(state, (result ?? {}) as Record<string, unknown>);
      setState(nextState);
      if (nextState.draft) applyConfig(nextState.draft);
      setMessage("Draft saved. Visitors still see the published storefront until you publish.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the draft.");
    } finally {
      setBusy(false);
    }
  }

  async function publishDraft() {
    if (!state?.draft) return;
    if (!window.confirm("Publish this draft to every storefront visitor?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/storefront", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseVersion: state.published.version })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          result?.code === "version_conflict" || result?.code === "draft_stale"
            ? `${result.error} Reload before editing again.`
            : result?.error ?? "Could not publish the draft."
        );
      }
      const published = pickConfig((result ?? {}) as Record<string, unknown>);
      setState(mergeState(state, (result ?? {}) as Record<string, unknown>));
      applyConfig(published);
      setMessage("Published. The public storefront now serves this config.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not publish the draft.");
    } finally {
      setBusy(false);
    }
  }

  async function discardDraft() {
    if (!state?.draft) return;
    if (!window.confirm("Discard the saved draft? The published storefront is unchanged.")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/storefront?version=${encodeURIComponent(String(state.published.version))}`,
        { method: "DELETE" }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "Could not discard the draft.");
      const published = pickConfig((result ?? {}) as Record<string, unknown>);
      setState(mergeState(state, (result ?? {}) as Record<string, unknown>));
      applyConfig(published);
      setMessage("Draft discarded. The published storefront is unchanged.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not discard the draft.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section data-admin-storefront aria-busy="true" className="rounded-2xl border border-[#30363D] bg-[#161B22] p-4">
        <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Storefront controls</h2>
        <p className="mt-2 text-xs text-[#8B949E]">Loading storefront settings…</p>
      </section>
    );
  }

  if (!state || !form) {
    return (
      <section data-admin-storefront className="rounded-2xl border border-[#30363D] bg-[#161B22] p-4">
        <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Storefront controls</h2>
        <p role="alert" className="mt-2 rounded bg-crimson/10 p-2 text-xs font-bold text-crimson">
          {error || "Could not load storefront settings."}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 min-h-10 rounded-lg border border-[#30363D] bg-[#0B0E14] px-4 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D]"
        >
          Try again
        </button>
      </section>
    );
  }

  const candidates = state.featuredCandidates ?? [];
  const selectedIds = form.africanFeaturedProductIds ?? [];
  const imageOptions = state.discoveryImageOptions ?? [];
  const hrefOptions = state.discoveryCardHrefs ?? [];

  return (
    <section data-admin-storefront className="rounded-2xl border border-[#30363D] bg-[#161B22] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-extrabold text-[#F0F6FC]">Storefront controls</h2>
          <p className="text-xs text-[#8B949E]">
            Hero copy, announcement, departments, demo visibility and the African discovery section.
          </p>
        </div>
        <p className="rounded bg-[#0B0E14] px-2 py-1 text-[11px] font-bold text-[#8B949E]">
          Published v{state.published.version}
        </p>
      </div>

      <div
        role="status"
        data-draft-status
        aria-live="polite"
        className={`mt-3 rounded border px-3 py-2 text-[11px] font-bold ${
          state.draft
            ? "border-[#3d3418] bg-[#211a08] text-[#e3b341]"
            : "border-[#21262D] bg-[#0B0E14] text-[#8B949E]"
        }`}
      >
        {state.draft
          ? `Draft saved ${formatSavedAt(state.draftSavedAt)}. Visitors still see published v${state.published.version}.`
          : "No saved draft. Edits are local until you save a draft; nothing changes for visitors."}
      </div>

      {message ? (
        <p role="status" className="mt-2 rounded bg-[#00E676]/10 p-2 text-xs font-bold text-[#00E676]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 rounded bg-crimson/10 p-2 text-xs font-bold text-crimson">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2" data-storefront-actions>
        <button
          type="button"
          data-storefront-save-draft
          onClick={() => void saveDraft()}
          disabled={busy}
          className="min-h-10 rounded-lg bg-[#00E676] px-4 text-xs font-bold text-[#0B0E14] disabled:opacity-50"
        >
          {busy ? "Working…" : "Save draft"}
        </button>
        <button
          type="button"
          data-storefront-publish
          onClick={() => void publishDraft()}
          disabled={busy || !state.draft}
          className="min-h-10 rounded-lg bg-[#238636] px-4 text-xs font-bold text-white disabled:opacity-40"
        >
          Publish draft
        </button>
        <button
          type="button"
          data-storefront-discard
          onClick={() => void discardDraft()}
          disabled={busy || !state.draft}
          className="min-h-10 rounded-lg border border-[#30363D] bg-[#0B0E14] px-4 text-xs font-bold text-[#F0F6FC] disabled:opacity-40"
        >
          Discard draft
        </button>
        {state.draft ? (
          <a
            data-storefront-preview
            href="/naijashop?storefrontPreview=draft"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center rounded-lg border border-[#30363D] bg-[#0B0E14] px-4 text-xs font-bold text-[#F0F6FC] hover:bg-[#21262D]"
          >
            Preview draft
          </a>
        ) : (
          <span className="inline-flex min-h-10 items-center rounded-lg border border-[#21262D] px-4 text-xs font-bold text-[#6E7681]">
            Preview available after saving a draft
          </span>
        )}
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="min-h-10 rounded-lg border border-[#30363D] bg-[#0B0E14] px-4 text-xs font-bold text-[#F0F6FC] disabled:opacity-50"
        >
          Reload
        </button>
      </div>

      <fieldset className="mt-5 border-t border-[#21262D] pt-4">
        <legend className="px-1 text-xs font-extrabold uppercase tracking-wide text-[#8B949E]">Storefront basics</legend>
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          <label className={labelClass}>Announcement
            <input
              value={form.announcement}
              maxLength={200}
              onChange={(event) => update("announcement", event.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>Shelf item limit (1-8)
            <input
              type="number"
              min={1}
              max={8}
              value={form.shelfLimit}
              onChange={(event) => update("shelfLimit", Number(event.target.value))}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>Hero title
            <input
              value={form.heroTitle}
              maxLength={90}
              onChange={(event) => update("heroTitle", event.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>Hero subtitle
            <input
              value={form.heroSubtitle}
              maxLength={220}
              onChange={(event) => update("heroSubtitle", event.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>Visible department slugs (blank = all)
            <input
              value={visibleText}
              onChange={(event) => setVisibleText(event.target.value)}
              placeholder="phones-tablets, computers"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>Shelf order (slug, comma separated)
            <input
              value={orderText}
              onChange={(event) => setOrderText(event.target.value)}
              placeholder="computers, beauty, home-kitchen"
              className={inputClass}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold text-[#F0F6FC]">
          <label className="flex min-h-10 items-center gap-2">
            <input
              type="checkbox"
              checked={form.showDemoProducts}
              onChange={(event) => update("showDemoProducts", event.target.checked)}
            />
            Show demo inventory
          </label>
          <label className="flex min-h-10 items-center gap-2">
            <input type="checkbox" checked={form.showHero} onChange={(event) => update("showHero", event.target.checked)} />
            Show hero
          </label>
          <label className="flex min-h-10 items-center gap-2">
            <input type="checkbox" checked={form.showShelves} onChange={(event) => update("showShelves", event.target.checked)} />
            Show shelves
          </label>
        </div>
      </fieldset>

      <fieldset className="mt-5 border-t border-[#21262D] pt-4" data-admin-african-discovery>
        <legend className="px-1 text-xs font-extrabold uppercase tracking-wide text-[#8B949E]">
          African discovery section
        </legend>
        <label className="mt-2 flex min-h-10 items-center gap-2 text-xs font-bold text-[#F0F6FC]">
          <input
            type="checkbox"
            data-storefront-field="showAfricanDiscovery"
            checked={form.showAfricanDiscovery}
            onChange={(event) => update("showAfricanDiscovery", event.target.checked)}
          />
          Show the African discovery section on the public storefront
        </label>
        <p className="mt-1 text-[11px] leading-5 text-[#8B949E]">
          Disabling hides the section without deleting any config, listing or department row.
        </p>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <label className={labelClass}>Eyebrow (max 40)
            <input
              value={form.africanDiscoveryEyebrow}
              maxLength={40}
              data-storefront-field="africanDiscoveryEyebrow"
              onChange={(event) => update("africanDiscoveryEyebrow", event.target.value)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>Heading (max 90)
            <input
              value={form.africanDiscoveryTitle}
              maxLength={90}
              data-storefront-field="africanDiscoveryTitle"
              onChange={(event) => update("africanDiscoveryTitle", event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <label className={`${labelClass} mt-3 block`}>Intro (1–2 sentences, max 240)
          <textarea
            value={form.africanDiscoveryIntro}
            maxLength={240}
            rows={3}
            data-storefront-field="africanDiscoveryIntro"
            onChange={(event) => update("africanDiscoveryIntro", event.target.value)}
            className={inputClass}
          />
        </label>

        <h3 className="mt-5 text-xs font-extrabold text-[#F0F6FC]">Category links in the heading row</h3>
        <p className="mt-1 text-[11px] leading-5 text-[#8B949E]">
          Internal categories only. Links render as real HTML controls, never baked into an image.
        </p>
        <div className="mt-2 grid gap-2">
          {form.africanDiscoveryLinks.map((link, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <label className={labelClass}>Link {index + 1} label
                <input
                  value={link.label}
                  maxLength={40}
                  onChange={(event) =>
                    update(
                      "africanDiscoveryLinks",
                      form.africanDiscoveryLinks.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, label: event.target.value } : entry
                      )
                    )
                  }
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>Category path
                <input
                  value={link.href}
                  maxLength={200}
                  onChange={(event) =>
                    update(
                      "africanDiscoveryLinks",
                      form.africanDiscoveryLinks.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, href: event.target.value } : entry
                      )
                    )
                  }
                  placeholder="/naijashop/c/african-print-fabrics"
                  className={inputClass}
                />
              </label>
            </div>
          ))}
        </div>

        <h3 className="mt-5 text-xs font-extrabold text-[#F0F6FC]">Featured listings (up to {MAX_FEATURED})</h3>
        <p className="mt-1 text-[11px] leading-5 text-[#8B949E]">
          Only ACTIVE, non-sample listings in the approved African feature categories can be selected. No selection uses one
          listing from each approved category. Demo listings keep their DEMO badge.
        </p>

        <div className="mt-2">
          {selectedIds.length > 0 ? (
            <ol className="space-y-1.5" aria-label="Selected featured listings, in storefront order">
              {selectedIds.map((id, index) => {
                const candidate = candidates.find((entry) => entry.id === id);
                return (
                  <li key={id} className="flex min-h-11 items-center gap-2 rounded border border-[#30363D] bg-[#0B0E14] px-2 py-1">
                    <span className="w-5 shrink-0 text-center text-[11px] font-extrabold text-[#8B949E]">{index + 1}</span>
                    {candidate?.imageUrl ? (
                      <img src={candidate.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" loading="lazy" />
                    ) : (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-[#21262D] text-[10px] text-[#8B949E]">
                        ?
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-bold text-[#F0F6FC]">
                        {candidate?.name ?? "Unavailable listing"}
                      </span>
                      <span className="block truncate text-[10px] text-[#8B949E]">
                        {candidate ? `${candidate.categoryName} · ${naira(candidate.priceKobo)}` : "Remove it before publishing."}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Move ${candidate?.name ?? "listing"} up`}
                      onClick={() => moveFeatured(index, -1)}
                      disabled={index === 0}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded border border-[#30363D] text-xs font-bold text-[#F0F6FC] disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${candidate?.name ?? "listing"} down`}
                      onClick={() => moveFeatured(index, 1)}
                      disabled={index === selectedIds.length - 1}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded border border-[#30363D] text-xs font-bold text-[#F0F6FC] disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${candidate?.name ?? "listing"} from featured`}
                      onClick={() => toggleFeatured(id)}
                      className="min-h-10 shrink-0 rounded border border-[#30363D] px-2 text-[11px] font-bold text-[#F0F6FC]"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="rounded border border-[#21262D] bg-[#0B0E14] px-3 py-2 text-[11px] font-semibold text-[#8B949E]">
              No featured listings selected. The storefront uses the curated category fallback.
            </p>
          )}
        </div>

        <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto rounded border border-[#21262D] p-2">
          {candidates.length === 0 ? (
            <p className="p-2 text-[11px] text-[#8B949E]">
              No ACTIVE listing is eligible in the African feature categories right now.
            </p>
          ) : (
            candidates.map((candidate) => {
              const checked = selectedIds.includes(candidate.id);
              const atLimit = !checked && selectedIds.length >= MAX_FEATURED;
              return (
                <label
                  key={candidate.id}
                  className={`flex min-h-11 items-center gap-2 rounded px-2 py-1 ${
                    atLimit ? "opacity-50" : "hover:bg-[#21262D]"
                  }`}
                >
                  <input
                    type="checkbox"
                    data-featured-candidate={candidate.id}
                    checked={checked}
                    disabled={atLimit}
                    onChange={() => toggleFeatured(candidate.id)}
                  />
                  {candidate.imageUrl ? (
                    <img src={candidate.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" loading="lazy" />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-bold text-[#F0F6FC]">{candidate.name}</span>
                    <span className="block truncate text-[10px] text-[#8B949E]">
                      {candidate.categoryName} · {naira(candidate.priceKobo)}
                      {candidate.isDemo ? " · DEMO" : ""}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-extrabold text-[#F0F6FC]">Discovery cards</h3>
          <p className="text-[11px] text-[#8B949E]">Four image-led internal destinations. Order, copy and visibility are editable.</p>
        </div>
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          {form.discoveryCards.map((card, index) => (
            <div
              key={card.id}
              data-discovery-card-editor={card.id}
              className="rounded-xl border border-[#30363D] bg-[#0B0E14] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <label className="flex min-h-10 items-center gap-2 text-[11px] font-extrabold text-[#F0F6FC]">
                  <input
                    type="checkbox"
                    data-discovery-card-field="enabled"
                    checked={card.enabled}
                    onChange={(event) => updateCard(index, { enabled: event.target.checked })}
                  />
                  Card {index + 1}: {card.label || card.id}
                </label>
                <span className="flex gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${card.id} up`}
                    onClick={() => moveCard(index, -1)}
                    disabled={index === 0}
                    className="grid h-10 w-10 place-items-center rounded border border-[#30363D] text-xs font-bold text-[#F0F6FC] disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${card.id} down`}
                    onClick={() => moveCard(index, 1)}
                    disabled={index === form.discoveryCards.length - 1}
                    className="grid h-10 w-10 place-items-center rounded border border-[#30363D] text-xs font-bold text-[#F0F6FC] disabled:opacity-30"
                  >
                    ↓
                  </button>
                </span>
              </div>
              <div className="mt-2 grid gap-2">
                <label className={labelClass}>Label (max 40)
                  <input
                    value={card.label}
                    maxLength={40}
                    data-discovery-card-field="label"
                    onChange={(event) => updateCard(index, { label: event.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>Description (max 120)
                  <input
                    value={card.description}
                    maxLength={120}
                    data-discovery-card-field="description"
                    onChange={(event) => updateCard(index, { description: event.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>Destination
                  <select
                    value={card.href}
                    data-discovery-card-field="href"
                    onChange={(event) => updateCard(index, { href: event.target.value })}
                    className={inputClass}
                  >
                    {hrefOptions.map((href) => (
                      <option key={href} value={href}>
                        {href}
                      </option>
                    ))}
                    {!hrefOptions.includes(card.href) ? <option value={card.href}>{card.href}</option> : null}
                  </select>
                </label>
                <label className={labelClass}>Image
                  <select
                    value={card.imageUrl}
                    data-discovery-card-field="imageUrl"
                    onChange={(event) => updateCard(index, { imageUrl: event.target.value })}
                    className={inputClass}
                  >
                    {imageOptions.map((option) => (
                      <option key={option.url} value={option.url}>
                        {option.label}
                      </option>
                    ))}
                    {!imageOptions.some((option) => option.url === card.imageUrl) ? (
                      <option value={card.imageUrl}>{card.imageUrl}</option>
                    ) : null}
                  </select>
                </label>
                <label className={labelClass}>Image alt text (required)
                  <input
                    value={card.imageAlt}
                    maxLength={120}
                    data-discovery-card-field="imageAlt"
                    onChange={(event) => updateCard(index, { imageAlt: event.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <p className="mt-4 text-[11px] leading-5 text-[#8B949E]">
        Saving a draft never changes the public storefront. Publishing validates every listing, destination and image again,
        records an audit entry and increments the published version.
      </p>
    </section>
  );
}
