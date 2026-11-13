"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Globe2,
  History,
  Layers,
  Loader2,
  MapPin,
  Power,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Trash2
} from "lucide-react";

type ActivationStatus = "DISABLED" | "PREVIEW" | "LIVE";
type ScopeType = "GLOBAL" | "COUNTRY" | "CITY";

type Effective = {
  status: ActivationStatus;
  scope: ScopeType | "REGISTRY";
  scopeLabel: string;
  countryCode: string | null;
  cityCode: string | null;
  reason: string | null;
  source: "database" | "registry";
  rowId: string | null;
  globalOverrideActive: boolean;
  localOverrideIgnored: boolean;
  rules: Array<{
    id: string | null;
    scopeType: ScopeType;
    scopeLabel: string;
    status: ActivationStatus;
    reason: string | null;
    responsible: boolean;
    ignored: boolean;
  }>;
};

type ActivationRow = {
  id: string;
  scopeType: ScopeType;
  countryCode: string;
  cityCode: string;
  status: ActivationStatus;
  reason: string | null;
  updatedAt: string;
};

type Control = {
  key: string;
  name: string;
  publicLabel: string;
  href: string;
  registryStatus: string;
  defaultStatus: ActivationStatus;
  enforcement: { wired: boolean; state: "ENFORCED" | "NOT_WIRED"; summary: string; points: string[] };
  effective: Effective;
  rows: ActivationRow[];
  countries: Array<{ countryCode: string; countryName: string; effective: Effective }>;
  cities: Array<{
    countryCode: string;
    countryName: string;
    city: string;
    cityCode: string;
    effective: Effective;
  }>;
  impact: {
    productsActive: number | null;
    vendorsVerified: number | null;
    openOrders: number | null;
    note: string;
  } | null;
};

type AuditEntry = {
  id: string;
  action: string;
  actorName: string | null;
  actorId: string | null;
  entityId: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

type Snapshot = {
  generatedAt: string;
  verticals: Control[];
  countries: Array<{ code: string; name: string; currency: string }>;
  cities: Record<string, Array<{ city: string; cityCode: string }>>;
  audit: AuditEntry[];
};

const STATUS_STYLE: Record<ActivationStatus, string> = {
  LIVE: "bg-[#00E676]/15 text-[#00E676] ring-[#00E676]/30",
  PREVIEW: "bg-[#E3B341]/15 text-[#E3B341] ring-[#E3B341]/30",
  DISABLED: "bg-[#F85149]/15 text-[#FF7B72] ring-[#F85149]/30"
};

function StatusBadge({ status, small = false }: { status: ActivationStatus; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 ring-1 ${STATUS_STYLE[status]} ${
        small ? "py-0.5 text-[10px]" : "py-1 text-[11px]"
      } font-extrabold uppercase tracking-wide`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {status === "DISABLED" ? "Disabled" : status === "PREVIEW" ? "Preview" : "Live"}
    </span>
  );
}

function sourceLabel(effective: Effective) {
  if (effective.source === "registry") return "Registry default";
  if (effective.scope === "GLOBAL") return "GLOBAL rule";
  if (effective.scope === "COUNTRY") return "Country rule";
  if (effective.scope === "CITY") return "City rule";
  return effective.scope;
}

function ariaStatus(effective: Effective) {
  return `${effective.status} via ${sourceLabel(effective)}${effective.reason ? `. Reason: ${effective.reason}` : ""}`;
}

function emptyReasonError(value: string) {
  return value.trim().length < 3 ? "Record a reason of at least 3 characters before saving." : "";
}

function dateLabel(value: string) {
  try {
    return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function VerticalActivationWorkspace({ canWrite }: { canWrite: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedKey, setSelectedKey] = useState("shop");
  const [scopeType, setScopeType] = useState<ScopeType>("GLOBAL");
  const [countryCode, setCountryCode] = useState("NG");
  const [cityCode, setCityCode] = useState("lagos");
  const [status, setStatus] = useState<ActivationStatus>("LIVE");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setLoadError("");
    try {
      const response = await fetch("/api/admin/verticals", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || `Could not load service activation (HTTP ${response.status}).`);
      }
      setSnapshot(body as Snapshot);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load service activation.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const selected = useMemo(
    () => snapshot?.verticals.find((vertical) => vertical.key === selectedKey) ?? snapshot?.verticals[0] ?? null,
    [snapshot, selectedKey]
  );

  const currentEffective = useMemo(() => {
    if (!selected) return null;
    if (scopeType === "GLOBAL") return selected.effective;
    if (scopeType === "COUNTRY") {
      return selected.countries.find((entry) => entry.countryCode === countryCode)?.effective ?? selected.effective;
    }
    return (
      selected.cities.find((entry) => entry.countryCode === countryCode && entry.cityCode === cityCode)?.effective ??
      selected.effective
    );
  }, [selected, scopeType, countryCode, cityCode]);

  const existingRow = useMemo(() => {
    if (!selected) return null;
    return (
      selected.rows.find(
        (row) =>
          row.scopeType === scopeType &&
          (scopeType === "GLOBAL" || row.countryCode === countryCode) &&
          (scopeType !== "CITY" || row.cityCode === cityCode)
      ) ?? null
    );
  }, [selected, scopeType, countryCode, cityCode]);

  // Seed the editor from the effective state whenever the target scope changes.
  useEffect(() => {
    if (!currentEffective) return;
    setStatus(currentEffective.status);
    setReason("");
    setActionError("");
  }, [currentEffective?.status, currentEffective?.scope, currentEffective?.rowId, currentEffective]);

  useEffect(() => {
    setNotice("");
  }, [selectedKey, scopeType, countryCode, cityCode]);

  const shops = snapshot?.verticals.find((vertical) => vertical.key === "shop");
  const cityOptions = snapshot?.cities[countryCode] ?? [];
  const reasonError = emptyReasonError(reason);
  const saveDisabled = !canWrite || !selected || Boolean(reasonError) || saving;

  async function submit(method: "PATCH" | "DELETE") {
    if (!selected) return;
    setSaving(true);
    setActionError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/verticals/${encodeURIComponent(selected.key)}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType,
          ...(scopeType === "GLOBAL" ? {} : { countryCode }),
          ...(scopeType === "CITY" ? { cityCode } : {}),
          ...(method === "PATCH" ? { status } : {}),
          reason
        })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || `The change failed (HTTP ${response.status}).`);
      }
      const scopeLabel =
        scopeType === "GLOBAL"
          ? "all locations (GLOBAL override)"
          : scopeType === "COUNTRY"
            ? `${countryCode} (country override)`
            : `${cityCode}, ${countryCode} (city override)`;
      setNotice(
        method === "PATCH"
          ? `${selected.publicLabel} is now ${status} for ${scopeLabel}. The change is audited.`
          : `The ${scopeType.toLowerCase()} rule for ${selected.publicLabel} was cleared; the scope now inherits its next rule.`
      );
      setReason("");
      await load("refresh");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The change failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-[#21262D] bg-[#161B22] p-8">
        <p className="flex items-center gap-3 text-sm font-semibold text-[#8B949E]" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-[#00E676]" aria-hidden="true" />
          Loading service activation…
        </p>
      </div>
    );
  }

  if (loadError || !snapshot) {
    return (
      <div role="alert" className="rounded-2xl border border-[#7A2324] bg-[#2B1416] p-5 text-[#FFB3AD]">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-display text-lg font-extrabold text-[#F0F6FC]">Service activation is unavailable</p>
            <p className="mt-1 text-sm">{loadError || "The activation snapshot could not be loaded."}</p>
            <button
              type="button"
              onClick={() => void load("refresh")}
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#7A2324] px-3 text-sm font-bold text-[#F0F6FC] hover:bg-[#3A1A1C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[#8B949E]" role="status">
          Snapshot {dateLabel(snapshot.generatedAt)} · {snapshot.verticals.length} services
        </p>
        <button
          type="button"
          onClick={() => void load("refresh")}
          disabled={refreshing}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#30363D] px-3 text-sm font-bold text-[#F0F6FC] transition hover:border-[#00E676]/50 hover:text-[#00E676] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {!canWrite ? (
        <div role="note" className="flex items-start gap-3 rounded-2xl border border-[#30363D] bg-[#161B22] p-4 text-sm text-[#8B949E]">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#E3B341]" aria-hidden="true" />
          <p>
            Read-only. Changing activation requires the super-administrator <code className="text-[#F0F6FC]">verticals:write</code>{" "}
            permission. The server rejects an unauthorized change with 403 even if this notice is bypassed.
          </p>
        </div>
      ) : (
        <div role="note" className="flex items-start gap-3 rounded-2xl border border-[#1F6F43] bg-[#0D2818] p-4 text-sm text-[#9BE9BC]">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#00E676]" aria-hidden="true" />
          <p>
            The most restrictive applicable rule decides. A GLOBAL or country rule can restrict every location below
            it; a city rule can restrict further but can never loosen a stricter parent. Reason and before/after state
            are audited for every change. Only services marked <strong>Enforced</strong> accept activation rules today.
          </p>
        </div>
      )}

      {shops?.impact ? (
        <section aria-labelledby="impact-heading" className="rounded-2xl border border-[#21262D] bg-[#161B22] p-4 sm:p-5">
          <h2 id="impact-heading" className="flex items-center gap-2 font-display text-base font-extrabold text-[#F0F6FC]">
            <Layers className="h-4 w-4 text-[#00E676]" aria-hidden="true" /> Impact if Shop is paused
          </h2>
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ["Public listings", shops.impact.productsActive],
              ["Verified sellers", shops.impact.vendorsVerified],
              ["Open orders", shops.impact.openOrders]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-[#21262D] bg-[#0B0E14] p-3">
                <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8B949E]">{label}</dt>
                <dd className="mt-1 text-xl font-extrabold text-[#F0F6FC]">{value === null ? "Unavailable" : Number(value).toLocaleString("en-NG")}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11.5px] leading-relaxed text-[#8B949E]">{shops.impact.note}</p>
        </section>
      ) : null}

      {notice ? (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-[#1F6F43] bg-[#0D2818] p-3 text-sm text-[#9BE9BC]">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {notice}
        </div>
      ) : null}
      {actionError ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#7A2324] bg-[#2B1416] p-3 text-sm text-[#FFB3AD]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {actionError}
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section aria-labelledby="vertical-list-heading" className="min-w-0 rounded-2xl border border-[#21262D] bg-[#161B22] p-3 sm:p-4">
          <h2 id="vertical-list-heading" className="px-1 font-display text-base font-extrabold text-[#F0F6FC]">
            Services
          </h2>
          <ul className="mt-2 space-y-1.5" role="list">
            {snapshot.verticals.map((vertical) => {
              const active = vertical.key === selected?.key;
              return (
                <li key={vertical.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(vertical.key)}
                    aria-pressed={active}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676] ${
                      active
                        ? "border-[#00E676]/40 bg-[#00E676]/10"
                        : "border-[#21262D] bg-[#0B0E14] hover:border-[#30363D]"
                    }`}
                  >
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#21262D] text-[#8B949E]">
                      <Power className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-extrabold text-[#F0F6FC]">{vertical.publicLabel}</span>
                        <StatusBadge status={vertical.effective.status} small />
                        {!vertical.enforcement.wired ? (
                          <span className="rounded-full bg-[#30363D] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#8B949E]">
                            Not wired
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-[#8B949E]">
                        {vertical.name} · {sourceLabel(vertical.effective)}
                      </span>
                    </span>
                    <ChevronRight className={`mt-1 h-4 w-4 shrink-0 ${active ? "text-[#00E676]" : "text-[#8B949E]"}`} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {selected ? (
          <section aria-labelledby="vertical-detail-heading" className="space-y-4">
            <div className="min-w-0 rounded-2xl border border-[#21262D] bg-[#161B22] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#00E676]">Effective state</p>
                  <h2 id="vertical-detail-heading" className="font-display text-xl font-extrabold text-[#F0F6FC]">
                    {selected.publicLabel}
                  </h2>
                  <p className="mt-1 text-xs text-[#8B949E]">
                    {selected.name} · <span className="font-mono">{selected.href}</span>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={currentEffective?.status ?? selected.effective.status} />
                  <span className="text-[10.5px] text-[#8B949E]" aria-live="polite">
                    {currentEffective ? sourceLabel(currentEffective) : ""}
                  </span>
                </div>
              </div>

              <p className="mt-3 rounded-xl border border-[#21262D] bg-[#0B0E14] p-3 text-[11.5px] leading-relaxed text-[#8B949E]">
                <span className="font-bold text-[#F0F6FC]">Registry default:</span> {selected.registryStatus}.{" "}
                <span className="font-bold text-[#F0F6FC]">Responsible rule:</span>{" "}
                {sourceLabel(currentEffective ?? selected.effective)} ·{" "}
                {currentEffective?.scopeLabel ?? selected.effective.scopeLabel}.{" "}
                <span className="font-bold text-[#F0F6FC]">Reason:</span>{" "}
                {currentEffective?.reason || "No reason recorded."}
              </p>

              {currentEffective && currentEffective.rules.length > 0 ? (
                <div className="mt-3 rounded-xl border border-[#21262D] bg-[#0B0E14] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8B949E]">
                    Applicable rules (most restrictive decides)
                  </p>
                  <ul className="mt-2 space-y-1.5" role="list">
                    {currentEffective.rules.map((rule) => (
                      <li
                        key={`${rule.scopeType}:${rule.id ?? rule.scopeLabel}`}
                        className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#8B949E]"
                      >
                        <span className="min-w-0">
                          <span className="font-bold text-[#F0F6FC]">{rule.scopeLabel}</span>
                          <span className="ml-1 text-[10px] uppercase tracking-wide">{rule.scopeType}</span>
                          {rule.responsible ? (
                            <span className="ml-1.5 rounded-full bg-[#00E676]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#00E676]">
                              Decides
                            </span>
                          ) : null}
                          {rule.ignored ? (
                            <span className="ml-1.5 rounded-full bg-[#E3B341]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#E3B341]">
                              Cannot loosen parent
                            </span>
                          ) : null}
                        </span>
                        <StatusBadge status={rule.status} small />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-[#8B949E]">
                    A local LIVE row is shown as ignored while a stricter GLOBAL or country rule applies; it becomes
                    effective only after the stricter parent is cleared.
                  </p>
                </div>
              ) : null}

              <div className="mt-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ring-1 ${
                    selected.enforcement.wired
                      ? "bg-[#00E676]/15 text-[#00E676] ring-[#00E676]/30"
                      : "bg-[#E3B341]/15 text-[#E3B341] ring-[#E3B341]/30"
                  }`}
                >
                  {selected.enforcement.wired ? <ShieldCheck className="h-3 w-3" aria-hidden="true" /> : <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
                  {selected.enforcement.wired ? "Enforced" : "Not wired yet"}
                </span>
                <p className="mt-2 text-[11.5px] leading-relaxed text-[#8B949E]">{selected.enforcement.summary}</p>
                {selected.enforcement.points.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-[11px] text-[#8B949E]">
                    {selected.enforcement.points.map((point) => (
                      <li key={point} className="flex gap-1.5">
                        <span className="text-[#00E676]" aria-hidden="true">•</span> {point}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>

            {selected.enforcement.wired ? (
            <form
              className="rounded-2xl border border-[#21262D] bg-[#161B22] p-4 sm:p-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!saveDisabled) void submit("PATCH");
              }}
            >
              <h3 className="font-display text-base font-extrabold text-[#F0F6FC]">Set an activation rule</h3>
              <p className="mt-1 text-[11.5px] text-[#8B949E]">
                Changing this rule changes what customers can reach at the selected scope. It never cancels existing
                orders or refunds.
              </p>

              <fieldset className="mt-4" disabled={!canWrite || saving}>
                <legend className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8B949E]">Scope</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {(["GLOBAL", "COUNTRY", "CITY"] as const).map((value) => (
                    <label
                      key={value}
                      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-bold ${
                        scopeType === value
                          ? "border-[#00E676]/50 bg-[#00E676]/10 text-[#F0F6FC]"
                          : "border-[#30363D] bg-[#0B0E14] text-[#8B949E]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="activation-scope"
                        value={value}
                        checked={scopeType === value}
                        onChange={() => setScopeType(value)}
                        className="h-4 w-4 accent-[#00E676]"
                      />
                      <span className="flex items-center gap-1.5">
                        {value === "GLOBAL" ? <Globe2 className="h-3.5 w-3.5" aria-hidden="true" /> : <MapPin className="h-3.5 w-3.5" aria-hidden="true" />}
                        {value === "GLOBAL" ? "All locations" : value === "COUNTRY" ? "One country" : "One city"}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {scopeType !== "GLOBAL" ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="activation-country" className="block text-[10px] font-black uppercase tracking-[0.14em] text-[#8B949E]">
                      Country
                    </label>
                    <select
                      id="activation-country"
                      value={countryCode}
                      onChange={(event) => {
                        const next = event.target.value;
                        setCountryCode(next);
                        setCityCode(snapshot.cities[next]?.[0]?.cityCode ?? "");
                      }}
                      disabled={!canWrite || saving}
                      className="mt-1 h-11 w-full rounded-xl border border-[#30363D] bg-[#0B0E14] px-3 text-sm text-[#F0F6FC] outline-none focus-visible:ring-2 focus-visible:ring-[#00E676]"
                    >
                      {snapshot.countries.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name} ({country.code}) · {country.currency}
                        </option>
                      ))}
                    </select>
                  </div>
                  {scopeType === "CITY" ? (
                    <div>
                      <label htmlFor="activation-city" className="block text-[10px] font-black uppercase tracking-[0.14em] text-[#8B949E]">
                        City
                      </label>
                      <select
                        id="activation-city"
                        value={cityCode}
                        onChange={(event) => setCityCode(event.target.value)}
                        disabled={!canWrite || saving}
                        className="mt-1 h-11 w-full rounded-xl border border-[#30363D] bg-[#0B0E14] px-3 text-sm text-[#F0F6FC] outline-none focus-visible:ring-2 focus-visible:ring-[#00E676]"
                      >
                        {cityOptions.map((entry) => (
                          <option key={entry.cityCode} value={entry.cityCode}>
                            {entry.city}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3">
                <label htmlFor="activation-status" className="block text-[10px] font-black uppercase tracking-[0.14em] text-[#8B949E]">
                  New status
                </label>
                <select
                  id="activation-status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as ActivationStatus)}
                  disabled={!canWrite || saving}
                  className="mt-1 h-11 w-full rounded-xl border border-[#30363D] bg-[#0B0E14] px-3 text-sm font-bold text-[#F0F6FC] outline-none focus-visible:ring-2 focus-visible:ring-[#00E676]"
                >
                  <option value="LIVE">LIVE — open to the public</option>
                  <option value="PREVIEW">PREVIEW — authorized Control Center users only</option>
                  <option value="DISABLED">DISABLED — refuse new public activity</option>
                </select>
              </div>

              <div className="mt-3">
                <label htmlFor="activation-reason" className="block text-[10px] font-black uppercase tracking-[0.14em] text-[#8B949E]">
                  Reason (required, audited)
                </label>
                <textarea
                  id="activation-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value.slice(0, 500))}
                  disabled={!canWrite || saving}
                  rows={3}
                  aria-invalid={Boolean(reasonError)}
                  aria-describedby="activation-reason-hint"
                  placeholder="Example: Pausing new Shop orders while the Lagos payout provider is reconciled."
                  className="mt-1 w-full rounded-xl border border-[#30363D] bg-[#0B0E14] p-3 text-sm text-[#F0F6FC] outline-none placeholder:text-[#6E7681] focus-visible:ring-2 focus-visible:ring-[#00E676]"
                />
                <p id="activation-reason-hint" className={`mt-1 text-[11px] ${reasonError ? "text-[#FFB3AD]" : "text-[#8B949E]"}`}>
                  {reasonError || `${reason.trim().length}/500 characters. This text is stored in the audit record.`}
                </p>
              </div>

              {currentEffective ? (
                <div className="mt-3 rounded-xl border border-[#30363D] bg-[#0B0E14] p-3 text-[11.5px] text-[#8B949E]">
                  <p className="font-bold uppercase tracking-wide text-[#8B949E]">Before → after</p>
                  <p className="mt-1">
                    <StatusBadge status={currentEffective.status} small />{" "}
                    <span aria-hidden="true">→</span> <StatusBadge status={status} small />{" "}
                    <span className="ml-1">for {currentEffective.scopeLabel}</span>
                  </p>
                  {currentEffective.rules.some((rule) => rule.ignored) ? (
                    <p className="mt-2 flex gap-1.5 text-[#E3B341]">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      A stricter parent rule currently caps this scope. This local rule can restrict further but cannot
                      make the parent more permissive; it applies only after the stricter rule is cleared.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saveDisabled}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#00E676] px-4 text-sm font-extrabold text-[#0B0E14] transition hover:bg-[#4DFFA0] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                  {saving ? "Saving" : "Save rule"}
                </button>
                <button
                  type="button"
                  onClick={() => void submit("DELETE")}
                  disabled={!canWrite || !existingRow || Boolean(reasonError) || saving}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#7A2324] px-4 text-sm font-bold text-[#FFB3AD] transition hover:bg-[#2B1416] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676]"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Clear saved rule
                </button>
              </div>
              {!existingRow ? (
                <p className="mt-2 text-[11px] text-[#8B949E]">
                  No rule is saved for this exact scope yet. Clearing is disabled until one exists.
                </p>
              ) : null}
            </form>
            ) : (
              <section
                aria-labelledby="activation-not-wired-heading"
                className="rounded-2xl border border-[#5A4A1E] bg-[#211D10] p-4 sm:p-5"
              >
                <h3 id="activation-not-wired-heading" className="flex items-center gap-2 font-display text-base font-extrabold text-[#F0F6FC]">
                  <AlertTriangle className="h-4 w-4 text-[#E3B341]" aria-hidden="true" />
                  Configuration only — controls unavailable
                </h3>
                <p className="mt-2 text-[12px] leading-relaxed text-[#D8C48A]">
                  {selected.publicLabel} does not consult service activation on any route or service yet. A saved rule
                  would have no runtime effect, so the server refuses new rules and this page does not present an
                  operational toggle. The effective state and enforcement badge above are informational.
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-[#8B949E]">
                  To make activation operational here, the vertical&apos;s catalogue, navigation and transactional
                  entry points must first be wired to the shared resolver and verified in a separate slice.
                </p>
                {selected.rows.length > 0 ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-[#D8C48A]">
                    {selected.rows.length} stored row(s) exist for this service. They are not consulted; an
                    administrator can remove stale rows through the audited clear endpoint.
                  </p>
                ) : null}
              </section>
            )}

            <div className="rounded-2xl border border-[#21262D] bg-[#161B22] p-4 sm:p-5">
              <h3 className="font-display text-base font-extrabold text-[#F0F6FC]">Scope matrix</h3>
              <p className="mt-1 text-[11.5px] text-[#8B949E]">
                Effective result: the most restrictive of the GLOBAL, country and city rules, otherwise the registry
                default. Local rules that would loosen a stricter parent are marked ignored.
              </p>
              <div className="mt-3 w-full max-w-full overflow-x-auto">
                <table className="w-full min-w-[32rem] border-collapse text-left text-[11.5px]">
                  <caption className="sr-only">Effective activation by country and city for {selected.publicLabel}</caption>
                  <thead>
                    <tr className="border-b border-[#21262D] text-[10px] uppercase tracking-wide text-[#8B949E]">
                      <th scope="col" className="py-2 pr-3 font-bold">Location</th>
                      <th scope="col" className="py-2 pr-3 font-bold">Effective</th>
                      <th scope="col" className="py-2 font-bold">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.countries.map((country) => (
                      <tr key={country.countryCode} className="border-b border-[#21262D] align-top">
                        <th scope="row" className="py-2 pr-3 font-bold text-[#F0F6FC]">
                          {country.countryName} <span className="font-mono text-[10px] text-[#8B949E]">{country.countryCode}</span>
                        </th>
                        <td className="py-2 pr-3">
                          <StatusBadge status={country.effective.status} small />
                        </td>
                        <td className="py-2 text-[#8B949E]">
                          {sourceLabel(country.effective)}
                          {country.effective.localOverrideIgnored ? " · local rule ignored" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-bold text-[#00E676] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E676]">
                  City-level effective states ({selected.cities.length})
                </summary>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {selected.cities.map((entry) => (
                    <li
                      key={`${entry.countryCode}:${entry.cityCode}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[#21262D] bg-[#0B0E14] px-2.5 py-1.5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[11.5px] font-bold text-[#F0F6FC]">{entry.city}</span>
                        <span className="text-[10px] text-[#8B949E]">
                          {entry.countryName} · {sourceLabel(entry.effective)}
                          {entry.effective.localOverrideIgnored ? " · local ignored" : ""}
                        </span>
                      </span>
                      <StatusBadge status={entry.effective.status} small />
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </section>
        ) : null}
      </div>

      <section aria-labelledby="activation-audit-heading" className="min-w-0 rounded-2xl border border-[#21262D] bg-[#161B22] p-4 sm:p-5">
        <h2 id="activation-audit-heading" className="flex items-center gap-2 font-display text-base font-extrabold text-[#F0F6FC]">
          <History className="h-4 w-4 text-[#00E676]" aria-hidden="true" /> Recent activation audit
        </h2>
        <p className="mt-1 text-[11.5px] text-[#8B949E]">
          Every change records the actor, the exact scope, the reason and the effective before/after state.
        </p>
        {snapshot.audit.length === 0 ? (
          <p className="mt-3 rounded-xl border border-[#21262D] bg-[#0B0E14] p-4 text-sm text-[#8B949E]" role="status">
            No activation changes recorded yet. The registry defaults are in effect.
          </p>
        ) : (
          <div className="mt-3 w-full max-w-full overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-[#21262D] text-[10px] uppercase tracking-wide text-[#8B949E]">
                  <th scope="col" className="py-2 pr-3 font-bold">When</th>
                  <th scope="col" className="py-2 pr-3 font-bold">Actor</th>
                  <th scope="col" className="py-2 pr-3 font-bold">Action</th>
                  <th scope="col" className="py-2 pr-3 font-bold">Service / scope</th>
                  <th scope="col" className="py-2 font-bold">Before → after</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.audit.map((entry) => {
                  const metadata = entry.metadata ?? {};
                  const before = (metadata.before as Record<string, unknown> | undefined) ?? {};
                  const after = (metadata.after as Record<string, unknown> | undefined) ?? {};
                  const auditReason =
                    (typeof metadata.reason === "string" && metadata.reason) ||
                    (typeof metadata.deleteReason === "string" && metadata.deleteReason) ||
                    (typeof after.reason === "string" && after.reason) ||
                    (typeof before.reason === "string" && before.reason) ||
                    "";
                  return (
                    <tr key={entry.id} className="border-b border-[#21262D] align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-[#8B949E]">{dateLabel(entry.createdAt)}</td>
                      <td className="py-2 pr-3 text-[#F0F6FC]">{entry.actorName ?? entry.actorId ?? "System"}</td>
                      <td className="py-2 pr-3 font-mono text-[10.5px] text-[#8B949E]">{entry.action}</td>
                      <td className="py-2 pr-3 text-[#8B949E]">
                        <span className="block font-bold text-[#F0F6FC]">{String(metadata.verticalKey ?? "—")}</span>
                        {String(metadata.scopeType ?? "")}
                        {metadata.countryCode ? ` · ${String(metadata.countryCode)}` : ""}
                        {metadata.cityCode ? ` · ${String(metadata.cityCode)}` : ""}
                      </td>
                      <td className="py-2 text-[#8B949E]">
                        {String(before.status ?? "—")} → {String(after.status ?? "—")}
                        {auditReason ? (
                          <span className="mt-0.5 block text-[10.5px]">{auditReason}</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
