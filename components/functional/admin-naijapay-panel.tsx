"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { koboToNaira } from "@/lib/api-client";

type Provider = { id: string; configured: boolean; mode: string | null; note: string };
type PendingTopUp = { id: string; provider: string; providerReference: string; amountKobo: string; status: string; createdAt: string };
type Disputed = { id: string; reference: string; title: string; amountKobo: string; currency: string; payerUserId: string; payeeUserId: string; createdAt: string };

/**
 * NaijaPay controls in the Control Center.
 *
 * Shows provider configuration STATUS (never a key), the live journal totals,
 * any unbalanced transaction, top-ups stuck in a pending state and disputed
 * milestones awaiting a decision. Settling a dispute requires a reason and
 * records who decided, when and why.
 *
 * This is not a separate NaijaPay admin: it lives inside the existing Control
 * Center and is gated by finance:read and finance:escrow:settle.
 */
export function AdminNaijaPayPanel() {
  const [data, setData] = useState<{
    database: { classification: string; updatedAt: string | null };
    providers: Provider[];
    journal: { creditKobo: string; debitKobo: string; differenceKobo: string; entryCount: number };
    unbalancedTransactions: Array<{ reference: string; net: string }>;
    pendingTopUps: PendingTopUp[];
    disputedMilestones: Disputed[];
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    const res = await fetch("/api/admin/naijapay", { credentials: "include" });
    if (!res.ok) {
      setError(res.status === 403 ? "You need the finance:read permission to view this." : `Could not load NaijaPay controls (HTTP ${res.status}).`);
      setData(null);
      return;
    }
    setData(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function settle(milestone: Disputed, decision: "release" | "refund") {
    const note = (reason[milestone.reference] ?? "").trim();
    if (note.length < 5) {
      setError("Record why this decision was made before settling.");
      return;
    }
    setBusy(`${milestone.reference}:${decision}`);
    setError("");
    try {
      const res = await fetch("/api/admin/naijapay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reference: milestone.reference, decision, note })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `That decision failed (HTTP ${res.status}).`);
        return;
      }
      setNotice(`${milestone.reference}: ${decision === "release" ? "released to the payee" : "refunded to the payer"}.`);
      await load();
    } catch {
      setError("The connection dropped. Reload before retrying — the decision may have been applied.");
    } finally {
      setBusy("");
    }
  }

  if (error && !data) return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-pay-mint" aria-busy="true" />;

  const difference = BigInt(data.journal.differenceKobo);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-extrabold text-[#E6EDF3]">NaijaPay controls</h2>
          <p className="text-xs text-[#8B949E]">
            Provider status, journal integrity and items awaiting a decision. Keys are never displayed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#21262D] px-4 py-2 text-xs font-bold text-[#E6EDF3] transition hover:bg-[#21262D]"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
        </button>
      </div>

      {notice && (
        <p className="rounded-xl bg-[#00E676]/15 px-4 py-2.5 text-sm font-semibold text-[#00E676]" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-[#F85149]/15 px-4 py-2.5 text-sm text-[#F85149]" role="alert">
          {error}
        </p>
      )}

      {/* Environment */}
      <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#8B949E]">Environment</h3>
        <p className="mt-1.5 text-sm">
          Database classification:{" "}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              data.database.classification === "TEST" ? "bg-[#F59E0B]/15 text-[#F59E0B]" : "bg-[#00E676]/15 text-[#00E676]"
            }`}
          >
            {data.database.classification}
          </span>{" "}
          <span className="text-xs text-[#8B949E]">
            {data.database.classification === "TEST"
              ? "Live money movement is blocked by the payment boundary regardless of flags."
              : "Live operations also require the environment flags."}
          </span>
        </p>
      </section>

      {/* Providers */}
      <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#8B949E]">Payment providers</h3>
        <ul className="mt-2 divide-y divide-[#21262D]">
          {data.providers.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-sm font-semibold text-[#E6EDF3]">{p.id}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-[#8B949E]">{p.note}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    p.configured ? "bg-[#00E676]/15 text-[#00E676]" : "bg-[#21262D] text-[#8B949E]"
                  }`}
                >
                  {p.configured ? (p.mode ?? "configured") : "not configured"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Journal */}
      <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#8B949E]">Journal</h3>
        <dl className="mt-2 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[#8B949E]">Credits</dt>
            <dd className="font-display text-base font-extrabold text-[#E6EDF3]">{koboToNaira(data.journal.creditKobo, "NGN")}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#8B949E]">Debits</dt>
            <dd className="font-display text-base font-extrabold text-[#E6EDF3]">{koboToNaira(data.journal.debitKobo, "NGN")}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#8B949E]">Difference</dt>
            <dd className={`font-display text-base font-extrabold ${difference === BigInt(0) ? "text-[#00E676]" : "text-[#F59E0B]"}`}>
              {koboToNaira(data.journal.differenceKobo, "NGN")}
            </dd>
          </div>
        </dl>
        {difference !== BigInt(0) && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-[#8B949E]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F59E0B]" aria-hidden="true" />
            A difference here is explained by which rows are postings. The documented cases are offset in the equity book —
            see docs/naijapay-ledger-forensics.md. Adding a balanced posting cannot remove it.
          </p>
        )}
        {data.unbalancedTransactions.length > 0 && (
          <ul className="mt-2 space-y-1">
            {data.unbalancedTransactions.map((t) => (
              <li key={t.reference} className="rounded-lg bg-[#F59E0B]/10 px-3 py-1.5 text-xs">
                <span className="font-mono">{t.reference}</span> · net {koboToNaira(t.net, "NGN")}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pending top-ups */}
      <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#8B949E]">Top-ups awaiting confirmation</h3>
        {data.pendingTopUps.length === 0 ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-[#8B949E]">
            <CheckCircle2 className="h-4 w-4 text-[#00E676]" aria-hidden="true" /> None.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[#21262D]">
            {data.pendingTopUps.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-mono text-xs">{t.providerReference}</span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{koboToNaira(t.amountKobo, "NGN")}</span>
                  <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[11px] font-bold text-[#F59E0B]">{t.status}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Disputed milestones */}
      <section className="rounded-2xl border border-[#21262D] bg-[#161B22] p-4">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#8B949E]">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> Disputed milestones
        </h3>
        {data.disputedMilestones.length === 0 ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-[#8B949E]">
            <CheckCircle2 className="h-4 w-4 text-[#00E676]" aria-hidden="true" /> No open disputes.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {data.disputedMilestones.map((m) => (
              <li key={m.id} className="rounded-xl border border-[#21262D] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[#E6EDF3]">
                    {m.title} <span className="font-mono text-xs font-normal text-[#8B949E]">({m.reference})</span>
                  </span>
                  <span className="font-display text-sm font-extrabold">{koboToNaira(m.amountKobo, m.currency)}</span>
                </div>
                <dl className="mt-1.5 grid gap-1 text-[11px] text-[#8B949E] sm:grid-cols-2">
                  <div>
                    <dt className="inline">Payer: </dt>
                    <dd className="inline font-mono">{m.payerUserId.slice(-8)}</dd>
                  </div>
                  <div>
                    <dt className="inline">Payee: </dt>
                    <dd className="inline font-mono">{m.payeeUserId.slice(-8)}</dd>
                  </div>
                </dl>
                <label className="mt-2 block">
                  <span className="text-[11px] font-semibold text-[#8B949E]">Reason for the decision (recorded in the audit log)</span>
                  <textarea
                    value={reason[m.reference] ?? ""}
                    onChange={(e) => setReason({ ...reason, [m.reference]: e.target.value })}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-[#21262D] bg-[#0B0E14] text-[#E6EDF3] px-3 py-2 text-sm outline-none focus:border-[#00E676]"
                  />
                </label>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void settle(m, "release")}
                    disabled={busy === `${m.reference}:release`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#00E676] px-4 py-2 text-xs font-bold text-[#0B0E14] disabled:opacity-60"
                  >
                    {busy === `${m.reference}:release` && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                    Release to payee
                  </button>
                  <button
                    type="button"
                    onClick={() => void settle(m, "refund")}
                    disabled={busy === `${m.reference}:refund`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#21262D] px-4 py-2 text-xs font-bold text-[#E6EDF3] disabled:opacity-60"
                  >
                    {busy === `${m.reference}:refund` && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                    Refund to payer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
