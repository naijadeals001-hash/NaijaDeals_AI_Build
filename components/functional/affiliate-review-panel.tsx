"use client";

import { useCallback, useEffect, useState } from "react";

type ReviewRow = {
  id: string; refundId: string; orderId: string; amountKobo: string;
  eligibleKobo: string | null; allocationPolicy: string | null;
  attempts: number; lastError: string | null; updatedAt: string;
};

const naira = (value: string) => `₦${(Number(value) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

export function AffiliateReviewPanel({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ReviewRow | null>(null);
  const [basisType, setBasisType] = useState("SUBTOTAL");
  const [basisKobo, setBasisKobo] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setPhase("loading"); setError("");
    try {
      const response = await fetch("/api/admin/affiliate-reviews?take=50", { credentials: "include" });
      if (!response.ok) throw new Error(`Could not load the queue (${response.status}).`);
      const body = (await response.json()) as { rows: ReviewRow[] };
      setRows(body.rows ?? []); setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the queue."); setPhase("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function resolve() {
    if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/affiliate-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ intentId: selected.id, basisType, basisKobo, evidenceRef, reason })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; eligibleKobo?: string; requeued?: boolean };
      if (!response.ok) throw new Error(body.error ?? `Resolution failed (${response.status}).`);
      setNotice(body.requeued ? `Queued for processing with ${naira(body.eligibleKobo ?? "0")} eligible.` : "Closed with no adjustment owed.");
      setSelected(null); setBasisKobo(""); setEvidenceRef(""); setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolution failed.");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading") return <p className="font-bold text-muted">Loading the review queue…</p>;
  if (phase === "error") return <p className="rounded-xl border border-border-soft bg-canvas p-4 font-bold text-danger">{error}</p>;
  if (rows.length === 0) return <p className="rounded-xl border border-border-soft bg-canvas p-4 text-sm text-muted">Nothing is awaiting review.</p>;

  return (
    <div className="space-y-4">
      {notice ? <p className="rounded-xl border border-brand/40 bg-canvas p-3 text-sm font-bold">{notice}</p> : null}
      {error ? <p className="rounded-xl border border-border-soft bg-canvas p-3 text-sm font-bold text-danger">{error}</p> : null}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-border-soft bg-canvas p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-bold">Order {row.orderId.slice(0, 12)}…</span>
              <span>{naira(row.amountKobo)} refunded</span>
              <span className="text-muted">{row.attempts} attempt(s)</span>
              <button onClick={() => setSelected(row)} className="rounded-lg border border-border-soft px-3 py-1 font-bold">
                {canManage ? "Review" : "Inspect"}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">{row.lastError}</p>
          </li>
        ))}
      </ul>
      {selected ? (
        <section className="space-y-3 rounded-xl border border-border-soft bg-canvas p-4">
          <h2 className="font-display text-lg font-extrabold">Intent {selected.id.slice(0, 10)}…</h2>
          <p className="text-sm text-muted">Refund {selected.refundId.slice(0, 12)}… · no frozen basis recorded</p>
          {canManage ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold">Basis type
                <select value={basisType} onChange={(e) => setBasisType(e.target.value)} className="mt-1 w-full rounded-lg border border-border-soft bg-white px-2 py-1">
                  <option value="SUBTOTAL">SUBTOTAL</option>
                  <option value="TOTAL">TOTAL</option>
                </select>
              </label>
              <label className="text-sm font-bold">Basis amount (kobo)
                <input value={basisKobo} onChange={(e) => setBasisKobo(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-lg border border-border-soft bg-white px-2 py-1" />
              </label>
              <label className="text-sm font-bold">Evidence reference
                <input value={evidenceRef} onChange={(e) => setEvidenceRef(e.target.value)} className="mt-1 w-full rounded-lg border border-border-soft bg-white px-2 py-1" />
              </label>
              <label className="text-sm font-bold">Reason
                <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-border-soft bg-white px-2 py-1" />
              </label>
            </div>
          ) : (
            <p className="text-sm text-muted">Read-only: resolving requires the affiliates:manage permission.</p>
          )}
          <div className="flex gap-2">
            {canManage ? (
              <button onClick={() => void resolve()} disabled={busy} className="rounded-lg bg-brand px-4 py-2 font-bold text-white disabled:opacity-50">
                {busy ? "Submitting…" : "Resolve with evidence"}
              </button>
            ) : null}
            <button onClick={() => setSelected(null)} className="rounded-lg border border-border-soft px-4 py-2 font-bold">Close</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
