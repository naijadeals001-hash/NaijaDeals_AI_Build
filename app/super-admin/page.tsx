import { Activity, Database, Globe2, LockKeyhole, Settings, ShieldCheck } from "lucide-react";
import { adminModules, riskAlerts } from "@/lib/data/ecosystem";
import { MetricCard } from "@/components/sections/cards";
import { TrustBadge } from "@/components/ui/badge";

export const metadata = {
  title: "Super admin dashboard",
  description: "NaijaDeals super admin dashboard."
};

export default function SuperAdminPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border-soft bg-canvas p-6 shadow-sm">
        <TrustBadge>Root administration terminal</TrustBadge>
        <h1 className="mt-5 font-display text-3xl font-extrabold sm:text-4xl">Super admin control plane</h1>
        <p className="mt-3 max-w-3xl text-muted">Regional governance, kill switches, permissions, ledgers, AI policy, audits, ads, promotions, fraud, settlement, localization, and ecosystem health.</p>
      </section>
      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="API health" value="99.98%" detail="Ecosystem uptime target" />
        <MetricCard label="Regions" value="12" detail="Nigeria-first, Pan-African ready" />
        <MetricCard label="Reserve ratio" value="1.42x" detail="Wallet capital dashboard" />
        <MetricCard label="Audit events" value="84k" detail="Immutable ledger stream" />
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        {[
          { title: "Governance", body: "Roles, permissions, regional policies, data sovereignty, and compliance archive.", icon: LockKeyhole },
          { title: "Infrastructure", body: "API health, scaling roadmap, feature kill switch, disaster recovery, and uptime.", icon: Database },
          { title: "Regional expansion", body: "Country launch matrix, corridors, tariffs, localization, and regulatory reporting.", icon: Globe2 },
          { title: "Security", body: "Fraud sentry, biometric checks, KYC, route risk, and law enforcement handoff.", icon: ShieldCheck },
          { title: "Analytics", body: "Growth, marketing, ads marketplace, retention, sustainability, and investor dashboards.", icon: Activity },
          { title: "Settings", body: "Platform configuration, AI policy, settlement weights, commissions, and subscriptions.", icon: Settings }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="rounded-xl border border-border-soft bg-canvas p-5">
              <Icon className="h-6 w-6 text-primary" />
              <h2 className="mt-3 font-display text-xl font-bold">{item.title}</h2>
              <p className="mt-2 text-sm text-muted">{item.body}</p>
            </div>
          );
        })}
      </section>
      <section className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="rounded-2xl border border-border-soft bg-canvas p-5">
          <h2 className="font-display text-2xl font-extrabold">Pan-African roadmap control</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              ["Nigeria", "Lagos, Abuja, Port Harcourt live model", "Active"],
              ["Ghana corridor", "Lagos-Accra logistics and settlement", "Pilot"],
              ["Francophone hub", "Localization and compliance console", "Design ready"],
              ["Cross-border wallet", "Multi-currency reserve and tariff engine", "Planned"]
            ].map(([region, detail, status]) => (
              <div key={region} className="rounded-xl bg-surface-low p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold">{region}</h3>
                  <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">{status}</span>
                </div>
                <p className="mt-2 text-sm text-muted">{detail}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-night p-5 text-white">
          <h2 className="font-display text-xl font-bold">Root risk watch</h2>
          {riskAlerts.map((alert) => (
            <div key={alert.signal} className="mt-3 rounded-xl bg-white/10 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-primary-live">{alert.severity}</p>
              <h3 className="mt-1 font-bold">{alert.signal}</h3>
              <p className="mt-1 text-sm text-white/70">{alert.action}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl bg-night p-5 text-white">
        <h2 className="font-display text-2xl font-extrabold">Module coverage</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {adminModules.map((module) => (
            <div key={module} className="rounded-xl bg-white/10 p-3 text-sm font-bold">{module}</div>
          ))}
        </div>
      </section>
    </div>
  );
}
