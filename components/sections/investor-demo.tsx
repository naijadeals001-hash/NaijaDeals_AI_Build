import Link from "next/link";
import { ArrowRight, CheckCircle2, Map, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { investorSections, verticalDemos, verticals, type VerticalKey } from "@/lib/data/ecosystem";

export function InvestorDemoSections() {
  return (
    <section className="rounded-2xl border border-border-soft bg-canvas p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Investor demo narrative</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">Why NaijaDeals can become Africa&apos;s super-app marketplace</h2>
          <p className="mt-3 max-w-3xl text-sm text-muted sm:text-base">
            The demo is organized around repeat use, trust, escrow, logistics, AI, seller growth, and a Nigeria-first path to Pan-African scale.
          </p>
        </div>
        <Link href="/super-admin" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-night px-5 font-bold text-white">
          View operating model <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {investorSections.map((section, index) => (
          <article key={section.eyebrow} className={`rounded-xl p-5 ${index === 0 ? "bg-night text-white md:col-span-2" : "bg-surface-low"}`}>
            <p className={`text-xs font-bold uppercase tracking-wide ${index === 0 ? "text-primary-live" : "text-primary"}`}>{section.eyebrow}</p>
            <h3 className="mt-3 font-display text-xl font-bold">{section.title}</h3>
            <p className={`mt-2 text-sm ${index === 0 ? "text-white/75" : "text-muted"}`}>{section.body}</p>
            <p className={`mt-4 flex items-start gap-2 text-sm font-semibold ${index === 0 ? "text-white" : "text-ink"}`}>
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-live" />
              {section.proof}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function VerticalDemoPanel({ keyName }: { keyName?: VerticalKey }) {
  const demos = keyName ? verticalDemos.filter((demo) => demo.key === keyName) : verticalDemos.slice(0, 6);
  return (
    <section className="rounded-2xl border border-border-soft bg-canvas p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary">
          <Map className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-primary">African marketplace content</p>
          <h2 className="font-display text-2xl font-extrabold">{keyName ? "Vertical operating story" : "Vertical operating stories"}</h2>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {demos.map((demo) => {
          const vertical = verticals.find((item) => item.key === demo.key);
          const Icon = vertical?.icon ?? TrendingUp;
          return (
            <article key={demo.key} className="rounded-xl bg-surface-low p-5">
              <div className="flex items-start gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${vertical?.color ?? "bg-primary"} text-white`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">{vertical?.name}</p>
                  <h3 className="mt-1 font-display text-xl font-bold">{demo.headline}</h3>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted">{demo.story}</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {demo.metrics.map(([value, label]) => (
                  <div key={label} className="rounded-lg bg-canvas p-3">
                    <p className="font-display text-lg font-extrabold text-primary">{value}</p>
                    <p className="mt-1 text-[11px] font-semibold text-muted">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {demo.operators.map((operator) => (
                  <span key={operator} className="rounded-full bg-canvas px-3 py-1 text-xs font-bold text-muted">{operator}</span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function TrustAdvantageStrip() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      {[
        { title: "Trust and escrow", body: "Funds, proof, refunds, and payouts run through one ledger-backed lifecycle.", icon: ShieldCheck },
        { title: "AI-powered commerce", body: "Aura connects search, recommendations, dispatch, fraud, and support.", icon: Sparkles },
        { title: "Logistics advantage", body: "Every ride, package, and meal teaches the platform about local corridors.", icon: TrendingUp }
      ].map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.title} className="rounded-2xl bg-night p-5 text-white">
            <Icon className="h-6 w-6 text-primary-live" />
            <h3 className="mt-3 font-display text-xl font-bold">{item.title}</h3>
            <p className="mt-2 text-sm text-white/70">{item.body}</p>
          </div>
        );
      })}
    </section>
  );
}
