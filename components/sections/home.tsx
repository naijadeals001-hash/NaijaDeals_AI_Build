import Link from "next/link";
import { ArrowRight, Search, ShieldCheck, Sparkles } from "lucide-react";
import { aiSystems, listings, trustFlows, verticals } from "@/lib/data/ecosystem";
import { ListingCard, MetricCard } from "@/components/sections/cards";
import { TrustBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { InvestorDemoSections, TrustAdvantageStrip, VerticalDemoPanel } from "@/components/sections/investor-demo";

export function HomePage() {
  return (
    <div className="space-y-8">
      <section className="market-grid overflow-hidden rounded-2xl bg-night text-white shadow-soft">
        <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
          <div className="flex min-h-[360px] flex-col justify-center">
            <TrustBadge>Verified African Super App</TrustBadge>
            <h1 className="mt-5 max-w-3xl font-display text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">
              Find everything in the NaijaDeals ecosystem.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-white/75 lg:text-lg">
              Shop Balogun and Alaba market deals, order local meals, book rides, hire verified pros, reserve power-scored shortlets, send packages, stream creators, and pay with escrow-backed NaijaPay.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href="/search" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary-live px-5 font-bold text-white">
                <Search className="h-5 w-5" />
                Search anything
              </Link>
              <Link href="/ecosystem-hub" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 font-bold text-night">
                Explore ecosystem <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:self-center">
            {verticals.slice(0, 8).map((vertical) => {
              const Icon = vertical.icon;
              return (
                <Link key={vertical.key} href={vertical.href} className="rounded-xl bg-white/10 p-4 backdrop-blur transition hover:bg-white/15">
                  <span className={`grid h-11 w-11 place-items-center rounded-xl ${vertical.color} text-white`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <h2 className="mt-4 font-display text-lg font-bold">{vertical.name}</h2>
                  <p className="mt-1 text-sm text-white/70">{vertical.label}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <TrustAdvantageStrip />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Daily GMV model" value="NGN 248M" detail="Commerce, meals, mobility, stays, logistics" />
        <MetricCard label="Escrow protected" value="NGN 1.8B" detail="Held across active missions" />
        <MetricCard label="Verified partners" value="42,900" detail="Vendors, drivers, hosts, creators" />
        <MetricCard label="Risk alerts blocked" value="1,248" detail="AI fraud sentry events" />
      </section>

      <InvestorDemoSections />

      <VerticalDemoPanel />

      <section className="rounded-2xl border border-border-soft bg-canvas p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">AI discovery</p>
            <h2 className="font-display text-2xl font-extrabold">Recommended across your ecosystem</h2>
          </div>
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {listings.slice(0, 4).map((item) => (
            <ListingCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border-soft bg-canvas p-5">
          <h2 className="font-display text-2xl font-extrabold">Wallet and escrow flow</h2>
          <div className="mt-5 grid gap-3">
            {trustFlows.map((flow) => {
              const Icon = flow.icon;
              return (
                <div key={flow.title} className="flex gap-3 rounded-xl bg-surface-low p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-bold">{flow.title}</h3>
                    <p className="mt-1 text-sm text-muted">{flow.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl border border-border-soft bg-canvas p-5">
          <h2 className="font-display text-2xl font-extrabold">Trust states</h2>
          <div className="mt-5 space-y-4">
            <LoadingSkeleton />
            <EmptyState title="No saved Lagos vendors yet" body="Saved sellers from Balogun, Alaba, Computer Village, restaurants, hosts, drivers, and creators will appear here." />
            <ErrorState title="Payment verification pending" body="NaijaPay can show retry, bank callback wait, escrow pause, or Aura support handoff without losing the order." />
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-night p-5 text-white">
        <div className="mb-5 flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary-live" />
          <h2 className="font-display text-2xl font-extrabold">AI systems ready for launch integration</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {aiSystems.map((system) => {
            const Icon = system.icon;
            return (
              <div key={system.title} className="rounded-xl bg-white/10 p-4">
                <Icon className="h-6 w-6 text-primary-live" />
                <h3 className="mt-3 font-bold">{system.title}</h3>
                <p className="mt-2 text-sm text-white/70">{system.status}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
