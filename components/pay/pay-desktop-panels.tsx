"use client";

import Link from "next/link";
import {
  BarChart3,
  CreditCard,
  LayoutGrid,
  QrCode,
  Receipt,
  ScanLine,
  Settings,
  ShieldCheck,
  Wallet
} from "lucide-react";

/**
 * The three desktop panels from the approved mockup: Transaction History, the
 * Merchant Payment confirmation and the Business Dashboard.
 *
 * Like the phone previews these are structural illustrations — they show the
 * shape of each real screen without inventing figures that belong to a real
 * account. Each panel links to the page that serves it.
 */

function PanelShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-black/8 bg-white shadow-[0_10px_30px_rgba(16,24,40,0.07)]">
      <div className="flex-1">{children}</div>
      <figcaption className="border-t border-black/5 px-4 py-2.5 text-center text-[13px] font-semibold text-pay-ink">
        {title}
      </figcaption>
    </div>
  );
}

const NAV = [
  { icon: LayoutGrid, label: "Home" },
  { icon: Wallet, label: "Wallet" },
  { icon: Receipt, label: "Pay Bills" },
  { icon: ScanLine, label: "Transactions", active: true },
  { icon: QrCode, label: "Payment Links" },
  { icon: ShieldCheck, label: "Escrow" },
  { icon: Settings, label: "Settings" }
];

const TX_ROWS = [
  { label: "Airtime Purchase", meta: "MTN · 0803 123 4567", amount: "−₦500", status: "Successful" },
  { label: "Money Received", meta: "From Tunde Adebayo", amount: "+₦10,000", status: "Successful" },
  { label: "Electricity Payment", meta: "Ikeja Electric", amount: "−₦15,000", status: "Successful" },
  { label: "Payment to Merchant", meta: "NaijaShop", amount: "−₦25,000", status: "Successful" },
  { label: "Data Purchase", meta: "Airtel 5GB", amount: "−₦2,500", status: "Successful" }
];

function TransactionsPanel() {
  return (
    <div className="flex h-full">
      <div className="hidden w-[30%] shrink-0 border-r border-black/5 bg-pay-mint/60 p-3 sm:block">
        <div className="flex items-center gap-1">
          <span className="flex h-4 w-5 items-center justify-center rounded-[3px] bg-pay-green">
            <Wallet className="h-2.5 w-2.5 text-white" />
          </span>
          <span className="text-[10px] font-extrabold text-pay-green">
            Naija<span className="text-pay-gold">Pay</span>
          </span>
        </div>
        <ul className="mt-3 space-y-1.5">
          {NAV.map((item) => (
            <li
              key={item.label}
              className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[9px] font-semibold ${
                item.active ? "bg-white text-pay-green shadow-sm" : "text-pay-ink/55"
              }`}
            >
              <item.icon className="h-2.5 w-2.5" />
              {item.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-extrabold text-pay-ink">Transactions</span>
          <span className="rounded-md border border-black/10 px-1.5 py-0.5 text-[8px] text-pay-ink/50">Search</span>
        </div>
        <div className="mt-2 flex gap-1 text-[8px] font-semibold">
          {["All", "Payments", "Transfers", "Bills", "Withdrawals"].map((tab, index) => (
            <span
              key={tab}
              className={`rounded-full px-1.5 py-0.5 ${index === 0 ? "bg-pay-green text-white" : "text-pay-ink/50"}`}
            >
              {tab}
            </span>
          ))}
        </div>
        <ul className="mt-2 space-y-1.5">
          {TX_ROWS.map((row) => (
            <li key={row.label} className="flex items-center gap-2 rounded-md px-1 py-1">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-pay-mint">
                <Receipt className="h-2.5 w-2.5 text-pay-green" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[9px] font-bold text-pay-ink">{row.label}</span>
                <span className="block truncate text-[7.5px] text-pay-ink/45">{row.meta}</span>
              </span>
              <span className="shrink-0 text-[8.5px] font-bold text-pay-ink">{row.amount}</span>
              <span className="hidden shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[7px] font-semibold text-emerald-700 sm:block">
                {row.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MerchantPaymentPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="relative h-24">
        <img src="/generated/pay/pay-business-owner.webp" alt="" className="h-full w-full object-cover" />
      </div>
      <div className="flex flex-1 flex-col items-center px-3 pb-3">
        <span className="-mt-5 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-pay-green">
          <ShieldCheck className="h-4 w-4 text-white" />
        </span>
        <p className="mt-1.5 text-[11px] font-extrabold text-pay-ink">Pay NaijaShop</p>
        <p className="text-[8px] font-semibold text-pay-green">Verified Merchant</p>
        <p className="mt-2 font-display text-lg font-extrabold text-pay-ink">₦45,000</p>
        <p className="text-[8px] text-pay-ink/45">Order #ND-10293</p>
        <div className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-black/10 px-2 py-1.5">
          <CreditCard className="h-3 w-3 text-pay-green" />
          <span className="flex-1">
            <span className="block text-[7px] text-pay-ink/45">Payment Method</span>
            <span className="block text-[8px] font-bold text-pay-ink">NaijaPay Wallet</span>
          </span>
          <span className="text-[7px] text-pay-ink/40">Change</span>
        </div>
        <span className="mt-2 w-full rounded-md bg-pay-green py-1.5 text-center text-[9px] font-bold text-white">
          Confirm &amp; Pay
        </span>
      </div>
    </div>
  );
}

function BusinessPanel() {
  return (
    <div className="flex h-full">
      <div className="hidden w-[30%] shrink-0 border-r border-black/5 bg-pay-mint/60 p-3 sm:block">
        <div className="flex items-center gap-1">
          <span className="flex h-4 w-5 items-center justify-center rounded-[3px] bg-pay-green">
            <Wallet className="h-2.5 w-2.5 text-white" />
          </span>
          <span className="text-[9px] leading-tight font-extrabold text-pay-green">
            Naija<span className="text-pay-gold">Pay</span>
            <span className="block text-[6px] font-semibold text-pay-ink/45">Business</span>
          </span>
        </div>
        <ul className="mt-3 space-y-1.5">
          {[
            { icon: LayoutGrid, label: "Overview", active: true },
            { icon: Receipt, label: "Transactions" },
            { icon: BarChart3, label: "Settlements" },
            { icon: CreditCard, label: "Payouts" },
            { icon: QrCode, label: "Payment Links" },
            { icon: Settings, label: "Settings" }
          ].map((item) => (
            <li
              key={item.label}
              className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[8.5px] font-semibold ${
                item.active ? "bg-white text-pay-green shadow-sm" : "text-pay-ink/55"
              }`}
            >
              <item.icon className="h-2.5 w-2.5" />
              {item.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-extrabold text-pay-ink">Business Overview</span>
          <span className="rounded-md border border-black/10 px-1.5 py-0.5 text-[8px] text-pay-ink/50">This month</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {[
            { label: "Total Sales", value: "•••", note: "↑ 12%" },
            { label: "Pending Balance", value: "•••", note: "In escrow" },
            { label: "Available Balance", value: "•••", note: "Ready" }
          ].map((card) => (
            <div key={card.label} className="rounded-md border border-black/8 p-1.5">
              <p className="text-[7px] text-pay-ink/45">{card.label}</p>
              <p className="mt-0.5 text-[10px] font-extrabold text-pay-ink">{card.value}</p>
              <p className="text-[6.5px] font-semibold text-pay-green">{card.note}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[9px] font-extrabold text-pay-ink">Quick Actions</p>
        <div className="mt-1 grid grid-cols-4 gap-1 text-center">
          {[
            { icon: CreditCard, label: "Withdraw" },
            { icon: QrCode, label: "Create Link" },
            { icon: ScanLine, label: "My QR" },
            { icon: BarChart3, label: "Settlements" }
          ].map((action) => (
            <div key={action.label} className="rounded-md bg-pay-mint py-1.5">
              <action.icon className="mx-auto h-3 w-3 text-pay-green" />
              <span className="mt-0.5 block text-[6px] font-semibold text-pay-ink/60">{action.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[9px] font-extrabold text-pay-ink">Recent Transactions</span>
          <span className="text-[7px] text-pay-green">See all</span>
        </div>
        <ul className="mt-1 space-y-1">
          {[
            { label: "Payment Received", amount: "+₦25,000", status: "Successful" },
            { label: "Payment Received", amount: "+₦12,000", status: "Successful" },
            { label: "Refund", amount: "−₦5,000", status: "Completed" }
          ].map((row, index) => (
            <li key={index} className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${row.amount.startsWith("+") ? "bg-pay-green" : "bg-red-400"}`} />
              <span className="flex-1 text-[8px] font-semibold text-pay-ink">{row.label}</span>
              <span className="text-[8px] font-bold text-pay-ink">{row.amount}</span>
              <span className="hidden rounded-full bg-emerald-50 px-1.5 py-0.5 text-[6.5px] font-semibold text-emerald-700 sm:block">
                {row.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const PANELS = [
  { title: "Transaction History (Desktop)", href: "/wallet", render: () => <TransactionsPanel /> },
  { title: "Merchant Payment", href: "/pay/scan", render: () => <MerchantPaymentPanel /> },
  { title: "Business Dashboard (Merchant)", href: "/pay/business", render: () => <BusinessPanel /> }
];

export function DesktopPanels() {
  return (
    <section className="bg-pay-mint" aria-labelledby="pay-desktop-heading">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8 lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-pay-green">Built for desk and phone</p>
            <h2 id="pay-desktop-heading" className="mt-1 font-display text-2xl font-extrabold text-pay-ink sm:text-3xl">
              The same wallet on every screen
            </h2>
          </div>
          <Link
            href="/wallet"
            className="rounded-full border border-pay-green/30 px-5 py-2.5 text-sm font-bold text-pay-green transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pay-green"
          >
            Open your wallet
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {PANELS.map((panel) => (
            <Link
              key={panel.title}
              href={panel.href}
              className="block rounded-2xl transition hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pay-green"
            >
              <PanelShell title={panel.title}>{panel.render()}</PanelShell>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
