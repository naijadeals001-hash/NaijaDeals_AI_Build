"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, Eye, EyeOff, QrCode, Search, Send, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { apiClient, ApiRequestError, koboToNaira } from "@/lib/api-client";

type Tx = { id: string; description: string; type: string; reference: string; amountKobo: string | number; createdAt?: string };
type Hold = { id: string; amountKobo: string | number; status: string; reason: string; order?: { orderNumber?: string } | null };
type WalletData = { availableKobo?: string | number; heldKobo?: string | number; currency?: string; transactions?: Tx[]; escrowHolds?: Hold[] };

/**
 * Full NaijaPay wallet experience (approved Wallet Dashboard + Transaction
 * History mockups) on the existing /api/wallet engine: gradient balance card
 * with visibility toggle, escrow section, and a searchable/filterable real
 * transaction history. Empty and error states are honest.
 */
export function NaijaPayWalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [error, setError] = useState("");
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [rangeFilter, setRangeFilter] = useState("all");
  const [receipt, setReceipt] = useState<Tx | null>(null);

  function loadWallet() {
    setStatus("loading");
    apiClient
      .getWallet()
      .then((data) => {
        setWallet(data as WalletData);
        setStatus("ready");
      })
      .catch((err) => {
        if (err instanceof ApiRequestError && err.status === 401) setStatus("signed-out");
        else {
          setError(err instanceof Error ? err.message : "Unable to load wallet.");
          setStatus("error");
        }
      });
  }

  useEffect(loadWallet, []);

  const currency = wallet?.currency ?? "NGN";
  const transactions = useMemo(() => wallet?.transactions ?? [], [wallet]);
  const types = useMemo(() => ["all", ...Array.from(new Set(transactions.map((tx) => String(tx.type))))], [transactions]);
  const filtered = useMemo(() => {
    const now = Date.now();
    const ranges: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
    const cutoff = ranges[rangeFilter] ? now - ranges[rangeFilter] * 24 * 60 * 60 * 1000 : 0;
    return transactions.filter((tx) => {
      const matchesType = typeFilter === "all" || String(tx.type) === typeFilter;
      const needle = query.trim().toLowerCase();
      const matchesQuery = !needle || `${tx.description} ${tx.reference} ${tx.type}`.toLowerCase().includes(needle);
      const matchesRange = !cutoff || (tx.createdAt ? new Date(tx.createdAt).getTime() >= cutoff : false);
      return matchesType && matchesQuery && matchesRange;
    });
  }, [transactions, typeFilter, rangeFilter, query]);
  const openHolds = (wallet?.escrowHolds ?? []).filter((hold) => hold.status === "held" || hold.status === "disputed");
  const heldKobo = openHolds.reduce((total, hold) => total + Number(hold.amountKobo ?? 0), 0);

  if (status === "signed-out") {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl bg-gradient-to-br from-pay-deep to-pay-green p-8 text-center text-white">
        <Wallet className="mx-auto mb-3 h-10 w-10 text-pay-gold" aria-hidden="true" />
        <h1 className="font-display text-2xl font-extrabold">Sign in to view your NaijaPay wallet</h1>
        <Link
          href="/login?next=/wallet"
          className="mt-5 inline-block rounded-full bg-pay-gold px-6 py-3 text-sm font-bold text-pay-ink transition hover:brightness-110"
        >
          Open NaijaPay →
        </Link>
      </div>
    );
  }

  if (status === "error" || (status === "ready" && !wallet)) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-white p-8">
        <h1 className="font-display text-xl font-extrabold text-pay-ink">Wallet unavailable</h1>
        <p className="mt-1 text-sm text-pay-ink-muted">{error || "Unable to load your wallet right now."}</p>
        <button type="button" onClick={loadWallet} className="mt-4 rounded-full bg-pay-green px-5 py-2.5 text-sm font-bold text-white">
          Try again
        </button>
      </div>
    );
  }

  if (status === "loading" || !wallet) {
    return (
      <div className="mx-auto max-w-5xl space-y-4" aria-busy="true" aria-label="Loading wallet">
        <div className="h-56 animate-pulse rounded-3xl bg-pay-mint" />
        <div className="h-64 animate-pulse rounded-3xl bg-pay-mint" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-pay-ink">NaijaPay wallet</h1>
          <p className="text-sm text-pay-ink-muted">Balances are ledger-backed. Escrow holds are shown separately.</p>
        </div>
        <Link href="/pay" className="rounded-full border border-pay-green/30 px-5 py-2.5 text-sm font-bold text-pay-green transition hover:bg-pay-mint">
          ← NaijaPay home
        </Link>
      </header>

      <section className="rounded-3xl bg-gradient-to-br from-pay-deep to-pay-green p-6 text-white shadow-lift sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-pay-gold">Available balance</p>
            <div className="mt-1 flex items-center gap-3">
              <p className="font-display text-4xl font-extrabold" aria-live="polite">
                {balanceVisible ? koboToNaira(String(wallet.availableKobo ?? 0), currency) : "₦ ••••••"}
              </p>
              <button
                type="button"
                onClick={() => setBalanceVisible((visible) => !visible)}
                aria-label={balanceVisible ? "Hide balance" : "Show balance"}
                className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-gold"
              >
                {balanceVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-white/60">Escrow protected: {koboToNaira(String(heldKobo), currency)}</p>
          </div>
          <Wallet className="h-9 w-9 shrink-0 text-pay-gold" aria-hidden="true" />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Add Money", href: "/pay#add-money", icon: Banknote },
            { label: "Send", href: "/pay/send", icon: Send },
            { label: "Receive", href: "/pay/receive", icon: QrCode },
            { label: "Scan & Pay", href: "/pay/scan", icon: Smartphone }
          ].map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-white/10 px-1 py-3 text-center transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-gold"
            >
              <action.icon className="h-5 w-5 text-pay-gold" aria-hidden="true" />
              <span className="text-[11px] font-semibold leading-tight">{action.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-soft sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-pay-green" aria-hidden="true" />
          <h2 className="font-display text-xl font-extrabold text-pay-ink">Escrow holds</h2>
        </div>
        {(wallet.escrowHolds ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-pay-ink-muted">No escrow holds yet. Funds on eligible orders are held here until delivery is confirmed.</p>
        ) : (
          <ul className="mt-3 divide-y divide-pay-mint">
            {(wallet.escrowHolds ?? []).map((hold) => (
              <li key={hold.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <p className="font-bold text-pay-ink">{hold.order?.orderNumber ?? "Order"}</p>
                  <p className="text-xs text-pay-ink-muted">
                    {String(hold.status)} · {String(hold.reason)}
                  </p>
                </div>
                <p className="font-black text-pay-ink">{koboToNaira(String(hold.amountKobo), currency)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-soft sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-extrabold text-pay-ink">Transactions</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <span className="sr-only">Search transactions</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pay-ink-muted" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search description or reference…"
                className="w-56 rounded-xl border border-black/10 bg-pay-mint/50 py-2 pl-9 pr-3 text-sm text-pay-ink placeholder:text-pay-ink-muted focus:border-pay-green focus:outline-none"
              />
            </label>
            <label className="sr-only" htmlFor="tx-type">Filter by type</label>
            <label className="sr-only" htmlFor="tx-range">Filter by date</label>
            <select
              id="tx-range"
              value={rangeFilter}
              onChange={(event) => setRangeFilter(event.target.value)}
              className="rounded-xl border border-black/10 bg-pay-mint/50 px-3 py-2 text-sm font-semibold text-pay-ink focus:border-pay-green focus:outline-none"
            >
              <option value="all">All time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
            <select
              id="tx-type"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="rounded-xl border border-black/10 bg-pay-mint/50 px-3 py-2 text-sm font-semibold text-pay-ink focus:border-pay-green focus:outline-none"
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {type === "all" ? "All types" : type}
                </option>
              ))}
            </select>
          </div>
        </div>
        {transactions.length === 0 ? (
          <p className="mt-3 text-sm text-pay-ink-muted">No wallet transactions yet. Your first top-up or purchase will appear here.</p>
        ) : filtered.length === 0 ? (
          <p className="mt-3 text-sm text-pay-ink-muted">No transactions match this filter.</p>
        ) : (
          <ul className="mt-3 divide-y divide-pay-mint">
            {filtered.map((tx) => (
              <li key={tx.id}>
                <button
                  type="button"
                  onClick={() => setReceipt(tx)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2.5 text-left text-sm transition hover:bg-pay-mint/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-green"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-pay-ink">{tx.description}</span>
                    <span className="block text-xs text-pay-ink-muted">
                      {String(tx.type)} · {String(tx.reference)}
                      {tx.createdAt ? ` · ${new Date(tx.createdAt).toLocaleDateString()}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 font-black ${String(tx.type) === "credit" ? "text-pay-green" : "text-pay-ink"}`}>
                    {String(tx.type) === "credit" ? "+" : "−"}
                    {koboToNaira(String(tx.amountKobo), currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Transaction receipt">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-soft sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-pay-ink-muted">Receipt</p>
                <h2 className="mt-1 font-display text-xl font-extrabold text-pay-ink">{receipt.description}</h2>
              </div>
              <button type="button" onClick={() => setReceipt(null)} aria-label="Close receipt" className="rounded-full border border-black/10 px-3 py-1.5 text-sm font-bold text-pay-ink transition hover:bg-pay-mint">
                &#10005;
              </button>
            </div>
            <dl className="mt-4 divide-y divide-pay-mint text-sm">
              <div className="flex justify-between py-2.5">
                <dt className="text-pay-ink-muted">Amount</dt>
                <dd className={`font-black ${String(receipt.type) === "credit" ? "text-pay-green" : "text-pay-ink"}`}>
                  {String(receipt.type) === "credit" ? "+" : "−"}
                  {koboToNaira(String(receipt.amountKobo), currency)}
                </dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-pay-ink-muted">Type</dt>
                <dd className="font-bold text-pay-ink">{String(receipt.type)}</dd>
              </div>
              <div className="flex justify-between gap-3 py-2.5">
                <dt className="text-pay-ink-muted">Reference</dt>
                <dd className="break-all text-right font-mono text-xs font-bold text-pay-ink">{String(receipt.reference)}</dd>
              </div>
              {receipt.createdAt && (
                <div className="flex justify-between py-2.5">
                  <dt className="text-pay-ink-muted">Date</dt>
                  <dd className="font-bold text-pay-ink">{new Date(receipt.createdAt).toLocaleString()}</dd>
                </div>
              )}
              <div className="flex justify-between py-2.5">
                <dt className="text-pay-ink-muted">Ledger</dt>
                <dd className="font-bold text-pay-green">Balanced entry on the NaijaDeals ledger</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-pay-ink-muted">Keep this reference for support. NaijaPay support will never ask for your password.</p>
          </div>
        </div>
      )}
    </div>
  );
}
