"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, Clock, Loader2, Plus, ShieldCheck } from "lucide-react";
import { koboToNaira } from "@/lib/api-client";

type Milestone = {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  amountKobo: string;
  currency: string;
  status: string;
  payerUserId: string;
  payeeUserId: string;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  awaiting_funding: "Awaiting funding",
  funded: "Funded — in escrow",
  submitted: "Work submitted",
  accepted: "Accepted",
  released: "Released to payee",
  refunded: "Refunded",
  disputed: "In dispute",
  cancelled: "Cancelled",
  draft: "Draft"
};

const STATUS_TONE: Record<string, string> = {
  awaiting_funding: "bg-amber-soft text-amber-strong",
  funded: "bg-sky-50 text-sky-700",
  submitted: "bg-violet-50 text-violet-700",
  accepted: "bg-sky-50 text-sky-700",
  released: "bg-emerald-50 text-emerald-700",
  refunded: "bg-emerald-50 text-emerald-700",
  disputed: "bg-red-50 text-red-700",
  cancelled: "bg-pay-mint text-pay-ink-muted",
  draft: "bg-pay-mint text-pay-ink-muted"
};

function randomKey() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function nairaToKobo(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const kobo = Math.round(Number(trimmed) * 100);
  return Number.isSafeInteger(kobo) && kobo > 0 ? kobo : null;
}

type View = "list" | "create";

/**
 * Customer escrow workspace: milestones between two NaijaPay users.
 *
 * Everything here calls the server; which buttons appear is a convenience, and
 * the server re-checks the caller's role and the milestone's state on every
 * action. The wording never calls internal holds "regulated escrow".
 */
export function EscrowWorkspace({ currentUserId }: { currentUserId: string }) {
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [view, setView] = useState<View>("list");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ payeeEmail: "", title: "", description: "", amount: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/pay/milestones", { credentials: "include" });
    if (!res.ok) {
      setMilestones([]);
      return;
    }
    const body = await res.json();
    setMilestones(body.milestones ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setError("");
    const kobo = nairaToKobo(form.amount);
    if (!form.payeeEmail.trim()) {
      setError("Enter the other person's NaijaPay email.");
      return;
    }
    if (!kobo) {
      setError("Enter an amount like 5000 or 5000.50.");
      return;
    }
    if (form.title.trim().length < 3) {
      setError("Give the milestone a short title.");
      return;
    }
    setBusy("create");
    try {
      const res = await fetch("/api/pay/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "create",
          payeeEmail: form.payeeEmail.trim(),
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          amountKobo: kobo
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `Could not create the milestone (HTTP ${res.status}).`);
        return;
      }
      setForm({ payeeEmail: "", title: "", description: "", amount: "" });
      setView("list");
      setNotice(`Milestone ${body.milestone.reference} created. Fund it when you are ready.`);
      await load();
    } catch {
      setError("The connection dropped before we heard back. Check the list before retrying.");
    } finally {
      setBusy("");
    }
  }

  async function act(milestone: Milestone, action: string) {
    setError("");
    setNotice("");
    setBusy(`${milestone.id}:${action}`);
    try {
      const res = await fetch("/api/pay/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, reference: milestone.reference, idempotencyKey: randomKey() })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `That action failed (HTTP ${res.status}).`);
        return;
      }
      const next = body.milestone?.status;
      setNotice(`${milestone.title}: ${STATUS_LABEL[next] ?? next}.`);
      await load();
    } catch {
      setError("The connection dropped. Reload the list to see the current state before retrying.");
    } finally {
      setBusy("");
    }
  }

  function actionsFor(m: Milestone) {
    const isPayer = m.payerUserId === currentUserId;
    const isPayee = m.payeeUserId === currentUserId;
    const out: Array<{ action: string; label: string; primary?: boolean }> = [];
    if (isPayer) {
      if (m.status === "awaiting_funding") out.push({ action: "fund", label: "Fund milestone", primary: true });
      if (m.status === "funded" || m.status === "submitted") out.push({ action: "dispute", label: "Raise a dispute" });
      if (m.status === "submitted") out.push({ action: "accept", label: "Accept work", primary: true });
      if (m.status === "accepted") out.push({ action: "release", label: "Release payment", primary: true });
      if (m.status === "awaiting_funding") out.push({ action: "cancel", label: "Cancel" });
      if (m.status === "funded" || m.status === "submitted") out.push({ action: "refund", label: "Refund" });
    }
    if (isPayee) {
      if (m.status === "funded") out.push({ action: "submit", label: "Submit work", primary: true });
      if (m.status === "funded" || m.status === "submitted") out.push({ action: "dispute", label: "Raise a dispute" });
    }
    return out;
  }

  const open = (milestones ?? []).filter((m) => !["released", "refunded", "cancelled"].includes(m.status));
  const closed = (milestones ?? []).filter((m) => ["released", "refunded", "cancelled"].includes(m.status));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-pay-ink">Escrow milestones</h1>
          <p className="text-xs text-pay-ink-muted">
            Funds are held in your NaijaPay wallet until you release them. A dispute pauses release.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/wallet" className="rounded-full border border-pay-green/30 px-4 py-2.5 text-sm font-bold text-pay-green transition hover:bg-pay-mint">
            Wallet
          </Link>
          <button
            type="button"
            onClick={() => {
              setView(view === "create" ? "list" : "create");
              setError("");
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-pay-green px-4 py-2.5 text-sm font-bold text-white transition hover:bg-pay-deep"
          >
            {view === "create" ? (
              <>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" aria-hidden="true" /> New milestone
              </>
            )}
          </button>
        </div>
      </header>

      {notice && (
        <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-800" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}

      {view === "create" && (
        <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-soft">
          <h2 className="font-display text-lg font-extrabold text-pay-ink">Agree a milestone</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold text-pay-ink-muted">What is this for?</span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Logo design — first draft"
                className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-pay-green"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-pay-ink-muted">Pay to (NaijaPay email)</span>
              <input
                type="email"
                value={form.payeeEmail}
                onChange={(e) => setForm({ ...form, payeeEmail: e.target.value })}
                placeholder="name@example.com"
                className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-pay-green"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-pay-ink-muted">Amount</span>
              <div className="mt-1 flex items-center rounded-xl border border-black/10 px-3">
                <span className="text-sm font-bold text-pay-ink-muted">₦</span>
                <input
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-transparent px-2 py-2.5 text-sm outline-none"
                />
              </div>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold text-pay-ink-muted">Agreed terms (optional)</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="What counts as delivered, and when."
                className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-pay-green"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy === "create"}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-pay-green px-6 py-3 text-sm font-bold text-white transition hover:bg-pay-deep disabled:opacity-60"
          >
            {busy === "create" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Create milestone
          </button>
          <p className="mt-2 text-xs text-pay-ink-muted">
            Nobody is charged yet. The money moves from your wallet into a hold only when you fund it.
          </p>
        </section>
      )}

      {view === "list" && (
        <>
          {milestones === null && <div className="h-32 animate-pulse rounded-3xl bg-pay-mint" aria-busy="true" />}

          {milestones !== null && milestones.length === 0 && (
            <div className="rounded-3xl border border-black/5 bg-white p-8 text-center shadow-soft">
              <ShieldCheck className="mx-auto h-8 w-8 text-pay-green" aria-hidden="true" />
              <p className="mt-3 text-sm font-extrabold text-pay-ink">No milestones yet</p>
              <p className="mt-1 text-xs text-pay-ink-muted">
                Create one to agree a scope, hold the funds, and release them when the work is accepted.
              </p>
            </div>
          )}

          {[
            { label: "Open", items: open },
            { label: "Closed", items: closed }
          ].map((group) =>
            group.items.length === 0 ? null : (
              <section key={group.label}>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-pay-ink-muted">{group.label}</h2>
                <ul className="space-y-3">
                  {group.items.map((m) => {
                    const isPayer = m.payerUserId === currentUserId;
                    const actions = actionsFor(m);
                    return (
                      <li key={m.id} className="rounded-2xl border border-black/5 bg-white p-4 shadow-soft">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-pay-ink">
                              {m.title}
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_TONE[m.status] ?? "bg-pay-mint"}`}>
                                {STATUS_LABEL[m.status] ?? m.status}
                              </span>
                            </p>
                            <p className="mt-0.5 text-xs text-pay-ink-muted">
                              {m.reference} · {isPayer ? "you pay" : "you receive"} · {new Date(m.createdAt).toLocaleDateString()}
                            </p>
                            {m.description && <p className="mt-1.5 text-xs text-pay-ink/70">{m.description}</p>}
                          </div>
                          <p className="font-display text-lg font-extrabold text-pay-ink">{koboToNaira(m.amountKobo, m.currency)}</p>
                        </div>
                        {actions.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {actions.map((a) => (
                              <button
                                key={a.action}
                                type="button"
                                onClick={() => void act(m, a.action)}
                                disabled={busy === `${m.id}:${a.action}`}
                                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition disabled:opacity-60 ${
                                  a.primary
                                    ? "bg-pay-green text-white hover:bg-pay-deep"
                                    : "border border-black/10 text-pay-ink hover:bg-pay-mint"
                                }`}
                              >
                                {busy === `${m.id}:${a.action}` && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                                {a.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {m.status === "disputed" && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-700">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Waiting for an administrator to review this dispute.
                          </p>
                        )}
                        {m.status === "released" && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Payment released.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )
          )}
        </>
      )}
    </div>
  );
}
