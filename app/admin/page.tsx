import Link from "next/link";
import { AlertTriangle, ArrowRight, Bot, CreditCard, ShieldCheck, Users } from "lucide-react";
import { adminModules, adminQueues, aiSystems, riskAlerts } from "@/lib/data/ecosystem";
import { MetricCard } from "@/components/sections/cards";
import { TrustBadge } from "@/components/ui/badge";

export const metadata = {
  title: "Admin dashboard",
  description: "NaijaDeals admin dashboard for every vertical."
};

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-night p-6 text-white shadow-soft">
        <TrustBadge>Admin command center</TrustBadge>
        <h1 className="mt-5 font-display text-3xl font-extrabold sm:text-4xl">Ecosystem operations dashboard</h1>
        <p className="mt-3 max-w-3xl text-white/70">Live control center for users, vendors, orders, deliveries, rides, restaurants, properties, gigs, creators, wallet, escrow, disputes, payouts, reviews, ads, promotions, AI monitoring, fraud, analytics, and settings.</p>
      </section>
      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="GMV today" value="NGN 248M" detail="All verticals" />
        <MetricCard label="Active missions" value="12,804" detail="Orders, rides, dispatch" />
        <MetricCard label="Escrow holds" value="4,188" detail="Awaiting proof events" />
        <MetricCard label="Fraud alerts" value="38" detail="Needs review" />
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {adminModules.map((module) => (
          <Link key={module} href="/super-admin" className="rounded-xl border border-border-soft bg-canvas p-4 font-bold shadow-sm transition hover:bg-primary-soft hover:text-primary">
            {module}
          </Link>
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-border-soft bg-canvas p-5">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-bold">Operational queues</h2>
          </div>
          <div className="grid gap-3 lg:hidden">
            {adminQueues.map((queue) => (
              <div key={`${queue.area}-${queue.item}-card`} className="rounded-xl bg-surface-low p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-primary">{queue.area}</p>
                    <h3 className="mt-1 font-bold">{queue.item}</h3>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">{queue.status}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">{queue.owner}</span>
                  <span className="font-display text-lg font-extrabold text-primary">{queue.count}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-3">Area</th>
                  <th className="py-3">Queue</th>
                  <th className="py-3">Owner</th>
                  <th className="py-3">Count</th>
                  <th className="py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {adminQueues.map((queue) => (
                  <tr key={`${queue.area}-${queue.item}`} className="border-t border-border-soft">
                    <td className="py-3 font-bold">{queue.area}</td>
                    <td className="py-3 text-muted">{queue.item}</td>
                    <td className="py-3 text-muted">{queue.owner}</td>
                    <td className="py-3 font-bold text-primary">{queue.count}</td>
                    <td className="py-3">
                      <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">{queue.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-2xl bg-night p-5 text-white">
          <CreditCard className="h-6 w-6 text-primary-live" />
          <h2 className="mt-3 font-display text-xl font-bold">Wallet and escrow summary</h2>
          {[
            ["Active escrow holds", "NGN 1.8B"],
            ["Pending vendor payouts", "NGN 284M"],
            ["Driver payout queue", "NGN 46M"],
            ["Refund reserve", "NGN 72M"]
          ].map(([label, value]) => (
            <div key={label} className="mt-4 flex items-center justify-between rounded-xl bg-white/10 p-3">
              <span className="text-sm text-white/70">{label}</span>
              <span className="font-bold">{value}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border-soft bg-canvas p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber" />
            <h2 className="font-display text-xl font-bold">Fraud and risk alerts</h2>
          </div>
          {riskAlerts.map((item) => (
            <div key={item.signal} className="mb-3 rounded-xl bg-surface-low p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold">{item.signal}</h3>
                <span className="rounded-full bg-amber-soft px-2 py-1 text-xs font-bold text-amber">{item.severity}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{item.subject}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-primary">{item.action}</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-border-soft bg-canvas p-5">
          <div className="mb-4 flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-bold">AI monitoring</h2>
          </div>
          {aiSystems.map((system) => {
            const Icon = system.icon;
            return (
              <div key={system.title} className="mb-3 flex gap-3 rounded-xl bg-surface-low p-4">
                <Icon className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-bold">{system.title}</h3>
                  <p className="text-sm text-muted">{system.status}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <Link href="/super-admin" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-white">
        Open super admin <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
