"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  Check,
  Clock,
  ExternalLink,
  History,
  Landmark,
  Loader2,
  QrCode,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet
} from "lucide-react";
import { koboToNaira } from "@/lib/api-client";

type BusinessData = {
  vendor: { id: string; name: string; status: string };
  wallet: {
    id: string;
    currency: string;
    availableKobo: string;
    heldKobo: string;
    recentTransactions: Array<{ id: string; description: string; type: string; reference: string; amountKobo: string; createdAt: string }>;
  } | null;
  payouts: Array<{ id: string; reference: string; status: string; amountKobo: string; periodStart: string; periodEnd: string; paidAt: string | null }>;
  settlements: Array<{ orderNumber: string; totalKobo: string; updatedAt: string }>;
  openEscrow: Array<{ id: string; amountKobo: string; status: string; reason: string; order: { orderNumber: string } | null }>;
  stats: { grossSalesKobo: string; settledKobo: string; pendingSettlementKobo: string; pendingPayoutsKobo: string; paidOrderCount: number };
};

const payoutStatusStyles: Record<string, string> = {
  PENDING: "bg-amber-soft text-amber-strong",
  PAID: "bg-pay-green/10 text-pay-green",
  CANCELLED: "bg-red-50 text-red-600"
};

/**
 * NaijaPay Business dashboard over the real merchant finance engine:
 * vendor wallet balances, pending escrow settlements, payouts and settled
 * orders. Every figure comes from /api/pay/business/overview; empty states
 * are honest and unconfigured capabilities say so.
 */
export function NaijaPayBusinessDashboard() {
  const [data, setData] = useState<BusinessData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "forbidden">("loading");
  const [error, setError] = useState("");
  const [section, setSection] = useState<"overview" | "settlements">("overview");

  const load = useCallback(() => {
    setStatus("loading");
    fetch("/api/pay/business/overview")
      .then((res) =>
        res.ok
          ? res.json()
          : res.json().then((body) => Promise.reject(Object.assign(new Error(body.error ?? "Unable to load dashboard."), { status: res.status })))
      )
      .then((body) => {
        setData(body);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to load dashboard.");
        setStatus(err.status === 403 ? "forbidden" : "error");
      });
  }, []);

  useEffect(load, [load]);

  if (status === "loading") {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading business dashboard">
        <div className="h-10 w-64 animate-pulse rounded-xl bg-pay-mint" />
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-3xl bg-pay-mint" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-3xl bg-pay-mint" />
      </div>
    );
  }

  if (status === "forbidden") {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-black/5 bg-white p-8 text-center shadow-soft">
        <Landmark className="mx-auto mb-3 h-10 w-10 text-pay-green" aria-hidden="true" />
        <h1 className="font-display text-2xl font-extrabold text-pay-ink">A seller account is required</h1>
        <p className="mt-2 text-sm text-pay-ink-muted">{error}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/sell" className="rounded-full bg-pay-green px-6 py-3 text-sm font-bold text-white transition hover:bg-pay-deep">
            Become a seller
          </Link>
          <Link href="/seller" className="rounded-full border border-pay-green/30 px-6 py-3 text-sm font-bold text-pay-green transition hover:bg-pay-mint">
            Seller dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-red-200 bg-white p-8 text-center">
        <h1 className="font-display text-xl font-extrabold text-pay-ink">Dashboard unavailable</h1>
        <p className="mt-1 text-sm text-pay-ink-muted">{error}</p>
        <button type="button" onClick={load} className="mt-4 rounded-full bg-pay-green px-5 py-2.5 text-sm font-bold text-white">
          Try again
        </button>
      </div>
    );
  }

  const currency = data.wallet?.currency ?? "NGN";
  const money = (kobo: string | number) => koboToNaira(String(kobo), currency);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-pay-deep px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-pay-gold">Business</span>
            <h1 className="font-display text-3xl font-extrabold text-pay-ink">NaijaPay Business</h1>
          </div>
          <p className="mt-1 text-sm text-pay-ink-muted">
            {data.vendor.name} · escrow settlements, payouts and sales from the shared financial engine.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-bold text-pay-ink transition hover:bg-pay-mint"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </button>
          <Link
            href="/pay"
            className="inline-flex items-center gap-2 rounded-full bg-pay-deep px-5 py-2.5 text-sm font-bold text-white shadow-lift transition hover:bg-pay-green"
          >
            <Wallet className="h-4 w-4" aria-hidden="true" /> Consumer wallet
          </Link>
        </div>
      </header>

      <nav className="flex gap-2" aria-label="Business sections">
        {[
          { id: "overview" as const, label: "Overview" },
          { id: "settlements" as const, label: "Settlements & payouts" }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSection(tab.id)}
            aria-current={section === tab.id ? "page" : undefined}
            className={`rounded-full px-5 py-2.5 text-sm font-bold transition ${
              section === tab.id ? "bg-pay-green text-white shadow-lift" : "border border-black/10 bg-white text-pay-ink hover:bg-pay-mint"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {section === "overview" && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-pay-deep to-pay-green p-6 text-white shadow-lift">
              <p className="text-xs font-bold uppercase tracking-widest text-pay-gold">Available earnings</p>
              <p className="mt-2 font-display text-3xl font-extrabold">{money(data.wallet?.availableKobo ?? 0)}</p>
              <p className="mt-1 text-xs text-white/60">Vendor wallet · held: {money(data.wallet?.heldKobo ?? 0)}</p>
              <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/5 blur-2xl transition group-hover:bg-pay-gold/10" aria-hidden="true" />
            </div>
            <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-soft">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-pay-ink-muted">Pending settlement</p>
                  <p className="mt-2 font-display text-3xl font-extrabold text-pay-ink">{money(data.stats.pendingSettlementKobo)}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-pay-ink-muted">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {data.openEscrow.length} escrow hold(s) awaiting release
                  </p>
                </div>
                <span className="rounded-2xl bg-pay-mint p-3 text-pay-green">
                  <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                </span>
              </div>
            </div>
            <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-soft">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-pay-ink-muted">Gross sales (paid)</p>
                  <p className="mt-2 font-display text-3xl font-extrabold text-pay-ink">{money(data.stats.grossSalesKobo)}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-pay-ink-muted">
                    <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" /> {data.stats.paidOrderCount} paid orders
                  </p>
                </div>
                <span className="rounded-2xl bg-pay-gold/10 p-3 text-pay-gold">
                  <TrendingUp className="h-6 w-6" aria-hidden="true" />
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-soft">
              <h2 className="font-display text-base font-extrabold text-pay-ink">Merchant tools</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  { icon: QrCode, label: "QR code", ready: false },
                  { icon: ExternalLink, label: "Payment links", ready: false },
                  { icon: Users, label: "Customers", ready: false },
                  { icon: Settings, label: "Settings", ready: false }
                ].map((tool) => (
                  <button
                    key={tool.label}
                    type="button"
                    disabled
                    title="Not available yet"
                    className="flex flex-col items-center gap-2 rounded-2xl border border-black/5 bg-pay-mint/50 px-2 py-4 opacity-70"
                  >
                    <tool.icon className="h-5 w-5 text-pay-green" aria-hidden="true" />
                    <span className="text-xs font-bold text-pay-ink">{tool.label}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-pay-ink-muted">Coming</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-pay-ink-muted">
                Merchant QR and payment links activate with the Send/Receive rollout on the shared ledger.
              </p>
            </div>

            <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-soft lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-extrabold text-pay-ink">Recent wallet activity</h2>
                <Link href="/seller" className="text-xs font-bold text-pay-green hover:underline">
                  Seller dashboard →
                </Link>
              </div>
              {!data.wallet || data.wallet.recentTransactions.length === 0 ? (
                <p className="mt-3 text-sm text-pay-ink-muted">No merchant wallet transactions yet. Escrow releases and payouts will appear here.</p>
              ) : (
                <ul className="mt-3 divide-y divide-pay-mint">
                  {data.wallet.recentTransactions.map((tx) => (
                    <li key={tx.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-pay-ink">{tx.description}</p>
                        <p className="text-xs text-pay-ink-muted">
                          {tx.type} · {tx.reference}
                        </p>
                      </div>
                      <p className={`shrink-0 font-black ${tx.type === "credit" ? "text-pay-green" : "text-pay-ink"}`}>
                        {tx.type === "credit" ? "+" : "−"}
                        {money(tx.amountKobo)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {section === "settlements" && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Settled (released escrow)", value: money(data.stats.settledKobo) },
              { label: "Pending escrow settlement", value: money(data.stats.pendingSettlementKobo) },
              { label: "Pending payouts", value: money(data.stats.pendingPayoutsKobo) }
            ].map((card) => (
              <div key={card.label} className="rounded-3xl border border-black/5 bg-white p-5 shadow-soft">
                <p className="text-xs font-bold uppercase tracking-widest text-pay-ink-muted">{card.label}</p>
                <p className="mt-2 font-display text-2xl font-extrabold text-pay-ink">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-soft">
            <h2 className="font-display text-base font-extrabold text-pay-ink">Escrow settlements</h2>
            <p className="mt-1 text-xs text-pay-ink-muted">Orders whose escrow has been released to your wallet.</p>
            {data.settlements.length === 0 ? (
              <p className="mt-3 text-sm text-pay-ink-muted">No settled orders yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-pay-mint">
                {data.settlements.map((order) => (
                  <li key={order.orderNumber} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <p className="font-bold text-pay-ink">{order.orderNumber}</p>
                      <p className="text-xs text-pay-ink-muted">Released {new Date(order.updatedAt).toLocaleDateString()}</p>
                    </div>
                    <p className="font-black text-pay-green">+{money(order.totalKobo)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-soft">
            <h2 className="font-display text-base font-extrabold text-pay-ink">Payouts</h2>
            <p className="mt-1 text-xs text-pay-ink-muted">Bank payouts created from real paid orders by the Control Center.</p>
            {data.payouts.length === 0 ? (
              <p className="mt-3 text-sm text-pay-ink-muted">No payouts have been created for your account yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-pay-mint">
                {data.payouts.map((payout) => (
                  <li key={payout.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <p className="font-bold text-pay-ink">{payout.reference}</p>
                      <p className="text-xs text-pay-ink-muted">
                        {new Date(payout.periodStart).toLocaleDateString()} – {new Date(payout.periodEnd).toLocaleDateString()}
                        {payout.paidAt ? ` · paid ${new Date(payout.paidAt).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${payoutStatusStyles[payout.status] ?? "bg-pay-mint text-pay-ink-muted"}`}>
                        {payout.status}
                      </span>
                      <p className="font-black text-pay-ink">{money(payout.amountKobo)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-soft">
            <h2 className="font-display text-base font-extrabold text-pay-ink">Open escrow holds</h2>
            {data.openEscrow.length === 0 ? (
              <p className="mt-3 text-sm text-pay-ink-muted">No open escrow holds. Funds reach your wallet when customers confirm delivery.</p>
            ) : (
              <ul className="mt-3 divide-y divide-pay-mint">
                {data.openEscrow.map((hold) => (
                  <li key={hold.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <p className="font-bold text-pay-ink">{hold.order?.orderNumber ?? "Order"}</p>
                      <p className="text-xs text-pay-ink-muted">
                        {hold.status} · {hold.reason}
                      </p>
                    </div>
                    <p className="font-black text-pay-ink">{money(hold.amountKobo)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
