"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Profile = {
  id: string;
  status: "APPLIED" | "APPROVED" | "SUSPENDED" | "REJECTED";
  displayName: string | null;
  suspendedReason: string | null;
};

type Conversion = {
  id: string;
  entityId: string;
  amountKobo: string;
  state: string;
  ruleVersion: number;
};

type Me =
  | { enrolled: false }
  | {
      enrolled: true;
      profile: Profile;
      summary: { byState: Record<string, { count: number; amountKobo: string }>; clicks: number };
      links: { id: string; code: string; destination: string; active: boolean }[];
      conversions: Conversion[];
    };

const LABEL: Record<string, string> = {
  TRACKED: "Tracked",
  VALIDATING: "In review",
  APPROVED: "Approved",
  PAYABLE: "Payable",
  PAYING: "Paying",
  PAID: "Settled to wallet",
  REJECTED: "Rejected",
  REVERSED: "Reversed",
  DISPUTED: "Disputed"
};

function naira(value: string | bigint): string {
  return `₦${(Number(value) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

function sumStates(byState: Record<string, { amountKobo: string }>, states: string[]): bigint {
  return states.reduce((total, state) => total + (byState[state] ? BigInt(byState[state].amountKobo) : 0n), 0n);
}

export function AffiliateHome() {
  const [me, setMe] = useState<Me | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error" | "signedout">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [displayName, setDisplayName] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/affiliate/me", { credentials: "include" });
      if (response.status === 401) {
        setPhase("signedout");
        return;
      }
      if (!response.ok) throw new Error("Could not load your affiliate status.");
      setMe((await response.json()) as Me);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your affiliate status.");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function apply() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/affiliate/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ acceptTerms: accepted, displayName })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not submit your application.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your application.");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading") {
    return <div className="mx-auto max-w-3xl p-8 font-bold text-muted">Loading the affiliate programme…</div>;
  }

  if (phase === "signedout") {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8">
        <h1 className="font-display text-3xl font-extrabold">NaijaDeals Affiliate</h1>
        <p className="text-muted">
          Sign in to join. Joining is free, and commission is earned only when someone you refer completes a paid,
          fulfilled order.
        </p>
        <Link href="/login?next=/affiliate" className="inline-block rounded-xl bg-brand px-5 py-3 font-bold text-white">
          Sign in to continue
        </Link>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-8">
        <h1 className="font-display text-3xl font-extrabold">Affiliate</h1>
        <p className="rounded-xl border border-border-soft bg-canvas p-4 font-bold text-danger">{error}</p>
        <button onClick={() => void load()} className="rounded-xl border border-border-soft px-4 py-2 font-bold">
          Try again
        </button>
      </div>
    );
  }

  if (!me || me.enrolled === false) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-8">
        <header className="space-y-2">
          <h1 className="font-display text-3xl font-extrabold">NaijaDeals Affiliate</h1>
          <p className="text-muted">
            Joining is free. You earn commission when someone you refer pays for an order that is fulfilled and past
            its return window. Clicks alone earn nothing.
          </p>
        </header>

        <section className="space-y-3 rounded-2xl border border-border-soft bg-canvas p-6">
          <h2 className="font-display text-xl font-extrabold">How it works</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>Apply with your details and we review the account.</li>
            <li>Share a tracked link to a product or shop page.</li>
            <li>If a referred buyer pays and the order completes, commission is calculated from the campaign rule.</li>
            <li>Commission moves into your NaijaPay wallet once the return window closes.</li>
          </ol>
        </section>

        <section className="space-y-4 rounded-2xl border border-border-soft bg-canvas p-6">
          <h2 className="font-display text-xl font-extrabold">Apply</h2>
          <label className="block text-sm font-bold">
            Display name (optional)
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={80}
              className="mt-1 w-full rounded-xl border border-border-soft bg-white px-3 py-2"
              placeholder="How you want to appear"
            />
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1" />
            <span>
              I accept the affiliate programme terms, including that commission is paid only on verified, completed
              orders.
            </span>
          </label>
          {error ? <p className="text-sm font-bold text-danger">{error}</p> : null}
          <button
            onClick={() => void apply()}
            disabled={busy || !accepted}
            className="rounded-xl bg-brand px-5 py-3 font-bold text-white disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Submit application"}
          </button>
        </section>
      </div>
    );
  }

  const { profile, summary, links, conversions } = me;
  const settled = sumStates(summary.byState, ["PAID"]);
  const pending = sumStates(summary.byState, ["TRACKED", "VALIDATING"]);
  const approved = sumStates(summary.byState, ["APPROVED", "PAYABLE"]);
  const reversed = sumStates(summary.byState, ["REVERSED"]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Affiliate</h1>
          <p className="text-sm text-muted">
            {profile.status === "APPROVED"
              ? "You are approved. Share a link to start earning."
              : profile.status === "APPLIED"
                ? "Your application is awaiting review."
                : profile.status === "SUSPENDED"
                  ? `Suspended: ${profile.suspendedReason ?? "contact support"}`
                  : "Your application was not approved."}
          </p>
        </div>
        <Link href="/wallet" className="rounded-xl border border-border-soft px-4 py-2 text-sm font-bold">
          Open wallet
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "Clicks tracked", value: String(summary.clicks) },
          { label: "Pending and in review", value: naira(pending) },
          { label: "Approved, not yet settled", value: naira(approved) },
          { label: "Settled to wallet", value: naira(settled) },
          { label: "Reversed", value: naira(reversed) },
          { label: "Paid out", value: "See wallet history" }
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-border-soft bg-canvas p-4">
            <p className="text-xs font-black uppercase tracking-wide text-muted">{card.label}</p>
            <p className="mt-1 font-display text-xl font-extrabold">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-2xl border border-border-soft bg-canvas p-6">
        <h2 className="font-display text-xl font-extrabold">Your links</h2>
        {links.length === 0 ? (
          <p className="text-sm text-muted">
            No links yet. Links are created from an active campaign, and no campaign is open to you right now.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {links.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-soft p-3"
              >
                <code className="font-mono text-xs">/r/{link.code}</code>
                <span className="text-muted">→ {link.destination}</span>
                <span className={link.active ? "font-bold text-brand" : "font-bold text-muted"}>
                  {link.active ? "Active" : "Inactive"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-border-soft bg-canvas p-6">
        <h2 className="font-display text-xl font-extrabold">Conversions</h2>
        {conversions.length === 0 ? (
          <p className="text-sm text-muted">No conversions yet. A completed, paid order will appear here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="py-2">Order</th>
                  <th className="py-2">Commission</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Rule</th>
                </tr>
              </thead>
              <tbody>
                {conversions.map((row) => (
                  <tr key={row.id} className="border-t border-border-soft">
                    <td className="py-2 font-mono text-xs">{row.entityId.slice(0, 14)}…</td>
                    <td className="py-2 font-bold">{naira(row.amountKobo)}</td>
                    <td className="py-2">{LABEL[row.state] ?? row.state}</td>
                    <td className="py-2 text-muted">v{row.ruleVersion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
