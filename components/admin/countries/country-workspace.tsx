"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Check,
  Globe2,
  Image as ImageIcon,
  Loader2,
  PackageSearch,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2
} from "lucide-react";

type EditorialStatus = "NEEDS_REVIEW" | "REVIEWED";
type PublicationStatus = "DRAFT" | "PUBLISHED";

type Source = {
  id: string;
  title: string;
  publisher: string | null;
  url: string;
  accessedAt: string;
};

type Theme = {
  id: string;
  key: string;
  label: string;
  association: string;
  imageUrl: string | null;
  imageAlt: string | null;
  imageKind: string | null;
  imageProvenance: string | null;
  sortOrder: number;
  editorialStatus: EditorialStatus;
  sources: Source[];
};

type Country = {
  code: string;
  slug: string;
  name: string;
  region: string;
  introduction: string;
  localizedNames: Record<string, string>;
  homeFeatured: boolean;
  sortOrder: number;
  editorialStatus: EditorialStatus;
  themes: Theme[];
  publicationStatus: PublicationStatus;
  publishedAt: string | null;
  publishedBy: string | null;
  themeCount: number;
  sourcedThemeCount: number;
  missingImageCount: number;
};

type OriginProduct = {
  id: string;
  name: string;
  slug: string;
  countryCode: string;
  status: string;
  isDemo: boolean;
  originCountryCode: string | null;
  originBasis: string | null;
  originNote: string | null;
  originVerifiedAt: string | null;
  vendor: { name: string; countryCode: string };
  category: { name: string; slug: string };
};

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
  actor: { name: string } | null;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `Request failed (${response.status}).`);
  return body as T;
}

function StatusPill({ status }: { status: PublicationStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-[0.1em] ${
        status === "PUBLISHED" ? "bg-[#e4f3e7] text-[#0b5c33]" : "bg-[#f1eee5] text-[#6b5a34]"
      }`}
    >
      {status === "PUBLISHED" ? <Check className="h-3 w-3" aria-hidden /> : null}
      {status}
    </span>
  );
}

export function CountryWorkspace({
  canRead,
  canWrite,
  canPublish,
  canOrigin
}: {
  canRead: boolean;
  canWrite: boolean;
  canPublish: boolean;
  canOrigin: boolean;
}) {
  const [tab, setTab] = useState<"countries" | "origin">("countries");
  const [countries, setCountries] = useState<Country[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState({ introduction: "", editorialStatus: "NEEDS_REVIEW" as EditorialStatus, homeFeatured: false, sortOrder: 0 });
  const [themeDrafts, setThemeDrafts] = useState<Record<string, { label: string; association: string; imageUrl: string; imageAlt: string; editorialStatus: EditorialStatus; sources: Array<{ title: string; publisher: string; url: string; accessedAt: string }> }>>({});
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [origins, setOrigins] = useState<OriginProduct[]>([]);
  const [originSearch, setOriginSearch] = useState("");
  const [originSelected, setOriginSelected] = useState("");
  const [originDraft, setOriginDraft] = useState({ originCountryCode: "", originBasis: "SELLER_DECLARED", originNote: "" });

  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError("");
    try {
      const rows = await request<Country[]>("/api/admin/country-discovery");
      setCountries(rows);
      setSelected((current) => current || rows[0]?.code || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Country profiles could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  const loadOrigins = useCallback(async () => {
    if (!canOrigin) return;
    try {
      const rows = await request<OriginProduct[]>("/api/admin/country-discovery/origin");
      setOrigins(rows);
      setOriginSelected((current) => current || rows[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Origin review rows could not be loaded.");
    }
  }, [canOrigin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === "origin" && origins.length === 0) void loadOrigins();
  }, [tab, origins.length, loadOrigins]);

  const current = useMemo(() => countries.find((country) => country.code === selected) ?? null, [countries, selected]);

  useEffect(() => {
    if (!current) return;
    setDraft({
      introduction: current.introduction,
      editorialStatus: current.editorialStatus,
      homeFeatured: current.homeFeatured,
      sortOrder: current.sortOrder
    });
    const next: typeof themeDrafts = {};
    for (const theme of current.themes) {
      next[theme.id] = {
        label: theme.label,
        association: theme.association,
        imageUrl: theme.imageUrl ?? "",
        imageAlt: theme.imageAlt ?? "",
        editorialStatus: theme.editorialStatus,
        sources: theme.sources.map((source) => ({
          title: source.title,
          publisher: source.publisher ?? "",
          url: source.url,
          accessedAt: source.accessedAt.slice(0, 10)
        }))
      };
    }
    setThemeDrafts(next);
    setAudit([]);
    void request<AuditRow[]>(`/api/admin/country-discovery/audit?code=${encodeURIComponent(current.code)}`)
      .then(setAudit)
      .catch(() => setAudit([]));
  }, [current?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const regions = useMemo(() => Array.from(new Set(countries.map((country) => country.region))), [countries]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return countries.filter((country) => {
      if (region !== "all" && country.region !== region) return false;
      if (!needle) return true;
      return `${country.name} ${country.code} ${country.region}`.toLowerCase().includes(needle);
    });
  }, [countries, region, search]);

  const selectedOrigin = useMemo(() => origins.find((product) => product.id === originSelected) ?? null, [origins, originSelected]);

  useEffect(() => {
    if (!selectedOrigin) return;
    setOriginDraft({
      originCountryCode: selectedOrigin.originCountryCode ?? "",
      originBasis: selectedOrigin.originBasis === "VERIFIED" ? "VERIFIED" : "SELLER_DECLARED",
      originNote: selectedOrigin.originNote ?? ""
    });
  }, [selectedOrigin?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveProfile = async () => {
    if (!current) return;
    setBusy("profile");
    setError("");
    setNotice("");
    try {
      const updated = await request<Country>("/api/admin/country-discovery", {
        method: "PATCH",
        body: JSON.stringify({ code: current.code, ...draft })
      });
      setCountries((rows) => rows.map((row) => (row.code === updated.code ? updated : row)));
      setNotice(`${current.name} editorial fields saved.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Country profile could not be saved.");
    } finally {
      setBusy("");
    }
  };

  const saveTheme = async (themeId: string) => {
    if (!current) return;
    const themeDraft = themeDrafts[themeId];
    if (!themeDraft) return;
    setBusy(themeId);
    setError("");
    setNotice("");
    try {
      const updated = await request<Country>("/api/admin/country-discovery/themes", {
        method: "PATCH",
        body: JSON.stringify({
          themeId,
          ...themeDraft,
          imageUrl: themeDraft.imageUrl || null,
          imageAlt: themeDraft.imageAlt || null,
          sources: themeDraft.sources.filter((source) => source.title.trim() && source.url.trim())
        })
      });
      setCountries((rows) => rows.map((row) => (row.code === updated.code ? updated : row)));
      setNotice("Theme and source records saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Theme could not be saved.");
    } finally {
      setBusy("");
    }
  };

  const publish = async (action: "publish" | "unpublish") => {
    if (!current) return;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const updated = await request<Country>("/api/admin/country-discovery", {
        method: "PATCH",
        body: JSON.stringify({ code: current.code, action })
      });
      setCountries((rows) => rows.map((row) => (row.code === updated.code ? updated : row)));
      setNotice(action === "publish" ? `${current.name} is published.` : `${current.name} is unpublished; its themes and origin listings are preserved.`);
      const logs = await request<AuditRow[]>(`/api/admin/country-discovery/audit?code=${encodeURIComponent(current.code)}`);
      setAudit(logs);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Publication action failed.");
    } finally {
      setBusy("");
    }
  };

  const saveOrigin = async () => {
    if (!selectedOrigin) return;
    setBusy("origin");
    setError("");
    setNotice("");
    try {
      const updated = await request<OriginProduct>("/api/admin/country-discovery/origin", {
        method: "PATCH",
        body: JSON.stringify({
          productId: selectedOrigin.id,
          originCountryCode: originDraft.originCountryCode || null,
          originBasis: originDraft.originCountryCode ? originDraft.originBasis : null,
          originNote: originDraft.originNote
        })
      });
      setOrigins((rows) => rows.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
      setNotice(`Origin record for ${selectedOrigin.name} saved.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Origin record could not be saved.");
    } finally {
      setBusy("");
    }
  };

  const filteredOrigins = useMemo(() => {
    const needle = originSearch.trim().toLowerCase();
    if (!needle) return origins;
    return origins.filter((product) =>
      `${product.name} ${product.vendor.name} ${product.countryCode} ${product.originCountryCode ?? ""} ${product.category.name}`
        .toLowerCase()
        .includes(needle)
    );
  }, [origins, originSearch]);

  if (!canRead) {
    return (
      <div className="rounded-2xl border border-[#e5dfcf] bg-[#fbf4e4] p-5 text-[12px] font-semibold text-[#6b4a00]">
        You do not have the <code>countries:editorial:read</code> permission.
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5 text-[#14241b]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.18em] text-[#8ed14b]">
            <Globe2 className="h-3.5 w-3.5" aria-hidden />
            Control Center · Discover Africa
          </p>
          <h1 className="mt-1 font-display text-[30px] font-extrabold tracking-tight text-white">Country discovery</h1>
          <p className="mt-1 max-w-3xl text-[11.5px] leading-6 text-[#b9cbb4]">
            Editorial intros, themes, sources and publication. Country guides are separate from marketplace availability; origin evidence is a separate
            capability and is never inferred from seller location.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void load();
              if (tab === "origin") void loadOrigins();
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#c7d7c2] bg-white px-3 text-[10.5px] font-extrabold text-[#0b5c33] hover:bg-[#eef5eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh
          </button>
          <Link
            href="/naijashop/countries"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#f5b52e] px-3 text-[10.5px] font-extrabold text-[#14241b] hover:bg-[#ffd15e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Public directory
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </header>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#e6c9c5] bg-[#fbefed] px-3 py-2 text-[11px] font-semibold text-[#8a1c14]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-xl border border-[#cfe3d3] bg-[#eef7ef] px-3 py-2 text-[11px] font-semibold text-[#0b5c33]">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-[#e2e9de] pb-2">
        <button
          type="button"
          onClick={() => setTab("countries")}
          aria-pressed={tab === "countries"}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] ${
            tab === "countries" ? "bg-[#07351f] text-white" : "border border-[#c7d7c2] bg-white text-[#0b5c33]"
          }`}
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          Country guides ({countries.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("origin")}
          aria-pressed={tab === "origin"}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] ${
            tab === "origin" ? "bg-[#07351f] text-white" : "border border-[#c7d7c2] bg-white text-[#0b5c33]"
          }`}
        >
          <PackageSearch className="h-3.5 w-3.5" aria-hidden />
          Origin evidence ({origins.length || "—"})
        </button>
        {tab === "countries" ? (
          <span className="ml-auto self-center text-[10px] font-semibold text-[#b9cbb4]">
            {countries.filter((country) => country.publicationStatus === "PUBLISHED").length} published ·{" "}
            {countries.reduce((sum, country) => sum + country.themeCount, 0)} themes ·{" "}
            {countries.reduce((sum, country) => sum + country.sourcedThemeCount, 0)} sourced
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-[#dfe8dc] bg-white p-6 text-[12px] font-semibold text-[#566359]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading country records…
        </div>
      ) : tab === "countries" ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="min-w-0 rounded-2xl border border-[#dfe8dc] bg-white p-3">
            <label htmlFor="admin-country-search" className="text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-[#566359]">
              Find a country
            </label>
            <div className="mt-1 flex h-9 items-center gap-2 rounded-full border border-[#c7d7c2] px-2.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-[#566359]" aria-hidden />
              <input
                id="admin-country-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, code or region"
                className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold outline-none"
              />
            </div>
            <select
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              aria-label="Filter by region"
              className="mt-2 h-9 w-full rounded-full border border-[#c7d7c2] bg-white px-3 text-[10.5px] font-bold text-[#0b5c33]"
            >
              <option value="all">All regions</option>
              {regions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <ul className="mt-2 max-h-[680px] space-y-1 overflow-y-auto pr-1">
              {filtered.map((country) => (
                <li key={country.code}>
                  <button
                    type="button"
                    onClick={() => setSelected(country.code)}
                    aria-current={country.code === selected ? "true" : undefined}
                    className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] ${
                      country.code === selected ? "bg-[#eef5eb]" : "hover:bg-[#f7faf4]"
                    }`}
                  >
                    <img src={`/flags/${country.code.toLowerCase()}.svg`} alt="" width={28} height={20} className="h-5 w-7 rounded-[2px] border border-black/10 object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-extrabold text-[#14241b]">{country.name}</span>
                      <span className="block truncate text-[9px] font-semibold text-[#566359]">
                        {country.code} · {country.publicationStatus.toLowerCase()} · {country.sourcedThemeCount}/{country.themeCount}
                      </span>
                    </span>
                    {country.missingImageCount > 0 ? <AlertTriangle className="h-3 w-3 shrink-0 text-[#b45309]" aria-hidden /> : null}
                  </button>
                </li>
              ))}
            </ul>
            {filtered.length === 0 ? <p className="mt-2 text-[10.5px] text-[#566359]">No country matches this filter.</p> : null}
          </aside>

          {current ? (
            <div className="min-w-0 space-y-4">
              <section className="rounded-2xl border border-[#dfe8dc] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <img src={`/flags/${current.code.toLowerCase()}.svg`} alt={`Flag of ${current.name}`} width={48} height={32} className="h-8 w-12 rounded-[3px] border border-black/10 object-cover" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[20px] font-extrabold leading-tight">{current.name}</h2>
                        <StatusPill status={current.publicationStatus} />
                      </div>
                      <p className="mt-0.5 text-[10px] font-semibold text-[#566359]">
                        {current.code} · {current.region} · {current.slug}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/naijashop/countries/${current.slug}${current.publicationStatus === "DRAFT" ? "?preview=1" : ""}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1 rounded-full border border-[#c7d7c2] px-3 text-[10px] font-extrabold text-[#0b5c33] hover:bg-[#eef5eb]"
                    >
                      Preview
                      <ArrowUpRight className="h-3 w-3" aria-hidden />
                    </Link>
                    {current.publicationStatus === "PUBLISHED" ? (
                      <button
                        type="button"
                        onClick={() => void publish("unpublish")}
                        disabled={!canPublish || busy === "unpublish"}
                        className="inline-flex h-8 items-center gap-1 rounded-full border border-[#e0b8b2] px-3 text-[10px] font-extrabold text-[#8a1c14] hover:bg-[#fbefed] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busy === "unpublish" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                        Unpublish
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void publish("publish")}
                        disabled={!canPublish || busy === "publish"}
                        className="inline-flex h-8 items-center gap-1 rounded-full bg-[#07351f] px-3 text-[10px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busy === "publish" ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}
                        Publish
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <label className="block min-w-0">
                    <span className="text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-[#566359]">Introduction</span>
                    <textarea
                      value={draft.introduction}
                      onChange={(event) => setDraft((value) => ({ ...value, introduction: event.target.value }))}
                      rows={5}
                      className="mt-1 w-full rounded-xl border border-[#c7d7c2] bg-[#fbfdf9] p-2.5 text-[11px] leading-5 outline-none focus:ring-2 focus:ring-[#0b5c33]"
                    />
                    <span className="mt-1 block text-[9px] text-[#6a7a6e]">{draft.introduction.trim().length} characters · 80–1200 required</span>
                  </label>
                  <div className="space-y-2">
                    <label className="block">
                      <span className="text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-[#566359]">Editorial status</span>
                      <select
                        value={draft.editorialStatus}
                        onChange={(event) => setDraft((value) => ({ ...value, editorialStatus: event.target.value as EditorialStatus }))}
                        className="mt-1 h-9 w-full rounded-lg border border-[#c7d7c2] bg-white px-2 text-[11px] font-semibold"
                      >
                        <option value="NEEDS_REVIEW">Needs review</option>
                        <option value="REVIEWED">Reviewed</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border border-[#e2e9de] bg-[#f7faf4] px-2.5 py-2 text-[10.5px] font-bold">
                      <input
                        type="checkbox"
                        checked={draft.homeFeatured}
                        onChange={(event) => setDraft((value) => ({ ...value, homeFeatured: event.target.checked }))}
                      />
                      Feature at the start of the row
                    </label>
                    <label className="block">
                      <span className="text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-[#566359]">Order</span>
                      <input
                        type="number"
                        min={0}
                        max={10000}
                        value={draft.sortOrder}
                        onChange={(event) => setDraft((value) => ({ ...value, sortOrder: Number(event.target.value) }))}
                        className="mt-1 h-9 w-full rounded-lg border border-[#c7d7c2] bg-white px-2 text-[11px] font-semibold"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void saveProfile()}
                      disabled={!canWrite || busy === "profile"}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-[#0b5c33] px-3 text-[10.5px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy === "profile" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
                      Save editorial fields
                    </button>
                  </div>
                </div>
                {!canWrite ? <p className="mt-2 text-[10px] font-semibold text-[#8a1c14]">Read-only: countries:editorial:write is required to edit.</p> : null}
                {!canPublish ? <p className="mt-1 text-[10px] font-semibold text-[#8a6a00]">Publish/unpublish requires countries:editorial:publish.</p> : null}
              </section>

              <section className="rounded-2xl border border-[#dfe8dc] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[14px] font-extrabold">Known-for themes</h3>
                    <p className="text-[10px] text-[#566359]">Six themes are required to publish. Each needs a source and image with alt text.</p>
                  </div>
                  <span className="rounded-full bg-[#eef5eb] px-2.5 py-1 text-[9.5px] font-extrabold text-[#0b5c33]">
                    {current.sourcedThemeCount}/{current.themeCount} sourced · {current.themeCount - current.missingImageCount}/{current.themeCount} with images
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {current.themes.map((theme) => {
                    const value = themeDrafts[theme.id];
                    if (!value) return null;
                    return (
                      <article key={theme.id} className="rounded-xl border border-[#e2e9de] bg-[#fbfdf9] p-3">
                        <div className="grid gap-2 sm:grid-cols-[88px_minmax(0,1fr)]">
                          <div className="overflow-hidden rounded-lg border border-[#e2e9de] bg-white">
                            {value.imageUrl ? (
                              <img src={value.imageUrl} alt="" className="aspect-square h-auto w-full object-cover" />
                            ) : (
                              <span className="grid aspect-square place-items-center text-[9px] font-bold text-[#8a1c14]">
                                <ImageIcon className="h-4 w-4" aria-hidden />
                                Missing
                              </span>
                            )}
                          </div>
                          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                            <label className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#566359]">
                              Label
                              <input
                                value={value.label}
                                onChange={(event) =>
                                  setThemeDrafts((drafts) => ({ ...drafts, [theme.id]: { ...value, label: event.target.value } }))
                                }
                                className="mt-0.5 h-8 w-full rounded-md border border-[#c7d7c2] bg-white px-2 text-[10.5px] font-semibold normal-case tracking-normal"
                              />
                            </label>
                            <label className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#566359]">
                              Review
                              <select
                                value={value.editorialStatus}
                                onChange={(event) =>
                                  setThemeDrafts((drafts) => ({
                                    ...drafts,
                                    [theme.id]: { ...value, editorialStatus: event.target.value as EditorialStatus }
                                  }))
                                }
                                className="mt-0.5 h-8 w-full rounded-md border border-[#c7d7c2] bg-white px-2 text-[10.5px] font-semibold normal-case tracking-normal"
                              >
                                <option value="NEEDS_REVIEW">Needs review</option>
                                <option value="REVIEWED">Reviewed</option>
                              </select>
                            </label>
                            <label className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#566359] sm:col-span-2">
                              Association
                              <textarea
                                value={value.association}
                                rows={2}
                                onChange={(event) =>
                                  setThemeDrafts((drafts) => ({ ...drafts, [theme.id]: { ...value, association: event.target.value } }))
                                }
                                className="mt-0.5 w-full rounded-md border border-[#c7d7c2] bg-white p-2 text-[10.5px] font-normal leading-5 normal-case tracking-normal"
                              />
                            </label>
                            <label className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#566359]">
                              Image path
                              <input
                                value={value.imageUrl}
                                onChange={(event) =>
                                  setThemeDrafts((drafts) => ({ ...drafts, [theme.id]: { ...value, imageUrl: event.target.value } }))
                                }
                                placeholder="/generated/…"
                                className="mt-0.5 h-8 w-full rounded-md border border-[#c7d7c2] bg-white px-2 text-[10px] font-mono normal-case tracking-normal"
                              />
                            </label>
                            <label className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#566359]">
                              Image alt
                              <input
                                value={value.imageAlt}
                                onChange={(event) =>
                                  setThemeDrafts((drafts) => ({ ...drafts, [theme.id]: { ...value, imageAlt: event.target.value } }))
                                }
                                className="mt-0.5 h-8 w-full rounded-md border border-[#c7d7c2] bg-white px-2 text-[10.5px] font-semibold normal-case tracking-normal"
                              />
                            </label>
                          </div>
                        </div>

                        <div className="mt-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#566359]">Sources ({value.sources.length})</p>
                            <button
                              type="button"
                              onClick={() =>
                                setThemeDrafts((drafts) => ({
                                  ...drafts,
                                  [theme.id]: {
                                    ...value,
                                    sources: [...value.sources, { title: "", publisher: "", url: "", accessedAt: new Date().toISOString().slice(0, 10) }]
                                  }
                                }))
                              }
                              className="inline-flex items-center gap-0.5 text-[9px] font-extrabold text-[#0b5c33] hover:underline"
                            >
                              <Plus className="h-2.5 w-2.5" aria-hidden />
                              Add source
                            </button>
                          </div>
                          <ul className="mt-1 space-y-1">
                            {value.sources.map((source, index) => (
                              <li key={index} className="grid gap-1 rounded-lg border border-[#e2e9de] bg-white p-1.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_130px_auto]">
                                <input
                                  aria-label={`Source ${index + 1} title`}
                                  value={source.title}
                                  onChange={(event) =>
                                    setThemeDrafts((drafts) => {
                                      const next = [...value.sources];
                                      next[index] = { ...source, title: event.target.value };
                                      return { ...drafts, [theme.id]: { ...value, sources: next } };
                                    })
                                  }
                                  placeholder="Source title"
                                  className="h-8 min-w-0 rounded-md border border-[#d9e3d6] px-2 text-[10px] font-semibold"
                                />
                                <input
                                  aria-label={`Source ${index + 1} URL`}
                                  value={source.url}
                                  onChange={(event) =>
                                    setThemeDrafts((drafts) => {
                                      const next = [...value.sources];
                                      next[index] = { ...source, url: event.target.value };
                                      return { ...drafts, [theme.id]: { ...value, sources: next } };
                                    })
                                  }
                                  placeholder="https://…"
                                  className="h-8 min-w-0 rounded-md border border-[#d9e3d6] px-2 text-[10px] font-mono"
                                />
                                <input
                                  aria-label={`Source ${index + 1} access date`}
                                  type="date"
                                  value={source.accessedAt}
                                  onChange={(event) =>
                                    setThemeDrafts((drafts) => {
                                      const next = [...value.sources];
                                      next[index] = { ...source, accessedAt: event.target.value };
                                      return { ...drafts, [theme.id]: { ...value, sources: next } };
                                    })
                                  }
                                  className="h-8 min-w-0 rounded-md border border-[#d9e3d6] px-1.5 text-[10px] font-semibold"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setThemeDrafts((drafts) => ({
                                      ...drafts,
                                      [theme.id]: { ...value, sources: value.sources.filter((_, sourceIndex) => sourceIndex !== index) }
                                    }))
                                  }
                                  aria-label={`Remove source ${index + 1}`}
                                  className="grid h-8 w-8 place-items-center rounded-md text-[#8a1c14] hover:bg-[#fbefed]"
                                >
                                  <Trash2 className="h-3 w-3" aria-hidden />
                                </button>
                              </li>
                            ))}
                          </ul>
                          {value.sources.length === 0 ? <p className="mt-1 text-[9.5px] font-semibold text-[#8a1c14]">No source: publication is blocked.</p> : null}
                        </div>
                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => void saveTheme(theme.id)}
                            disabled={!canWrite || busy === theme.id}
                            className="inline-flex h-8 items-center gap-1 rounded-full bg-[#0b5c33] px-3 text-[9.5px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {busy === theme.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Save className="h-3 w-3" aria-hidden />}
                            Save theme
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-2xl border border-[#dfe8dc] bg-white p-4">
                <h3 className="text-[13px] font-extrabold">Audit history</h3>
                <p className="text-[10px] text-[#566359]">Latest editorial and publication actions for this country. Origin edits are recorded separately.</p>
                {audit.length > 0 ? (
                  <ul tabIndex={0} aria-label="Country audit history" className="mt-2 max-h-64 space-y-1 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ed14b]">
                    {audit.map((row) => (
                      <li key={row.id} className="rounded-lg border border-[#eef2ea] px-2.5 py-1.5 text-[9.5px]">
                        <span className="font-extrabold text-[#14241b]">{row.action}</span>
                        <span className="text-[#566359]"> · {row.actor?.name ?? "System"} · {new Date(row.createdAt).toLocaleString()}</span>
                        {row.metadata ? <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap break-all text-[8.5px] text-[#6a7a6e]">{JSON.stringify(row.metadata)}</pre> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[10.5px] text-[#566359]">No recorded editorial audit rows for this country yet.</p>
                )}
              </section>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#dfe8dc] bg-white p-6 text-[12px] text-[#566359]">Select a country to edit it.</div>
          )}
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <section className="min-w-0 rounded-2xl border border-[#dfe8dc] bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-extrabold">Product origin records</h2>
              <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#566359]">{origins.length} rows</span>
            </div>
            <div className="mt-2 flex h-9 items-center gap-2 rounded-full border border-[#c7d7c2] px-2.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-[#566359]" aria-hidden />
              <input
                type="search"
                value={originSearch}
                onChange={(event) => setOriginSearch(event.target.value)}
                placeholder="Product, seller, country"
                aria-label="Search origin products"
                className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold outline-none"
              />
            </div>
            {!canOrigin ? (
              <p className="mt-2 rounded-lg border border-[#e5dfcf] bg-[#fbf4e4] p-2 text-[10px] font-semibold text-[#6b4a00]">
                You can see this tab only with countries:origin:review. Seller location is never used as an origin substitute.
              </p>
            ) : null}
            <ul className="mt-2 max-h-[720px] space-y-1 overflow-y-auto pr-1">
              {filteredOrigins.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => setOriginSelected(product.id)}
                    aria-current={product.id === originSelected ? "true" : undefined}
                    className={`w-full rounded-xl px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5c33] ${
                      product.id === originSelected ? "bg-[#eef5eb]" : "hover:bg-[#f7faf4]"
                    }`}
                  >
                    <span className="block truncate text-[10.5px] font-extrabold">{product.name}</span>
                    <span className="block truncate text-[9px] font-semibold text-[#566359]">
                      Sold by {product.vendor.name} · {product.countryCode} · {product.category.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[9px] font-bold text-[#0b5c33]">
                      {product.originCountryCode ? `${product.originCountryCode} · ${product.originBasis}` : "Origin not recorded"}
                      {product.isDemo ? " · DEMO" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="min-w-0 rounded-2xl border border-[#dfe8dc] bg-white p-4">
            {selectedOrigin ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="break-words text-[16px] font-extrabold">{selectedOrigin.name}</h2>
                    <p className="text-[10px] font-semibold text-[#566359]">
                      Seller: {selectedOrigin.vendor.name} ({selectedOrigin.vendor.countryCode}) · fulfilment market: {selectedOrigin.countryCode} ·{" "}
                      {selectedOrigin.category.name}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#eef5eb] px-2.5 py-1 text-[9px] font-extrabold text-[#0b5c33]">
                    <ShieldCheck className="h-3 w-3" aria-hidden />
                    {selectedOrigin.originBasis ?? "Unrecorded"}
                  </span>
                </div>
                <div className="mt-3 rounded-xl border border-[#e5dfcf] bg-[#fbf4e4] p-3 text-[10px] leading-5 text-[#6b4a00]">
                  Seller location is not evidence of origin. A Ghanaian seller may sell goods made elsewhere. Record only a seller declaration or an
                  operator-verified origin with a written evidence note.
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-[#566359]">
                    Origin country
                    <select
                      value={originDraft.originCountryCode}
                      onChange={(event) => setOriginDraft((value) => ({ ...value, originCountryCode: event.target.value }))}
                      className="mt-1 h-9 w-full rounded-lg border border-[#c7d7c2] bg-white px-2 text-[11px] font-semibold normal-case tracking-normal"
                    >
                      <option value="">Not recorded</option>
                      {countries.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name} ({country.code})
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-[#566359]">
                    <legend>Evidence basis</legend>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {(["SELLER_DECLARED", "VERIFIED"] as const).map((basis) => (
                        <label
                          key={basis}
                          className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[10px] font-extrabold normal-case tracking-normal ${
                            originDraft.originBasis === basis ? "border-[#0b5c33] bg-[#eef5eb] text-[#0b5c33]" : "border-[#c7d7c2] bg-white text-[#566359]"
                          }`}
                        >
                          <input
                            type="radio"
                            name="origin-basis"
                            value={basis}
                            checked={originDraft.originBasis === basis}
                            onChange={() => setOriginDraft((value) => ({ ...value, originBasis: basis }))}
                          />
                          {basis === "VERIFIED" ? "Independently verified" : "Seller-declared"}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-[#566359] sm:col-span-2">
                    Evidence note
                    <textarea
                      value={originDraft.originNote}
                      onChange={(event) => setOriginDraft((value) => ({ ...value, originNote: event.target.value }))}
                      rows={4}
                      placeholder="What evidence supports this origin? Verified origin requires at least 20 characters."
                      className="mt-1 w-full rounded-lg border border-[#c7d7c2] bg-[#fbfdf9] p-2 text-[11px] normal-case tracking-normal outline-none focus:ring-2 focus:ring-[#0b5c33]"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void saveOrigin()}
                    disabled={!canOrigin || busy === "origin"}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#07351f] px-4 text-[10.5px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy === "origin" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
                    Save origin record
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOriginDraft({ originCountryCode: "", originBasis: "SELLER_DECLARED", originNote: "" });
                    }}
                    className="inline-flex h-9 items-center rounded-full border border-[#e0b8b2] px-3 text-[10px] font-extrabold text-[#8a1c14] hover:bg-[#fbefed]"
                  >
                    Clear form
                  </button>
                  <span className="text-[9.5px] font-semibold text-[#566359]">
                    {selectedOrigin.originVerifiedAt ? `Verified ${new Date(selectedOrigin.originVerifiedAt).toLocaleDateString()}` : "No verification timestamp"}
                  </span>
                </div>
                <p className="mt-3 text-[9.5px] leading-4 text-[#566359]">
                  This form does not edit seller identity, stock, price, publication or delivery. Those remain in Catalogue and Seller workflows.
                </p>
              </>
            ) : (
              <div className="rounded-xl border border-[#e5dfcf] bg-[#fbf4e4] p-4 text-[11px] leading-5 text-[#6b4a00]">
                No product is selected. {canOrigin ? "Choose a row on the left." : "You need countries:origin:review to record evidence."}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
