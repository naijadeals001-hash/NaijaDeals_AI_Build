"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { koboToNaira } from "@/lib/api-client";

type ReconciliationRow = {
  walletId: string;
  ownerType: string;
  owner: string;
  currency: string;
  cachedAvailableKobo: string;
  cachedHeldKobo: string;
  ledgerCreditKobo: string;
  ledgerDebitKobo: string;
  ledgerDerivedKobo: string;
  deltaKobo: string;
  openEscrowKobo: string;
};

type Reconciliation = {
  generatedAt: string;
  wallets: ReconciliationRow[];
  totals: { cachedKobo: string; ledgerDerivedKobo: string; mismatchedWallets: number; walletCount: number; openEscrowCount: number };
  unbalancedTransactions: Array<{ transactionId: string; reference: string; amountKobo: string }>;
};

/**
 * Control Center wallet/ledger reconciliation view. Read-only: it reports
 * cached vs ledger-derived balances and unbalanced journals so finance staff
 * can investigate. Nothing is auto-corrected from this screen.
 */
export function AdminReconciliationPanel() {
  const [data, setData] = useState<Reconciliation | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setStatus("loading");
    fetch("/api/admin/finance/reconciliation")
      .then((res) => (res.ok ? res.json() : res.json().then((body) => Promise.reject(new Error(body.error ?? "Unable to load reconciliation.")))))
      .then((body) => {
        setData(body);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to load reconciliation.");
        setStatus("error");
      });
  }, []);

  useEffect(load, [load]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-soft bg-canvas p-5">
        <div>
          <h2 className="font-display text-xl font-extrabold">Wallet &amp; ledger reconciliation</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Cached wallet balances compared with ledger-derived balances (credits minus debits). Deltas are reported for
            investigation — they are never auto-corrected here. Vendor wallets with open escrow can legitimately show a
            delta equal to the held amount, because escrow credits the ledger before funds become spendable.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-border-soft px-4 py-2 text-sm font-bold transition hover:bg-surface"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
        </button>
      </div>

      {status === "loading" && <div className="h-40 animate-pulse rounded-2xl border border-border-soft bg-canvas" aria-busy="true" />}
      {status === "error" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">{error}</div>
      )}

      {status === "ready" && data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Wallets", value: data.totals.walletCount.toLocaleString() },
              { label: "Cached total", value: koboToNaira(data.totals.cachedKobo) },
              { label: "Ledger-derived total", value: koboToNaira(data.totals.ledgerDerivedKobo) },
              { label: "Mismatched wallets", value: data.totals.mismatchedWallets.toLocaleString() }
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-border-soft bg-canvas p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">{card.label}</p>
                <p className="mt-1 font-display text-xl font-extrabold">{card.value}</p>
              </div>
            ))}
          </div>

          {data.unbalancedTransactions.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <p className="text-sm font-extrabold text-red-700">{data.unbalancedTransactions.length} unbalanced journal(s) detected</p>
              <ul className="mt-2 space-y-1 text-xs text-red-700">
                {data.unbalancedTransactions.map((tx) => (
                  <li key={tx.transactionId}>{tx.reference} · {koboToNaira(tx.amountKobo)}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-border-soft bg-canvas">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border-soft text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="p-3">Owner</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Cached available</th>
                  <th className="p-3">Cached held</th>
                  <th className="p-3">Ledger-derived</th>
                  <th className="p-3">Delta</th>
                  <th className="p-3">Open escrow</th>
                </tr>
              </thead>
              <tbody>
                {data.wallets.map((row) => (
                  <tr key={row.walletId} className="border-b border-border-soft/60 last:border-0">
                    <td className="p-3 font-bold">{row.owner}</td>
                    <td className="p-3 uppercase text-muted">{row.ownerType}</td>
                    <td className="p-3">{koboToNaira(row.cachedAvailableKobo, row.currency)}</td>
                    <td className="p-3">{koboToNaira(row.cachedHeldKobo, row.currency)}</td>
                    <td className="p-3">{koboToNaira(row.ledgerDerivedKobo, row.currency)}</td>
                    <td className={`p-3 font-bold ${row.deltaKobo === "0" ? "" : "text-amber-strong"}`}>
                      {row.deltaKobo === "0" ? "—" : koboToNaira(row.deltaKobo, row.currency)}
                    </td>
                    <td className="p-3">{koboToNaira(row.openEscrowKobo, row.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Generated {new Date(data.generatedAt).toLocaleString()} · read-only view under finance:read permission.</p>
        </>
      )}
    </section>
  );
}
