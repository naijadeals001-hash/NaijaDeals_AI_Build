import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, BadgeCheck, Banknote, PackageCheck } from "lucide-react";
import { onboardingFlows, verticals } from "@/lib/data/ecosystem";
import { MetricCard } from "@/components/sections/cards";
import { TrustBadge } from "@/components/ui/badge";

export function generateStaticParams() {
  return verticals.map((vertical) => ({ vertical: vertical.key }));
}

export function generateMetadata({ params }: { params: { vertical: string } }): Metadata {
  return {
    title: `${params.vertical} seller page`,
    description: "Business seller page for NaijaDeals vertical operations."
  };
}

export default function BusinessPage({ params }: { params: { vertical: string } }) {
  const vertical = verticals.find((item) => item.key === params.vertical) ?? verticals[0];
  const Icon = vertical.icon;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-night p-6 text-white shadow-soft">
        <TrustBadge>Business OS</TrustBadge>
        <div className="mt-5 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <span className={`grid h-14 w-14 place-items-center rounded-xl ${vertical.color}`}>
              <Icon className="h-7 w-7" />
            </span>
            <h1 className="mt-4 font-display text-3xl font-extrabold sm:text-4xl">{vertical.name} seller command center</h1>
            <p className="mt-3 max-w-2xl text-white/70">Operate listings, inventory, orders, payouts, reviews, promotions, AI insights, and support from one merchant-ready surface.</p>
          </div>
          <Link href={`/onboarding/${vertical.key === "eats" ? "restaurant" : vertical.key === "drive" || vertical.key === "send" ? "driver" : vertical.key === "stream" ? "creator" : vertical.key === "stay" ? "host" : "vendor"}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary-live px-5 font-bold text-white">
            Start onboarding <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Revenue today" value="NGN 8.4M" detail="Orders, missions, bookings, tips" />
        <MetricCard label="Payout queue" value="418" detail="Escrow releases and commissions" />
        <MetricCard label="Open support" value="29" detail="Aura triaged cases" />
        <MetricCard label="Risk score" value="92" detail="Healthy operator profile" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          { title: "Inventory and availability", body: "Manage stock, menus, rooms, vehicles, delivery capacity, or creator drops.", icon: PackageCheck },
          { title: "Performance analytics", body: "Track revenue, conversion, repeat buyers, route success, reviews, and promotion lift.", icon: BarChart3 },
          { title: "Wallet and escrow", body: "See pending holds, settlement rules, refunds, taxes, commissions, and payouts.", icon: Banknote }
        ].map((card) => {
          const CardIcon = card.icon;
          return (
            <div key={card.title} className="rounded-xl border border-border-soft bg-canvas p-5">
              <CardIcon className="h-6 w-6 text-primary" />
              <h2 className="mt-3 font-display text-xl font-bold">{card.title}</h2>
              <p className="mt-2 text-sm text-muted">{card.body}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-border-soft bg-canvas p-5">
        <h2 className="font-display text-2xl font-extrabold">Onboarding tracks</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {onboardingFlows.map((flow) => (
            <Link key={flow.slug} href={`/onboarding/${flow.slug}`} className="rounded-xl bg-surface-low p-4 hover:bg-primary-soft">
              <BadgeCheck className="h-5 w-5 text-primary" />
              <h3 className="mt-3 font-bold">{flow.title}</h3>
              <p className="mt-2 text-xs text-muted">{flow.steps.length} verification steps</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
