"use client";

import { useCallback, useEffect, useState } from "react";

type Campaign = {
  id: string; slug: string; name: string; vertical: string; status: string;
  commissionBps: number; commissionFlatKobo: string | null; commissionBasis: string;
  budgetKobo: string; spentKobo: string; attributionDays: number;
  effectiveTo: string | null; createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PAUSED: "Paused",
  ENDED: "Ended"
};

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-surface-low text-ink",
  ACTIVE: "bg-primary-soft text-primary",
  PAUSED: "bg-amber-soft text-amber-strong",
  ENDED: "bg-surface-mid text-muted"
};

const VERTICALS = ["shop", "eats", "stay", "ride", "gigs"];

const naira = (value: string) => `₦${(Number(value) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

function actionsFor(status: string): Array<{ to: string; label: string; primary?: boolean }> {
  if (status === "DRAFT") return [{ to: "ACTIVE", label: "Activate", primary: true }, { to: "ENDED", label: "End" }];
  if (status === "ACTIVE") return [{ to: "PAUSED", label: "Pause" }, { to: "ENDED", label: "End" }];
  if (status === "PAUSED") return [{ to: "ACTIVE", label: "Activate", primary: true }, { to: "ENDED", label: "End" }];
  return [];
}

export function AffiliateCampaignPanel({ canManage }: { canManage: boolean }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    slug: "", name: "", vertical: "shop", commissionBps: "500",
    budgetKobo: "10000000", attributionDays: "30", commissionBasis: "SUBTOTAL"
  });

  const load = useCallback(async () => {
    setPhase("loading"); setError("");
    try {
      const response = await fetch("/api/admin/affiliate-campaigns", { credentials: "include" });
      if (!response.ok) throw new Error(`Could not load campaigns (${response.status}).`);
      setCampaigns((await response.json()) as Campaign[]);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load campaigns.");
      setPhase("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    setCreating(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/affiliate-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          slug: form.slug.trim().toLowerCase(),
          name: form.name.trim(),
          vertical: form.vertical,
          commissionBps: Number(form.commissionBps),
          budgetKobo: form.budgetKobo,
          attributionDays: Number(form.attributionDays),
          commissionBasis: form.commissionBasis
        })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; name?: string };
      if (!response.ok) throw new Error(body.error ?? `Could not create the campaign (${response.status}).`);
      setNotice(`${body.name ?? "Campaign"} created as a draft. Activate it when the terms are final.`);
      setForm({ ...form, slug: "", name: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the campaign.");
    } finally {
      setCreating(false);
    }
  }

  async function transition(campaign: Campaign, to: string) {
    setBusyId(campaign.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/affiliate-campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: to })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? `Could not update the campaign (${response.status}).`);
      setNotice(`${campaign.name} is now ${STATUS_LABEL[to] ?? to}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the campaign.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-5">
      {notice ? <p className="rounded-xl border border-primary/40 bg-canvas p-3 text-sm font-bold text-ink">{notice}</p> : null}
      {error ? <p className="rounded-xl border border-border-soft bg-canvas p-3 text-sm font-bold text-crimson">{error}</p> : null}

      {canManage ? (
        <section className="space-y-3 rounded-xl border border-border-soft bg-canvas p-4 text-ink">
          <h2 className="font-display text-lg font-extrabold">New campaign</h2>
          <p className="text-sm text-muted">Created as a draft. It becomes visible to affiliates only after activation.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold">Name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-lg border border-border-soft bg-white px-2 py-1" />
            </label>
            <label className="text-sm font-bold">Slug
              <input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="back-to-school" className="mt-1 w-full rounded-lg border border-border-soft bg-white px-2 py-1" />
            </label>
            <label className="text-sm font-bold">Vertical
              <select value={form.vertical} onChange={(event) => setForm({ ...form, vertical: event.target.value })} className="mt-1 w-full rounded-lg border border-border-soft bg-white px-2 py-1">
                {VERTICALS.map((vertical) => <option key={vertical} value={vertical}>{vertical}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold">Commission (basis points)
              <input value={form.commissionBps} onChange={(event) => setForm({ ...form, commissionBps: event.target.value })} inputMode="numeric" className="mt-1 w-full rounded-lg border border-border-soft bg-white px-2 py-1" />
            </label>
            <label className="text-sm font-bold">Budget (kobo)
              <input value={form.budgetKobo} onChange={(event) => setForm({ ...form, budgetKobo: event.target.value })} inputMode="numeric" className="mt-1 w-full rounded-lg border border-border-soft bg-white px-2 py-1" />
            </label>
            <label className="text-sm font-bold">Attribution window (days)
              <input value={form.attributionDays} onChange={(event) => setForm({ ...form, attributionDays: event.target.value })} inputMode="numeric" className="mt-1 w-full rounded-lg border border-border-soft bg-white px-2 py-1" />
            </label>
            <label className="text-sm font-bold">Commission basis
              <select value={form.commissionBasis} onChange={(event) => setForm({ ...form, commissionBasis: event.target.value })} className="mt-1 w-full rounded-lg border border-border-soft bg-white px-2 py-1">
                <option value="SUBTOTAL">SUBTOTAL (excludes delivery)</option>
                <option value="TOTAL">TOTAL (includes delivery)</option>
              </select>
            </label>
          </div>
          <button onClick={() => void create()} disabled={creating || !form.slug.trim() || !form.name.trim()} className="rounded-lg bg-primary px-4 py-2 font-bold text-white disabled:opacity-50">
            {creating ? "Creating…" : "Create draft"}
          </button>
        </section>
      ) : (
        <p className="rounded-xl border border-border-soft bg-canvas p-3 text-sm text-ink">Read-only: creating and changing campaigns requires the affiliates:manage permission.</p>
      )}

      {phase === "loading" ? <p className="font-bold text-[#8B949E]">Loading campaigns…</p> : null}
      {phase === "ready" && campaigns.length === 0 ? (
        <p className="rounded-xl border border-border-soft bg-canvas p-4 text-sm text-ink">No campaigns yet.</p>
      ) : null}
      {phase === "ready" && campaigns.length > 0 ? (
        <ul className="space-y-2">
          {campaigns.map((campaign) => (
            <li key={campaign.id} className="space-y-2 rounded-xl border border-border-soft bg-canvas p-4 text-ink">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{campaign.name}</p>
                  <p className="text-xs text-muted">{campaign.vertical} · /{campaign.slug} · rule v1</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${STATUS_TONE[campaign.status] ?? "bg-surface-low text-ink"}`}>
                  {STATUS_LABEL[campaign.status] ?? campaign.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>{campaign.commissionBps > 0 ? `${campaign.commissionBps / 100}%` : naira(campaign.commissionFlatKobo ?? "0")} of {campaign.commissionBasis}</span>
                <span className="text-muted">{naira(campaign.spentKobo)} spent of {naira(campaign.budgetKobo)}</span>
                <span className="text-muted">{campaign.attributionDays}-day attribution</span>
              </div>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  {actionsFor(campaign.status).map((action) => (
                    <button
                      key={action.to}
                      onClick={() => void transition(campaign, action.to)}
                      disabled={busyId === campaign.id}
                      className={`rounded-lg px-3 py-1 text-sm font-bold disabled:opacity-50 ${action.primary ? "bg-primary text-white" : "border border-border-soft"}`}
                    >
                      {busyId === campaign.id ? "Working…" : action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
